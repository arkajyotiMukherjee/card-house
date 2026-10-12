import { describe, expect, it } from 'vitest';
import {
  LAST_ROOM_STORAGE_KEY,
  clearLastRoom,
  forgetTable,
  readLastRoom,
  rememberLobby,
  rememberTable,
  roomGoneMessage,
  tableToReopen,
} from './last-room';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe('last room', () => {
  it('stores the lobby without a table', () => {
    const storage = memoryStorage();
    rememberLobby('ab3d', 'Ada', storage);
    expect(readLastRoom(storage)).toEqual({
      lobbyCode: 'AB3D',
      name: 'Ada',
      tableId: '',
    });
    expect(storage.getItem(LAST_ROOM_STORAGE_KEY)).toContain('AB3D');
  });

  it('keeps the table when the same lobby is joined again', () => {
    const storage = memoryStorage();
    rememberLobby('AB3D', 'Ada', storage);
    rememberTable('table_lobby_1', storage);
    rememberLobby('ab3d', 'Bea', storage);
    expect(readLastRoom(storage)).toEqual({
      lobbyCode: 'AB3D',
      name: 'Bea',
      tableId: 'table_lobby_1',
    });
  });

  it('drops the table when a different lobby is joined', () => {
    const storage = memoryStorage();
    rememberLobby('AB3D', 'Ada', storage);
    rememberTable('table_lobby_1', storage);
    rememberLobby('WXYZ', 'Ada', storage);
    expect(readLastRoom(storage)?.tableId).toBe('');
    expect(readLastRoom(storage)?.lobbyCode).toBe('WXYZ');
  });

  it('clears only the table after leaving the seat', () => {
    const storage = memoryStorage();
    rememberLobby('AB3D', 'Ada', storage);
    rememberTable('table_lobby_1', storage);
    forgetTable(storage);
    expect(readLastRoom(storage)).toEqual({
      lobbyCode: 'AB3D',
      name: 'Ada',
      tableId: '',
    });
  });

  it('does not store a table before a lobby', () => {
    const storage = memoryStorage();
    rememberTable('table_lobby_1', storage);
    expect(readLastRoom(storage)).toBeUndefined();
  });

  it('ignores a bad room code, an empty name, and broken json', () => {
    const storage = memoryStorage();
    rememberLobby('IO10', 'Ada', storage);
    rememberLobby('AB3D', '   ', storage);
    expect(readLastRoom(storage)).toBeUndefined();
    storage.setItem(LAST_ROOM_STORAGE_KEY, '{');
    expect(readLastRoom(storage)).toBeUndefined();
    storage.setItem(
      LAST_ROOM_STORAGE_KEY,
      JSON.stringify({ lobbyCode: 'AB3D', name: 'Ada', tableId: 'bad id' }),
    );
    expect(readLastRoom(storage)).toBeUndefined();
  });

  it('removes the stored room', () => {
    const storage = memoryStorage();
    rememberLobby('AB3D', 'Ada', storage);
    clearLastRoom(storage);
    expect(readLastRoom(storage)).toBeUndefined();
  });
});

describe('roomGoneMessage', () => {
  it('matches a missing or closed room', () => {
    expect(roomGoneMessage('Room not found')).toBe(true);
    expect(roomGoneMessage('Room closed')).toBe(true);
    expect(roomGoneMessage('Name is required')).toBe(false);
  });
});

describe('tableToReopen', () => {
  const tables = [
    { id: 'table_a', lobbyId: 'lobby_1' },
    { id: 'table_b', lobbyId: 'lobby_2' },
  ];
  const seats = [
    { tableId: 'table_a', lobbyMemberId: 'member_me' },
    { tableId: 'table_b', lobbyMemberId: 'member_me' },
  ];

  it('returns the table when the seat and the table are still in the lobby', () => {
    expect(
      tableToReopen('table_a', tables, seats, 'member_me', 'lobby_1'),
    ).toBe('table_a');
  });

  it('returns empty when the seat, the table, or the lobby does not match', () => {
    expect(tableToReopen('table_a', tables, [], 'member_me', 'lobby_1')).toBe(
      '',
    );
    expect(
      tableToReopen('table_missing', tables, seats, 'member_me', 'lobby_1'),
    ).toBe('');
    expect(
      tableToReopen('table_a', tables, seats, 'member_other', 'lobby_1'),
    ).toBe('');
    expect(
      tableToReopen('table_b', tables, seats, 'member_me', 'lobby_1'),
    ).toBe('');
    expect(tableToReopen('', tables, seats, 'member_me', 'lobby_1')).toBe('');
  });
});
