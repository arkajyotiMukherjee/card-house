import { describe, expect, it } from 'vitest';
import type {
  BlackjackSeatState,
  BlackjackState,
} from '../../src/shared/games/blackjack';
import { HAND_Y } from './bluff-layout';
import {
  DEALER_X,
  CARD_DRAW,
  DEALER_Y,
  BANNER_Y,
  BET_10_BUTTON,
  BET_25_BUTTON,
  BET_50_BUTTON,
  DOUBLE_BUTTON,
  HIT_BUTTON,
  SPLIT_BUTTON,
  STAND_BUTTON,
  betAnchor,
  dealerLabelPosition,
  dealerPositions,
  faceForBlackjackCard,
  finishedLine,
  playerCardSlots,
  plateWidth,
  totalLabelPosition,
} from './blackjack-layout';
import {
  belowFelt,
  coversCluster,
  fanCardRect,
  fanGapLine,
  insideCluster,
  rectsOverlap,
} from './table-presentation';

function finished(
  winnerSeatIndexes: number[],
  seats: Record<string, BlackjackSeatState> = {},
): BlackjackState {
  return {
    phase: 'finished',
    step: 'act',
    deck: [],
    dealer: ['7S', '7H'],
    holeHidden: false,
    seats,
    turnSeatIndex: null,
    winnerSeatIndexes,
  };
}

function scoredSeat(
  cards: string[],
  result: 'win' | 'lose' | 'push' | 'blackjack',
): BlackjackSeatState {
  return {
    chips: 175,
    bet: 25,
    hands: [{ cards, bet: 25, done: true }],
    handIndex: 0,
    results: [result],
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

  it('fans other seats on the rail, clear of the dealer row', () => {
    const topSeat = { x: 480, y: 72 };
    const cards = playerCardSlots(false, topSeat.x, topSeat.y, 1, 0, 5, 'Ada');
    expect(cards.every((slot) => slot.rotation !== 0)).toBe(true);
    const lowest = Math.max(
      ...cards.map((slot) => fanCardRect(slot).y + fanCardRect(slot).h),
    );
    expect(lowest).toBeLessThan(DEALER_Y - CARD_DRAW / 2);
    expect(BANNER_Y).toBeGreaterThan(DEALER_Y + CARD_DRAW / 2);
    const label = dealerLabelPosition(2);
    expect(label.x).toBeGreaterThan(dealerPositions(2)[1]?.x ?? 0);
    const total = fanGapLine(780, 310, 'Ada', '19', 1);
    const hand = playerCardSlots(false, 780, 310, 1, 0, 2, 'Ada');
    const totalRect = { x: total.x, y: total.y, w: 16, h: 8 };
    for (const slot of hand) {
      expect(rectsOverlap(totalRect, fanCardRect(slot))).toBe(false);
    }
  });

  it('sets split hands apart', () => {
    const left = playerCardSlots(true, 480, 456, 2, 0, 2);
    const right = playerCardSlots(true, 480, 456, 2, 1, 2);
    expect(Math.max(...left.map((slot) => slot.x))).toBeLessThan(
      Math.min(...right.map((slot) => slot.x)),
    );
    const seatLeft = playerCardSlots(false, 780, 310, 2, 0, 2);
    const seatRight = playerCardSlots(false, 780, 310, 2, 1, 2);
    expect(Math.max(...seatRight.map((slot) => slot.x))).toBeLessThan(
      Math.min(...seatLeft.map((slot) => slot.x)),
    );
    expect(seatLeft.every((slot) => !coversCluster(slot))).toBe(true);
    expect(seatRight.every((slot) => !coversCluster(slot))).toBe(true);
  });

  it('keeps hit, stand, double, split, and bets in the cluster', () => {
    for (const button of [
      HIT_BUTTON,
      STAND_BUTTON,
      DOUBLE_BUTTON,
      SPLIT_BUTTON,
      BET_10_BUTTON,
      BET_25_BUTTON,
      BET_50_BUTTON,
    ]) {
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
    }
  });

  it('names the winner and a push', () => {
    expect(finishedLine(finished([0]), [{ seatIndex: 0, name: 'Ada' }])).toBe(
      'Winner seat 0 Ada',
    );
    expect(
      finishedLine(finished([], { '0': scoredSeat(['10H', '7D'], 'push') }), [
        { seatIndex: 0, name: 'Ada' },
      ]),
    ).toBe('Push');
    expect(faceForBlackjackCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForBlackjackCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
  });

  it('does not call a dealer win a push', () => {
    const line = finishedLine(
      finished([], {
        '0': scoredSeat(['8C', 'KH', '7C'], 'lose'),
        '1': scoredSeat(['JH', 'JC', '7D'], 'lose'),
      }),
      [
        { seatIndex: 0, name: 'Ada' },
        { seatIndex: 1, name: 'Bea' },
      ],
    );
    expect(line).not.toBe('Push');
    expect(line).toBe('Dealer');
  });
});
