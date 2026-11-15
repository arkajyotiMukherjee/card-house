import { describe, expect, it } from 'vitest';
import {
  applyChatKey,
  waitingHeaderLayout,
  applyChatText,
  showTableChatButton,
  tableChatButtonVisible,
  tableChatLine,
  tableChatMessagesForTable,
  tableIsSolo,
  type TableChatRow,
} from './table-chat';

describe('applyChatKey', () => {
  it('appends a printable character', () => {
    expect(applyChatKey('hi', '!', 240)).toBe('hi!');
  });

  it('backspaces the last character', () => {
    expect(applyChatKey('hi', 'Backspace', 240)).toBe('h');
  });

  it('allows punctuation that applyFieldKey rejects', () => {
    expect(applyChatKey('gg', '?', 240)).toBe('gg?');
  });

  it('drops a non-printable or multi-character key', () => {
    expect(applyChatKey('hi', 'Enter', 240)).toBe('hi');
    expect(applyChatKey('hi', 'Shift', 240)).toBe('hi');
  });

  it('stops at the max length', () => {
    expect(applyChatKey('ab', 'c', 2)).toBe('ab');
  });

  it('filters a whole pasted string the same way', () => {
    expect(applyChatText('wow!\n', 20)).toBe('wow!');
    expect(applyChatText('abcdef', 3)).toBe('abc');
  });
});

describe('tableChatMessagesForTable', () => {
  const rows: TableChatRow[] = [
    {
      id: 'c2',
      tableId: 'table_a',
      lobbyMemberId: 'm1',
      body: 'two',
      createdAtMicros: 2n,
    },
    {
      id: 'c1',
      tableId: 'table_a',
      lobbyMemberId: 'm1',
      body: 'one',
      createdAtMicros: 1n,
    },
    {
      id: 'c3',
      tableId: 'table_b',
      lobbyMemberId: 'm2',
      body: 'other table',
      createdAtMicros: 3n,
    },
  ];

  it('keeps only the one table and sorts oldest first', () => {
    const messages = tableChatMessagesForTable(rows, 'table_a');
    expect(messages.map((row) => row.body)).toEqual(['one', 'two']);
  });

  it('does not leak a message from a different table', () => {
    const messages = tableChatMessagesForTable(rows, 'table_a');
    expect(messages.some((row) => row.tableId === 'table_b')).toBe(false);
  });
});

describe('table chat button', () => {
  const tables = [
    { id: 'table_solo', lobbyId: 'lobby_solo' },
    { id: 'table_open', lobbyId: 'lobby_open' },
  ];
  const lobbies = [
    { id: 'lobby_solo', solo: true },
    { id: 'lobby_open', solo: false },
  ];

  it('hides Chat on a solo table', () => {
    expect(tableIsSolo('table_solo', tables, lobbies)).toBe(true);
    expect(showTableChatButton(true)).toBe(false);
    expect(tableChatButtonVisible('table_solo', tables, lobbies)).toBe(false);
  });

  it('keeps Chat on a multiplayer table', () => {
    expect(tableIsSolo('table_open', tables, lobbies)).toBe(false);
    expect(showTableChatButton(false)).toBe(true);
    expect(tableChatButtonVisible('table_open', tables, lobbies)).toBe(true);
  });
});

describe('tableChatLine', () => {
  const members = [
    { id: 'm1', lobbyId: 'lobby_1', clientId: 'client_1', name: 'Alice' },
    { id: 'm2', lobbyId: 'lobby_1', clientId: 'client_2', name: 'Bob' },
  ];

  it('labels the sender as You', () => {
    const row: TableChatRow = {
      id: 'c1',
      tableId: 'table_a',
      lobbyMemberId: 'm1',
      body: 'hi all',
      createdAtMicros: 1n,
    };
    expect(tableChatLine(row, members, 'm1')).toBe('You: hi all');
  });

  it('labels another member by name', () => {
    const row: TableChatRow = {
      id: 'c2',
      tableId: 'table_a',
      lobbyMemberId: 'm2',
      body: 'hey',
      createdAtMicros: 2n,
    };
    expect(tableChatLine(row, members, 'm1')).toBe('Bob: hey');
  });

  it('falls back to Player for an unknown member', () => {
    const row: TableChatRow = {
      id: 'c3',
      tableId: 'table_a',
      lobbyMemberId: 'm3',
      body: 'ghost',
      createdAtMicros: 3n,
    };
    expect(tableChatLine(row, members, 'm1')).toBe('Player: ghost');
  });
});

it('packs visible waiting-room actions together for hosts and guests', () => {
  const host = waitingHeaderLayout(true),
    guest = waitingHeaderLayout(false);
  expect(host.startX - (host.copyX + 116)).toBe(10);
  expect(host.leaveX - (host.startX + 130)).toBe(10);
  expect(guest.leaveX - (guest.copyX + 116)).toBe(10);
  expect(guest.leaveX).toBe(host.leaveX);
});
