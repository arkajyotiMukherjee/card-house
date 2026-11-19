import {
  FLOOR_STEER_STEPS,
  FLOOR_STEP_MS,
  LOUNGE_CHAIRS,
  ROOM_TIERS,
  SPAWN,
  floorDirectionPath,
  floorPath,
  floorRows,
  floorRowsAt,
  floorStepAllowed,
  nextFloorSlot,
  redirectFloorWalk,
  tableEntrance,
  walkable,
  type FloorPoint,
} from '../../src/shared/casino-floor';
import { readCasinoAvatar } from '../../src/shared/casino-avatar';
import { paidGameWinners } from './game-prizes';
import { Timestamp } from 'spacetimedb';
import {
  casinoGame,
  coinSetting,
  coinUnits,
  DEFAULT_ROOM_GRANT,
  splitPool,
  tableEconomy,
  type TableEconomy,
} from '../../src/shared/economy';
import {
  pokerHandFinished,
  pokerSessionFinished,
} from './poker-table-lifecycle';
import { strategyFor } from '../../src/shared/games/bots/registry';
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
  advancePoker,
  pokerAdvanceKind,
  pokerBankrolls,
  pokerGameDefinition,
  pokerRules,
  pokerSeatLeft,
  readPokerState,
  type PokerState,
} from '../../src/shared/games/poker';
import {
  dummyCounterRules,
  dummyGameDefinition,
} from '../../src/shared/games/dummy-counter';
import { stubGameDefinition } from '../../src/shared/games/stub';
import {
  disconnectActivity,
  forgetLobby,
  forgetTable,
  forgetTableForEveryone,
  lobbyCreatedLine,
  reconnectActivity,
  rememberLobby,
  rememberTable,
  rulesErrorLine,
  tableCreatedLine,
} from './activity-log';
import { markDisconnected } from './lobby-presence';
import { discordProfile } from './discord-member';
import { speakingRowId, voicePlace } from './speaking-state';
import { manualStartRejection, stateIfLobbyReady } from './lobby-deal';
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
  ABANDONED_TABLE_GRACE_MICROS,
  TABLE_CLEANUP_INTERVAL_MICROS,
  idleTimeoutAllowed,
  shouldRemoveEmptyTable,
} from './table-cleanup';
import { chatBodyRejection, chatMessageId } from './lobby-chat';
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
  roomActivityMicros,
  voiceChannelsPending,
} from './lobby-idle';
import {
  BOT_BEAT_MICROS,
  botIsNext,
  playBotTurns,
  tableBeatDelay,
} from './bot-runner';
import {
  botClientId,
  botIntentRejection,
  botName,
  soloJoinRejection,
  soloLeaveRemovesRoom,
} from './solo';

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
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TABLE_SETTING_KEYS = [
  'name',
  'minPlayers',
  'maxPlayers',
  'variation',
  'limit',
  'buyIn',
  'entryFee',
  'smallBlind',
  'bigBlind',
  'minBuyIn',
  'maxBuyIn',
  'minBet',
  'maxBet',
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
    /** Private room seated with CPU bots. Other clients cannot join. */
    solo: t.bool().default(false),
    startingCoins: t.u32().default(DEFAULT_ROOM_GRANT),
    creatorIdentity: t.string().default(''),
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
    /** CPU seat. Its client id is `bot:{tableId}:{seat}` and it stays disconnected. */
    isBot: t.bool().default(false),
    leftRoom: t.bool().default(false),
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
    economyJson: t.string().default(''),
    hostMemberId: t.string().default(''),
    hostAwaySince: t.option(t.u64()).default(undefined),
    startsAt: t.option(t.u64()).default(undefined),
    handNumber: t.u32().default(0),
    createdAt: t.timestamp(),
    discordVoiceChannelId: t.string().default(''),
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

// A seat stays reserved until its absent owner has had a full turn warning.
const SeatAbsence = table(
  { name: 'SeatAbsence', public: true },
  {
    id: t.string().primaryKey(),
    tableId: t.string().index('btree'),
    lobbyMemberId: t.string(),
    deadlineMicros: t.option(t.u64()),
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
    clientId: t.string().default(''),
  },
);

/** One row per socket, so overlapping reconnects do not disconnect a live identity. */
const ActiveConnection = table(
  { name: 'ActiveConnection', public: false },
  { id: t.string().primaryKey(), identity: t.string().index('btree') },
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

const BotTurnSchedule = table(
  { name: 'BotTurnSchedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    tableId: t.string(),
  },
);

// Winnings from rooms whose detailed wallet records were cleaned up.
const ArchivedWinnings = table(
  { name: 'ArchivedWinnings' },
  {
    identity: t.string().primaryKey(),
    units: t.u128(),
  },
);

const RoomWallet = table(
  { name: 'RoomWallet', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    clientId: t.string(),
    name: t.string(),
    available: t.i64(),
    granted: t.i64(),
    profit: t.i64(),
  },
);
const WalletOwner = table(
  { name: 'WalletOwner' },
  {
    id: t.string().primaryKey(),
    identity: t.string().index('btree'),
  },
);
const WalletLedger = table(
  { name: 'WalletLedger' },
  {
    id: t.string().primaryKey(),
    walletId: t.string().index('btree'),
    tableId: t.string(),
    kind: t.string(),
    amount: t.i64(),
    profit: t.i64(),
    createdAt: t.timestamp(),
  },
);
const TableFunding = table(
  { name: 'TableFunding', public: true },
  {
    id: t.string().primaryKey(),
    tableId: t.string().index('btree'),
    walletId: t.string(),
    seatIndex: t.u32(),
    units: t.i64(),
    committed: t.bool(),
    cpu: t.bool(),
    leaving: t.bool(),
  },
);
const GameSettlement = table(
  { name: 'GameSettlement', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    tableId: t.string(),
    handNumber: t.u32(),
    summaryJson: t.string(),
    createdAt: t.timestamp(),
  },
);
const DiscordLeaderboard = table(
  { name: 'DiscordLeaderboard', public: true },
  {
    lobbyId: t.string().primaryKey(),
    messageId: t.string(),
    revision: t.string(),
  },
);

// These two private tables bridge incompatible schemas without resetting room data.
const RoomUpgrade = table(
  { name: 'RoomUpgrade' },
  {
    id: t.string().primaryKey(),
    ownerIdentity: t.string(),
    phase: t.string(),
  },
);
const TableBackup = table(
  { name: 'TableBackup' },
  {
    id: t.string().primaryKey(),
    payloadJson: t.string(),
  },
);

const CasinoOperator = table(
  { name: 'CasinoOperator' },
  {
    identity: t.string().primaryKey(),
    role: t.string(),
  },
);
const CasinoRoomTier = table(
  { name: 'CasinoRoomTier', public: true },
  {
    lobbyId: t.string().primaryKey(),
    tier: t.string(),
  },
);
const CasinoTableSpot = table(
  { name: 'CasinoTableSpot', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    slot: t.u32(),
  },
);
const CasinoPresence = table(
  { name: 'CasinoPresence', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    x: t.i32(),
    y: t.i32(),
    pathJson: t.string(),
    startedAt: t.timestamp(),
    chair: t.i32(),
    avatar: t.string(),
  },
);
const CasinoAvatarProfile = table(
  { name: 'CasinoAvatarProfile' },
  {
    discordUserId: t.string().primaryKey(),
    avatar: t.string(),
  },
);
const CasinoDiscordIdentity = table(
  { name: 'CasinoDiscordIdentity' },
  {
    identity: t.string().primaryKey(),
    discordUserId: t.string().index('btree'),
  },
);
const CasinoDiscordChallenge = table(
  { name: 'CasinoDiscordChallenge' },
  {
    id: t.string().primaryKey(),
    identity: t.string().unique(),
    expiresAt: t.u64(),
  },
);
const CasinoDiscordMember = table(
  { name: 'CasinoDiscordMember', public: true },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    discordUserId: t.string(),
  },
);
const CasinoDiscordMessage = table(
  { name: 'CasinoDiscordMessage' },
  {
    id: t.string().primaryKey(),
    lobbyId: t.string().index('btree'),
    tableId: t.string().index('btree'),
    channelId: t.string(),
    lobbyMemberId: t.string(),
    author: t.string(),
    body: t.string(),
    createdAt: t.timestamp(),
    deleted: t.bool(),
  },
);

const spacetimedb = schema(
  {
    Lobby,
    CasinoOperator,
    CasinoRoomTier,
    CasinoTableSpot,
    CasinoPresence,
    CasinoAvatarProfile,
    CasinoDiscordIdentity,
    CasinoDiscordChallenge,
    CasinoDiscordMember,
    CasinoDiscordMessage,
    LobbyMember,
    GameTable,
    GameSeat,
    SeatAbsence,
    Spectator,
    GameEvent,
    LobbyChatMessage,
    TableChatMessage,
    VoicePresence,
    SpeakingState,
    OperatorSession,
    ActiveConnection,
    ConnectionRate,
    RoomCaps,
    TableCleanupSchedule,
    LobbyIdleConfig,
    LobbyIdleSweep,
    BotTurnSchedule,
    RoomUpgrade,
    TableBackup,
    ArchivedWinnings,
    RoomWallet,
    WalletOwner,
    WalletLedger,
    TableFunding,
    GameSettlement,
    DiscordLeaderboard,
  },
  { CASE_CONVERSION_POLICY: CaseConversionPolicy.None },
);

export default spacetimedb;

type ModuleCtx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function winningsFromLedger(
  entries: Iterable<{ kind: string; profit: bigint }>,
): bigint {
  let units = 0n;
  for (const { kind, profit } of entries) {
    if (
      profit > 0n &&
      (kind === 'prize' || kind === 'poker_hand' || kind === 'house_hand')
    ) {
      units += profit;
    }
  }
  return units;
}

export const my_lifetime_winnings = spacetimedb.view(
  { name: 'my_lifetime_winnings', public: true },
  t.array(t.object('LifetimeWinnings', { units: t.u128() })),
  (ctx) => {
    const identity = ctx.sender.toHexString();
    let units = ctx.db.ArchivedWinnings.identity.find(identity)?.units ?? 0n;
    for (const wallet of ctx.db.WalletOwner.identity.filter(identity)) {
      units += winningsFromLedger(
        ctx.db.WalletLedger.walletId.filter(wallet.id),
      );
    }
    return [{ units }];
  },
);

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

function collectIds(rows: Iterable<{ id: string }>): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    ids.push(row.id);
  }
  return ids;
}

function deleteIds(
  ids: readonly string[],
  remove: (id: string) => unknown,
): void {
  for (const id of ids) {
    remove(id);
  }
}

function tableIdsInLobby(ctx: ModuleCtx, lobbyId: string): string[] {
  return collectIds(ctx.db.GameTable.byLobby.filter(lobbyId));
}

function activityMicros(ctx: ModuleCtx, lobbyId: string): bigint[] {
  return [...ctx.db.GameTable.byLobby.filter(lobbyId)].map(
    (row) => (row.lastActivityAt ?? row.createdAt).microsSinceUnixEpoch,
  );
}

function roomVoiceChannelIds(ctx: ModuleCtx, lobbyId: string): string[] {
  const ids: string[] = [];
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (lobby) {
    ids.push(lobby.discordLobbyVoiceChannelId);
  }
  for (const table of ctx.db.GameTable.byLobby.filter(lobbyId)) {
    ids.push(table.discordVoiceChannelId);
  }
  return ids;
}

/** Drops people, seats, chat, and presence. Table rows stay until voice ids are clear. */
function clearRoomOccupants(ctx: ModuleCtx, lobbyId: string): void {
  ctx.db.CasinoRoomTier.lobbyId.delete(lobbyId);
  for (const row of ctx.db.CasinoPresence.lobbyId.filter(lobbyId))
    ctx.db.CasinoPresence.id.delete(row.id);
  for (const row of ctx.db.CasinoDiscordMember.lobbyId.filter(lobbyId))
    ctx.db.CasinoDiscordMember.id.delete(row.id);
  for (const row of ctx.db.CasinoDiscordMessage.lobbyId.filter(lobbyId))
    ctx.db.CasinoDiscordMessage.id.delete(row.id);
  const tableIds = tableIdsInLobby(ctx, lobbyId);
  for (const tableId of tableIds)
    for (const funding of ctx.db.TableFunding.tableId.filter(tableId))
      releaseFunding(ctx, funding.id);
  const seatIds: string[] = [];
  const spectatorIds: string[] = [];
  const eventIds: string[] = [];
  const tableChatIds: string[] = [];
  for (const tableId of tableIds) {
    seatIds.push(...collectIds(ctx.db.GameSeat.byTable.filter(tableId)));
    spectatorIds.push(...collectIds(ctx.db.Spectator.byTable.filter(tableId)));
    eventIds.push(...collectIds(ctx.db.GameEvent.byTable.filter(tableId)));
    tableChatIds.push(
      ...collectIds(ctx.db.TableChatMessage.byTable.filter(tableId)),
    );
  }
  deleteIds(seatIds, (id) => ctx.db.GameSeat.id.delete(id));
  deleteIds(spectatorIds, (id) => ctx.db.Spectator.id.delete(id));
  deleteIds(eventIds, (id) => ctx.db.GameEvent.id.delete(id));
  deleteIds(tableChatIds, (id) => ctx.db.TableChatMessage.id.delete(id));
  deleteIds(collectIds(ctx.db.LobbyChatMessage.byLobby.filter(lobbyId)), (id) =>
    ctx.db.LobbyChatMessage.id.delete(id),
  );
  deleteIds(collectIds(ctx.db.SpeakingState.lobbyId.filter(lobbyId)), (id) =>
    ctx.db.SpeakingState.id.delete(id),
  );
  deleteIds(collectIds(ctx.db.VoicePresence.lobbyId.filter(lobbyId)), (id) =>
    ctx.db.VoicePresence.id.delete(id),
  );
  deleteIds(collectIds(ctx.db.LobbyMember.lobbyId.filter(lobbyId)), (id) =>
    ctx.db.LobbyMember.id.delete(id),
  );
  const identities: string[] = [];
  for (const session of ctx.db.OperatorSession.iter()) {
    if (session.lobbyId === lobbyId) {
      identities.push(session.identity);
    }
  }
  for (const identity of identities) {
    const session = ctx.db.OperatorSession.identity.find(identity);
    if (!session || session.lobbyId !== lobbyId) {
      continue;
    }
    ctx.db.OperatorSession.identity.update({
      ...session,
      lobbyId: '',
      tableId: '',
      clientId: '',
    });
  }
}

