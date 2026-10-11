import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { PresidentState } from '../../src/shared/games/president';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import { PresidentDriver } from './president-driver';

function state(): PresidentState {
  return {
    phase: 'play',
    hands: { '0': ['3C', 'KH'], '1': ['4S'] },
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: 0,
    lastPlay: null,
    openingLead: true,
    finishOrder: [],
    rankOrder: [],
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
    sendIntent: (intent) => {
      sent.push(intent);
    },
    inputBlocked: () => blocked,
  };
}

describe('PresidentDriver input', () => {
  it('sends a play intent for the selected card and a pass intent', () => {
    const driver = new PresidentDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: '3C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', cards: ['3C'] }, { type: 'pass' }]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new PresidentDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerenter', target: '3C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '3C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', cards: [] }]);
  });

  it('forwards a play with no card for the module to reject', () => {
    const driver = new PresidentDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'play' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'play', cards: [] }]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new PresidentDriver();
    const sent: unknown[] = [];
    const table = state();
    table.phase = 'finished';
    table.winnerSeatIndex = 0;
    table.rankOrder = [{ seat: 0, title: 'President', score: 2 }];
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: '3C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores card, Play, and Pass input while an overlay is open', () => {
    const driver = new PresidentDriver();
    const sent: unknown[] = [];
    const table = state();
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: '3C' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, open);
    expect(sent).toEqual([]);

    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([{ type: 'play', cards: [] }]);
    driver.handleInput({ type: 'pointerup', target: '3C' }, table, closed);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([
      { type: 'play', cards: [] },
      { type: 'play', cards: ['3C'] },
    ]);
  });
});
