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

/** `"You: hi"` for the sender, `"Name: hi"` for everyone else at that table. */
export function tableChatLine(
  row: TableChatRow,
  members: Iterable<MemberRef>,
  selfLobbyMemberId: string,
): string {
  const who =
    row.lobbyMemberId === selfLobbyMemberId
      ? 'You'
      : memberName(members, row.lobbyMemberId);
  return `${who}: ${row.body}`;
}
