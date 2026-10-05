import {
  DUMMY_GAME_TYPE,
  dummyGameDefinition,
} from '../../src/shared/games/dummy-counter';

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
}

export const GAME_CATALOG = [
  { gameType: 'bluff', name: 'Bluff', minPlayers: 2, maxPlayers: 8 },
  { gameType: 'president', name: 'President', minPlayers: 3, maxPlayers: 8 },
  {
    gameType: 'crazy_eights',
    name: 'Crazy Eights',
    minPlayers: 2,
    maxPlayers: 6,
  },
  { gameType: 'poker_holdem', name: "Hold'em", minPlayers: 2, maxPlayers: 8 },
  {
    gameType: 'poker_five_card_draw',
    name: 'Five-Card Draw',
    minPlayers: 2,
    maxPlayers: 6,
  },
  { gameType: 'blackjack', name: 'Blackjack', minPlayers: 1, maxPlayers: 5 },
  { gameType: 'hearts', name: 'Hearts', minPlayers: 4, maxPlayers: 4 },
  { gameType: 'spades', name: 'Spades', minPlayers: 4, maxPlayers: 4 },
  { gameType: 'rummy', name: 'Rummy', minPlayers: 2, maxPlayers: 6 },
  { gameType: 'go_fish', name: 'Go Fish', minPlayers: 2, maxPlayers: 6 },
  {
    gameType: DUMMY_GAME_TYPE,
    name: dummyGameDefinition.displayName,
    minPlayers: dummyGameDefinition.minPlayers,
    maxPlayers: dummyGameDefinition.maxPlayers,
  },
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
}

export interface TableLine {
  id: string;
  gameName: string;
  tableName: string;
  currentSeats: number;
  maxPlayers: number;
  statusLabel: string;
  seatsLabel: string;
}

export const TABLE_LIST = {
  panel: { x: 800, y: 44, w: 152, h: 460 },
  create: { x: 808, y: 70, w: 136, h: 26 },
  row: { x: 808, y: 104, w: 136, h: 42, gap: 4 },
  error: { x: 808, y: 480 },
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

export function tableLines(
  tables: Iterable<TableRow>,
  seats: Iterable<SeatRef>,
  lobbyId: string,
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
      gameName: gameDisplayName(table.gameType),
      tableName: table.name,
      currentSeats,
      maxPlayers: table.maxPlayers,
      statusLabel: tableStatusLabel(table.statusTag),
      seatsLabel: seatsLabel(currentSeats, table.maxPlayers),
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

export function lobbyTableQueries(lobbyId: string): [string, string] {
  const id = `'${lobbyId.replaceAll("'", "''")}'`;
  return [
    `SELECT * FROM "GameTable" WHERE "lobbyId" = ${id}`,
    `SELECT "GameSeat".* FROM "GameTable" JOIN "GameSeat" ON "GameSeat"."tableId" = "GameTable"."id" WHERE "GameTable"."lobbyId" = ${id}`,
  ];
}
