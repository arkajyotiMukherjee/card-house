import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import { CrazyEightsDriver } from './crazy-eights-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';

function state(): CrazyEightsState {
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

describe('CrazyEightsDriver input', () => {
  it('ignores action taps while waiting and while spectating', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    for (const seat of [0, null]) {
      for (const target of ['play', 'draw', 'suit:H'])
        driver.handleInput(
          { type: 'pointerup', target },
          table,
          context(sent, seat),
        );
    }
    expect(sent).toEqual([]);
  });
  it('plays the selected match and only draws when no card is playable', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: '5H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'draw' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', card: '5H' }]);
    table.hands['0'] = ['QH'];
    driver.handleInput({ type: 'pointerup', target: 'draw' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', card: '5H' }, { type: 'draw' }]);
  });

  it('sends an eight with the named suit', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: '8C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([]);
    driver.handleInput({ type: 'pointerup', target: 'suit:D' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', card: '8C', suit: 'D' }]);
  });

  it('does not select a card that cannot be played', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'QH' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores Play until a card is selected', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'play' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([]);
  });

  it('sends a pass when nothing can be drawn', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const table = state();
    table.hands = { '0': ['QH'], '1': ['AD'] };
    table.stock = [];
    table.discardPile = ['5H'];
    table.currentSuit = 'S';
    driver.handleInput(
      { type: 'pointerup', target: 'draw' },
      table,
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'pass' }]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const table = state();
    table.phase = 'finished';
    table.winnerSeatIndex = 0;
    table.scores = { '0': 12 };
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: '5H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'draw' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores play, draw, and suit input while an overlay is open', () => {
    const driver = new CrazyEightsDriver();
    const sent: unknown[] = [];
    const table = state();
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: '8C' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'suit:H' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'draw' }, table, open);
    expect(sent).toEqual([]);

    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([]);
  });
});
