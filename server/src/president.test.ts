import type { PresidentState } from '../../src/shared/games/president.ts';
import {
  PRESIDENT_RANKS,
  PRESIDENT_SUITS,
  presidentGameDefinition,
  presidentRules,
  readPresidentState,
} from '../../src/shared/games/president.ts';
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

function table(): GameTable {
  return {
    id: 'table-president',
    lobbyId: 'lobby-1',
    gameType: presidentGameDefinition.gameType,
    name: 'President #1',
    status: 'waiting_for_players',
    minPlayers: presidentGameDefinition.minPlayers,
    maxPlayers: presidentGameDefinition.maxPlayers,
    stateJson: '{}',
    createdAt: 1,
  };
}

function context(seatIndex: number): IntentContext {
  return {
    seat: seat(seatIndex),
    now: 1,
  };
}

function standardDeck(): Set<string> {
  const deck = new Set<string>();
  for (const suit of PRESIDENT_SUITS) {
    for (const rank of PRESIDENT_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function playState(patch: Partial<PresidentState>): PresidentState {
  return {
    phase: 'play',
    hands: {},
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: 0,
    lastPlay: null,
    openingLead: false,
    finishOrder: [],
    rankOrder: [],
    winnerSeatIndex: null,
    ...patch,
  };
}

function rejects(run: () => void, message: string): void {
  let rejected = false;
  try {
    run();
  } catch (error) {
    rejected = error instanceof Error && error.message === message;
  }
  assert(rejected, message);
}

const empty = presidentRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.playPile.length === 0, 'no seats deals no pile');
assert(empty.turnSeatIndex === null, 'no seats has no turn');
assert(empty.rankOrder.length === 0, 'no seats has no rank order');

const deck = standardDeck();
const seats = [3, 1, 5, 0, 4, 2].map(seat);
const dealt = presidentRules.initialState(seats, table());
const dealtAgain = presidentRules.initialState(seats, table());
const otherTable = {
  ...table(),
  id: 'table-president-b',
};
const otherDeal = presidentRules.initialState(seats, otherTable);
const dealtCards = Object.values(dealt.hands).flat();
assert(dealt.phase === 'play', 'a full table starts in play');
assert(Object.keys(dealt.hands).length === 6, 'a full table deals six hands');
assert(dealtCards.length === 52, 'a full table deals 52 cards');
assert(new Set(dealtCards).size === 52, 'dealt cards are unique');
for (const card of dealtCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
const sizes = Object.values(dealt.hands).map((hand) => hand.length);
assert(
  sizes.every((size) => size === 8 || size === 9),
  'six players get eight or nine cards',
);
assert(
  sizes.filter((size) => size === 9).length === 4,
  'the extra four cards go to four seats',
);
assert(dealt.playPile.length === 0, 'the pile starts empty');
assert(dealt.winnerSeatIndex === null, 'a new deal has no winner');
assert(dealt.openingLead, 'the first lead must include the 3 of clubs');
assert(dealt.turnSeatIndex !== null, 'the deal has a seat to lead');
const leaderKey = String(dealt.turnSeatIndex);
assert(
  dealt.hands[leaderKey]?.includes('3C') === true,
  'the seat with the 3 of clubs leads',
);
assert(
  JSON.stringify(dealt.hands) === JSON.stringify(dealtAgain.hands),
  'the same table id deals the same cards',
);
assert(
  JSON.stringify(dealt.hands) !== JSON.stringify(otherDeal.hands),
  'a different table id shuffles differently',
);
const roundTrip = readPresidentState(JSON.parse(JSON.stringify(dealt)));
assert(
  roundTrip.turnSeatIndex === dealt.turnSeatIndex,
  'a stored deal reads back the same turn',
);

const leader = dealt.turnSeatIndex;
assert(leader !== null, 'play has a seat to act');
const held = dealt.hands[leaderKey] ?? [];
const opener = held.find((card) => card !== '3C') ?? 'KS';
const before = JSON.stringify(dealt);
const handsBefore = dealt.hands;
const pileBefore = dealt.playPile;
rejects(() => {
  presidentRules.applyIntent(
    dealt,
    { type: 'play', cards: [opener] },
    context(leader),
  );
}, 'Include the 3 of clubs');
rejects(() => {
  presidentRules.applyIntent(dealt, { type: 'pass' }, context(leader));
}, 'You must play');
const other = leader === 0 ? 1 : 0;
rejects(() => {
  presidentRules.applyIntent(
    dealt,
    { type: 'play', cards: ['3C'] },
    context(other),
  );
}, 'Not your turn');
assert(
  JSON.stringify(dealt) === before,
  'a rejected move does not change state',
);
assert(dealt.hands === handsBefore, 'a rejected move keeps the same hands');
assert(dealt.playPile === pileBefore, 'a rejected move keeps the same pile');
assert(dealt.turnSeatIndex === leader, 'a rejected move keeps the same turn');

const opened = presidentRules.applyIntent(
  dealt,
  { type: 'play', cards: ['3C'] },
  context(leader),
);
assert(opened !== dealt, 'a legal play returns a new state');
assert(opened.phase === 'play', 'one card from a full hand stays in play');
assert(
  opened.hands[leaderKey]?.length === held.length - 1,
  'one card leaves the hand',
);
assert(
  opened.hands[leaderKey]?.includes('3C') === false,
  'the played card is gone from the hand',
);
assert(opened.playPile.at(-1) === '3C', 'the played card lands on the pile');
assert(opened.currentRank === '3', 'the pile rank is the rank that was played');
assert(opened.currentCount === 1, 'the next play matches that count');
assert(opened.openingLead === false, 'the opening lead is over');
assert(
  opened.lastPlay?.seat === leader,
  'the last play records the acting seat',
);
assert(opened.lastPlay?.rank === '3', 'the last play records the rank');
assert(
  dealt.hands[leaderKey]?.includes('3C') === true,
  'a legal play leaves the previous hand in place',
);
const playNote = presidentRules.eventNote(
  dealt,
  { type: 'play', cards: ['3C'] },
  opened,
  context(leader),
);
assert(
  JSON.stringify(playNote) ===
    JSON.stringify({ kind: 'play', seat: leader, count: 1, rank: '3' }),
  'a play notes the seat, count, and rank',
);

const beating = playState({
  hands: {
    '0': ['KH', 'KD'],
    '1': ['3S', '4D', '4S', 'AH'],
    '2': ['5H', '2D'],
  },
  playPile: ['KS'],
  currentRank: 'K',
  currentCount: 1,
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['KS'], rank: 'K' },
});
rejects(() => {
  presidentRules.applyIntent(
    beating,
    { type: 'play', cards: ['3S'] },
    context(1),
  );
}, 'Play a higher rank');
rejects(() => {
  presidentRules.applyIntent(
    beating,
    { type: 'play', cards: ['4D', '4S'] },
    context(1),
  );
}, 'Match the count');
rejects(() => {
  presidentRules.applyIntent(
    beating,
    { type: 'play', cards: ['AH', '2D'] },
    context(1),
  );
}, 'Invalid intent');
const higher = presidentRules.applyIntent(
  beating,
  { type: 'play', cards: ['AH'] },
  context(1),
);
assert(higher.currentRank === 'A', 'a higher rank replaces the pile rank');
assert(higher.turnSeatIndex === 2, 'the next seated player acts');
assert(higher.passes === 0, 'a play clears the pass count');
assert(higher.playPile.at(-1) === 'AH', 'the higher card lands on the pile');

const passed = presidentRules.applyIntent(higher, { type: 'pass' }, context(2));
assert(passed.passes === 1, 'a pass counts toward clearing the trick');
assert(passed.turnSeatIndex === 0, 'the pass moves to the next seat');
assert(passed.currentRank === 'A', 'a single pass keeps the pile rank');
const passNote = presidentRules.eventNote(
  higher,
  { type: 'pass' },
  passed,
  context(2),
);
assert(
  JSON.stringify(passNote) === JSON.stringify({ kind: 'pass', seat: 2 }),
  'a pass notes the seat',
);
const cleared = presidentRules.applyIntent(
  passed,
  { type: 'pass' },
  context(0),
);
assert(cleared.playPile.length === 0, 'enough passes clear the pile');
assert(cleared.currentCount === 0, 'the next seat may lead any count');
assert(cleared.currentRank === null, 'a cleared pile has no rank to beat');
assert(cleared.turnSeatIndex === 1, 'the last player to play leads again');

const twos = playState({
  hands: { '0': ['2S', '4D'], '1': ['KH'], '2': ['5H'] },
  turnSeatIndex: 0,
});
const clearedByTwo = presidentRules.applyIntent(
  twos,
  { type: 'play', cards: ['2S'] },
  context(0),
);
assert(clearedByTwo.playPile.length === 0, 'a two clears the pile');
assert(clearedByTwo.currentCount === 0, 'a two lets that seat lead again');
assert(clearedByTwo.turnSeatIndex === 0, 'the seat that played the two leads');
assert(
  clearedByTwo.hands['0']?.includes('4D') === true,
  'the rest of the hand stays',
);

const ending = playState({
  hands: { '0': ['3C'], '1': ['4S'], '2': ['5H', '6D'] },
  turnSeatIndex: 0,
  openingLead: true,
});
const firstOut = presidentRules.applyIntent(
  ending,
  { type: 'play', cards: ['3C'] },
  context(0),
);
assert(firstOut.phase === 'play', 'the first player out does not end the hand');
assert(
  JSON.stringify(firstOut.finishOrder) === JSON.stringify([0]),
  'the first player out leads the rank order',
);
assert(firstOut.turnSeatIndex === 1, 'play continues with the next seat');
const finished = presidentRules.applyIntent(
  firstOut,
  { type: 'play', cards: ['4S'] },
  context(1),
);
assert(
  finished.phase === 'finished',
  'the last player with cards ends the hand',
);
assert(finished.winnerSeatIndex === 0, 'the first player out is President');
assert(
  JSON.stringify(finished.finishOrder) === JSON.stringify([0, 1, 2]),
  'the last player holding cards is placed last',
);
assert(
  finished.rankOrder[0]?.title === 'President',
  'first place is President',
);
assert(finished.rankOrder[0]?.score === 3, 'President scores the seat count');
assert(
  finished.rankOrder[1]?.title === 'Neutral',
  'the middle seat is Neutral',
);
assert(finished.rankOrder[1]?.score === 2, 'second place scores one less');
assert(finished.rankOrder[2]?.title === 'Scum', 'last place is Scum');
assert(finished.rankOrder[2]?.seat === 2, 'the remaining seat is Scum');
assert(finished.rankOrder[2]?.score === 1, 'Scum scores one');
assert(finished.hands['2']?.length === 2, 'Scum keeps the cards still in hand');
assert(finished.turnSeatIndex === null, 'a finished hand has no turn');
const finishNote = presidentRules.eventNote(
  firstOut,
  { type: 'play', cards: ['4S'] },
  finished,
  context(1),
);
assert(
  JSON.stringify(finishNote) ===
    JSON.stringify({ kind: 'finish', president: 0, scum: 2 }),
  'the ending play notes President and Scum',
);
rejects(() => {
  presidentRules.applyIntent(finished, { type: 'pass' }, context(2));
}, 'Invalid intent');

const four = playState({
  hands: { '0': ['4S'], '1': ['5S'], '2': ['6S'], '3': ['7S', '8S'] },
  turnSeatIndex: 0,
});
const placed = [0, 1, 2, 3].reduce<PresidentState>(
  (state, seatIndex, place) => {
    if (place === 3) {
      return state;
    }
    const card = state.hands[String(seatIndex)]?.[0];
    assert(card !== undefined, 'each seat still holds its card');
    return presidentRules.applyIntent(
      state,
      { type: 'play', cards: [card] },
      context(seatIndex),
    );
  },
  four,
);
assert(
  placed.phase === 'finished',
  'three players going out finishes a four-seat hand',
);
assert(
  placed.rankOrder[1]?.title === 'Vice Pres',
  'second of four is Vice Pres',
);
assert(
  placed.rankOrder[2]?.title === 'Vice Scum',
  'third of four is Vice Scum',
);
assert(placed.rankOrder[3]?.title === 'Scum', 'fourth is Scum');
assert(
  placed.rankOrder.map((entry) => entry.score).join(',') === '4,3,2,1',
  'scores run from the seat count down to one',
);

console.log(
  JSON.stringify({
    gameType: presidentGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: dealtCards.length,
    turnSeatIndex: dealt.turnSeatIndex,
    openedRank: opened.currentRank,
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
    scores: finished.rankOrder.map((entry) => entry.score),
  }),
);
