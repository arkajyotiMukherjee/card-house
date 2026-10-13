import { addSeatCredit, seatStatCredits } from './player-stats.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function credit(gameType: string, before: unknown, after: unknown): string {
  return JSON.stringify(seatStatCredits(gameType, before, after));
}

const bluffBefore = {
  phase: 'play',
  hands: { '0': ['AS'], '1': ['KH'] },
};
const bluffAfter = {
  phase: 'finished',
  hands: { '0': [], '1': ['KH', 'AS'] },
  winnerSeatIndex: 0,
};

assert(
  credit('bluff', bluffBefore, bluffAfter) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 1 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
    ]),
  'a winning Bluff hand counts a hand for both seats and a win for the winner',
);
assert(
  seatStatCredits('bluff', bluffAfter, bluffAfter).length === 0,
  'a hand that is already finished is not counted again',
);
assert(
  seatStatCredits('president', bluffBefore, { ...bluffBefore, phase: 'play' })
    .length === 0,
  'an unfinished hand records nothing',
);
assert(
  credit('go_fish', bluffBefore, {
    phase: 'finished',
    hands: bluffBefore.hands,
    winnerSeatIndex: null,
  }) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
    ]),
  'a tied Go Fish game counts the hand and no win',
);

assert(
  credit(
    'hearts',
    { phase: 'play', handIndex: 0, hands: { '0': ['AS'], '1': ['KH'] } },
    { phase: 'play', handIndex: 1, hands: { '0': ['2C'], '1': ['3D'] } },
  ) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
    ]),
  'a Hearts hand that continues counts a hand and no win',
);
assert(
  credit(
    'hearts',
    { phase: 'play', handIndex: 3, hands: { '0': ['AS'], '2': ['KH'] } },
    {
      phase: 'finished',
      handIndex: 3,
      hands: { '0': [], '2': [] },
      winnerSeatIndex: 2,
    },
  ) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 2, handsPlayed: 1, gamesWon: 1 },
    ]),
  'the Hearts game winner gets the hand and the win',
);

assert(
  credit(
    'spades',
    {
      phase: 'play',
      handNumber: 1,
      hands: { '0': ['AS'], '1': ['KH'], '2': ['QD'], '3': ['JC'] },
    },
    {
      phase: 'play',
      handNumber: 2,
      hands: { '0': ['2C'], '1': ['3D'], '2': ['4H'], '3': ['5S'] },
    },
  ) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 2, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 3, handsPlayed: 1, gamesWon: 0 },
    ]),
  'a Spades hand under 500 counts a hand for every seat',
);
assert(
  credit(
    'spades',
    {
      phase: 'play',
      handNumber: 4,
      hands: { '0': ['AS'], '1': ['KH'], '2': ['QD'], '3': ['JC'] },
    },
    {
      phase: 'finished',
      handNumber: 4,
      hands: { '0': [], '1': [], '2': [], '3': [] },
      winnerTeam: 'ns',
    },
  ) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 1 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 2, handsPlayed: 1, gamesWon: 1 },
      { seatIndex: 3, handsPlayed: 1, gamesWon: 0 },
    ]),
  'a Spades game win counts for the even partnership seats',
);

assert(
  credit(
    'blackjack',
    { phase: 'play', seats: { '0': { chips: 200 } } },
    {
      phase: 'finished',
      seats: { '0': { chips: 220 } },
      winnerSeatIndexes: [0],
    },
  ) === JSON.stringify([{ seatIndex: 0, handsPlayed: 1, gamesWon: 1 }]),
  'a winning Blackjack round counts a hand and a win',
);
assert(
  credit(
    'blackjack',
    { phase: 'play', seats: { '0': { chips: 200 } } },
    {
      phase: 'finished',
      seats: { '0': { chips: 200 } },
      winnerSeatIndexes: [],
    },
  ) === JSON.stringify([{ seatIndex: 0, handsPlayed: 1, gamesWon: 0 }]),
  'a Blackjack push counts the hand and not a win',
);
assert(
  credit(
    'poker',
    { phase: 'play', seats: { '0': {}, '1': {}, '2': {} } },
    { phase: 'finished', seats: {}, winnerSeatIndexes: [0, 2] },
  ) ===
    JSON.stringify([
      { seatIndex: 0, handsPlayed: 1, gamesWon: 1 },
      { seatIndex: 1, handsPlayed: 1, gamesWon: 0 },
      { seatIndex: 2, handsPlayed: 1, gamesWon: 1 },
    ]),
  'a split Poker pot counts a win for each winner',
);

assert(
  seatStatCredits('dummy', { count: 1 }, { count: 2 }).length === 0,
  'the dummy counter has no hand to record',
);
assert(
  seatStatCredits('stub', { label: 'stub' }, { label: 'stub' }).length === 0,
  'a stub table has no hand to record',
);
assert(
  seatStatCredits('bluff', null, bluffAfter).length === 0,
  'a missing state records nothing',
);

const accumulated = addSeatCredit(
  addSeatCredit(undefined, { seatIndex: 0, handsPlayed: 1, gamesWon: 1 }),
  { seatIndex: 0, handsPlayed: 1, gamesWon: 0 },
);
assert(
  accumulated.handsPlayed === 2 && accumulated.gamesWon === 1,
  'later hands add to the same client totals',
);

console.log(JSON.stringify({ ok: true }));
