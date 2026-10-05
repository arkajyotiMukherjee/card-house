import { describe, expect, it } from 'vitest';
import {
  applyCodeKey,
  applyFieldKey,
  clampPlayerCount,
  findCreatedLobby,
  gameOption,
  lobbyByCode,
  lobbyTableQueries,
  memberByClient,
  memberLines,
  nextTableName,
  normalizePlayerName,
  normalizeRoomCode,
  tableLines,
  tableSettingsJson,
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

describe('lobby tables', () => {
  const tables = [
    {
      id: 't2',
      lobbyId: 'lobby_1',
      gameType: 'bluff',
      name: 'Bluff #2',
      statusTag: 'waiting_for_players',
      maxPlayers: 6,
    },
    {
      id: 'other',
      lobbyId: 'lobby_2',
      gameType: 'hearts',
      name: 'Hearts #1',
      statusTag: 'waiting_for_players',
      maxPlayers: 4,
    },
    {
      id: 't1',
      lobbyId: 'lobby_1',
      gameType: 'poker_holdem',
      name: "Hold'em #1",
      statusTag: 'in_progress',
      maxPlayers: 8,
    },
  ];

  it('lists this lobby with seat counts and status', () => {
    const lines = tableLines(
      tables,
      [{ tableId: 't1' }, { tableId: 't1' }, { tableId: 'other' }],
      'lobby_1',
    );
    expect(lines.map((line) => line.tableName)).toEqual([
      'Bluff #2',
      "Hold'em #1",
    ]);
    expect(lines[0]).toMatchObject({
      gameName: 'Bluff',
      currentSeats: 0,
      maxPlayers: 6,
      seatsLabel: '0/6',
      statusLabel: 'Waiting',
    });
    expect(lines[1]).toMatchObject({
      gameName: "Hold'em",
      currentSeats: 2,
      seatsLabel: '2/8',
      statusLabel: 'In Progress',
    });
  });

  it('keeps max players inside the selected game', () => {
    const hearts = gameOption(6);
    expect(hearts.name).toBe('Hearts');
    expect(clampPlayerCount(hearts, 9)).toBe(4);
    expect(clampPlayerCount(gameOption(0), 2)).toBe(2);
    expect(nextTableName(tables, 'lobby_1', gameOption(0))).toBe('Bluff #2');
  });

  it('finds this browser in the joined lobby', () => {
    expect(
      memberByClient(
        [
          {
            id: 'member_lobby_1_self',
            lobbyId: 'lobby_1',
            clientId: 'self',
            name: 'Ada',
          },
        ],
        'lobby_1',
        'self',
      )?.id,
    ).toBe('member_lobby_1_self');
  });

  it('subscribes to tables and seats for one lobby', () => {
    expect(lobbyTableQueries("lobby_a'b")).toEqual([
      `SELECT * FROM "GameTable" WHERE "lobbyId" = 'lobby_a''b'`,
      `SELECT "GameSeat".* FROM "GameTable" JOIN "GameSeat" ON "GameSeat"."tableId" = "GameTable"."id" WHERE "GameTable"."lobbyId" = 'lobby_a''b'`,
    ]);
    expect(tableSettingsJson(2, 6, 'Bluff #1')).toBe(
      '{"name":"Bluff #1","minPlayers":2,"maxPlayers":6}',
    );
  });
});
