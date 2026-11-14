import { describe, expect, it } from 'vitest';
import { finishedPrizeMessage, settledSeats } from './settled-seats';
describe('settled participants', () => {
  it('preserves names and the viewer after paid seats are released', () => {
    const rows = [
      {
        tableId: 't',
        handNumber: 3,
        summaryJson: JSON.stringify([
          { walletId: 'a', name: 'Ada', seatIndex: 0, profit: '20' },
          { walletId: 'b', name: 'Bo', seatIndex: 1, profit: '-20' },
        ]),
      },
    ];
    expect(
      settledSeats(rows, 't', 3, 'a').map((row) => [row.name, row.self]),
    ).toEqual([
      ['Ada', true],
      ['Bo', false],
    ]);
    expect(settledSeats(rows, 't', 4, 'a')).toEqual([]);
    expect(settledSeats(rows, 'other', 3, 'a')).toEqual([]);
  });
  it('ignores malformed and pre-upgrade result snapshots', () => {
    expect(
      settledSeats(
        [{ tableId: 't', handNumber: 1, summaryJson: '{' }],
        't',
        1,
        'a',
      ),
    ).toEqual([]);
    expect(
      settledSeats(
        [
          {
            tableId: 't',
            handNumber: 1,
            summaryJson: '[{"name":"Old player"}]',
          },
        ],
        't',
        1,
        'a',
      ),
    ).toEqual([]);
  });
});

it('names tied prize winners even when neither made a profit', () => {
  const row = {
    tableId: 't',
    handNumber: 1,
    summaryJson: JSON.stringify([
      { name: 'Ada', won: true, profit: '0' },
      { name: 'Bo', won: true, profit: '0' },
    ]),
  };
  expect(finishedPrizeMessage([row], 't', 1)).toBe('Winners: Ada, Bo');
  expect(finishedPrizeMessage([row], 't', 2)).toBeUndefined();
  expect(
    finishedPrizeMessage(
      [{ ...row, summaryJson: '[{"refunded":true}]' }],
      't',
      1,
    ),
  ).toBe('Entry fees refunded');
  expect(
    finishedPrizeMessage([{ ...row, summaryJson: 'null' }], 't', 1),
  ).toBeUndefined();
});
