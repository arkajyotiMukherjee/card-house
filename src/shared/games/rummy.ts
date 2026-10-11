import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for basic Rummy. */
export const RUMMY_GAME_TYPE = 'rummy' as const;

export const RUMMY_RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

export const RUMMY_SUITS = ['S', 'H', 'D', 'C'] as const;

const RUMMY_PHASES = ['lobby', 'play', 'finished'] as const;

const RANK_SET: ReadonlySet<string> = new Set(RUMMY_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(RUMMY_SUITS);

export type RummyRank = (typeof RUMMY_RANKS)[number];
export type RummySuit = (typeof RUMMY_SUITS)[number];
export type RummyPhase = (typeof RUMMY_PHASES)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type RummyCardId = `${RummyRank}${RummySuit}`;

export interface RummyMeld {
  seat: number;
  cards: string[];
}

export interface RummyState {
  phase: RummyPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** Face-down stock. Index 0 is the top card. */
  stock: string[];
  /** Face-up discard. The last card is the upcard. */
  discardPile: string[];
  melds: RummyMeld[];
  turnSeatIndex: number | null;
  /** True after this turn's draw and before the discard. */
  drawn: boolean;
  /** Deadwood points written when the hand finishes. */
  scores: Record<string, number>;
  winnerSeatIndex: number | null;
}

export type RummyIntent =
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'meld'; cards: string[] }
  | { type: 'layoff'; meldIndex: number; cards: string[] }
  | { type: 'discard'; card: string };

export type RummyEventNote =
  | { kind: 'draw'; seat: number; source: 'stock' | 'discard' }
  | { kind: 'meld'; seat: number; count: number; out: boolean }
  | { kind: 'layoff'; seat: number; count: number; out: boolean }
  | {
      kind: 'discard';
      seat: number;
      out: boolean;
      ended: boolean;
      winnerSeatIndex: number | null;
    };

export const rummyGameDefinition = {
  gameType: RUMMY_GAME_TYPE,
  displayName: 'Rummy',
  minPlayers: 2,
  maxPlayers: 6,
  howToPlay:
    '# Rummy\n\nDraw one card from the stock or the discard pile. Meld a set of three or four of a kind, or a run of three or more in one suit. Ace is low in A-2-3 and high in Q-K-A. Lay extra cards onto a meld. Discard one card. Empty your hand to win. If the stock is empty after a discard, the lowest deadwood wins. Ace scores 1, face cards score 10, and other ranks score their number.',
} satisfies GameDefinition;

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function isSeatIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isRank(value: unknown): value is RummyRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is RummyPhase {
  return (
    typeof value === 'string' &&
    (RUMMY_PHASES as readonly string[]).includes(value)
  );
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfCard(card: string): RummyRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

function readMelds(value: unknown): RummyMeld[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const melds: RummyMeld[] = [];
  for (const item of value) {
    const record = asRecord(item, 'Invalid table state');
    if (!isSeatIndex(record.seat) || !isStringArray(record.cards)) {
      throw new Error('Invalid table state');
    }
    melds.push({ seat: record.seat, cards: record.cards.slice() });
  }
  return melds;
}

function readScores(value: unknown): Record<string, number> {
  const record = asRecord(value, 'Invalid table state');
  const scores: Record<string, number> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    const points = record[key];
    if (typeof points !== 'number' || !Number.isSafeInteger(points)) {
      throw new Error('Invalid table state');
    }
    scores[key] = points;
  }
  return scores;
}

