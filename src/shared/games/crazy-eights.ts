import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Crazy Eights. */
export const CRAZY_EIGHTS_GAME_TYPE = 'crazy_eights' as const;

export const CRAZY_EIGHTS_RANKS = [
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

export const CRAZY_EIGHTS_SUITS = ['S', 'H', 'D', 'C'] as const;

export const CRAZY_EIGHTS_SUIT_NAMES = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
} as const;

const CRAZY_EIGHTS_PHASES = ['lobby', 'play', 'finished'] as const;

const RANK_SET: ReadonlySet<string> = new Set(CRAZY_EIGHTS_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(CRAZY_EIGHTS_SUITS);

export type CrazyEightsRank = (typeof CRAZY_EIGHTS_RANKS)[number];
export type CrazyEightsSuit = (typeof CRAZY_EIGHTS_SUITS)[number];
export type CrazyEightsPhase = (typeof CRAZY_EIGHTS_PHASES)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type CrazyEightsCardId = `${CrazyEightsRank}${CrazyEightsSuit}`;

export interface CrazyEightsState {
  phase: CrazyEightsPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** Face-down cards. The last entry is the next draw. */
  stock: string[];
  /** Face-up pile. The last entry is the top. */
  discardPile: string[];
  /**
   * Suit the next card must match.
   * Null when the starter is an eight and nobody has named a suit yet.
   */
  currentSuit: CrazyEightsSuit | null;
  turnSeatIndex: number | null;
  winnerSeatIndex: number | null;
  /** Points awarded at the end. Only the winner is non-zero. */
  scores: Record<string, number>;
  /** Passes in a row while nothing can be drawn. */
  passes: number;
}

export type CrazyEightsIntent =
  | { type: 'play'; card: string; suit?: CrazyEightsSuit }
  | { type: 'draw' }
  | { type: 'pass' };

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type CrazyEightsEventNote =
  | { kind: 'play'; seat: number; card: string; suit: CrazyEightsSuit }
  | { kind: 'draw'; seat: number }
  | { kind: 'pass'; seat: number }
  | { kind: 'finish'; seat: number; score: number };

export const crazyEightsGameDefinition = {
  gameType: CRAZY_EIGHTS_GAME_TYPE,
  displayName: 'Crazy Eights',
  minPlayers: 2,
  maxPlayers: 7,
  howToPlay:
    '# Crazy Eights\n\nTwo players are dealt seven cards. Three or more are dealt five. Match the suit or the rank of the face-up discard, or play an eight and name the next suit. Draw one card when you have no match. If the stock is empty, the buried discards are shuffled back in. When nothing is left to draw, pass. The first player to empty a hand wins the points left in the other hands. An eight is 50, a face card is 10, an ace is 1, and every other card is its number. If nobody can play, the lowest hand wins those points.',
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

function isRank(value: unknown): value is CrazyEightsRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

export function isCrazyEightsSuit(value: unknown): value is CrazyEightsSuit {
  return typeof value === 'string' && SUIT_SET.has(value);
}

function isPhase(value: unknown): value is CrazyEightsPhase {
  return (
    typeof value === 'string' &&
    (CRAZY_EIGHTS_PHASES as readonly string[]).includes(value)
  );
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfCard(card: string): CrazyEightsRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

/** Suit letter encoded at the end of a card id. */
export function suitOfCard(card: string): CrazyEightsSuit | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!isCrazyEightsSuit(suit) || !isRank(rank)) {
    return null;
  }
  return suit;
}

/**
 * Points left in a hand.
 * An eight is 50, a face card is 10, an ace is 1, and every other card is its number.
 */
export function cardPoints(card: string): number {
  const rank = rankOfCard(card);
  if (rank === '8') {
    return 50;
  }
  if (rank === 'K' || rank === 'Q' || rank === 'J') {
    return 10;
  }
  if (rank === 'A') {
    return 1;
  }
  if (rank === '10') {
    return 10;
  }
  if (rank === null) {
    return 0;
  }
  const value = Number(rank);
  return Number.isSafeInteger(value) ? value : 0;
}

export function handPoints(cards: readonly string[]): number {
  let total = 0;
  for (const card of cards) {
    total += cardPoints(card);
  }
  return total;
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

function readHands(value: unknown): Record<string, string[]> {
  const handsRecord = asRecord(value, 'Invalid table state');
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
  return hands;
}

export function readCrazyEightsState(value: unknown): CrazyEightsState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase)) {
    throw new Error('Invalid table state');
  }
  if (!isStringArray(record.stock) || !isStringArray(record.discardPile)) {
    throw new Error('Invalid table state');
  }
  if (!(record.currentSuit === null || isCrazyEightsSuit(record.currentSuit))) {
    throw new Error('Invalid table state');
  }
  if (!(record.turnSeatIndex === null || isSeatIndex(record.turnSeatIndex))) {
    throw new Error('Invalid table state');
  }
  if (!(
    record.winnerSeatIndex === null || isSeatIndex(record.winnerSeatIndex)
  )) {
    throw new Error('Invalid table state');
  }
  if (
    typeof record.passes !== 'number' ||
    !Number.isSafeInteger(record.passes) ||
    record.passes < 0
  ) {
    throw new Error('Invalid table state');
  }
  return {
    phase: record.phase,
    hands: readHands(record.hands),
    stock: record.stock.slice(),
    discardPile: record.discardPile.slice(),
    currentSuit: record.currentSuit,
    turnSeatIndex: record.turnSeatIndex,
    winnerSeatIndex: record.winnerSeatIndex,
    scores: readScores(record.scores),
    passes: record.passes,
  };
}