/** Removes tables and the lobby once no voice channel id remains. */
function deleteRoomShell(ctx: ModuleCtx, lobbyId: string): void {
  if (voiceChannelsPending(roomVoiceChannelIds(ctx, lobbyId))) {
    return;
  }
  clearRoomOccupants(ctx, lobbyId);
  const tableIds = tableIdsInLobby(ctx, lobbyId);
  for (const tableId of tableIds) {
    const gameTable = ctx.db.GameTable.id.find(tableId);
    if (gameTable) {
      deleteGameTable(ctx.db, gameTable);
    }
  }
  for (const wallet of ctx.db.RoomWallet.lobbyId.filter(lobbyId)) {
    const entries = [...ctx.db.WalletLedger.walletId.filter(wallet.id)];
    const owner = ctx.db.WalletOwner.id.find(wallet.id);
    const units = winningsFromLedger(entries);
    if (owner && units > 0n) {
      const archived = ctx.db.ArchivedWinnings.identity.find(owner.identity);
      if (archived) {
        ctx.db.ArchivedWinnings.identity.update({
          ...archived,
          units: archived.units + units,
        });
      } else {
        ctx.db.ArchivedWinnings.insert({ identity: owner.identity, units });
      }
    }
    for (const entry of entries) ctx.db.WalletLedger.id.delete(entry.id);
    ctx.db.WalletOwner.id.delete(wallet.id);
    ctx.db.RoomWallet.id.delete(wallet.id);
  }
  for (const owner of ctx.db.WalletOwner.iter())
    if (owner.id.startsWith(`member_${lobbyId}_`))
      ctx.db.WalletOwner.id.delete(owner.id);
  for (const result of ctx.db.GameSettlement.lobbyId.filter(lobbyId))
    ctx.db.GameSettlement.id.delete(result.id);
  ctx.db.DiscordLeaderboard.lobbyId.delete(lobbyId);
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (lobby) {
    ctx.db.Lobby.id.delete(lobby.id);
  }
}

/**
 * Idle teardown. Players and chat go immediately. While a Discord voice
 * channel id is still stored, the lobby stays `closed` so the bot can delete
 * those channels. The next sweep removes the shell after the ids are cleared.
 */
function tearDownIdleRoom(ctx: ModuleCtx, lobbyId: string): void {
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (!lobby || lobby.status.tag !== 'open') {
    return;
  }
  clearRoomOccupants(ctx, lobbyId);
  if (voiceChannelsPending(roomVoiceChannelIds(ctx, lobbyId))) {
    markLobbyClosed(ctx, lobbyId);
    return;
  }
  deleteRoomShell(ctx, lobbyId);
}

function closeIdleLobbies(ctx: ModuleCtx): void {
  ensureLobbyIdleJob(ctx);
  const config = ctx.db.LobbyIdleConfig.id.find(LOBBY_IDLE_CONFIG_ID);
  if (!config) {
    return;
  }
  if (
    !config.dev &&
    config.idleTimeoutMicros !== PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS
  ) {
    ctx.db.LobbyIdleConfig.id.update({
      ...config,
      idleTimeoutMicros: PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
    });
  }
  const timeout = activeLobbyIdleTimeoutMicros(config);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const lobbyIds = collectIds(ctx.db.Lobby.iter());
  for (const lobbyId of lobbyIds) {
    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby) {
      continue;
    }
    if (lobby.status.tag !== 'open') {
      if (!voiceChannelsPending(roomVoiceChannelIds(ctx, lobby.id))) {
        deleteRoomShell(ctx, lobby.id);
      }
      continue;
    }
    const activity = roomActivityMicros(
      lobby.lastActivityAt?.microsSinceUnixEpoch,
      activityMicros(ctx, lobby.id),
    );
    if (activity === undefined) {
      ctx.db.Lobby.id.update({
        ...lobby,
        lastActivityAt: ctx.timestamp,
      });
      continue;
    }
    if (lobbyIsIdle(activity, now, timeout)) {
      tearDownIdleRoom(ctx, lobby.id);
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
  ctx.db.CasinoOperator.insert({
    identity: ctx.sender.toHexString(),
    role: 'admin',
  });
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
    const connectionId = ctx.connectionId?.toHexString();
    if (connectionId && !ctx.db.ActiveConnection.id.find(connectionId))
      ctx.db.ActiveConnection.insert({
        id: connectionId,
        identity: ctx.sender.toHexString(),
      });
    const returning = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (returning?.tableId) {
      for (const seat of ctx.db.GameSeat.byTable.filter(returning.tableId)) {
        const member = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
        if (member?.clientId === returning.clientId)
          ctx.db.SeatAbsence.id.delete(seat.id);
      }
    }
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
    const identity = ctx.sender.toHexString();
    const connectionId = ctx.connectionId?.toHexString();
    if (connectionId) ctx.db.ActiveConnection.id.delete(connectionId);
    // A reload may connect its replacement before the prior socket closes.
    if (rowCount(ctx.db.ActiveConnection.identity.filter(identity)) > 0) return;
    const session = ctx.db.OperatorSession.identity.find(identity);
    const lobbyId = session?.lobbyId ?? '';
    const clientId = session?.clientId ?? '';
    const line = disconnectActivity(
      ctx.db,
      identity,
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (line !== undefined) {
      console.log(line);
    }
    if (lobbyId.length === 0 || clientId.length === 0) {
      return;
    }
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobbyId, clientId]),
    );
    if (!member) {
      return;
    }
    releaseCasinoChair(ctx, member.id);
    const away = markDisconnected(member);
    ctx.db.LobbyMember.id.update({
      ...away,
      lastSeenAt: ctx.timestamp,
    });
  },
);

