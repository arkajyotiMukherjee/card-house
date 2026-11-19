import { NAME_MAX, normalizePlayerName, normalizeRoomCode } from './lobby';
import { DISCORD_USER_ID } from '../../src/shared/discord-player-name';

/** localStorage key for the last lobby and, while seated, its table. */
export const LAST_ROOM_STORAGE_KEY = 'lastRoom';

/** Same 32 characters as `CODE_ALPHABET` in `server/src/index.ts`. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TABLE_ID_MAX = 240;

export interface LastRoom {
  lobbyCode: string;
  name: string;
  /** Empty when the player is in the lobby and not seated. */
  tableId: string;
}

type RoomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readLastRoom(
  storage: RoomStorage = localStorage,
): LastRoom | undefined {
  const raw = storage.getItem(LAST_ROOM_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.lobbyCode !== 'string' || typeof record.name !== 'string') {
    return undefined;
  }
  const lobbyCode = normalizeRoomCode(record.lobbyCode);
  const name = normalizePlayerName(record.name);
  if (!isStoredRoomCode(lobbyCode) || !isStoredName(name)) {
    return undefined;
  }
  const tableRaw =
    typeof record.tableId === 'string' ? record.tableId.trim() : '';
  if (tableRaw.length > 0 && !isStoredTableId(tableRaw)) {
    return undefined;
  }
  return { lobbyCode, name, tableId: tableRaw };
}

/** Remembers the joined lobby. A different code drops any stored table. */
export function rememberLobby(
  lobbyCode: string,
  name: string,
  storage: RoomStorage = localStorage,
): void {
  const code = normalizeRoomCode(lobbyCode);
  const playerName = normalizePlayerName(name);
  if (!isStoredRoomCode(code) || !isStoredName(playerName)) {
    return;
  }
  const previous = readLastRoom(storage);
  const tableId = previous?.lobbyCode === code ? previous.tableId : '';
  writeLastRoom(storage, { lobbyCode: code, name: playerName, tableId });
}

/** Remembers the table this browser is seated at. No lobby means no write. */
export function rememberTable(
  tableId: string,
  storage: RoomStorage = localStorage,
): void {
  const id = tableId.trim();
  const previous = readLastRoom(storage);
  if (!previous || !isStoredTableId(id)) {
    return;
  }
  writeLastRoom(storage, { ...previous, tableId: id });
}

/** Clears the table after Leave Table. The lobby stays stored. */
export function forgetTable(storage: RoomStorage = localStorage): void {
  const previous = readLastRoom(storage);
  if (!previous || previous.tableId.length === 0) {
    return;
  }
  writeLastRoom(storage, { ...previous, tableId: '' });
}

export function clearLastRoom(storage: RoomStorage = localStorage): void {
  storage.removeItem(LAST_ROOM_STORAGE_KEY);
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.history.replaceState(null, '', '/');
  }
}

/**
 * True when `join_lobby` rejected because the stored lobby is gone.
 * The module says `Room closed`. The lobby prompt shows `Room is closed`.
 */
export function roomGoneMessage(message: string): boolean {
  return (
    message.includes('Room not found') ||
    message.includes('Room closed') ||
    message.includes('Room is closed')
  );
}

/**
 * The table to open on reload. The `GameTable` row has to still be in the
 * joined lobby, and this member needs a `GameSeat` or a `Spectator` row there.
 */
export function tableToReopen(
  tableId: string,
  tables: Iterable<{ id: string; lobbyId?: string }>,
  seats: Iterable<{ tableId: string; lobbyMemberId?: string }>,
  lobbyMemberId: string,
  lobbyId = '',
  spectators: Iterable<{ tableId: string; lobbyMemberId?: string }> = [],
): string {
  const id = tableId.trim();
  const memberId = lobbyMemberId.trim();
  if (id.length === 0 || memberId.length === 0) {
    return '';
  }
  let tableExists = false;
  for (const table of tables) {
    if (table.id !== id) {
      continue;
    }
    if (
      lobbyId.length > 0 &&
      table.lobbyId !== undefined &&
      table.lobbyId !== lobbyId
    ) {
      return '';
    }
    tableExists = true;
    break;
  }
  if (!tableExists) {
    return '';
  }
  for (const seat of seats) {
    if (seat.tableId === id && seat.lobbyMemberId === memberId) {
      return id;
    }
  }
  for (const spectator of spectators) {
    if (spectator.tableId === id && spectator.lobbyMemberId === memberId) {
      return id;
    }
  }
  return '';
}

function writeLastRoom(storage: RoomStorage, room: LastRoom): void {
  storage.setItem(LAST_ROOM_STORAGE_KEY, JSON.stringify(room));
}

function isStoredRoomCode(code: string): boolean {
  if (code.length !== 4) {
    return false;
  }
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

function isStoredName(name: string): boolean {
  if (
    name.length === 0 ||
    (name.length > NAME_MAX && !DISCORD_USER_ID.test(name))
  ) {
    return false;
  }
  for (const char of name) {
    if (char.charCodeAt(0) < 32) {
      return false;
    }
  }
  return true;
}

function isStoredTableId(tableId: string): boolean {
  if (tableId.length === 0 || tableId.length > TABLE_ID_MAX) {
    return false;
  }
  for (const char of tableId) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const upper = code >= 65 && code <= 90;
    const lower = code >= 97 && code <= 122;
    if (!digit && !upper && !lower && char !== '_') {
      return false;
    }
  }
  return true;
}
