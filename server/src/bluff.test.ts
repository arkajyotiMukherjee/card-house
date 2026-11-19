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

function assertThrows(call: () => unknown, message: string): void {
  try {
    call();
  } catch {
    return;
  }
  throw new Error(message);
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
    turnCounts: {},
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
assert(played.turnCounts[actorKey] === 1, 'the play counts as a turn');
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

const many = bluffRules.applyIntent(
  playing({
    hands: { '0': ['AS', 'AH', 'AD', 'KS'], '1': ['KH'] },
    requiredRank: 'A',
    turnSeatIndex: 0,
  }),
  { type: 'play', cards: ['AS', 'AH', 'AD'] },
  context(0),
);
assert(many.hands['0'].length === 1, 'three aces leave the other card');
assert(many.hands['0'][0] === 'KS', 'the unplayed card stays in the hand');
assert(
  many.discardPile.join(',') === 'AS,AH,AD',
  'the whole selection lands on the pile',
);
assert(
  many.lastPlay?.cards.join(',') === 'AS,AH,AD' &&
    many.lastPlay.claimRank === 'A',
  'a multi-card play keeps the rank already called',
);
assert(many.requiredRank === 'A', 'a follow play does not call a new rank');
const manyNote = bluffRules.eventNote(
  playing({
    hands: { '0': ['AS', 'AH', 'AD', 'KS'], '1': ['KH'] },
    requiredRank: 'A',
    turnSeatIndex: 0,
  }),
  { type: 'play', cards: ['AS', 'AH', 'AD'] },
  many,
  context(0),
);
assert(
  manyNote !== null && manyNote.kind === 'play' && manyNote.count === 3,
  'a multi-card play notes the count',
);

let wrongRank = false;
try {
  bluffRules.applyIntent(
    playing({
      hands: { '0': ['AS', 'KH'], '1': ['QD'] },
      requiredRank: 'A',
      turnSeatIndex: 0,
    }),
    { type: 'play', cards: ['AS'], claimRank: 'K' },
    context(0),
  );
} catch (error) {
  wrongRank =
    error instanceof Error && error.message === 'The rank is already called';
}
assert(wrongRank, 'a follow play cannot call a new rank');

const leadCall = bluffRules.applyIntent(
  playing({
    hands: { '0': ['2C', '2D', 'KH'], '1': ['QD'] },
    requiredRank: null,
    turnSeatIndex: 0,
  }),
  { type: 'play', cards: ['2C', '2D'], claimRank: 'Q' },
  context(0),
);
assert(leadCall.requiredRank === 'Q', 'only the lead calls the rank');
assert(
  leadCall.lastPlay?.cards.length === 2,
  'the lead may play more than one card',
);

let emptyPlay = false;
try {
  bluffRules.applyIntent(
    playing({
      hands: { '0': ['AS'], '1': ['KH'] },
      requiredRank: null,
      turnSeatIndex: 0,
    }),
    { type: 'play', cards: [] },
    context(0),
  );
} catch (error) {
  emptyPlay =
    error instanceof Error && error.message === 'Play at least one card';
}
assert(emptyPlay, 'an empty selection is not a play');

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

const lieRound = playing({
  hands: { '0': ['2S'], '1': ['KH'], '2': ['QH', 'QD'] },
  discardPile: ['5S', '3C'],
  requiredRank: 'A',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['3C'], claimRank: 'A' },
});
const caught = bluffRules.applyIntent(
  lieRound,
  { type: 'challenge' },
  context(2),
);
assert(caught.phase === 'play', 'a caught lie stays in play');
assert(caught.turnSeatIndex === 2, 'a caught lie lets the challenger lead');
assert(caught.requiredRank === null, 'the challenger calls the next rank');
assert(caught.discardPile.length === 0, 'a caught lie clears the pile');
assert(caught.lastPlay === null, 'the new lead has not played');
assert(
  caught.hands['0'].includes('3C') && caught.hands['0'].includes('5S'),
  'the player who lied picks up the pile',
);
assert(
  !caught.hands['2'].includes('3C'),
  'the challenger does not pick up a lie',
);
let liarCalled = false;
try {
  bluffRules.applyIntent(
    caught,
    { type: 'play', cards: ['2S'], claimRank: 'K' },
    context(0),
  );
} catch (error) {
  liarCalled = error instanceof Error && error.message === 'Not your turn';
}
assert(liarCalled, 'the player who lied does not call the next rank');
const challengerLed = bluffRules.applyIntent(
  caught,
  { type: 'play', cards: ['QH'], claimRank: 'Q' },
  context(2),
);
assert(
  challengerLed.requiredRank === 'Q' && challengerLed.lastPlay?.seat === 2,
  'the challenger calls the next rank',
);

const honestRound = playing({
  hands: { '0': ['2S'], '1': ['KH'], '2': ['QH'] },
  discardPile: ['5S', 'AC'],
  requiredRank: 'A',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['AC'], claimRank: 'A' },
});
const stood = bluffRules.applyIntent(
  honestRound,
  { type: 'challenge' },
  context(2),
);
assert(
  stood.turnSeatIndex === 0,
  'an honest play lets the player who was challenged lead',
);
assert(stood.requiredRank === null, 'the honest player calls the next rank');
assert(
  stood.hands['2'].includes('AC') && stood.hands['2'].includes('5S'),
  'the challenger picks up an honest pile',
);
assert(
  !stood.hands['0'].includes('AC'),
  'the honest player does not pick the pile up',
);
let challengerCalled = false;
try {
  bluffRules.applyIntent(
    stood,
    { type: 'play', cards: ['QH'], claimRank: 'Q' },
    context(2),
  );
} catch (error) {
  challengerCalled =
    error instanceof Error && error.message === 'Not your turn';
}
assert(challengerCalled, 'the challenger who lost does not call the next rank');

