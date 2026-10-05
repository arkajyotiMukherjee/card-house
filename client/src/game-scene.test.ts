import { describe, expect, it } from 'vitest';
import {
  knownTableId,
  memberForClient,
  placeSeats,
  seatLabels,
  SEAT_ANCHORS,
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

  it('finds this client member row', () => {
    expect(memberForClient(members, 'lobby-1', 'client-b')?.id).toBe(
      'member-b',
    );
    expect(memberForClient(members, 'lobby-2', 'client-b')).toBeUndefined();
  });

  it('puts this client at the bottom-center seat', () => {
    const labels: NamedSeat[] = [
      { seatIndex: 0, name: 'Ada', self: false, lobbyMemberId: 'member-a' },
      { seatIndex: 1, name: 'Bea', self: true, lobbyMemberId: 'member-b' },
    ];
    const placed = placeSeats(labels);
    const bea = placed.find((seat) => seat.name === 'Bea');
    const ada = placed.find((seat) => seat.name === 'Ada');
    expect(bea).toMatchObject({ x: SEAT_ANCHORS[0].x, y: SEAT_ANCHORS[0].y });
    expect(ada).toMatchObject({ x: SEAT_ANCHORS[1].x, y: SEAT_ANCHORS[1].y });
  });
});

describe('table subscription', () => {
  it('subscribes to that table’s GameTable and GameSeat rows', () => {
    expect(tableSubscriptionQueries("table_a'b")).toEqual([
      `SELECT * FROM GameTable WHERE id = 'table_a''b'`,
      `SELECT * FROM GameSeat WHERE tableId = 'table_a''b'`,
    ]);
  });
});