export function readRummyState(value: unknown): RummyState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase)) {
    throw new Error('Invalid table state');
  }
  if (!isStringArray(record.stock) || !isStringArray(record.discardPile)) {
    throw new Error('Invalid table state');
  }
  if (!(record.turnSeatIndex === null || isSeatIndex(record.turnSeatIndex))) {
    throw new Error('Invalid table state');
  }
  if (typeof record.drawn !== 'boolean') {
    throw new Error('Invalid table state');
  }
  if (!(
    record.winnerSeatIndex === null || isSeatIndex(record.winnerSeatIndex)
  )) {
    throw new Error('Invalid table state');
  }
  const handsRecord = asRecord(record.hands, 'Invalid table state');
  const hands: Record<string, string[]> = {};
  for (const key of Object.keys(handsRecord)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    const hand = handsRecord[key];
    if (!isStringArray(hand)) {
      throw new Error('Invalid table state');
    }
    hands[key] = hand.slice();
  }
  return {
    phase: record.phase,
    hands,
    stock: record.stock.slice(),
    discardPile: record.discardPile.slice(),
    melds: readMelds(record.melds),
    turnSeatIndex: record.turnSeatIndex,
    drawn: record.drawn,
    scores: readScores(record.scores),
    winnerSeatIndex: record.winnerSeatIndex,
  };
}

function readCards(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid intent');
  }
  const cards: string[] = [];
  for (const card of value) {
    if (typeof card !== 'string') {
      throw new Error('Invalid intent');
    }
    cards.push(card);
  }
  return cards;
}

export function readRummyIntent(value: unknown): RummyIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'draw') {
    if (record.source !== 'stock' && record.source !== 'discard') {
      throw new Error('Invalid intent');
    }
    return { type: 'draw', source: record.source };
  }
  if (record.type === 'meld') {
    return { type: 'meld', cards: readCards(record.cards) };
  }
  if (record.type === 'layoff') {
    if (!isSeatIndex(record.meldIndex) || record.meldIndex < 0) {
      throw new Error('Invalid intent');
    }
    return {
      type: 'layoff',
      meldIndex: record.meldIndex,
      cards: readCards(record.cards),
    };
  }
  if (record.type === 'discard') {
    if (typeof record.card !== 'string') {
      throw new Error('Invalid intent');
    }
    return { type: 'discard', card: record.card };
  }
  throw new Error('Invalid intent');
}

export function readRummyEventNote(value: unknown): RummyEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (note.kind === 'draw' && isSeatIndex(note.seat)) {
    if (note.source !== 'stock' && note.source !== 'discard') {
      return null;
    }
    return { kind: 'draw', seat: note.seat, source: note.source };
  }
  if (
    (note.kind === 'meld' || note.kind === 'layoff') &&
    isSeatIndex(note.seat) &&
    isSeatIndex(note.count) &&
    typeof note.out === 'boolean'
  ) {
    return {
      kind: note.kind,
      seat: note.seat,
      count: note.count,
      out: note.out,
    };
  }
  if (
    note.kind === 'discard' &&
    isSeatIndex(note.seat) &&
    typeof note.out === 'boolean' &&
    typeof note.ended === 'boolean' &&
    (note.winnerSeatIndex === null || isSeatIndex(note.winnerSeatIndex))
  ) {
    return {
      kind: 'discard',
      seat: note.seat,
      out: note.out,
      ended: note.ended,
      winnerSeatIndex: note.winnerSeatIndex,
    };
  }
  return null;
}

