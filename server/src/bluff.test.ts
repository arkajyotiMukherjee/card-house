import type { BluffState } from '../../src/shared/games/bluff.ts';
import {
  BLUFF_JOKERS,
  BLUFF_RANKS,
  BLUFF_SUITS,
  bluffGameDefinition,
  bluffRules,
  cardIsTrue,
  isJoker,
  rankOfCard,
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
  for (const joker of BLUFF_JOKERS) {
    deck.add(joker);
  }
  return deck;
}

function rankTallies(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const rank = rankOfCard(card);
    if (rank === null) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

function playing(overrides: Partial<BluffState>): BluffState {
  return {
    phase: 'play',
    hands: {},
    discardPile: [],
    requiredRank: null,
    passed: [],
    playCounts: {},
    turnSeatIndex: 0,
    lastPlay: null,
    winnerSeatIndex: null,
    ...overrides,
  };
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
assert(dealtCards.length === 54, 'a full table deals 52 cards and two jokers');
assert(new Set(dealtCards).size === 54, 'dealt cards are unique');
assert(dealt.requiredRank === null, 'the lead has not called a rank');
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
const called = isJoker(card) ? 'A' : rankOfCard(card);
assert(played.requiredRank === called, 'the lead calls the played card rank');
assert(played.playCounts[actorKey] === 1, 'the play is counted for that seat');
assert(played.turnSeatIndex === 1, 'the next seated player acts');
assert(
  played.lastPlay?.seat === actor,
  'the last play records the acting seat',
);
assert(
  played.lastPlay?.claimRank === called,
  'the claim is the rank the lead called',
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

let tooMany = false;
try {
  bluffRules.applyIntent(
    playing({
      hands: { '0': ['AS', 'AH', 'AD'], '1': ['KH'] },
      requiredRank: 'A',
      turnSeatIndex: 0,
    }),
    { type: 'play', cards: ['AS', 'AH', 'AD'] },
    context(0),
  );
} catch (error) {
  tooMany = error instanceof Error && error.message === 'Play one card';
}
assert(tooMany, 'three aces are not a legal play');

const oneAce = bluffRules.applyIntent(
  playing({
    hands: { '0': ['AS', 'AH', 'AD'], '1': ['KH'] },
    requiredRank: 'A',
    turnSeatIndex: 0,
  }),
  { type: 'play', cards: ['AS'] },
  context(0),
);
assert(oneAce.phase === 'play', 'one ace is legal when the call is aces');
assert(
  oneAce.lastPlay?.cards.length === 1 &&
    cardIsTrue(oneAce.lastPlay.cards[0] ?? '', 'A'),
  'one ace matches the called ace',
);

const ending = playing({
  hands: { '0': ['AS'], '1': ['KH'] },
  requiredRank: 'A',
  turnSeatIndex: 0,
});
const playedLast = bluffRules.applyIntent(
  ending,
  { type: 'play', cards: ['AS'] },
  context(0),
);
assert(playedLast.phase === 'play', 'the last card can still be challenged');
assert(playedLast.hands['0'].length === 0, 'the last card leaves the hand');
const finished = bluffRules.applyIntent(
  playedLast,
  { type: 'pass' },
  context(1),
);
assert(
  finished.phase === 'finished',
  'the next player letting the last card stand finishes the game',
);
assert(finished.winnerSeatIndex === 0, 'the seat that emptied its hand wins');
assert(finished.hands['0'].length === 0, 'the winner holds no cards');
assert(finished.hands['1'][0] === 'KH', 'the other seat keeps its card');

const liar = playing({
  hands: { '0': ['2S'], '1': ['KH', 'QH'] },
  discardPile: ['3C'],
  requiredRank: 'A',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['3C'], claimRank: 'A' },
});
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
  playedLast,
  context(0),
);
assert(
  JSON.stringify(playNote) ===
    JSON.stringify({ kind: 'play', seat: 0, count: 1, claimRank: 'A' }),
  'a play notes the seat, card count, and claimed rank',
);

const jokerPlay = bluffRules.applyIntent(
  playing({
    hands: { '0': ['JR'], '1': ['KH'] },
    requiredRank: 'Q',
    turnSeatIndex: 0,
  }),
  { type: 'play', cards: ['JR'] },
  context(0),
);
const jokerNote = bluffRules.eventNote(
  playing({
    hands: { '0': ['2S'], '1': ['KH'] },
    discardPile: ['JR'],
    requiredRank: 'Q',
    turnSeatIndex: 1,
    lastPlay: { seat: 0, cards: ['JR'], claimRank: 'Q' },
  }),
  { type: 'challenge' },
  bluffRules.applyIntent(
    playing({
      hands: { '0': ['2S'], '1': ['KH'] },
      discardPile: ['JR'],
      requiredRank: 'Q',
      turnSeatIndex: 1,
      lastPlay: { seat: 0, cards: ['JR'], claimRank: 'Q' },
    }),
    { type: 'challenge' },
    context(1),
  ),
  context(1),
);
assert(jokerPlay.lastPlay?.claimRank === 'Q', 'a joker is played on the call');
assert(
  jokerNote !== null && jokerNote.kind === 'challenge' && !jokerNote.bluff,
  'a joker is a true card and is not a queen',
);

const passed = bluffRules.applyIntent(
  playing({
    hands: { '0': ['4S'], '1': ['KH'], '2': ['QD'] },
    requiredRank: '4',
    turnSeatIndex: 1,
    lastPlay: { seat: 0, cards: ['4S'], claimRank: '4' },
  }),
  { type: 'pass' },
  context(1),
);
assert(passed.passed.includes(1), 'a pass sits that seat out');
let passedAgain = false;
try {
  bluffRules.applyIntent(
    { ...passed, turnSeatIndex: 1 },
    { type: 'play', cards: ['KH'] },
    context(1),
  );
} catch (error) {
  passedAgain = error instanceof Error && error.message === 'You passed';
}
assert(passedAgain, 'a seat that passed cannot play again this round');

for (const count of [2, 3, 4, 5, 6]) {
  for (const id of ['table-bluff', 'a', 'queens', 'five', 'joker']) {
    const players = Array.from({ length: count }, (_item, index) =>
      seat(index),
    );
    const round = bluffRules.initialState(players, {
      ...table(),
      id: `${id}-${count}`,
    });
    const cards = Object.values(round.hands).flat();
    assert(cards.length === 54, `${id} deals every card`);
    assert(new Set(cards).size === 54, `${id} deals unique cards`);
    for (const [rank, tally] of rankTallies(cards)) {
      assert(tally <= 4, `${id} has ${tally} of rank ${rank}`);
    }
    const jokers = cards.filter((card) => isJoker(card));
    assert(jokers.length === 2, `${id} deals two jokers`);
    for (const joker of jokers) {
      assert(rankOfCard(joker) !== 'Q', `${joker} is not labeled as a queen`);
    }
    for (const hand of Object.values(round.hands)) {
      for (const [rank, tally] of rankTallies(hand)) {
        assert(tally < 5, `${id} dealt ${tally} of rank ${rank} to one hand`);
      }
    }
  }
}

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