export const create_lobby = spacetimedb.reducer(
  { name: 'create_lobby' },
  { startingCoins: t.option(t.u32()) },
  (ctx, { startingCoins }) => {
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
      solo: false,
      startingCoins: validCoins(startingCoins, DEFAULT_ROOM_GRANT),
      creatorIdentity: ctx.sender.toHexString(),
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
  CasinoTableSpot: { id: { delete(id: string): unknown } };
  CasinoDiscordMessage: {
    tableId: { filter(id: string): Iterable<{ id: string }> };
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
  db.CasinoTableSpot.id.delete(gameTable.id);
  for (const message of db.CasinoDiscordMessage.tableId.filter(gameTable.id))
    db.CasinoDiscordMessage.id.delete(message.id);
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
    casinoOperator(ctx, 'discord');
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
    const priorPlace = voicePlace(
      ctx.db.Lobby.iter(),
      ctx.db.GameTable.iter(),
      voiceId,
    );
    if (priorPlace && (priorPlace.lobbyId !== lobby.id || priorPlace.tableId))
      throw new SenderError('Discord channel already has a casino scope');
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
    casinoOperator(ctx, 'discord');
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
    if (
      lobby.creatorIdentity &&
      lobby.creatorIdentity !== ctx.sender.toHexString() &&
      rowCount(ctx.db.RoomWallet.lobbyId.filter(lobby.id)) > 0
    )
      throw new SenderError('Only the room creator can close this paid room');
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

function sweepAbsentSeats(ctx: ModuleCtx): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const seat of ctx.db.GameSeat.iter()) {
    const table = ctx.db.GameTable.id.find(seat.tableId);
    const member = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
    if (!table || !member || table.status.tag !== 'in_progress') continue;
    const funding = ctx.db.TableFunding.id.find(seat.id);
    const away = !member.connected || seat.seatState?.tag === 'disconnected';
    let absence = ctx.db.SeatAbsence.id.find(seat.id);
    if (!away) {
      if (absence) ctx.db.SeatAbsence.id.delete(seat.id);
      if (funding?.cpu)
        ctx.db.TableFunding.id.update({ ...funding, cpu: false });
      continue;
    }
    if (!absence)
      absence = ctx.db.SeatAbsence.insert({
        id: seat.id,
        tableId: table.id,
        lobbyMemberId: member.id,
        deadlineMicros: now + 30_000_000n,
      });
    if (absence.deadlineMicros === undefined) {
      ctx.db.SeatAbsence.id.update({
        ...absence,
        deadlineMicros: now + 30_000_000n,
      });
      continue;
    }
    if (now < absence.deadlineMicros) continue;
    if (
      funding &&
      table.gameType === POKER_GAME_TYPE &&
      JSON.parse(table.stateJson).phase === 'finished'
    ) {
      // A disconnected player gets the same return grace while choosing a rebuy.
      // Once it expires, settled chips must not stay reserved at an idle table.
      releaseFunding(ctx, seat.id);
      ctx.db.GameSeat.id.delete(seat.id);
      ctx.db.SeatAbsence.id.delete(seat.id);
      queueTableBeat(ctx, table.id);
      continue;
    }
    if (cashOutUnbetBlackjack(ctx, table.id, seat.id)) continue;
    if (funding && !funding.cpu)
      ctx.db.TableFunding.id.update({ ...funding, cpu: true });
    const strategy = strategyFor(table.gameType);
    if (!strategy) continue;
    const state = JSON.parse(table.stateJson);
    if (strategy.actingSeats(state).includes(seat.seatIndex)) {
      commitIntent(
        ctx,
        table.id,
        member.id,
        seat.id,
        strategy.choose(state, seat.seatIndex),
        state,
      );
      queueTableBeat(ctx, table.id);
    }
  }
  advanceCasinoTables(ctx);
}

export const close_idle_lobbies = spacetimedb.reducer(
  { name: 'close_idle_lobbies', onSchedule: LobbyIdleSweep },
  { sweep: LobbyIdleSweep.rowType },
  (ctx, { sweep: _sweep }) => {
    if (ctx.db.RoomUpgrade.id.find('room-economy')?.phase === 'archived')
      return;
    sweepTableHosting(ctx);
    sweepAbsentSeats(ctx);
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

function appendLobbyChat(
  ctx: ModuleCtx,
  lobbyId: string,
  lobbyMemberId: string,
  body: string,
): void {
  let order = 0;
  for (const _message of ctx.db.LobbyChatMessage.byLobby.filter(lobbyId)) {
    order += 1;
  }
  ctx.db.LobbyChatMessage.insert({
    id: chatMessageId(lobbyId, order),
    lobbyId,
    lobbyMemberId,
    body,
    createdAt: ctx.timestamp,
  });
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

    ensureWallet(ctx, lobby.id, request.clientId, request.name);
    checkCasinoAdmission(ctx, lobby, request.clientId);
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobby.id, request.clientId]),
    );
    if (member) {
      ctx.db.LobbyMember.id.update({
        ...member,
        leftRoom: false,
        name: request.name,
        connected: true,
        lastSeenAt: ctx.timestamp,
      });
      rememberLobby(
        ctx.db,
        ctx.sender.toHexString(),
        lobby.id,
        request.clientId,
      );
      noteLobbyActivity(ctx, lobby.id);
      return;
    }

    reject(soloJoinRejection(lobby.solo, false));
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
      isBot: false,
      leftRoom: false,
    });
    appendLobbyChat(ctx, lobby.id, '', `${request.name} joined the lobby.`);
    rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id, request.clientId);
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

    ensureWallet(ctx, lobby.id, request.clientId, request.name);
    checkCasinoAdmission(ctx, lobby, request.clientId);
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
        leftRoom: false,
        name: request.name,
        connected: true,
        lastSeenAt: ctx.timestamp,
        discordUserId: discord.discordUserId,
        discordUsername: discord.discordUsername,
        discordGlobalName: discord.discordGlobalName,
        discordDiscriminator: discord.discordDiscriminator,
      });
      rememberLobby(
        ctx.db,
        ctx.sender.toHexString(),
        lobby.id,
        request.clientId,
      );
      noteLobbyActivity(ctx, lobby.id);
      return;
    }

    reject(soloJoinRejection(lobby.solo, false));
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
      isBot: false,
      leftRoom: false,
    });
    appendLobbyChat(ctx, lobby.id, '', `${request.name} joined the lobby.`);
    rememberLobby(ctx.db, ctx.sender.toHexString(), lobby.id, request.clientId);
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

    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (
      session?.lobbyId !== lobbyId ||
      session.clientId !== clientId ||
      member.leftRoom
    )
      throw new SenderError('Join this room before sending chat');
    appendLobbyChat(ctx, lobbyId, member.id, body);
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
    const verified = [
      ...ctx.db.CasinoDiscordMember.lobbyId.filter(place.lobbyId),
    ].filter((row) => row.discordUserId === discordUserId);
    if (verified.length) casinoOperator(ctx, 'discord');
    const member = verified.length
      ? verified
          .map((row) => ctx.db.LobbyMember.id.find(row.id))
          .find(
            (row) =>
              row?.connected &&
              !row.leftRoom &&
              ctx.db.VoicePresence.id.find(`presence_${row.id}`)?.tableId ===
                place.tableId,
          )
      : firstRow(
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

function tableSettings(raw: string | undefined): Partial<TableEconomy> & {
  buyIn?: number;
  name?: string;
  minPlayers?: number;
  maxPlayers?: number;
  variation?: string;
  limit?: string;
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
    limit?: string;
    buyIn?: number;
    entryFee?: number;
    smallBlind?: number;
    bigBlind?: number;
    minBuyIn?: number;
    maxBuyIn?: number;
    minBet?: number;
    maxBet?: number;
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
  if ('limit' in record) {
    if (record.limit !== 'no-limit' && record.limit !== 'pot-limit')
      throw new SenderError('Unknown poker betting limit');
    settings.limit = record.limit;
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
  for (const key of [
    'buyIn',
    'entryFee',
    'smallBlind',
    'bigBlind',
    'minBuyIn',
    'maxBuyIn',
    'minBet',
    'maxBet',
  ] as const) {
    if (key in record) settings[key] = validCoins(record[key], 20);
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
  economyJson: string;
  hostMemberId: string;
  hostAwaySince: bigint | undefined;
  startsAt: bigint | undefined;
  handNumber: number;
}

/**
 * Builds the row for a new table, enforcing the seat and table caps.
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
  if (settings.limit && gameType !== 'poker')
    throw new SenderError('limit is only for poker');
  const opening = openingTableState(
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
  );
  if (gameType === 'poker' && settings.limit)
    (opening as { limit: string }).limit = settings.limit;
  const stateJson = storedState(opening);
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
    economyJson: '',
    hostMemberId: '',
    hostAwaySince: undefined,
    startsAt: undefined,
    handNumber: 0,
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
    const caps = {
      ...currentRoomCaps(ctx.db),
      maxTablesPerLobby: casinoLimits(ctx, lobby.id).tables,
    };

    let existing = 0;
    let sameType = 0;
    for (const table of ctx.db.GameTable.byLobby.filter(lobby.id)) {
      if (table.status.tag !== 'finished') existing += 1;
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
    );
    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    const creator = session
      ? firstRow(
          ctx.db.LobbyMember.byLobbyAndClient.filter([
            lobby.id,
            session.clientId,
          ]),
        )
      : undefined;
    if (!creator || session?.lobbyId !== lobby.id)
      throw new SenderError('Join this room before creating a table');
    if (
      [...ctx.db.GameSeat.iter()].some(
        (seat) => seat.lobbyMemberId === creator.id,
      )
    )
      throw new SenderError('Already seated');
    if (
      !definitionByType[gameType] ||
      gameType === 'dummy' ||
      gameType === 'stub'
    )
      throw new SenderError('Unknown game type');
    ctx.db.GameTable.insert({
      ...row,
      hostMemberId: creator.id,
      economyJson: JSON.stringify(validTableEconomy(gameType, settings)),
    });
    assignCasinoSpot(ctx, lobby.id, row.id);
    parkCasinoAvatar(ctx, creator.id, row.id);
    reserveFunding(ctx, row.id, creator.id, 0, settings.buyIn);
    ctx.db.GameSeat.insert({
      id: `seat_${row.id}_${creator.id}`,
      tableId: row.id,
      lobbyMemberId: creator.id,
      seatIndex: 0,
      chips: undefined,
      joinedAt: ctx.timestamp,
      seatState: { tag: 'active' },
    });
    rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, row.id);
    console.log(tableCreatedLine(row.id, lobby.id));
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
    casinoOperator(ctx, 'discord');
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
    const priorPlace = voicePlace(
      ctx.db.Lobby.iter(),
      ctx.db.GameTable.iter(),
      voiceId,
    );
    if (priorPlace && priorPlace.tableId !== gameTable.id)
      throw new SenderError('Discord channel already has a casino scope');
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
    casinoOperator(ctx, 'discord');
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
    const staleVerified = [
      ...ctx.db.VoicePresence.discordUserId.filter(userId),
    ].some((row) => ctx.db.CasinoDiscordMember.id.find(row.lobbyMemberId));
    const verified = scope
      ? [...ctx.db.CasinoDiscordMember.lobbyId.filter(scope.lobbyId)].filter(
          (row) => row.discordUserId === userId,
        )
      : [];
    if (staleVerified || verified?.length) casinoOperator(ctx, 'discord');
    if (scope) {
      for (const member of ctx.db.LobbyMember.lobbyId.filter(scope.lobbyId)) {
        if (
          verified?.length &&
          (!member.connected ||
            member.leftRoom ||
            !verified.some((row) => row.id === member.id))
        )
          continue;
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
      const previous = ctx.db.VoicePresence.id.find(id);
      if (previous)
        ctx.db.SpeakingState.id.delete(
          speakingRowId(previous.lobbyMemberId, previous.tableId),
        );
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
      ctx.db.SpeakingState.id.delete(
        speakingRowId(desired.memberId, current.tableId),
      );
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
    const funding = [...ctx.db.TableFunding.tableId.filter(gameTable.id)];
    if (
      funding.length &&
      ctx.db.WalletOwner.id.find(gameTable.hostMemberId)?.identity !==
        ctx.sender.toHexString() &&
      ctx.db.Lobby.id.find(gameTable.lobbyId)?.creatorIdentity !==
        ctx.sender.toHexString()
    )
      throw new SenderError('Only the host can remove this paid table');
    if (funding.some((row) => row.committed))
      throw new SenderError('Finish the paid game before removing this table');
    for (const row of funding) releaseFunding(ctx, row.id);
    forgetTableForEveryone(ctx.db, gameTable.id);
    deleteGameTable(ctx.db, gameTable);
    noteLobbyActivity(ctx, gameTable.lobbyId);
  },
);

export const clean_empty_tables = spacetimedb.reducer(
  { name: 'clean_empty_tables', onSchedule: TableCleanupSchedule },
  { schedule: TableCleanupSchedule.rowType },
  (ctx, _args) => {
    if (ctx.db.RoomUpgrade.id.find('room-economy')?.phase === 'archived')
      return;
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
      // Paid claims always settle before an abandoned table can be removed.
      if (rowCount(ctx.db.TableFunding.tableId.filter(gameTable.id)) > 0)
        continue;
      const hostAbsentMicros =
        gameTable.hostAwaySince === undefined
          ? undefined
          : now - gameTable.hostAwaySince;
      if (
        seats === 0 &&
        hostAbsentMicros !== undefined &&
        hostAbsentMicros >= ABANDONED_TABLE_GRACE_MICROS &&
        gameTable.discordVoiceChannelId &&
        gameTable.status.tag !== 'finished'
      ) {
        // Let the bot delete and clear the channel before removing its table row.
        ctx.db.GameTable.id.update({
          ...gameTable,
          status: { tag: 'finished' },
        });
        continue;
      }
      const activity = gameTable.lastActivityAt ?? gameTable.createdAt;
      const idleMicros = now - activity.microsSinceUnixEpoch;
      if (
        seats === 0 &&
        gameTable.status.tag === 'finished' &&
        rowCount(ctx.db.Spectator.byTable.filter(gameTable.id)) > 0 &&
        idleMicros < idleLimit
      )
        continue;
      if (
        shouldRemoveEmptyTable(
          seats,
          gameTable.status.tag,
          idleMicros,
          idleLimit,
          gameTable.discordVoiceChannelId,
          hostAbsentMicros,
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
    buyIn: t.option(t.u32()),
  },
  (ctx, { tableId: rawTableId, lobbyMemberId: rawLobbyMemberId, buyIn }) => {
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

    const caller = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (caller?.clientId !== member.clientId || caller.lobbyId !== lobby.id) {
      throw new SenderError('Join this room before taking a seat');
    }
    if (
      gameTable.economyJson &&
      gameTable.gameType === POKER_GAME_TYPE &&
      gameTable.status.tag === 'finished'
    )
      throw new SenderError('Game already ended');
    for (const existing of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      if (existing.lobbyMemberId !== member.id) continue;
      ctx.db.SeatAbsence.id.delete(existing.id);
      const funding = ctx.db.TableFunding.id.find(existing.id);
      if (funding)
        ctx.db.TableFunding.id.update({
          ...funding,
          cpu: false,
          leaving: false,
        });
      ctx.db.GameSeat.id.update({ ...existing, seatState: { tag: 'active' } });
      parkCasinoAvatar(ctx, member.id, gameTable.id);
      rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, gameTable.id);
      return;
    }
    for (const seat of ctx.db.GameSeat.iter()) {
      if (seat.lobbyMemberId === member.id) {
        const previous = ctx.db.GameTable.id.find(seat.tableId);
        if (
          previous?.gameType === POKER_GAME_TYPE &&
          ctx.db.SeatAbsence.id.find(seat.id) &&
          pokerSessionFinished(JSON.parse(previous.stateJson))
        ) {
          ctx.db.SeatAbsence.id.delete(seat.id);
          ctx.db.GameSeat.id.delete(seat.id);
          ctx.db.GameTable.id.update({
            ...previous,
            status: { tag: 'finished' },
          });
          continue;
        }
        throw new SenderError('Already seated');
      }
    }

    const blocked = joinBlockForStatus(currentStatusTag(gameTable.status.tag));
    if (
      blocked &&
      !(
        (gameTable.status.tag === 'in_progress' ||
          gameTable.gameType !== POKER_GAME_TYPE) &&
        gameTable.economyJson &&
        casinoGame(gameTable.gameType) &&
        JSON.parse(gameTable.stateJson).phase === 'finished'
      )
    ) {
      throw new SenderError(blocked);
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

    reserveFunding(ctx, gameTable.id, member.id, seatIndex, buyIn);
    ctx.db.GameSeat.insert({
      id: `seat_${gameTable.id}_${member.id}`,
      tableId: gameTable.id,
      lobbyMemberId: member.id,
      seatIndex,
      chips: undefined,
      joinedAt: ctx.timestamp,
      seatState: { tag: 'active' },
    });

    ctx.db.TableChatMessage.insert({
      id: tableChatRowId(
        gameTable.id,
        member.id,
        ctx.timestamp.microsSinceUnixEpoch,
      ),
      tableId: gameTable.id,
      lobbyMemberId: '',
      body: `${member.name} joined the table.`,
      createdAt: ctx.timestamp,
    });
    ctx.db.GameTable.id.update({ ...gameTable, lastActivityAt: ctx.timestamp });
    parkCasinoAvatar(ctx, member.id, gameTable.id);
    rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, gameTable.id);
    noteLobbyActivity(ctx, lobby.id);
    queueTableBeat(ctx, gameTable.id);
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
    parkCasinoAvatar(ctx, member.id, gameTable.id);
    rememberTable(ctx.db, ctx.sender.toHexString(), lobby.id, gameTable.id);
    noteLobbyActivity(ctx, lobby.id);
  },
);

function memberSeatRefs(
  ctx: ModuleCtx,
  memberId: string,
): { id: string; tableId: string }[] {
  const rows: { id: string; tableId: string }[] = [];
  for (const seat of ctx.db.GameSeat.iter()) {
    if (seat.lobbyMemberId === memberId) {
      rows.push({ id: seat.id, tableId: seat.tableId });
    }
  }
  return rows;
}

function memberSpectatorRefs(
  ctx: ModuleCtx,
  memberId: string,
): { id: string; tableId: string }[] {
  const rows: { id: string; tableId: string }[] = [];
  for (const row of ctx.db.Spectator.byMember.filter(memberId)) {
    rows.push({ id: row.id, tableId: row.tableId });
  }
  return rows;
}

function memberPresenceIds(
  ctx: ModuleCtx,
  lobbyId: string,
  memberId: string,
): string[] {
  const ids: string[] = [];
  for (const row of ctx.db.VoicePresence.lobbyId.filter(lobbyId)) {
    if (row.lobbyMemberId === memberId) {
      ids.push(row.id);
    }
  }
  return ids;
}

function memberSpeakingIds(
  ctx: ModuleCtx,
  lobbyId: string,
  memberId: string,
): string[] {
  const ids: string[] = [];
  for (const row of ctx.db.SpeakingState.lobbyId.filter(lobbyId)) {
    if (row.lobbyMemberId === memberId) {
      ids.push(row.id);
    }
  }
  return ids;
}

export const leave_lobby = spacetimedb.reducer(
  { name: 'leave_lobby' },
  {
    lobbyId: t.string(),
    clientId: t.string(),
  },
  (ctx, { lobbyId: rawLobbyId, clientId: rawClientId }) => {
    const lobbyId = rawLobbyId.trim();
    const clientId = rawClientId.trim();
    if (lobbyId.length === 0) {
      throw new SenderError('Lobby id is required');
    }
    if (clientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (!lobby) {
      throw new SenderError('Room not found');
    }
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([lobbyId, clientId]),
    );
    if (!member) {
      throw new SenderError('Member not found');
    }
    if (!lobby.solo) requireWalletOwner(ctx, member.id);
    if (soloLeaveRemovesRoom(lobby.solo, member.isBot)) {
      deleteRoomShell(ctx, lobby.id);
      forgetLobby(ctx.db, ctx.sender.toHexString());
      return;
    }

    releaseCasinoChair(ctx, member.id);
    const seats = memberSeatRefs(ctx, member.id);
    const spectators = memberSpectatorRefs(ctx, member.id);
    const presence = memberPresenceIds(ctx, lobby.id, member.id);
    const speaking = memberSpeakingIds(ctx, lobby.id, member.id);
    const touched = new Set<string>();
    for (const seat of seats) {
      touched.add(seat.tableId);
    }
    for (const spectator of spectators) {
      touched.add(spectator.tableId);
    }
    let active = false;
    for (const ref of seats) {
      if (cashOutUnbetBlackjack(ctx, ref.tableId, ref.id)) continue;
      const table = ctx.db.GameTable.id.find(ref.tableId);
      const state = table ? JSON.parse(table.stateJson) : null;
      if (table?.status.tag === 'in_progress' && state?.phase !== 'finished') {
        active = true;
        const seat = ctx.db.GameSeat.id.find(ref.id);
        if (seat)
          ctx.db.GameSeat.id.update({
            ...seat,
            seatState: { tag: 'disconnected' },
          });
        const funding = ctx.db.TableFunding.id.find(ref.id);
        if (funding)
          ctx.db.TableFunding.id.update({ ...funding, leaving: true });
      } else {
        releaseFunding(ctx, ref.id);
        ctx.db.GameSeat.id.delete(ref.id);
      }
    }
    deleteIds(
      spectators.map((row) => row.id),
      (id) => ctx.db.Spectator.id.delete(id),
    );
    deleteIds(presence, (id) => ctx.db.VoicePresence.id.delete(id));
    deleteIds(speaking, (id) => ctx.db.SpeakingState.id.delete(id));
    if (active)
      ctx.db.LobbyMember.id.update({
        ...member,
        connected: false,
        leftRoom: true,
      });
    else ctx.db.LobbyMember.id.delete(member.id);
    for (const tableId of touched) {
      const gameTable = ctx.db.GameTable.id.find(tableId);
      if (!gameTable) {
        continue;
      }
      ctx.db.GameTable.id.update({
        ...gameTable,
        lastActivityAt: ctx.timestamp,
      });
    }
    forgetLobby(ctx.db, ctx.sender.toHexString());
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

    const caller = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (caller?.clientId !== member.clientId || caller.lobbyId !== lobby.id) {
      throw new SenderError('You can only leave your own seat');
    }
    const seatIds: string[] = [];
    const leavingSeats: number[] = [];
    for (const seat of ctx.db.GameSeat.byTable.filter(gameTable.id)) {
      if (seat.lobbyMemberId === member.id) {
        seatIds.push(seat.id);
        leavingSeats.push(seat.seatIndex);
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
    if (soloLeaveRemovesRoom(lobby.solo, member.isBot)) {
      deleteRoomShell(ctx, lobby.id);
      forgetLobby(ctx.db, ctx.sender.toHexString());
      return;
    }
    if (
      seatIds.length &&
      cashOutUnbetBlackjack(ctx, gameTable.id, seatIds[0])
    ) {
      forgetTable(ctx.db, ctx.sender.toHexString(), gameTable.id);
      noteLobbyActivity(ctx, lobby.id);
      return;
    }
    if (
      gameTable.status.tag === 'in_progress' &&
      seatIds.length > 0 &&
      !(
        casinoGame(gameTable.gameType) &&
        JSON.parse(gameTable.stateJson).phase === 'finished'
      )
    ) {
      for (const seatId of seatIds) {
        const seat = ctx.db.GameSeat.id.find(seatId);
        if (!seat) continue;
        ctx.db.GameSeat.id.update({
          ...seat,
          seatState: { tag: 'disconnected' },
        });
        const funding = ctx.db.TableFunding.id.find(seat.id);
        if (funding)
          ctx.db.TableFunding.id.update({ ...funding, leaving: true });
        if (!ctx.db.SeatAbsence.id.find(seat.id))
          ctx.db.SeatAbsence.insert({
            id: seat.id,
            tableId: gameTable.id,
            lobbyMemberId: member.id,
            deadlineMicros: ctx.timestamp.microsSinceUnixEpoch + 30_000_000n,
          });
      }
      forgetTable(ctx.db, ctx.sender.toHexString(), gameTable.id);
      noteLobbyActivity(ctx, lobby.id);
      return;
    }
    for (const seatId of seatIds) {
      releaseFunding(ctx, seatId);
      ctx.db.SeatAbsence.id.delete(seatId);
      ctx.db.GameSeat.id.delete(seatId);
    }
    for (const spectatorId of spectatorIds) {
      ctx.db.Spectator.id.delete(spectatorId);
    }
    let stateJson = gameTable.stateJson;
    let status = gameTable.status;
    if (gameTable.gameType === POKER_GAME_TYPE && leavingSeats.length > 0) {
      try {
        let parsed: unknown = JSON.parse(gameTable.stateJson);
        for (const seatIndex of leavingSeats) {
          parsed = pokerSeatLeft(parsed as PokerState, seatIndex);
        }
        stateJson = storedState(parsed);
        status = storedStatus(
          tableStatusTag(
            POKER_GAME_TYPE,
            parsed,
            currentStatusTag(gameTable.status.tag),
          ),
        );
      } catch {
        stateJson = gameTable.stateJson;
        status = gameTable.status;
      }
    }
    if (
      gameTable.gameType === POKER_GAME_TYPE &&
      rowCount(ctx.db.GameSeat.byTable.filter(gameTable.id)) === 0 &&
      pokerHandFinished(JSON.parse(stateJson))
    )
      status = { tag: 'finished' };
    ctx.db.GameTable.id.update({
      ...gameTable,
      stateJson,
      status,
      lastActivityAt: ctx.timestamp,
    });
    if (gameTable.gameType === POKER_GAME_TYPE && leavingSeats.length > 0) {
      queueTableBeat(ctx, gameTable.id);
    }
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

    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (
      session?.lobbyId !== lobby.id ||
      session.clientId !== clientId ||
      member.leftRoom
    )
      throw new SenderError('Join this room before sending chat');
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
  economyJson?: string;
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
    economy: row.economyJson
      ? (JSON.parse(row.economyJson) as TableEconomy)
      : undefined,
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

/**
 * Poker is a cash game. A finished hand is the pause before the next deal,
 * so the table stays in progress while at least two players can fund the next hand.
 */
function tableStatusTag(
  gameType: string,
  state: unknown,
  current: TableStatusTag,
): TableStatusTag {
  const tag = statusTagForState(state, current);
  if (gameType === POKER_GAME_TYPE && tag === 'finished') {
    return pokerSessionFinished(state) ? 'finished' : 'in_progress';
  }
  return tag;
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

function commitIntent(
  ctx: ModuleCtx,
  tableId: string,
  memberId: string,
  seatId: string,
  intent: unknown,
  prev: unknown,
): unknown {
  const gameTable = ctx.db.GameTable.id.find(tableId);
  if (!gameTable) {
    throw new SenderError('Table not found');
  }
  const member = ctx.db.LobbyMember.id.find(memberId);
  if (!member) {
    throw new SenderError('Member not found');
  }
  const seat = ctx.db.GameSeat.id.find(seatId);
  if (!seat) {
    throw new SenderError('Not seated');
  }
  const rules = rulesByType[gameTable.gameType];
  if (!rules) {
    throw new SenderError('Unknown game type');
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
    tableStatusTag(
      gameTable.gameType,
      next,
      currentStatusTag(gameTable.status.tag),
    ),
  );
  ctx.db.GameTable.id.update({
    ...gameTable,
    stateJson,
    status,
    lastActivityAt: ctx.timestamp,
  });

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
  settleEconomy(ctx, gameTable.id, next);
  noteLobbyActivity(ctx, gameTable.lobbyId);
  return next;
}

function seatAt(
  ctx: ModuleCtx,
  tableId: string,
  seatIndex: number,
): { id: string; lobbyMemberId: string } | undefined {
  for (const seat of ctx.db.GameSeat.byTable.filter(tableId)) {
    if (seat.seatIndex === seatIndex) {
      return seat;
    }
  }
  return undefined;
}

function scheduleBotTurns(
  ctx: ModuleCtx,
  tableId: string,
  delayMicros: bigint,
): void {
  for (const row of ctx.db.BotTurnSchedule.iter()) {
    if (row.tableId === tableId) {
      return;
    }
  }
  ctx.db.BotTurnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(
      ctx.timestamp.microsSinceUnixEpoch + delayMicros,
    ),
    tableId,
  });
}

function seatIndexes(ctx: ModuleCtx, tableId: string): number[] {
  const indexes: number[] = [];
  for (const seat of ctx.db.GameSeat.byTable.filter(tableId)) {
    indexes.push(seat.seatIndex);
  }
  indexes.sort((left, right) => left - right);
  return indexes;
}

function readTablePoker(state: unknown): PokerState | null {
  try {
    return readPokerState(state);
  } catch {
    return null;
  }
}

/** One bot action, or one poker street or the next hand, on a later beat. */
function queueTableBeat(ctx: ModuleCtx, tableId: string): void {
  const solo = soloActors(ctx, tableId);
  if (solo && botIsNext(solo.gameType, solo.state, solo.actors)) {
    scheduleBotTurns(ctx, tableId, BOT_BEAT_MICROS);
    return;
  }
  const gameTable = ctx.db.GameTable.id.find(tableId);
  if (!gameTable || gameTable.gameType !== POKER_GAME_TYPE) {
    return;
  }
  if (gameTable.economyJson && closeFinishedPokerSession(ctx, tableId)) return;
  if (
    gameTable.economyJson &&
    JSON.parse(gameTable.stateJson).phase === 'finished'
  ) {
    for (const funding of ctx.db.TableFunding.tableId.filter(tableId)) {
      const member = ctx.db.LobbyMember.id.find(funding.walletId);
      if (funding.leaving || !member?.connected || member.leftRoom) {
        releaseFunding(ctx, funding.id);
        ctx.db.GameSeat.id.delete(funding.id);
        ctx.db.SeatAbsence.id.delete(funding.id);
      }
    }
  }
  if (gameTable.economyJson && closeFinishedPokerSession(ctx, tableId)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(gameTable.stateJson);
  } catch {
    return;
  }
  let poker = readTablePoker(parsed);
  if (poker?.phase === 'finished' && gameTable.economyJson)
    poker = pokerBankrolls(
      poker,
      [...ctx.db.TableFunding.tableId.filter(tableId)].map((row) => ({
        seatIndex: row.seatIndex,
        chips: Number(row.units) / 2,
      })),
    );
  if (!poker) {
    return;
  }
  const kind = pokerAdvanceKind(poker, seatIndexes(ctx, tableId));
  if (!kind) {
    return;
  }
  if (kind === 'hand' && gameTable.startsAt === undefined)
    ctx.db.GameTable.id.update({
      ...gameTable,
      startsAt: ctx.timestamp.microsSinceUnixEpoch + 10_000_000n,
    });
  scheduleBotTurns(
    ctx,
    tableId,
    tableBeatDelay(kind === 'hand' ? 'hand' : 'street'),
  );
}

function advancePokerTable(ctx: ModuleCtx, tableId: string): void {
  const gameTable = ctx.db.GameTable.id.find(tableId);
  if (!gameTable || gameTable.gameType !== POKER_GAME_TYPE) {
    return;
  }
  if (gameTable.economyJson && closeFinishedPokerSession(ctx, tableId)) return;
  if (
    gameTable.economyJson &&
    JSON.parse(gameTable.stateJson).phase === 'finished'
  ) {
    for (const funding of ctx.db.TableFunding.tableId.filter(tableId)) {
      const member = ctx.db.LobbyMember.id.find(funding.walletId);
      if (funding.leaving || !member?.connected || member.leftRoom) {
        releaseFunding(ctx, funding.id);
        ctx.db.GameSeat.id.delete(funding.id);
        ctx.db.SeatAbsence.id.delete(funding.id);
      }
    }
  }
  if (gameTable.economyJson && closeFinishedPokerSession(ctx, tableId)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(gameTable.stateJson);
  } catch {
    return;
  }
  let poker = readTablePoker(parsed);
  if (poker?.phase === 'finished' && gameTable.economyJson)
    poker = pokerBankrolls(
      poker,
      [...ctx.db.TableFunding.tableId.filter(tableId)].map((row) => ({
        seatIndex: row.seatIndex,
        chips: Number(row.units) / 2,
      })),
    );
  if (!poker) {
    return;
  }
  const seated = seatIndexes(ctx, tableId);
  if (pokerAdvanceKind(poker, seated) === null) {
    return;
  }
  const kind = pokerAdvanceKind(poker, seated);
  const next = advancePoker(poker, rulesTable(gameTable), seated);
  ctx.db.GameTable.id.update({
    ...gameTable,
    stateJson: storedState(next),
    handNumber:
      kind === 'hand' ? gameTable.handNumber + 1 : gameTable.handNumber,
    startsAt: undefined,
    status: storedStatus(
      tableStatusTag(
        POKER_GAME_TYPE,
        next,
        currentStatusTag(gameTable.status.tag),
      ),
    ),
    lastActivityAt: ctx.timestamp,
  });
  settleEconomy(ctx, tableId, next);
  noteLobbyActivity(ctx, gameTable.lobbyId);
  queueTableBeat(ctx, tableId);
}

function soloActors(
  ctx: ModuleCtx,
  tableId: string,
): {
  gameType: string;
  lobbyId: string;
  state: unknown;
  actors: { seatIndex: number; isBot: boolean }[];
} | null {
  const gameTable = ctx.db.GameTable.id.find(tableId);
  if (!gameTable) {
    return null;
  }
  const lobby = ctx.db.Lobby.id.find(gameTable.lobbyId);
  if (!lobby || !lobby.solo || lobby.status.tag !== 'open') {
    return null;
  }
  let state: unknown;
  try {
    state = JSON.parse(gameTable.stateJson);
  } catch {
    return null;
  }
  const actors: { seatIndex: number; isBot: boolean }[] = [];
  for (const seat of ctx.db.GameSeat.byTable.filter(tableId)) {
    const member = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
    if (!member) {
      continue;
    }
    actors.push({ seatIndex: seat.seatIndex, isBot: member.isBot });
  }
  return {
    gameType: gameTable.gameType,
    lobbyId: gameTable.lobbyId,
    state,
    actors,
  };
}

/** A person's move is already stored. The next bot or poker beat waits. */
function queueBotTurns(ctx: ModuleCtx, tableId: string): void {
  queueTableBeat(ctx, tableId);
}

/** One bot intent, then another beat when a bot still has to act. */
function applyOneBotTurn(ctx: ModuleCtx, tableId: string): void {
  const solo = soloActors(ctx, tableId);
  if (!solo) {
    return;
  }
  const batch = playBotTurns(
    solo.gameType,
    solo.state,
    solo.actors,
    (current, intent, seatIndex) => {
      const seat = seatAt(ctx, tableId, seatIndex);
      if (!seat) {
        throw new SenderError('Not seated');
      }
      return commitIntent(
        ctx,
        tableId,
        seat.lobbyMemberId,
        seat.id,
        intent,
        current,
      );
    },
    1,
  );
  if (batch.error) {
    console.error(rulesErrorLine(tableId, solo.lobbyId, batch.error));
    return;
  }
  queueTableBeat(ctx, tableId);
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
    reject(botIntentRejection(member.isBot));
    const caller = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (caller?.clientId !== clientId || caller.lobbyId !== lobby.id)
      throw new SenderError('You can only play your own seat');

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

    if (
      typeof intent === 'object' &&
      intent !== null &&
      'type' in intent &&
      intent.type === 'start_game'
    ) {
      const session = ctx.db.OperatorSession.identity.find(
        ctx.sender.toHexString(),
      );
      if (session?.clientId !== clientId || session.lobbyId !== lobby.id) {
        throw new SenderError('Join this room before starting');
      }
      reject(
        manualStartRejection(
          gameTable.stateJson,
          rowCount(ctx.db.GameSeat.byTable.filter(gameTable.id)),
          gameTable.minPlayers,
          gameTable.hostMemberId ? gameTable.hostMemberId === member.id : false,
        ),
      );
      startTable(ctx, gameTable.id);
      return;
    }

    commitIntent(ctx, gameTable.id, member.id, seat.id, intent, prev);
    queueBotTurns(ctx, gameTable.id);
  },
);

export const play_bot_turns = spacetimedb.reducer(
  { name: 'play_bot_turns', onSchedule: BotTurnSchedule },
  { row: BotTurnSchedule.rowType },
  (ctx, { row }) => {
    if (ctx.db.RoomUpgrade.id.find('room-economy')?.phase === 'archived')
      return;
    if (ctx.db.BotTurnSchedule.scheduledId.find(row.scheduledId)) {
      ctx.db.BotTurnSchedule.scheduledId.delete(row.scheduledId);
    }
    const solo = soloActors(ctx, row.tableId);
    if (solo && botIsNext(solo.gameType, solo.state, solo.actors)) {
      applyOneBotTurn(ctx, row.tableId);
      return;
    }
    advancePokerTable(ctx, row.tableId);
  },
);

export const start_solo_game = spacetimedb.reducer(
  { name: 'start_solo_game' },
  {
    clientId: t.string(),
    name: t.string(),
    gameType: t.string(),
    seatCount: t.u32(),
    settings: t.option(t.string()),
  },
  (
    ctx,
    {
      clientId: rawClientId,
      name: rawName,
      gameType: rawGameType,
      seatCount,
      settings: rawSettings,
    },
  ) => {
    const clientId = rawClientId.trim();
    const name = rawName.trim();
    const gameType = rawGameType.trim();
    if (clientId.length === 0) {
      throw new SenderError('Client id is required');
    }
    if (name.length === 0) {
      throw new SenderError('Name is required');
    }
    if (gameType.length === 0) {
      throw new SenderError('Game type is required');
    }
    const definition = definitionByType[gameType];
    if (!definition || gameType === 'dummy' || gameType === 'stub') {
      throw new SenderError('Unknown game type');
    }
    if (
      !Number.isInteger(seatCount) ||
      seatCount < definition.minPlayers ||
      seatCount > definition.maxPlayers
    ) {
      throw new SenderError('Seat count is outside this game');
    }

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
    const lobbyId = `lobby_${sender}_${micros.toString()}_solo`;
    ctx.db.Lobby.insert({
      id: lobbyId,
      code,
      status: { tag: 'open' },
      createdAt: ctx.timestamp,
      lastActivityAt: ctx.timestamp,
      discordChannelId: '',
      discordGuildId: '',
      discordLobbyVoiceChannelId: '',
      solo: true,
      startingCoins: DEFAULT_ROOM_GRANT,
      creatorIdentity: ctx.sender.toHexString(),
    });
    console.log(lobbyCreatedLine(lobbyId));

    const humanId = `member_${lobbyId}_${clientId}`;
    ctx.db.LobbyMember.insert({
      id: humanId,
      lobbyId,
      clientId,
      name,
      connected: true,
      lastSeenAt: ctx.timestamp,
      discordUserId: '',
      discordUsername: '',
      discordGlobalName: '',
      discordDiscriminator: undefined,
      isBot: false,
      leftRoom: false,
    });
    rememberLobby(ctx.db, sender, lobbyId, clientId);

    const requested = tableSettings(rawSettings);
    if (gameType !== POKER_GAME_TYPE) {
      requested.variation = undefined;
    }
    requested.minPlayers = seatCount;
    requested.maxPlayers = seatCount;
    if (!requested.name) {
      requested.name = definition.displayName;
    }
    const row = openTableRow(
      ctx,
      { id: lobbyId },
      gameType,
      requested,
      caps,
      0,
      0,
      'solo',
    );
    ctx.db.GameTable.insert({ ...row, hostMemberId: humanId });
    console.log(tableCreatedLine(row.id, lobbyId));

    ctx.db.GameSeat.insert({
      id: `seat_${row.id}_${humanId}`,
      tableId: row.id,
      lobbyMemberId: humanId,
      seatIndex: 0,
      chips: undefined,
      joinedAt: ctx.timestamp,
      seatState: { tag: 'active' },
    });
    for (let seatIndex = 1; seatIndex < seatCount; seatIndex += 1) {
      const botId = botClientId(row.id, seatIndex);
      const memberId = `member_${lobbyId}_${botId}`;
      ctx.db.LobbyMember.insert({
        id: memberId,
        lobbyId,
        clientId: botId,
        name: botName(seatIndex),
        connected: false,
        lastSeenAt: ctx.timestamp,
        discordUserId: '',
        discordUsername: '',
        discordGlobalName: '',
        discordDiscriminator: undefined,
        isBot: true,
        leftRoom: false,
      });
      ctx.db.GameSeat.insert({
        id: `seat_${row.id}_${memberId}`,
        tableId: row.id,
        lobbyMemberId: memberId,
        seatIndex,
        chips: undefined,
        joinedAt: ctx.timestamp,
        seatState: { tag: 'active' },
      });
    }

    const seatedNow: RulesSeat[] = [];
    for (const seat of ctx.db.GameSeat.byTable.filter(row.id)) {
      seatedNow.push(rulesSeat(seat));
    }
    const rules = rulesByType[gameType];
    let stateJson = row.stateJson;
    let status: ReturnType<typeof storedStatus> = row.status;
    if (
      rules &&
      stateIfLobbyReady(stateJson, seatedNow.length, row.minPlayers) === 'deal'
    ) {
      const next = rules.initialState(
        seatedNow,
        rulesTable({ ...row, status }),
      );
      stateJson = storedState(next);
      status = storedStatus(
        tableStatusTag(gameType, next, currentStatusTag(row.status.tag)),
      );
    }
    ctx.db.GameTable.id.update({
      ...row,
      stateJson,
      status,
      lastActivityAt: ctx.timestamp,
    });
    rememberTable(ctx.db, sender, lobbyId, row.id);
    noteLobbyActivity(ctx, lobbyId);
    queueBotTurns(ctx, row.id);
  },
);

function ensureWallet(
  ctx: ModuleCtx,
  lobbyId: string,
  clientId: string,
  name: string,
): void {
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  if (!lobby || lobby.solo) return;
  const id = `member_${lobbyId}_${clientId}`;
  const identity = ctx.sender.toHexString();
  let owner = ctx.db.WalletOwner.id.find(id);
  if (!owner) {
    const legacy = [...ctx.db.OperatorSession.iter()].find(
      (session) => session.lobbyId === lobbyId && session.clientId === clientId,
    );
    if (legacy)
      owner = ctx.db.WalletOwner.insert({ id, identity: legacy.identity });
  }
  if (owner && owner.identity !== identity)
    throw new SenderError('This player belongs to another browser session');
  if (!owner) {
    for (const existing of ctx.db.WalletOwner.iter()) {
      if (
        existing.identity === identity &&
        ctx.db.RoomWallet.id.find(existing.id)?.lobbyId === lobbyId
      )
        throw new SenderError(
          'Use this browser’s existing player id in this room',
        );
    }
    ctx.db.WalletOwner.insert({ id, identity });
  }
  const wallet = ctx.db.RoomWallet.id.find(id);
  if (wallet) {
    ctx.db.RoomWallet.id.update({ ...wallet, name });
    return;
  }
  const grant = coinUnits(lobby.startingCoins);
  ctx.db.RoomWallet.insert({
    id,
    lobbyId,
    clientId,
    name,
    available: grant,
    granted: grant,
    profit: 0n,
  });
  ctx.db.WalletLedger.insert({
    id: `grant:${id}`,
    walletId: id,
    tableId: '',
    kind: 'grant',
    amount: grant,
    profit: 0n,
    createdAt: ctx.timestamp,
  });
}

function requireWalletOwner(ctx: ModuleCtx, walletId: string): void {
  if (
    ctx.db.WalletOwner.id.find(walletId)?.identity !== ctx.sender.toHexString()
  )
    throw new SenderError('You can only use your own chips');
}

function walletChange(
  ctx: ModuleCtx,
  walletId: string,
  id: string,
  tableId: string,
  kind: string,
  amount: bigint,
  profit = 0n,
): void {
  if (ctx.db.WalletLedger.id.find(id)) return;
  const wallet = ctx.db.RoomWallet.id.find(walletId);
  if (!wallet || wallet.available + amount < 0n)
    throw new SenderError('Not enough room chips');
  ctx.db.RoomWallet.id.update({
    ...wallet,
    available: wallet.available + amount,
    profit: wallet.profit + profit,
    granted: wallet.granted + (kind === 'refill' ? amount : 0n),
  });
  ctx.db.WalletLedger.insert({
    id,
    walletId,
    tableId,
    kind,
    amount,
    profit,
    createdAt: ctx.timestamp,
  });
}

function reserveFunding(
  ctx: ModuleCtx,
  tableId: string,
  memberId: string,
  seatIndex: number,
  buyIn?: number,
): void {
  const table = ctx.db.GameTable.id.find(tableId);
  if (!table?.economyJson) return;
  requireWalletOwner(ctx, memberId);
  const settings = JSON.parse(table.economyJson) as TableEconomy;
  const casino = casinoGame(table.gameType);
  const amount = casino
    ? validCoins(buyIn, settings.minBuyIn)
    : settings.entryFee;
  if (casino && (amount < settings.minBuyIn || amount > settings.maxBuyIn))
    throw new SenderError('Buy-in is outside this table’s limits');
  const id = `seat_${tableId}_${memberId}`;
  if (ctx.db.TableFunding.id.find(id))
    throw new SenderError('Funds already reserved');
  const units = coinUnits(amount);
  walletChange(
    ctx,
    memberId,
    `reserve:${id}:${ctx.timestamp.microsSinceUnixEpoch}`,
    tableId,
    'reserve',
    -units,
  );
  ctx.db.TableFunding.insert({
    id,
    tableId,
    walletId: memberId,
    seatIndex,
    units,
    committed: table.status.tag !== 'waiting_for_players',
    cpu: false,
    leaving: false,
  });
}

function releaseFunding(ctx: ModuleCtx, seatId: string): void {
  const funding = ctx.db.TableFunding.id.find(seatId);
  if (!funding) return;
  walletChange(
    ctx,
    funding.walletId,
    `release:${seatId}:${ctx.timestamp.microsSinceUnixEpoch}`,
    funding.tableId,
    'cashout',
    funding.units,
  );
  ctx.db.TableFunding.id.delete(seatId);
}

function fundedRulesSeats(ctx: ModuleCtx, tableId: string): RulesSeat[] {
  return [...ctx.db.GameSeat.byTable.filter(tableId)].map((seat) => {
    const funding = ctx.db.TableFunding.id.find(seat.id);
    return {
      ...rulesSeat(seat),
      chips: funding ? Number(funding.units) / 2 : (seat.chips ?? null),
    };
  });
}

function startTable(ctx: ModuleCtx, tableId: string): void {
  const table = ctx.db.GameTable.id.find(tableId);
  if (!table || table.status.tag !== 'waiting_for_players')
    throw new SenderError('Game already started');
  const players = fundedRulesSeats(ctx, tableId);
  if (players.length < table.minPlayers)
    throw new SenderError('Not enough players');
  if (
    players.some(
      (seat) =>
        !ctx.db.LobbyMember.id.find(seat.lobbyMemberId)?.connected ||
        seat.seatState === 'disconnected',
    )
  )
    throw new SenderError('Waiting for players to return');
  const rules = rulesByType[table.gameType];
  if (!rules) throw new SenderError('Game rules not found');
  for (const funding of ctx.db.TableFunding.tableId.filter(tableId))
    ctx.db.TableFunding.id.update({ ...funding, committed: true });
  const next = rules.initialState(players, rulesTable(table));
  ctx.db.GameTable.id.update({
    ...table,
    handNumber: 1,
    startsAt: undefined,
    stateJson: storedState(next),
    status: { tag: 'in_progress' },
    lastActivityAt: ctx.timestamp,
  });
  appendLobbyChat(ctx, table.lobbyId, '', `${table.name} is starting.`);
  noteLobbyActivity(ctx, table.lobbyId);
  settleEconomy(ctx, tableId, next);
  queueTableBeat(ctx, tableId);
}

function settleEconomy(ctx: ModuleCtx, tableId: string, after: unknown): void {
  const table = ctx.db.GameTable.id.find(tableId);
  if (
    !table?.economyJson ||
    typeof after !== 'object' ||
    after === null ||
    !('phase' in after) ||
    after.phase !== 'finished'
  )
    return;
  const id = `${tableId}:${table.handNumber}`;
  if (ctx.db.GameSettlement.id.find(id)) return;
  const fundings = [...ctx.db.TableFunding.tableId.filter(tableId)];
  if (fundings.length === 0) return;
  const summary: {
    name: string;
    profit: string;
    seatIndex: number;
    walletId: string;
    won?: boolean;
    refunded?: boolean;
  }[] = [];
  const casino = casinoGame(table.gameType);
  if (casino) {
    const state = after as unknown as {
      seats: Record<string, { chips: number }>;
    };
    for (const funding of fundings) {
      const chips = state.seats[String(funding.seatIndex)]?.chips;
      if (chips === undefined) continue; // A newcomer is waiting for the next hand.
      const units = coinUnits(chips);
      const profit = units - funding.units;
      walletChange(
        ctx,
        funding.walletId,
        `${id}:${funding.id}`,
        tableId,
        table.gameType === 'blackjack' ? 'house_hand' : 'poker_hand',
        0n,
        profit,
      );
      ctx.db.TableFunding.id.update({ ...funding, units });
      summary.push({
        seatIndex: funding.seatIndex,
        walletId: funding.walletId,
        name: ctx.db.RoomWallet.id.find(funding.walletId)?.name ?? 'Player',
        profit: profit.toString(),
      });
    }
  } else {
    const winners = paidGameWinners(
      table.gameType,
      after,
      fundings.map((row) => row.seatIndex),
    );
    const pool = fundings.reduce((sum, row) => sum + row.units, 0n);
    const prizes = winners.length ? splitPool(pool, winners) : null;
    for (const funding of fundings) {
      const award = prizes
        ? (prizes.get(funding.seatIndex) ?? 0n)
        : funding.units;
      const profit = award - funding.units;
      walletChange(
        ctx,
        funding.walletId,
        `${id}:${funding.id}`,
        tableId,
        prizes ? 'prize' : 'refund',
        award,
        profit,
      );
      summary.push({
        seatIndex: funding.seatIndex,
        walletId: funding.walletId,
        name: ctx.db.RoomWallet.id.find(funding.walletId)?.name ?? 'Player',
        profit: profit.toString(),
        won: winners.includes(funding.seatIndex),
        refunded: prizes === null,
      });
      // Keep a watcher so the result remains visible after the paid seat is released.
      const spectatorId = spectatorRowId(tableId, funding.walletId);
      if (
        ctx.db.LobbyMember.id.find(funding.walletId)?.leftRoom === false &&
        !ctx.db.Spectator.id.find(spectatorId)
      )
        ctx.db.Spectator.insert({
          id: spectatorId,
          tableId,
          lobbyMemberId: funding.walletId,
          joinedAt: ctx.timestamp,
        });
      ctx.db.GameSeat.id.delete(funding.id);
      ctx.db.SeatAbsence.id.delete(funding.id);
      ctx.db.TableFunding.id.delete(funding.id);
      if (ctx.db.LobbyMember.id.find(funding.walletId)?.leftRoom)
        ctx.db.LobbyMember.id.delete(funding.walletId);
    }
  }
  if (casino) {
    for (const funding of ctx.db.TableFunding.tableId.filter(tableId)) {
      const seat = ctx.db.GameSeat.id.find(funding.id);
      const member = seat
        ? ctx.db.LobbyMember.id.find(seat.lobbyMemberId)
        : null;
      if (
        funding.leaving ||
        !member?.connected ||
        (table.gameType !== POKER_GAME_TYPE && funding.units === 0n)
      ) {
        if (member?.connected && !member.leftRoom) {
          const id = spectatorRowId(tableId, member.id);
          if (!ctx.db.Spectator.id.find(id))
            ctx.db.Spectator.insert({
              id,
              tableId,
              lobbyMemberId: member.id,
              joinedAt: ctx.timestamp,
            });
        }
        releaseFunding(ctx, funding.id);
        ctx.db.GameSeat.id.delete(funding.id);
        ctx.db.SeatAbsence.id.delete(funding.id);
        if (member?.leftRoom) ctx.db.LobbyMember.id.delete(member.id);
      }
    }
    if (
      table.gameType === POKER_GAME_TYPE &&
      !closeFinishedPokerSession(ctx, tableId)
    )
      ctx.db.GameTable.id.update({ ...table, status: { tag: 'in_progress' } });
  }
  ctx.db.GameSettlement.insert({
    id,
    lobbyId: table.lobbyId,
    tableId,
    handNumber: table.handNumber,
    summaryJson: JSON.stringify(summary),
    createdAt: ctx.timestamp,
  });
}

/** A settled poker session needs two retained seats, including players choosing to top up. */
function closeFinishedPokerSession(ctx: ModuleCtx, tableId: string): boolean {
  const table = ctx.db.GameTable.id.find(tableId);
  if (!table?.economyJson || table.gameType !== POKER_GAME_TYPE) return false;
  if (JSON.parse(table.stateJson).phase !== 'finished') return false;
  const fundings = [...ctx.db.TableFunding.tableId.filter(tableId)];
  if (fundings.length >= 2) return false;
  for (const funding of fundings) {
    const member = ctx.db.LobbyMember.id.find(funding.walletId);
    if (member?.connected && !member.leftRoom) {
      const id = spectatorRowId(tableId, member.id);
      if (!ctx.db.Spectator.id.find(id))
        ctx.db.Spectator.insert({
          id,
          tableId,
          lobbyMemberId: member.id,
          joinedAt: ctx.timestamp,
        });
    }
    releaseFunding(ctx, funding.id);
    ctx.db.GameSeat.id.delete(funding.id);
    ctx.db.SeatAbsence.id.delete(funding.id);
  }
  ctx.db.GameTable.id.update({
    ...table,
    status: { tag: 'finished' },
    startsAt: undefined,
  });
  return true;
}

export const refill_room_coins = spacetimedb.reducer(
  { name: 'refill_room_coins' },
  { lobbyId: t.string(), clientId: t.string() },
  (ctx, { lobbyId, clientId }) => {
    const id = `member_${lobbyId}_${clientId}`;
    requireWalletOwner(ctx, id);
    const lobby = ctx.db.Lobby.id.find(lobbyId);
    const wallet = ctx.db.RoomWallet.id.find(id);
    if (!lobby || lobby.status.tag !== 'open' || !wallet)
      throw new SenderError('Room not found');
    if ([...ctx.db.TableFunding.iter()].some((row) => row.walletId === id))
      throw new SenderError('Cash out or finish your current game first');
    const costs = [...ctx.db.GameTable.byLobby.filter(lobbyId)]
      .filter((row) => row.economyJson && row.status.tag !== 'finished')
      .map((row) => {
        const settings = JSON.parse(row.economyJson) as TableEconomy;
        return casinoGame(row.gameType) ? settings.minBuyIn : settings.entryFee;
      });
    const threshold = coinUnits(costs.length ? Math.min(...costs) : 20);
    const grant = coinUnits(lobby.startingCoins);
    if (wallet.available >= threshold || wallet.available >= grant)
      throw new SenderError(
        'Refill is only available when you cannot afford a table',
      );
    walletChange(
      ctx,
      id,
      `refill:${id}:${ctx.timestamp.microsSinceUnixEpoch}`,
      '',
      'refill',
      grant - wallet.available,
    );
    noteLobbyActivity(ctx, lobbyId);
  },
);

export const top_up_table = spacetimedb.reducer(
  { name: 'top_up_table' },
  { tableId: t.string(), amount: t.u32() },
  (ctx, { tableId, amount }) => {
    const table = ctx.db.GameTable.id.find(tableId);
    if (!table?.economyJson || !casinoGame(table.gameType))
      throw new SenderError('Not a casino table');
    if (table.status.tag === 'finished' && table.gameType === POKER_GAME_TYPE)
      throw new SenderError('Game already ended');
    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    const walletId = `member_${table.lobbyId}_${session?.clientId ?? ''}`;
    requireWalletOwner(ctx, walletId);
    const funding = [...ctx.db.TableFunding.tableId.filter(tableId)].find(
      (row) => row.walletId === walletId,
    );
    if (!funding) throw new SenderError('Not seated');
    const state = JSON.parse(table.stateJson);
    if (state.phase !== 'finished' && state.phase !== 'lobby')
      throw new SenderError('Top up between hands');
    const settings = JSON.parse(table.economyJson) as TableEconomy;
    const units = coinUnits(validCoins(amount, settings.minBuyIn));
    if (
      funding.units + units > coinUnits(settings.maxBuyIn) ||
      funding.units + units < coinUnits(settings.minBuyIn)
    )
      throw new SenderError('Top-up is outside the buy-in limits');
    walletChange(
      ctx,
      walletId,
      `topup:${funding.id}:${ctx.timestamp.microsSinceUnixEpoch}`,
      tableId,
      'topup',
      -units,
    );
    ctx.db.TableFunding.id.update({ ...funding, units: funding.units + units });
    if (state.seats?.[String(funding.seatIndex)]) {
      state.seats[String(funding.seatIndex)].chips =
        Number(funding.units + units) / 2;
      ctx.db.GameTable.id.update({ ...table, stateJson: storedState(state) });
    }
    queueTableBeat(ctx, tableId);
  },
);

function sweepTableHosting(ctx: ModuleCtx): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const original of ctx.db.GameTable.iter()) {
    if (original.status.tag === 'finished' && !casinoGame(original.gameType))
      continue;
    let table = original;
    let seats = [...ctx.db.GameSeat.byTable.filter(table.id)];
    if (table.status.tag === 'waiting_for_players') {
      for (const seat of seats) {
        const member = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
        if (
          member &&
          !member.connected &&
          now >= member.lastSeenAt.microsSinceUnixEpoch + 60_000_000n
        ) {
          releaseFunding(ctx, seat.id);
          ctx.db.GameSeat.id.delete(seat.id);
        }
      }
      seats = [...ctx.db.GameSeat.byTable.filter(table.id)];
    }
    if (!table.hostMemberId && !table.economyJson && seats.length) {
      seats.sort((a, b) =>
        a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch
          ? -1
          : a.joinedAt.microsSinceUnixEpoch > b.joinedAt.microsSinceUnixEpoch
            ? 1
            : a.id.localeCompare(b.id),
      );
      table = { ...table, hostMemberId: seats[0].lobbyMemberId };
    }
    if (!table.hostMemberId) continue;
    const eligible = seats.filter((seat) => {
      const member = ctx.db.LobbyMember.id.find(seat.lobbyMemberId);
      return (
        member?.connected &&
        !member.isBot &&
        seat.seatState?.tag !== 'disconnected'
      );
    });
    if (eligible.some((seat) => seat.lobbyMemberId === table.hostMemberId)) {
      table = { ...table, hostAwaySince: undefined };
    } else if (table.hostAwaySince === undefined) {
      table = { ...table, hostAwaySince: now };
    } else if (now >= table.hostAwaySince + 60_000_000n && eligible.length) {
      const index = Math.floor(ctx.random() * eligible.length);
      table = {
        ...table,
        hostMemberId: eligible[index].lobbyMemberId,
        hostAwaySince: undefined,
      };
      appendLobbyChat(
        ctx,
        table.lobbyId,
        '',
        `${ctx.db.LobbyMember.id.find(table.hostMemberId)?.name ?? 'A player'} now hosts ${table.name}.`,
      );
    }
    const full =
      table.status.tag === 'waiting_for_players' &&
      seats.length === table.maxPlayers &&
      eligible.length === seats.length;
    if (full && table.startsAt === undefined) {
      table = { ...table, startsAt: now + 10_000_000n };
      appendLobbyChat(
        ctx,
        table.lobbyId,
        '',
        `${table.name} starts in 10 seconds.`,
      );
    } else if (
      table.status.tag === 'waiting_for_players' &&
      !full &&
      table.startsAt !== undefined
    ) {
      table = { ...table, startsAt: undefined };
      appendLobbyChat(
        ctx,
        table.lobbyId,
        '',
        `${table.name} countdown cancelled; waiting for players.`,
      );
    }
    ctx.db.GameTable.id.update(table);
    if (full && table.startsAt !== undefined && now >= table.startsAt)
      startTable(ctx, table.id);
  }
}

