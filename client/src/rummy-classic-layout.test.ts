import { describe, expect, it } from 'vitest';
import type { RummyState } from '../../src/shared/games/rummy';
import {
  RUMMY_PUBLIC_SCALE,
  RUMMY_STOCK,
  RUMMY_DISCARD,
  rummyMeldPage,
  rummyMeldPositions,
  rummyScoreRows,
  orderedRummyHand,
  ownRummyDeadwood,
} from './rummy-classic-layout';
const seats = Array.from({ length: 6 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Montgomery',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Rummy composition', () => {
  it('keeps growing public melds bounded and every card reachable without shrinking faces', () => {
    const cards = [
      'AS',
      '2S',
      '3S',
      '4S',
      '5S',
      '6S',
      '7S',
      '8S',
      '9S',
      '10S',
      'JS',
      'QS',
      'KS',
    ];
    const state = { melds: [{ seat: 0, cards }] } as unknown as RummyState;
    const seen = new Set<string>();
    for (let p = 0; p < 3; p++) {
      const page = rummyMeldPage(state, 0, p);
      expect(page.cards.length).toBeLessThanOrEqual(6);
      expect(page.pages).toBe(3);
      page.cards.forEach((c) => seen.add(c));
      const positions = rummyMeldPositions(page.cards.length);
      for (const slot of positions) {
        expect(slot.x - 20 * RUMMY_PUBLIC_SCALE).toBeGreaterThan(292);
        expect(slot.x + 20 * RUMMY_PUBLIC_SCALE).toBeLessThan(668);
        expect(slot.y - 28 * RUMMY_PUBLIC_SCALE).toBeGreaterThan(274);
        expect(slot.y + 28 * RUMMY_PUBLIC_SCALE).toBeLessThan(382);
      }
    }
    expect([...seen]).toEqual(cards);
  });
  it('keeps pile faces separate from their labels and public instructions', () => {
    for (const pile of [RUMMY_STOCK, RUMMY_DISCARD]) {
      expect(pile.y - 28 * RUMMY_PUBLIC_SCALE - 292).toBeGreaterThanOrEqual(16);
      expect(396 - pile.y - 28 * RUMMY_PUBLIC_SCALE).toBeGreaterThanOrEqual(8);
    }
  });
  it('orders private ranks stably without changing source state, and counts only local deadwood', () => {
    const hand = ['KH', '2D', 'AS', 'AC', '10S'];
    expect(orderedRummyHand(hand)).toEqual(['AC', 'AS', '2D', '10S', 'KH']);
    expect(hand).toEqual(['KH', '2D', 'AS', 'AC', '10S']);
    const state = {
      hands: { '0': hand, '1': ['KS', 'QH'] },
    } as unknown as RummyState;
    expect(ownRummyDeadwood(state, 0)).toBe(24);
    expect(ownRummyDeadwood(state, null)).toBe(0);
  });
  it('ranks only published final scores and keeps the actual rule winner', () => {
    const state = {
      scores: { '0': 18, '1': 2, '2': 25, '3': 4, '4': 8, '5': 12 },
      winnerSeatIndex: 1,
    } as unknown as RummyState;
    const rows = rummyScoreRows(state, seats);
    expect(rows.map((r) => r.score)).toEqual([2, 4, 8, 12, 18, 25]);
    expect(rows[0].winner).toBe(true);
  });
});
