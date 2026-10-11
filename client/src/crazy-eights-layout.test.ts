import { describe, expect, it } from 'vitest';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import { HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import {
  DRAW_BUTTON,
  PLAY_BUTTON,
  finishedLine,
  handPositions,
  legalCard,
  passInsteadOfDraw,
  pilePositions,
  stockPositions,
  suitLine,
  topIsWildEight,
} from './crazy-eights-layout';

function state(overrides: Partial<CrazyEightsState> = {}): CrazyEightsState {
  return {
    phase: 'play',
    hands: { '0': ['5H', '8C', 'QH'], '1': ['AD'] },
    stock: ['9D'],
    discardPile: ['5S'],
    currentSuit: 'S',
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
    ...overrides,
  };
}

describe('crazy eights layout', () => {
  it('reuses the bottom hand and the center pile', () => {
    const hand = handPositions(5);
    expect(hand.every((slot) => slot.y === HAND_Y)).toBe(true);
    expect(pilePositions(1)).toEqual([{ x: PILE_X, y: PILE_Y }]);
    expect(stockPositions(10)).toHaveLength(3);
    expect(PLAY_BUTTON.y).toBe(DRAW_BUTTON.y);
  });

  it('lifts a match or an eight, and not a miss', () => {
    const table = state();
    expect(legalCard(table, 0, '5H')).toBe(true);
    expect(legalCard(table, 0, '8C')).toBe(true);
    expect(legalCard(table, 0, 'QH')).toBe(false);
    expect(legalCard(table, 1, 'AD')).toBe(false);
    expect(legalCard({ ...table, phase: 'finished' }, 0, '5H')).toBe(false);
  });

  it('names the suit in play and a wild eight on the pile', () => {
    expect(suitLine(state())).toBe('Suit: Spades');
    expect(suitLine(state({ currentSuit: null }))).toBe('Suit: pick');
    expect(topIsWildEight(state())).toBe(false);
    expect(topIsWildEight(state({ discardPile: ['8H'] }))).toBe(true);
  });

  it('switches Draw to Pass only when the stock cannot be rebuilt', () => {
    expect(passInsteadOfDraw(state(), 0)).toBe(false);
    expect(
      passInsteadOfDraw(
        state({
          hands: { '0': ['QH'], '1': ['AD'] },
          stock: [],
          discardPile: ['5H'],
          currentSuit: 'S',
        }),
        0,
      ),
    ).toBe(true);
  });

  it('names the subscribed winner and score', () => {
    expect(
      finishedLine(
        state({
          phase: 'finished',
          winnerSeatIndex: 0,
          scores: { '0': 63, '1': 0 },
        }),
        [{ seatIndex: 0, name: 'Ada' }],
      ),
    ).toBe('Winner seat 0 Ada 63');
  });
});