/** Blackjack uses the same between-hand review pause as poker. */
function advanceCasinoTables(ctx: ModuleCtx): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const table of ctx.db.GameTable.iter()) {
    if (
      table.gameType !== 'blackjack' ||
      !table.economyJson ||
      table.handNumber === 0
    )
      continue;
    const state = JSON.parse(table.stateJson);
    if (state.phase !== 'finished') continue;
    const settings = JSON.parse(table.economyJson) as TableEconomy;
    for (const funding of ctx.db.TableFunding.tableId.filter(table.id)) {
      const member = ctx.db.LobbyMember.id.find(funding.walletId);
      if (
        funding.leaving ||
        !member?.connected ||
        member.leftRoom ||
        funding.units < coinUnits(settings.minBet)
      ) {
        releaseFunding(ctx, funding.id);
        ctx.db.GameSeat.id.delete(funding.id);
      }
    }
    const players = fundedRulesSeats(ctx, table.id);
    if (!players.length) continue;
    if (table.startsAt === undefined) {
      ctx.db.GameTable.id.update({ ...table, startsAt: now + 10_000_000n });
      continue;
    }
    if (now < table.startsAt) continue;
    const next = blackjackRules.initialState(players, rulesTable(table));
    ctx.db.GameTable.id.update({
      ...table,
      handNumber: table.handNumber + 1,
      startsAt: undefined,
      stateJson: storedState(next),
      status: { tag: 'in_progress' },
      lastActivityAt: ctx.timestamp,
    });
  }
}

