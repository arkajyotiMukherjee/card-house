import type { SpadesState } from '../../src/shared/games/spades.ts';
import {
  SPADES_RANKS,
  SPADES_SUITS,
  spadesCardSuit,
  spadesGameDefinition,
  spadesRules,
} from '../../src/shared/games/spades.ts';
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
    id: 'table-spades',
    lobbyId: 'lobby-1',
    gameType: spadesGameDefinition.gameType,
    name: 'Spades #1',
    status: 'waiting_for_players',
    minPlayers: spadesGameDefinition.minPlayers,
    maxPlayers: spadesGameDefinition.maxPlayers,
    stateJson: '{}',
    createdAt: 1,
  };
}

function context(seatIndex: number): IntentContext {
  return { seat: seat(seatIndex), now: 1 };
}

function standardDeck(): Set<string> {
  const deck = new Set<string>();
  for (const suit of SPADES_SUITS) {
    for (const rank of SPADES_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function playState(hands: Record<string, string[]>): SpadesState {
  const bids: Record<string, number | null> = {};
  const tricks: Record<string, number> = {};
  for (const key of Object.keys(hands)) {
    bids[key] = 1;
    tricks[key] = 0;
  }
  return {
    phase: 'play',
    stage: 'trick',
    hands,
    bids,
    tricks,
    trick: [],
    lastTrick: null,
    spadesBroken: true,
    turnSeatIndex: 0,
    dealerSeatIndex: 0,
    scores: { ns: 0, ew: 0 },
    bags: { ns: 0, ew: 0 },
    handNumber: 1,
    winnerTeam: null,
    tableId: 'table-spades',
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

const empty = spadesRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

const short = spadesRules.initialState([0, 1, 2].map(seat), table());
assert(short.phase === 'lobby', 'three seats stay in the lobby');

const deck = standardDeck();
const seats = [3, 1, 0, 2].map(seat);
const dealt = spadesRules.initialState(seats, table());
const dealtCards = Object.values(dealt.hands).flat();
assert(dealt.phase === 'play', 'four seats start in play');
assert(dealt.stage === 'bid', 'a new hand starts with bids');
assert(dealt.handNumber === 1, 'the first hand is hand 1');
assert(dealt.dealerSeatIndex === 0, 'the dealer is the lowest seat');
assert(
  dealt.turnSeatIndex === 1,
  'the first bid is the seat left of the dealer',
);
assert(Object.keys(dealt.hands).length === 4, 'four hands are dealt');
assert(dealtCards.length === 52, 'a full table deals 52 cards');
assert(new Set(dealtCards).size === 52, 'dealt cards are unique');
for (const card of dealtCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
for (const hand of Object.values(dealt.hands)) {
  assert(hand.length === 13, 'each seat gets 13 cards');
}
assert(dealt.spadesBroken === false, 'spades start unbroken');
assert(dealt.scores.ns === 0 && dealt.scores.ew === 0, 'scores start at zero');
assert(dealt.winnerTeam === null, 'a new deal has no winner');
for (const key of Object.keys(dealt.hands)) {
  assert(dealt.bids[key] === null, 'bids start empty');
  assert(dealt.tricks[key] === 0, 'trick counts start at zero');
}

const again = spadesRules.initialState(seats, table());
assert(
  JSON.stringify(again.hands) === JSON.stringify(dealt.hands),
  'the same table deals the same cards',
);
const otherTable = spadesRules.initialState(seats, { ...table(), id: 'other' });
assert(
  JSON.stringify(otherTable.hands) !== JSON.stringify(dealt.hands),
  'another table deals a different order',
);

let bidding = dealt;
const bidPlan = [
  { seat: 1, tricks: 2, next: 2 },
  { seat: 2, tricks: 0, next: 3 },
  { seat: 3, tricks: 1, next: 0 },
];
for (const step of bidPlan) {
  const next = spadesRules.applyIntent(
    bidding,
    { type: 'bid', tricks: step.tricks },
    context(step.seat),
  );
  assert(next.stage === 'bid', 'the hand stays in bidding');
  assert(next.bids[String(step.seat)] === step.tricks, 'the bid is stored');
  assert(next.turnSeatIndex === step.next, 'bidding passes to the next seat');
  assert(
    bidding.bids[String(step.seat)] === null,
    'a bid leaves the previous bids',
  );
  bidding = next;
}
const bidNote = spadesRules.eventNote(
  bidding,
  { type: 'bid', tricks: 4 },
  spadesRules.applyIntent(bidding, { type: 'bid', tricks: 4 }, context(0)),
  context(0),
);
bidding = spadesRules.applyIntent(
  bidding,
  { type: 'bid', tricks: 4 },
  context(0),
);
assert(bidding.stage === 'trick', 'the last bid opens the play');
assert(bidding.turnSeatIndex === 1, 'the seat left of the dealer leads');
assert(
  JSON.stringify(bidNote) ===
    JSON.stringify({ kind: 'bid', seat: 0, tricks: 4 }),
  'a bid notes the seat and the number',
);

const before = JSON.stringify(dealt);
rejects(
  () => spadesRules.applyIntent(dealt, { type: 'bid', tricks: 1 }, context(0)),
  'Not your turn',
);
rejects(
  () => spadesRules.applyIntent(dealt, { type: 'bid', tricks: 14 }, context(1)),
  'Invalid intent',
);
rejects(
  () =>
    spadesRules.applyIntent(dealt, { type: 'play', card: 'AS' }, context(1)),
  'Invalid intent',
);
assert(
  JSON.stringify(dealt) === before,
  'a rejected bid does not change state',
);

const lead = playState({
  '0': ['AS', '2H'],
  '1': ['3C'],
  '2': ['4D'],
  '3': ['5H'],
});
lead.spadesBroken = false;
lead.bids = { '0': 1, '1': 1, '2': 1, '3': 1 };
rejects(
  () => spadesRules.applyIntent(lead, { type: 'play', card: 'AS' }, context(0)),
  'Spades are not broken',
);
assert(
  lead.hands['0']?.includes('AS') === true,
  'a rejected lead keeps the card',
);
const ledHeart = spadesRules.applyIntent(
  lead,
  { type: 'play', card: '2H' },
  context(0),
);
assert(ledHeart.spadesBroken === false, 'a heart lead does not break spades');
assert(ledHeart.turnSeatIndex === 1, 'play passes to the next seat');
assert(ledHeart.trick[0]?.card === '2H', 'the led card sits in the trick');

const onlySpades = playState({
  '0': ['AS', 'KS'],
  '1': ['2H'],
  '2': ['3H'],
  '3': ['4H'],
});
onlySpades.spadesBroken = false;
const broke = spadesRules.applyIntent(
  onlySpades,
  { type: 'play', card: 'AS' },
  context(0),
);
assert(broke.spadesBroken === true, 'leading your only suit breaks spades');

const follow = playState({
  '0': ['2H', '9C'],
  '1': ['3H', '9D'],
  '2': ['4C', '5H'],
  '3': ['6D', '9S'],
});
let followed = spadesRules.applyIntent(
  follow,
  { type: 'play', card: '2H' },
  context(0),
);
followed = spadesRules.applyIntent(
  followed,
  { type: 'play', card: '3H' },
  context(1),
);
const followBefore = JSON.stringify(followed);
rejects(
  () =>
    spadesRules.applyIntent(followed, { type: 'play', card: '4C' }, context(2)),
  'Must follow suit',
);
assert(
  JSON.stringify(followed) === followBefore,
  'an illegal follow does not change state',
);
rejects(
  () =>
    spadesRules.applyIntent(followed, { type: 'play', card: '9S' }, context(2)),
  'Invalid intent',
);
followed = spadesRules.applyIntent(
  followed,
  { type: 'play', card: '5H' },
  context(2),
);
assert(followed.turnSeatIndex === 3, 'a legal follow passes the turn');

const trump = playState({
  '0': ['2H', '3C'],
  '1': ['AS', '4C'],
  '2': ['KH', '5C'],
  '3': ['AH', '6C'],
});
let trick = trump;
const plays = [
  { seat: 0, card: '2H' },
  { seat: 1, card: 'AS' },
  { seat: 2, card: 'KH' },
  { seat: 3, card: 'AH' },
];
for (const play of plays) {
  trick = spadesRules.applyIntent(
    trick,
    { type: 'play', card: play.card },
    context(play.seat),
  );
}
assert(trick.lastTrick?.winner === 1, 'the highest spade wins the trick');
assert(trick.tricks['1'] === 1, 'the winner takes one trick');
assert(trick.turnSeatIndex === 1, 'the winner leads the next trick');
assert(trick.hands['0']?.[0] === '3C', 'the leader keeps the unplayed card');
assert(trick.phase === 'play', 'cards left means the hand continues');

const nilHands = playState({
  '0': ['4H'],
  '1': ['AS'],
  '2': ['3D'],
  '3': ['2C'],
});
nilHands.bids = { '0': 1, '1': 0, '2': 1, '3': 1 };
nilHands.turnSeatIndex = 1;
nilHands.spadesBroken = false;
let nilPlay = nilHands;
for (const play of [
  { seat: 1, card: 'AS' },
  { seat: 2, card: '3D' },
  { seat: 3, card: '2C' },
  { seat: 0, card: '4H' },
]) {
  nilPlay = spadesRules.applyIntent(
    nilPlay,
    { type: 'play', card: play.card },
    context(play.seat),
  );
}
assert(nilPlay.handNumber === 2, 'a scored hand deals the next one');
assert(nilPlay.stage === 'bid', 'the next hand opens with bids');
assert(nilPlay.scores.ns === -20, 'a missed contract loses 10 a trick');
assert(
  nilPlay.scores.ew === -90,
  'a failed nil loses 100 and can fill the contract',
);
assert(
  Object.values(nilPlay.hands).every((hand) => hand.length === 13),
  'the next hand deals 13 cards',
);

const bags = playState({
  '0': ['AS'],
  '1': ['2H'],
  '2': ['3D'],
  '3': ['4C'],
});
bags.bids = { '0': 1, '1': 1, '2': 1, '3': 1 };
bags.tricks = { '0': 2, '1': 0, '2': 0, '3': 0 };
bags.bags = { ns: 9, ew: 0 };
bags.spadesBroken = false;
let bagPlay = bags;
for (const play of [
  { seat: 0, card: 'AS' },
  { seat: 1, card: '2H' },
  { seat: 2, card: '3D' },
  { seat: 3, card: '4C' },
]) {
  bagPlay = spadesRules.applyIntent(
    bagPlay,
    { type: 'play', card: play.card },
    context(play.seat),
  );
}
assert(bagPlay.scores.ns === -79, 'the tenth bag costs 100 points');
assert(bagPlay.bags.ns === 0, 'ten bags are cleared after the penalty');
assert(bagPlay.scores.ew === -20, 'the other side is set');

const ending = playState({
  '0': ['AS'],
  '1': ['2H'],
  '2': ['3D'],
  '3': ['4C'],
});
ending.bids = { '0': 1, '1': 1, '2': 0, '3': 1 };
ending.scores = { ns: 490, ew: 0 };
ending.spadesBroken = false;
let finished = ending;
for (const play of [
  { seat: 0, card: 'AS' },
  { seat: 1, card: '2H' },
  { seat: 2, card: '3D' },
  { seat: 3, card: '4C' },
]) {
  finished = spadesRules.applyIntent(
    finished,
    { type: 'play', card: play.card },
    context(play.seat),
  );
}
assert(finished.phase === 'finished', '500 points finishes the game');
assert(finished.winnerTeam === 'ns', 'the higher side wins');
assert(finished.scores.ns === 600, 'the made bid and nil are added');
assert(finished.scores.ew === -20, 'the set side keeps its loss');
assert(finished.handNumber === 1, 'a finished game does not deal again');
assert(
  Object.values(finished.hands).every((hand) => hand.length === 0),
  'the last hand is empty',
);
const endNote = spadesRules.eventNote(
  ending,
  { type: 'play', card: '4C' },
  finished,
  context(3),
);
assert(
  endNote !== null && endNote.kind === 'hand' && endNote.winner === 'ns',
  'the last trick notes the winning side',
);

const leave = spadesRules.onPlayerLeave;
assert(leave !== undefined, 'spades handles a seat leaving');
const abandoned = leave(dealt, seat(0));
assert(abandoned.phase === 'finished', 'a leave during play ends the hand');
assert(abandoned.winnerTeam === 'ew', 'the other partnership wins the leave');
const stillLobby = leave(empty, seat(0));
assert(
  stillLobby.phase === 'lobby',
  'a leave before the deal stays in the lobby',
);

function chooseCard(state: SpadesState): string {
  const seat = state.turnSeatIndex;
  assert(seat !== null, 'play has a seat to act');
  const hand = state.hands[String(seat)] ?? [];
  assert(hand.length > 0, 'the seat to act still holds a card');
  if (state.trick.length === 0) {
    if (!state.spadesBroken) {
      const plain = hand.find((card) => spadesCardSuit(card) !== 'S');
      if (plain) {
        return plain;
      }
    }
    return hand[0] ?? '';
  }
  const led = spadesCardSuit(state.trick[0]?.card ?? '');
  const match = hand.find((card) => spadesCardSuit(card) === led);
  return match ?? hand[0] ?? '';
}

let walking = spadesRules.initialState([0, 1, 2, 3].map(seat), table());
const firstHands = JSON.stringify(walking.hands);
let guard = 0;
while (walking.phase === 'play' && walking.handNumber === 1 && guard < 80) {
  const actor = walking.turnSeatIndex;
  assert(actor !== null, 'the walk has a turn');
  if (walking.stage === 'bid') {
    walking = spadesRules.applyIntent(
      walking,
      { type: 'bid', tricks: 1 },
      context(actor),
    );
  } else {
    walking = spadesRules.applyIntent(
      walking,
      { type: 'play', card: chooseCard(walking) },
      context(actor),
    );
  }
  guard += 1;
}
assert(guard < 80, 'one hand finishes without getting stuck');
assert(walking.phase === 'play', 'one hand under 500 stays in play');
assert(walking.stage === 'bid', 'the next hand asks for bids');
assert(walking.handNumber === 2, 'the walk deals hand 2');
assert(
  Object.values(walking.hands).flat().length === 52,
  'hand 2 deals the full deck',
);
assert(JSON.stringify(walking.hands) !== firstHands, 'hand 2 is a new shuffle');

console.log(
  JSON.stringify({
    gameType: spadesGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: dealtCards.length,
    turnSeatIndex: dealt.turnSeatIndex,
    finished: finished.phase,
    winnerTeam: finished.winnerTeam,
    scores: finished.scores,
    hand2: walking.handNumber,
  }),
);
