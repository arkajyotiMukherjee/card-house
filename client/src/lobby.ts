import { bluffGameDefinition } from '../../src/shared/games/bluff';
import { crazyEightsGameDefinition } from '../../src/shared/games/crazy-eights';
import { goFishGameDefinition } from '../../src/shared/games/go-fish';
import { presidentGameDefinition } from '../../src/shared/games/president';
import { rummyGameDefinition } from '../../src/shared/games/rummy';
import { blackjackGameDefinition } from '../../src/shared/games/blackjack';
import { spadesGameDefinition } from '../../src/shared/games/spades';
import { heartsGameDefinition } from '../../src/shared/games/hearts';
import {
  POKER_GAME_TYPE,
  POKER_VARIATION_LABELS,
  POKER_VARIATIONS,
  pokerGameDefinition,
  type PokerVariation,
} from '../../src/shared/games/poker';
import type { GameDefinition } from '../../src/shared/games/game-definition';
import { PLAYER_NAME_MAX } from '../../src/shared/discord-player-name';
import { BUTTON_HEIGHT } from './button-style';
import { isMobileDevice } from './mobile-shell';

const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();

export const NAME_MAX = PLAYER_NAME_MAX;
export const CODE_MAX = 6;

export const LOBBY_PANEL = {
  nameField: { x: 16, y: 68, w: 128, h: 24 },
  codeField: { x: 16, y: 116, w: 128, h: 24 },
  createButton: { x: 16, y: 152, w: 128, h: BUTTON_HEIGHT },
  joinButton: { x: 16, y: 186, w: 128, h: BUTTON_HEIGHT },
  renameField: {
    x: 16,
    y: PHONE_LAYOUT ? 370 : 428,
    w: PHONE_LAYOUT ? 188 : 128,
    h: PHONE_LAYOUT ? 64 : 24,
  },
  saveButton: {
    x: 16,
    y: PHONE_LAYOUT ? 438 : 458,
    w: PHONE_LAYOUT ? 188 : 128,
    h: PHONE_LAYOUT ? 48 : BUTTON_HEIGHT,
  },
} as const;

export interface LobbyRow {
  id: string;
  code: string;
}

export interface MemberRow {
  id: string;
  lobbyId: string;
  clientId: string;
  name: string;
}

export interface MemberLine {
  id: string;
  name: string;
  clientId: string;
  self: boolean;
  /** The bot saw this member in the lobby voice channel. */
  inVoice: boolean;
}

export type MemberRecord = MemberRow;

export interface GameOption {
  gameType: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  howToPlay: string;
}

function catalogEntry(definition: GameDefinition): GameOption {
  return {
    gameType: definition.gameType,
    name: definition.displayName,
    minPlayers: definition.minPlayers,
    maxPlayers: definition.maxPlayers,
    howToPlay: definition.howToPlay,
  };
}

/** Games Create Table can offer. Sourced from each shared `GameDefinition`. */
export const GAME_CATALOG = [
  catalogEntry(bluffGameDefinition),
  catalogEntry(presidentGameDefinition),
  catalogEntry(goFishGameDefinition),
  catalogEntry(crazyEightsGameDefinition),
  catalogEntry(rummyGameDefinition),
  catalogEntry(blackjackGameDefinition),
  catalogEntry(spadesGameDefinition),
  catalogEntry(heartsGameDefinition),
  catalogEntry(pokerGameDefinition),
] as const satisfies readonly GameOption[];

export { POKER_GAME_TYPE, POKER_VARIATION_LABELS, POKER_VARIATIONS };
export type { PokerVariation };

export interface TableRow {
  id: string;
  lobbyId: string;
  gameType: string;
  name: string;
  statusTag: string;
  maxPlayers: number;
}

export interface SeatRef {
  tableId: string;
  lobbyMemberId?: string;
}

