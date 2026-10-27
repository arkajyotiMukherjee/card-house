import { describe, expect, it } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { PokerDriver } from './poker-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import type { Scene } from 'excalibur';

function seat(
  chips: number,
  hole: string[],
  streetBet: number,
): PokerState['seats'][string] {
  return {
    chips,
    hole,
    streetBet,
    committed: 20,
    folded: false,
    allIn: false,
    acted: false,
    mustDiscard: false,
  };
}

function state(overrides: Partial<PokerState> = {}): PokerState {
  return {
    phase: 'play',
    variation: 'holdem',
    street: 'flop',
    step: 'bet',
    handNumber: 1,
    deck: [],
    board: ['2C', '3D', '4H'],
    seats: {
      '0': seat(980, ['AS', 'KD'], 0),
      '1': seat(980, ['QC', 'JH'], 0),
    },
    order: [0, 1],
    dealerSeatIndex: 0,
    turnSeatIndex: 0,
    currentBet: 0,
    minRaise: 20,
    pot: 40,
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
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

describe('PokerDriver input', () => {
  it('sends fold, check, and the minimum bet on your turn', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'fold' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'check' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    expect(sent).toEqual([
      { type: 'fold' },
      { type: 'check' },
      { type: 'bet', amount: 20 },
    ]);
  });

  it('sends call and the minimum raise when facing a bet', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state({
      currentBet: 20,
      seats: {
        '0': seat(980, ['AS', 'KD'], 0),
        '1': seat(960, ['QC', 'JH'], 20),
      },
    });
    driver.handleInput(
      { type: 'pointerup', target: 'call' },
      table,
      context(sent, 0),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'raise' },
      table,
      context(sent, 0),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'check' },
      table,
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'call' }, { type: 'raise', amount: 40 }]);
  });

  it('sends a discard for the clicked hole card in Oklahoma', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state({
      variation: 'oklahoma',
      limit: 'pot-limit',
      step: 'discard',
      seats: {
        '0': {
          ...seat(980, ['AS', 'KD', 'QC', 'JH'], 0),
          mustDiscard: true,
        },
      },
    });
    driver.handleInput(
      { type: 'pointerup', target: 'KD' },
      table,
      context(sent, 0),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'bet' },
      table,
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'discard', card: 'KD' }]);
  });

  it('does not send a move when it is not your turn or the overlay is open', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state();
    driver.handleInput(
      { type: 'pointerup', target: 'fold' },
      table,
      context(sent, 1),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'check' },
      table,
      context(sent, 0, true),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'fold' },
      { ...table, phase: 'finished', end: 'fold', winnerSeatIndexes: [1] },
      context(sent, 0),
    );
    expect(sent).toEqual([]);
  });
});
