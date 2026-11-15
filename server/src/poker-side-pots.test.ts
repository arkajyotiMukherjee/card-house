const assert = {
  equal(
    actual: unknown,
    expected: unknown,
    message = 'values must match',
  ): void {
    if (actual !== expected)
      throw new Error(`${message}: ${String(actual)} != ${String(expected)}`);
  },
  deepEqual(
    actual: unknown,
    expected: unknown,
    message = 'values must match',
  ): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
      );
  },
  throws(run: () => unknown, pattern: RegExp): void {
    let error: unknown;
    try {
      run();
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof Error) || !pattern.test(error.message))
      throw new Error('expected rule rejection');
  },
};
import {
  advancePoker,
  pokerPotBreakdown,
  pokerPotWinners,
  pokerPotAwards,
  pokerRules,
  type PokerState,
} from '../../src/shared/games/poker.ts';
import type { GameTable } from '../../src/shared/games/game-rules.ts';

const table: GameTable = {
  id: 'side-proof',
  lobbyId: 'proof',
  gameType: 'poker',
  name: 'Side pots',
  status: 'in_progress',
  minPlayers: 2,
  maxPlayers: 8,
  stateJson: '{}',
  createdAt: 1,
};
function state(
  amounts: readonly number[],
  allIn: readonly number[] = amounts.map((_, i) => i),
): PokerState {
  return {
    phase: 'play',
    variation: 'holdem',
    street: 'river',
    step: 'runout',
    handNumber: 1,
    deck: [],
    board: ['AH', 'AD', 'AC', '7S', '8S'],
    seats: Object.fromEntries(
      amounts.map((committed, i) => [
        String(i),
        {
          chips: allIn.includes(i) ? 0 : 1000,
          hole: [
            ['AS', 'KS'],
            ['9C', '9D'],
            ['7D', '7C'],
            ['2D', '3D'],
            ['4D', '5D'],
            ['6C', '6D'],
            ['8C', '8D'],
            ['10C', '10D'],
          ][i],
          streetBet: 0,
          committed,
          folded: false,
          allIn: allIn.includes(i),
          acted: true,
          mustDiscard: false,
        },
      ]),
    ),
    order: amounts.map((_, i) => i),
    dealerSeatIndex: 0,
    turnSeatIndex: null,
    currentBet: 0,
    minRaise: 20,
    pot: amounts.reduce((a, b) => a + b, 0),
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
  };
}
const normal = state([5, 10, 0], []);
assert.equal(
  pokerPotBreakdown(normal).pots.length,
  1,
  'unequal blinds are not side pots',
);
const pending = state([100, 200, 500, 200], [0, 1]);
assert.deepEqual(
  pokerPotBreakdown(pending),
  {
    pots: [
      { amount: 400, eligible: [0, 1, 2, 3] },
      { amount: 300, eligible: [1, 2, 3] },
    ],
    unmatched: { seat: 2, amount: 300 },
  },
  'unanswered raise stays pending; future callers remain eligible',
);
const called = structuredClone(pending);
called.seats['3']!.committed = 500;
called.pot += 300;
assert.deepEqual(pokerPotBreakdown(called), {
  pots: [
    { amount: 400, eligible: [0, 1, 2, 3] },
    { amount: 300, eligible: [1, 2, 3] },
    { amount: 600, eligible: [2, 3] },
  ],
  unmatched: null,
});
const shortPending = structuredClone(pending);
shortPending.seats['3']!.committed = 10;
shortPending.seats['3']!.chips = 10;
assert.equal(
  pokerPotBreakdown(shortPending).pots[0]!.eligible.includes(3),
  false,
  'a funded short caller cannot be advertised as eligible above their whole stack',
);
const dead = state([100, 200, 400, 400, 150], [0, 1, 2]);
dead.seats['4']!.folded = true;
assert.deepEqual(
  pokerPotBreakdown(dead).pots,
  [
    { amount: 500, eligible: [0, 1, 2, 3] },
    { amount: 350, eligible: [1, 2, 3] },
    { amount: 400, eligible: [2, 3] },
  ],
  'folded 150 funds pots without a redundant cutoff or winning claim',
);
const max = state([100, 200, 300, 400, 500, 600, 700, 800]);
const maximum = pokerPotBreakdown(max);
assert.deepEqual(
  maximum.pots.map((p) => p.amount),
  [800, 700, 600, 500, 400, 300, 200],
);
assert.deepEqual(
  maximum.pots.map((p) => p.eligible.length),
  [8, 7, 6, 5, 4, 3, 2],
);
assert.deepEqual(maximum.unmatched, { seat: 7, amount: 100 });
assert.equal(
  maximum.pots.reduce((n, p) => n + p.amount, 0) + maximum.unmatched!.amount,
  3600,
);
const separate = advancePoker(state([100, 200, 400, 400]), table, [0, 1, 2, 3]);
assert.equal(separate.phase, 'finished');
assert.deepEqual(
  separate.pots.map((p) => p.amount),
  [400, 300, 400],
);
assert.deepEqual(
  separate.pots.map((p) => pokerPotWinners(separate, p)),
  [[0], [1], [2]],
  'each pot is won by its best eligible hand',
);
assert.deepEqual(
  Object.values(separate.seats).map((s) => s.chips),
  [400, 300, 400, 0],
);
assert.equal(
  Object.values(separate.seats).reduce((n, s) => n + s.chips, 0),
  1100,
);
const tied = state([51, 101, 201, 1]);
tied.board = ['AH', 'KH', 'QH', 'JH', '10H'];
tied.seats['3']!.folded = true;
const tiedDone = advancePoker(tied, table, [0, 1, 2, 3]);
assert.deepEqual(
  tiedDone.pots.map((p) => p.amount),
  [154, 100],
);
assert.deepEqual(
  [...pokerPotAwards(tiedDone)],
  [
    [0, 51],
    [1, 102],
    [2, 101],
  ],
  'each tie splits independently; main-pot odd chip goes left of button',
);
assert.deepEqual(
  Object.values(tiedDone.seats).map((s) => s.chips),
  [51, 102, 201, 0],
  'uncalled 100 returns to covered player and does not become a pot award',
);
assert.equal(tiedDone.pot, 254);
assert.equal(
  Object.values(tiedDone.seats).reduce((n, s) => n + s.chips, 0),
  354,
);
const twoOdd = state([51, 101, 201, 1, 52]);
twoOdd.board = ['AH', 'KH', 'QH', 'JH', '10H'];
twoOdd.seats['3']!.folded = true;
twoOdd.seats['4']!.folded = true;
const twoOddDone = advancePoker(twoOdd, table, [0, 1, 2, 3, 4]);
assert.deepEqual(
  twoOddDone.pots.map((pot) => pot.amount),
  [205, 101],
);
assert.deepEqual(
  [...pokerPotAwards(twoOddDone)],
  [
    [0, 68],
    [1, 120],
    [2, 118],
  ],
  'main and side odd chips are both assigned independently after the button',
);
assert.equal(
  Object.values(twoOddDone.seats).reduce((n, seat) => n + seat.chips, 0),
  406,
);
// One funded contender answers the call and then the automatic board runout owns play.
const sole = state([50, 50], [0]);
sole.street = 'flop';
sole.board = ['AH', 'AD', 'AC'];
sole.deck = ['7S', '8S'];
sole.step = 'bet';
sole.turnSeatIndex = 1;
sole.seats['1']!.acted = false;
assert.throws(
  () =>
    pokerRules.applyIntent(
      sole,
      { type: 'bet', amount: 20 },
      {
        seat: {
          id: 'seat1',
          tableId: table.id,
          lobbyMemberId: 'member1',
          seatIndex: 1,
          chips: null,
          joinedAt: 1,
          seatState: 'active',
        },
        now: 1,
      },
    ),
  /Invalid intent/,
);
console.log(
  'Side pots: transient calls, folded contributions, 8-player layers, independent winners, odd chips and returns passed',
);