export const record_discord_leaderboard = spacetimedb.reducer(
  { name: 'record_discord_leaderboard' },
  { lobbyId: t.string(), messageId: t.string(), revision: t.string() },
  (ctx, { lobbyId, messageId, revision }) => {
    const lobby = ctx.db.Lobby.id.find(lobbyId);
    if (
      !lobby?.discordChannelId ||
      (lobby.creatorIdentity &&
        lobby.creatorIdentity !== ctx.sender.toHexString())
    )
      throw new SenderError(
        'Only this room’s Discord operator can record delivery',
      );
    if (
      !DISCORD_CHANNEL_ID.test(messageId) ||
      ctx.db.GameSettlement.id.find(revision)?.lobbyId !== lobbyId
    )
      throw new SenderError('Invalid leaderboard delivery');
    const row = { lobbyId, messageId, revision };
    if (ctx.db.DiscordLeaderboard.lobbyId.find(lobbyId))
      ctx.db.DiscordLeaderboard.lobbyId.update(row);
    else ctx.db.DiscordLeaderboard.insert(row);
  },
);

/** Called only by the operator who archived the legacy schema; replay is rejected. */
export const restore_legacy_tables = spacetimedb.reducer(
  { name: 'restore_legacy_tables' },
  (ctx) => {
    const upgrade = ctx.db.RoomUpgrade.id.find('room-economy');
    if (
      !upgrade ||
      upgrade.ownerIdentity !== ctx.sender.toHexString() ||
      upgrade.phase !== 'archived'
    )
      throw new SenderError('No authorized room migration is pending');
    for (const backup of ctx.db.TableBackup.iter()) {
      const old = JSON.parse(backup.payloadJson) as {
        id: string;
        lobbyId: string;
        gameType: string;
        name: string;
        status: TableStatusTag;
        minPlayers: number;
        maxPlayers: number;
        stateJson: string;
        createdAt: string;
        lastActivityAt: string | null;
        discordVoiceChannelId: string;
      };
      const seats = [...ctx.db.GameSeat.byTable.filter(old.id)].sort((a, b) =>
        a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch
          ? -1
          : a.joinedAt.microsSinceUnixEpoch > b.joinedAt.microsSinceUnixEpoch
            ? 1
            : a.id.localeCompare(b.id),
      );
      ctx.db.GameTable.insert({
        id: old.id,
        lobbyId: old.lobbyId,
        gameType: old.gameType,
        name: old.name,
        status: storedStatus(old.status),
        minPlayers: old.minPlayers,
        maxPlayers: old.maxPlayers,
        stateJson: old.stateJson,
        createdAt: new Timestamp(BigInt(old.createdAt)),
        lastActivityAt: old.lastActivityAt
          ? new Timestamp(BigInt(old.lastActivityAt))
          : undefined,
        discordVoiceChannelId: old.discordVoiceChannelId,
        economyJson: '',
        hostMemberId: seats[0]?.lobbyMemberId ?? '',
        hostAwaySince: undefined,
        startsAt: undefined,
        handNumber: 0,
      });
      ctx.db.TableBackup.id.delete(backup.id);
      queueTableBeat(ctx, old.id);
    }
    // Preserve the prior session's ownership before any browser can claim its public client id.
    for (const session of ctx.db.OperatorSession.iter()) {
      if (!session.lobbyId || !session.clientId) continue;
      const id = `member_${session.lobbyId}_${session.clientId}`;
      if (!ctx.db.WalletOwner.id.find(id))
        ctx.db.WalletOwner.insert({ id, identity: session.identity });
    }
    ctx.db.RoomUpgrade.id.update({ ...upgrade, phase: 'restored' });
  },
);

