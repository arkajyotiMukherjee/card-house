import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { RummyState } from '../../src/shared/games/rummy';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import { RummyDriver } from './rummy-driver';

function state(): RummyState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H', '3H'], '1': ['KD'] },
    stock: ['2C'],
    discardPile: ['4S'],
    melds: [{ seat: 1, cards: ['5D', '6D', '7D'] }],
    turnSeatIndex: 0,
    drawn: true,
    scores: {},
    winnerSeatIndex: null,
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

describe('RummyDriver input', () => {
  it('submits one layoff when a tap hits several overlapping meld cards', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: '3H' }, table, ctx);
    const input = driver as unknown as {
      cards: Map<string, unknown>;
      roles: Map<string, { kind: string; meldIndex: number }>;
      cardPressAt(id: string, x: number, y: number): void;
    };
    ['5D', '6D', '7D'].forEach((id, index) => {
      input.cards.set(id, {
        actor: { pos: { x: 300 + index * 18, y: 200 }, z: index },
        faceUp: true,
        moving: false,
      });
      input.roles.set(id, { kind: 'meld', meldIndex: 0 });
    });
    for (const id of ['5D', '6D', '7D']) input.cardPressAt(id, 320, 200);
    expect(sent).toEqual([{ type: 'layoff', meldIndex: 0, cards: ['3H'] }]);
  });

  it('sends draw, meld, discard, and layoff intents', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    table.drawn = false;
    driver.handleInput({ type: 'pointerup', target: 'draw-stock' }, table, ctx);
    driver.handleInput(
      { type: 'pointerup', target: 'draw-discard' },
      table,
      ctx,
    );
    table.drawn = true;
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '10H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'meld' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'meld:0' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '10H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'discard' }, table, ctx);
    expect(sent).toEqual([
      { type: 'draw', source: 'stock' },
      { type: 'draw', source: 'discard' },
      { type: 'meld', cards: ['AS', '10H'] },
      { type: 'layoff', meldIndex: 0, cards: ['AS', '10H'] },
      { type: 'discard', card: 'AS' },
    ]);
  });

  it('still sends an empty meld so the module can reject it', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'meld' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'meld', cards: [] }]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'meld' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores actions from the inactive draw stage or a spectator', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    for (const target of ['draw-stock', 'draw-discard']) {
      driver.handleInput({ type: 'pointerup', target }, table, ctx);
    }
    table.drawn = false;
    for (const target of ['meld', 'discard', 'meld:0']) {
      driver.handleInput({ type: 'pointerup', target }, table, ctx);
    }
    driver.handleInput(
      { type: 'pointerup', target: 'draw-stock' },
      table,
      context(sent, null),
    );
    expect(sent).toEqual([]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const table = state();
    table.phase = 'finished';
    table.winnerSeatIndex = 0;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'draw-stock' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'meld' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'discard' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores table input while an overlay is open', () => {
    const driver = new RummyDriver();
    const sent: unknown[] = [];
    const table = state();
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, open);
    driver.handleInput(
      { type: 'pointerup', target: 'draw-stock' },
      table,
      open,
    );
    driver.handleInput({ type: 'pointerup', target: 'meld' }, table, open);
    expect(sent).toEqual([]);
    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'discard' }, table, closed);
    expect(sent).toEqual([{ type: 'discard', card: '' }]);
  });
});
