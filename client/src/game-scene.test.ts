import { describe, expect, it } from 'vitest';
import {
  dummyIntentPayload,
  dummyStateFromJson,
  knownTableId,
  memberForClient,
  memberIsWatching,
  placeSeats,
  seatAnchorsFor,
  seatLabels,
  SEAT_ANCHORS,
  spectatingLine,
  tableSubscriptionQueries,
  type MemberRef,
  type NamedSeat,
} from './game-scene';

const members: MemberRef[] = [
  { id: 'member-a', lobbyId: 'lobby-1', clientId: 'client-a', name: 'Ada' },
  { id: 'member-b', lobbyId: 'lobby-1', clientId: 'client-b', name: 'Bea' },
  { id: 'member-c', lobbyId: 'lobby-2', clientId: 'client-c', name: 'Cara' },
];

describe('known table', () => {
  it('picks the newest table in this lobby', () => {
    expect(
      knownTableId(
        [
          { id: 'table-old', lobbyId: 'lobby-1', createdAtMicros: 10n },
          { id: 'table-other', lobbyId: 'lobby-2', createdAtMicros: 99n },
          { id: 'table-new', lobbyId: 'lobby-1', createdAtMicros: 20n },
        ],
        'lobby-1',
      ),
    ).toBe('table-new');
  });

  it('returns nothing when the lobby has no table', () => {
    expect(knownTableId([], 'lobby-1')).toBeUndefined();
  });
});

describe('seat labels', () => {
  it('names only the seats at this table and marks this client', () => {
    const labels = seatLabels(
      [
        { tableId: 'table-1', lobbyMemberId: 'member-b', seatIndex: 1 },
        { tableId: 'table-2', lobbyMemberId: 'member-c', seatIndex: 0 },
        { tableId: 'table-1', lobbyMemberId: 'member-a', seatIndex: 0 },
      ],
      members,
      'table-1',
      'client-a',
    );
    expect(labels.map((seat) => seat.name)).toEqual(['Ada', 'Bea']);
    expect(labels.find((seat) => seat.name === 'Ada')?.self).toBe(true);
    expect(labels.find((seat) => seat.name === 'Bea')?.self).toBe(false);
  });

  it('marks only seated members who are in this table voice channel', () => {
    const labels = seatLabels(
      [
        { tableId: 'table-1', lobbyMemberId: 'member-a', seatIndex: 0 },
        { tableId: 'table-1', lobbyMemberId: 'member-b', seatIndex: 1 },
      ],
      members,
      'table-1',
      'client-a',
      new Set(['member-b', 'member-elsewhere']),
    );
    expect(labels.map((seat) => seat.inVoice)).toEqual([false, true]);
  });

  it('finds this client member row', () => {
    expect(memberForClient(members, 'lobby-1', 'client-b')?.id).toBe(
      'member-b',
    );
    expect(memberForClient(members, 'lobby-2', 'client-b')).toBeUndefined();
  });

  it('puts this client at the bottom and the other player across', () => {
    const labels: NamedSeat[] = [
      {
        seatIndex: 0,
        name: 'Ada',
        self: false,
        lobbyMemberId: 'member-a',
        inVoice: false,
      },
      {
        seatIndex: 1,
        name: 'Bea',
        self: true,
        lobbyMemberId: 'member-b',
        inVoice: false,
      },
    ];
    const placed = placeSeats(labels);
    const pair = seatAnchorsFor(2);
    const bea = placed.find((seat) => seat.name === 'Bea');
    const ada = placed.find((seat) => seat.name === 'Ada');
    expect(bea).toMatchObject({ x: pair[0]?.x, y: pair[0]?.y });
    expect(ada).toMatchObject({ x: pair[1]?.x, y: pair[1]?.y });
    expect(ada?.y).toBe(SEAT_ANCHORS[3].y);
  });
});

describe('seat anchors', () => {
  function names(count: number, self = 0): NamedSeat[] {
    return Array.from({ length: count }, (_item, index) => ({
      seatIndex: index,
      name: `Seat ${index}`,
      self: index === self,
      lobbyMemberId: `member-${index}`,
      inVoice: false,
    }));
  }

  it('puts three players on the bottom, right, and left', () => {
    const anchors = seatAnchorsFor(3);
    expect(anchors.map((anchor) => anchor.y)).not.toContain(SEAT_ANCHORS[3].y);
    expect(anchors.some((anchor) => anchor.x > 560)).toBe(true);
    expect(anchors.some((anchor) => anchor.x < 400)).toBe(true);
    const placed = placeSeats(names(3));
    expect(placed.find((seat) => seat.self)).toMatchObject({
      x: SEAT_ANCHORS[0].x,
      y: SEAT_ANCHORS[0].y,
    });
    const others = placed.filter((seat) => !seat.self);
    expect(others.map((seat) => seat.x).sort((a, b) => a - b)).toEqual([
      SEAT_ANCHORS[5].x,
      SEAT_ANCHORS[1].x,
    ]);
  });

  it('gives the fourth player the top', () => {
    const anchors = seatAnchorsFor(4);
    expect(anchors[3]).toEqual(SEAT_ANCHORS[3]);
    expect(anchors[1]).toEqual(SEAT_ANCHORS[1]);
    expect(anchors[2]).toEqual(SEAT_ANCHORS[5]);
  });

  it('spreads five or more seats around both sides', () => {
    for (const count of [5, 6, 7, 8]) {
      const anchors = seatAnchorsFor(count);
      expect(anchors).toHaveLength(count);
      expect(
        new Set(anchors.map((anchor) => `${anchor.x},${anchor.y}`)).size,
      ).toBe(count);
      const others = anchors.slice(1);
      expect(others.every((anchor) => anchor.x > 560)).toBe(false);
      expect(others.every((anchor) => anchor.x < 400)).toBe(false);
    }
  });
});

describe('dummy counter state', () => {
  it('deserializes stateJson for the dummy table only', () => {
    expect(dummyStateFromJson('dummy', '{"count":4}')).toEqual({ count: 4 });
    expect(dummyStateFromJson('bluff', '{"count":4}')).toBeUndefined();
  });

  it('builds an increment intent without changing a count', () => {
    expect(dummyIntentPayload({ type: 'increment' })).toBe(
      '{"type":"increment"}',
    );
  });
});

describe('table subscription', () => {
  it('subscribes to that table’s GameTable, GameSeat, Spectator, and TableChatMessage rows', () => {
    expect(tableSubscriptionQueries("table_a'b")).toEqual([
      `SELECT * FROM GameTable WHERE id = 'table_a''b'`,
      `SELECT * FROM GameSeat WHERE tableId = 'table_a''b'`,
      `SELECT * FROM GameEvent WHERE tableId = 'table_a''b'`,
      `SELECT * FROM Spectator WHERE tableId = 'table_a''b'`,
      `SELECT * FROM TableChatMessage WHERE tableId = 'table_a''b'`,
    ]);
  });
});

describe('spectating line', () => {
  const spectators = [{ tableId: 'table-1', lobbyMemberId: 'member-c' }];

  it('names a watcher who has no seat', () => {
    expect(memberIsWatching(spectators, 'table-1', 'member-c')).toBe(true);
    expect(memberIsWatching(spectators, 'table-1', 'member-a')).toBe(false);
    expect(spectatingLine(false, true)).toBe('Spectating');
    expect(spectatingLine(true, true)).toBe('');
    expect(spectatingLine(false, false)).toBe('');
  });
});
