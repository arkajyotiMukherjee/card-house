import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { SpadesState } from '../../src/shared/games/spades';
import { bluffStatusHud, spadesStatusHud } from './status-hud';

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

function spadesState(overrides: Partial<SpadesState> = {}): SpadesState {
  return {
    phase: 'play',
    stage: 'bid',
    hands: { '0': ['AS'], '1': ['2H'] },
    bids: { '0': null, '1': null },
    tricks: { '0': 0, '1': 0 },
    trick: [],
    lastTrick: null,
    spadesBroken: false,
    turnSeatIndex: 0,
    dealerSeatIndex: 3,
    scores: { ns: 0, ew: 0 },
    bags: { ns: 0, ew: 0 },
    handNumber: 2,
    winnerTeam: null,
    tableId: 'table-spades',
    ...overrides,
  };
}

describe('spadesStatusHud', () => {
  it('names the bidder, the bid phase, and the hand', () => {
    expect(spadesStatusHud(spadesState(), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Bid',
      round: 'Hand: 2',
    });
  });

  it('switches to play while tricks are in progress', () => {
    const lines = spadesStatusHud(
      spadesState({ stage: 'trick', turnSeatIndex: 1 }),
      seats,
    );
    expect(lines.turn).toBe('Turn: Bea');
    expect(lines.phase).toBe('Phase: Play');
  });
});