function validCoins(value: unknown, fallback: number): number {
  try {
    return coinSetting(value, fallback);
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : 'Invalid chips',
    );
  }
}
function validTableEconomy(
  gameType: string,
  settings: Partial<TableEconomy>,
): TableEconomy {
  try {
    return tableEconomy(gameType, settings);
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : 'Invalid table stakes',
    );
  }
}

/** No wager exists yet: return the buy-in rather than having a CPU gamble it. */
function cashOutUnbetBlackjack(
  ctx: ModuleCtx,
  tableId: string,
  seatId: string,
): boolean {
  const table = ctx.db.GameTable.id.find(tableId);
  const seat = ctx.db.GameSeat.id.find(seatId);
  if (!table || !seat || table.gameType !== 'blackjack') return false;
  const state = JSON.parse(table.stateJson);
  if (
    state.phase !== 'play' ||
    state.step !== 'bet' ||
    state.seats[String(seat.seatIndex)]?.bet !== 0
  )
    return false;
  releaseFunding(ctx, seat.id);
  ctx.db.GameSeat.id.delete(seat.id);
  ctx.db.SeatAbsence.id.delete(seat.id);
  const next = blackjackRules.onPlayerLeave(state, rulesSeat(seat));
  ctx.db.GameTable.id.update({
    ...table,
    stateJson: storedState(next),
    status: storedStatus(
      tableStatusTag('blackjack', next, currentStatusTag(table.status.tag)),
    ),
    lastActivityAt: ctx.timestamp,
  });
  settleEconomy(ctx, tableId, next);
  return true;
}

