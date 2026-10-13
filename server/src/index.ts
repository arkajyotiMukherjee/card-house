import {
  CaseConversionPolicy,
  ScheduleAt,
  schema,
  SenderError,
  t,
  table,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import type {
  GameSeat as RulesSeat,
  GameTable as RulesTable,
} from '../../src/shared/games';
import { bluffGameDefinition, bluffRules } from '../../src/shared/games/bluff';
import {
  crazyEightsGameDefinition,
  crazyEightsRules,
} from '../../src/shared/games/crazy-eights';
import {
  goFishGameDefinition,
  goFishRules,
} from '../../src/shared/games/go-fish';
import {
  presidentGameDefinition,
  presidentRules,
} from '../../src/shared/games/president';
import { rummyGameDefinition, rummyRules } from '../../src/shared/games/rummy';
import {
  blackjackGameDefinition,
  blackjackRules,
} from '../../src/shared/games/blackjack';
import {
  spadesGameDefinition,
  spadesRules,
} from '../../src/shared/games/spades';
import {
  heartsGameDefinition,
  heartsRules,
} from '../../src/shared/games/hearts';
import {
  POKER_GAME_TYPE,
  POKER_VARIATIONS,
  pokerGameDefinition,
  pokerRules,
} from '../../src/shared/games/poker';
import {
  dummyCounterRules,
  dummyGameDefinition,
} from '../../src/shared/games/dummy-counter';
import { stubGameDefinition } from '../../src/shared/games/stub';
import {
  disconnectActivity,
  forgetTable,
  forgetTableForEveryone,
  lobbyCreatedLine,
  reconnectActivity,
  rememberLobby,
  rememberTable,
  rulesErrorLine,
  tableCreatedLine,
  tournamentCreatedLine,
} from './activity-log';
import { discordProfile } from './discord-member';
import { speakingRowId, voicePlace } from './speaking-state';
import { stateIfLobbyReady } from './lobby-deal';
import { openingTableState } from './opening-state';
import {
  joinBlockForStatus,
  statusTagForState,
  type TableStatusTag,
} from './table-status';
import {
  definitionByType,
  registerGameRules,
  rulesByType,
} from './rules-by-type';
import {
  DEFAULT_ROOM_CAPS,
  ROOM_CAPS_ID,
  joinSeatRejection,
  lobbyCapRejection,
  openSeatCount,
  roomCapsRejection,
  tableCapRejection,
  tableSeatLimits,
  type RoomCaps,
} from './room-caps';
import { stubIntentRules } from './stub-rules';
import {
  EMPTY_TABLE_IDLE_MICROS,
  TABLE_CLEANUP_INTERVAL_MICROS,
  idleTimeoutAllowed,
  shouldRemoveEmptyTable,
} from './table-cleanup';
import { chatBodyRejection, chatMessageId } from './lobby-chat';
import { addSeatCredit, seatStatCredits } from './player-stats';
import { spectateBlock, spectatorRowId } from './spectator';
import {
  tableChatBodyError,
  tableChatRowId,
  tableChatSenderBlock,
} from './table-chat';
import { voiceScopeForChannel } from './voice-presence';
import {
  DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  LOBBY_IDLE_CONFIG_ID,
  LOBBY_IDLE_SWEEP_INTERVAL_MICROS,
  PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  activeLobbyIdleTimeoutMicros,
  lobbyIdleTimeoutError,
  lobbyIdleTimeoutMicros,
  lobbyIsIdle,
} from './lobby-idle';
import {
  isRoundComplete,
  nextRoundError,
  roundStatusTag,
  tournamentTableCountError,
  type TournamentTableRow,
} from './tournament';

registerGameRules(stubGameDefinition, stubIntentRules);
registerGameRules(dummyGameDefinition, dummyCounterRules);
registerGameRules(bluffGameDefinition, bluffRules);
registerGameRules(presidentGameDefinition, presidentRules);
registerGameRules(goFishGameDefinition, goFishRules);
registerGameRules(crazyEightsGameDefinition, crazyEightsRules);
registerGameRules(rummyGameDefinition, rummyRules);
registerGameRules(blackjackGameDefinition, blackjackRules);
registerGameRules(spadesGameDefinition, spadesRules);
registerGameRules(heartsGameDefinition, heartsRules);
registerGameRules(pokerGameDefinition, pokerRules);

const LobbyStatus = t.enum('LobbyStatus', ['open', 'closed']);
const TableStatus = t.enum('TableStatus', [
  'waiting_for_players',
  'in_progress',
  'finished',
]);
const SeatState = t.enum('SeatState', ['active', 'folded', 'disconnected']);
const TournamentRoundStatus = t.enum('TournamentRoundStatus', [
  'in_progress',
  'complete',
]);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TABLE_SETTING_KEYS = [
  'name',
  'minPlayers',
  'maxPlayers',
  'variation',
] as const;

const DISCORD_CHANNEL_ID = /^\d{17,20}$/;

const Lobby = table(
  { name: 'Lobby', public: true },
  {
    id: t.string().primaryKey(),
    code: t.string().unique(),
    status: LobbyStatus,
    createdAt: t.timestamp(),
    discordChannelId: t.string().default(''),
    discordGuildId: t.string().default(''),
    discordLobbyVoiceChannelId: t.string().default(''),
    lastActivityAt: t.option(t.timestamp()).default(undefined),
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
      {
        accessor: 'byLobbyAndDiscordUser',
        algorithm: 'btree',
        columns: ['lobbyId', 'discordUserId'],
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
    discordUserId: t.string().default(''),
    discordUsername: t.string().default(''),
    discordGlobalName: t.string().default(''),
    discordDiscriminator: t.option(t.string()).default(undefined),
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
      {
        accessor: 'byTournament',
        algorithm: 'btree',
        columns: ['tournamentId'],
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
    discordVoiceChannelId: t.string().default(''),
    lastActivityAt: t.option(t.timestamp()).default(undefined),
    /** Empty when this table is not part of a tournament. */
    tournamentId: t.string().default(''),
    /** Round number within `tournamentId`. `0` outside a tournament. */
    round: t.u32().default(0),
  },
);

const Tournament = table(
  {
    name: 'Tournament',
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
    /** The round whose tables are currently in play. Starts at `1`. */
    currentRound: t.u32(),
    /** Derived from the current round's tables. `complete` once every table there is finished. */
    roundStatus: TournamentRoundStatus,
    createdAt: t.timestamp(),
    lastActivityAt: t.option(t.timestamp()).default(undefined),
  },
);

const TableCleanupSchedule = table(
  { name: 'TableCleanupSchedule', public: true },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    idleAfterMicros: t.u64(),
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

const Spectator = table(
  {
    name: 'Spectator',
    public: true,
    indexes: [
      {
        accessor: 'byTable',
        algorithm: 'btree',
        columns: ['tableId'],
      },
      {
        accessor: 'byMember',
        algorithm: 'btree',
        columns: ['lobbyMemberId'],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    tableId: t.string(),
    lobbyMemberId: t.string(),
    joinedAt: t.timestamp(),
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

const LobbyChatMessage = table(
  {
    name: 'LobbyChatMessage',
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
    lobbyMemberId: t.string(),
    body: t.string(),
    createdAt: t.timestamp(),
  },
);

const TableChatMessage = table(
  {
    name: 'TableChatMessage',
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
    body: t.string(),
    createdAt: t.timestamp(),
  },
);

const VoicePresence = table(
  { name: 'VoicePresence', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    tableId: t.string(),
    lobbyMemberId: t.string(),
    discordUserId: t.string().index('btree'),
    updatedAt: t.timestamp(),
  },
);

const OperatorSession = table(
  { name: 'OperatorSession', public: false },
  {
    identity: t.string().primaryKey(),
    lobbyId: t.string(),
    tableId: t.string(),
    connected: t.bool(),
  },
);

const ConnectionRate = table(
  { name: 'ConnectionRate', public: false },
  {
    id: t.string().primaryKey(),
    windowStartMicros: t.u64(),
    count: t.u32(),
  },
);

const RoomCaps = table(
  { name: 'RoomCaps', public: true },
  {
    id: t.string().primaryKey(),
    maxLobbies: t.u32(),
    maxTablesPerLobby: t.u32(),
    maxSeatsPerTable: t.u32(),
  },
);

const SpeakingState = table(
  {
    name: 'SpeakingState',
    public: true,
    indexes: [
      {
        accessor: 'byLobbyMemberAndTable',
        algorithm: 'btree',
        columns: ['lobbyMemberId', 'tableId'],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    tableId: t.string(),
    lobbyMemberId: t.string(),
    isSpeaking: t.bool(),
    lastUpdatedAt: t.timestamp(),
  },
);

const LobbyIdleConfig = table(
  { name: 'LobbyIdleConfig', public: true },
  {
    id: t.string().primaryKey(),
    idleTimeoutMicros: t.u64(),
    devTimeoutMicros: t.u64(),
    dev: t.bool(),
  },
);

const LobbyIdleSweep = table(
  { name: 'LobbyIdleSweep' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const ClientStats = table(
  { name: 'ClientStats', public: true },
  {
    clientId: t.string().primaryKey(),
    handsPlayed: t.u32(),
    gamesWon: t.u32(),
  },
);

const spacetimedb = schema(
  {
    Lobby,
    LobbyMember,
    GameTable,
    Tournament,
    GameSeat,
    Spectator,
    GameEvent,
    LobbyChatMessage,
    TableChatMessage,
    VoicePresence,
    SpeakingState,
    OperatorSession,
    ConnectionRate,
    RoomCaps,
    TableCleanupSchedule,
    LobbyIdleConfig,
    LobbyIdleSweep,
    ClientStats,
  },
  { CASE_CONVERSION_POLICY: CaseConversionPolicy.None },
);

export default spacetimedb;

type ModuleCtx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function recordClientStats(
  ctx: ModuleCtx,
  tableId: string,
  gameType: string,
  before: unknown,
  after: unknown,
): void {
  const credits = seatStatCredits(gameType, before, after);
  if (credits.length === 0) {
    return;
  }
  const clientBySeat = new Map<number, string>();
  for (const seat of ctx.db.GameSeat.byTable.filter(tableId)) {
    const seated = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
    if (seated) {
      clientBySeat.set(seat.seatIndex, seated.clientId);
    }
  }
  for (const credit of credits) {
    const clientId = clientBySeat.get(credit.seatIndex);
    if (clientId === undefined) {
      continue;
    }
    const existing = ctx.db.ClientStats.clientId.find(clientId);
    const next = addSeatCredit(existing ?? undefined, credit);
    if (existing) {
      ctx.db.ClientStats.clientId.update({
        ...existing,
        handsPlayed: next.handsPlayed,
        gamesWon: next.gamesWon,
      });
    } else {
      ctx.db.ClientStats.insert({
        clientId,
        handsPlayed: next.handsPlayed,
        gamesWon: next.gamesWon,
      });
    }
  }
}

function ensureLobbyIdleJob(ctx: ModuleCtx): void {
  if (ctx.db.LobbyIdleConfig.id.find(LOBBY_IDLE_CONFIG_ID) === null) {
    ctx.db.LobbyIdleConfig.insert({
      id: LOBBY_IDLE_CONFIG_ID,
      idleTimeoutMicros: PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
      devTimeoutMicros: DEV_LOBBY_IDLE_TIMEOUT_MICROS,
      dev: false,
    });
  }
  if (firstRow(ctx.db.LobbyIdleSweep.iter()) === undefined) {
    ctx.db.LobbyIdleSweep.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.interval(LOBBY_IDLE_SWEEP_INTERVAL_MICROS),
    });
  }
}

function noteLobbyActivity(ctx: ModuleCtx, lobbyId: string): void {
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (!lobby || lobby.status.tag !== 'open') {
    return;
  }
  ctx.db.Lobby.id.update({
    ...lobby,
    lastActivityAt: ctx.timestamp,
  });
}

function markLobbyClosed(ctx: ModuleCtx, lobbyId: string): void {
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (!lobby) {
    return;
  }
  clearPresence(ctx.db, lobby.id);
  if (lobby.status.tag === 'closed') {
    return;
  }
  ctx.db.Lobby.id.update({
    ...lobby,
    status: { tag: 'closed' },
  });
}

function closeIdleLobbies(ctx: ModuleCtx): void {
  ensureLobbyIdleJob(ctx);
  const config = ctx.db.LobbyIdleConfig.id.find(LOBBY_IDLE_CONFIG_ID);
  if (!config) {
    return;
  }
  const timeout = activeLobbyIdleTimeoutMicros(config);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const openIds: string[] = [];
  for (const lobby of ctx.db.Lobby.iter()) {
    if (lobby.status.tag === 'open') {
      openIds.push(lobby.id);
    }
  }
  for (const lobbyId of openIds) {
    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby || lobby.status.tag !== 'open') {
      continue;
    }
    const activity = lobby.lastActivityAt?.microsSinceUnixEpoch;
    if (activity === undefined) {
      ctx.db.Lobby.id.update({
        ...lobby,
        lastActivityAt: ctx.timestamp,
      });
      continue;
    }
    if (lobbyIsIdle(activity, now, timeout)) {
      markLobbyClosed(ctx, lobby.id);
    }
  }
}

function lobbyCode(micros: bigint, attempt: number): string {
  let n = micros + BigInt(attempt);
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[Number(n % 32n)];
    n /= 32n;
  }
  return code;
}

interface RoomCapsRow extends RoomCaps {
  id: string;
}

interface RoomCapsDb {
  RoomCaps: {
    id: {
      find(id: string): RoomCapsRow | null;
      update(row: RoomCapsRow): unknown;
    };
    insert(row: RoomCapsRow): unknown;
  };
}

function currentRoomCaps(db: RoomCapsDb): RoomCaps {
  const existing = db.RoomCaps.id.find(ROOM_CAPS_ID);
  if (existing) {
    return {
      maxLobbies: existing.maxLobbies,
      maxTablesPerLobby: existing.maxTablesPerLobby,
      maxSeatsPerTable: existing.maxSeatsPerTable,
    };
  }
  db.RoomCaps.insert({ id: ROOM_CAPS_ID, ...DEFAULT_ROOM_CAPS });
  return { ...DEFAULT_ROOM_CAPS };
}

function reject(message: string | undefined): void {
  if (message !== undefined) {
    throw new SenderError(message);
  }
}

function rowCount(rows: Iterable<unknown>): number {
  let count = 0;
  for (const _row of rows) {
    count += 1;
  }
  return count;
}

function ensureRoomCaps(ctx: ModuleCtx): void {
  if (ctx.db.RoomCaps.id.find(ROOM_CAPS_ID) === null) {
    ctx.db.RoomCaps.insert({ id: ROOM_CAPS_ID, ...DEFAULT_ROOM_CAPS });
  }
}

export const init = spacetimedb.init({ name: 'init' }, (ctx) => {
  ensureRoomCaps(ctx);
  ensureLobbyIdleJob(ctx);
  ensureTableCleanup(ctx);
});

export const on_connect = spacetimedb.clientConnected(
  { name: 'on_connect' },
  (ctx) => {
    ensureRoomCaps(ctx);
    ensureLobbyIdleJob(ctx);
    ensureTableCleanup(ctx);
    const line = reconnectActivity(
      ctx.db,
      ctx.sender.toHexString(),
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (line !== undefined) {
      console.log(line);
    }
  },
);

export const client_disconnected = spacetimedb.clientDisconnected(
  { name: 'client_disconnected' },
  (ctx) => {
    const line = disconnectActivity(
      ctx.db,
      ctx.sender.toHexString(),
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (line !== undefined) {
      console.log(line);
    }
  },
);

export const create_lobby = spacetimedb.reducer(
  { name: 'create_lobby' },
  (ctx) => {
    ensureLobbyIdleJob(ctx);
    const caps = currentRoomCaps(ctx.db);
    reject(lobbyCapRejection(rowCount(ctx.db.Lobby.iter()), caps));
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
    const id = `lobby_${sender}_${micros.toString()}`;
    ctx.db.Lobby.insert({
      id,
      code,
      status: { tag: 'open' },
      createdAt: ctx.timestamp,
      lastActivityAt: ctx.timestamp,
      discordChannelId: '',
      discordGuildId: '',
      discordLobbyVoiceChannelId: '',
    });
    console.log(lobbyCreatedLine(id));
  },
);

export const set_room_caps = spacetimedb.reducer(
  { name: 'set_room_caps' },
  {
    maxLobbies: t.u32(),
    maxTablesPerLobby: t.u32(),
    maxSeatsPerTable: t.u32(),
  },
  (ctx, caps) => {
    reject(roomCapsRejection(caps));
    const existing = ctx.db.RoomCaps.id.find(ROOM_CAPS_ID);
    if (!existing) {
      ctx.db.RoomCaps.insert({ id: ROOM_CAPS_ID, ...caps });
      return;
    }
    ctx.db.RoomCaps.id.update({ ...existing, ...caps });
  },
);

function discordChannelId(raw: string): string {
  return discordSnowflake(raw, 'Discord channel id');
}

function discordSnowflake(raw: string, label: string): string {
  const id = raw.trim();
  if (!DISCORD_CHANNEL_ID.test(id)) {
    throw new SenderError(`${label} is invalid`);
  }
  return id;
}

interface PresenceRow {
  id: string;
  tableId: string;
}

function clearPresence(
  db: {
    VoicePresence: {
      lobbyId: { filter(lobbyId: string): Iterable<PresenceRow> };
      id: { delete(id: string): unknown };
    };
  },
  lobbyId: string,
  tableId?: string,
): void {
  const ids: string[] = [];
  for (const row of db.VoicePresence.lobbyId.filter(lobbyId)) {
    if (tableId === undefined || row.tableId === tableId) {
      ids.push(row.id);
    }
  }
  for (const id of ids) {
    db.VoicePresence.id.delete(id);
  }
}

interface SpeakingRow {
  id: string;
  tableId: string;
}

function clearSpeaking(
  db: {
    SpeakingState: {
      lobbyId: { filter(lobbyId: string): Iterable<SpeakingRow> };
      id: { delete(id: string): unknown };
    };
  },
  lobbyId: string,
  tableId: string,
): void {
  const ids: string[] = [];
  for (const row of db.SpeakingState.lobbyId.filter(lobbyId)) {
    if (row.tableId === tableId) {
      ids.push(row.id);
    }
  }
  for (const id of ids) {
    db.SpeakingState.id.delete(id);
  }
}

interface TableRows {
  GameSeat: {
    byTable: { filter(tableId: string): Iterable<{ id: string }> };
    id: { delete(id: string): unknown };
  };
  Spectator: {
    byTable: { filter(tableId: string): Iterable<{ id: string }> };
    id: { delete(id: string): unknown };
  };
  GameEvent: {
    byTable: { filter(tableId: string): Iterable<{ id: string }> };
    id: { delete(id: string): unknown };
  };
  TableChatMessage: {
    byTable: { filter(tableId: string): Iterable<{ id: string }> };
    id: { delete(id: string): unknown };
  };
  GameTable: {
    id: { delete(id: string): unknown };
  };
  VoicePresence: {
    lobbyId: { filter(lobbyId: string): Iterable<PresenceRow> };
    id: { delete(id: string): unknown };
  };
  SpeakingState: {
    lobbyId: { filter(lobbyId: string): Iterable<SpeakingRow> };
    id: { delete(id: string): unknown };
  };
}

function deleteGameTable(
  db: TableRows,
  gameTable: { id: string; lobbyId: string },
): void {
  const seatIds: string[] = [];
  for (const seat of db.GameSeat.byTable.filter(gameTable.id)) {
    seatIds.push(seat.id);
  }
  for (const seatId of seatIds) {
    db.GameSeat.id.delete(seatId);
  }
  const spectatorIds: string[] = [];
  for (const row of db.Spectator.byTable.filter(gameTable.id)) {
    spectatorIds.push(row.id);
  }
  for (const spectatorId of spectatorIds) {
    db.Spectator.id.delete(spectatorId);
  }
  const eventIds: string[] = [];
  for (const event of db.GameEvent.byTable.filter(gameTable.id)) {
    eventIds.push(event.id);
  }
  for (const eventId of eventIds) {
    db.GameEvent.id.delete(eventId);
  }
  const chatIds: string[] = [];
  for (const message of db.TableChatMessage.byTable.filter(gameTable.id)) {
    chatIds.push(message.id);
  }
  for (const chatId of chatIds) {
    db.TableChatMessage.id.delete(chatId);
  }
  clearPresence(db, gameTable.lobbyId, gameTable.id);
  clearSpeaking(db, gameTable.lobbyId, gameTable.id);
  db.GameTable.id.delete(gameTable.id);
}

function ensureTableCleanup(ctx: {
  db: {
    TableCleanupSchedule: {
      iter(): Iterable<unknown>;
      insert(row: {
        scheduledId: bigint;
        scheduledAt: ReturnType<typeof ScheduleAt.interval>;
        idleAfterMicros: bigint;
      }): unknown;
    };
  };
}): void {
  let count = 0;
  for (const _row of ctx.db.TableCleanupSchedule.iter()) {
    count += 1;
  }
  if (count > 0) {
    return;
  }
  ctx.db.TableCleanupSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(TABLE_CLEANUP_INTERVAL_MICROS),
    idleAfterMicros: EMPTY_TABLE_IDLE_MICROS,
  });
}

function openDiscordLobby<
  T extends { status: { tag: string }; discordChannelId: string },
>(find: (code: string) => T | null, lobbyCode: string): T {
  const lobby = find(lobbyCode);
  if (!lobby) {
    throw new SenderError('Room not found');
  }
  if (lobby.status.tag !== 'open') {
    throw new SenderError('Room closed');
  }
  if (lobby.discordChannelId.length === 0) {
    throw new SenderError('Room is not linked to Discord');
  }
  return lobby;
}

export const set_lobby_discord_channel = spacetimedb.reducer(
  { name: 'set_lobby_discord_channel' },
  {
    lobbyCode: t.string(),
    discordChannelId: t.string(),
  },
  (ctx, { lobbyCode: rawCode, discordChannelId: rawChannelId }) => {
    const lobbyCode = rawCode.trim().toUpperCase();
    const channelId = discordChannelId(rawChannelId);
    if (lobbyCode.length === 0) {
      throw new SenderError('Room code is required');
    }

    const lobby = ctx.db.Lobby.code.find(lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }
    if (
      lobby.discordChannelId.length > 0 &&
      lobby.discordChannelId !== channelId
    ) {
      throw new SenderError('Room already linked to a Discord channel');
    }

    ctx.db.Lobby.id.update({
      ...lobby,
      discordChannelId: channelId,
      lastActivityAt: ctx.timestamp,
    });
  },
);

export const set_lobby_discord_voice = spacetimedb.reducer(
  { name: 'set_lobby_discord_voice' },
  {
    lobbyCode: t.string(),
    discordGuildId: t.string(),
    discordLobbyVoiceChannelId: t.string(),
  },
  (
    ctx,
    {
      lobbyCode: rawCode,
      discordGuildId: rawGuildId,
      discordLobbyVoiceChannelId: rawVoiceId,
    },
  ) => {
    const lobbyCode = rawCode.trim().toUpperCase();
    const guildId = discordSnowflake(rawGuildId, 'Discord guild id');
    const voiceId = discordSnowflake(rawVoiceId, 'Discord voice channel id');
    if (lobbyCode.length === 0) {
      throw new SenderError('Room code is required');
    }
    const lobby = openDiscordLobby(
      (code) => ctx.db.Lobby.code.find(code),
      lobbyCode,
    );
    if (lobby.discordGuildId.length > 0 && lobby.discordGuildId !== guildId) {
      throw new SenderError('Room already linked to a Discord guild');
    }
    if (
      lobby.discordLobbyVoiceChannelId.length > 0 &&
      lobby.discordLobbyVoiceChannelId !== voiceId
    ) {
      throw new SenderError('Room already has a Discord voice channel');
    }
    ctx.db.Lobby.id.update({
      ...lobby,
      discordGuildId: guildId,
      discordLobbyVoiceChannelId: voiceId,
      lastActivityAt: ctx.timestamp,
    });
  },
);

export const clear_lobby_discord_voice = spacetimedb.reducer(
  { name: 'clear_lobby_discord_voice' },
  { lobbyCode: t.string() },
  (ctx, { lobbyCode: rawCode }) => {
    const lobbyCode = rawCode.trim().toUpperCase();
    if (lobbyCode.length === 0) {
      throw new SenderError('Room code is required');
    }
    const lobby = ctx.db.Lobby.code.find(lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    clearPresence(ctx.db, lobby.id, '');
    if (lobby.discordLobbyVoiceChannelId.length === 0) {
      return;
    }
    ctx.db.Lobby.id.update({
      ...lobby,
      discordLobbyVoiceChannelId: '',
    });
  },
);

export const close_lobby = spacetimedb.reducer(
  { name: 'close_lobby' },
  { lobbyCode: t.string() },
  (ctx, { lobbyCode: rawCode }) => {
    const lobbyCode = rawCode.trim().toUpperCase();
    if (lobbyCode.length === 0) {
      throw new SenderError('Room code is required');
    }
    const lobby = ctx.db.Lobby.code.find(lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    markLobbyClosed(ctx, lobby.id);
  },
);

export const set_lobby_idle_timeout = spacetimedb.reducer(
  { name: 'set_lobby_idle_timeout' },
  { timeoutMs: t.u32(), dev: t.bool() },
  (ctx, { timeoutMs, dev }) => {
    const error = lobbyIdleTimeoutError(dev, timeoutMs);
    if (error !== undefined) {
      throw new SenderError(error);
    }
    ensureLobbyIdleJob(ctx);
    const config = ctx.db.LobbyIdleConfig.id.find(LOBBY_IDLE_CONFIG_ID);
    if (!config) {
      throw new SenderError('Lobby idle config is missing');
    }
    const timeoutMicros = lobbyIdleTimeoutMicros(timeoutMs);
    if (dev) {
      ctx.db.LobbyIdleConfig.id.update({
        ...config,
        dev: true,
        devTimeoutMicros: timeoutMicros,
      });
      return;
    }
    ctx.db.LobbyIdleConfig.id.update({
      ...config,
      dev: false,
      idleTimeoutMicros: timeoutMicros,
    });
  },
);

export const close_idle_lobbies = spacetimedb.reducer(
  { name: 'close_idle_lobbies', onSchedule: LobbyIdleSweep },
  { sweep: LobbyIdleSweep.rowType },
  (ctx, { sweep: _sweep }) => {
    closeIdleLobbies(ctx);
    if (firstRow(ctx.db.LobbyIdleSweep.iter()) === undefined) {
      ctx.db.LobbyIdleSweep.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.interval(LOBBY_IDLE_SWEEP_INTERVAL_MICROS),
      });
    }
  },
);

function joinRequest(
  rawCode: string,
  rawClientId: string,
  rawName: string,
): { lobbyCode: string; clientId: string; name: string } {
  const lobbyCode = rawCode.trim().toUpperCase();
  const clientId = rawClientId.trim();
  const name = rawName.trim();
  if (lobbyCode.length === 0) {
    throw new SenderError('Room code is required');
  }
  if (clientId.length === 0) {
    throw new SenderError('Client id is required');
  }
  if (name.length === 0) {
    throw new SenderError('Name is required');
  }
  return { lobbyCode, clientId, name };
}

function firstRow<T>(rows: Iterable<T>): T | undefined {
  for (const row of rows) {
    return row;
  }
  return undefined;
}

export const join_lobby = spacetimedb.reducer(
  { name: 'join_lobby' },
  {
    lobbyCode: t.string(),
    clientId: t.string(),
    name: t.string(),
  },
  (ctx, { lobbyCode: rawCode, clientId, name }) => {
    const request = joinRequest(rawCode, clientId, name);
    const lobby = ctx.db.Lobby.code.find(request.lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobby.id, request.clientId]),
    );
    if (member) {
      ctx.db.LobbyMember.id.update({
        ...member,
        name: request.name,
        connected: true,
        lastSeenAt: ctx.timestamp,
      });
      rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id);
      noteLobbyActivity(ctx, lobby.id);
      return;
    }

    ctx.db.LobbyMember.insert({
      id: `member_${lobby.id}_${request.clientId}`,
      lobbyId: lobby.id,
      clientId: request.clientId,
      name: request.name,
      connected: true,
      lastSeenAt: ctx.timestamp,
      discordUserId: '',
      discordUsername: '',
      discordGlobalName: '',
      discordDiscriminator: undefined,
    });
    rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id);
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const join_lobby_with_discord = spacetimedb.reducer(
  { name: 'join_lobby_with_discord' },
  {
    lobbyCode: t.string(),
    clientId: t.string(),
    name: t.string(),
    discordUserId: t.string(),
    discordUsername: t.string(),
    discordGlobalName: t.string(),
    discordDiscriminator: t.option(t.string()),
  },
  (
    ctx,
    {
      lobbyCode: rawCode,
      clientId,
      name,
      discordUserId,
      discordUsername,
      discordGlobalName,
      discordDiscriminator,
    },
  ) => {
    const request = joinRequest(rawCode, clientId, name);
    const lobby = ctx.db.Lobby.code.find(request.lobbyCode);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }
    let discord;
    try {
      discord = discordProfile(
        discordUserId,
        discordUsername,
        discordGlobalName,
        discordDiscriminator,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Discord identity is invalid';
      throw new SenderError(message);
    }

    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobby.id, request.clientId]),
    );
    if (member) {
      if (
        member.discordUserId.length > 0 &&
        member.discordUserId !== discord.discordUserId
      ) {
        throw new SenderError('Discord user id is already set');
      }
      ctx.db.LobbyMember.id.update({
        ...member,
        name: request.name,
        connected: true,
        lastSeenAt: ctx.timestamp,
        discordUserId: discord.discordUserId,
        discordUsername: discord.discordUsername,
        discordGlobalName: discord.discordGlobalName,
        discordDiscriminator: discord.discordDiscriminator,
      });
      rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id);
      noteLobbyActivity(ctx, lobby.id);
      return;
    }

    ctx.db.LobbyMember.insert({
      id: `member_${lobby.id}_${request.clientId}`,
      lobbyId: lobby.id,
      clientId: request.clientId,
      name: request.name,
      connected: true,
      lastSeenAt: ctx.timestamp,
      discordUserId: discord.discordUserId,
      discordUsername: discord.discordUsername,
      discordGlobalName: discord.discordGlobalName,
      discordDiscriminator: discord.discordDiscriminator,
    });
    rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id);
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const send_lobby_chat_message = spacetimedb.reducer(
  { name: 'send_lobby_chat_message' },
  {
    lobbyId: t.string(),
    clientId: t.string(),
    body: t.string(),
  },
  (ctx, { lobbyId: rawLobbyId, clientId: rawClientId, body: rawBody }) => {
    const lobbyId = rawLobbyId.trim();
    const clientId = rawClientId.trim();
    const body = rawBody.trim();
    if (lobbyId.length === 0) {
      throw new SenderError('Lobby id is required');
    }
    if (clientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    reject(chatBodyRejection(body));

    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobbyId, clientId]),
    );
    if (!member) {
      throw new SenderError('Member not found');
    }

    let order = 0;
    for (const _message of ctx.db.LobbyChatMessage.byLobby.filter(lobbyId)) {
      order += 1;
    }
    ctx.db.LobbyChatMessage.insert({
      id: chatMessageId(lobbyId, order),
      lobbyId,
      lobbyMemberId: member.id,
      body,
      createdAt: ctx.timestamp,
    });
    noteLobbyActivity(ctx, lobbyId);
  },
);

export const update_speaking_state = spacetimedb.reducer(
  { name: 'update_speaking_state' },
  {
    discordUserId: t.string(),
    discordVoiceChannelId: t.string(),
    isSpeaking: t.bool(),
  },
  (
    ctx,
    {
      discordUserId: rawUserId,
      discordVoiceChannelId: rawChannelId,
      isSpeaking,
    },
  ) => {
    const discordUserId = discordSnowflake(rawUserId, 'Discord user id');
    const channelId = discordSnowflake(
      rawChannelId,
      'Discord voice channel id',
    );
    const place = voicePlace(
      ctx.db.Lobby.iter(),
      ctx.db.GameTable.iter(),
      channelId,
    );
    if (!place) {
      return;
    }
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndDiscordUser.filter([
        place.lobbyId,
        discordUserId,
      ]),
    );
    if (!member) {
      return;
    }
    const id = speakingRowId(member.id, place.tableId);
    const existing = ctx.db.SpeakingState.id.find(id);
    if (existing) {
      ctx.db.SpeakingState.id.update({
        ...existing,
        lobbyId: place.lobbyId,
        tableId: place.tableId,
        lobbyMemberId: member.id,
        isSpeaking,
        lastUpdatedAt: ctx.timestamp,
      });
      noteLobbyActivity(ctx, place.lobbyId);
      return;
    }
    ctx.db.SpeakingState.insert({
      id,
      lobbyId: place.lobbyId,
      tableId: place.tableId,
      lobbyMemberId: member.id,
      isSpeaking,
      lastUpdatedAt: ctx.timestamp,
    });
    noteLobbyActivity(ctx, place.lobbyId);
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
  variation?: string;
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
    variation?: string;
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
  if ('variation' in record) {
    if (
      typeof record.variation !== 'string' ||
      record.variation.trim().length === 0
    ) {
      throw new SenderError('variation must be a poker variation');
    }
    settings.variation = record.variation.trim();
  }
  return settings;
}

function pokerVariation(
  gameType: string,
  variation: string | undefined,
): string | undefined {
  if (variation === undefined) {
    return undefined;
  }
  if (gameType !== POKER_GAME_TYPE) {
    throw new SenderError('variation is only for poker');
  }
  if (!(POKER_VARIATIONS as readonly string[]).includes(variation)) {
    throw new SenderError('Unknown poker variation');
  }
  return variation;
}

interface NewTableRow {
  id: string;
  lobbyId: string;
  gameType: string;
  name: string;
  status: { tag: 'waiting_for_players' };
  minPlayers: number;
  maxPlayers: number;
  stateJson: string;
  createdAt: ModuleCtx['timestamp'];
  lastActivityAt: ModuleCtx['timestamp'];
  discordVoiceChannelId: string;
  tournamentId: string;
  round: number;
}

/**
 * Builds the row for a new table, enforcing the seat and table caps.
 * `existingInLobby` and `sameTypeInLobby` are counts before this table, so a
 * caller inserting several tables in one reducer call passes the running
 * totals. `create_game_table` tags the row `tournamentId: ''`, `round: 0`;
 * `create_tournament` and `create_tournament_round` tag it with their own ids.
 */
function openTableRow(
  ctx: ModuleCtx,
  lobby: { id: string },
  gameType: string,
  settings: ReturnType<typeof tableSettings>,
  caps: RoomCaps,
  existingInLobby: number,
  sameTypeInLobby: number,
  idSuffix: string,
  tournamentId: string,
  round: number,
): NewTableRow {
  reject(tableCapRejection(existingInLobby, caps));
  const definition = definitionByType[gameType];
  const seats = tableSeatLimits(
    definition
      ? {
          minPlayers: definition.minPlayers,
          maxPlayers: definition.maxPlayers,
        }
      : undefined,
    { minPlayers: settings.minPlayers, maxPlayers: settings.maxPlayers },
    caps,
  );
  if ('error' in seats) {
    throw new SenderError(seats.error);
  }
  const minPlayers = seats.minPlayers;
  const maxPlayers = seats.maxPlayers;

  const micros = ctx.timestamp.microsSinceUnixEpoch;
  const id = `table_${lobby.id}_${micros.toString()}_${idSuffix}`;
  const name = settings.name ?? `${gameType} #${sameTypeInLobby + 1}`;
  const stateJson = storedState(
    openingTableState(
      gameType,
      {
        id,
        lobbyId: lobby.id,
        name,
        minPlayers,
        maxPlayers,
        createdAt: Number(ctx.timestamp.toMillis()),
      },
      pokerVariation(gameType, settings.variation),
    ),
  );
  return {
    id,
    lobbyId: lobby.id,
    gameType,
    name,
    status: { tag: 'waiting_for_players' },
    minPlayers,
    maxPlayers,
    stateJson,
    createdAt: ctx.timestamp,
    lastActivityAt: ctx.timestamp,
    discordVoiceChannelId: '',
    tournamentId,
    round,
  };
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
    const caps = currentRoomCaps(ctx.db);

    let existing = 0;
    let sameType = 0;
    for (const table of ctx.db.GameTable.byLobby.filter(lobby.id)) {
      existing += 1;
      if (table.gameType === gameType) {
        sameType += 1;
      }
    }
    const row = openTableRow(
      ctx,
      lobby,
      gameType,
      settings,
      caps,
      existing,
      sameType,
      `${existing}`,
      '',
      0,
    );
    ctx.db.GameTable.insert(row);
    console.log(tableCreatedLine(row.id, lobby.id));
    noteLobbyActivity(ctx, lobby.id);
  },
);