export interface TableLine {
  id: string;
  gameType: string;
  gameName: string;
  tableName: string;
  currentSeats: number;
  maxPlayers: number;
  statusLabel: string;
  seatsLabel: string;
  seated: boolean;
  /** This member is watching and does not hold a player seat. */
  watching: boolean;
}

export interface TableGroup {
  gameType: string;
  gameName: string;
  lines: TableLine[];
}

export type ListSlot =
  | { kind: 'header'; y: number; group: TableGroup }
  | { kind: 'row'; y: number; line: TableLine };

export interface ListLayout {
  slots: ListSlot[];
  hidden: number;
}

export const TABLE_LIST = PHONE_LAYOUT
  ? ({
      panel: { x: 624, y: 76, w: 328, h: 460 },
      create: { x: 632, y: 80, w: 312, h: 48 },
      list: { x: 632, y: 150, bottom: 464 },
      header: { h: 18, gap: 4 },
      row: { w: 312, h: 128, gap: 4 },
      more: { x: 632, y: 468 },
      error: { x: 632, y: 508 },
    } as const)
  : ({
      panel: { x: 800, y: 44, w: 152, h: 460 },
      create: { x: 808, y: 70, w: 136, h: BUTTON_HEIGHT },
      list: { x: 808, y: 108, bottom: 468 },
      header: { h: 14, gap: 4 },
      row: { w: 136, h: 72, gap: 8 },
      more: { x: 808, y: 468 },
      error: { x: 808, y: 480 },
    } as const);

/** Separate action faces with a clear gap; phone sizes are logical canvas pixels. */
export const JOIN_BUTTON = { x: 6, y: 36, w: 58, h: 28 } as const;
export const WATCH_BUTTON = { x: 72, y: 36, w: 58, h: 28 } as const;
export const MOBILE_JOIN_BUTTON = { x: 12, y: 48, w: 136, h: 72 } as const;
export const MOBILE_WATCH_BUTTON = { x: 164, y: 48, w: 136, h: 72 } as const;

export function watchHit(
  localX: number,
  localY: number,
  mobile = false,
): boolean {
  const box = mobile ? MOBILE_WATCH_BUTTON : WATCH_BUTTON;
  return (
    localX >= box.x &&
    localX < box.x + box.w &&
    localY >= box.y &&
    localY < box.y + box.h
  );
}

export const CHAT_PANEL = PHONE_LAYOUT
  ? ({
      panel: { x: 222, y: 68, w: 392, h: 436 },
      title: { x: 230, y: 76, size: 12 },
      list: { x: 230, y: 98, bottom: 426, lineH: 18 },
      field: { x: 230, y: 438, w: 268, h: 64 },
      send: { x: 506, y: 446, w: 100, h: 48 },
    } as const)
  : ({
      panel: { x: 170, y: 68, w: 620, h: 380 },
      /** Sits above the first message so the heading glyphs do not cover it. */
      title: { x: 178, y: 76, size: 8 },
      list: { x: 178, y: 88, bottom: 436, lineH: 12 },
      field: { x: 178, y: 440, w: 500, h: BUTTON_HEIGHT },
      send: { x: 686, y: 440, w: 96, h: BUTTON_HEIGHT },
    } as const);

export const CHAT_BODY_MAX = 240;

export const LEAVE_ROOM = {
  x: PHONE_LAYOUT ? 624 : 800,
  y: 8,
  w: PHONE_LAYOUT ? 328 : 152,
  h: PHONE_LAYOUT ? 48 : BUTTON_HEIGHT,
} as const;

export const LEAVE_CONFIRM = PHONE_LAYOUT
  ? ({
      panel: { x: 180, y: 150, w: 600, h: 240 },
      leave: { x: 196, y: 300, w: 272, h: 64 },
      cancel: { x: 492, y: 300, w: 272, h: 64 },
    } as const)
  : ({
      panel: { x: 230, y: 170, w: 500, h: 150 },
      leave: { x: 246, y: 268, w: 220, h: BUTTON_HEIGHT },
      cancel: { x: 486, y: 268, w: 220, h: BUTTON_HEIGHT },
    } as const);