function casinoLimits(ctx: ModuleCtx, lobbyId: string) {
  return ctx.db.CasinoRoomTier.lobbyId.find(lobbyId)?.tier === 'pro'
    ? ROOM_TIERS.pro
    : ROOM_TIERS.free;
}

function checkCasinoAdmission(
  ctx: ModuleCtx,
  lobby: { id: string; solo: boolean },
  clientId: string,
): void {
  if (lobby.solo) return;
  const reserved = new Set<string>();
  for (const row of ctx.db.LobbyMember.lobbyId.filter(lobby.id)) {
    if (row.connected && !row.leftRoom && !row.isBot) reserved.add(row.id);
  }
  for (const game of ctx.db.GameTable.byLobby.filter(lobby.id)) {
    for (const seat of ctx.db.GameSeat.byTable.filter(game.id)) {
      if (!ctx.db.LobbyMember.id.find(seat.lobbyMemberId)?.isBot)
        reserved.add(seat.lobbyMemberId);
    }
  }
  const member = firstRow(
    ctx.db.LobbyMember.byLobbyAndClient.filter([lobby.id, clientId]),
  );
  if (
    !reserved.has(member?.id ?? '') &&
    reserved.size >= casinoLimits(ctx, lobby.id).players
  )
    throw new SenderError('Room is full');
}

function casinoOperator(ctx: ModuleCtx, role: 'admin' | 'discord'): void {
  const entry = ctx.db.CasinoOperator.identity.find(ctx.sender.toHexString());
  if (entry?.role !== role && entry?.role !== 'admin')
    throw new SenderError('Casino operator required');
}

export const set_casino_room_tier = spacetimedb.reducer(
  { name: 'set_casino_room_tier' },
  { lobbyId: t.string(), tier: t.string() },
  (ctx, { lobbyId, tier }) => {
    casinoOperator(ctx, 'admin');
    if (!ctx.db.Lobby.id.find(lobbyId) || (tier !== 'free' && tier !== 'pro'))
      throw new SenderError('Invalid room tier');
    const row = { lobbyId, tier };
    if (ctx.db.CasinoRoomTier.lobbyId.find(lobbyId))
      ctx.db.CasinoRoomTier.lobbyId.update(row);
    else ctx.db.CasinoRoomTier.insert(row);
  },
);

function assignCasinoSpot(
  ctx: ModuleCtx,
  lobbyId: string,
  tableId: string,
): number {
  const prior = ctx.db.CasinoTableSpot.id.find(tableId);
  if (prior) return prior.slot;
  const slot = nextFloorSlot(
    [...ctx.db.CasinoTableSpot.lobbyId.filter(lobbyId)].map((row) => row.slot),
  );
  ctx.db.CasinoTableSpot.insert({ id: tableId, lobbyId, slot });
  return slot;
}

function casinoMember(ctx: ModuleCtx, lobbyId: string) {
  const session = ctx.db.OperatorSession.identity.find(
    ctx.sender.toHexString(),
  );
  const lobby = ctx.db.Lobby.id.find(lobbyId);
  const member =
    session?.lobbyId === lobbyId
      ? firstRow(
          ctx.db.LobbyMember.byLobbyAndClient.filter([
            lobbyId,
            session.clientId,
          ]),
        )
      : undefined;
  if (
    !member ||
    member.leftRoom ||
    !member.connected ||
    lobby?.status.tag !== 'open' ||
    lobby.solo
  )
    throw new SenderError('Join this casino first');
  return { member, session };
}

function casinoPosition(ctx: ModuleCtx, memberId: string, lobbyId: string) {
  const previous = ctx.db.CasinoPresence.id.find(memberId);
  if (previous) return previous;
  const occupied = new Set<string>();
  for (const row of ctx.db.CasinoPresence.lobbyId.filter(lobbyId)) {
    const member = ctx.db.LobbyMember.id.find(row.id);
    if (!member?.connected || member.leftRoom) continue;
    const point = casinoCurrentPoint(row, ctx.timestamp.microsSinceUnixEpoch);
    occupied.add(`${point.x}:${point.y}`);
  }
  // Space newcomers out along the central aisle. Existing players can still cross paths.
  const aisle = [
    SPAWN,
    ...Array.from({ length: 60 }, (_, i) => ({
      x: 11 + (i % 10),
      y: 5 + Math.floor(i / 10),
    })),
  ];
  const spawn =
    aisle.find(
      (point) =>
        !occupied.has(`${point.x}:${point.y}`) && walkable(point, floorRows(0)),
    ) ?? SPAWN;
  return {
    id: memberId,
    lobbyId,
    ...spawn,
    pathJson: '[]',
    startedAt: ctx.timestamp,
    chair: -1,
    avatar: '',
  };
}

function storeCasinoPosition(
  ctx: ModuleCtx,
  row: ReturnType<typeof casinoPosition>,
): void {
  if (ctx.db.CasinoPresence.id.find(row.id))
    ctx.db.CasinoPresence.id.update(row);
  else ctx.db.CasinoPresence.insert(row);
}

function releaseCasinoChair(ctx: ModuleCtx, memberId: string): void {
  const row = ctx.db.CasinoPresence.id.find(memberId);
  if (row && row.chair >= 0)
    ctx.db.CasinoPresence.id.update({ ...row, chair: -1 });
}

function parkCasinoAvatar(
  ctx: ModuleCtx,
  memberId: string,
  tableId: string,
): void {
  const spot = ctx.db.CasinoTableSpot.id.find(tableId);
  if (!spot) return;
  const row = casinoPosition(ctx, memberId, spot.lobbyId);
  storeCasinoPosition(ctx, {
    ...row,
    ...tableEntrance(spot.slot),
    chair: -1,
    pathJson: '[]',
    startedAt: ctx.timestamp,
  });
}

function casinoCurrentPoint(
  row: ReturnType<typeof casinoPosition>,
  now: bigint,
): FloorPoint {
  const path = JSON.parse(row.pathJson) as FloorPoint[];
  const step = Math.floor(
    Number(now - row.startedAt.microsSinceUnixEpoch) / (FLOOR_STEP_MS * 1000),
  );
  return step > 0 ? (path[Math.min(path.length, step) - 1] ?? row) : row;
}

export const enter_casino_floor = spacetimedb.reducer(
  { name: 'enter_casino_floor' },
  { lobbyId: t.string() },
  (ctx, { lobbyId }) => {
    const { member } = casinoMember(ctx, lobbyId);
    for (const game of ctx.db.GameTable.byLobby.filter(lobbyId))
      assignCasinoSpot(ctx, lobbyId, game.id);
    const linked = ctx.db.CasinoDiscordIdentity.identity.find(
      ctx.sender.toHexString(),
    );
    const row = casinoPosition(ctx, member.id, lobbyId);
    storeCasinoPosition(ctx, {
      ...row,
      avatar:
        (linked &&
          ctx.db.CasinoAvatarProfile.discordUserId.find(linked.discordUserId)
            ?.avatar) ||
        row.avatar,
    });
    if (linked)
      publishCasinoDiscordMember(ctx, member.id, lobbyId, linked.discordUserId);
  },
);

export const move_casino_avatar = spacetimedb.reducer(
  { name: 'move_casino_avatar' },
  { lobbyId: t.string(), x: t.i32(), y: t.i32(), chair: t.i32() },
  (ctx, { lobbyId, x, y, chair }) => {
    const { member, session } = casinoMember(ctx, lobbyId);
    if (session?.tableId)
      throw new SenderError('Return to the floor before walking');
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const previous = casinoPosition(ctx, member.id, lobbyId);
    const slots = new Set(
      [...ctx.db.CasinoTableSpot.lobbyId.filter(lobbyId)].map(
        (row) => row.slot,
      ),
    );
    const from = casinoCurrentPoint(previous, now);
    const rows = Math.max(
      floorRows(Math.max(-1, ...slots) + 1),
      floorRowsAt(from.y),
    );
    if (
      chair < -1 ||
      (chair >= 0 &&
        (LOUNGE_CHAIRS[chair]?.x !== x || LOUNGE_CHAIRS[chair]?.y !== y))
    )
      throw new SenderError('Choose a lounge chair');
    if (chair >= 0) {
      if (from.x !== x || from.y !== y)
        throw new SenderError('Walk to the chair first');
      for (const row of ctx.db.CasinoPresence.lobbyId.filter(lobbyId)) {
        const owner = ctx.db.LobbyMember.id.find(row.id);
        if (
          row.id !== member.id &&
          row.chair === chair &&
          owner?.connected &&
          !owner.leftRoom
        )
          throw new SenderError('That chair is occupied');
      }
    }
    const walk = redirectFloorWalk(
      {
        ...previous,
        path: JSON.parse(previous.pathJson),
        started: Number(previous.startedAt.microsSinceUnixEpoch) / 1000,
      },
      Number(now) / 1000,
      (start) => {
        const path = floorPath(
          start,
          { x, y },
          Math.max(rows, floorRowsAt(start.y)),
          slots,
        );
        if (!path.length && (start.x !== x || start.y !== y))
          throw new SenderError('That spot cannot be reached');
        return path;
      },
    );
    if (chair >= 0 && walk.path.length)
      throw new SenderError('Walk to the chair first');
    storeCasinoPosition(ctx, {
      ...previous,
      x: walk.x,
      y: walk.y,
      chair,
      startedAt: new Timestamp(BigInt(Math.round(walk.started * 1000))),
      pathJson: JSON.stringify(walk.path),
    });
  },
);

export const steer_casino_avatar = spacetimedb.reducer(
  { name: 'steer_casino_avatar' },
  { lobbyId: t.string(), dx: t.i32(), dy: t.i32() },
  (ctx, { lobbyId, dx, dy }) => {
    const { member, session } = casinoMember(ctx, lobbyId);
    if (session?.tableId)
      throw new SenderError('Return to the floor before walking');
    if (Math.abs(dx) + Math.abs(dy) > 1)
      throw new SenderError('Choose a walking direction');

    const previous = casinoPosition(ctx, member.id, lobbyId);
    const slots = new Set(
      [...ctx.db.CasinoTableSpot.lobbyId.filter(lobbyId)].map(
        (row) => row.slot,
      ),
    );
    const rows = floorRows(Math.max(-1, ...slots) + 1);
    const walk = redirectFloorWalk(
      {
        ...previous,
        path: JSON.parse(previous.pathJson),
        started: Number(previous.startedAt.microsSinceUnixEpoch) / 1000,
      },
      Number(ctx.timestamp.microsSinceUnixEpoch) / 1000,
      (from) =>
        floorDirectionPath(
          from,
          { x: dx, y: dy },
          Math.max(rows, floorRowsAt(from.y)),
          slots,
          FLOOR_STEER_STEPS,
        ),
    );
    if (!walk.path.length && previous.pathJson === '[]') return;
    const pathJson = JSON.stringify(walk.path);
    const startedAt = new Timestamp(BigInt(Math.round(walk.started * 1000)));
    if (
      pathJson === previous.pathJson &&
      startedAt.microsSinceUnixEpoch === previous.startedAt.microsSinceUnixEpoch
    )
      return;
    storeCasinoPosition(ctx, {
      ...previous,
      x: walk.x,
      y: walk.y,
      pathJson,
      startedAt,
      chair: -1,
    });
  },
);

