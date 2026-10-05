import { describe, expect, it } from 'vitest';
import {
  applyCodeKey,
  applyFieldKey,
  findCreatedLobby,
  lobbyByCode,
  memberLines,
  normalizePlayerName,
  normalizeRoomCode,
} from './lobby';

describe('lobby fields', () => {
  it('keeps letters, digits, and spaces inside the name limit', () => {
    expect(applyFieldKey('Ada', ' ', 12)).toBe('Ada ');
    expect(applyFieldKey('Ada ', 'B', 12)).toBe('Ada B');
    expect(applyFieldKey('Ada', 'Backspace', 12)).toBe('Ad');
    expect(applyFieldKey('abcdefghijkl', 'm', 12)).toBe('abcdefghijkl');
    expect(applyFieldKey('Ada', '!', 12)).toBe('Ada');
  });

  it('uppercases a room code and ignores spaces', () => {
    expect(applyCodeKey('ab', 'c')).toBe('ABC');
    expect(applyCodeKey('AB', ' ')).toBe('AB');
    expect(normalizeRoomCode('  ab3d ')).toBe('AB3D');
    expect(normalizePlayerName('  Bea  ')).toBe('Bea');
  });
});

describe('lobby rows', () => {
  const sender = 'abc123';

  it('finds the lobby this client just created', () => {
    const known = new Set(['lobby_other_1']);
    const created = findCreatedLobby(
      [
        { id: 'lobby_other_1', code: 'ZZZZ' },
        { id: `lobby_${sender}_10`, code: 'OLD1' },
        { id: `lobby_${sender}_20`, code: 'NEW2' },
      ],
      new Set([`lobby_${sender}_10`, ...known]),
      sender,
    );
    expect(created).toEqual({ id: `lobby_${sender}_20`, code: 'NEW2' });
  });

  it('does not guess when several new lobbies belong to other clients', () => {
    expect(
      findCreatedLobby(
        [
          { id: 'lobby_aaa_1', code: 'AAAA' },
          { id: 'lobby_bbb_2', code: 'BBBB' },
        ],
        new Set(),
        sender,
      ),
    ).toBeUndefined();
  });

  it('looks up a lobby by code', () => {
    expect(lobbyByCode([{ id: 'lobby_1', code: 'AB3D' }], 'ab3d')?.id).toBe(
      'lobby_1',
    );
    expect(
      lobbyByCode([{ id: 'lobby_1', code: 'AB3D' }], '   '),
    ).toBeUndefined();
  });

  it('lists only the joined lobby and marks this client', () => {
    const lines = memberLines(
      [
        { lobbyId: 'lobby_1', clientId: 'self', name: 'Bea' },
        { lobbyId: 'lobby_2', clientId: 'nope', name: 'Cara' },
        { lobbyId: 'lobby_1', clientId: 'other', name: 'Ada' },
      ],
      'lobby_1',
      'self',
    );
    expect(lines.map((line) => line.name)).toEqual(['Ada', 'Bea']);
    expect(lines.find((line) => line.name === 'Bea')?.self).toBe(true);
    expect(lines.find((line) => line.name === 'Ada')?.self).toBe(false);
  });
});