export type LeaveConfirmHit = 'leave' | 'cancel' | 'panel';

function boxContains(
  box: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): boolean {
  return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
}

/**
 * Which control a lobby click lands on. Buttons win over the panel so a
 * click on Leave or Cancel is not treated as empty dialog chrome.
 */
export function leaveConfirmHit(
  x: number,
  y: number,
): LeaveConfirmHit | undefined {
  if (boxContains(LEAVE_CONFIRM.leave, x, y)) {
    return 'leave';
  }
  if (boxContains(LEAVE_CONFIRM.cancel, x, y)) {
    return 'cancel';
  }
  if (boxContains(LEAVE_CONFIRM.panel, x, y)) {
    return 'panel';
  }
  return undefined;
}

export interface ChatMessageRow {
  id: string;
  lobbyId: string;
  lobbyMemberId: string;
  body: string;
}

export interface ChatLine {
  id: string;
  name: string;
  body: string;
  self: boolean;
}

export function normalizeChatBody(raw: string): string {
  return raw.trim();
}

const CHAT_KEY = /^[\x20-\x7e]$/;

export function applyChatKey(value: string, key: string): string {
  if (key === 'Backspace') {
    return value.slice(0, -1);
  }
  if (key.length !== 1 || !CHAT_KEY.test(key)) {
    return value;
  }
  if (value.length >= CHAT_BODY_MAX) {
    return value;
  }
  return value + key;
}

/** Messages for one lobby, oldest first (ids sort in send order), newest `limit` kept. */
export function chatLines(
  messages: Iterable<ChatMessageRow>,
  members: Iterable<MemberRecord>,
  lobbyId: string,
  selfClientId: string,
  limit = 200,
): ChatLine[] {
  const names = new Map<string, { name: string; clientId: string }>();
  for (const member of members) {
    names.set(member.id, { name: member.name, clientId: member.clientId });
  }
  const rows: ChatMessageRow[] = [];
  for (const message of messages) {
    if (message.lobbyId === lobbyId) {
      rows.push(message);
    }
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const kept = rows.slice(Math.max(0, rows.length - limit));
  return kept.map((message) => {
    const member = names.get(message.lobbyMemberId);
    return {
      id: message.id,
      name: member?.name ?? 'Unknown',
      body: message.body,
      self: member?.clientId === selfClientId,
    };
  });
}

export const ROOM_BANNER = {
  panel: { x: 380, y: 6, w: 200, h: 54 },
  title: { size: 8, y: 12 },
  code: { size: 24, y: 28 },
} as const;

export const DISCORD_BADGE = {
  label: 'Launched from Discord',
  size: 8,
  padX: 8,
  h: 16,
  y: ROOM_BANNER.panel.y + ROOM_BANNER.panel.h + 6,
} as const;

export interface LobbyDiscordRow {
  id: string;
  discordChannelId: string;
}

/** True when `/cardhouse create` stored a Discord channel on this lobby. */
export function lobbyLaunchedFromDiscord(
  lobbies: Iterable<LobbyDiscordRow>,
  lobbyId: string,
): boolean {
  for (const lobby of lobbies) {
    if (lobby.id === lobbyId) {
      return lobby.discordChannelId.trim().length > 0;
    }
  }
  return false;
}

export function discordBadgeBox(): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const w =
    DISCORD_BADGE.label.length * DISCORD_BADGE.size + DISCORD_BADGE.padX * 2;
  const banner = ROOM_BANNER.panel;
  return {
    x: banner.x + Math.floor((banner.w - w) / 2),
    y: DISCORD_BADGE.y,
    w,
    h: DISCORD_BADGE.h,
  };
}

