import { describe, expect, it } from 'vitest';
import type { Scene } from 'excalibur';
import type { HeartsState } from '../../src/shared/games/hearts';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import { HeartsDriver } from './hearts-driver';

function state(phase: HeartsState['phase'] = 'play'): HeartsState {
  return {
    phase,
    hands: {
      '0': ['2C', 'AH', '3H'],
      '1': ['KD'],
      '2': ['4D'],
      '3': ['5D'],
    },
    tricksTaken: { '0': [], '1': [], '2': [], '3': [] },
    currentTrick: [],
    scores: { '0': 0, '1': 0, '2': 0, '3': 0 },
    handIndex: 0,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    tableId: 'table-hearts',
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

describe('HeartsDriver input', () => {
  it('sends a play of the selected card and a pass of three cards', () => {
    const driver = new HeartsDriver();
    const sent: unknown[] = [];
    const ctx = context(sent, 0);
    const table = state('pass');
    driver.handleInput({ type: 'pointerup', target: 'AH' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '3H' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: '2C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, ctx);
    const playing = state('play');
    playing.heartsBroken = true;
    playing.tricksTaken = {
      '0': ['6D', '7D', '8D', '9D'],
      '1': [],
      '2': [],
      '3': [],
    };
    driver.handleInput({ type: 'pointerup', target: 'AH' }, playing, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, playing, ctx);
    expect(sent).toEqual([
      { type: 'pass', cards: ['2C', 'AH', '3H'] },
      { type: 'play', card: 'AH' },
    ]);
  });

  it('does not select a card when it is not your turn', () => {
    const driver = new HeartsDriver();
    const sent: unknown[] = [];
    const table = state();
    table.turnSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: '2C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    expect(sent).toEqual([{ type: 'play', card: '' }]);
  });

  it('sends an empty play for the module to reject', () => {
    const driver = new HeartsDriver();
    const sent: unknown[] = [];
    driver.handleInput(
      { type: 'pointerup', target: 'play' },
      state(),
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'play', card: '' }]);
  });

  it('does not send a move after the rules finish', () => {
    const driver = new HeartsDriver();
    const sent: unknown[] = [];
    const table = state('finished');
    table.winnerSeatIndex = 1;
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: '2C' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, ctx);
    expect(sent).toEqual([]);
  });

  it('ignores card, Pass, and Play input while an overlay is open', () => {
    const driver = new HeartsDriver();
    const sent: unknown[] = [];
    const table = state();
    const open = context(sent, 0, true);
    driver.handleInput({ type: 'pointerup', target: '2C' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, open);
    driver.handleInput({ type: 'pointerup', target: 'pass' }, table, open);
    expect(sent).toEqual([]);

    const closed = context(sent, 0, false);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([{ type: 'play', card: '' }]);
    driver.handleInput({ type: 'pointerup', target: '2C' }, table, closed);
    driver.handleInput({ type: 'pointerup', target: 'play' }, table, closed);
    expect(sent).toEqual([
      { type: 'play', card: '' },
      { type: 'play', card: '2C' },
    ]);
  });
});
