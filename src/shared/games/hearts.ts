import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Hearts. */
export const HEARTS_GAME_TYPE = 'hearts' as const;

export const HEARTS_RANKS = [
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

export const HEARTS_SUITS = ['S', 'H', 'D', 'C'] as const;

/** Low to high for a trick. Ace takes the suit. */
const TRICK_RANKS = [
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
  'A',
] as const;

const HEARTS_PHASES = ['lobby', 'pass', 'play', 'finished'] as const;

export const PASS_DIRECTIONS = ['left', 'right', 'across', 'hold'] as const;

export const HEARTS_SCORE_LIMIT = 100;
export const HEARTS_PASS_COUNT = 3;
export const QUEEN_OF_SPADES = 'QS';
export const TWO_OF_CLUBS = '2C';

const RANK_SET: ReadonlySet<string> = new Set(HEARTS_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(HEARTS_SUITS);
const TRICK_RANK_SET: ReadonlySet<string> = new Set(TRICK_RANKS);

export type HeartsRank = (typeof HEARTS_RANKS)[number];
export type HeartsSuit = (typeof HEARTS_SUITS)[number];
export type HeartsPhase = (typeof HEARTS_PHASES)[number];
export type PassDirection = (typeof PASS_DIRECTIONS)[number];

export interface HeartsTrickCard {
  seat: number;
  card: string;
}

export interface HeartsState {
  phase: HeartsPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** Cards won, keyed by seat. Hearts and the queen of spades score from here. */
  tricksTaken: Record<string, string[]>;
  currentTrick: HeartsTrickCard[];
  scores: Record<string, number>;
  /** Zero-based hand. Pass direction is this value mod 4. */
  handIndex: number;
  /** Cards each seat offered during the pass, before they move. */
  passes: Record<string, string[]>;
  heartsBroken: boolean;
  turnSeatIndex: number | null;
  winnerSeatIndex: number | null;
  tableId: string;
}

export type HeartsIntent =
  { type: 'pass'; cards: string[] } | { type: 'play'; card: string };

export type HeartsEventNote =
  | { kind: 'pass'; seat: number; direction: 'left' | 'right' | 'across' }
  | {
      kind: 'play';
      seat: number;
      card: string;
      trickWinner: number | null;
      points: number;
      queen: boolean;
    }
  | { kind: 'moon'; seat: number; winner: number | null }
  | { kind: 'finished'; winner: number };

export const heartsGameDefinition = {
  gameType: HEARTS_GAME_TYPE,
  displayName: 'Hearts',
  minPlayers: 4,
  maxPlayers: 4,
  howToPlay:
    '# Hearts\n\nFour players, no partners. Avoid hearts and the queen of spades. Each heart scores 1 and the queen of spades scores 13. The lowest score wins when a player reaches 100.\n\nPass three cards before the hand, rotating left, right, across, then a hold with no pass. The two of clubs leads. Follow suit. Hearts cannot be led until a heart has been played. Points cannot be thrown on the first trick when another card is available. Taking every heart and the queen scores 0 for that player and 26 for each opponent.',
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

function isRank(value: unknown): value is HeartsRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is HeartsPhase {
  return (
    typeof value === 'string' &&
    (HEARTS_PHASES as readonly string[]).includes(value)
  );
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

function readStringRows(
  value: unknown,
  message: string,
): Record<string, string[]> {
  const record = asRecord(value, message);
  const rows: Record<string, string[]> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error(message);
    }
    const cards = record[key];
    if (!isStringArray(cards)) {
      throw new Error(message);
    }
    rows[key] = cards.slice();
  }
  return rows;
}

function readScores(value: unknown): Record<string, number> {
  const record = asRecord(value, 'Invalid table state');
  const scores: Record<string, number> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    const score = record[key];
    if (typeof score !== 'number' || !Number.isSafeInteger(score)) {
      throw new Error('Invalid table state');
    }
    scores[key] = score;
  }
  return scores;
}

function readTrick(value: unknown): HeartsTrickCard[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const trick: HeartsTrickCard[] = [];
  for (const item of value) {
    const record = asRecord(item, 'Invalid table state');
    if (!isSeatIndex(record.seat) || typeof record.card !== 'string') {
      throw new Error('Invalid table state');
    }
    trick.push({ seat: record.seat, card: record.card });
  }
  return trick;
}

/** Suit letter at the end of a card id. `10` is the only two-letter rank. */
export function cardSuit(card: string): HeartsSuit | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return suit as HeartsSuit;
}

