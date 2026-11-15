import { describe, it, expect } from 'vitest';
import type { SpadesState } from '../../src/shared/games/spades';
import {
  spadesRailSeats,
  spadesBidBoxes,
  orderedSpadesHand,
  spadesPublicCards,
  spadesTrickPositions,
  SPADES_PUBLIC_SCALE,
  spadesTeamTotals,
} from './spades-classic-layout';
import { classicSeats } from './classic-table-design';
import { rectsOverlap } from './table-presentation';
const seats = Array.from({ length: 4 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Montgomery',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Spades composition', () => {
  it('places the partner opposite every local seat', () => {
    for (let viewer = 0; viewer < 4; viewer++) {
      const arranged = spadesRailSeats(
        seats.map((seat) => ({ ...seat, self: seat.seatIndex === viewer })),
      );
      const top = classicSeats(arranged)[0];
      expect(top.edge).toBeUndefined();
      expect(top.seat.seatIndex).toBe((viewer + 2) % 4);
    }
  });
  it('keeps all fourteen bids readable and separate from the hand and team summary', () => {
    const bids = spadesBidBoxes();
    expect(bids.map((b) => b.tricks)).toEqual(
      Array.from({ length: 14 }, (_, i) => i),
    );
    for (const [index, box] of bids.entries()) {
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThan(290);
      expect(box.y + box.h).toBeLessThan(436);
      for (const other of bids.slice(index + 1))
        expect(rectsOverlap(box, other)).toBe(false);
    }
  });
  it('separates four public cards from the team board and owner labels', () => {
    const slots = spadesTrickPositions(4);
    for (const [index, pos] of slots.entries()) {
      expect(pos.x - 20 * SPADES_PUBLIC_SCALE).toBeGreaterThan(244);
      expect(pos.x + 20 * SPADES_PUBLIC_SCALE).toBeLessThan(716);
      expect(pos.y - 28 * SPADES_PUBLIC_SCALE).toBeGreaterThan(260);
      expect(pos.y + 28 * SPADES_PUBLIC_SCALE).toBeLessThan(374);
      if (index)
        expect(pos.x - slots[index - 1].x).toBeGreaterThan(
          40 * SPADES_PUBLIC_SCALE,
        );
    }
  });
  it('only renders public trick cards and keeps remaining hands private at finish', () => {
    const cards = [
      { seat: 0, card: 'AC' },
      { seat: 1, card: 'KC' },
    ];
    const state = {
      phase: 'play',
      stage: 'trick',
      trick: cards,
      lastTrick: null,
    } as unknown as SpadesState;
    expect(spadesPublicCards(state)).toEqual(cards);
    expect(
      spadesPublicCards({
        ...state,
        trick: [],
        lastTrick: { cards, winner: 0 },
      }),
    ).toEqual(cards);
    expect(spadesPublicCards({ ...state, phase: 'finished' })).toEqual([]);
  });
  it('sorts suits and preserves nil and unfinished partnership bids', () => {
    expect(orderedSpadesHand(['AS', '2C', 'KD', 'AC', '10H'])).toEqual([
      '2C',
      'AC',
      'KD',
      '10H',
      'AS',
    ]);
    const state = {
      hands: { 0: [], 1: [], 2: [], 3: [] },
      bids: { 0: 0, 1: 4, 2: null, 3: 3 },
      tricks: { 0: 0, 1: 4, 2: 2, 3: 1 },
    } as unknown as SpadesState;
    expect(spadesTeamTotals(state, 'ns')).toEqual({
      bid: 0,
      pending: true,
      tricks: 2,
    });
    expect(spadesTeamTotals(state, 'ew')).toEqual({
      bid: 7,
      pending: false,
      tricks: 5,
    });
  });
});
