import type { GoFishState } from '../../src/shared/games/go-fish.ts';
import {
  GO_FISH_RANKS,
  GO_FISH_SUITS,
  goFishGameDefinition,
  goFishRules,
} from '../../src/shared/games/go-fish.ts';
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

function table(id = 'table-go-fish'): GameTable {
  return {
    id,
    lobbyId: 'lobby-1',
    gameType: goFishGameDefinition.gameType,
    name: 'Go Fish #1',
    status: 'waiting_for_players',
    minPlayers: goFishGameDefinition.minPlayers,
    maxPlayers: goFishGameDefinition.maxPlayers,
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
  for (const suit of GO_FISH_SUITS) {
    for (const rank of GO_FISH_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function cardCount(state: GoFishState, seatIndex: number): number {
  const key = String(seatIndex);
  const hand = state.hands[key]?.length ?? 0;
  let booked = 0;
  for (const book of state.books[key] ?? []) {
    booked += book.cards.length;
  }
  return hand + booked;
}

function allCards(state: GoFishState): string[] {
  const cards = state.stock.slice();
  for (const hand of Object.values(state.hands)) {
    cards.push(...hand);
  }
  for (const list of Object.values(state.books)) {
    for (const book of list) {
      cards.push(...book.cards);
    }
  }
  return cards;
}

function booksOf(ranks: readonly string[]): GoFishState['books'][string] {
  return ranks.map((rank) => ({
    rank: rank as GoFishState['books'][string][number]['rank'],
    cards: GO_FISH_SUITS.map((suit) => `${rank}${suit}`),
  }));
}

function playState(overrides: Partial<GoFishState>): GoFishState {
  return {
    phase: 'play',
    hands: {},
    stock: [],
    books: {},
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    lastAsk: null,
    ...overrides,
  };
}

assert(goFishGameDefinition.gameType === 'go_fish', 'gameType is go_fish');
assert(
  goFishGameDefinition.displayName === 'Go Fish',
  'display name is Go Fish',
);
assert(goFishGameDefinition.minPlayers === 2, 'at least two players');
assert(goFishGameDefinition.maxPlayers === 6, 'at most six players');
assert(
  goFishGameDefinition.howToPlay.includes('book'),
  'how to play explains books',
);

const empty = goFishRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.stock.length === 0, 'no seats deals no stock');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

const deck = standardDeck();
const two = goFishRules.initialState([seat(1), seat(0)], table());
const twoCards = allCards(two);
assert(two.phase === 'play', 'two players start in play');
assert(two.turnSeatIndex === 0, 'the current turn is the lowest seat');
assert(cardCount(two, 0) === 7, 'two players deal seven cards to seat 0');
assert(cardCount(two, 1) === 7, 'two players deal seven cards to seat 1');
assert(two.stock.length === 38, 'two players leave 38 cards in the stock');
assert(twoCards.length === 52, 'two players account for 52 cards');
assert(new Set(twoCards).size === 52, 'dealt cards are unique');
for (const card of twoCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
for (const hand of Object.values(two.hands)) {
  const ranks = new Map<string, number>();
  for (const card of hand) {
    const rank = card.slice(0, -1);
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
  }
  for (const count of ranks.values()) {
    assert(count < 4, 'a dealt hand does not still hold a book');
  }
}
assert(two.winnerSeatIndex === null, 'a new deal has no winner');

const again = goFishRules.initialState([seat(0), seat(1)], table());
assert(
  JSON.stringify(again.hands) === JSON.stringify(two.hands),
  'the same table id deals the same hands',
);
assert(
  JSON.stringify(again.stock) === JSON.stringify(two.stock),
  'the same table id deals the same stock',
);
const other = goFishRules.initialState(
  [seat(0), seat(1)],
  table('table-other'),
);
assert(
  JSON.stringify(other.hands) !== JSON.stringify(two.hands) ||
    JSON.stringify(other.stock) !== JSON.stringify(two.stock),
  'a different table id shuffles the deck',
);

const six = goFishRules.initialState([5, 1, 4, 0, 3, 2].map(seat), table());
assert(Object.keys(six.hands).length === 6, 'a full table deals six hands');
for (const index of [0, 1, 2, 3, 4, 5]) {
  assert(cardCount(six, index) === 5, `seat ${index} is dealt five cards`);
}
assert(six.stock.length === 22, 'six players leave 22 cards in the stock');
assert(allCards(six).length === 52, 'six players account for 52 cards');
assert(six.turnSeatIndex === 0, 'six players still start at the lowest seat');

const four = goFishRules.initialState([0, 1, 2, 3].map(seat), table());
assert(four.stock.length === 32, 'four players leave 32 cards in the stock');
assert(cardCount(four, 2) === 5, 'four players deal five cards');

const hit: GoFishState = playState({
  hands: {
    '0': ['AS', 'AH', 'AD', '2C'],
    '1': ['AC', 'KH', 'KD'],
  },
  stock: ['3D', '4S'],
  books: { '0': [], '1': [] },
});
const hitHands = hit.hands;
const hitStock = hit.stock;
const scored = goFishRules.applyIntent(
  hit,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(scored !== hit, 'a legal ask returns a new state');
assert(scored.phase === 'play', 'one book does not end the game');
assert(scored.hands['0']?.includes('2C') === true, 'other ranks stay in hand');
assert(
  scored.hands['0']?.some((card) => card.startsWith('A')) !== true,
  'the booked aces leave the hand',
);
assert(
  scored.hands['1']?.includes('AC') !== true,
  'the asked seat gives every ace',
);
assert(scored.hands['1']?.includes('KH') === true, 'other cards stay put');
assert(scored.books['0']?.length === 1, 'four aces score one book');
assert(scored.books['0']?.[0]?.rank === 'A', 'the book records the rank');
assert(scored.books['0']?.[0]?.cards.length === 4, 'a book holds four cards');
assert(scored.books['1']?.length === 0, 'the asked seat scores nothing');
assert(scored.turnSeatIndex === 0, 'a hit keeps the turn');
assert(scored.lastAsk?.given === 1, 'the ask records one given card');
assert(scored.lastAsk?.drawn === null, 'a hit does not draw');
assert(scored.stock.length === 2, 'a hit leaves the stock alone');
assert(hit.hands === hitHands, 'a legal ask keeps the previous hands');
assert(hit.stock === hitStock, 'a legal ask keeps the previous stock');
assert(
  hit.hands['1']?.includes('AC') === true,
  'the previous hand still has the ace',
);

const both: GoFishState = playState({
  hands: {
    '0': ['KS'],
    '1': ['KH', 'KD', '2C'],
  },
  stock: ['4S'],
  books: { '0': [], '1': [] },
});
const tookBoth = goFishRules.applyIntent(
  both,
  { type: 'ask', targetSeat: 1, rank: 'K' },
  context(0),
);
assert(tookBoth.hands['0']?.length === 3, 'every matching card is given');
assert(
  tookBoth.hands['1']?.[0] === '2C',
  'cards of other ranks stay with the asked seat',
);
assert(tookBoth.turnSeatIndex === 0, 'giving cards does not pass the turn');

const miss: GoFishState = playState({
  hands: {
    '0': ['AS', '2C'],
    '1': ['KH'],
  },
  stock: ['3D', '4S'],
  books: { '0': [], '1': [] },
});
const fished = goFishRules.applyIntent(
  miss,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(
  fished.hands['0']?.includes('3D') === true,
  'a miss draws the stock top',
);
assert(fished.stock[0] === '4S', 'the next stock card is now on top');
assert(fished.turnSeatIndex === 1, 'a miss passes the turn');
assert(fished.lastAsk?.given === 0, 'a miss gives no cards');
assert(fished.lastAsk?.drawn === '3D', 'a miss records the drawn card');
assert(
  fished.hands['1']?.[0] === 'KH',
  'the asked hand is unchanged on a miss',
);

const lucky: GoFishState = playState({
  hands: {
    '0': ['AS'],
    '1': ['KH'],
  },
  stock: ['AH', '4S'],
  books: { '0': [], '1': [] },
});
const luckyDraw = goFishRules.applyIntent(
  lucky,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(
  luckyDraw.hands['0']?.includes('AH') === true,
  'go fish can draw the asked rank',
);
assert(luckyDraw.turnSeatIndex === 0, 'drawing the asked rank keeps the turn');

const bookedDraw: GoFishState = playState({
  hands: {
    '0': ['AS', 'AH', 'AD'],
    '1': ['KH'],
  },
  stock: ['AC', '2C'],
  books: { '0': [], '1': [] },
});
const continued = goFishRules.applyIntent(
  bookedDraw,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(continued.books['0']?.length === 1, 'the fished ace completes a book');
assert(
  continued.hands['0']?.[0] === '2C',
  'an emptied hand draws a replacement',
);
assert(continued.turnSeatIndex === 0, 'the asked rank still keeps the turn');
assert(continued.stock.length === 0, 'both stock cards were drawn');

const dry: GoFishState = playState({
  hands: {
    '0': ['AS', '2C'],
    '1': ['KH', 'QD'],
  },
  stock: [],
  books: { '0': [], '1': [] },
});
const dryMiss = goFishRules.applyIntent(
  dry,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(dryMiss.phase === 'play', 'cards in both hands keep the game going');
assert(dryMiss.stock.length === 0, 'an empty stock stays empty');
assert(dryMiss.hands['0']?.length === 2, 'a dry miss adds no card');
assert(dryMiss.turnSeatIndex === 1, 'a dry miss passes the turn');
assert(dryMiss.lastAsk?.drawn === null, 'a dry miss draws nothing');

const before = JSON.stringify(hit);
let rejected = false;
try {
  goFishRules.applyIntent(
    hit,
    { type: 'ask', targetSeat: 0, rank: 'K' },
    context(1),
  );
} catch (error) {
  rejected = error instanceof Error && error.message === 'Not your turn';
}
assert(rejected, 'a move from another seat is rejected');
assert(JSON.stringify(hit) === before, 'a rejected move does not change state');

let illegalRank = false;
try {
  goFishRules.applyIntent(
    hit,
    { type: 'ask', targetSeat: 1, rank: 'K' },
    context(0),
  );
} catch (error) {
  illegalRank = error instanceof Error && error.message === 'Invalid intent';
}
assert(illegalRank, 'asking for a rank you do not hold is rejected');
assert(JSON.stringify(hit) === before, 'an illegal rank does not change state');

let askedSelf = false;
try {
  goFishRules.applyIntent(
    hit,
    { type: 'ask', targetSeat: 0, rank: 'A' },
    context(0),
  );
} catch (error) {
  askedSelf = error instanceof Error && error.message === 'Invalid intent';
}
assert(askedSelf, 'asking yourself is rejected');

let missingSeat = false;
try {
  goFishRules.applyIntent(
    hit,
    { type: 'ask', targetSeat: 4, rank: 'A' },
    context(0),
  );
} catch (error) {
  missingSeat = error instanceof Error && error.message === 'Invalid intent';
}
assert(missingSeat, 'asking an empty seat is rejected');

const note = goFishRules.eventNote(
  miss,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  fished,
  context(0),
);
assert(
  JSON.stringify(note) ===
    JSON.stringify({
      kind: 'ask',
      from: 0,
      to: 1,
      rank: 'A',
      given: 0,
      drawn: true,
    }),
  'a miss notes the ask and the draw',
);

const low = ['2', '3', '4', '5', '6', '7'];
const high = ['8', '9', '10', 'J', 'Q', 'K'];
const ending = playState({
  hands: {
    '0': ['AS', 'AH', 'AD'],
    '1': ['AC'],
  },
  stock: [],
  books: { '0': booksOf(low), '1': booksOf(high) },
});
const finished = goFishRules.applyIntent(
  ending,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(finished.phase === 'finished', 'the last book finishes the game');
assert(finished.books['0']?.length === 7, 'the asker scores the last book');
assert(finished.books['1']?.length === 6, 'the other seat keeps six books');
assert(finished.winnerSeatIndex === 0, 'the higher book count wins');
assert(finished.hands['0']?.length === 0, 'the winner holds no cards');
assert(finished.hands['1']?.length === 0, 'the other hand is empty');
assert(finished.turnSeatIndex === null, 'a finished game has no turn');

const tied = playState({
  hands: {
    '0': ['AS', 'AH'],
    '1': [],
  },
  stock: [],
  books: { '0': booksOf(low), '1': booksOf(high) },
});
const tie = goFishRules.applyIntent(
  tied,
  { type: 'ask', targetSeat: 1, rank: 'A' },
  context(0),
);
assert(tie.phase === 'finished', 'one player left with cards ends the game');
assert(tie.books['0']?.length === 6, 'a miss does not add a book');
assert(tie.books['1']?.length === 6, 'the other score stays even');
assert(tie.winnerSeatIndex === null, 'an even book count is a tie');

let afterFinish = false;
try {
  goFishRules.applyIntent(
    finished,
    { type: 'ask', targetSeat: 1, rank: 'A' },
    context(0),
  );
} catch (error) {
  afterFinish = error instanceof Error && error.message === 'Not your turn';
}
assert(afterFinish, 'a finished game rejects another ask');

const dealt = goFishRules.initialState(
  [seat(0), seat(1)],
  table('table-leave'),
);
const leave = goFishRules.onPlayerLeave;
assert(leave !== undefined, 'leaving a seat is handled');
const left = leave(dealt, seat(1));
assert(left.phase === 'finished', 'one remaining player finishes the game');
assert(left.winnerSeatIndex === 0, 'the remaining player wins');
assert(left.hands['1'] === undefined, 'the leaver is no longer seated');
assert(allCards(left).length === 52, 'the leaver returns their cards');

console.log(
  JSON.stringify({
    gameType: goFishGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: twoCards.length,
    turnSeatIndex: two.turnSeatIndex,
    stock: two.stock.length,
    books: scored.books['0']?.length,
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
    tie: tie.winnerSeatIndex,
  }),
);
