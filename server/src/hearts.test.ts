import type { HeartsState } from '../../src/shared/games/hearts.ts';
import {
  HEARTS_RANKS,
  HEARTS_SCORE_LIMIT,
  HEARTS_SUITS,
  QUEEN_OF_SPADES,
  TWO_OF_CLUBS,
  heartsGameDefinition,
  heartsRules,
  playError,
  readHeartsEventNote,
} from '../../src/shared/games/hearts.ts';
import type {
  GameSeat,
  GameTable,
  IntentContext,
} from '../../src/shared/games/game-rules.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function seat(seatIndex: number): GameSeat {
  return {
    id: `seat-${seatIndex}`,
    tableId: 'table-1',
    lobbyMemberId: `member-${seatIndex}`,
    seatIndex,
    chips: null,
    joinedAt: 1,
    seatState: 'active',
  };
}

function table(id = 'table-hearts'): GameTable {
  return {
    id,
    lobbyId: 'lobby-1',
    gameType: heartsGameDefinition.gameType,
    name: 'Hearts #1',
    status: 'waiting_for_players',
    minPlayers: heartsGameDefinition.minPlayers,
    maxPlayers: heartsGameDefinition.maxPlayers,
    stateJson: '{}',
    createdAt: 1,
  };
}

function context(seatIndex: number): IntentContext {
  return { seat: seat(seatIndex), now: 1 };
}

