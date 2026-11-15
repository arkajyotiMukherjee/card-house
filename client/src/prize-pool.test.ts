import { describe, expect, it } from 'vitest';
import { entryFeePrizePool } from './prize-pool';
const table = {
  id: 't',
  gameType: 'president',
  economyJson: JSON.stringify({ entryFee: 20 }),
  handNumber: 1,
};
const funding = [
  { tableId: 't', units: 40n },
  { tableId: 't', units: 40n },
  { tableId: 'other', units: 900n },
];
describe('entry-fee prize display', () => {
  it('uses all retained contributions, even when a contributor no longer has a seat', () => {
    expect(entryFeePrizePool(table, funding, [])).toBe(40);
  });
  it('serves every prize game without treating casino stacks as a prize pool', () => {
    for (const gameType of [
      'bluff',
      'president',
      'go_fish',
      'crazy_eights',
      'rummy',
      'spades',
      'hearts',
    ])
      expect(entryFeePrizePool({ ...table, gameType }, funding, [])).toBe(40);
    for (const gameType of ['poker', 'blackjack', 'dummy', 'stub'])
      expect(
        entryFeePrizePool({ ...table, gameType }, funding, []),
      ).toBeUndefined();
  });
  it('retains the completed pool after settlement releases seats and funding rows', () => {
    const rows = [
      {
        tableId: 't',
        handNumber: 1,
        summaryJson: JSON.stringify([
          { seatIndex: 0, won: true },
          { seatIndex: 1, won: false },
          { seatIndex: 2, won: false },
        ]),
      },
    ];
    expect(entryFeePrizePool(table, [], rows)).toBe(60);
    expect(entryFeePrizePool({ ...table, handNumber: 2 }, funding, rows)).toBe(
      40,
    );
  });
  it('does not advertise refunded or unfunded entry fees as a prize to win', () => {
    expect(entryFeePrizePool(table, [], [])).toBeUndefined();
    expect(
      entryFeePrizePool({ ...table, economyJson: '' }, funding, []),
    ).toBeUndefined();
    expect(
      entryFeePrizePool(
        table,
        [],
        [
          {
            tableId: 't',
            handNumber: 1,
            summaryJson: '[{"seatIndex":0,"refunded":true}]',
          },
        ],
      ),
    ).toBeUndefined();
    expect(
      entryFeePrizePool(
        table,
        [],
        [{ tableId: 't', handNumber: 1, summaryJson: 'null' }],
      ),
    ).toBeUndefined();
  });
});