function notStartedState(): RummyState {
  return {
    phase: 'lobby',
    hands: {},
    stock: [],
    discardPile: [],
    melds: [],
    turnSeatIndex: null,
    drawn: false,
    scores: {},
    winnerSeatIndex: null,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of RUMMY_SUITS) {
    for (const rank of RUMMY_RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** FNV-1a so a table id always deals the same deck. */
function seedFromTableId(tableId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < tableId.length; i += 1) {
    hash ^= tableId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeck(deck: string[], tableId: string): string[] {
  const random = mulberry32(seedFromTableId(tableId));
  const cards = deck.slice();
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = cards[i];
    cards[i] = cards[j];
    cards[j] = current;
  }
  return cards;
}

function seatsInOrder(players: GameSeat[]): GameSeat[] {
  const ordered: GameSeat[] = [];
  const seen = new Set<number>();
  const sorted = players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
  for (const seat of sorted) {
    if (seen.has(seat.seatIndex)) {
      continue;
    }
    seen.add(seat.seatIndex);
    ordered.push(seat);
  }
  return ordered;
}

function cardsPerHand(playerCount: number): number {
  if (playerCount <= 2) {
    return 10;
  }
  if (playerCount <= 4) {
    return 7;
  }
  return 6;
}

function seatedIndexes(hands: Record<string, string[]>): number[] {
  const seats: number[] = [];
  for (const key of Object.keys(hands)) {
    seats.push(Number(key));
  }
  seats.sort((a, b) => a - b);
  return seats;
}

function nextSeat(
  hands: Record<string, string[]>,
  after: number,
): number | null {
  const seats = seatedIndexes(hands);
  if (seats.length === 0) {
    return null;
  }
  for (const seat of seats) {
    if (seat > after) {
      return seat;
    }
  }
  return seats[0];
}

function dealState(players: GameSeat[], tableId: string): RummyState {
  const ordered = seatsInOrder(players);
  if (ordered.length === 0) {
    return notStartedState();
  }
  const perHand = cardsPerHand(ordered.length);
  const deck = shuffleDeck(freshDeck(), tableId);
  const needed = perHand * ordered.length + 1;
  if (needed > deck.length) {
    throw new Error('Invalid table state');
  }
  const hands: Record<string, string[]> = {};
  for (const seat of ordered) {
    hands[handKey(seat.seatIndex)] = [];
  }
  let cursor = 0;
  for (let round = 0; round < perHand; round += 1) {
    for (const seat of ordered) {
      const card = deck[cursor];
      if (!card) {
        throw new Error('Invalid table state');
      }
      hands[handKey(seat.seatIndex)].push(card);
      cursor += 1;
    }
  }
  const upcard = deck[cursor];
  if (!upcard) {
    throw new Error('Invalid table state');
  }
  return {
    phase: 'play',
    hands,
    stock: deck.slice(cursor + 1),
    discardPile: [upcard],
    melds: [],
    turnSeatIndex: ordered[0].seatIndex,
    drawn: false,
    scores: {},
    winnerSeatIndex: null,
  };
}

function rankIndex(rank: RummyRank): number {
  return RUMMY_RANKS.indexOf(rank);
}

function isConsecutive(indexes: readonly number[]): boolean {
  const sorted = indexes.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

function parsedCards(
  cards: readonly string[],
): { rank: RummyRank; suit: string; index: number }[] | null {
  const parsed: { rank: RummyRank; suit: string; index: number }[] = [];
  for (const card of cards) {
    const rank = rankOfCard(card);
    const suit = card.slice(-1);
    if (!rank || !SUIT_SET.has(suit)) {
      return null;
    }
    parsed.push({ rank, suit, index: rankIndex(rank) });
  }
  return parsed;
}

/** Three or four cards of one rank, each a different suit. */
function isSet(cards: readonly string[]): boolean {
  if (cards.length < 3 || cards.length > 4) {
    return false;
  }
  const parsed = parsedCards(cards);
  if (!parsed) {
    return false;
  }
  const rank = parsed[0]?.rank;
  const suits = new Set<string>();
  for (const card of parsed) {
    if (card.rank !== rank) {
      return false;
    }
    suits.add(card.suit);
  }
  return suits.size === cards.length;
}

/**
 * Three or more cards in one suit.
 * Ace is low in A-2-3 and high in Q-K-A. K-A-2 does not wrap.
 */
function isRun(cards: readonly string[]): boolean {
  if (cards.length < 3) {
    return false;
  }
  const parsed = parsedCards(cards);
  if (!parsed) {
    return false;
  }
  const suit = parsed[0]?.suit;
  const indexes: number[] = [];
  for (const card of parsed) {
    if (card.suit !== suit) {
      return false;
    }
    indexes.push(card.index);
  }
  if (isConsecutive(indexes)) {
    return true;
  }
  if (!indexes.includes(0)) {
    return false;
  }
  return isConsecutive(indexes.map((index) => (index === 0 ? 13 : index)));
}

function isMeld(cards: readonly string[]): boolean {
  return isSet(cards) || isRun(cards);
}

function sortMeld(cards: readonly string[]): string[] {
  if (isSet(cards)) {
    return cards.slice();
  }
  const items = cards.map((card) => {
    const rank = rankOfCard(card);
    return { card, index: rank ? rankIndex(rank) : 0 };
  });
  const indexes = items.map((item) => item.index);
  const aceHigh = indexes.includes(0) && !isConsecutive(indexes);
  items.sort((a, b) => {
    const left = aceHigh && a.index === 0 ? 13 : a.index;
    const right = aceHigh && b.index === 0 ? 13 : b.index;
    return left - right;
  });
  return items.map((item) => item.card);
}

/** Ace is 1, face cards are 10, and pip cards are their rank. */
export function cardPoints(card: string): number {
  const rank = rankOfCard(card);
  if (rank === null) {
    return 0;
  }
  if (rank === 'A') {
    return 1;
  }
  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return 10;
  }
  return Number(rank);
}

export function deadwoodPoints(cards: readonly string[]): number {
  let total = 0;
  for (const card of cards) {
    total += cardPoints(card);
  }
  return total;
}

function scoreMap(hands: Record<string, string[]>): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const seat of seatedIndexes(hands)) {
    scores[handKey(seat)] = deadwoodPoints(hands[handKey(seat)] ?? []);
  }
  return scores;
}

function winnerByDeadwood(hands: Record<string, string[]>): number | null {
  let winner: number | null = null;
  let best = 0;
  for (const seat of seatedIndexes(hands)) {
    const score = deadwoodPoints(hands[handKey(seat)] ?? []);
    if (winner === null || score < best) {
      winner = seat;
      best = score;
    }
  }
  return winner;
}

function copyMelds(melds: readonly RummyMeld[]): RummyMeld[] {
  const copy: RummyMeld[] = [];
  for (const meld of melds) {
    copy.push({ seat: meld.seat, cards: meld.cards.slice() });
  }
  return copy;
}

function takeCards(
  hand: readonly string[],
  cards: readonly string[],
): string[] {
  const seen = new Set<string>();
  const remaining = hand.slice();
  for (const card of cards) {
    if (seen.has(card)) {
      throw new Error('Invalid intent');
    }
    seen.add(card);
    const index = remaining.indexOf(card);
    if (index < 0) {
      throw new Error('Invalid intent');
    }
    remaining.splice(index, 1);
  }
  return remaining;
}

function requirePlay(state: RummyState): void {
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
}

function handOf(state: RummyState, seatIndex: number): string[] {
  const hand = state.hands[handKey(seatIndex)];
  if (!hand) {
    throw new Error('Invalid intent');
  }
  return hand;
}

function finish(
  state: RummyState,
  hands: Record<string, string[]>,
  melds: RummyMeld[],
  stock: string[],
  discardPile: string[],
  winnerSeatIndex: number | null,
): RummyState {
  return {
    phase: 'finished',
    hands,
    stock,
    discardPile,
    melds,
    turnSeatIndex: state.turnSeatIndex,
    drawn: state.drawn,
    scores: scoreMap(hands),
    winnerSeatIndex,
  };
}

function playing(
  hands: Record<string, string[]>,
  melds: RummyMeld[],
  stock: string[],
  discardPile: string[],
  turnSeatIndex: number | null,
  drawn: boolean,
): RummyState {
  return {
    phase: 'play',
    hands,
    stock,
    discardPile,
    melds,
    turnSeatIndex,
    drawn,
    scores: {},
    winnerSeatIndex: null,
  };
}

function applyDraw(
  state: RummyState,
  source: 'stock' | 'discard',
  seatIndex: number,
): RummyState {
  requirePlay(state);
  if (state.drawn) {
    throw new Error('Invalid intent');
  }
  const hand = handOf(state, seatIndex);
  const stock = state.stock.slice();
  const discardPile = state.discardPile.slice();
  let card: string | undefined;
  if (source === 'stock') {
    card = stock.shift();
  } else {
    card = discardPile.pop();
  }
  if (!card) {
    throw new Error('Invalid intent');
  }
  return playing(
    { ...state.hands, [handKey(seatIndex)]: hand.concat(card) },
    copyMelds(state.melds),
    stock,
    discardPile,
    state.turnSeatIndex,
    true,
  );
}

function applyMeld(
  state: RummyState,
  cards: string[],
  seatIndex: number,
): RummyState {
  requirePlay(state);
  if (!state.drawn || !isMeld(cards)) {
    throw new Error('Invalid intent');
  }
  const remaining = takeCards(handOf(state, seatIndex), cards);
  const hands = { ...state.hands, [handKey(seatIndex)]: remaining };
  const melds = copyMelds(state.melds);
  melds.push({ seat: seatIndex, cards: sortMeld(cards) });
  if (remaining.length === 0) {
    return finish(
      state,
      hands,
      melds,
      state.stock.slice(),
      state.discardPile.slice(),
      seatIndex,
    );
  }
  return playing(
    hands,
    melds,
    state.stock.slice(),
    state.discardPile.slice(),
    state.turnSeatIndex,
    true,
  );
}

function applyLayoff(
  state: RummyState,
  meldIndex: number,
  cards: string[],
  seatIndex: number,
): RummyState {
  requirePlay(state);
  if (!state.drawn || cards.length === 0) {
    throw new Error('Invalid intent');
  }
  const meld = state.melds[meldIndex];
  if (!meld) {
    throw new Error('Invalid intent');
  }
  const beforeKind = isSet(meld.cards)
    ? 'set'
    : isRun(meld.cards)
      ? 'run'
      : null;
  const combined = meld.cards.concat(cards);
  const afterKind = isSet(combined) ? 'set' : isRun(combined) ? 'run' : null;
  if (beforeKind === null || afterKind !== beforeKind) {
    throw new Error('Invalid intent');
  }
  const remaining = takeCards(handOf(state, seatIndex), cards);
  const hands = { ...state.hands, [handKey(seatIndex)]: remaining };
  const melds = copyMelds(state.melds);
  const next = melds[meldIndex];
  if (!next) {
    throw new Error('Invalid intent');
  }
  next.cards = sortMeld(combined);
  if (remaining.length === 0) {
    return finish(
      state,
      hands,
      melds,
      state.stock.slice(),
      state.discardPile.slice(),
      seatIndex,
    );
  }
  return playing(
    hands,
    melds,
    state.stock.slice(),
    state.discardPile.slice(),
    state.turnSeatIndex,
    true,
  );
}

function applyDiscard(
  state: RummyState,
  card: string,
  seatIndex: number,
): RummyState {
  requirePlay(state);
  if (!state.drawn) {
    throw new Error('Invalid intent');
  }
  const remaining = takeCards(handOf(state, seatIndex), [card]);
  const hands = { ...state.hands, [handKey(seatIndex)]: remaining };
  const discardPile = state.discardPile.concat(card);
  const stock = state.stock.slice();
  const melds = copyMelds(state.melds);
  if (remaining.length === 0) {
    return finish(state, hands, melds, stock, discardPile, seatIndex);
  }
  if (stock.length === 0) {
    return finish(
      state,
      hands,
      melds,
      stock,
      discardPile,
      winnerByDeadwood(hands),
    );
  }
  return playing(
    hands,
    melds,
    stock,
    discardPile,
    nextSeat(hands, seatIndex),
    false,
  );
}

function leaveSeat(state: RummyState, seatIndex: number): RummyState {
  const key = handKey(seatIndex);
  if (!(key in state.hands)) {
    return readRummyState(state);
  }
  const hands: Record<string, string[]> = { ...state.hands };
  delete hands[key];
  if (state.phase !== 'play') {
    return {
      phase: state.phase,
      hands,
      stock: state.stock.slice(),
      discardPile: state.discardPile.slice(),
      melds: copyMelds(state.melds),
      turnSeatIndex: state.turnSeatIndex,
      drawn: state.drawn,
      scores: { ...state.scores },
      winnerSeatIndex: state.winnerSeatIndex,
    };
  }
  let turnSeatIndex = state.turnSeatIndex;
  let drawn = state.drawn;
  if (turnSeatIndex === seatIndex) {
    turnSeatIndex = nextSeat(hands, seatIndex);
    drawn = false;
  }
  const base: RummyState = {
    phase: 'play',
    hands,
    stock: state.stock.slice(),
    discardPile: state.discardPile.slice(),
    melds: copyMelds(state.melds),
    turnSeatIndex,
    drawn,
    scores: {},
    winnerSeatIndex: null,
  };
  if (seatedIndexes(hands).length <= 1) {
    return finish(
      base,
      hands,
      base.melds,
      base.stock,
      base.discardPile,
      seatedIndexes(hands)[0] ?? null,
    );
  }
  return base;
}

function noteFor(
  action: RummyIntent,
  next: RummyState,
  seatIndex: number,
): RummyEventNote {
  const wentOut =
    next.phase === 'finished' &&
    next.winnerSeatIndex === seatIndex &&
    (next.hands[handKey(seatIndex)] ?? []).length === 0;
  if (action.type === 'draw') {
    return { kind: 'draw', seat: seatIndex, source: action.source };
  }
  if (action.type === 'meld') {
    return {
      kind: 'meld',
      seat: seatIndex,
      count: action.cards.length,
      out: wentOut,
    };
  }
  if (action.type === 'layoff') {
    return {
      kind: 'layoff',
      seat: seatIndex,
      count: action.cards.length,
      out: wentOut,
    };
  }
  return {
    kind: 'discard',
    seat: seatIndex,
    out: wentOut,
    ended: next.phase === 'finished' && !wentOut,
    winnerSeatIndex: next.phase === 'finished' ? next.winnerSeatIndex : null,
  };
}

/**
 * Rummy rules for gameType `rummy`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 */
export const rummyRules = {
  initialState(players: GameSeat[], table: GameTable): RummyState {
    if (players.length === 0) {
      return notStartedState();
    }
    return dealState(players, table.id);
  },
  applyIntent(
    prev: RummyState,
    intent: RummyIntent,
    ctx: IntentContext,
  ): RummyState {
    const state = readRummyState(prev);
    const action = readRummyIntent(intent);
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'draw') {
      return applyDraw(state, action.source, ctx.seat.seatIndex);
    }
    if (action.type === 'meld') {
      return applyMeld(state, action.cards, ctx.seat.seatIndex);
    }
    if (action.type === 'layoff') {
      return applyLayoff(
        state,
        action.meldIndex,
        action.cards,
        ctx.seat.seatIndex,
      );
    }
    return applyDiscard(state, action.card, ctx.seat.seatIndex);
  },
  eventNote(
    prev: RummyState,
    intent: RummyIntent,
    next: RummyState,
    ctx: IntentContext,
  ): RummyEventNote | null {
    void prev;
    const action = readRummyIntent(intent);
    const after = readRummyState(next);
    return noteFor(action, after, ctx.seat.seatIndex);
  },
  onPlayerJoin(prev: RummyState, seat: GameSeat): RummyState {
    void seat;
    return readRummyState(prev);
  },
  onPlayerLeave(prev: RummyState, seat: GameSeat): RummyState {
    return leaveSeat(readRummyState(prev), seat.seatIndex);
  },
} satisfies GameRules<RummyState, RummyIntent>;