export function readCrazyEightsIntent(value: unknown): CrazyEightsIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'draw') {
    return { type: 'draw' };
  }
  if (record.type === 'pass') {
    return { type: 'pass' };
  }
  if (record.type !== 'play' || typeof record.card !== 'string') {
    throw new Error('Invalid intent');
  }
  if (record.suit === undefined) {
    return { type: 'play', card: record.card };
  }
  if (!isCrazyEightsSuit(record.suit)) {
    throw new Error('Invalid intent');
  }
  return { type: 'play', card: record.card, suit: record.suit };
}

export function readCrazyEightsEventNote(
  value: unknown,
): CrazyEightsEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (
    note.kind === 'play' &&
    isSeatIndex(note.seat) &&
    typeof note.card === 'string' &&
    isCrazyEightsSuit(note.suit)
  ) {
    return {
      kind: 'play',
      seat: note.seat,
      card: note.card,
      suit: note.suit,
    };
  }
  if (note.kind === 'draw' && isSeatIndex(note.seat)) {
    return { kind: 'draw', seat: note.seat };
  }
  if (note.kind === 'pass' && isSeatIndex(note.seat)) {
    return { kind: 'pass', seat: note.seat };
  }
  if (
    note.kind === 'finish' &&
    isSeatIndex(note.seat) &&
    isSeatIndex(note.score)
  ) {
    return { kind: 'finish', seat: note.seat, score: note.score };
  }
  return null;
}