export function cardRank(card: string): HeartsRank | null {
  const suit = cardSuit(card);
  if (!suit) {
    return null;
  }
  const rank = card.slice(0, -1);
  if (!isRank(rank)) {
    return null;
  }
  return rank;
}

export function isPointCard(card: string): boolean {
  return cardSuit(card) === 'H' || card === QUEEN_OF_SPADES;
}

export function passDirection(handIndex: number): PassDirection {
  const index = ((handIndex % 4) + 4) % 4;
  return PASS_DIRECTIONS[index] ?? 'left';
}

export function readHeartsState(value: unknown): HeartsState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || typeof record.tableId !== 'string') {
    throw new Error('Invalid table state');
  }
  if (typeof record.heartsBroken !== 'boolean') {
    throw new Error('Invalid table state');
  }
  if (
    typeof record.handIndex !== 'number' ||
    !Number.isSafeInteger(record.handIndex) ||
    record.handIndex < 0
  ) {
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
  return {
    phase: record.phase,
    hands: readStringRows(record.hands, 'Invalid table state'),
    tricksTaken: readStringRows(record.tricksTaken, 'Invalid table state'),
    currentTrick: readTrick(record.currentTrick),
    scores: readScores(record.scores),
    handIndex: record.handIndex,
    passes: readStringRows(record.passes, 'Invalid table state'),
    heartsBroken: record.heartsBroken,
    turnSeatIndex: record.turnSeatIndex,
    winnerSeatIndex: record.winnerSeatIndex,
    tableId: record.tableId,
  };
}

export function readHeartsIntent(value: unknown): HeartsIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'pass') {
    if (!Array.isArray(record.cards)) {
      throw new Error('Invalid intent');
    }
    const cards: string[] = [];
    for (const card of record.cards) {
      if (typeof card !== 'string') {
        throw new Error('Invalid intent');
      }
      cards.push(card);
    }
    return { type: 'pass', cards };
  }
  if (record.type !== 'play' || typeof record.card !== 'string') {
    throw new Error('Invalid intent');
  }
  return { type: 'play', card: record.card };
}

function isPassDirection(value: unknown): value is 'left' | 'right' | 'across' {
  return value === 'left' || value === 'right' || value === 'across';
}

export function readHeartsEventNote(value: unknown): HeartsEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (
    note.kind === 'pass' &&
    isSeatIndex(note.seat) &&
    isPassDirection(note.direction)
  ) {
    return { kind: 'pass', seat: note.seat, direction: note.direction };
  }
  if (
    note.kind === 'play' &&
    isSeatIndex(note.seat) &&
    typeof note.card === 'string' &&
    (note.trickWinner === null || isSeatIndex(note.trickWinner)) &&
    isSeatIndex(note.points) &&
    typeof note.queen === 'boolean'
  ) {
    return {
      kind: 'play',
      seat: note.seat,
      card: note.card,
      trickWinner: note.trickWinner,
      points: note.points,
      queen: note.queen,
    };
  }
  if (
    note.kind === 'moon' &&
    isSeatIndex(note.seat) &&
    (note.winner === null || isSeatIndex(note.winner))
  ) {
    return { kind: 'moon', seat: note.seat, winner: note.winner };
  }
  if (note.kind === 'finished' && isSeatIndex(note.winner)) {
    return { kind: 'finished', winner: note.winner };
  }
  return null;
}

