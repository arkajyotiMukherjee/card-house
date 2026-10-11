import { bluffGameDefinition } from '../../src/shared/games/bluff';
import { goFishGameDefinition } from '../../src/shared/games/go-fish';
import { presidentGameDefinition } from '../../src/shared/games/president';
import type { GameDefinition } from '../../src/shared/games/game-definition';

export const NAME_MAX = 12;
export const CODE_MAX = 6;

export const LOBBY_PANEL = {
  nameField: { x: 16, y: 68, w: 128, h: 24 },
  codeField: { x: 16, y: 116, w: 128, h: 24 },
  createButton: { x: 16, y: 152, w: 128, h: 26 },
  joinButton: { x: 16, y: 186, w: 128, h: 26 },
} as const;

export interface LobbyRow {
  id: string;
  code: string;
}

export interface MemberRow {
  lobbyId: string;
  clientId: string;
  name: string;
}

export interface MemberLine {
  name: string;
  clientId: string;
  self: boolean;
}

export interface MemberRecord extends MemberRow {
  id: string;
}

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
] as const satisfies readonly GameOption[];

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

export const TABLE_LIST = {
  panel: { x: 800, y: 44, w: 152, h: 460 },
  create: { x: 808, y: 70, w: 136, h: 26 },
  list: { x: 808, y: 108, bottom: 468 },
  header: { h: 14, gap: 4 },
  row: { w: 136, h: 30, gap: 4 },
  more: { x: 808, y: 468 },
  error: { x: 808, y: 484 },
} as const;

export const ROOM_BANNER = {
  panel: { x: 380, y: 6, w: 200, h: 54 },
  title: { size: 8, y: 12 },
  code: { size: 24, y: 28 },
} as const;

export const CREATE_TABLE = {
  panel: { x: 188, y: 140, w: 440, h: 210 },
  prev: { x: 204, y: 220, w: 72, h: 26 },
  next: { x: 284, y: 220, w: 72, h: 26 },
  minus: { x: 420, y: 220, w: 40, h: 26 },
  plus: { x: 468, y: 220, w: 40, h: 26 },
  create: { x: 204, y: 292, w: 160, h: 28 },
  cancel: { x: 376, y: 292, w: 160, h: 28 },
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

export function applyCodeKey(value: string, key: string): string {
  if (key === ' ') {
    return value;
  }
  return applyFieldKey(value, key, CODE_MAX).toUpperCase();
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
  members: Iterable<MemberRow>,
  lobbyId: string,
  selfClientId: string,
): MemberLine[] {
  const lines: MemberLine[] = [];
  for (const member of members) {
    if (member.lobbyId !== lobbyId) {
      continue;
    }
    lines.push({
      name: member.name,
      clientId: member.clientId,
      self: member.clientId === selfClientId,
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
): string {
  if (name && name.length > 0) {
    return JSON.stringify({ name, minPlayers, maxPlayers });
  }
  return JSON.stringify({ minPlayers, maxPlayers });
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

export function tableLines(
  tables: Iterable<TableRow>,
  seats: Iterable<SeatRef>,
  lobbyId: string,
  seatedIds: ReadonlySet<string> = new Set(),
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
    lines.push({
      id: table.id,
      gameType: table.gameType,
      gameName: gameDisplayName(table.gameType),
      tableName: table.name,
      currentSeats,
      maxPlayers: table.maxPlayers,
      statusLabel: tableStatusLabel(table.statusTag),
      seatsLabel: seatsLabel(currentSeats, table.maxPlayers),
      seated: seatedIds.has(table.id),
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
export function listLayout(groups: readonly TableGroup[]): ListLayout {
  const { list, header, row } = TABLE_LIST;
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

export function lobbyTableQueries(lobbyId: string): [string, string] {
  const id = `'${lobbyId.replaceAll("'", "''")}'`;
  return [
    `SELECT * FROM "GameTable" WHERE "lobbyId" = ${id}`,
    `SELECT "GameSeat".* FROM "GameTable" JOIN "GameSeat" ON "GameSeat"."tableId" = "GameTable"."id" WHERE "GameTable"."lobbyId" = ${id}`,
  ];
}