export const CREATE_TABLE = {
  panel: { x: 188, y: 140, w: 440, h: 250 },
  prev: { x: 204, y: 220, w: 72, h: BUTTON_HEIGHT },
  next: { x: 284, y: 220, w: 72, h: BUTTON_HEIGHT },
  minus: { x: 420, y: 220, w: 40, h: BUTTON_HEIGHT },
  plus: { x: 468, y: 220, w: 40, h: BUTTON_HEIGHT },
  varPrev: { x: 204, y: 268, w: 72, h: BUTTON_HEIGHT },
  varNext: { x: 284, y: 268, w: 72, h: BUTTON_HEIGHT },
  create: { x: 204, y: 328, w: 160, h: BUTTON_HEIGHT },
  cancel: { x: 376, y: 328, w: 160, h: BUTTON_HEIGHT },
} as const;

/** Wide landscape dialog with separate thumb-sized selectors. */
export const MOBILE_CREATE_TABLE = {
  panel: { x: 160, y: 32, w: 640, h: 476 },
  prev: { x: 184, y: 108, w: 80, h: 64 },
  next: { x: 696, y: 108, w: 80, h: 64 },
  minus: { x: 184, y: 208, w: 80, h: 64 },
  plus: { x: 696, y: 208, w: 80, h: 64 },
  varPrev: { x: 184, y: 308, w: 80, h: 64 },
  varNext: { x: 696, y: 308, w: 80, h: 64 },
  create: { x: 184, y: 416, w: 280, h: 64 },
  cancel: { x: 496, y: 416, w: 280, h: 64 },
} as const;

export function normalizePlayerName(raw: string): string {
  return raw.trim();
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function applyFieldKey(
  value: string,
  key: string,
  maxLength: number,
): string {
  if (key === 'Backspace') {
    return value.slice(0, -1);
  }
  if (key.length !== 1 || !/[a-zA-Z0-9 ]/.test(key)) {
    return value;
  }
  if (value.length >= maxLength) {
    return value;
  }
  return value + key;
}

/** Whole-string form of `applyFieldKey`, for a paste or a mobile input event. */
export function applyFieldText(value: string, maxLength: number): string {
  let next = '';
  for (const char of value) {
    next = applyFieldKey(next, char, maxLength);
  }
  return next;
}

export function applyCodeKey(value: string, key: string): string {
  if (key === ' ') {
    return value;
  }
  return applyFieldKey(value, key, CODE_MAX).toUpperCase();
}

/** Whole-string form of `applyCodeKey`. */
export function applyCodeText(value: string): string {
  let next = '';
  for (const char of value) {
    next = applyCodeKey(next, char);
  }
  return next;
}

/** Whole-string form of lobby `applyChatKey`. */
export function applyChatText(value: string): string {
  let next = '';
  for (const char of value) {
    next = applyChatKey(next, char);
  }
  return next;
}

export function lobbyByCode<T extends LobbyRow>(
  lobbies: Iterable<T>,
  rawCode: string,
): T | undefined {
  const code = normalizeRoomCode(rawCode);
  if (code.length === 0) {
    return undefined;
  }
  for (const lobby of lobbies) {
    if (lobby.code === code) {
      return lobby;
    }
  }
  return undefined;
}

export function findCreatedLobby<T extends LobbyRow>(
  lobbies: Iterable<T>,
  knownIds: ReadonlySet<string>,
  senderHex: string,
): T | undefined {
  const fresh: T[] = [];
  for (const lobby of lobbies) {
    if (!knownIds.has(lobby.id)) {
      fresh.push(lobby);
    }
  }
  const prefix = senderHex.length > 0 ? `lobby_${senderHex}_` : '';
  const owned =
    prefix.length > 0
      ? fresh.filter((lobby) => lobby.id.startsWith(prefix))
      : [];
  const pool = owned.length > 0 ? owned : fresh.length === 1 ? fresh : [];
  let match: T | undefined;
  for (const lobby of pool) {
    if (!match || lobby.id > match.id) {
      match = lobby;
    }
  }
  return match;
}

export function memberLines(
  members: Iterable<MemberRecord>,
  lobbyId: string,
  selfClientId: string,
  inVoice: ReadonlySet<string> = new Set(),
): MemberLine[] {
  const lines: MemberLine[] = [];
  for (const member of members) {
    if (member.lobbyId !== lobbyId) {
      continue;
    }
    lines.push({
      id: member.id,
      name: member.name,
      clientId: member.clientId,
      self: member.clientId === selfClientId,
      inVoice: inVoice.has(member.id),
    });
  }
  lines.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.clientId.localeCompare(b.clientId);
  });
  return lines;
}

