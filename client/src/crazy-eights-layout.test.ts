import { describe, expect, it } from 'vitest';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import { CARD_DRAW, HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import {
  DRAW_BUTTON,
  PLAY_BUTTON,
  SUIT_BUTTON_H,
  SUIT_BUTTON_Y,
  SUIT_BUTTONS,
  finishedLine,
  handPositions,
  legalCard,
  passInsteadOfDraw,
  pilePositions,
  stockPositions,
  suitBadge,
  discardPositions,
  topIsWildEight,
} from './crazy-eights-layout';
import {
  ACTION_CLUSTER,
  PICKER_Y,
  belowFelt,
  insideCluster,
} from './table-presentation';

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
    expect(belowFelt(PLAY_BUTTON)).toBe(true);
    expect(insideCluster(PLAY_BUTTON)).toBe(true);
    expect(insideCluster(DRAW_BUTTON)).toBe(true);
    expect(SUIT_BUTTON_Y).toBe(PICKER_Y);
    expect(SUIT_BUTTONS[0]?.x).toBeLessThan(SUIT_BUTTONS[3]?.x ?? 0);
    const lastSuit = SUIT_BUTTONS[3];
    expect(lastSuit).toBeDefined();
    if (lastSuit) {
      expect(lastSuit.x + 64).toBeLessThanOrEqual(ACTION_CLUSTER.x);
      expect(SUIT_BUTTON_H).toBe(PLAY_BUTTON.h);
    }
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
    expect(suitBadge(state())).toEqual({ text: 'Suit: Spades', suit: 'S' });
    expect(suitBadge(state({ discardPile: ['8H'], currentSuit: 'D' }))).toEqual(
      {
        text: 'Wild 8: Diamonds',
        suit: 'D',
      },
    );
    expect(
      suitBadge(state({ discardPile: ['8H'], currentSuit: null })),
    ).toEqual({ text: 'Wild 8: any suit', suit: null });
    expect(topIsWildEight(state())).toBe(false);
    expect(topIsWildEight(state({ discardPile: ['8H'] }))).toBe(true);
  });

  it('fans at most three discards so the stock stays clear', () => {
    expect(discardPositions(1)).toHaveLength(1);
    expect(discardPositions(30)).toHaveLength(3);
    const left = Math.min(...discardPositions(30).map((slot) => slot.x));
    const stockRight = stockPositions(3).at(-1)!.x + CARD_DRAW / 2;
    expect(left - CARD_DRAW / 2).toBeGreaterThan(stockRight);
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
