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
const DEFAULT_MIN_PLAYERS = 2;
const DEFAULT_MAX_PLAYERS = 8;
const TABLE_SETTING_KEYS = ['name', 'minPlayers', 'maxPlayers'] as const;

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

const GameEvent = table(
  {
    name: 'GameEvent',
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
    type: t.string(),
    payloadJson: t.string(),
    createdAt: t.timestamp(),
  },
);

const spacetimedb = schema(
  { Lobby, LobbyMember, GameTable, GameSeat, GameEvent },
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

function playerLimit(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 4_294_967_295
  ) {
    throw new SenderError(`${label} must be a positive integer`);
  }
  return value;
}

function tableSettings(raw: string | undefined): {
  name?: string;
  minPlayers?: number;
  maxPlayers?: number;
} {
  if (raw === undefined || raw.trim().length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SenderError('Settings must be a JSON object');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SenderError('Settings must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (
      !TABLE_SETTING_KEYS.includes(key as (typeof TABLE_SETTING_KEYS)[number])
    ) {
      throw new SenderError(`Unknown setting: ${key}`);
    }
  }

  const settings: {
    name?: string;
    minPlayers?: number;
    maxPlayers?: number;
  } = {};
  if ('name' in record) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new SenderError('Table name is required');
    }
    settings.name = record.name.trim();
  }
  if ('minPlayers' in record) {
    settings.minPlayers = playerLimit(record.minPlayers, 'minPlayers');
  }
  if ('maxPlayers' in record) {
    settings.maxPlayers = playerLimit(record.maxPlayers, 'maxPlayers');
  }
  return settings;
}

export const create_game_table = spacetimedb.reducer(
  { name: 'create_game_table' },
  {
    lobbyId: t.string(),
    gameType: t.string(),
    settings: t.option(t.string()),
  },
  (
    ctx,
    { lobbyId: rawLobbyId, gameType: rawGameType, settings: rawSettings },
  ) => {
    const lobbyId = rawLobbyId.trim();
    const gameType = rawGameType.trim();
    if (lobbyId.length === 0) {
      throw new SenderError('Lobby id is required');
    }
    if (gameType.length === 0) {
      throw new SenderError('Game type is required');
    }

    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const settings = tableSettings(rawSettings);
    const minPlayers = settings.minPlayers ?? DEFAULT_MIN_PLAYERS;
    const maxPlayers = settings.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    if (maxPlayers < minPlayers) {
      throw new SenderError('maxPlayers must be at least minPlayers');
    }

    let existing = 0;
    let sameType = 0;
    for (const table of ctx.db.GameTable.byLobby.filter(lobby.id)) {
      existing += 1;
      if (table.gameType === gameType) {
        sameType += 1;
      }
    }

    const micros = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.GameTable.insert({
      id: `table_${lobby.id}_${micros.toString()}_${existing}`,
      lobbyId: lobby.id,
      gameType,
      name: settings.name ?? `${gameType} #${sameType + 1}`,
      status: { tag: 'waiting_for_players' },
      minPlayers,
      maxPlayers,
      stateJson: '{}',
      createdAt: ctx.timestamp,
    });
  },
);

export const join_table = spacetimedb.reducer(
  { name: 'join_table' },
  {
    tableId: t.string(),
    lobbyMemberId: t.string(),
  },
  (ctx, { tableId: rawTableId, lobbyMemberId: rawLobbyMemberId }) => {
    const tableId = rawTableId.trim();
    const lobbyMemberId = rawLobbyMemberId.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    if (lobbyMemberId.length === 0) {
      throw new SenderError('Lobby member id is required');
    }

    const gameTable = ctx.db.GameTable.id.find(tableId);
    if (!gameTable) {
      throw new SenderError('Table not found');
    }

    const lobby = ctx.db.Lobby.id.find(gameTable.lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const member = ctx.db.LobbyMember.id.find(lobbyMemberId);
    if (!member) {
      throw new SenderError('Member not found');
    }
    if (member.lobbyId !== gameTable.lobbyId) {
      throw new SenderError('Member is not in this room');
    }

    for (const seat of ctx.db.GameSeat.iter()) {
      if (seat.lobbyMemberId === member.id) {
        throw new SenderError('Already seated');
      }
    }

    const taken: number[] = [];
    let seated = 0;
    for (const seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      taken.push(seat.seatIndex);
      seated += 1;
    }
    if (seated >= gameTable.maxPlayers) {
      throw new SenderError('Table is full');
    }

    let seatIndex = 0;
    while (seatIndex < gameTable.maxPlayers && taken.includes(seatIndex)) {
      seatIndex += 1;
    }
    if (seatIndex >= gameTable.maxPlayers) {
      throw new SenderError('Table is full');
    }

    ctx.db.GameSeat.insert({
      id: `seat_${gameTable.id}_${member.id}`,
      tableId: gameTable.id,
      lobbyMemberId: member.id,
      seatIndex,
      chips: undefined,
      joinedAt: ctx.timestamp,
      seatState: { tag: 'active' },
    });
  },
);

export const leave_table = spacetimedb.reducer(
  { name: 'leave_table' },
  {
    tableId: t.string(),
    lobbyMemberId: t.string(),
  },
  (ctx, { tableId: rawTableId, lobbyMemberId: rawLobbyMemberId }) => {
    const tableId = rawTableId.trim();
    const lobbyMemberId = rawLobbyMemberId.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    if (lobbyMemberId.length === 0) {
      throw new SenderError('Lobby member id is required');
    }

    const gameTable = ctx.db.GameTable.id.find(tableId);
    if (!gameTable) {
      throw new SenderError('Table not found');
    }

    const lobby = ctx.db.Lobby.id.find(gameTable.lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }

    const member = ctx.db.LobbyMember.id.find(lobbyMemberId);
    if (!member) {
      throw new SenderError('Member not found');
    }
    if (member.lobbyId !== gameTable.lobbyId) {
      throw new SenderError('Member is not in this room');
    }

    const seatIds: string[] = [];
    for (const seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      if (seat.lobbyMemberId === member.id) {
        seatIds.push(seat.id);
      }
    }
    if (seatIds.length === 0) {
      throw new SenderError('Not seated');
    }
    for (const seatId of seatIds) {
      ctx.db.GameSeat.id.delete(seatId);
    }
  },
);
