import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import { BlackjackDriver } from './blackjack-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';

function state(step: BlackjackState['step'] = 'act'): BlackjackState {
  return {
    phase: 'play',
    step,
    deck: [],
    dealer: ['AS', '10H'],
    holeHidden: true,
    seats: {
      '0': {
        chips: 190,
        bet: 10,
        hands: [{ cards: ['9S', '8D'], bet: 10, done: false }],
        handIndex: 0,
        results: [],
      },
    },
    turnSeatIndex: 0,
    winnerSeatIndexes: [],
  };
}

function context(
  sent: unknown[],
  seatIndex: number | null,
  blocked = false,
): RenderContext {
  return {
    scene: {} as Scene,
    seats: [
      { seatIndex: 0, name: 'Ada', self: seatIndex === 0, x: 480, y: 456 },
    ],
    meSeatIndex: seatIndex,
    cards: {} as CardAtlas,
    myCards: {} as CardAtlas,
    sendIntent: (intent) => {
      sent.push(intent);
    },
    inputBlocked: () => blocked,
  };
}

describe('BlackjackDriver input', () => {
  it('sends hit, stand, double, and split on your turn', () => {
    const driver = new BlackjackDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: 'hit' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stand' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'double' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'split' }, table, ctx);
    expect(sent).toEqual([
      { type: 'hit' },
      { type: 'stand' },
      { type: 'double' },
      { type: 'split' },
    ]);
  });

  it('sends a bet during the betting step', () => {
    const driver = new BlackjackDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'bet:25' },
      state('bet'),
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'bet', amount: 25 }]);
  });

  it('does not send a move when it is not your turn', () => {
    const driver = new BlackjackDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const betting = state('bet');
    betting.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'hit' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'bet:10' }, betting, ctx);
    expect(sent).toEqual([]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new BlackjackDriver();
    const sent: unknown[] = [];
    const table = state();
    table.phase = 'finished';
    table.winnerSeatIndexes = [0];
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'hit' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stand' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores buttons while an overlay is open', () => {
    const driver = new BlackjackDriver();
    const sent: unknown[] = [];
    const table = state();
    driver.handleInput(
      { type: 'pointerup', target: 'hit' },
      table,
      context(sent, 0, true),
    );
    expect(sent).toEqual([]);
    driver.handleInput(
      { type: 'pointerup', target: 'hit' },
      table,
      context(sent, 0, false),
    );
    expect(sent).toEqual([{ type: 'hit' }]);
  });
});
