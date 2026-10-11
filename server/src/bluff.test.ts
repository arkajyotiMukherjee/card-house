import type { BluffState } from '../../src/shared/games/bluff.ts';
import {
  BLUFF_RANKS,
  BLUFF_SUITS,
  bluffGameDefinition,
  bluffRules,
} from '../../src/shared/games/bluff.ts';
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
    id: 'table-bluff',
    lobbyId: 'lobby-1',
    gameType: bluffGameDefinition.gameType,
    name: 'Bluff #1',
    status: 'waiting_for_players',
    minPlayers: bluffGameDefinition.minPlayers,
    maxPlayers: bluffGameDefinition.maxPlayers,
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
  for (const suit of BLUFF_SUITS) {
    for (const rank of BLUFF_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

const empty = bluffRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.discardPile.length === 0, 'no seats deals no pile');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

const deck = standardDeck();
const seats = [3, 1, 5, 0, 4, 2].map(seat);
const dealt = bluffRules.initialState(seats, table());
const dealtCards = Object.values(dealt.hands).flat();
assert(dealt.phase === 'play', 'a full table starts in play');
assert(dealt.turnSeatIndex === 0, 'the current turn is the lowest seat');
assert(Object.keys(dealt.hands).length === 6, 'a full table deals six hands');
assert(dealtCards.length === 52, 'a full table deals 52 cards');
assert(new Set(dealtCards).size === 52, 'dealt cards are unique');
for (const card of dealtCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
assert(dealt.discardPile.length === 0, 'the pile starts empty');
assert(dealt.winnerSeatIndex === null, 'a new deal has no winner');

const actor = dealt.turnSeatIndex;
assert(actor !== null, 'play has a seat to act');
const actorKey = String(actor);
const held = dealt.hands[actorKey];
const card = held[0];
const played = bluffRules.applyIntent(
  dealt,
  { type: 'play', cards: [card] },
  context(actor),
);
assert(played !== dealt, 'a legal play returns a new state');
assert(played.phase === 'play', 'one card from a full hand stays in play');
assert(
  played.hands[actorKey].length === held.length - 1,
  'one card leaves the hand',
);
assert(
  !played.hands[actorKey].includes(card),
  'the played card is gone from the hand',
);
assert(played.discardPile.at(-1) === card, 'the played card lands on the pile');
assert(played.requiredRank === '2', 'the required rank steps forward from Ace');
assert(played.turnSeatIndex === 1, 'the next seated player acts');
assert(
  played.lastPlay?.seat === actor,
  'the last play records the acting seat',
);
assert(
  played.lastPlay?.claimRank === 'A',
  'the claim is the rank that was required',
);
assert(
  dealt.hands[actorKey].includes(card),
  'a legal play leaves the previous hand in place',
);

const other = 1;
const before = JSON.stringify(dealt);
const handsBefore = dealt.hands;
const pileBefore = dealt.discardPile;
let rejected = false;
try {
  bluffRules.applyIntent(
    dealt,
    { type: 'play', cards: [dealt.hands[String(other)][0]] },
    context(other),
  );
} catch (error) {
  rejected = error instanceof Error && error.message === 'Not your turn';
}
assert(rejected, 'a move from another seat is rejected');
assert(
  JSON.stringify(dealt) === before,
  'a rejected move does not change state',
);
assert(dealt.hands === handsBefore, 'a rejected move keeps the same hands');
assert(dealt.discardPile === pileBefore, 'a rejected move keeps the same pile');
assert(dealt.turnSeatIndex === actor, 'a rejected move keeps the same turn');

// The last card is enough. Playing the rest of a shuffled deck is noise.
const ending: BluffState = {
  phase: 'play',
  hands: {
    '0': ['AS'],
    '1': ['KH'],
  },
  discardPile: [],
  requiredRank: 'A',
  turnSeatIndex: 0,
  lastPlay: null,
  winnerSeatIndex: null,
};
const finished = bluffRules.applyIntent(
  ending,
  { type: 'play', cards: ['AS'] },
  context(0),
);
assert(
  finished.phase === 'finished',
  'playing the last card finishes the game',
);
assert(finished.winnerSeatIndex === 0, 'the seat that emptied its hand wins');
assert(finished.hands['0'].length === 0, 'the winner holds no cards');
assert(finished.hands['1'][0] === 'KH', 'the other seat keeps its card');

const liar: BluffState = {
  phase: 'play',
  hands: { '0': ['2S'], '1': ['KH', 'QH'] },
  discardPile: ['3C'],
  requiredRank: '2',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['3C'], claimRank: 'A' },
  winnerSeatIndex: null,
};
const bluffNote = bluffRules.eventNote(
  liar,
  { type: 'challenge' },
  bluffRules.applyIntent(liar, { type: 'challenge' }, context(1)),
  context(1),
);
assert(
  JSON.stringify(bluffNote) ===
    JSON.stringify({
      kind: 'challenge',
      challenger: 1,
      accused: 0,
      bluff: true,
      pickedUp: 0,
    }),
  'a challenge of a false claim notes a caught bluff',
);
const honest: BluffState = {
  ...liar,
  discardPile: ['AC'],
  lastPlay: { seat: 0, cards: ['AC'], claimRank: 'A' },
};
const honestNote = bluffRules.eventNote(
  honest,
  { type: 'challenge' },
  bluffRules.applyIntent(honest, { type: 'challenge' }, context(1)),
  context(1),
);
assert(
  honestNote !== null && honestNote.kind === 'challenge' && !honestNote.bluff,
  'a challenge of an honest claim notes no bluff',
);
assert(
  honestNote.pickedUp === 1,
  'the challenger picks up after an honest claim',
);
const playNote = bluffRules.eventNote(
  ending,
  { type: 'play', cards: ['AS'] },
  finished,
  context(0),
);
assert(
  JSON.stringify(playNote) ===
    JSON.stringify({ kind: 'play', seat: 0, count: 1, claimRank: 'A' }),
  'a play notes the seat, card count, and claimed rank',
);

console.log(
  JSON.stringify({
    gameType: bluffGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: dealtCards.length,
    turnSeatIndex: dealt.turnSeatIndex,
    playedRank: played.requiredRank,
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
  }),
);