function lobbyState(tableId = ''): HeartsState {
  return {
    phase: 'lobby',
    hands: {},
    tricksTaken: {},
    currentTrick: [],
    scores: {},
    handIndex: 0,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: null,
    winnerSeatIndex: null,
    tableId,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of HEARTS_SUITS) {
    for (const rank of HEARTS_RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** FNV-1a so a table id and hand always deal the same deck. */
function seedFromKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
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

function shuffleDeck(deck: string[], key: string): string[] {
  const random = mulberry32(seedFromKey(key));
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

function emptyRows(hands: Record<string, string[]>): Record<string, string[]> {
  const rows: Record<string, string[]> = {};
  for (const key of Object.keys(hands)) {
    rows[key] = [];
  }
  return rows;
}

function copyRows(rows: Record<string, string[]>): Record<string, string[]> {
  const copy: Record<string, string[]> = {};
  for (const key of Object.keys(rows)) {
    copy[key] = rows[key].slice();
  }
  return copy;
}

function copyScores(scores: Record<string, number>): Record<string, number> {
  return { ...scores };
}

function seatHolding(
  hands: Record<string, string[]>,
  card: string,
): number | null {
  for (const seat of seatedIndexes(hands)) {
    if (hands[handKey(seat)]?.includes(card)) {
      return seat;
    }
  }
  return null;
}

function tricksPlayed(state: HeartsState): number {
  let cards = 0;
  for (const key of Object.keys(state.tricksTaken)) {
    cards += state.tricksTaken[key]?.length ?? 0;
  }
  return Math.floor(cards / 4);
}

function trickRankIndex(card: string): number {
  const rank = cardRank(card);
  if (!rank || !TRICK_RANK_SET.has(rank)) {
    return -1;
  }
  return TRICK_RANKS.indexOf(rank);
}

function trickWinner(trick: readonly HeartsTrickCard[]): number {
  const led = cardSuit(trick[0]?.card ?? '');
  let winner = trick[0]?.seat ?? 0;
  let best = -1;
  for (const play of trick) {
    if (cardSuit(play.card) !== led) {
      continue;
    }
    const rank = trickRankIndex(play.card);
    if (rank > best) {
      best = rank;
      winner = play.seat;
    }
  }
  return winner;
}

function pointsIn(cards: readonly string[]): number {
  let total = 0;
  for (const card of cards) {
    if (cardSuit(card) === 'H') {
      total += 1;
    } else if (card === QUEEN_OF_SPADES) {
      total += 13;
    }
  }
  return total;
}

/**
 * Why `card` cannot be played, or null when it can.
 * The caller has already checked that this seat is the one to act.
 */
export function playError(
  state: HeartsState,
  seatIndex: number,
  card: string,
): string | null {
  const hand = state.hands[handKey(seatIndex)];
  if (!hand || !hand.includes(card) || !cardSuit(card)) {
    return 'Pick a card from your hand';
  }
  const played = tricksPlayed(state);
  if (state.currentTrick.length === 0) {
    if (played === 0 && card !== TWO_OF_CLUBS) {
      return 'Lead the 2 of clubs';
    }
    if (
      cardSuit(card) === 'H' &&
      !state.heartsBroken &&
      hand.some((held) => cardSuit(held) !== 'H')
    ) {
      return 'Hearts are not broken';
    }
    return null;
  }
  const led = cardSuit(state.currentTrick[0]?.card ?? '');
  if (
    led &&
    hand.some((held) => cardSuit(held) === led) &&
    cardSuit(card) !== led
  ) {
    return 'Follow suit';
  }
  if (
    played === 0 &&
    isPointCard(card) &&
    hand.some((held) => !isPointCard(held))
  ) {
    return 'No points on the first trick';
  }
  return null;
}

export function canPlayCard(
  state: HeartsState,
  seatIndex: number,
  card: string,
): boolean {
  if (state.phase !== 'play' || state.turnSeatIndex !== seatIndex) {
    return false;
  }
  return playError(state, seatIndex, card) === null;
}

export function canPassCard(
  state: HeartsState,
  seatIndex: number,
  card: string,
): boolean {
  if (state.phase !== 'pass') {
    return false;
  }
  const key = handKey(seatIndex);
  if (state.passes[key]) {
    return false;
  }
  return state.hands[key]?.includes(card) ?? false;
}

function startPlay(state: HeartsState): HeartsState {
  const seats = seatedIndexes(state.hands);
  const leader = seatHolding(state.hands, TWO_OF_CLUBS) ?? seats[0] ?? null;
  return {
    phase: 'play',
    hands: copyRows(state.hands),
    tricksTaken: emptyRows(state.hands),
    currentTrick: [],
    scores: copyScores(state.scores),
    handIndex: state.handIndex,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: leader,
    winnerSeatIndex: null,
    tableId: state.tableId,
  };
}

function beginHand(
  seatIndexes: readonly number[],
  tableId: string,
  handIndex: number,
  previousScores: Record<string, number>,
): HeartsState {
  const ordered = [...new Set(seatIndexes)].sort((a, b) => a - b);
  if (ordered.length !== 4) {
    return lobbyState(tableId);
  }
  const deck = shuffleDeck(freshDeck(), `${tableId}:${handIndex}`);
  const hands: Record<string, string[]> = {};
  const scores: Record<string, number> = {};
  for (const seat of ordered) {
    hands[handKey(seat)] = [];
    scores[handKey(seat)] = previousScores[handKey(seat)] ?? 0;
  }
  for (let i = 0; i < deck.length; i += 1) {
    const seat = ordered[i % ordered.length];
    hands[handKey(seat)].push(deck[i]);
  }
  const dealt: HeartsState = {
    phase: 'pass',
    hands,
    tricksTaken: emptyRows(hands),
    currentTrick: [],
    scores,
    handIndex,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: null,
    winnerSeatIndex: null,
    tableId,
  };
  if (passDirection(handIndex) === 'hold') {
    return startPlay(dealt);
  }
  return dealt;
}

function passTarget(
  seats: readonly number[],
  from: number,
  direction: 'left' | 'right' | 'across',
): number {
  const index = seats.indexOf(from);
  const step =
    direction === 'left'
      ? 1
      : direction === 'right'
        ? seats.length - 1
        : Math.floor(seats.length / 2);
  return seats[(index + step) % seats.length] ?? from;
}

function exchangePasses(state: HeartsState): HeartsState {
  const seats = seatedIndexes(state.hands);
  const direction = passDirection(state.handIndex);
  if (direction === 'hold') {
    return startPlay(state);
  }
  const kept: Record<string, string[]> = {};
  for (const seat of seats) {
    const key = handKey(seat);
    const passing = new Set(state.passes[key] ?? []);
    const hand: string[] = [];
    for (const card of state.hands[key] ?? []) {
      if (passing.has(card)) {
        passing.delete(card);
      } else {
        hand.push(card);
      }
    }
    kept[key] = hand;
  }
  const hands: Record<string, string[]> = {};
  for (const seat of seats) {
    hands[handKey(seat)] = kept[handKey(seat)]?.slice() ?? [];
  }
  for (const seat of seats) {
    const target = passTarget(seats, seat, direction);
    const giving = state.passes[handKey(seat)] ?? [];
    const targetKey = handKey(target);
    hands[targetKey] = (hands[targetKey] ?? []).concat(giving);
  }
  return startPlay({
    phase: state.phase,
    hands,
    tricksTaken: state.tricksTaken,
    currentTrick: [],
    scores: state.scores,
    handIndex: state.handIndex,
    passes: {},
    heartsBroken: false,
    turnSeatIndex: null,
    winnerSeatIndex: null,
    tableId: state.tableId,
  });
}

function applyPass(
  state: HeartsState,
  cards: string[],
  seatIndex: number,
): HeartsState {
  if (state.phase !== 'pass') {
    throw new Error('The pass is over');
  }
  const key = handKey(seatIndex);
  const hand = state.hands[key];
  if (!hand) {
    throw new Error('Invalid intent');
  }
  if (state.passes[key]) {
    throw new Error('Already passed');
  }
  if (cards.length !== HEARTS_PASS_COUNT) {
    throw new Error('Pass 3 cards');
  }
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card) || !hand.includes(card)) {
      throw new Error('Pass 3 cards from your hand');
    }
    seen.add(card);
  }
  const passes = { ...state.passes, [key]: cards.slice() };
  const next: HeartsState = {
    phase: state.phase,
    hands: copyRows(state.hands),
    tricksTaken: copyRows(state.tricksTaken),
    currentTrick: state.currentTrick.map((play) => ({ ...play })),
    scores: copyScores(state.scores),
    handIndex: state.handIndex,
    passes,
    heartsBroken: state.heartsBroken,
    turnSeatIndex: state.turnSeatIndex,
    winnerSeatIndex: state.winnerSeatIndex,
    tableId: state.tableId,
  };
  if (Object.keys(passes).length < seatedIndexes(state.hands).length) {
    return next;
  }
  return exchangePasses(next);
}

function lowestScoreSeat(scores: Record<string, number>): number | null {
  let winner: number | null = null;
  let best = Number.POSITIVE_INFINITY;
  const seats = Object.keys(scores)
    .map((key) => Number(key))
    .filter((seat) => isSeatIndex(seat))
    .sort((a, b) => a - b);
  for (const seat of seats) {
    const score = scores[handKey(seat)] ?? 0;
    if (score < best) {
      best = score;
      winner = seat;
    }
  }
  return winner;
}

function pointsBySeat(
  tricksTaken: Record<string, string[]>,
): Record<string, number> {
  const gained: Record<string, number> = {};
  for (const key of Object.keys(tricksTaken)) {
    gained[key] = pointsIn(tricksTaken[key] ?? []);
  }
  return gained;
}

function finishGame(
  state: HeartsState,
  scores: Record<string, number>,
): HeartsState {
  return {
    phase: 'finished',
    hands: emptyRows(state.hands),
    tricksTaken: copyRows(state.tricksTaken),
    currentTrick: [],
    scores,
    handIndex: state.handIndex,
    passes: {},
    heartsBroken: state.heartsBroken,
    turnSeatIndex: null,
    winnerSeatIndex: lowestScoreSeat(scores),
    tableId: state.tableId,
  };
}

function scoreAndContinue(state: HeartsState): HeartsState {
  const seats = seatedIndexes(state.hands);
  const gained = pointsBySeat(state.tricksTaken);
  let moon: number | null = null;
  for (const seat of seats) {
    if ((gained[handKey(seat)] ?? 0) === 26) {
      moon = seat;
    }
  }
  const scores: Record<string, number> = {};
  for (const seat of seats) {
    const key = handKey(seat);
    const previous = state.scores[key] ?? 0;
    const added = moon !== null ? (seat === moon ? 0 : 26) : (gained[key] ?? 0);
    scores[key] = previous + added;
  }
  const over = seats.some(
    (seat) => (scores[handKey(seat)] ?? 0) >= HEARTS_SCORE_LIMIT,
  );
  if (over) {
    return finishGame({ ...state, scores }, scores);
  }
  return beginHand(seats, state.tableId, state.handIndex + 1, scores);
}

function resolveTrick(
  state: HeartsState,
  hands: Record<string, string[]>,
  trick: HeartsTrickCard[],
): HeartsState {
  const winner = trickWinner(trick);
  const won = trick.map((play) => play.card);
  const tricksTaken = copyRows(state.tricksTaken);
  const winnerKey = handKey(winner);
  tricksTaken[winnerKey] = (tricksTaken[winnerKey] ?? []).concat(won);
  const heartsBroken =
    state.heartsBroken || won.some((card) => cardSuit(card) === 'H');
  const next: HeartsState = {
    phase: 'play',
    hands,
    tricksTaken,
    currentTrick: [],
    scores: copyScores(state.scores),
    handIndex: state.handIndex,
    passes: {},
    heartsBroken,
    turnSeatIndex: winner,
    winnerSeatIndex: null,
    tableId: state.tableId,
  };
  const remaining = seatedIndexes(hands).some(
    (seat) => (hands[handKey(seat)]?.length ?? 0) > 0,
  );
  if (remaining) {
    return next;
  }
  return scoreAndContinue(next);
}

function applyPlay(
  state: HeartsState,
  card: string,
  seatIndex: number,
): HeartsState {
  const problem = playError(state, seatIndex, card);
  if (problem) {
    throw new Error(problem);
  }
  const key = handKey(seatIndex);
  const hand = (state.hands[key] ?? []).slice();
  const index = hand.indexOf(card);
  hand.splice(index, 1);
  const hands = copyRows(state.hands);
  hands[key] = hand;
  const currentTrick = state.currentTrick
    .map((play) => ({ ...play }))
    .concat([{ seat: seatIndex, card }]);
  if (currentTrick.length < seatedIndexes(state.hands).length) {
    return {
      phase: 'play',
      hands,
      tricksTaken: copyRows(state.tricksTaken),
      currentTrick,
      scores: copyScores(state.scores),
      handIndex: state.handIndex,
      passes: {},
      heartsBroken: state.heartsBroken,
      turnSeatIndex: nextSeat(hands, seatIndex),
      winnerSeatIndex: null,
      tableId: state.tableId,
    };
  }
  return resolveTrick(state, hands, currentTrick);
}

function leaveSeat(state: HeartsState, seatIndex: number): HeartsState {
  const key = handKey(seatIndex);
  if (!(key in state.hands) && !(key in state.scores)) {
    return readHeartsState(state);
  }
  const hands = copyRows(state.hands);
  delete hands[key];
  const scores = copyScores(state.scores);
  delete scores[key];
  const passes = copyRows(state.passes);
  delete passes[key];
  const tricksTaken = copyRows(state.tricksTaken);
  delete tricksTaken[key];
  const currentTrick = state.currentTrick
    .filter((play) => play.seat !== seatIndex)
    .map((play) => ({ ...play }));
  if (state.phase === 'lobby') {
    return {
      ...lobbyState(state.tableId),
      hands,
      scores,
      tricksTaken,
      passes,
    };
  }
  if (state.phase === 'finished') {
    const winnerStillSeated =
      state.winnerSeatIndex !== null && handKey(state.winnerSeatIndex) in hands;
    return {
      phase: 'finished',
      hands,
      tricksTaken,
      currentTrick,
      scores,
      handIndex: state.handIndex,
      passes,
      heartsBroken: state.heartsBroken,
      turnSeatIndex: null,
      winnerSeatIndex: winnerStillSeated
        ? state.winnerSeatIndex
        : lowestScoreSeat(scores),
      tableId: state.tableId,
    };
  }
  if (seatedIndexes(hands).length < 4) {
    return {
      phase: 'finished',
      hands,
      tricksTaken,
      currentTrick: [],
      scores,
      handIndex: state.handIndex,
      passes: {},
      heartsBroken: state.heartsBroken,
      turnSeatIndex: null,
      winnerSeatIndex: lowestScoreSeat(scores),
      tableId: state.tableId,
    };
  }
  let turnSeatIndex = state.turnSeatIndex;
  if (turnSeatIndex === seatIndex) {
    turnSeatIndex = nextSeat(hands, seatIndex);
  }
  return {
    phase: state.phase,
    hands,
    tricksTaken,
    currentTrick,
    scores,
    handIndex: state.handIndex,
    passes,
    heartsBroken: state.heartsBroken,
    turnSeatIndex,
    winnerSeatIndex: null,
    tableId: state.tableId,
  };
}

function handGained(
  before: HeartsState,
  card: string,
  seatIndex: number,
): { moon: number | null; complete: boolean } {
  if (before.currentTrick.length + 1 !== seatedIndexes(before.hands).length) {
    return { moon: null, complete: false };
  }
  const hand = before.hands[handKey(seatIndex)] ?? [];
  const othersHolding = seatedIndexes(before.hands).some((seat) => {
    const cards = before.hands[handKey(seat)] ?? [];
    if (seat === seatIndex) {
      return cards.length > 1;
    }
    return cards.length > 0;
  });
  if (othersHolding || !hand.includes(card) || hand.length !== 1) {
    return { moon: null, complete: false };
  }
  const trick = before.currentTrick.concat([{ seat: seatIndex, card }]);
  const winner = trickWinner(trick);
  const tricksTaken = copyRows(before.tricksTaken);
  const winnerKey = handKey(winner);
  tricksTaken[winnerKey] = (tricksTaken[winnerKey] ?? []).concat(
    trick.map((play) => play.card),
  );
  const gained = pointsBySeat(tricksTaken);
  let moon: number | null = null;
  for (const seat of seatedIndexes(before.hands)) {
    if ((gained[handKey(seat)] ?? 0) === 26) {
      moon = seat;
    }
  }
  return { moon, complete: true };
}

function noteForPlay(
  before: HeartsState,
  after: HeartsState,
  card: string,
  seatIndex: number,
): HeartsEventNote {
  const trick = before.currentTrick.concat([{ seat: seatIndex, card }]);
  const completes =
    trick.length === seatedIndexes(before.hands).length &&
    before.currentTrick.length > 0
      ? true
      : trick.length === seatedIndexes(before.hands).length;
  const trickWinnerSeat = completes ? trickWinner(trick) : null;
  const points = completes ? pointsIn(trick.map((play) => play.card)) : 0;
  const queen =
    completes && trick.some((play) => play.card === QUEEN_OF_SPADES);
  const gained = handGained(before, card, seatIndex);
  if (gained.complete && gained.moon !== null) {
    return {
      kind: 'moon',
      seat: gained.moon,
      winner: after.phase === 'finished' ? after.winnerSeatIndex : null,
    };
  }
  if (after.phase === 'finished' && after.winnerSeatIndex !== null) {
    return { kind: 'finished', winner: after.winnerSeatIndex };
  }
  return {
    kind: 'play',
    seat: seatIndex,
    card,
    trickWinner: trickWinnerSeat,
    points,
    queen,
  };
}

/**
 * Hearts rules for gameType `hearts`.
 * Four players, no partners. `initialState([], table)` waits in the lobby.
 */
export const heartsRules = {
  initialState(players: GameSeat[], table: GameTable): HeartsState {
    const ordered = seatsInOrder(players);
    if (ordered.length !== 4) {
      return lobbyState(table.id);
    }
    return beginHand(
      ordered.map((seat) => seat.seatIndex),
      table.id,
      0,
      {},
    );
  },
  applyIntent(
    prev: HeartsState,
    intent: HeartsIntent,
    ctx: IntentContext,
  ): HeartsState {
    const state = readHeartsState(prev);
    const action = readHeartsIntent(intent);
    if (state.phase === 'finished') {
      throw new Error('The hand is over');
    }
    if (state.phase === 'lobby') {
      throw new Error('The table has not started');
    }
    if (action.type === 'pass') {
      return applyPass(state, action.cards, ctx.seat.seatIndex);
    }
    if (state.phase !== 'play') {
      throw new Error('Wait for the pass to finish');
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    return applyPlay(state, action.card, ctx.seat.seatIndex);
  },
  eventNote(
    prev: HeartsState,
    intent: HeartsIntent,
    next: HeartsState,
    ctx: IntentContext,
  ): HeartsEventNote | null {
    const before = readHeartsState(prev);
    const after = readHeartsState(next);
    const action = readHeartsIntent(intent);
    if (action.type === 'pass') {
      const direction = passDirection(before.handIndex);
      if (direction === 'hold') {
        return null;
      }
      return {
        kind: 'pass',
        seat: ctx.seat.seatIndex,
        direction,
      };
    }
    return noteForPlay(before, after, action.card, ctx.seat.seatIndex);
  },
  onPlayerJoin(prev: HeartsState, seat: GameSeat): HeartsState {
    void seat;
    return readHeartsState(prev);
  },
  onPlayerLeave(prev: HeartsState, seat: GameSeat): HeartsState {
    return leaveSeat(readHeartsState(prev), seat.seatIndex);
  },
} satisfies GameRules<HeartsState, HeartsIntent>;