export function gameOption(index: number): GameOption {
  const count = GAME_CATALOG.length;
  const wrapped = ((index % count) + count) % count;
  const game = GAME_CATALOG[wrapped];
  if (!game) {
    return GAME_CATALOG[0];
  }
  return game;
}

export function gameDisplayName(gameType: string): string {
  for (const game of GAME_CATALOG) {
    if (game.gameType === gameType) {
      return game.name;
    }
  }
  return gameType;
}

export function clampPlayerCount(game: GameOption, value: number): number {
  if (value < game.minPlayers) {
    return game.minPlayers;
  }
  if (value > game.maxPlayers) {
    return game.maxPlayers;
  }
  return value;
}

export function tableSettingsJson(
  minPlayers: number,
  maxPlayers: number,
  name?: string,
  variation?: string,
): string {
  const settings: Record<string, string | number> = {};
  if (name && name.length > 0) {
    settings.name = name;
  }
  settings.minPlayers = minPlayers;
  settings.maxPlayers = maxPlayers;
  if (variation && variation.length > 0) {
    settings.variation = variation;
  }
  return JSON.stringify(settings);
}

export function tableStatusLabel(tag: string): string {
  if (tag === 'waiting_for_players' || tag === 'WaitingForPlayers') {
    return 'Waiting';
  }
  if (tag === 'in_progress' || tag === 'InProgress') {
    return 'In Progress';
  }
  if (tag === 'finished' || tag === 'Finished') {
    return 'Finished';
  }
  return tag;
}

export function seatsLabel(currentSeats: number, maxPlayers: number): string {
  return `${currentSeats}/${maxPlayers}`;
}

export function memberByClient(
  members: Iterable<MemberRecord>,
  lobbyId: string,
  clientId: string,
): MemberRecord | undefined {
  for (const member of members) {
    if (member.lobbyId === lobbyId && member.clientId === clientId) {
      return member;
    }
  }
  return undefined;
}

export function nextTableName(
  tables: Iterable<TableRow>,
  lobbyId: string,
  game: GameOption,
): string {
  let sameType = 0;
  for (const table of tables) {
    if (table.lobbyId === lobbyId && table.gameType === game.gameType) {
      sameType += 1;
    }
  }
  return `${game.name} #${sameType + 1}`;
}

export function seatedTableIds(
  seats: Iterable<SeatRef>,
  lobbyMemberId: string,
): Set<string> {
  const ids = new Set<string>();
  if (lobbyMemberId.length === 0) {
    return ids;
  }
  for (const seat of seats) {
    if (seat.lobbyMemberId === lobbyMemberId) {
      ids.add(seat.tableId);
    }
  }
  return ids;
}

export function watchingTableIds(
  spectators: Iterable<SeatRef>,
  lobbyMemberId: string,
): Set<string> {
  return seatedTableIds(spectators, lobbyMemberId);
}

