import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { SpadesState } from '../../src/shared/games/spades';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import { SpadesDriver } from './spades-driver';

function state(overrides: Partial<SpadesState> = {}): SpadesState {
  return {
    phase: 'play',
    stage: 'trick',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    bids: { '0': 1, '1': 1 },
    tricks: { '0': 0, '1': 0 },
    trick: [],
    lastTrick: null,
    spadesBroken: true,
    turnSeatIndex: 0,
    dealerSeatIndex: 1,
    scores: { ns: 0, ew: 0 },
    bags: { ns: 0, ew: 0 },
    handNumber: 1,
    winnerTeam: null,
    tableId: 'table-spades',
    ...overrides,
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

describe('SpadesDriver input', () => {
  it('sends a bid and a play for the selected card', () => {
    const driver = new SpadesDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const bidding = state({ stage: 'bid', turnSeatIndex: 0 });
    driver.handleInput({ type: 'pointerup', target: 'bid:3' }, bidding, ctx);
    const table = state();
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '10H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([
      { type: 'bid', tricks: 3 },
      { type: 'play', card: '10H' },
    ]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new SpadesDriver();
    const sent: unknown[] = [];
    const table = state({ turnSeatIndex: 1 });
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerenter', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', card: '' }]);
  });

  it('forwards a play with no card for the module to reject', () => {
    const driver = new SpadesDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'play' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'play', card: '' }]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new SpadesDriver();
    const sent: unknown[] = [];
    const table = state({ phase: 'finished', winnerTeam: 'ns' });
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'bid:1' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores bids, cards, and Play while an overlay is open', () => {
    const driver = new SpadesDriver();
    const sent: unknown[] = [];
    const table = state();
    const bidding = state({ stage: 'bid' });
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: 'bid:2' }, bidding, open);
    driver.handleInput({ type: 'pointerup', target: 'AS' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, open);
    expect(sent).toEqual([]);

    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([{ type: 'play', card: '' }]);
  });
});
