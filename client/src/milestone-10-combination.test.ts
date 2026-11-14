import { describe, expect, it } from 'vitest';
import {
  DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  lobbyIsIdle,
} from '../../server/src/lobby-idle';
import { shouldRemoveEmptyTable } from '../../server/src/table-cleanup';
import { joinFailureMessage } from './join-errors';
import {
  clearLastRoom,
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

describe('milestone 10 together', () => {
  it('keeps a player out of an idle-closed lobby and leaves an occupied table', () => {
    const timeout = DEV_LOBBY_IDLE_TIMEOUT_MICROS;
    expect(lobbyIsIdle(0n, timeout, timeout)).toBe(true);

    const shown = joinFailureMessage(
      new Error('Room closed'),
      'Could not join',
    );
    expect(shown).toBe('Room is closed. Get a new code.');

    const storage = memoryStorage();
    rememberLobby('AB3D', 'Ada', storage);
    rememberTable('table_lobby_1', storage);
    expect(roomGoneMessage(shown)).toBe(true);
    clearLastRoom(storage);
    expect(readLastRoom(storage)).toBeUndefined();
    expect(
      tableToReopen('table_lobby_1', [], [], 'member_ada', 'lobby_1'),
    ).toBe('');

    expect(shouldRemoveEmptyTable(1, 'waiting_for_players', timeout, 1n)).toBe(
      false,
    );
  });
});