const jokerRound = playing({
  hands: { '0': ['2S'], '1': ['KH'], '2': ['QH'] },
  discardPile: ['QD', 'JR'],
  requiredRank: 'Q',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['QD', 'JR'], claimRank: 'Q' },
});
const jokerStood = bluffRules.applyIntent(
  jokerRound,
  { type: 'challenge' },
  context(2),
);
assert(
  jokerStood.turnSeatIndex === 0,
  'a joker lets the player who was challenged lead',
);
assert(
  jokerStood.requiredRank === null,
  'a challenged joker starts a new call',
);
assert(
  jokerStood.hands['2'].includes('JR') && jokerStood.hands['2'].includes('QD'),
  'the challenger picks up a joker',
);
assert(
  !jokerStood.hands['0'].includes('JR'),
  'the player who played the joker does not pick it up',
);

const openRound = playing({
  hands: { '0': ['4S', 'KS'], '1': ['KH'], '2': ['4C', '4D'] },
  discardPile: ['4H'],
  requiredRank: '4',
  turnSeatIndex: 1,
  lastPlay: { seat: 0, cards: ['4H'], claimRank: '4' },
});
const firstPass = bluffRules.applyIntent(
  openRound,
  { type: 'pass' },
  context(1),
);
assert(firstPass.requiredRank === '4', 'one pass keeps the called rank');
assert(firstPass.discardPile.length === 1, 'one pass leaves the pile');
assert(firstPass.turnSeatIndex === 2, 'one pass moves to the next seat');
assertThrows(
  () => bluffRules.applyIntent(firstPass, { type: 'flush' }, context(2)),
  'a seat cannot flush another player’s claim',
);
const followed = bluffRules.applyIntent(
  firstPass,
  { type: 'play', cards: ['4C', '4D'] },
  context(2),
);
assert(
  followed.requiredRank === '4',
  'a later seat still plays the called rank',
);
assert(
  followed.lastPlay?.seat === 2 && followed.lastPlay.cards.length === 2,
  'that play is one selection of the called rank',
);
const secondPass = bluffRules.applyIntent(
  firstPass,
  { type: 'pass' },
  context(2),
);
assert(
  secondPass.turnSeatIndex === 0,
  'the last player to play leads after everyone else passes',
);
assert(secondPass.requiredRank === '4', 'passes keep the called rank');
assert(secondPass.discardPile.length === 1, 'passes leave the pile in place');
assert(secondPass.passed.length === 2, 'both passes remain visible');
assertThrows(
  () => bluffRules.applyIntent(secondPass, { type: 'challenge' }, context(2)),
  'the last pass closes the challenge window',
);
assertThrows(
  () => bluffRules.applyIntent(secondPass, { type: 'pass' }, context(0)),
  'the last player can play or flush',
);
const continued = bluffRules.applyIntent(
  secondPass,
  { type: 'play', cards: ['4S'] },
  context(0),
);
assert(
  continued.requiredRank === '4' &&
    continued.discardPile.length === 2 &&
    continued.turnSeatIndex === 1 &&
    continued.passed.length === 0,
  'playing again keeps rank and pile and reopens the round',
);
const continuedBluff = bluffRules.applyIntent(
  secondPass,
  { type: 'play', cards: ['KS'] },
  context(0),
);
assert(
  continuedBluff.lastPlay?.claimRank === '4' &&
    continuedBluff.lastPlay.cards[0] === 'KS',
  'the player can bluff again under the same rank',
);
const afterChallenge = bluffRules.applyIntent(
  continued,
  { type: 'challenge' },
  context(1),
);
assert(
  afterChallenge.lastPileResult?.kind === 'challenge' &&
    afterChallenge.lastPileResult.pickedUp === 1 &&
    afterChallenge.lastPileResult.count === 2,
  'the new play can be challenged and records the pickup',
);
const flushed = bluffRules.applyIntent(
  secondPass,
  { type: 'flush' },
  context(0),
);
assert(
  flushed.discardPile.length === 0 &&
    flushed.requiredRank === null &&
    flushed.passed.length === 0 &&
    flushed.lastPlay === null &&
    flushed.lastPileResult?.kind === 'flush' &&
    flushed.turnSeatIndex === 0,
  'an explicit flush clears the pile and lets the same player lead',
);
assert(
  flushed.hands['0'].length === 2 && flushed.hands['0'][0] === '4S',
  'the lead does not pick up a set-aside pile',
);
assert(
  !flushed.hands['1'].includes('4H') && !flushed.hands['2'].includes('4H'),
  'no other seat picks up a set-aside pile',
);
const calledAgain = bluffRules.applyIntent(
  flushed,
  { type: 'play', cards: ['4S'], claimRank: 'K' },
  context(0),
);
assert(
  calledAgain.requiredRank === 'K',
  'the last player to play calls the next rank',
);

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
