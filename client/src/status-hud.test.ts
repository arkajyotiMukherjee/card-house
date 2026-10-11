import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { PresidentState } from '../../src/shared/games/president';
import { bluffStatusHud, presidentStatusHud } from './status-hud';

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

function presidentState(overrides: Partial<PresidentState>): PresidentState {
  return {
    phase: 'play',
    hands: { '0': ['3C'], '1': ['4S'] },
    playPile: ['KS'],
    currentRank: 'K',
    currentCount: 1,
    passes: 0,
    turnSeatIndex: 1,
    lastPlay: { seat: 0, cards: ['KS'], rank: 'K' },
    openingLead: false,
    finishOrder: [],
    rankOrder: [],
    winnerSeatIndex: null,
    ...overrides,
  };
}

describe('presidentStatusHud', () => {
  it('names the player on turn and the rank to beat', () => {
    expect(presidentStatusHud(presidentState({}), seats)).toEqual({
      turn: 'Turn: Bea',
      phase: 'Phase: Play',
      round: 'Round: 1xK',
    });
  });

  it('shows a lead, then the President title when the hand ends', () => {
    expect(
      presidentStatusHud(
        presidentState({
          turnSeatIndex: 0,
          currentRank: null,
          currentCount: 0,
          playPile: [],
          lastPlay: null,
        }),
        seats,
      ).round,
    ).toBe('Round: Lead');
    const lines = presidentStatusHud(
      presidentState({
        phase: 'finished',
        turnSeatIndex: null,
        currentRank: null,
        currentCount: 0,
        winnerSeatIndex: 0,
        rankOrder: [
          { seat: 0, title: 'President', score: 2 },
          { seat: 1, title: 'Scum', score: 1 },
        ],
      }),
      seats,
    );
    expect(lines.turn).toBe('Turn: -');
    expect(lines.phase).toBe('Phase: Finished');
    expect(lines.round).toBe('Round: President');
  });
});
