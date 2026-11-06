import type { MemberRef } from './game-scene';

/** Matches the server's `TABLE_CHAT_BODY_MAX` in `server/src/table-chat.ts`. */
export const TABLE_CHAT_BODY_MAX = 240;

export interface TableChatRow {
  id: string;
  tableId: string;
  lobbyMemberId: string;
  body: string;
  createdAtMicros: bigint;
}

/** Printable ASCII, so chat allows punctuation that `applyFieldKey` does not. */
export function applyChatKey(
  value: string,
  key: string,
  maxLength: number,
): string {
  if (key === 'Backspace') {
    return value.slice(0, -1);
  }
  if (key.length !== 1 || !/^[ -~]$/.test(key)) {
    return value;
  }
  if (value.length >= maxLength) {
    return value;
  }
  return value + key;
}

/** Whole-string form of `applyChatKey`, for a paste or a mobile input event. */
export function applyChatText(
  value: string,
  maxLength = TABLE_CHAT_BODY_MAX,
): string {
  let next = '';
  for (const char of value) {
    next = applyChatKey(next, char, maxLength);
  }
  return next;
}

/** Only this table's rows, oldest first. */
export function tableChatMessagesForTable(
  rows: Iterable<TableChatRow>,
  tableId: string,
): TableChatRow[] {
  const matches: TableChatRow[] = [];
  for (const row of rows) {
    if (row.tableId === tableId) {
      matches.push(row);
    }
  }
  matches.sort((a, b) => {
    if (a.createdAtMicros !== b.createdAtMicros) {
      return a.createdAtMicros < b.createdAtMicros ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return matches;
}

function memberName(
  members: Iterable<MemberRef>,
  lobbyMemberId: string,
): string {
  for (const member of members) {
    if (member.id === lobbyMemberId) {
      return member.name;
    }
  }
  return 'Player';
}

export interface ChatTableRef {
  id: string;
  lobbyId: string;
}

export interface ChatLobbyRef {
  id: string;
  solo: boolean;
}

/** True when this table belongs to a single-player lobby. */
export function tableIsSolo(
  tableId: string,
  tables: Iterable<ChatTableRef>,
  lobbies: Iterable<ChatLobbyRef>,
): boolean {
  const id = tableId.trim();
  if (id.length === 0) {
    return false;
  }
  let lobbyId = '';
  for (const table of tables) {
    if (table.id === id) {
      lobbyId = table.lobbyId;
      break;
    }
  }
  if (lobbyId.length === 0) {
    return false;
  }
  for (const lobby of lobbies) {
    if (lobby.id === lobbyId) {
      return lobby.solo;
    }
  }
  return false;
}

/** A solo table has no one else to talk to. A shared table keeps Chat. */
export function showTableChatButton(solo: boolean): boolean {
  return !solo;
}

/** Whether the table chrome draws the Chat control for this table. */
export function tableChatButtonVisible(
  tableId: string,
  tables: Iterable<ChatTableRef>,
  lobbies: Iterable<ChatLobbyRef>,
): boolean {
  return showTableChatButton(tableIsSolo(tableId, tables, lobbies));
}

/** `"You: hi"` for the sender, `"Name: hi"` for everyone else at that table. */
export function tableChatLine(
  row: TableChatRow,
  members: Iterable<MemberRef>,
  selfLobbyMemberId: string,
): string {
  if (!row.lobbyMemberId) return row.body;
  const who =
    row.lobbyMemberId === selfLobbyMemberId
      ? 'You'
      : memberName(members, row.lobbyMemberId);
  return `${who}: ${row.body}`;
}
