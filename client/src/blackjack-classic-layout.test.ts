import { describe, it, expect } from 'vitest';
import {
  blackjackActionBoxes,
  blackjackCardPageSize,
  blackjackFooterSeat,
  blackjackLocalPositions,
  blackjackPublicPositions,
  blackjackRailSeats,
  blackjackShownDealer,
} from './blackjack-classic-layout';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import { rectsOverlap } from './table-presentation';
const seats = Array.from({ length: 5 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Montgomery',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Blackjack composition', () => {
  it('keeps the house separate from all five players, including spectator layout', () => {
    expect(blackjackRailSeats(seats)).toHaveLength(4);
    expect(blackjackFooterSeat(seats)?.seatIndex).toBe(0);
    const watching = seats.map((seat) => ({ ...seat, self: false }));
    expect(blackjackRailSeats(watching)).toHaveLength(4);
    expect(blackjackFooterSeat(watching)?.seatIndex).toBe(4);
    for (const group of blackjackRailSeats(seats))
      expect(group.x + 168 <= 176 || group.x >= 784).toBe(true);
  });
  it('fits every supported decision set without controls overlapping the hand or each other', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const boxes = blackjackActionBoxes(count);
      expect(boxes).toHaveLength(count);
      boxes.forEach((box, index) => {
        expect(box.x).toBeGreaterThanOrEqual(676);
        expect(box.x + box.w).toBeLessThanOrEqual(936);
        expect(box.y + box.h).toBeLessThanOrEqual(532);
        expect(box.h).toBeGreaterThanOrEqual(40);
        for (const other of boxes.slice(index + 1))
          expect(rectsOverlap(box, other)).toBe(false);
      });
    }
  });
  it('pages long local/dealer/public hands rather than shrinking their rank corners', () => {
    for (const mobile of [false, true]) {
      for (const paged of [false, true]) {
        const positions = blackjackLocalPositions(
            blackjackCardPageSize(mobile, paged),
            mobile,
          ),
          half = mobile ? 27 : 22;
        for (const card of positions) {
          expect(card.x - half).toBeGreaterThan(paged ? 248 : 220);
          expect(card.x + half).toBeLessThan(paged ? 628 : 656);
          expect(card.y).toBe(484);
        }
      }
    }
    for (const card of blackjackPublicPositions(6)) {
      expect(card.x - 25).toBeGreaterThan(288);
      expect(card.x + 25).toBeLessThan(672);
    }
  });
  it('does not disclose the dealer total while the hole card is hidden', () => {
    const state = {
      dealer: ['AS', 'KH'],
      holeHidden: true,
    } as unknown as BlackjackState;
    expect(blackjackShownDealer(state)).toBe('Dealer · Hole hidden');
    expect(blackjackShownDealer({ ...state, holeHidden: false })).toBe(
      'Dealer · 21',
    );
  });
});
