import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import type { CrazyEightsState } from '../../src/shared/games/crazy-eights';
import type { GoFishState } from '../../src/shared/games/go-fish';
import type { PresidentState } from '../../src/shared/games/president';
import type { RummyState } from '../../src/shared/games/rummy';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import type { SpadesState } from '../../src/shared/games/spades';
import type { HeartsState } from '../../src/shared/games/hearts';
import type { PokerState } from '../../src/shared/games/poker';
import {
  blackjackStatusHud,
  bluffStatusHud,
  crazyEightsStatusHud,
  goFishStatusHud,
  heartsStatusHud,
  pokerStatusHud,
  presidentStatusHud,
  rummyStatusHud,
  spadesStatusHud,
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
    passed: [],
    playCounts: {},
    turnCounts: {},
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
      round: 'Round: Ace',
    });
  });

  it('follows the turn and required rank when they pass', () => {
    const lines = bluffStatusHud(
      state({ turnSeatIndex: 1, requiredRank: '10' }),
      seats,
    );
    expect(lines.turn).toBe('Turn: Bea');
    expect(lines.round).toBe('Round: Ten');
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

function blackjackState(
  overrides: Partial<BlackjackState> = {},
): BlackjackState {
  return {
    phase: 'play',
    step: 'act',
    deck: [],
    dealer: ['AS', 'KH'],
    holeHidden: true,
    seats: {},
    turnSeatIndex: 0,
    winnerSeatIndexes: [],
    ...overrides,
  };
}

describe('blackjackStatusHud', () => {
  it('names the betting seat and the play seat', () => {
    expect(blackjackStatusHud(blackjackState({ step: 'bet' }), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Betting',
      round: 'Round: Bets',
    });
    expect(blackjackStatusHud(blackjackState(), seats)).toEqual({
      turn: 'Turn: Ada',
      phase: 'Phase: Play',
      round: 'Round: Hand',
    });
  });

  it('clears the turn when the round is finished', () => {
    expect(
      blackjackStatusHud(
        blackjackState({ phase: 'finished', turnSeatIndex: null }),
        seats,
      ),
    ).toEqual({
      turn: 'Turn: -',
      phase: 'Phase: Finished',
      round: 'Round: Done',
    });
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

function pokerState(overrides: Partial<PokerState> = {}): PokerState {
  return {
    phase: 'play',
    variation: 'omaha',
    street: 'flop',
    step: 'bet',
    handNumber: 1,
    deck: [],
    board: [],
    seats: {},
    order: [0, 1],
    dealerSeatIndex: 0,
    turnSeatIndex: 1,
    currentBet: 0,
    minRaise: 20,
    pot: 40,
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: 10,
    bigBlind: 20,
    limit: 'pot-limit',
    ...overrides,
  };
}

describe('pokerStatusHud', () => {
  it('names the street, the player, and the variation', () => {
    expect(pokerStatusHud(pokerState(), seats)).toEqual({
      turn: 'Turn: Bea',
      phase: 'Phase: Flop',
      round: 'Round: Omaha',
    });
    expect(pokerStatusHud(pokerState({ step: 'discard' }), seats).phase).toBe(
      'Phase: Discard',
    );
    expect(pokerStatusHud(pokerState({ turnSeatIndex: 4 }), []).turn).toBe(
      'Turn: Player',
    );
    expect(
      pokerStatusHud(
        pokerState({ phase: 'finished', end: 'showdown', turnSeatIndex: null }),
        seats,
      ).phase,
    ).toBe('Phase: Showdown');
    expect(
      pokerStatusHud(
        pokerState({ phase: 'finished', end: 'fold', turnSeatIndex: null }),
        seats,
      ).phase,
    ).toBe('Phase: Hand');
  });
});
