import { describe, it, expect } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { pokerPotEntries, pokerPotPage } from './poker-pots';
import { boardPositions, BOARD_Y, BOARD_SCALE } from './poker-layout';
const state = (amounts: number[]): PokerState =>
  ({
    phase: 'play',
    order: amounts.map((_, i) => i),
    seats: Object.fromEntries(
      amounts.map((committed, i) => [
        String(i),
        { committed, allIn: true, folded: false, chips: 0 },
      ]),
    ),
    pots: [],
    pot: amounts.reduce((a, b) => a + b, 0),
  }) as unknown as PokerState;
describe('main-table pot layers', () => {
  it('keeps main plus ordinary side pots directly readable and unmatched chips separate', () => {
    const entries = pokerPotEntries(state([100, 200, 300, 300]));
    expect(entries.map((p) => [p.title, p.amount])).toEqual([
      ['Main pot', 400],
      ['Side pot 1', 300],
      ['Side pot 2', 200],
    ]);
    expect(pokerPotPage(entries, 0).shown).toHaveLength(3);
    const unmatched = pokerPotEntries(state([100, 200, 300]));
    expect(unmatched.at(-1)).toMatchObject({
      title: 'Uncalled',
      amount: 100,
      pending: true,
      winners: [],
    });
  });
  it('keeps the main pot fixed while every one of seven contested layers is reachable', () => {
    const entries = pokerPotEntries(
      state([100, 200, 300, 400, 500, 600, 700, 800]),
    );
    const seen = new Set<string>();
    const pages = pokerPotPage(entries, 0).pages;
    expect(pages).toBe(4);
    for (let page = 0; page < pages; page++) {
      const row = pokerPotPage(entries, page);
      expect(row.shown[0].title).toBe('Main pot');
      expect(row.shown.length).toBeLessThanOrEqual(3);
      row.shown.forEach((entry) => seen.add(entry.key));
    }
    expect(seen.size).toBe(8);
  });
  it('uses two wider columns for large exact amounts and leaves the board clear', () => {
    const entries = pokerPotEntries(state([100000000, 200000000, 300000000]));
    expect(pokerPotPage(entries, 0).columns).toBe(2);
    expect(boardPositions(5, true).every((p) => p.y === BOARD_Y + 12)).toBe(
      true,
    );
    expect(boardPositions(5, true)[0].y - 28 * BOARD_SCALE).toBeGreaterThan(
      312,
    );
  });
});
