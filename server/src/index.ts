import {
  CaseConversionPolicy,
  schema,
  SenderError,
  t,
  table,
} from 'spacetimedb/server';

const LobbyStatus = t.enum('LobbyStatus', ['open', 'closed']);
const TableStatus = t.enum('TableStatus', [
  'waiting_for_players',
  'in_progress',
  'finished',
]);
const SeatState = t.enum('SeatState', ['active', 'folded', 'disconnected']);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const Lobby = table(
  { name: 'Lobby', public: true },
  {
    id: t.string().primaryKey(),
    code: t.string().unique(),
    status: LobbyStatus,
    createdAt: t.timestamp(),
  },
);

const LobbyMember = table(
  {
    name: 'LobbyMember',
    public: true,
    indexes: [
      {
        accessor: 'byLobbyAndClient',
        algorithm: 'btree',
        columns: ['lobbyId', 'clientId'],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    clientId: t.string(),
    name: t.string(),
    connected: t.bool(),
    lastSeenAt: t.timestamp(),
  },
);

const GameTable = table(
  {
    name: 'GameTable',
    public: true,
    indexes: [
      {
        accessor: 'byLobby',
        algorithm: 'btree',
        columns: ['lobbyId'],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string(),
    gameType: t.string(),
    name: t.string(),
    status: TableStatus,
    minPlayers: t.u32(),
    maxPlayers: t.u32(),
    stateJson: t.string(),
    createdAt: t.timestamp(),
  },
);

const GameSeat = table(
  {
    name: 'GameSeat',
    public: true,
    indexes: [
      {
        accessor: 'byTable',
        algorithm: 'btree',
        columns: ['tableId'],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    tableId: t.string(),
    lobbyMemberId: t.string(),
    seatIndex: t.u32(),
    chips: t.option(t.i32()),
    joinedAt: t.timestamp(),
    seatState: t.option(SeatState),
  },
);

const spacetimedb = schema(
  { Lobby, LobbyMember, GameTable, GameSeat },
  { CASE_CONVERSION_POLICY: CaseConversionPolicy.None },
);

export default spacetimedb;

function lobbyCode(micros: bigint, attempt: number): string {
  let n = micros + BigInt(attempt);
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[Number(n % 32n)];
    n /= 32n;
  }
  return code;
}

export const create_lobby = spacetimedb.reducer(
  { name: 'create_lobby' },
  (ctx) => {
    const sender = ctx.sender.toHexString();
    const micros = ctx.timestamp.microsSinceUnixEpoch;
    let code = '';
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidate = lobbyCode(micros, attempt);
      if (ctx.db.Lobby.code.find(candidate) === null) {
        code = candidate;
        break;
      }
    }
    if (code === '') {
      throw new SenderError('Could not allocate a lobby code');
    }
    ctx.db.Lobby.insert({
      id: `lobby_${sender}_${micros.toString()}`,
      code,
      status: { tag: 'open' },
      createdAt: ctx.timestamp,
    });
  },
);

export const join_lobby = spacetimedb.reducer(
  { name: 'join_lobby' },
  {
    lobbyCode: t.string(),
    clientId: t.string(),
    name: t.string(),
  },
  (ctx, { lobbyCode: rawCode, clientId, name }) => {
    const lobbyCode = rawCode.trim().toUpperCase();
    const playerName = name.trim();
    const memberClientId = clientId.trim();
    if (lobbyCode.length === 0) {
      throw new SenderError('Room code is required');
    }
    if (memberClientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    if (playerName.length === 0) {
      throw new SenderError('Name is required');
    }

    const lobby = ctx.db.Lobby.code.find(lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    for (const member of ctx.db.LobbyMember.byLobbyAndClient.filter([
      lobby.id,
      memberClientId,
    ])) {
      ctx.db.LobbyMember.id.update({
        ...member,
        name: playerName,
        connected: true,
        lastSeenAt: ctx.timestamp,
      });
      return;
    }

    ctx.db.LobbyMember.insert({
      id: `member_${lobby.id}_${memberClientId}`,
      lobbyId: lobby.id,
      clientId: memberClientId,
      name: playerName,
      connected: true,
      lastSeenAt: ctx.timestamp,
    });
  },
);
