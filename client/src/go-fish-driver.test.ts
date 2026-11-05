import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'excalibur';
import type { GoFishState } from '../../src/shared/games/go-fish';
import { GoFishDriver } from './go-fish-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';

vi.mock('./canvas-ui', async () => {
  const { GraphicsGroup } = await import('excalibur');
  return {
    canvasText: () => new GraphicsGroup({ members: [] }),
    panelRect: () => new GraphicsGroup({ members: [] }),
  };
});

function state(): GoFishState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    stock: ['2C'],
    books: { '0': [], '1': [] },
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    lastAsk: null,
  };
}

function context(
  sent: unknown[],
  seatIndex: number | null,
  blocked = false,
): RenderContext {
  return {
    scene: new Scene(),
    seats: [
      { seatIndex: 0, name: 'Ada', self: seatIndex === 0, x: 480, y: 456 },
      { seatIndex: 1, name: 'Bea', self: seatIndex === 1, x: 780, y: 310 },
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

describe('GoFishDriver input', () => {
  it('sends an ask for the selected rank', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    expect(sent).toEqual([{ type: 'ask', targetSeat: 1, rank: 'A' }]);
  });

  it('switches the asked rank when another card is selected', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '10H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    expect(sent).toEqual([{ type: 'ask', targetSeat: 1, rank: '10' }]);
  });

  it('ignores Ask until a rank is selected', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'ask:1' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores Ask after deselecting the rank or losing the turn', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    table.turnSeatIndex = 1;
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const table = state();
    table.phase = 'finished';
    table.winnerSeatIndex = 0;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores card and Ask input while an overlay is open', () => {
    const driver = new GoFishDriver();
    const sent: unknown[] = [];
    const table = state();
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, open);
    expect(sent).toEqual([]);

    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, closed);
    driver.handleInput({ type: 'pointerup', target: 'ask:1' }, table, closed);
    expect(sent).toEqual([{ type: 'ask', targetSeat: 1, rank: 'A' }]);
  });
});