/**
 * `tableCount` tables of `gameType`, tagged `round` 1, grouped under one
 * `Tournament` row. `create_tournament_round` adds later rounds the same way.
 */
function openTournamentRoundTables(
  ctx: ModuleCtx,
  lobby: { id: string },
  gameType: string,
  settings: ReturnType<typeof tableSettings>,
  tableCount: number,
  tournamentId: string,
  round: number,
): NewTableRow[] {
  const caps = currentRoomCaps(ctx.db);
  let existing = 0;
  let sameType = 0;
  for (const table of ctx.db.GameTable.byLobby.filter(lobby.id)) {
    existing += 1;
    if (table.gameType === gameType) {
      sameType += 1;
    }
  }
  const rows: NewTableRow[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    rows.push(
      openTableRow(
        ctx,
        lobby,
        gameType,
        settings,
        caps,
        existing,
        sameType,
        `${existing}`,
        tournamentId,
        round,
      ),
    );
    existing += 1;
    sameType += 1;
  }
  return rows;
}

export const create_tournament = spacetimedb.reducer(
  { name: 'create_tournament' },
  {
    lobbyId: t.string(),
    gameType: t.string(),
    tableCount: t.u32(),
    settings: t.option(t.string()),
  },
  (
    ctx,
    {
      lobbyId: rawLobbyId,
      gameType: rawGameType,
      tableCount,
      settings: rawSettings,
    },
  ) => {
    const lobbyId = rawLobbyId.trim();
    const gameType = rawGameType.trim();
    if (lobbyId.length === 0) {
      throw new SenderError('Lobby id is required');
    }
    if (gameType.length === 0) {
      throw new SenderError('Game type is required');
    }
    reject(tournamentTableCountError(tableCount));

    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const settings = tableSettings(rawSettings);
    const micros = ctx.timestamp.microsSinceUnixEpoch;
    const tournamentId = `tournament_${lobby.id}_${micros.toString()}`;
    const name = settings.name ?? `${gameType} tournament`;
    const rows = openTournamentRoundTables(
      ctx,
      lobby,
      gameType,
      settings,
      tableCount,
      tournamentId,
      1,
    );

    ctx.db.Tournament.insert({
      id: tournamentId,
      lobbyId: lobby.id,
      gameType,
      name,
      currentRound: 1,
      roundStatus: { tag: 'in_progress' },
      createdAt: ctx.timestamp,
      lastActivityAt: ctx.timestamp,
    });
    for (const row of rows) {
      ctx.db.GameTable.insert(row);
      console.log(tableCreatedLine(row.id, lobby.id));
    }
    console.log(tournamentCreatedLine(tournamentId, lobby.id));
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const create_tournament_round = spacetimedb.reducer(
  { name: 'create_tournament_round' },
  {
    tournamentId: t.string(),
    tableCount: t.u32(),
    settings: t.option(t.string()),
  },
  (
    ctx,
    { tournamentId: rawTournamentId, tableCount, settings: rawSettings },
  ) => {
    const tournamentId = rawTournamentId.trim();
    if (tournamentId.length === 0) {
      throw new SenderError('Tournament id is required');
    }
    reject(tournamentTableCountError(tableCount));

    const tournament = ctx.db.Tournament.id.find(tournamentId);
    if (!tournament) {
      throw new SenderError('Tournament not found');
    }

    const lobby = ctx.db.Lobby.id.find(tournament.lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    if (lobby.status.tag !== 'open') {
      throw new SenderError('Room closed');
    }

    const currentRoundTables: TournamentTableRow[] = [];
    for (const row of ctx.db.GameTable.byTournament.filter(tournamentId)) {
      currentRoundTables.push({
        tournamentId: row.tournamentId,
        round: row.round,
        status: row.status,
      });
    }
    reject(
      nextRoundError(
        isRoundComplete(
          currentRoundTables,
          tournamentId,
          tournament.currentRound,
        ),
      ),
    );

    const settings = tableSettings(rawSettings);
    const nextRound = tournament.currentRound + 1;
    const rows = openTournamentRoundTables(
      ctx,
      lobby,
      tournament.gameType,
      settings,
      tableCount,
      tournamentId,
      nextRound,
    );
    for (const row of rows) {
      ctx.db.GameTable.insert(row);
      console.log(tableCreatedLine(row.id, lobby.id));
    }
    ctx.db.Tournament.id.update({
      ...tournament,
      currentRound: nextRound,
      roundStatus: { tag: 'in_progress' },
      lastActivityAt: ctx.timestamp,
    });
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const set_table_discord_voice = spacetimedb.reducer(
  { name: 'set_table_discord_voice' },
  {
    tableId: t.string(),
    discordVoiceChannelId: t.string(),
  },
  (ctx, { tableId: rawTableId, discordVoiceChannelId: rawVoiceId }) => {
    const tableId = rawTableId.trim();
    const voiceId = discordSnowflake(rawVoiceId, 'Discord voice channel id');
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
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
    if (lobby.discordGuildId.length === 0) {
      throw new SenderError('Room is not linked to Discord');
    }
    if (gameTable.status.tag === 'finished') {
      throw new SenderError('Table finished');
    }
    if (
      gameTable.discordVoiceChannelId.length > 0 &&
      gameTable.discordVoiceChannelId !== voiceId
    ) {
      throw new SenderError('Table already has a Discord voice channel');
    }
    ctx.db.GameTable.id.update({
      ...gameTable,
      discordVoiceChannelId: voiceId,
    });
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const clear_table_discord_voice = spacetimedb.reducer(
  { name: 'clear_table_discord_voice' },
  { tableId: t.string() },
  (ctx, { tableId: rawTableId }) => {
    const tableId = rawTableId.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    const gameTable = ctx.db.GameTable.id.find(tableId);
    if (!gameTable) {
      throw new SenderError('Table not found');
    }
    clearPresence(ctx.db, gameTable.lobbyId, gameTable.id);
    if (gameTable.discordVoiceChannelId.length === 0) {
      return;
    }
    ctx.db.GameTable.id.update({
      ...gameTable,
      discordVoiceChannelId: '',
    });
  },
);

export const update_voice_presence = spacetimedb.reducer(
  { name: 'update_voice_presence' },
  {
    discordUserId: t.string(),
    discordVoiceChannelId: t.string(),
  },
  (ctx, { discordUserId: rawUserId, discordVoiceChannelId: rawChannelId }) => {
    const userId = discordSnowflake(rawUserId, 'Discord user id');
    const channelId = rawChannelId.trim();
    if (channelId.length > 0) {
      discordSnowflake(channelId, 'Discord voice channel id');
    }

    let desired:
      { memberId: string; lobbyId: string; tableId: string } | undefined;
    const scope = voiceScopeForChannel(
      channelId,
      ctx.db.Lobby.iter(),
      ctx.db.GameTable.iter(),
    );
    if (scope) {
      for (const member of ctx.db.LobbyMember.lobbyId.filter(scope.lobbyId)) {
        if (member.discordUserId === userId) {
          desired = {
            memberId: member.id,
            lobbyId: scope.lobbyId,
            tableId: scope.tableId,
          };
          break;
        }
      }
    }

    const staleIds: string[] = [];
    let current: { id: string; tableId: string } | undefined;
    for (const row of ctx.db.VoicePresence.discordUserId.filter(userId)) {
      if (desired && row.lobbyMemberId === desired.memberId) {
        current = row;
      } else {
        staleIds.push(row.id);
      }
    }
    for (const id of staleIds) {
      ctx.db.VoicePresence.id.delete(id);
    }
    if (!desired) {
      return;
    }
    const row = {
      id: `presence_${desired.memberId}`,
      lobbyId: desired.lobbyId,
      tableId: desired.tableId,
      lobbyMemberId: desired.memberId,
      discordUserId: userId,
      updatedAt: ctx.timestamp,
    };
    if (!current) {
      ctx.db.VoicePresence.insert(row);
    } else if (current.tableId !== desired.tableId) {
      ctx.db.VoicePresence.id.update(row);
    } else {
      return;
    }
    noteLobbyActivity(ctx, desired.lobbyId);
  },
);

export const remove_game_table = spacetimedb.reducer(
  { name: 'remove_game_table' },
  { tableId: t.string() },
  (ctx, { tableId: rawTableId }) => {
    const tableId = rawTableId.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    const gameTable = ctx.db.GameTable.id.find(tableId);
    if (!gameTable) {
      throw new SenderError('Table not found');
    }
    forgetTableForEveryone(ctx.db, gameTable.id);
    deleteGameTable(ctx.db, gameTable);
    noteLobbyActivity(ctx, gameTable.lobbyId);
  },
);

export const clean_empty_tables = spacetimedb.reducer(
  { name: 'clean_empty_tables', onSchedule: TableCleanupSchedule },
  { schedule: TableCleanupSchedule.rowType },
  (ctx, _args) => {
    let idleLimit = EMPTY_TABLE_IDLE_MICROS;
    for (const row of ctx.db.TableCleanupSchedule.iter()) {
      idleLimit = row.idleAfterMicros;
      break;
    }
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const doomed: string[] = [];
    for (const gameTable of ctx.db.GameTable.iter()) {
      let seats = 0;
      for (const _seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
        seats += 1;
      }
      const activity = gameTable.lastActivityAt ?? gameTable.createdAt;
      const idleMicros = now - activity.microsSinceUnixEpoch;
      if (
        shouldRemoveEmptyTable(
          seats,
          gameTable.status.tag,
          idleMicros,
          idleLimit,
        )
      ) {
        doomed.push(gameTable.id);
      }
    }
    for (const id of doomed) {
      const gameTable = ctx.db.GameTable.id.find(id);
      if (gameTable) {
        forgetTableForEveryone(ctx.db, gameTable.id);
        deleteGameTable(ctx.db, gameTable);
      }
    }
    ensureTableCleanup(ctx);
  },
);

export const set_empty_table_idle_timeout = spacetimedb.reducer(
  { name: 'set_empty_table_idle_timeout' },
  { idleMicros: t.u64() },
  (ctx, { idleMicros }) => {
    if (!idleTimeoutAllowed(idleMicros)) {
      throw new SenderError(
        'Idle timeout must be between 1 second and 24 hours',
      );
    }
    ensureTableCleanup(ctx);
    const rows = [];
    for (const row of ctx.db.TableCleanupSchedule.iter()) {
      rows.push(row);
    }
    for (const row of rows) {
      ctx.db.TableCleanupSchedule.scheduledId.update({
        ...row,
        idleAfterMicros: idleMicros,
      });
    }
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
    const caps = currentRoomCaps(ctx.db);
    reject(joinSeatRejection(seated, gameTable.maxPlayers, caps));
    const openSeats = openSeatCount(gameTable.maxPlayers, caps);

    const blocked = joinBlockForStatus(currentStatusTag(gameTable.status.tag));
    if (blocked) {
      throw new SenderError(blocked);
    }

    let seatIndex = 0;
    while (seatIndex < openSeats && taken.includes(seatIndex)) {
      seatIndex += 1;
    }
    if (seatIndex >= openSeats) {
      throw new SenderError(
        openSeats >= gameTable.maxPlayers
          ? 'Table is full'
          : 'Seat cap reached',
      );
    }

    const watchingIds: string[] = [];
    for (const row of ctx.db.Spectator.byMember.filter(member.id)) {
      watchingIds.push(row.id);
    }
    for (const watchingId of watchingIds) {
      ctx.db.Spectator.id.delete(watchingId);
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

    const seatedNow: RulesSeat[] = [];
    for (const seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      seatedNow.push(rulesSeat(seat));
    }
    let stateJson = gameTable.stateJson;
    let status = gameTable.status;
    const rules = rulesByType[gameTable.gameType];
    if (
      rules &&
      stateIfLobbyReady(stateJson, seatedNow.length, gameTable.minPlayers) ===
        'deal'
    ) {
      const next = rules.initialState(seatedNow, rulesTable(gameTable));
      stateJson = storedState(next);
      status = storedStatus(
        statusTagForState(next, currentStatusTag(gameTable.status.tag)),
      );
    }
    ctx.db.GameTable.id.update({
      ...gameTable,
      stateJson,
      status,
      lastActivityAt: ctx.timestamp,
    });
    rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, gameTable.id);
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const spectate_table = spacetimedb.reducer(
  { name: 'spectate_table' },
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

    let seated = false;
    for (const seat of ctx.db.GameSeat.iter()) {
      if (seat.lobbyMemberId === member.id) {
        seated = true;
        break;
      }
    }
    let watchingThis = false;
    let watchingOther = false;
    for (const row of ctx.db.Spectator.byMember.filter(member.id)) {
      if (row.tableId === gameTable.id) {
        watchingThis = true;
      } else {
        watchingOther = true;
      }
    }
    reject(spectateBlock({ seated, watchingThis, watchingOther }));

    ctx.db.Spectator.insert({
      id: spectatorRowId(gameTable.id, member.id),
      tableId: gameTable.id,
      lobbyMemberId: member.id,
      joinedAt: ctx.timestamp,
    });
    ctx.db.GameTable.id.update({
      ...gameTable,
      lastActivityAt: ctx.timestamp,
    });
    rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, gameTable.id);
    noteLobbyActivity(ctx, lobby.id);
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
    const spectatorIds: string[] = [];
    for (const row of ctx.db.Spectator.byTable.filter(gameTable.id)) {
      if (row.lobbyMemberId === member.id) {
        spectatorIds.push(row.id);
      }
    }
    if (seatIds.length === 0 && spectatorIds.length === 0) {
      throw new SenderError('Not seated');
    }
    for (const seatId of seatIds) {
      ctx.db.GameSeat.id.delete(seatId);
    }
    for (const spectatorId of spectatorIds) {
      ctx.db.Spectator.id.delete(spectatorId);
    }
    ctx.db.GameTable.id.update({
      ...gameTable,
      lastActivityAt: ctx.timestamp,
    });
    forgetTable(ctx.db, ctx.sender.toHexString(), gameTable.id);
    noteLobbyActivity(ctx, lobby.id);
  },
);

export const send_table_chat = spacetimedb.reducer(
  { name: 'send_table_chat' },
  {
    tableId: t.string(),
    clientId: t.string(),
    body: t.string(),
  },
  (ctx, { tableId: rawTableId, clientId: rawClientId, body: rawBody }) => {
    const tableId = rawTableId.trim();
    const clientId = rawClientId.trim();
    const body = rawBody.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    if (clientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    reject(tableChatBodyError(body));

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

    const members = [];
    for (const row of ctx.db.LobbyMember.byLobbyAndClient.filter([
      gameTable.lobbyId,
      clientId,
    ])) {
      members.push(row);
    }
    const member = members[0];
    if (!member) {
      throw new SenderError('Member not found');
    }

    let seated = false;
    for (const seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      if (seat.lobbyMemberId === member.id) {
        seated = true;
        break;
      }
    }
    let watching = false;
    if (!seated) {
      for (const row of ctx.db.Spectator.byTable.filter(gameTable.id)) {
        if (row.lobbyMemberId === member.id) {
          watching = true;
          break;
        }
      }
    }
    reject(tableChatSenderBlock({ seated, watching }));

    const micros = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.TableChatMessage.insert({
      id: tableChatRowId(gameTable.id, member.id, micros),
      tableId: gameTable.id,
      lobbyMemberId: member.id,
      body,
      createdAt: ctx.timestamp,
    });
    noteLobbyActivity(ctx, lobby.id);
  },
);

function rulesTable(row: {
  id: string;
  lobbyId: string;
  gameType: string;
  name: string;
  status: { tag: string };
  minPlayers: number;
  maxPlayers: number;
  stateJson: string;
  createdAt: { toMillis(): bigint };
}): RulesTable {
  const tag = row.status.tag;
  const status =
    tag === 'in_progress' || tag === 'finished' ? tag : 'waiting_for_players';
  return {
    id: row.id,
    lobbyId: row.lobbyId,
    gameType: row.gameType,
    name: row.name,
    status,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    stateJson: row.stateJson,
    createdAt: Number(row.createdAt.toMillis()),
  };
}

function rulesSeat(seat: {
  id: string;
  tableId: string;
  lobbyMemberId: string;
  seatIndex: number;
  chips: number | undefined;
  joinedAt: { toMillis(): bigint };
  seatState: { tag: string } | undefined;
}): RulesSeat {
  const tag = seat.seatState?.tag;
  const seatState =
    tag === 'active' || tag === 'folded' || tag === 'disconnected' ? tag : null;
  return {
    id: seat.id,
    tableId: seat.tableId,
    lobbyMemberId: seat.lobbyMemberId,
    seatIndex: seat.seatIndex,
    chips: seat.chips ?? null,
    joinedAt: Number(seat.joinedAt.toMillis()),
    seatState,
  };
}

function currentStatusTag(tag: string): TableStatusTag {
  if (tag === 'in_progress' || tag === 'finished') {
    return tag;
  }
  return 'waiting_for_players';
}

function storedStatus(tag: TableStatusTag): {
  tag: 'waiting_for_players' | 'in_progress' | 'finished';
} {
  if (tag === 'in_progress') {
    return { tag: 'in_progress' };
  }
  if (tag === 'finished') {
    return { tag: 'finished' };
  }
  return { tag: 'waiting_for_players' };
}

/**
 * Recomputes `Tournament.roundStatus` from its tables after a table's status
 * may have changed. Called from `handle_game_intent`, the only place a
 * table's `phase` (and so its status) reaches `finished`.
 */
function refreshTournamentRoundStatus(
  ctx: ModuleCtx,
  tournamentId: string,
  round: number,
): void {
  const tournament = ctx.db.Tournament.id.find(tournamentId);
  if (!tournament || tournament.currentRound !== round) {
    return;
  }
  const roundRows: TournamentTableRow[] = [];
  for (const row of ctx.db.GameTable.byTournament.filter(tournamentId)) {
    roundRows.push({
      tournamentId: row.tournamentId,
      round: row.round,
      status: row.status,
    });
  }
  const tag = roundStatusTag(roundRows, tournamentId, round);
  if (tournament.roundStatus.tag !== tag) {
    ctx.db.Tournament.id.update({
      ...tournament,
      roundStatus: { tag },
      lastActivityAt: ctx.timestamp,
    });
  }
}

function storedState(next: unknown): string {
  let stateJson: string;
  try {
    const encoded = JSON.stringify(next);
    if (typeof encoded !== 'string') {
      throw new SenderError('Could not store table state');
    }
    stateJson = encoded;
  } catch (err) {
    if (err instanceof SenderError) {
      throw err;
    }
    throw new SenderError('Could not store table state');
  }
  return stateJson;
}

function appliedIntentType(intent: unknown): string {
  if (
    typeof intent === 'object' &&
    intent !== null &&
    !Array.isArray(intent) &&
    'type' in intent &&
    typeof intent.type === 'string' &&
    intent.type.length > 0
  ) {
    return intent.type;
  }
  return 'intent';
}

function appliedIntentPayload(
  order: number,
  intent: unknown,
  note: unknown,
): string {
  const encoded = JSON.stringify(
    note === undefined || note === null
      ? { order, intent }
      : { order, intent, note },
  );
  if (typeof encoded !== 'string') {
    throw new SenderError('Could not store game event');
  }
  return encoded;
}

/** Zero-padded so event ids sort in apply order for one table. */
function eventId(tableId: string, order: number): string {
  let suffix = order.toString();
  while (suffix.length < 6) {
    suffix = `0${suffix}`;
  }
  return `event_${tableId}_${suffix}`;
}

export const handle_game_intent = spacetimedb.reducer(
  { name: 'handle_game_intent' },
  {
    tableId: t.string(),
    clientId: t.string(),
    intentPayload: t.string(),
  },
  (ctx, { tableId: rawTableId, clientId: rawClientId, intentPayload }) => {
    const tableId = rawTableId.trim();
    const clientId = rawClientId.trim();
    if (tableId.length === 0) {
      throw new SenderError('Table id is required');
    }
    if (clientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    if (intentPayload.trim().length === 0) {
      throw new SenderError('Intent payload is required');
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

    const members = [];
    for (const row of ctx.db.LobbyMember.byLobbyAndClient.filter([
      gameTable.lobbyId,
      clientId,
    ])) {
      members.push(row);
    }
    const member = members[0];
    if (!member) {
      throw new SenderError('Member not found');
    }

    const seats = [];
    for (const row of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      if (row.lobbyMemberId === member.id) {
        seats.push(row);
      }
    }
    const seat = seats[0];
    if (!seat) {
      throw new SenderError('Not seated');
    }

    const rules = rulesByType[gameTable.gameType];
    if (!rules) {
      throw new SenderError('Unknown game type');
    }

    let prev: unknown;
    try {
      prev = JSON.parse(gameTable.stateJson);
    } catch {
      throw new SenderError('Invalid table state');
    }

    let intent: unknown;
    try {
      intent = JSON.parse(intentPayload);
    } catch {
      throw new SenderError('Intent must be JSON');
    }

    let next: unknown;
    try {
      next = rules.applyIntent(prev, intent, {
        seat: rulesSeat(seat),
        now: Number(ctx.timestamp.toMillis()),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Intent rejected';
      console.error(rulesErrorLine(gameTable.id, gameTable.lobbyId, message));
      if (err instanceof SenderError) {
        throw err;
      }
      throw new SenderError(message);
    }

    let note: unknown;
    try {
      note = rules.eventNote?.(prev, intent, next, {
        seat: rulesSeat(seat),
        now: Number(ctx.timestamp.toMillis()),
      });
    } catch {
      note = undefined;
    }

    const stateJson = storedState(next);
    const status = storedStatus(
      statusTagForState(next, currentStatusTag(gameTable.status.tag)),
    );
    ctx.db.GameTable.id.update({
      ...gameTable,
      stateJson,
      status,
      lastActivityAt: ctx.timestamp,
    });
    if (gameTable.tournamentId.length > 0) {
      refreshTournamentRoundStatus(
        ctx,
        gameTable.tournamentId,
        gameTable.round,
      );
    }

    let order = 0;
    for (const _event of ctx.db.GameEvent.byTable.filter(gameTable.id)) {
      order += 1;
    }
    ctx.db.GameEvent.insert({
      id: eventId(gameTable.id, order),
      tableId: gameTable.id,
      lobbyMemberId: member.id,
      type: appliedIntentType(intent),
      payloadJson: appliedIntentPayload(order, intent, note),
      createdAt: ctx.timestamp,
    });
    recordClientStats(ctx, gameTable.id, gameTable.gameType, prev, next);
    noteLobbyActivity(ctx, lobby.id);
  },
);
