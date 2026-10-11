import { describe, expect, it } from 'vitest';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import { HAND_Y } from './bluff-layout';
import {
  DEALER_X,
  DEALER_Y,
  betAnchor,
  dealerPositions,
  faceForBlackjackCard,
  finishedLine,
  playerCardSlots,
} from './blackjack-layout';

function finished(winnerSeatIndexes: number[]): BlackjackState {
  return {
    phase: 'finished',
    step: 'act',
    deck: [],
    dealer: ['AS', 'KH'],
    holeHidden: false,
    seats: {},
    turnSeatIndex: null,
    winnerSeatIndexes,
  };
}

describe('blackjack layout', () => {
  it('centers the dealer hand and keeps your cards on the bottom row', () => {
    expect(dealerPositions(1)).toEqual([{ x: DEALER_X, y: DEALER_Y }]);
    const row = dealerPositions(2);
    expect(row[0]?.x).toBeLessThan(DEALER_X);
    expect(row[1]?.x).toBeGreaterThan(DEALER_X);
    expect(row.every((slot) => slot.y === DEALER_Y)).toBe(true);
    const hand = playerCardSlots(true, 480, 456, 1, 0, 2);
    expect(hand).toHaveLength(2);
    expect(hand.every((slot) => slot.y === HAND_Y)).toBe(true);
  });

  it('places your bet beside the bottom seat', () => {
    expect(betAnchor(480, 456, true).y).toBeLessThan(HAND_Y);
    const other = betAnchor(780, 310, false);
    expect(other.x).toBeLessThan(780);
  });

  it('names the winner and a push', () => {
    expect(finishedLine(finished([0]), [{ seatIndex: 0, name: 'Ada' }])).toBe(
      'Winner seat 0 Ada',
    );
    expect(finishedLine(finished([]), [])).toBe('Push');
    expect(faceForBlackjackCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForBlackjackCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
  });
});
