import { describe, expect, it } from 'vitest';
import type { RummyState } from '../../src/shared/games/rummy';
import { HAND_Y } from './bluff-layout';
import {
  DISCARD_X,
  DISCARD_Y,
  STOCK_X,
  discardPositions,
  finishedLine,
  legalCard,
  meldOrigin,
  meldPositions,
  stockPosition,
} from './rummy-layout';

function playState(turnSeatIndex: number | null): RummyState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    stock: ['2C'],
    discardPile: ['3D'],
    melds: [],
    turnSeatIndex,
    drawn: false,
    scores: {},
    winnerSeatIndex: null,
  };
}

describe('rummy layout', () => {
  it('puts the discard pile and the stock in the center', () => {
    expect(discardPositions(1)).toEqual([{ x: DISCARD_X, y: DISCARD_Y }]);
    const pile = discardPositions(3);
    expect(pile[0]?.x).toBeLessThan(pile[1]?.x ?? 0);
    expect(pile.every((slot) => slot.y === DISCARD_Y)).toBe(true);
    expect(stockPosition().x).toBe(STOCK_X);
    expect(stockPosition().x).toBeGreaterThan(DISCARD_X);
  });

  it('puts your melds above the hand and other melds off the bottom row', () => {
    const mine = meldOrigin(480, 456, true, 0);
    expect(mine.y).toBeLessThan(HAND_Y);
    const slots = meldPositions(mine.x, mine.y, 4);
    expect(slots).toHaveLength(4);
    expect(slots[0]?.x).toBeLessThan(slots[1]?.x ?? 0);
    const theirs = meldOrigin(780, 310, false, 0);
    expect(theirs.y).toBeLessThan(HAND_Y - 40);
    expect(meldPositions(theirs.x, theirs.y, 3).length).toBe(3);
  });

  it('lifts a card only when it is in your hand on your turn', () => {
    const state = playState(0);
    expect(legalCard(state, 0, 'AS')).toBe(true);
    expect(legalCard(state, 0, 'KD')).toBe(false);
    expect(legalCard(playState(1), 0, 'AS')).toBe(false);
    expect(legalCard({ ...state, phase: 'lobby' }, 0, 'AS')).toBe(false);
  });

  it('names the subscribed winner seat when the rules finish', () => {
    const state = playState(null);
    state.phase = 'finished';
    state.winnerSeatIndex = 0;
    expect(finishedLine(state, [{ seatIndex: 0, name: 'Ada' }])).toBe(
      'Winner seat 0 Ada',
    );
    expect(finishedLine({ ...state, phase: 'play' }, [])).toBeNull();
  });
});
