import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import type { GoFishState } from '../../src/shared/games/go-fish';
import type { PresidentState } from '../../src/shared/games/president';
import type { RummyState } from '../../src/shared/games/rummy';
import {
  bluffStatusHud,
  crazyEightsStatusHud,
  goFishStatusHud,
  presidentStatusHud,
  rummyStatusHud,
} from './status-hud';

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

function goFish(overrides: Partial<GoFishState>): GoFishState {
  return {
    phase: 'play',
    hands: { '0': ['AS'], '1': ['2S'] },
    stock: ['3D'],
    books: {
      '0': [{ rank: 'K', cards: ['KS', 'KH', 'KD', 'KC'] }],
      '1': [],
    },
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    lastAsk: null,
    ...overrides,
  };
}

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

describe('goFishStatusHud', () => {
  it('names the player on turn and their book count', () => {
    expect(goFishStatusHud(goFish({}), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Books: 1',
    });
  });

  it('shows a tie when the rules finish even', () => {
    expect(
      goFishStatusHud(
        goFish({
          phase: 'finished',
          turnSeatIndex: null,
          winnerSeatIndex: null,
        }),
        seats,
      ).round,
    ).toBe('Books: tie');
  });
});

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

function rummyState(overrides: Partial<RummyState>): RummyState {
  return {
    phase: 'play',
    hands: { '0': ['AS'], '1': ['KH'] },
    stock: ['2C', '3D'],
    discardPile: ['4S'],
    melds: [],
    turnSeatIndex: 0,
    drawn: false,
    scores: {},
    winnerSeatIndex: null,
    ...overrides,
  };
}

describe('rummyStatusHud', () => {
  it('names the player on turn and the stock', () => {
    expect(rummyStatusHud(rummyState({}), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Round: Stock 2',
    });
  });

  it('shows the winner score when the hand is over', () => {
    expect(
      rummyStatusHud(
        rummyState({
          phase: 'finished',
          turnSeatIndex: null,
          winnerSeatIndex: 1,
          scores: { '0': 1, '1': 0 },
        }),
        seats,
      ),
    ).toEqual({
      turn: 'Turn: -',
      phase: 'Phase: Finished',
      round: 'Round: Score 0',
    });
  });
});
