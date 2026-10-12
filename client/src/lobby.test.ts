import { describe, expect, it } from 'vitest';
import { bluffGameDefinition } from '../../src/shared/games/bluff';
import { crazyEightsGameDefinition } from '../../src/shared/games/crazy-eights';
import { goFishGameDefinition } from '../../src/shared/games/go-fish';
import { presidentGameDefinition } from '../../src/shared/games/president';
import { rummyGameDefinition } from '../../src/shared/games/rummy';
import { blackjackGameDefinition } from '../../src/shared/games/blackjack';
import { spadesGameDefinition } from '../../src/shared/games/spades';
import { heartsGameDefinition } from '../../src/shared/games/hearts';
import { pokerGameDefinition } from '../../src/shared/games/poker';
import {
  applyCodeKey,
  applyFieldKey,
  clampPlayerCount,
  findCreatedLobby,
  GAME_CATALOG,
  gameOption,
  listLayout,
  lobbyByCode,
  lobbyTableQueries,
  memberByClient,
  memberLines,
  nextTableName,
  normalizePlayerName,
  normalizeRoomCode,
  seatedTableIds,
  TABLE_LIST,
  tableGroups,
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
        { id: 'm_bea', lobbyId: 'lobby_1', clientId: 'self', name: 'Bea' },
        { id: 'm_cara', lobbyId: 'lobby_2', clientId: 'nope', name: 'Cara' },
        { id: 'm_ada', lobbyId: 'lobby_1', clientId: 'other', name: 'Ada' },
      ],
      'lobby_1',
      'self',
    );
    expect(lines.map((line) => line.name)).toEqual(['Ada', 'Bea']);
    expect(lines.map((line) => line.id)).toEqual(['m_ada', 'm_bea']);
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
      gameName: 'poker_holdem',
      currentSeats: 2,
      seatsLabel: '2/8',
      statusLabel: 'In Progress',
    });
  });

  it('offers Bluff, President, Go Fish, Crazy Eights, Rummy, Blackjack, Spades, Hearts, and Poker from the shared definitions', () => {
    expect(GAME_CATALOG).toEqual([
      {
        gameType: bluffGameDefinition.gameType,
        name: bluffGameDefinition.displayName,
        minPlayers: bluffGameDefinition.minPlayers,
        maxPlayers: bluffGameDefinition.maxPlayers,
        howToPlay: bluffGameDefinition.howToPlay,
      },
      {
        gameType: presidentGameDefinition.gameType,
        name: presidentGameDefinition.displayName,
        minPlayers: presidentGameDefinition.minPlayers,
        maxPlayers: presidentGameDefinition.maxPlayers,
        howToPlay: presidentGameDefinition.howToPlay,
      },
      {
        gameType: goFishGameDefinition.gameType,
        name: goFishGameDefinition.displayName,
        minPlayers: goFishGameDefinition.minPlayers,
        maxPlayers: goFishGameDefinition.maxPlayers,
        howToPlay: goFishGameDefinition.howToPlay,
      },
      {
        gameType: crazyEightsGameDefinition.gameType,
        name: crazyEightsGameDefinition.displayName,
        minPlayers: crazyEightsGameDefinition.minPlayers,
        maxPlayers: crazyEightsGameDefinition.maxPlayers,
        howToPlay: crazyEightsGameDefinition.howToPlay,
      },
      {
        gameType: rummyGameDefinition.gameType,
        name: rummyGameDefinition.displayName,
        minPlayers: rummyGameDefinition.minPlayers,
        maxPlayers: rummyGameDefinition.maxPlayers,
        howToPlay: rummyGameDefinition.howToPlay,
      },
      {
        gameType: blackjackGameDefinition.gameType,
        name: blackjackGameDefinition.displayName,
        minPlayers: blackjackGameDefinition.minPlayers,
        maxPlayers: blackjackGameDefinition.maxPlayers,
        howToPlay: blackjackGameDefinition.howToPlay,
      },
      {
        gameType: spadesGameDefinition.gameType,
        name: spadesGameDefinition.displayName,
        minPlayers: spadesGameDefinition.minPlayers,
        maxPlayers: spadesGameDefinition.maxPlayers,
        howToPlay: spadesGameDefinition.howToPlay,
      },
      {
        gameType: heartsGameDefinition.gameType,
        name: heartsGameDefinition.displayName,
        minPlayers: heartsGameDefinition.minPlayers,
        maxPlayers: heartsGameDefinition.maxPlayers,
        howToPlay: heartsGameDefinition.howToPlay,
      },
      {
        gameType: pokerGameDefinition.gameType,
        name: pokerGameDefinition.displayName,
        minPlayers: pokerGameDefinition.minPlayers,
        maxPlayers: pokerGameDefinition.maxPlayers,
        howToPlay: pokerGameDefinition.howToPlay,
      },
    ]);
    const gameTypes = GAME_CATALOG.map((game) => game.gameType);
    expect(gameTypes).not.toContain('dummy');
    expect(gameTypes).not.toContain('stub');
    expect(gameTypes).not.toContain('poker_holdem');
    expect(gameTypes).not.toContain('poker_five_card_draw');
    const bluff = gameOption(0);
    expect(bluff).toMatchObject({
      gameType: 'bluff',
      name: 'Bluff',
      minPlayers: 2,
      maxPlayers: 6,
    });
    expect(bluff.howToPlay).toBe(bluffGameDefinition.howToPlay);
    const president = gameOption(1);
    expect(president).toMatchObject({
      gameType: 'president',
      name: 'President',
      minPlayers: 3,
      maxPlayers: 6,
    });
    expect(president.howToPlay).toBe(presidentGameDefinition.howToPlay);
    const goFish = gameOption(2);
    expect(goFish).toMatchObject({
      gameType: 'go_fish',
      name: 'Go Fish',
      minPlayers: 2,
      maxPlayers: 6,
    });
    expect(goFish.howToPlay).toBe(goFishGameDefinition.howToPlay);
    const crazy = gameOption(3);
    expect(crazy).toMatchObject({
      gameType: 'crazy_eights',
      name: 'Crazy Eights',
      minPlayers: 2,
      maxPlayers: 7,
    });
    expect(crazy.howToPlay).toBe(crazyEightsGameDefinition.howToPlay);
    const rummy = gameOption(4);
    expect(rummy).toMatchObject({
      gameType: 'rummy',
      name: 'Rummy',
      minPlayers: 2,
      maxPlayers: 6,
    });
    expect(rummy.howToPlay).toBe(rummyGameDefinition.howToPlay);
    const blackjack = gameOption(5);
    expect(blackjack).toMatchObject({
      gameType: 'blackjack',
      name: 'Blackjack',
      minPlayers: blackjackGameDefinition.minPlayers,
      maxPlayers: blackjackGameDefinition.maxPlayers,
    });
    expect(blackjack.howToPlay).toBe(blackjackGameDefinition.howToPlay);
    const spades = gameOption(6);
    expect(spades).toMatchObject({
      gameType: 'spades',
      name: 'Spades',
      minPlayers: 4,
      maxPlayers: 4,
    });
    expect(spades.howToPlay).toBe(spadesGameDefinition.howToPlay);
    const hearts = gameOption(7);
    expect(hearts).toMatchObject({
      gameType: 'hearts',
      name: 'Hearts',
      minPlayers: 4,
      maxPlayers: 4,
    });
    expect(hearts.howToPlay).toBe(heartsGameDefinition.howToPlay);
    const poker = gameOption(8);
    expect(poker).toMatchObject({
      gameType: 'poker',
      name: 'Poker',
      minPlayers: pokerGameDefinition.minPlayers,
      maxPlayers: pokerGameDefinition.maxPlayers,
    });
    expect(poker.howToPlay).toBe(pokerGameDefinition.howToPlay);
    expect(poker.howToPlay).toContain("Texas Hold'em");
    expect(poker.howToPlay).toContain('Omaha');
    expect(poker.howToPlay).toContain('Oklahoma');
    expect(gameOption(9)).toBe(bluff);
    expect(gameOption(-1)).toBe(poker);
    expect(clampPlayerCount(bluff, 9)).toBe(6);
    expect(clampPlayerCount(bluff, 2)).toBe(2);
    expect(clampPlayerCount(president, 9)).toBe(6);
    expect(clampPlayerCount(president, 1)).toBe(3);
    expect(clampPlayerCount(goFish, 9)).toBe(6);
    expect(clampPlayerCount(crazy, 9)).toBe(7);
    expect(clampPlayerCount(crazy, 1)).toBe(2);
    expect(nextTableName(tables, 'lobby_1', bluff)).toBe('Bluff #2');
    expect(nextTableName(tables, 'lobby_1', president)).toBe('President #1');
    expect(nextTableName(tables, 'lobby_1', goFish)).toBe('Go Fish #1');
    expect(nextTableName(tables, 'lobby_1', crazy)).toBe('Crazy Eights #1');
    expect(nextTableName(tables, 'lobby_1', rummy)).toBe('Rummy #1');
    expect(clampPlayerCount(blackjack, 9)).toBe(
      blackjackGameDefinition.maxPlayers,
    );
    expect(nextTableName(tables, 'lobby_1', blackjack)).toBe('Blackjack #1');
    expect(clampPlayerCount(spades, 2)).toBe(4);
    expect(clampPlayerCount(spades, 6)).toBe(4);
    expect(nextTableName(tables, 'lobby_1', spades)).toBe('Spades #1');
    expect(clampPlayerCount(hearts, 2)).toBe(4);
    expect(clampPlayerCount(hearts, 9)).toBe(4);
    expect(nextTableName(tables, 'lobby_1', hearts)).toBe('Hearts #1');
    expect(clampPlayerCount(poker, 1)).toBe(pokerGameDefinition.minPlayers);
    expect(clampPlayerCount(poker, 12)).toBe(pokerGameDefinition.maxPlayers);
    expect(nextTableName(tables, 'lobby_1', poker)).toBe('Poker #1');
    expect(tableSettingsJson(2, 6, 'Poker #1', 'omaha')).toBe(
      '{"name":"Poker #1","minPlayers":2,"maxPlayers":6,"variation":"omaha"}',
    );
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

describe('grouped table list', () => {
  const rows = [
    { id: 'd1', gameType: 'dummy', name: 'Dummy #1', maxPlayers: 4 },
    { id: 'b2', gameType: 'bluff', name: 'Bluff #2', maxPlayers: 6 },
    { id: 'b1', gameType: 'bluff', name: 'Bluff #1', maxPlayers: 6 },
  ].map((row) => ({
    ...row,
    lobbyId: 'lobby_1',
    statusTag: 'waiting_for_players',
  }));
  const seats = [
    { tableId: 'b2', lobbyMemberId: 'me' },
    { tableId: 'd1', lobbyMemberId: 'other' },
  ];

  it('marks only the tables this member sits at', () => {
    const seated = seatedTableIds(seats, 'me');
    expect([...seated]).toEqual(['b2']);
    expect(seatedTableIds(seats, '').size).toBe(0);
    const lines = tableLines(rows, seats, 'lobby_1', seated);
    expect(lines.filter((line) => line.seated).map((line) => line.id)).toEqual([
      'b2',
    ]);
  });

  it('groups by game type with catalog games first', () => {
    const lines = tableLines(rows, seats, 'lobby_1');
    const groups = tableGroups(lines);
    expect(groups.map((group) => group.gameType)).toEqual(['bluff', 'dummy']);
    expect(groups[0]?.lines.map((line) => line.tableName)).toEqual([
      'Bluff #1',
      'Bluff #2',
    ]);
  });

  it('stacks headers and rows, and counts rows that do not fit', () => {
    const groups = tableGroups(tableLines(rows, seats, 'lobby_1'));
    const layout = listLayout(groups);
    expect(layout.hidden).toBe(0);
    expect(layout.slots.map((slot) => slot.kind)).toEqual([
      'header',
      'row',
      'row',
      'header',
      'row',
    ]);
    const ys = layout.slots.map((slot) => slot.y);
    expect(ys[0]).toBe(TABLE_LIST.list.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ys.every((y) => y < TABLE_LIST.list.bottom)).toBe(true);

    const many = Array.from({ length: 40 }, (_, index) => ({
      ...rows[1]!,
      id: `m${index}`,
      name: `Bluff #${index}`,
    }));
    const crowded = listLayout(tableGroups(tableLines(many, [], 'lobby_1')));
    const shown = crowded.slots.filter((slot) => slot.kind === 'row').length;
    expect(shown + crowded.hidden).toBe(40);
    expect(crowded.hidden).toBeGreaterThan(0);
  });
});