function notStartedState(): CrazyEightsState {
  return {
    phase: 'lobby',
    hands: {},
    stock: [],
    discardPile: [],
    currentSuit: null,
    turnSeatIndex: null,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of CRAZY_EIGHTS_SUITS) {
    for (const rank of CRAZY_EIGHTS_RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** FNV-1a so a table id always deals the same deck. */
function seedFromText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
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

function shuffleDeck(deck: string[], seedText: string): string[] {
  const random = mulberry32(seedFromText(seedText));
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

/** Two players take seven cards. Three or more take five. */
function cardsPerHand(playerCount: number): number {
  return playerCount <= 2 ? 7 : 5;
}

function dealState(players: GameSeat[], tableId: string): CrazyEightsState {
  const ordered = seatsInOrder(players);
  if (ordered.length === 0) {
    return notStartedState();
  }
  const deck = shuffleDeck(freshDeck(), tableId);
  const hands: Record<string, string[]> = {};
  for (const seat of ordered) {
    hands[handKey(seat.seatIndex)] = [];
  }
  const perHand = cardsPerHand(ordered.length);
  let cursor = 0;
  for (let round = 0; round < perHand; round += 1) {
    for (const seat of ordered) {
      const card = deck[cursor];
      cursor += 1;
      if (!card) {
        throw new Error('Invalid table state');
      }
      hands[handKey(seat.seatIndex)].push(card);
    }
  }
  const stock = deck.slice(cursor);
  const starter = stock.pop();
  if (!starter) {
    throw new Error('Invalid table state');
  }
  const starterRank = rankOfCard(starter);
  const starterSuit = suitOfCard(starter);
  return {
    phase: 'play',
    hands,
    stock,
    discardPile: [starter],
    currentSuit: starterRank === '8' ? null : starterSuit,
    turnSeatIndex: ordered[0].seatIndex,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
  };
}

/** An eight is always playable. Otherwise match the suit in play or the top rank. */
export function cardIsPlayable(state: CrazyEightsState, card: string): boolean {
  const rank = rankOfCard(card);
  if (rank === null || suitOfCard(card) === null) {
    return false;
  }
  if (rank === '8') {
    return true;
  }
  if (state.currentSuit === null) {
    return true;
  }
  const top = state.discardPile.at(-1);
  if (!top) {
    return true;
  }
  return suitOfCard(card) === state.currentSuit || rankOfCard(top) === rank;
}

function handHasPlay(state: CrazyEightsState, seatIndex: number): boolean {
  const hand = state.hands[handKey(seatIndex)] ?? [];
  for (const card of hand) {
    if (cardIsPlayable(state, card)) {
      return true;
    }
  }
  return false;
}

/**
 * True when this seat cannot play and the stock cannot be rebuilt.
 * A pass is the only legal move then.
 */
export function seatMustPass(
  state: CrazyEightsState,
  seatIndex: number,
): boolean {
  if (state.phase !== 'play') {
    return false;
  }
  if (handHasPlay(state, seatIndex)) {
    return false;
  }
  return state.stock.length === 0 && state.discardPile.length <= 1;
}

function copyState(state: CrazyEightsState): CrazyEightsState {
  return readCrazyEightsState(state);
}

/**
 * The winner scores the points still held by the other seats.
 * A blocked hand gives that total to the lowest hand. Ties keep the lower seat.
 */
function award(state: CrazyEightsState, winner: number): CrazyEightsState {
  const scores: Record<string, number> = {};
  let total = 0;
  for (const seat of seatedIndexes(state.hands)) {
    const points = handPoints(state.hands[handKey(seat)] ?? []);
    scores[handKey(seat)] = 0;
    if (seat !== winner) {
      total += points;
    }
  }
  scores[handKey(winner)] = total;
  return {
    phase: 'finished',
    hands: state.hands,
    stock: state.stock.slice(),
    discardPile: state.discardPile.slice(),
    currentSuit: state.currentSuit,
    turnSeatIndex: null,
    winnerSeatIndex: winner,
    scores,
    passes: 0,
  };
}

function finishByLowest(state: CrazyEightsState): CrazyEightsState {
  const seats = seatedIndexes(state.hands);
  const first = seats[0];
  if (first === undefined) {
    return {
      ...copyState(state),
      phase: 'finished',
      turnSeatIndex: null,
      winnerSeatIndex: null,
      passes: 0,
    };
  }
  let winner = first;
  let best = handPoints(state.hands[handKey(first)] ?? []);
  for (let index = 1; index < seats.length; index += 1) {
    const seat = seats[index];
    if (seat === undefined) {
      continue;
    }
    const points = handPoints(state.hands[handKey(seat)] ?? []);
    if (points < best) {
      best = points;
      winner = seat;
    }
  }
  return award(state, winner);
}

function applyPlay(
  state: CrazyEightsState,
  card: string,
  suit: CrazyEightsSuit | undefined,
  seatIndex: number,
): CrazyEightsState {
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  const rank = rankOfCard(card);
  const playedSuit = suitOfCard(card);
  if (rank === null || playedSuit === null) {
    throw new Error('Invalid intent');
  }
  const key = handKey(seatIndex);
  const hand = state.hands[key];
  if (!hand || !hand.includes(card)) {
    throw new Error('Invalid intent');
  }
  const eight = rank === '8';
  if (!eight && suit) {
    throw new Error('Invalid intent');
  }
  if (!cardIsPlayable(state, card)) {
    throw new Error('Invalid intent');
  }
  const remaining = hand.slice();
  remaining.splice(remaining.indexOf(card), 1);
  const hands = { ...state.hands, [key]: remaining };
  let nextSuit: CrazyEightsSuit;
  if (eight) {
    if (!suit) {
      throw new Error('Invalid intent');
    }
    nextSuit = suit;
  } else {
    nextSuit = playedSuit;
  }
  const next: CrazyEightsState = {
    phase: 'play',
    hands,
    stock: state.stock.slice(),
    discardPile: state.discardPile.concat(card),
    currentSuit: nextSuit,
    turnSeatIndex: nextSeat(hands, seatIndex),
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
  };
  if (remaining.length === 0) {
    return award(next, seatIndex);
  }
  return next;
}

/** Buried discards become the stock. The top card stays face up. */
function refillStock(state: CrazyEightsState): CrazyEightsState {
  if (state.stock.length > 0 || state.discardPile.length <= 1) {
    return state;
  }
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) {
    return state;
  }
  const buried = state.discardPile.slice(0, -1);
  return {
    ...state,
    stock: shuffleDeck(buried, buried.join('|')),
    discardPile: [top],
  };
}

function applyDraw(
  state: CrazyEightsState,
  seatIndex: number,
): CrazyEightsState {
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  if (handHasPlay(state, seatIndex)) {
    throw new Error('Invalid intent');
  }
  const ready = refillStock(state);
  if (ready.stock.length === 0) {
    throw new Error('Invalid intent');
  }
  const stock = ready.stock.slice();
  const drawn = stock.pop();
  if (!drawn) {
    throw new Error('Invalid intent');
  }
  const key = handKey(seatIndex);
  const held = ready.hands[key] ?? [];
  return {
    phase: 'play',
    hands: { ...ready.hands, [key]: held.concat(drawn) },
    stock,
    discardPile: ready.discardPile.slice(),
    currentSuit: ready.currentSuit,
    turnSeatIndex: seatIndex,
    winnerSeatIndex: null,
    scores: {},
    passes: 0,
  };
}

function applyPass(
  state: CrazyEightsState,
  seatIndex: number,
): CrazyEightsState {
  if (!seatMustPass(state, seatIndex)) {
    throw new Error('Invalid intent');
  }
  const passes = state.passes + 1;
  const seated = seatedIndexes(state.hands);
  if (passes >= seated.length) {
    return finishByLowest(state);
  }
  return {
    phase: 'play',
    hands: state.hands,
    stock: state.stock.slice(),
    discardPile: state.discardPile.slice(),
    currentSuit: state.currentSuit,
    turnSeatIndex: nextSeat(state.hands, seatIndex),
    winnerSeatIndex: null,
    scores: {},
    passes,
  };
}

function leaveSeat(
  state: CrazyEightsState,
  seatIndex: number,
): CrazyEightsState {
  const key = handKey(seatIndex);
  if (!(key in state.hands)) {
    return copyState(state);
  }
  const hands: Record<string, string[]> = { ...state.hands };
  delete hands[key];
  let turnSeatIndex = state.turnSeatIndex;
  if (turnSeatIndex === seatIndex) {
    turnSeatIndex = nextSeat(hands, seatIndex);
  }
  const scores: Record<string, number> = { ...state.scores };
  delete scores[key];
  const seated = seatedIndexes(hands);
  let phase = state.phase;
  let winnerSeatIndex = state.winnerSeatIndex;
  const winnerStillSeated =
    winnerSeatIndex !== null && handKey(winnerSeatIndex) in hands;
  if (phase === 'play' && seated.length <= 1) {
    phase = 'finished';
    winnerSeatIndex = seated[0] ?? null;
    turnSeatIndex = null;
    const awarded: Record<string, number> = {};
    if (winnerSeatIndex !== null) {
      awarded[handKey(winnerSeatIndex)] = 0;
    }
    return {
      phase,
      hands,
      stock: state.stock.slice(),
      discardPile: state.discardPile.slice(),
      currentSuit: state.currentSuit,
      turnSeatIndex,
      winnerSeatIndex,
      scores: awarded,
      passes: 0,
    };
  }
  if (phase === 'finished' && !winnerStillSeated) {
    winnerSeatIndex = null;
  }
  return {
    phase,
    hands,
    stock: state.stock.slice(),
    discardPile: state.discardPile.slice(),
    currentSuit: state.currentSuit,
    turnSeatIndex,
    winnerSeatIndex,
    scores,
    passes: state.passes,
  };
}

function noteFor(
  before: CrazyEightsState,
  action: CrazyEightsIntent,
  after: CrazyEightsState,
  seatIndex: number,
): CrazyEightsEventNote | null {
  if (after.phase === 'finished' && before.phase !== 'finished') {
    const winner = after.winnerSeatIndex;
    if (winner === null) {
      return null;
    }
    return {
      kind: 'finish',
      seat: winner,
      score: after.scores[handKey(winner)] ?? 0,
    };
  }
  if (action.type === 'draw') {
    return { kind: 'draw', seat: seatIndex };
  }
  if (action.type === 'pass') {
    return { kind: 'pass', seat: seatIndex };
  }
  const suit = action.suit ?? after.currentSuit;
  if (!suit) {
    return null;
  }
  return { kind: 'play', seat: seatIndex, card: action.card, suit };
}

/**
 * Crazy Eights rules for gameType `crazy_eights`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 */
export const crazyEightsRules = {
  initialState(players: GameSeat[], table: GameTable): CrazyEightsState {
    if (players.length === 0) {
      return notStartedState();
    }
    return dealState(players, table.id);
  },
  applyIntent(
    prev: CrazyEightsState,
    intent: CrazyEightsIntent,
    ctx: IntentContext,
  ): CrazyEightsState {
    const state = readCrazyEightsState(prev);
    const action = readCrazyEightsIntent(intent);
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'play') {
      return applyPlay(state, action.card, action.suit, ctx.seat.seatIndex);
    }
    if (action.type === 'draw') {
      return applyDraw(state, ctx.seat.seatIndex);
    }
    return applyPass(state, ctx.seat.seatIndex);
  },
  eventNote(
    prev: CrazyEightsState,
    intent: CrazyEightsIntent,
    next: CrazyEightsState,
    ctx: IntentContext,
  ): CrazyEightsEventNote | null {
    return noteFor(
      readCrazyEightsState(prev),
      readCrazyEightsIntent(intent),
      readCrazyEightsState(next),
      ctx.seat.seatIndex,
    );
  },
  onPlayerJoin(prev: CrazyEightsState, seat: GameSeat): CrazyEightsState {
    void seat;
    return readCrazyEightsState(prev);
  },
  onPlayerLeave(prev: CrazyEightsState, seat: GameSeat): CrazyEightsState {
    return leaveSeat(readCrazyEightsState(prev), seat.seatIndex);
  },
} satisfies GameRules<CrazyEightsState, CrazyEightsIntent>;
