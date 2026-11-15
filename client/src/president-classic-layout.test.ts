import { describe, expect, it } from 'vitest';
import type { PresidentState } from '../../src/shared/games/president';
import {
  orderedPresidentHand,
  presidentPublicCards,
  presidentPublicPositions,
  PRESIDENT_PUBLIC_SCALE,
  presidentRequirement,
  presidentSeatStatus,
} from './president-classic-layout';

const live = {
  phase: 'play',
  currentRank: '7',
  currentCount: 2,
  playPile: ['3C', '3S', '7H', '7D'],
  lastPlay: { seat: 1, cards: ['7H', '7D'], rank: '7' },
  openingLead: false,
  finishOrder: [],
  rankOrder: [],
  turnSeatIndex: 2,
} as unknown as PresidentState;

describe('classic President presentation', () => {
  it('shows only the combination to beat and never remaining hands at finish', () => {
    expect(presidentPublicCards(live)).toEqual(['7H', '7D']);
    expect(presidentPublicCards({ ...live, phase: 'finished' })).toEqual([]);
    expect(
      presidentPublicCards({ ...live, currentRank: null, lastPlay: null }),
    ).toEqual([]);
  });
  it('keeps rank corners readable and the public combination clear of text and seats', () => {
    for (const count of [1, 2, 3, 4]) {
      const slots = presidentPublicPositions(count);
      expect(slots.reduce((sum, p) => sum + p.x, 0) / count).toBe(480);
      for (const [index, slot] of slots.entries()) {
        expect(slot.x - 20 * PRESIDENT_PUBLIC_SCALE).toBeGreaterThan(248);
        expect(slot.x + 20 * PRESIDENT_PUBLIC_SCALE).toBeLessThan(712);
        expect(
          slot.y - 28 * PRESIDENT_PUBLIC_SCALE - 276,
        ).toBeGreaterThanOrEqual(16);
        expect(
          390 - slot.y - 28 * PRESIDENT_PUBLIC_SCALE,
        ).toBeGreaterThanOrEqual(16);
        if (index)
          expect(slot.x - slots[index - 1].x).toBeGreaterThan(
            40 * PRESIDENT_PUBLIC_SCALE,
          );
      }
    }
  });
  it('sorts low three through high two without changing the subscribed hand', () => {
    const hand = ['2H', 'AC', '3S', '10D', '3C'];
    expect(orderedPresidentHand(hand)).toEqual(['3C', '3S', '10D', 'AC', '2H']);
    expect(hand).toEqual(['2H', 'AC', '3S', '10D', '3C']);
  });
  it('distinguishes opening lead, combinations, out positions and final titles', () => {
    expect(presidentRequirement(live)).toBe('Beat a pair · 7');
    expect(presidentRequirement({ ...live, openingLead: true })).toContain(
      '3♣',
    );
    expect(presidentRequirement({ ...live, currentRank: null })).toBe(
      'New lead',
    );
    expect(presidentSeatStatus({ ...live, finishOrder: [1, 0] }, 0)).toBe(
      '2nd out',
    );
    expect(
      presidentSeatStatus(
        { ...live, rankOrder: [{ seat: 1, title: 'President', score: 6 }] },
        1,
      ),
    ).toBe('President');
  });
});
