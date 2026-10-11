import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { HeartsState } from '../../src/shared/games/hearts';
import { bluffStatusHud, heartsStatusHud } from './status-hud';

const seats = [
  { seatIndex: 0, name: 'Ada' },
  { seatIndex: 1, name: 'Bea' },
];

function state(overrides: Partial<BluffState>): BluffState {
  return {
    phase: 'play',
    hands: { '0': ['AS'], '1': ['2S'] },
    discardPile: [],
    requiredRank: 'A',
    turnSeatIndex: 0,
    lastPlay: null,
    winnerSeatIndex: null,
    ...overrides,
  };
}

describe('bluffStatusHud', () => {
  it('names the player on turn, the phase, and the round', () => {
    expect(bluffStatusHud(state({}), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Round: 1/13 (A)',
    });
  });

  it('follows the turn and required rank when they pass', () => {
    const lines = bluffStatusHud(
      state({ turnSeatIndex: 1, requiredRank: '10' }),
      seats,
    );
    expect(lines.turn).toBe('Turn: Bea');
    expect(lines.round).toBe('Round: 10/13 (10)');
  });

  it('falls back to the seat index without a seated name', () => {
    expect(bluffStatusHud(state({ turnSeatIndex: 4 }), seats).turn).toBe(
      'Turn: Seat 4',
    );
  });

  it('truncates a long name', () => {
    const lines = bluffStatusHud(state({}), [
      { seatIndex: 0, name: 'A very long player name' },
    ]);
    expect(lines.turn).toBe('Turn: A very long pl');
  });

  it('has no player or round before the deal', () => {
    expect(
      bluffStatusHud(
        state({ phase: 'lobby', hands: {}, turnSeatIndex: null }),
        [],
      ),
    ).toEqual({
      turn: 'Turn: -',
      phase: 'Phase: Waiting',
      round: 'Round: -',
    });
  });

  it('shows no player once the game is finished', () => {
    const lines = bluffStatusHud(
      state({ phase: 'finished', turnSeatIndex: null, winnerSeatIndex: 0 }),
      seats,
    );
    expect(lines.turn).toBe('Turn: -');
    expect(lines.phase).toBe('Phase: Finished');
  });
});

function heartsState(overrides: Partial<HeartsState> = {}): HeartsState {
  return {
    phase: 'play',
    hands: { '0': ['2C'], '1': ['3C'], '2': ['4C'], '3': ['5C'] },
    tricksTaken: { '0': [], '1': [], '2': [], '3': [] },
    currentTrick: [],
    scores: { '0': 0, '1': 0, '2': 0, '3': 0 },
    handIndex: 0,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    tableId: 'table-hearts',
    ...overrides,
  };
}

describe('heartsStatusHud', () => {
  it('names the player on turn, the phase, and the hand', () => {
    expect(heartsStatusHud(heartsState(), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Round: Hand 1',
    });
  });

  it('shows the pass direction while cards are passing', () => {
    expect(
      heartsStatusHud(
        heartsState({ phase: 'pass', turnSeatIndex: null }),
        seats,
      ),
    ).toEqual({
      turn: 'Turn: Passing',
      phase: 'Phase: Passing',
      round: 'Round: Left',
    });
  });
});
