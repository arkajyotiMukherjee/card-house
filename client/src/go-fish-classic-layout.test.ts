import { describe, expect, it } from 'vitest';
import type { GoFishState } from '../../src/shared/games/go-fish';
import {
  goFishBookRows,
  goFishStockPosition,
  goFishTargetBoxes,
  orderedGoFishHand,
} from './go-fish-classic-layout';
import { rectsOverlap } from './table-presentation';
const seats = Array.from({ length: 6 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Johnson',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Go Fish composition', () => {
  it('keeps all five ask targets separate from the stock, public text and personal hand', () => {
    const boxes = goFishTargetBoxes(seats),
      stock = goFishStockPosition(true);
    expect(boxes).toHaveLength(5);
    for (const [index, box] of boxes.entries()) {
      expect(box.w).toBeGreaterThanOrEqual(160);
      expect(box.h).toBeGreaterThanOrEqual(40);
      expect(box.y).toBeGreaterThanOrEqual(300);
      expect(box.y + box.h).toBeLessThanOrEqual(436);
      expect(
        rectsOverlap(box, { x: stock.x - 25, y: stock.y - 36, w: 56, h: 72 }),
      ).toBe(false);
      for (const other of boxes.slice(index + 1))
        expect(rectsOverlap(box, other)).toBe(false);
    }
  });
  it('groups matching held ranks without mutating the server hand', () => {
    const hand = ['KH', '2S', 'AC', 'AD', '10H'];
    expect(orderedGoFishHand(hand)).toEqual(['AC', 'AD', '2S', '10H', 'KH']);
    expect(hand).toEqual(['KH', '2S', 'AC', 'AD', '10H']);
  });
  it('ranks tied book leaders together without inventing a sole winner', () => {
    const state = {
      books: { '0': [{ rank: 'A' }], '1': [{ rank: 'K' }], '2': [] },
    } as unknown as GoFishState;
    const rows = goFishBookRows(state, seats.slice(0, 3));
    expect(
      rows.map((row) => [row.seat.seatIndex, row.count, row.place]),
    ).toEqual([
      [0, 1, 1],
      [1, 1, 1],
      [2, 0, 3],
    ]);
  });
  it('keeps every completed rank visible in the bounded collection data', () => {
    const ranks = [
      'A',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      'J',
      'Q',
      'K',
    ];
    const state = {
      books: { '0': ranks.map((rank) => ({ rank })) },
    } as unknown as GoFishState;
    expect(goFishBookRows(state, seats)[0].ranks).toEqual(ranks);
    expect(ranks.length * 17).toBeLessThanOrEqual(224);
  });
});