export const step_casino_avatar = spacetimedb.reducer(
  { name: 'step_casino_avatar' },
  { lobbyId: t.string(), dx: t.i32(), dy: t.i32() },
  (ctx, { lobbyId, dx, dy }) => {
    const { member, session } = casinoMember(ctx, lobbyId);
    if (session?.tableId)
      throw new SenderError('Return to the floor before walking');
    if (Math.abs(dx) + Math.abs(dy) !== 1)
      throw new SenderError('Choose a walking direction');

    const previous = casinoPosition(ctx, member.id, lobbyId);
    const path = JSON.parse(previous.pathJson) as FloorPoint[];
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const stepMicros = BigInt(FLOOR_STEP_MS * 1000);
    const elapsed = now - previous.startedAt.microsSinceUnixEpoch;
    const completed = elapsed > 0n ? Number(elapsed / stepMicros) : 0;
    const from =
      completed > 0
        ? (path[Math.min(path.length, completed) - 1] ?? previous)
        : previous;
    const currentStep = path[completed];
    const next = currentStep ?? from;
    const end = { x: next.x + dx, y: next.y + dy };
    const slots = new Set(
      [...ctx.db.CasinoTableSpot.lobbyId.filter(lobbyId)].map(
        (row) => row.slot,
      ),
    );
    const rows = Math.max(
      floorRows(Math.max(-1, ...slots) + 1),
      floorRowsAt(next.y),
    );

    // Preserve the in-flight step and its original timing. Keep at most
    // one step queued so releasing the keys cannot start a long walk.
    const route = currentStep ? [currentStep] : [];
    if (floorStepAllowed(next, end, rows, slots)) route.push(end);
    if (!route.length) return;
    const pathJson = JSON.stringify(route);
    const startedAt = currentStep
      ? new Timestamp(
          previous.startedAt.microsSinceUnixEpoch +
            BigInt(completed) * stepMicros,
        )
      : ctx.timestamp;
    if (
      pathJson === previous.pathJson &&
      startedAt.microsSinceUnixEpoch ===
        previous.startedAt.microsSinceUnixEpoch &&
      previous.chair === -1
    )
      return;
    storeCasinoPosition(ctx, {
      ...previous,
      x: from.x,
      y: from.y,
      chair: -1,
      pathJson,
      startedAt,
    });
  },
);

export const save_casino_avatar = spacetimedb.reducer(
  { name: 'save_casino_avatar' },
  { lobbyId: t.string(), avatar: t.string() },
  (ctx, { lobbyId, avatar }) => {
    const appearance = readCasinoAvatar(avatar);
    if (!appearance) throw new SenderError('Invalid avatar appearance');
    const canonical = JSON.stringify(appearance);
    if (lobbyId) {
      const { member } = casinoMember(ctx, lobbyId);
      storeCasinoPosition(ctx, {
        ...casinoPosition(ctx, member.id, lobbyId),
        avatar: canonical,
      });
    }
    const linked = ctx.db.CasinoDiscordIdentity.identity.find(
      ctx.sender.toHexString(),
    );
    if (linked) {
      const row = { discordUserId: linked.discordUserId, avatar: canonical };
      if (ctx.db.CasinoAvatarProfile.discordUserId.find(row.discordUserId))
        ctx.db.CasinoAvatarProfile.discordUserId.update(row);
      else ctx.db.CasinoAvatarProfile.insert(row);
    }
  },
);

function publishCasinoDiscordMember(
  ctx: ModuleCtx,
  id: string,
  lobbyId: string,
  discordUserId: string,
): void {
  const row = { id, lobbyId, discordUserId };
  if (ctx.db.CasinoDiscordMember.id.find(id))
    ctx.db.CasinoDiscordMember.id.update(row);
  else ctx.db.CasinoDiscordMember.insert(row);
  const member = ctx.db.LobbyMember.id.find(id);
  if (member && member.discordUserId !== discordUserId)
    ctx.db.LobbyMember.id.update({ ...member, discordUserId });
}

export const begin_casino_discord_link = spacetimedb.reducer(
  { name: 'begin_casino_discord_link' },
  { id: t.string() },
  (ctx, { id }) => {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new SenderError('Invalid verification request');
    const identity = ctx.sender.toHexString();
    const previous = ctx.db.CasinoDiscordChallenge.identity.find(identity);
    if (previous) ctx.db.CasinoDiscordChallenge.id.delete(previous.id);
    ctx.db.CasinoDiscordChallenge.insert({
      id,
      identity,
      expiresAt: ctx.timestamp.microsSinceUnixEpoch + 300_000_000n,
    });
  },
);

export const complete_casino_discord_link = spacetimedb.reducer(
  { name: 'complete_casino_discord_link' },
  { id: t.string(), discordUserId: t.string() },
  (ctx, { id, discordUserId }) => {
    casinoOperator(ctx, 'discord');
    const grant = ctx.db.CasinoDiscordChallenge.id.find(id);
    if (
      !grant ||
      ctx.timestamp.microsSinceUnixEpoch > grant.expiresAt ||
      !DISCORD_CHANNEL_ID.test(discordUserId)
    )
      throw new SenderError('Verification expired');
    ctx.db.CasinoDiscordChallenge.id.delete(id);
    const linked = { identity: grant.identity, discordUserId };
    const prior = ctx.db.CasinoDiscordIdentity.identity.find(grant.identity);
    if (prior && prior.discordUserId !== discordUserId)
      throw new SenderError(
        'This browser already has a linked Discord account',
      );
    if (!prior) ctx.db.CasinoDiscordIdentity.insert(linked);
    const session = ctx.db.OperatorSession.identity.find(grant.identity);
    if (!session?.lobbyId) return;
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([
        session.lobbyId,
        session.clientId,
      ]),
    );
    if (!member || member.leftRoom) return;
    publishCasinoDiscordMember(ctx, member.id, member.lobbyId, discordUserId);
    const profile =
      ctx.db.CasinoAvatarProfile.discordUserId.find(discordUserId);
    if (profile)
      storeCasinoPosition(ctx, {
        ...casinoPosition(ctx, member.id, member.lobbyId),
        avatar: profile.avatar,
      });
  },
);

export const my_casino_profile = spacetimedb.view(
  { name: 'my_casino_profile', public: true },
  t.array(
    t.object('CasinoSelfProfile', {
      discordUserId: t.string(),
      avatar: t.string(),
    }),
  ),
  (ctx) => {
    const linked = ctx.db.CasinoDiscordIdentity.identity.find(
      ctx.sender.toHexString(),
    );
    return linked
      ? [
          {
            discordUserId: linked.discordUserId,
            avatar:
              ctx.db.CasinoAvatarProfile.discordUserId.find(
                linked.discordUserId,
              )?.avatar ?? '',
          },
        ]
      : [];
  },
);

export const mirror_casino_discord_message = spacetimedb.reducer(
  { name: 'mirror_casino_discord_message' },
  {
    channelId: t.string(),
    messageId: t.string(),
    discordUserId: t.string(),
    author: t.string(),
    body: t.string(),
    deleted: t.bool(),
  },
  (ctx, { channelId, messageId, discordUserId, author, body, deleted }) => {
    casinoOperator(ctx, 'discord');
    if (
      !DISCORD_CHANNEL_ID.test(channelId) ||
      !DISCORD_CHANNEL_ID.test(messageId)
    )
      return;
    const scope = voicePlace(
      ctx.db.Lobby.iter(),
      ctx.db.GameTable.iter(),
      channelId,
    );
    if (!scope || ctx.db.Lobby.id.find(scope.lobbyId)?.status.tag !== 'open')
      return;
    const id = `${channelId}:${messageId}`;
    const existing = ctx.db.CasinoDiscordMessage.id.find(id);
    // Keep tombstones so a retried gateway create cannot resurrect a deleted post.
    if (existing?.deleted || (existing && existing.channelId !== channelId))
      return;
    const verified = [
      ...ctx.db.CasinoDiscordMember.lobbyId.filter(scope.lobbyId),
    ].find((row) => row.discordUserId === discordUserId);
    const row = {
      id,
      channelId,
      lobbyId: scope.lobbyId,
      tableId: scope.tableId,
      lobbyMemberId: verified?.id ?? existing?.lobbyMemberId ?? '',
      author:
        existing?.author || author.trim().slice(0, 64) || 'Discord member',
      body: deleted ? '' : body.trim().slice(0, scope.tableId ? 240 : 500),
      createdAt: existing?.createdAt ?? ctx.timestamp,
      deleted,
    };
    if (!row.body && !deleted) return;
    if (existing) ctx.db.CasinoDiscordMessage.id.update(row);
    else ctx.db.CasinoDiscordMessage.insert(row);
  },
);

export const my_casino_tables = spacetimedb.view(
  { name: 'my_casino_tables', public: true },
  t.array(
    t.object('CasinoTableSummary', {
      id: t.string(),
      lobbyId: t.string(),
      gameType: t.string(),
      name: t.string(),
      status: TableStatus,
      maxPlayers: t.u32(),
      economyJson: t.string(),
      hostMemberId: t.string(),
      startsAt: t.option(t.u64()),
      createdAt: t.timestamp(),
    }),
  ),
  (ctx) => {
    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (
      !session?.lobbyId ||
      ctx.db.Lobby.id.find(session.lobbyId)?.status.tag !== 'open'
    )
      return [];
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([
        session.lobbyId,
        session.clientId,
      ]),
    );
    if (!member || member.leftRoom) return [];
    return [...ctx.db.GameTable.byLobby.filter(session.lobbyId)].map(
      (table) => ({
        id: table.id,
        lobbyId: table.lobbyId,
        gameType: table.gameType,
        name: table.name,
        status: table.status,
        maxPlayers: table.maxPlayers,
        economyJson: table.economyJson,
        hostMemberId: table.hostMemberId,
        startsAt: table.startsAt,
        createdAt: table.createdAt,
      }),
    );
  },
);

export const my_casino_voice_targets = spacetimedb.view(
  { name: 'my_casino_voice_targets', public: true },
  t.array(
    t.object('CasinoVoiceTarget', {
      discordUserId: t.string(),
      guildId: t.string(),
      sourceChannelId: t.string(),
      targetChannelId: t.string(),
    }),
  ),
  (ctx) => {
    const operator = ctx.db.CasinoOperator.identity.find(
      ctx.sender.toHexString(),
    );
    if (operator?.role !== 'discord' && operator?.role !== 'admin') return [];
    return [...ctx.db.OperatorSession.iter()].flatMap((session) => {
      if (!session.connected || !session.lobbyId || !session.clientId)
        return [];
      const lobby = ctx.db.Lobby.id.find(session.lobbyId);
      if (
        !lobby?.discordLobbyVoiceChannelId ||
        !lobby.discordGuildId ||
        lobby.status.tag !== 'open'
      )
        return [];
      const member = firstRow(
        ctx.db.LobbyMember.byLobbyAndClient.filter([
          session.lobbyId,
          session.clientId,
        ]),
      );
      if (!member?.connected || member.leftRoom) return [];
      const verified = ctx.db.CasinoDiscordMember.id.find(member.id);
      const presence = ctx.db.VoicePresence.id.find(`presence_${member.id}`);
      if (
        !verified ||
        !presence ||
        presence.discordUserId !== verified.discordUserId
      )
        return [];
      const sourceChannelId = presence.tableId
        ? ctx.db.GameTable.id.find(presence.tableId)?.discordVoiceChannelId
        : lobby.discordLobbyVoiceChannelId;
      const target = session.tableId
        ? ctx.db.GameTable.id.find(session.tableId)
        : null;
      if (
        session.tableId &&
        (target?.lobbyId !== lobby.id || target.status.tag === 'finished')
      )
        return [];
      const targetChannelId = target
        ? target.discordVoiceChannelId
        : lobby.discordLobbyVoiceChannelId;
      if (
        !sourceChannelId ||
        !targetChannelId ||
        sourceChannelId === targetChannelId
      )
        return [];
      return [
        {
          discordUserId: verified.discordUserId,
          guildId: lobby.discordGuildId,
          sourceChannelId,
          targetChannelId,
        },
      ];
    });
  },
);

function byCasinoMessageTime(
  left: { createdAt: { microsSinceUnixEpoch: bigint }; id: string },
  right: typeof left,
): number {
  const duration = Number(
    left.createdAt.microsSinceUnixEpoch - right.createdAt.microsSinceUnixEpoch,
  );
  return duration || left.id.localeCompare(right.id);
}

const casinoVisibleDiscordMessage = t.object('CasinoVisibleDiscordMessage', {
  id: t.string(),
  lobbyMemberId: t.string(),
  author: t.string(),
  body: t.string(),
  createdAt: t.timestamp(),
});
export const my_casino_room_chat = spacetimedb.view(
  { name: 'my_casino_room_chat', public: true },
  t.array(casinoVisibleDiscordMessage),
  (ctx) => {
    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (
      !session?.lobbyId ||
      ctx.db.Lobby.id.find(session.lobbyId)?.status.tag !== 'open'
    )
      return [];
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([
        session.lobbyId,
        session.clientId,
      ]),
    );
    if (!member || member.leftRoom) return [];
    return [...ctx.db.CasinoDiscordMessage.lobbyId.filter(session.lobbyId)]
      .filter((row) => !row.deleted && row.tableId === '')
      .sort(byCasinoMessageTime)
      .slice(-100);
  },
);
export const my_casino_table_chat = spacetimedb.view(
  { name: 'my_casino_table_chat', public: true },
  t.array(casinoVisibleDiscordMessage),
  (ctx) => {
    const session = ctx.db.OperatorSession.identity.find(
      ctx.sender.toHexString(),
    );
    if (
      !session?.tableId ||
      ctx.db.Lobby.id.find(session.lobbyId)?.status.tag !== 'open'
    )
      return [];
    const member = firstRow(
      ctx.db.LobbyMember.byLobbyAndClient.filter([
        session.lobbyId,
        session.clientId,
      ]),
    );
    if (!member || member.leftRoom) return [];
    if (
      ![
        ...ctx.db.GameSeat.byTable.filter(session.tableId),
        ...ctx.db.Spectator.byTable.filter(session.tableId),
      ].some((row) => row.lobbyMemberId === member.id)
    )
      return [];
    return [...ctx.db.CasinoDiscordMessage.tableId.filter(session.tableId)]
      .filter((row) => !row.deleted)
      .sort(byCasinoMessageTime)
      .slice(-100);
  },
);
