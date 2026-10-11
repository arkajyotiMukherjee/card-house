import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import { bluffStatusHud, crazyEightsStatusHud } from './status-hud';

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

function crazyState(overrides: Partial<CrazyEightsState>): CrazyEightsState {
  return {
    phase: 'play',
    hands: { '0': ['8H'], '1': ['2S'] },
    stock: ['9D'],
    discardPile: ['5S'],
    currentSuit: 'S',
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
    ...overrides,
  };
}

describe('crazyEightsStatusHud', () => {
  it('names the player on turn and the suit in play', () => {
    expect(crazyEightsStatusHud(crazyState({}), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Suit: Spades',
    });
  });

  it('asks for a suit while a starter eight is unanswered', () => {
    expect(
      crazyEightsStatusHud(
        crazyState({ currentSuit: null, discardPile: ['8C'] }),
        seats,
      ).round,
    ).toBe('Suit: pick');
  });

  it('shows the winner score when the hand is over', () => {
    expect(
      crazyEightsStatusHud(
        crazyState({
          phase: 'finished',
          turnSeatIndex: null,
          winnerSeatIndex: 1,
          scores: { '0': 0, '1': 50 },
        }),
        seats,
      ),
    ).toEqual({
      turn: 'Turn: -',
      phase: 'Phase: Finished',
      round: 'Score: 50',
    });
  });
});
