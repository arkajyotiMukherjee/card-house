import type { RummyState } from '../../src/shared/games/rummy.ts';
import {
  RUMMY_RANKS,
  RUMMY_SUITS,
  cardPoints,
  deadwoodPoints,
  readRummyEventNote,
  rummyGameDefinition,
  rummyRules,
} from '../../src/shared/games/rummy.ts';
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

function table(id = 'table-rummy'): GameTable {
  return {
    id,
    lobbyId: 'lobby-1',
    gameType: rummyGameDefinition.gameType,
    name: 'Rummy #1',
    status: 'waiting_for_players',
    minPlayers: rummyGameDefinition.minPlayers,
    maxPlayers: rummyGameDefinition.maxPlayers,
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
  for (const suit of RUMMY_SUITS) {
    for (const rank of RUMMY_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function zoneCards(state: RummyState): string[] {
  const cards: string[] = [];
  for (const hand of Object.values(state.hands)) {
    cards.push(...hand);
  }
  cards.push(...state.stock);
  cards.push(...state.discardPile);
  for (const meld of state.melds) {
    cards.push(...meld.cards);
  }
  return cards;
}

function expectThrow(run: () => void, message: string): void {
  let rejected = false;
  try {
    run();
  } catch (error) {
    rejected = error instanceof Error && error.message === message;
  }
  assert(rejected, message);
}

function playState(overrides: Partial<RummyState> = {}): RummyState {
  return {
    phase: 'play',
    hands: { '0': ['3H', '4H', '5H', 'KD'], '1': ['AS', '2C'] },
    stock: ['QC', '9D'],
    discardPile: ['7S'],
    melds: [],
    turnSeatIndex: 0,
    drawn: true,
    scores: {},
    winnerSeatIndex: null,
    ...overrides,
  };
}

assert(rummyGameDefinition.gameType === 'rummy', 'gameType is rummy');
assert(rummyGameDefinition.displayName === 'Rummy', 'display name is Rummy');
assert(rummyGameDefinition.minPlayers === 2, 'rummy seats at least 2');
assert(rummyGameDefinition.maxPlayers === 6, 'rummy seats at most 6');
assert(rummyGameDefinition.howToPlay.startsWith('# Rummy'), 'how to play');
assert(cardPoints('AS') === 1, 'an ace scores 1');
assert(cardPoints('10H') === 10, 'a ten scores 10');
assert(cardPoints('KH') === 10, 'a face card scores 10');
assert(cardPoints('7D') === 7, 'a pip card scores its rank');
assert(deadwoodPoints(['AS', 'KH', '7D']) === 18, 'deadwood adds card points');

const empty = rummyRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.hands).length === 0, 'no seats deals no hands');
assert(empty.stock.length === 0, 'no seats deals no stock');
assert(empty.discardPile.length === 0, 'no seats deals no discard');
assert(empty.melds.length === 0, 'no seats deals no melds');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

const deck = standardDeck();
const two = rummyRules.initialState([seat(1), seat(0)], table());
const twoCards = zoneCards(two);
assert(two.phase === 'play', 'two seats start in play');
assert(two.turnSeatIndex === 0, 'the current turn is the lowest seat');
assert(two.hands['0']?.length === 10, 'two players are dealt 10 cards');
assert(two.hands['1']?.length === 10, 'the other seat is dealt 10 cards');
assert(two.discardPile.length === 1, 'the discard starts with one upcard');
assert(two.stock.length === 31, 'the stock is the rest of the deck');
assert(two.drawn === false, 'the first player still needs to draw');
assert(two.winnerSeatIndex === null, 'a new deal has no winner');
assert(twoCards.length === 52, 'a two-seat deal uses 52 cards');
assert(new Set(twoCards).size === 52, 'dealt cards are unique');
for (const card of twoCards) {
  assert(deck.has(card), `dealt card ${card} belongs to the deck`);
}
const again = rummyRules.initialState([seat(0), seat(1)], table());
assert(
  JSON.stringify(again.hands) === JSON.stringify(two.hands),
  'the same table id deals the same hands',
);
assert(
  again.stock[0] === two.stock[0],
  'the same table id deals the same stock',
);

const six = rummyRules.initialState(
  [5, 1, 4, 0, 3, 2].map(seat),
  table('table-six'),
);
assert(Object.keys(six.hands).length === 6, 'a full table deals six hands');
assert(six.turnSeatIndex === 0, 'six seats still start at the lowest seat');
for (const hand of Object.values(six.hands)) {
  assert(hand.length === 6, 'five or six players are dealt 6 cards');
}
assert(zoneCards(six).length === 52, 'a six-seat deal uses 52 cards');
assert(six.stock.length === 15, 'six hands and one upcard leave 15 in stock');

const four = rummyRules.initialState(
  [0, 1, 2, 3].map(seat),
  table('table-four'),
);
assert(four.hands['0']?.length === 7, 'three or four players are dealt 7');

const top = two.stock[0];
assert(top !== undefined, 'the stock has a top card');
const drawn = rummyRules.applyIntent(
  two,
  { type: 'draw', source: 'stock' },
  context(0),
);
assert(drawn !== two, 'a legal draw returns a new state');
assert(drawn.drawn === true, 'a draw marks the turn as drawn');
assert(drawn.stock.length === two.stock.length - 1, 'the stock loses one card');
assert(drawn.stock[0] !== top, 'the next stock card is uncovered');
assert(drawn.hands['0']?.at(-1) === top, 'the drawn card enters the hand');
assert(drawn.turnSeatIndex === 0, 'a draw does not pass the turn');
assert(
  two.hands['0']?.includes(top) !== true,
  'a legal draw leaves the previous hand in place',
);

const fromPile = rummyRules.applyIntent(
  two,
  { type: 'draw', source: 'discard' },
  context(0),
);
assert(
  fromPile.hands['0']?.at(-1) === two.discardPile[0],
  'drawing the discard takes the upcard',
);
assert(fromPile.discardPile.length === 0, 'the discard pile gives up its top');
assert(fromPile.stock.length === two.stock.length, 'the stock stays put');

const before = JSON.stringify(two);
const handsBefore = two.hands;
const stockBefore = two.stock;
expectThrow(() => {
  rummyRules.applyIntent(two, { type: 'draw', source: 'stock' }, context(1));
}, 'Not your turn');
assert(JSON.stringify(two) === before, 'a rejected move does not change state');
assert(two.hands === handsBefore, 'a rejected move keeps the same hands');
assert(two.stock === stockBefore, 'a rejected move keeps the same stock');

expectThrow(() => {
  rummyRules.applyIntent(drawn, { type: 'draw', source: 'stock' }, context(0));
}, 'Invalid intent');
expectThrow(() => {
  rummyRules.applyIntent(
    playState({ stock: [], drawn: false }),
    { type: 'draw', source: 'stock' },
    context(0),
  );
}, 'Invalid intent');
expectThrow(() => {
  rummyRules.applyIntent(
    playState(),
    { type: 'meld', cards: ['AS', 'AH', 'AD'] },
    context(0),
  );
}, 'Invalid intent');
expectThrow(() => {
  rummyRules.applyIntent(
    two,
    { type: 'meld', cards: ['AS', 'AH', 'AD'] },
    context(0),
  );
}, 'Invalid intent');
expectThrow(() => {
  rummyRules.applyIntent(two, { type: 'discard', card: 'AS' }, context(0));
}, 'Invalid intent');

const held = playState();
const melded = rummyRules.applyIntent(
  held,
  { type: 'meld', cards: ['5H', '3H', '4H'] },
  context(0),
);
assert(melded.phase === 'play', 'a meld leaves the last card in play');
assert(melded.hands['0']?.join(' ') === 'KD', 'the meld leaves the hand');
assert(
  melded.melds[0]?.cards.join(' ') === '3H 4H 5H',
  'a run is stored in rank order',
);
assert(melded.melds[0]?.seat === 0, 'the meld records the seat');
assert(held.hands['0']?.length === 4, 'the previous hand stays intact');

const aces = playState({
  hands: { '0': ['AS', 'AH', 'AD', 'AC', 'KD'], '1': ['2C'] },
});
const set = rummyRules.applyIntent(
  aces,
  { type: 'meld', cards: ['AD', 'AS', 'AH', 'AC'] },
  context(0),
);
assert(set.melds[0]?.cards.length === 4, 'four of a kind is a meld');
assert(set.hands['0']?.join(' ') === 'KD', 'the set leaves the hand');

const high = playState({
  hands: { '0': ['AH', 'QH', 'KH', '2D'], '1': ['2C'] },
});
const queenHigh = rummyRules.applyIntent(
  high,
  { type: 'meld', cards: ['KH', 'AH', 'QH'] },
  context(0),
);
assert(
  queenHigh.melds[0]?.cards.join(' ') === 'QH KH AH',
  'Q-K-A is a high ace run',
);

const low = playState({
  hands: { '0': ['3S', 'AS', '2S', 'KD'], '1': ['2C'] },
});
const aceLow = rummyRules.applyIntent(
  low,
  { type: 'meld', cards: ['2S', 'AS', '3S'] },
  context(0),
);
assert(
  aceLow.melds[0]?.cards.join(' ') === 'AS 2S 3S',
  'A-2-3 is a low ace run',
);

const wrapped = playState({
  hands: { '0': ['KH', 'AH', '2H', 'KD'], '1': ['2C'] },
});
const wrappedBefore = JSON.stringify(wrapped);
expectThrow(() => {
  rummyRules.applyIntent(
    wrapped,
    { type: 'meld', cards: ['KH', 'AH', '2H'] },
    context(0),
  );
}, 'Invalid intent');
assert(
  JSON.stringify(wrapped) === wrappedBefore,
  'an illegal run does not change state',
);
expectThrow(() => {
  rummyRules.applyIntent(
    held,
    { type: 'meld', cards: ['3H', '4H', '9C'] },
    context(0),
  );
}, 'Invalid intent');
expectThrow(() => {
  rummyRules.applyIntent(
    held,
    { type: 'meld', cards: ['3H', '4H'] },
    context(0),
  );
}, 'Invalid intent');

expectThrow(() => {
  rummyRules.applyIntent(
    melded,
    { type: 'layoff', meldIndex: 0, cards: ['KD'] },
    context(0),
  );
}, 'Invalid intent');
const extended = playState({
  hands: { '0': ['4H', '8H', 'KD'], '1': ['2C'] },
  melds: [{ seat: 1, cards: ['5H', '6H', '7H'] }],
});
const layoff = rummyRules.applyIntent(
  extended,
  { type: 'layoff', meldIndex: 0, cards: ['8H', '4H'] },
  context(0),
);
assert(
  layoff.melds[0]?.cards.join(' ') === '4H 5H 6H 7H 8H',
  'a layoff extends the run',
);
assert(layoff.hands['0']?.join(' ') === 'KD', 'laid off cards leave the hand');
expectThrow(() => {
  rummyRules.applyIntent(
    extended,
    { type: 'layoff', meldIndex: 0, cards: ['KD'] },
    context(0),
  );
}, 'Invalid intent');

const passed = rummyRules.applyIntent(
  held,
  { type: 'discard', card: 'KD' },
  context(0),
);
assert(passed.phase === 'play', 'a discard with stock left stays in play');
assert(passed.drawn === false, 'the next turn has not drawn');
assert(passed.turnSeatIndex === 1, 'the next seated player acts');
assert(passed.discardPile.at(-1) === 'KD', 'the discard lands on the pile');
assert(
  passed.hands['0']?.includes('KD') !== true,
  'the discarded card is gone',
);

const opening: RummyState = {
  phase: 'play',
  hands: { '0': ['3H', '4H', '5H'], '1': ['AS', 'KH'] },
  stock: ['KD', 'QC'],
  discardPile: ['9C'],
  melds: [],
  turnSeatIndex: 0,
  drawn: false,
  scores: {},
  winnerSeatIndex: null,
};
const drew = rummyRules.applyIntent(
  opening,
  { type: 'draw', source: 'stock' },
  context(0),
);
const meldedOut = rummyRules.applyIntent(
  drew,
  { type: 'meld', cards: ['3H', '4H', '5H'] },
  context(0),
);
const finished = rummyRules.applyIntent(
  meldedOut,
  { type: 'discard', card: 'KD' },
  context(0),
);
assert(finished.phase === 'finished', 'discarding the last card finishes');
assert(finished.winnerSeatIndex === 0, 'the seat that emptied its hand wins');
assert(finished.hands['0']?.length === 0, 'the winner holds no cards');
assert(finished.scores['0'] === 0, 'the winner scores no deadwood');
assert(finished.scores['1'] === 11, 'the other hand scores its deadwood');
assert(
  finished.hands['1']?.join(' ') === 'AS KH',
  'the other seat keeps its cards',
);
expectThrow(() => {
  rummyRules.applyIntent(
    finished,
    { type: 'draw', source: 'stock' },
    context(0),
  );
}, 'Invalid intent');

const emptied = rummyRules.applyIntent(
  playState({
    hands: { '0': ['3H', '4H', '5H'], '1': ['KH'] },
  }),
  { type: 'meld', cards: ['3H', '4H', '5H'] },
  context(0),
);
assert(emptied.phase === 'finished', 'melding the whole hand goes out');
assert(emptied.winnerSeatIndex === 0, 'going out by melding wins');
assert(emptied.scores['1'] === 10, 'a lone king scores 10');

const stockOut = rummyRules.applyIntent(
  playState({
    hands: { '0': ['KH', 'KD'], '1': ['AC'] },
    stock: [],
  }),
  { type: 'discard', card: 'KD' },
  context(0),
);
assert(stockOut.phase === 'finished', 'an empty stock ends the hand');
assert(stockOut.winnerSeatIndex === 1, 'the lowest deadwood wins');
assert(stockOut.scores['0'] === 10, 'the leftover king scores 10');
assert(stockOut.scores['1'] === 1, 'the ace scores 1');

const tied = rummyRules.applyIntent(
  playState({
    hands: { '0': ['AS', 'KD'], '1': ['AC'] },
    stock: [],
  }),
  { type: 'discard', card: 'KD' },
  context(0),
);
assert(tied.winnerSeatIndex === 0, 'a deadwood tie goes to the lowest seat');

const drawNote = rummyRules.eventNote(
  two,
  { type: 'draw', source: 'stock' },
  drawn,
  context(0),
);
assert(
  readRummyEventNote(drawNote)?.kind === 'draw',
  'a draw stores a draw note',
);
const outNote = rummyRules.eventNote(
  meldedOut,
  { type: 'discard', card: 'KD' },
  finished,
  context(0),
);
const parsedOut = readRummyEventNote(outNote);
assert(parsedOut?.kind === 'discard', 'going out stores a discard note');
assert(
  parsedOut?.kind === 'discard' && parsedOut.out,
  'the note says they went out',
);

const resumed = JSON.parse(JSON.stringify(two)) as unknown;
const resumedDraw = rummyRules.applyIntent(
  resumed as RummyState,
  { type: 'draw', source: 'discard' },
  context(0),
);
assert(resumedDraw.drawn === true, 'a stored state can still draw');

const left = rummyRules.onPlayerLeave(two, seat(1));
assert(left.phase === 'finished', 'one remaining seat finishes the hand');
assert(left.winnerSeatIndex === 0, 'the last seated player wins');
assert(left.hands['1'] === undefined, 'the leaver takes their hand');

console.log(
  JSON.stringify({
    gameType: rummyGameDefinition.gameType,
    emptyPhase: empty.phase,
    dealtCount: twoCards.length,
    turnSeatIndex: two.turnSeatIndex,
    stock: two.stock.length,
    finished: finished.phase,
    winnerSeatIndex: finished.winnerSeatIndex,
    winnerScore: finished.scores['0'],
  }),
);
