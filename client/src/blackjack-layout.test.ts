import { describe, expect, it } from 'vitest';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import { HAND_Y } from './bluff-layout';
import {
  DEALER_X,
  CARD_DRAW,
  DEALER_Y,
  BANNER_Y,
  betAnchor,
  dealerLabelPosition,
  dealerPositions,
  faceForBlackjackCard,
  finishedLine,
  playerCardSlots,
  plateWidth,
  totalLabelPosition,
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

  it('places a bet right of the name plate and its total left of it', () => {
    const own = betAnchor(480, 456, 'Ada');
    expect(own.x).toBeGreaterThan(480 + plateWidth('Ada') / 2);
    expect(own.y).toBeLessThan(HAND_Y - 32);
    const total = totalLabelPosition(480, 456, 'Ada', '19');
    expect(total.x + 16).toBeLessThan(480 - plateWidth('Ada') / 2);
  });

  it('keeps other seats clear of the dealer row and the banner', () => {
    const topSeat = { x: 480, y: 72 };
    const cards = playerCardSlots(false, topSeat.x, topSeat.y, 1, 0, 5);
    const lowest = Math.max(...cards.map((slot) => slot.y)) + CARD_DRAW / 2;
    expect(lowest).toBeLessThan(DEALER_Y - CARD_DRAW / 2);
    expect(BANNER_Y).toBeGreaterThan(DEALER_Y + CARD_DRAW / 2);
    const label = dealerLabelPosition(2);
    expect(label.x).toBeGreaterThan(dealerPositions(2)[1]?.x ?? 0);
  });

  it('sets split hands apart', () => {
    const left = playerCardSlots(true, 480, 456, 2, 0, 2);
    const right = playerCardSlots(true, 480, 456, 2, 1, 2);
    expect(Math.max(...left.map((slot) => slot.x))).toBeLessThan(
      Math.min(...right.map((slot) => slot.x)),
    );
    const seatLeft = playerCardSlots(false, 780, 310, 2, 0, 2);
    const seatRight = playerCardSlots(false, 780, 310, 2, 1, 2);
    expect(Math.max(...seatLeft.map((slot) => slot.x))).toBeLessThan(
      Math.min(...seatRight.map((slot) => slot.x)),
    );
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
