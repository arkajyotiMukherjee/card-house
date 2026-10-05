import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { BluffState } from '../../src/shared/games/bluff';
import { BluffDriver } from './bluff-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';

function state(): BluffState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    discardPile: [],
    requiredRank: 'A',
    turnSeatIndex: 0,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

function context(sent: unknown[], seatIndex: number | null): RenderContext {
  return {
    scene: {} as Scene,
    seats: [
      { seatIndex: 0, name: 'Ada', self: seatIndex === 0, x: 480, y: 456 },
    ],
    meSeatIndex: seatIndex,
    cards: {} as CardAtlas,
    sendIntent: (intent) => {
      sent.push(intent);
    },
  };
}

describe('BluffDriver input', () => {
  it('sends a play intent for the selected card and a challenge intent', () => {
    const driver = new BluffDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'challenge' }, table, ctx);
    expect(sent).toEqual([
      { type: 'play', cards: ['AS'] },
      { type: 'challenge' },
    ]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new BluffDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerenter', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([]);
  });
});
