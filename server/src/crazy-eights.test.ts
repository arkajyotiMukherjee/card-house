import type { CrazyEightsState } from '../../src/shared/games/crazy-eights.ts';
import {
  CRAZY_EIGHTS_RANKS,
  CRAZY_EIGHTS_SUITS,
  cardPoints,
  crazyEightsGameDefinition,
  crazyEightsRules,
} from '../../src/shared/games/crazy-eights.ts';
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

function table(id = 'table-crazy'): GameTable {
  return {
    id,
    lobbyId: 'lobby-1',
    gameType: crazyEightsGameDefinition.gameType,
    name: 'Crazy Eights #1',
    status: 'waiting_for_players',
    minPlayers: crazyEightsGameDefinition.minPlayers,
    maxPlayers: crazyEightsGameDefinition.maxPlayers,
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
  for (const suit of CRAZY_EIGHTS_SUITS) {
    for (const rank of CRAZY_EIGHTS_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function playing(overrides: Partial<CrazyEightsState> = {}): CrazyEightsState {
  return {
    phase: 'play',
    hands: { '0': ['5H', '8C', 'QH'], '1': ['AD', '2C'] },
    stock: ['9D', '3C', '4S'],
    discardPile: ['5S'],
    currentSuit: 'S',
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
    ...overrides,
  };
}

function cardsOf(state: CrazyEightsState): string[] {
  return Object.values(state.hands)
    .flat()
    .concat(state.stock, state.discardPile);
}

assert(cardPoints('8S') === 50, 'an eight scores 50');
assert(cardPoints('KS') === 10, 'a king scores 10');
assert(cardPoints('QS') === 10, 'a queen scores 10');
assert(cardPoints('JS') === 10, 'a jack scores 10');
assert(cardPoints('AS') === 1, 'an ace scores 1');
assert(cardPoints('10S') === 10, 'a ten scores 10');
assert(cardPoints('2S') === 2, 'a two scores 2');
assert(cardPoints('7H') === 7, 'a seven scores 7');

assert(
  crazyEightsGameDefinition.gameType === 'crazy_eights',
  'the catalog key is crazy_eights',
);
assert(
  crazyEightsGameDefinition.displayName === 'Crazy Eights',
  'display name',
);
assert(crazyEightsGameDefinition.minPlayers === 2, 'at least two players');
assert(crazyEightsGameDefinition.maxPlayers === 7, 'at most seven players');
assert(
  crazyEightsGameDefinition.howToPlay.includes('eight'),
  'how to play mentions eights',
);

const empty = crazyEightsRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.discardPile.length === 0, 'no seats deals no pile');
assert(empty.stock.length === 0, 'no seats deals no stock');
assert(empty.turnSeatIndex === null, 'no seats has no turn');
assert(empty.currentSuit === null, 'no seats has no suit');
assert(empty.winnerSeatIndex === null, 'no seats has no winner');

const deck = standardDeck();
const two = crazyEightsRules.initialState([seat(1), seat(0)], table());
const again = crazyEightsRules.initialState([seat(0), seat(1)], table());
assert(
  JSON.stringify(two) === JSON.stringify(again),
  'the same table deals the same cards',
);
const twoCards = cardsOf(two);
assert(two.phase === 'play', 'two players start in play');
assert(two.turnSeatIndex === 0, 'the current turn is the lowest seat');
assert(two.hands['0'].length === 7, 'two players deal seven cards to seat 0');
assert(two.hands['1'].length === 7, 'two players deal seven cards to seat 1');
assert(two.discardPile.length === 1, 'one card starts the discard');
assert(two.stock.length === 37, 'the rest of the deck is the stock');
assert(twoCards.length === 52, 'a two-player deal uses 52 cards');
assert(new Set(twoCards).size === 52, 'dealt cards are unique');
for (const card of twoCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
assert(two.winnerSeatIndex === null, 'a new deal has no winner');
assert(Object.keys(two.scores).length === 0, 'a new deal has no scores');
const starter = two.discardPile[0];
if (starter.startsWith('8')) {
  assert(two.currentSuit === null, 'a starter eight waits for a suit');
} else {
  assert(two.currentSuit === starter.slice(-1), 'the starter suit is in play');
}

const seven = crazyEightsRules.initialState(
  [6, 5, 4, 3, 2, 1, 0].map(seat),
  table('table-seven'),
);
const sevenCards = cardsOf(seven);
assert(Object.keys(seven.hands).length === 7, 'a full table deals seven hands');
for (const hand of Object.values(seven.hands)) {
  assert(hand.length === 5, 'three or more players are dealt five cards');
}
assert(seven.discardPile.length === 1, 'a full table turns one card');
assert(seven.stock.length === 16, 'a full table leaves 16 cards in the stock');
assert(sevenCards.length === 52, 'a full table deals 52 cards');
assert(seven.turnSeatIndex === 0, 'the lowest seat leads a full table');

let sawEight = false;
let sawPlain = false;
for (let index = 0; index < 300 && (!sawEight || !sawPlain); index += 1) {
  const dealt = crazyEightsRules.initialState(
    [seat(0), seat(1)],
    table(`starter-${index}`),
  );
  const top = dealt.discardPile[0];
  if (top.startsWith('8')) {
    assert(dealt.currentSuit === null, 'a starter eight names no suit');
    sawEight = true;
  } else {
    assert(
      dealt.currentSuit === top.slice(-1),
      'a plain starter sets the suit',
    );
    sawPlain = true;
  }
}
assert(sawEight, 'some deal starts on an eight');
assert(sawPlain, 'some deal starts on a plain card');

const matched = playing();
const played = crazyEightsRules.applyIntent(
  matched,
  { type: 'play', card: '5H' },
  context(0),
);
assert(played !== matched, 'a legal play returns a new state');
assert(played.phase === 'play', 'a match from a full hand stays in play');
assert(
  played.hands['0'].join(',') === '8C,QH',
  'the matched card leaves the hand',
);
assert(
  played.discardPile.at(-1) === '5H',
  'the matched card lands on the pile',
);
assert(played.currentSuit === 'H', 'the played suit becomes the suit in play');
assert(played.turnSeatIndex === 1, 'the next seated player acts');
assert(played.passes === 0, 'a play clears passes');
assert(
  matched.hands['0'].includes('5H'),
  'a legal play leaves the previous hand in place',
);
const playNote = crazyEightsRules.eventNote?.(
  matched,
  { type: 'play', card: '5H' },
  played,
  context(0),
);
assert(
  playNote?.kind === 'play' && playNote.card === '5H' && playNote.suit === 'H',
  'a play note records the card and the suit',
);

const wild = crazyEightsRules.applyIntent(
  matched,
  { type: 'play', card: '8C', suit: 'D' },
  context(0),
);
assert(wild.discardPile.at(-1) === '8C', 'an eight lands on the pile');
assert(wild.currentSuit === 'D', 'an eight sets the named suit');
assert(!wild.hands['0'].includes('8C'), 'the eight leaves the hand');
assert(wild.turnSeatIndex === 1, 'an eight still ends the turn');

const rankMatch = playing({
  hands: { '0': ['5C', 'QH'], '1': ['AD'] },
  discardPile: ['5S'],
  currentSuit: 'H',
});
const ranked = crazyEightsRules.applyIntent(
  rankMatch,
  { type: 'play', card: '5C' },
  context(0),
);
assert(ranked.currentSuit === 'C', 'a rank match switches the suit');
assert(ranked.discardPile.at(-1) === '5C', 'the rank match is the new top');

const opener = playing({
  hands: { '0': ['KH', '8D'], '1': ['2C'] },
  discardPile: ['8S'],
  currentSuit: null,
  stock: ['9D'],
});
const opened = crazyEightsRules.applyIntent(
  opener,
  { type: 'play', card: 'KH' },
  context(0),
);
assert(opened.currentSuit === 'H', 'any card answers a starter eight');
assert(opened.discardPile.at(-1) === 'KH', 'the answer covers the eight');

const before = JSON.stringify(matched);
const handsBefore = matched.hands;
const pileBefore = matched.discardPile;
const stockBefore = matched.stock;
let rejected = false;
try {
  crazyEightsRules.applyIntent(
    matched,
    { type: 'play', card: 'QH' },
    context(0),
  );
} catch (error) {
  rejected = error instanceof Error && error.message === 'Invalid intent';
}
assert(rejected, 'a card that misses the suit and the rank is rejected');
assert(
  JSON.stringify(matched) === before,
  'a rejected move does not change state',
);
assert(matched.hands === handsBefore, 'a rejected move keeps the same hands');
assert(
  matched.discardPile === pileBefore,
  'a rejected move keeps the same pile',
);
assert(matched.stock === stockBefore, 'a rejected move keeps the same stock');
assert(matched.turnSeatIndex === 0, 'a rejected move keeps the same turn');

let missingSuit = false;
try {
  crazyEightsRules.applyIntent(
    matched,
    { type: 'play', card: '8C' },
    context(0),
  );
} catch (error) {
  missingSuit = error instanceof Error && error.message === 'Invalid intent';
}
assert(missingSuit, 'an eight without a named suit is rejected');

let extraSuit = false;
try {
  crazyEightsRules.applyIntent(
    matched,
    { type: 'play', card: '5H', suit: 'H' },
    context(0),
  );
} catch (error) {
  extraSuit = error instanceof Error && error.message === 'Invalid intent';
}
assert(extraSuit, 'a plain card cannot name a suit');

let wrongTurn = false;
try {
  crazyEightsRules.applyIntent(
    matched,
    { type: 'play', card: 'AD' },
    context(1),
  );
} catch (error) {
  wrongTurn = error instanceof Error && error.message === 'Not your turn';
}
assert(wrongTurn, 'a move from another seat is rejected');
assert(matched.turnSeatIndex === 0, 'a rejected turn keeps the same seat');

let drewAnyway = false;
try {
  crazyEightsRules.applyIntent(matched, { type: 'draw' }, context(0));
} catch (error) {
  drewAnyway = error instanceof Error && error.message === 'Invalid intent';
}
assert(drewAnyway, 'a draw is rejected when a card can be played');

const stuck = playing({
  hands: { '0': ['QH'], '1': ['AD'] },
  stock: ['9D', '3C'],
  discardPile: ['5S'],
  currentSuit: 'S',
});
const drawn = crazyEightsRules.applyIntent(stuck, { type: 'draw' }, context(0));
assert(
  drawn.hands['0'].join(',') === 'QH,3C',
  'a draw takes the top of the stock',
);
assert(drawn.stock.join(',') === '9D', 'the drawn card leaves the stock');
assert(drawn.turnSeatIndex === 0, 'a draw keeps the turn');
assert(drawn.discardPile.join(',') === '5S', 'a draw leaves the discard');
const drawNote = crazyEightsRules.eventNote?.(
  stuck,
  { type: 'draw' },
  drawn,
  context(0),
);
assert(
  drawNote?.kind === 'draw' && drawNote.seat === 0,
  'a draw note names the seat',
);

const buried = playing({
  hands: { '0': ['KS'], '1': ['AD'] },
  stock: [],
  discardPile: ['2S', '3S', '4S', '5H'],
  currentSuit: 'H',
});
const recycled = crazyEightsRules.applyIntent(
  buried,
  { type: 'draw' },
  context(0),
);
const recycledAgain = crazyEightsRules.applyIntent(
  buried,
  { type: 'draw' },
  context(0),
);
assert(
  JSON.stringify(recycled) === JSON.stringify(recycledAgain),
  'rebuilding the stock is deterministic',
);
assert(recycled.discardPile.join(',') === '5H', 'the top card stays face up');
assert(recycled.stock.length === 2, 'two buried cards remain in the stock');
assert(recycled.hands['0'].length === 2, 'one buried card is drawn');
const rebuilt = recycled.stock.concat(recycled.hands['0']);
rebuilt.sort();
assert(
  rebuilt.join(',') === '2S,3S,4S,KS',
  'the buried cards are the new stock and the draw',
);

const ending = playing({
  hands: { '0': ['5H'], '1': ['8D', 'KH', 'AS', '2C'] },
  stock: ['9D'],
  discardPile: ['5S'],
  currentSuit: 'S',
});
const finished = crazyEightsRules.applyIntent(
  ending,
  { type: 'play', card: '5H' },
  context(0),
);
assert(
  finished.phase === 'finished',
  'playing the last card finishes the game',
);
assert(finished.winnerSeatIndex === 0, 'the seat that emptied its hand wins');
assert(finished.hands['0'].length === 0, 'the winner holds no cards');
assert(
  finished.hands['1'].join(',') === '8D,KH,AS,2C',
  'the other seat keeps its cards',
);
assert(finished.scores['0'] === 63, 'the winner scores 50 + 10 + 1 + 2');
assert(finished.scores['1'] === 0, 'the other seat scores nothing');
assert(finished.turnSeatIndex === null, 'a finished hand has no turn');
const finishNote = crazyEightsRules.eventNote?.(
  ending,
  { type: 'play', card: '5H' },
  finished,
  context(0),
);
assert(
  finishNote?.kind === 'finish' &&
    finishNote.seat === 0 &&
    finishNote.score === 63,
  'the finish note carries the winner and the score',
);

const blocked = playing({
  hands: { '0': ['KS'], '1': ['2C'] },
  stock: [],
  discardPile: ['5H'],
  currentSuit: 'H',
});
let passedEarly = false;
try {
  crazyEightsRules.applyIntent(
    playing({ stock: ['9D'], hands: { '0': ['QH'], '1': ['AD'] } }),
    { type: 'pass' },
    context(0),
  );
} catch (error) {
  passedEarly = error instanceof Error && error.message === 'Invalid intent';
}
assert(passedEarly, 'a pass is rejected while the stock can be drawn');

const afterPass = crazyEightsRules.applyIntent(
  blocked,
  { type: 'pass' },
  context(0),
);
assert(afterPass.phase === 'play', 'one pass does not end the hand');
assert(afterPass.passes === 1, 'a pass is counted');
assert(afterPass.turnSeatIndex === 1, 'a pass gives the turn to the next seat');
const passedOut = crazyEightsRules.applyIntent(
  afterPass,
  { type: 'pass' },
  context(1),
);
assert(passedOut.phase === 'finished', 'a full round of passes ends the hand');
assert(passedOut.winnerSeatIndex === 1, 'the lowest hand wins a blocked game');
assert(passedOut.scores['1'] === 10, 'the winner scores the other hand');
assert(passedOut.scores['0'] === 0, 'the higher hand scores nothing');

const tied = playing({
  hands: { '0': ['KS'], '1': ['QD'] },
  stock: [],
  discardPile: ['5H'],
  currentSuit: 'H',
  passes: 1,
  turnSeatIndex: 1,
});
const tieBroken = crazyEightsRules.applyIntent(
  tied,
  { type: 'pass' },
  context(1),
);
assert(
  tieBroken.winnerSeatIndex === 0,
  'equal hands give the win to the lower seat',
);
assert(
  tieBroken.scores['0'] === 10,
  'the tied winner still scores the other hand',
);

console.log(
  JSON.stringify({
    gameType: crazyEightsGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: twoCards.length,
    turnSeatIndex: two.turnSeatIndex,
    playedSuit: played.currentSuit,
    wildSuit: wild.currentSuit,
    drawn: drawn.hands['0'].at(-1),
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
    winnerScore: finished.scores['0'],
    blockedWinner: passedOut.winnerSeatIndex,
  }),
);