function standardDeck(): Set<string> {
  const deck = new Set<string>();
  for (const suit of HEARTS_SUITS) {
    for (const rank of HEARTS_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function scoreSum(scores: Record<string, number>): number {
  let total = 0;
  for (const score of Object.values(scores)) {
    total += score;
  }
  return total;
}

function base(overrides: Partial<HeartsState> = {}): HeartsState {
  return {
    phase: 'play',
    hands: { '0': [], '1': [], '2': [], '3': [] },
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

function playCards(state: HeartsState, cards: string[]): HeartsState {
  let current = state;
  for (const card of cards) {
    const seatIndex = current.turnSeatIndex;
    assert(seatIndex !== null, 'a trick has a seat to act');
    current = heartsRules.applyIntent(
      current,
      { type: 'play', card },
      context(seatIndex),
    );
  }
  return current;
}

function catches(run: () => void): string {
  try {
    run();
  } catch (error) {
    assert(error instanceof Error, 'rejected intents throw Error');
    return error.message;
  }
  throw new Error('expected the intent to be rejected');
}

assert(heartsGameDefinition.gameType === 'hearts', 'the catalog key is hearts');
assert(
  heartsGameDefinition.displayName === 'Hearts',
  'the display name is Hearts',
);
assert(heartsGameDefinition.minPlayers === 4, 'hearts seats 4 players');
assert(heartsGameDefinition.maxPlayers === 4, 'hearts seats only 4 players');
assert(
  heartsGameDefinition.howToPlay.includes('queen of spades'),
  'how to play names the queen of spades',
);
assert(
  heartsGameDefinition.howToPlay.includes(String(HEARTS_SCORE_LIMIT)),
  'how to play names the score limit',
);

const empty = heartsRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

const short = heartsRules.initialState([seat(0), seat(1)], table());
assert(short.phase === 'lobby', 'fewer than 4 players stays in the lobby');

const deck = standardDeck();
const seats = [3, 1, 0, 2].map(seat);
const dealt = heartsRules.initialState(seats, table());
const again = heartsRules.initialState(seats, table());
const other = heartsRules.initialState(seats, table('table-other'));
const dealtCards = Object.values(dealt.hands).flat();
assert(dealt.phase === 'pass', 'the first hand passes before play');
assert(dealt.handIndex === 0, 'the first hand is hand 0');
assert(dealt.turnSeatIndex === null, 'passing has no single turn');
assert(Object.keys(dealt.hands).length === 4, 'four players are dealt');
assert(dealtCards.length === 52, 'a full table deals 52 cards');
assert(new Set(dealtCards).size === 52, 'dealt cards are unique');
for (const card of dealtCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
for (const hand of Object.values(dealt.hands)) {
  assert(hand.length === 13, 'each seat is dealt 13 cards');
}
assert(scoreSum(dealt.scores) === 0, 'a new deal scores nothing');
assert(
  JSON.stringify(dealt.hands) === JSON.stringify(again.hands),
  'the same table id deals the same hands',
);
assert(
  JSON.stringify(dealt.hands) !== JSON.stringify(other.hands),
  'another table id deals a different hand',
);

const passing = base({
  phase: 'pass',
  hands: {
    '0': ['AH', 'KH', 'QH', TWO_OF_CLUBS],
    '1': ['AD', 'KD', 'QD', '3C'],
    '2': ['AC', 'KC', 'QC', '4C'],
    '3': ['AS', 'KS', 'JS', '5C'],
  },
  turnSeatIndex: null,
});
const onePass = heartsRules.applyIntent(
  passing,
  { type: 'pass', cards: ['AH', 'KH', 'QH'] },
  context(0),
);
assert(onePass.phase === 'pass', 'one pass waits for the other seats');
assert(
  onePass.hands['0'].includes('AH'),
  'passed cards stay put until everyone passes',
);
assert(
  onePass.passes['0']?.join(',') === 'AH,KH,QH',
  'the pass records the three cards',
);
const beforeSecond = JSON.stringify(onePass);
assert(
  catches(() => {
    heartsRules.applyIntent(
      onePass,
      { type: 'pass', cards: ['AH', 'KH', TWO_OF_CLUBS] },
      context(0),
    );
  }) === 'Already passed',
  'a second pass is rejected',
);
assert(JSON.stringify(onePass) === beforeSecond, 'a rejected pass keeps state');
assert(
  catches(() => {
    heartsRules.applyIntent(
      passing,
      { type: 'pass', cards: ['AH', 'KH'] },
      context(0),
    );
  }) === 'Pass 3 cards',
  'a short pass is rejected',
);
assert(
  catches(() => {
    heartsRules.applyIntent(
      passing,
      { type: 'play', card: TWO_OF_CLUBS },
      context(0),
    );
  }) === 'Wait for the pass to finish',
  'a play during the pass is rejected',
);

let exchanged = passing;
for (const seatIndex of [0, 1, 2, 3]) {
  const cards = exchanged.hands[String(seatIndex)].slice(0, 3);
  exchanged = heartsRules.applyIntent(
    exchanged,
    { type: 'pass', cards },
    context(seatIndex),
  );
}
assert(exchanged.phase === 'play', 'the last pass starts the hand');
assert(exchanged.turnSeatIndex === 0, 'the two of clubs leads after the pass');
assert(
  exchanged.hands['0'].includes(TWO_OF_CLUBS),
  'the leader still holds the two of clubs',
);
assert(
  exchanged.hands['1'].includes('AH'),
  'cards pass to the next seat on the left',
);
assert(
  !exchanged.hands['0'].includes('AH'),
  'a passed heart leaves the passing hand',
);
for (const hand of Object.values(exchanged.hands)) {
  assert(hand.length === 4, 'a pass keeps the hand size');
}

const lead = base({
  hands: {
    '0': [TWO_OF_CLUBS, 'AH'],
    '1': ['3C', 'KH'],
    '2': ['4D'],
    '3': ['5D'],
  },
  turnSeatIndex: 0,
});
const beforeLead = JSON.stringify(lead);
assert(
  catches(() => {
    heartsRules.applyIntent(lead, { type: 'play', card: '3C' }, context(1));
  }) === 'Not your turn',
  'a move from another seat is rejected',
);
assert(
  JSON.stringify(lead) === beforeLead,
  'a rejected move does not change state',
);
assert(
  catches(() => {
    heartsRules.applyIntent(lead, { type: 'play', card: 'AH' }, context(0));
  }) === 'Lead the 2 of clubs',
  'the first lead must be the two of clubs',
);
const led = heartsRules.applyIntent(
  lead,
  { type: 'play', card: TWO_OF_CLUBS },
  context(0),
);
assert(led.currentTrick.length === 1, 'the lead sits in the trick');
assert(led.turnSeatIndex === 1, 'the next seat follows');
assert(
  catches(() => {
    heartsRules.applyIntent(led, { type: 'play', card: 'KH' }, context(1));
  }) === 'Follow suit',
  'a player with the led suit must follow',
);

const firstDump = base({
  hands: {
    '0': [TWO_OF_CLUBS],
    '1': [QUEEN_OF_SPADES, '2D'],
    '2': ['3D'],
    '3': ['4D'],
  },
  turnSeatIndex: 0,
});
const firstLed = heartsRules.applyIntent(
  firstDump,
  { type: 'play', card: TWO_OF_CLUBS },
  context(0),
);
assert(
  catches(() => {
    heartsRules.applyIntent(
      firstLed,
      { type: 'play', card: QUEEN_OF_SPADES },
      context(1),
    );
  }) === 'No points on the first trick',
  'the queen cannot be dumped on the first trick',
);
const safe = heartsRules.applyIntent(
  firstLed,
  { type: 'play', card: '2D' },
  context(1),
);
assert(
  safe.currentTrick[1]?.card === '2D',
  'a safe card is legal on the first trick',
);

const broken = base({
  hands: {
    '0': ['AH', TWO_OF_CLUBS],
    '1': ['3D'],
    '2': ['4D'],
    '3': ['5D'],
  },
  tricksTaken: { '0': ['6D', '7D', '8D', '9D'], '1': [], '2': [], '3': [] },
  heartsBroken: false,
  turnSeatIndex: 0,
});
assert(
  catches(() => {
    heartsRules.applyIntent(broken, { type: 'play', card: 'AH' }, context(0));
  }) === 'Hearts are not broken',
  'hearts cannot be led before they are broken',
);
const onlyHearts = base({
  hands: { '0': ['AH'], '1': ['2D'], '2': ['3D'], '3': ['4D'] },
  tricksTaken: { '0': ['6D', '7D', '8D', '9D'], '1': [], '2': [], '3': [] },
  heartsBroken: false,
  turnSeatIndex: 0,
});
const heartLead = heartsRules.applyIntent(
  onlyHearts,
  { type: 'play', card: 'AH' },
  context(0),
);
assert(
  heartLead.currentTrick[0]?.card === 'AH',
  'only hearts may lead a heart',
);

const scoring = base({
  hands: {
    '0': ['2H'],
    '1': [QUEEN_OF_SPADES],
    '2': ['2D'],
    '3': ['3D'],
  },
  tricksTaken: { '0': ['6C', '7C', '8C', '9C'], '1': [], '2': [], '3': [] },
  heartsBroken: true,
  turnSeatIndex: 1,
});
const scored = playCards(scoring, [QUEEN_OF_SPADES, '2D', '3D', '2H']);
assert(scored.phase === 'pass', 'a scored hand under 100 deals again');
assert(scored.handIndex === 1, 'the next hand advances');
assert(scored.scores['1'] === 14, 'the queen and a heart score 14');
assert(scored.scores['0'] === 0, 'a seat that missed the trick scores 0');
assert(
  Object.values(scored.hands).every((hand) => hand.length === 13),
  'the next hand deals 13 cards again',
);

const end = base({
  hands: { '0': ['AH'], '1': ['2C'], '2': ['3D'], '3': ['4S'] },
  tricksTaken: { '0': ['6D', '7D', '8D', '9D'], '1': [], '2': [], '3': [] },
  scores: { '0': HEARTS_SCORE_LIMIT - 1, '1': 0, '2': 0, '3': 0 },
  heartsBroken: true,
  turnSeatIndex: 0,
});
const finished = playCards(end, ['AH', '2C', '3D', '4S']);
assert(finished.phase === 'finished', 'reaching 100 finishes the game');
assert(
  finished.scores['0'] === HEARTS_SCORE_LIMIT,
  'the heart puts that seat at 100',
);
assert(
  finished.winnerSeatIndex === 1,
  'the lowest score wins, lowest seat on a tie',
);
assert(
  catches(() => {
    heartsRules.applyIntent(finished, { type: 'play', card: '2C' }, context(1));
  }) === 'The hand is over',
  'a finished game rejects another play',
);

const rest = [...deck].filter(
  (card) => !['2C', '3C', '4C', '5C'].includes(card),
);
const moon = base({
  handIndex: 2,
  hands: { '0': ['2C'], '1': ['3C'], '2': ['4C'], '3': ['5C'] },
  tricksTaken: { '0': rest, '1': [], '2': [], '3': [] },
  heartsBroken: true,
  turnSeatIndex: 0,
});
const afterMoon = playCards(moon, ['2C', '3C', '4C', '5C']);
assert(
  afterMoon.scores['0'] === 0,
  'shooting the moon scores 0 for the shooter',
);
assert(afterMoon.scores['1'] === 26, 'each opponent scores 26 for the moon');
assert(afterMoon.scores['2'] === 26, 'the third seat scores 26 for the moon');
assert(afterMoon.scores['3'] === 26, 'the fourth seat scores 26 for the moon');
assert(afterMoon.phase === 'play', 'the hold hand starts in play');
assert(afterMoon.handIndex === 3, 'the fourth hand is the hold');
assert(
  Object.values(afterMoon.passes).length === 0,
  'the hold hand has nothing to pass',
);
const leader = afterMoon.turnSeatIndex;
assert(leader !== null, 'the hold hand has a leader');
assert(
  afterMoon.hands[String(leader)].includes(TWO_OF_CLUBS),
  'the two of clubs leads the hold hand',
);

const playedOut = ((): HeartsState => {
  let current = dealt;
  const handIndex = current.handIndex;
  let steps = 0;
  while (current.handIndex === handIndex && current.phase !== 'finished') {
    steps += 1;
    assert(steps < 80, 'a hand finishes in a bounded number of moves');
    if (current.phase === 'pass') {
      for (const seatIndex of [0, 1, 2, 3]) {
        if (current.phase !== 'pass' || current.passes[String(seatIndex)]) {
          continue;
        }
        const cards = current.hands[String(seatIndex)].slice(0, 3);
        current = heartsRules.applyIntent(
          current,
          { type: 'pass', cards },
          context(seatIndex),
        );
      }
      continue;
    }
    const seatIndex = current.turnSeatIndex;
    assert(seatIndex !== null, 'play has a turn');
    const card = current.hands[String(seatIndex)].find(
      (held) => playError(current, seatIndex, held) === null,
    );
    assert(card !== undefined, `seat ${seatIndex} has a legal card`);
    current = heartsRules.applyIntent(
      current,
      { type: 'play', card },
      context(seatIndex),
    );
  }
  return current;
})();
const playedSum = scoreSum(playedOut.scores);
assert(
  playedSum === 26 || playedSum === 78,
  'one hand awards 26 points, or 78 when the moon is shot',
);
assert(playedOut.handIndex === 1, 'playing the hand out deals the next one');
assert(playedOut.phase === 'pass', 'the second hand passes to the right');

const passNote = heartsRules.eventNote(
  passing,
  { type: 'pass', cards: ['AH', 'KH', 'QH'] },
  onePass,
  context(0),
);
assert(readHeartsEventNote(passNote)?.kind === 'pass', 'a pass notes the pass');
let moonCursor = moon;
let beforeLastMoon = moon;
for (const card of ['2C', '3C', '4C', '5C']) {
  const seatIndex = moonCursor.turnSeatIndex;
  assert(seatIndex !== null, 'the moon trick has a turn');
  if (card === '5C') {
    beforeLastMoon = moonCursor;
  }
  moonCursor = heartsRules.applyIntent(
    moonCursor,
    { type: 'play', card },
    context(seatIndex),
  );
}
const moonNote = heartsRules.eventNote(
  beforeLastMoon,
  { type: 'play', card: '5C' },
  moonCursor,
  context(3),
);
assert(
  readHeartsEventNote(moonNote)?.kind === 'moon',
  'the moon notes the shooter',
);
const endNote = heartsRules.eventNote(
  {
    ...end,
    currentTrick: [
      { seat: 0, card: 'AH' },
      { seat: 1, card: '2C' },
      { seat: 2, card: '3D' },
    ],
    hands: { '0': [], '1': [], '2': [], '3': ['4S'] },
    tricksTaken: {
      '0': ['6D', '7D', '8D', '9D', 'AH', '2C', '3D'],
      '1': [],
      '2': [],
      '3': [],
    },
    turnSeatIndex: 3,
  },
  { type: 'play', card: '4S' },
  finished,
  context(3),
);
assert(
  readHeartsEventNote(endNote)?.kind === 'finished',
  'the last point notes the winner',
);

const left = heartsRules.onPlayerLeave(lead, seat(2));
assert(left.phase === 'finished', 'a seat leaving a live hand ends it');
assert(
  left.winnerSeatIndex === 0,
  'the lowest remaining score wins after a leave',
);

console.log(
  JSON.stringify({
    gameType: heartsGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: dealtCards.length,
    passPhase: dealt.phase,
    exchangedTurn: exchanged.turnSeatIndex,
    scored: scored.scores['1'],
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
    moon: afterMoon.scores,
    playedSum,
  }),
);