export function tableLines(
  tables: Iterable<TableRow>,
  seats: Iterable<SeatRef>,
  lobbyId: string,
  seatedIds: ReadonlySet<string> = new Set(),
  watchingIds: ReadonlySet<string> = new Set(),
): TableLine[] {
  const counts = new Map<string, number>();
  for (const seat of seats) {
    counts.set(seat.tableId, (counts.get(seat.tableId) ?? 0) + 1);
  }
  const lines: TableLine[] = [];
  for (const table of tables) {
    if (table.lobbyId !== lobbyId) {
      continue;
    }
    const currentSeats = counts.get(table.id) ?? 0;
    const seated = seatedIds.has(table.id);
    lines.push({
      id: table.id,
      gameType: table.gameType,
      gameName: gameDisplayName(table.gameType),
      tableName: table.name,
      currentSeats,
      maxPlayers: table.maxPlayers,
      statusLabel: tableStatusLabel(table.statusTag),
      seatsLabel: seatsLabel(currentSeats, table.maxPlayers),
      seated,
      watching: !seated && watchingIds.has(table.id),
    });
  }
  lines.sort((a, b) => {
    const byName = a.tableName.localeCompare(b.tableName);
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });
  return lines;
}

function catalogRank(gameType: string): number {
  const index = GAME_CATALOG.findIndex((game) => game.gameType === gameType);
  return index < 0 ? GAME_CATALOG.length : index;
}

/** One group per game type: catalog games first, then the rest by name. */
export function tableGroups(lines: Iterable<TableLine>): TableGroup[] {
  const byType = new Map<string, TableGroup>();
  for (const line of lines) {
    const group = byType.get(line.gameType);
    if (group) {
      group.lines.push(line);
    } else {
      byType.set(line.gameType, {
        gameType: line.gameType,
        gameName: line.gameName,
        lines: [line],
      });
    }
  }
  const groups = [...byType.values()];
  groups.sort((a, b) => {
    const byRank = catalogRank(a.gameType) - catalogRank(b.gameType);
    if (byRank !== 0) {
      return byRank;
    }
    const byName = a.gameName.localeCompare(b.gameName);
    if (byName !== 0) {
      return byName;
    }
    return a.gameType.localeCompare(b.gameType);
  });
  for (const group of groups) {
    group.lines.sort((a, b) => {
      const byName = a.tableName.localeCompare(b.tableName);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
  }
  return groups;
}

/** Stacks group headers and rows from the list top. Rows that would run past `bottom` are counted in `hidden`. */
export function listLayout(
  groups: readonly TableGroup[],
  mobile = false,
): ListLayout {
  const { header } = TABLE_LIST;
  const list = mobile
    ? { ...TABLE_LIST.list, y: 150, bottom: 464 }
    : TABLE_LIST.list;
  const row = mobile ? { ...TABLE_LIST.row, h: 128 } : TABLE_LIST.row;
  const slots: ListSlot[] = [];
  let y: number = list.y;
  let hidden = 0;
  for (const group of groups) {
    const room = y + header.h + header.gap + row.h <= list.bottom;
    if (!room) {
      hidden += group.lines.length;
      continue;
    }
    slots.push({ kind: 'header', y, group });
    y += header.h + header.gap;
    for (const line of group.lines) {
      if (y + row.h > list.bottom) {
        hidden += 1;
        continue;
      }
      slots.push({ kind: 'row', y, line });
      y += row.h + row.gap;
    }
    y += header.gap;
  }
  return { slots, hidden };
}

export function lobbyTableQueries(
  lobbyId: string,
): [string, string, string, string] {
  const id = `'${lobbyId.replaceAll("'", "''")}'`;
  return [
    `SELECT * FROM "GameTable" WHERE "lobbyId" = ${id}`,
    `SELECT "GameSeat".* FROM "GameTable" JOIN "GameSeat" ON "GameSeat"."tableId" = "GameTable"."id" WHERE "GameTable"."lobbyId" = ${id}`,
    `SELECT "Spectator".* FROM "GameTable" JOIN "Spectator" ON "Spectator"."tableId" = "GameTable"."id" WHERE "GameTable"."lobbyId" = ${id}`,
    `SELECT * FROM "LobbyChatMessage" WHERE "lobbyId" = ${id}`,
  ];
}
