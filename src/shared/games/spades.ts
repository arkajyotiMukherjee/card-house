import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for partnership Spades. */
export const SPADES_GAME_TYPE = 'spades' as const;

export const SPADES_RANKS = [
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

export const SPADES_SUITS = ['S', 'H', 'D', 'C'] as const;

const SPADES_PHASES = ['lobby', 'play', 'finished'] as const;
const SPADES_STAGES = ['bid', 'trick'] as const;
const SPADES_TEAMS = ['ns', 'ew'] as const;

/** First side to this score wins, after the hand is scored. */
export const SPADES_TARGET = 500;
/** Points for each trick in a made contract, and the penalty per missed trick. */
export const SPADES_TRICK_POINTS = 10;
/** A bid of 0. Made nil scores this; a failed nil loses it. */
export const SPADES_NIL = 100;
/** Bags are overtricks. This many costs `SPADES_BAG_PENALTY`. */
export const SPADES_BAG_SET = 10;
export const SPADES_BAG_PENALTY = 100;
export const SPADES_PLAYERS = 4;
const BID_MAX = 13;

const RANK_SET: ReadonlySet<string> = new Set(SPADES_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(SPADES_SUITS);

/** Ace high. Two is the lowest card in a suit. */
const RANK_VALUE = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
} as const satisfies Record<(typeof SPADES_RANKS)[number], number>;

export type SpadesRank = (typeof SPADES_RANKS)[number];
export type SpadesSuit = (typeof SPADES_SUITS)[number];
export type SpadesPhase = (typeof SPADES_PHASES)[number];
export type SpadesStage = (typeof SPADES_STAGES)[number];
/** Even seat indexes are North-South. Odd seat indexes are East-West. */
export type SpadesTeam = (typeof SPADES_TEAMS)[number];

export interface SpadesTrickCard {
  seat: number;
  card: string;
}

export interface SpadesLastTrick {
  cards: SpadesTrickCard[];
  winner: number;
}

export interface SpadesScore {
  ns: number;
  ew: number;
}

export interface SpadesState {
  phase: SpadesPhase;
  /** `bid` while the hand is being bid. `trick` while cards are played. */
  stage: SpadesStage;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** `null` until that seat bids. A bid of 0 is nil. */
  bids: Record<string, number | null>;
  /** Tricks taken this hand, per seat. */
  tricks: Record<string, number>;
  trick: SpadesTrickCard[];
  lastTrick: SpadesLastTrick | null;
  spadesBroken: boolean;
  turnSeatIndex: number | null;
  dealerSeatIndex: number | null;
  scores: SpadesScore;
  bags: SpadesScore;
  handNumber: number;
  winnerTeam: SpadesTeam | null;
  /** Kept so the next hand shuffles from the same table. */
  tableId: string;
}

export type SpadesIntent =
  { type: 'bid'; tricks: number } | { type: 'play'; card: string };

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type SpadesEventNote =
  | { kind: 'bid'; seat: number; tricks: number }
  | { kind: 'play'; seat: number; card: string }
  | { kind: 'trick'; winner: number }
  | { kind: 'hand'; ns: number; ew: number; winner: SpadesTeam | null };

export const spadesGameDefinition = {
  gameType: SPADES_GAME_TYPE,
  displayName: 'Spades',
  minPlayers: SPADES_PLAYERS,
  maxPlayers: SPADES_PLAYERS,
  howToPlay:
    '# Spades\n\nFour players, two partnerships. Partners are every other seat. Each hand deals 13 cards. Bid the tricks you will take, from 0 (nil) to 13. Nil scores 100 if you take none and loses 100 if you take any.\n\nSpades are trump. Follow the led suit when you can. Do not lead a spade until one has been played, unless you hold only spades. The highest spade wins the trick. Otherwise the highest card of the led suit wins. Ace is high.\n\nA side that makes its bid scores 10 points for each bid trick plus 1 for each extra trick (a bag). Miss the bid and lose 10 points for each bid trick. Every 10 bags costs 100 points. The first side to reach 500 points wins.',
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

function isRank(value: unknown): value is SpadesRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is SpadesPhase {
  return (
    typeof value === 'string' &&
    (SPADES_PHASES as readonly string[]).includes(value)
  );
}

function isStage(value: unknown): value is SpadesStage {
  return (
    typeof value === 'string' &&
    (SPADES_STAGES as readonly string[]).includes(value)
  );
}

function isTeam(value: unknown): value is SpadesTeam {
  return (
    typeof value === 'string' &&
    (SPADES_TEAMS as readonly string[]).includes(value)
  );
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

export function spadesCardRank(card: string): SpadesRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

export function spadesCardSuit(card: string): SpadesSuit | null {
  const rank = spadesCardRank(card);
  if (!rank) {
    return null;
  }
  const suit = card.slice(-1);
  if (suit === 'S' || suit === 'H' || suit === 'D' || suit === 'C') {
    return suit;
  }
  return null;
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Invalid table state');
  }
  return value;
}

function readScore(value: unknown): SpadesScore {
  const record = asRecord(value, 'Invalid table state');
  return { ns: readCount(record.ns), ew: readCount(record.ew) };
}

function readTrick(value: unknown): SpadesTrickCard[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const cards: SpadesTrickCard[] = [];
  for (const item of value) {
    const record = asRecord(item, 'Invalid table state');
    if (!isSeatIndex(record.seat) || typeof record.card !== 'string') {
      throw new Error('Invalid table state');
    }
    cards.push({ seat: record.seat, card: record.card });
  }
  return cards;
}

function readLastTrick(value: unknown): SpadesLastTrick | null {
  if (value === null) {
    return null;
  }
  const record = asRecord(value, 'Invalid table state');
  if (!isSeatIndex(record.winner)) {
    throw new Error('Invalid table state');
  }
  return { cards: readTrick(record.cards), winner: record.winner };
}

function readSeatMap(
  value: unknown,
  allowNull: boolean,
): Record<string, number | null> {
  const record = asRecord(value, 'Invalid table state');
  const map: Record<string, number | null> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    const entry = record[key];
    if (allowNull && entry === null) {
      map[key] = null;
      continue;
    }
    map[key] = readCount(entry);
  }
  return map;
}

export function readSpadesState(value: unknown): SpadesState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || !isStage(record.stage)) {
    throw new Error('Invalid table state');
  }
  if (typeof record.tableId !== 'string') {
    throw new Error('Invalid table state');
  }
  if (typeof record.spadesBroken !== 'boolean') {
    throw new Error('Invalid table state');
  }
  if (!(record.turnSeatIndex === null || isSeatIndex(record.turnSeatIndex))) {
    throw new Error('Invalid table state');
  }
  if (!(
    record.dealerSeatIndex === null || isSeatIndex(record.dealerSeatIndex)
  )) {
    throw new Error('Invalid table state');
  }
  if (!(record.winnerTeam === null || isTeam(record.winnerTeam))) {
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
    if (
      !Array.isArray(hand) ||
      !hand.every((card) => typeof card === 'string')
    ) {
      throw new Error('Invalid table state');
    }
    hands[key] = hand.slice();
  }
  const bids = readSeatMap(record.bids, true);
  const tricks = readSeatMap(record.tricks, false);
  for (const key of Object.keys(tricks)) {
    if (tricks[key] === null) {
      throw new Error('Invalid table state');
    }
  }
  return {
    phase: record.phase,
    stage: record.stage,
    hands,
    bids,
    tricks: tricks as Record<string, number>,
    trick: readTrick(record.trick),
    lastTrick: readLastTrick(record.lastTrick),
    spadesBroken: record.spadesBroken,
    turnSeatIndex: record.turnSeatIndex,
    dealerSeatIndex: record.dealerSeatIndex,
    scores: readScore(record.scores),
    bags: readScore(record.bags),
    handNumber: readCount(record.handNumber),
    winnerTeam: record.winnerTeam,
    tableId: record.tableId,
  };
}

export function readSpadesIntent(value: unknown): SpadesIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'bid') {
    if (
      typeof record.tricks !== 'number' ||
      !Number.isSafeInteger(record.tricks)
    ) {
      throw new Error('Invalid intent');
    }
    return { type: 'bid', tricks: record.tricks };
  }
  if (record.type !== 'play' || typeof record.card !== 'string') {
    throw new Error('Invalid intent');
  }
  return { type: 'play', card: record.card };
}

export function readSpadesEventNote(value: unknown): SpadesEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (
    note.kind === 'bid' &&
    isSeatIndex(note.seat) &&
    isSeatIndex(note.tricks)
  ) {
    return { kind: 'bid', seat: note.seat, tricks: note.tricks };
  }
  if (
    note.kind === 'play' &&
    isSeatIndex(note.seat) &&
    typeof note.card === 'string'
  ) {
    return { kind: 'play', seat: note.seat, card: note.card };
  }
  if (note.kind === 'trick' && isSeatIndex(note.winner)) {
    return { kind: 'trick', winner: note.winner };
  }
  if (
    note.kind === 'hand' &&
    isSeatIndex(note.ns) &&
    isSeatIndex(note.ew) &&
    (note.winner === null || isTeam(note.winner))
  ) {
    return {
      kind: 'hand',
      ns: note.ns,
      ew: note.ew,
      winner: note.winner,
    };
  }
  return null;
}

function notStartedState(tableId: string): SpadesState {
  return {
    phase: 'lobby',
    stage: 'bid',
    hands: {},
    bids: {},
    tricks: {},
    trick: [],
    lastTrick: null,
    spadesBroken: false,
    turnSeatIndex: null,
    dealerSeatIndex: null,
    scores: { ns: 0, ew: 0 },
    bags: { ns: 0, ew: 0 },
    handNumber: 0,
    winnerTeam: null,
    tableId,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SPADES_SUITS) {
    for (const rank of SPADES_RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** FNV-1a so a table id and hand number always deal the same deck. */
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

function shuffleDeck(
  deck: string[],
  tableId: string,
  handNumber: number,
): string[] {
  const random = mulberry32(seedFromKey(`${tableId}:${handNumber}`));
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

function nextSeat(seats: readonly number[], after: number): number {
  for (const seat of seats) {
    if (seat > after) {
      return seat;
    }
  }
  return seats[0] ?? after;
}

function copyScore(score: SpadesScore): SpadesScore {
  return { ns: score.ns, ew: score.ew };
}

function dealSeats(
  seats: readonly number[],
  tableId: string,
  handNumber: number,
  dealer: number,
  scores: SpadesScore,
  bags: SpadesScore,
): SpadesState {
  const deck = shuffleDeck(freshDeck(), tableId, handNumber);
  const hands: Record<string, string[]> = {};
  const bids: Record<string, number | null> = {};
  const tricks: Record<string, number> = {};
  for (const seat of seats) {
    const key = handKey(seat);
    hands[key] = [];
    bids[key] = null;
    tricks[key] = 0;
  }
  const leader = nextSeat(seats, dealer);
  const start = seats.indexOf(leader);
  for (let i = 0; i < deck.length; i += 1) {
    const seat = seats[(start + i) % seats.length];
    hands[handKey(seat)].push(deck[i]);
  }
  return {
    phase: 'play',
    stage: 'bid',
    hands,
    bids,
    tricks,
    trick: [],
    lastTrick: null,
    spadesBroken: false,
    turnSeatIndex: leader,
    dealerSeatIndex: dealer,
    scores: copyScore(scores),
    bags: copyScore(bags),
    handNumber,
    winnerTeam: null,
    tableId,
  };
}

function teamOf(seatIndex: number): SpadesTeam {
  return seatIndex % 2 === 0 ? 'ns' : 'ew';
}

function teamSeats(
  hands: Record<string, string[]>,
  team: SpadesTeam,
): number[] {
  const parity = team === 'ns' ? 0 : 1;
  const seats: number[] = [];
  for (const seat of seatedIndexes(hands)) {
    if (seat % 2 === parity) {
      seats.push(seat);
    }
  }
  return seats;
}

/**
 * Partnership score for one hand.
 * Nil is scored on its own. Tricks from a nil bid still count in the total,
 * so a failed nil can fill the partner's contract and still adds bags.
 */
function scoreTeam(
  bids: readonly number[],
  taken: readonly number[],
): { delta: number; bagGain: number } {
  let contract = 0;
  let tricks = 0;
  let nil = 0;
  for (let index = 0; index < bids.length; index += 1) {
    const bid = bids[index] ?? 0;
    const got = taken[index] ?? 0;
    tricks += got;
    if (bid === 0) {
      nil += got === 0 ? SPADES_NIL : -SPADES_NIL;
    } else {
      contract += bid;
    }
  }
  let delta = nil;
  let bagGain = 0;
  if (tricks >= contract) {
    bagGain = tricks - contract;
    delta += contract * SPADES_TRICK_POINTS + bagGain;
  } else {
    delta -= contract * SPADES_TRICK_POINTS;
  }
  return { delta, bagGain };
}

function applyTeamScore(
  current: number,
  currentBags: number,
  delta: number,
  bagGain: number,
): { score: number; bags: number } {
  let nextBags = currentBags + bagGain;
  let nextScore = current + delta;
  while (nextBags >= SPADES_BAG_SET) {
    nextBags -= SPADES_BAG_SET;
    nextScore -= SPADES_BAG_PENALTY;
  }
  return { score: nextScore, bags: nextBags };
}

function bidNumber(state: SpadesState, seat: number): number {
  const bid = state.bids[handKey(seat)];
  if (typeof bid !== 'number') {
    throw new Error('Invalid table state');
  }
  return bid;
}

function trickNumber(state: SpadesState, seat: number): number {
  const count = state.tricks[handKey(seat)];
  if (typeof count !== 'number') {
    throw new Error('Invalid table state');
  }
  return count;
}

function scoreHand(state: SpadesState): {
  scores: SpadesScore;
  bags: SpadesScore;
} {
  const scores = copyScore(state.scores);
  const bags = copyScore(state.bags);
  for (const team of SPADES_TEAMS) {
    const seats = teamSeats(state.hands, team);
    const bids: number[] = [];
    const taken: number[] = [];
    for (const seat of seats) {
      bids.push(bidNumber(state, seat));
      taken.push(trickNumber(state, seat));
    }
    const part = scoreTeam(bids, taken);
    const next = applyTeamScore(
      team === 'ns' ? scores.ns : scores.ew,
      team === 'ns' ? bags.ns : bags.ew,
      part.delta,
      part.bagGain,
    );
    if (team === 'ns') {
      scores.ns = next.score;
      bags.ns = next.bags;
    } else {
      scores.ew = next.score;
      bags.ew = next.bags;
    }
  }
  return { scores, bags };
}

function emptyHands(hands: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const key of Object.keys(hands)) {
    next[key] = [];
  }
  return next;
}

function winnerOf(scores: SpadesScore): SpadesTeam | null {
  const nsDone = scores.ns >= SPADES_TARGET;
  const ewDone = scores.ew >= SPADES_TARGET;
  if (!nsDone && !ewDone) {
    return null;
  }
  if (scores.ns === scores.ew) {
    return null;
  }
  return scores.ns > scores.ew ? 'ns' : 'ew';
}

function finishHand(
  state: SpadesState,
  lastTrick: SpadesLastTrick,
): SpadesState {
  const scored = scoreHand(state);
  const winner = winnerOf(scored.scores);
  const crossed =
    scored.scores.ns >= SPADES_TARGET || scored.scores.ew >= SPADES_TARGET;
  if (crossed && winner !== null) {
    return {
      phase: 'finished',
      stage: 'trick',
      hands: emptyHands(state.hands),
      bids: { ...state.bids },
      tricks: { ...state.tricks },
      trick: [],
      lastTrick,
      spadesBroken: state.spadesBroken,
      turnSeatIndex: null,
      dealerSeatIndex: state.dealerSeatIndex,
      scores: scored.scores,
      bags: scored.bags,
      handNumber: state.handNumber,
      winnerTeam: winner,
      tableId: state.tableId,
    };
  }
  const seats = seatedIndexes(state.hands);
  const dealer =
    state.dealerSeatIndex === null
      ? (seats[0] ?? 0)
      : nextSeat(seats, state.dealerSeatIndex);
  return dealSeats(
    seats,
    state.tableId,
    state.handNumber + 1,
    dealer,
    scored.scores,
    scored.bags,
  );
}

function handHasSuit(hand: readonly string[], suit: SpadesSuit): boolean {
  for (const card of hand) {
    if (spadesCardSuit(card) === suit) {
      return true;
    }
  }
  return false;
}

function onlySpades(hand: readonly string[]): boolean {
  for (const card of hand) {
    if (spadesCardSuit(card) !== 'S') {
      return false;
    }
  }
  return hand.length > 0;
}

function trickWinner(trick: readonly SpadesTrickCard[]): number {
  const led = spadesCardSuit(trick[0]?.card ?? '');
  let best = 0;
  for (let index = 1; index < trick.length; index += 1) {
    const card = trick[index]?.card ?? '';
    const bestCard = trick[best]?.card ?? '';
    const suit = spadesCardSuit(card);
    const bestSuit = spadesCardSuit(bestCard);
    const rank = spadesCardRank(card);
    const bestRank = spadesCardRank(bestCard);
    if (!suit || !bestSuit || !rank || !bestRank || !led) {
      throw new Error('Invalid table state');
    }
    const higher = RANK_VALUE[rank] > RANK_VALUE[bestRank];
    const beats =
      suit === 'S'
        ? bestSuit !== 'S' || higher
        : bestSuit !== 'S' && suit === led && higher;
    if (beats) {
      best = index;
    }
  }
  return trick[best]?.seat ?? 0;
}

function applyBid(
  state: SpadesState,
  tricks: number,
  seatIndex: number,
): SpadesState {
  if (state.stage !== 'bid') {
    throw new Error('Invalid intent');
  }
  if (tricks < 0 || tricks > BID_MAX) {
    throw new Error('Invalid intent');
  }
  const key = handKey(seatIndex);
  if (!(key in state.hands) || state.bids[key] !== null) {
    throw new Error('Invalid intent');
  }
  const bids = { ...state.bids, [key]: tricks };
  const seats = seatedIndexes(state.hands);
  let complete = true;
  for (const seat of seats) {
    if (bids[handKey(seat)] === null) {
      complete = false;
    }
  }
  if (!complete) {
    return {
      phase: 'play',
      stage: 'bid',
      hands: state.hands,
      bids,
      tricks: state.tricks,
      trick: state.trick.slice(),
      lastTrick: state.lastTrick,
      spadesBroken: state.spadesBroken,
      turnSeatIndex: nextSeat(seats, seatIndex),
      dealerSeatIndex: state.dealerSeatIndex,
      scores: copyScore(state.scores),
      bags: copyScore(state.bags),
      handNumber: state.handNumber,
      winnerTeam: null,
      tableId: state.tableId,
    };
  }
  const dealer = state.dealerSeatIndex ?? seats[0] ?? seatIndex;
  return {
    phase: 'play',
    stage: 'trick',
    hands: state.hands,
    bids,
    tricks: state.tricks,
    trick: [],
    lastTrick: null,
    spadesBroken: false,
    turnSeatIndex: nextSeat(seats, dealer),
    dealerSeatIndex: state.dealerSeatIndex,
    scores: copyScore(state.scores),
    bags: copyScore(state.bags),
    handNumber: state.handNumber,
    winnerTeam: null,
    tableId: state.tableId,
  };
}

function applyPlay(
  state: SpadesState,
  card: string,
  seatIndex: number,
): SpadesState {
  if (state.stage !== 'trick') {
    throw new Error('Invalid intent');
  }
  const suit = spadesCardSuit(card);
  if (!suit) {
    throw new Error('Invalid intent');
  }
  const key = handKey(seatIndex);
  const hand = state.hands[key];
  if (!hand || !hand.includes(card)) {
    throw new Error('Invalid intent');
  }
  if (state.trick.length === 0) {
    if (suit === 'S' && !state.spadesBroken && !onlySpades(hand)) {
      throw new Error('Spades are not broken');
    }
  } else {
    const led = spadesCardSuit(state.trick[0]?.card ?? '');
    if (led && suit !== led && handHasSuit(hand, led)) {
      throw new Error('Must follow suit');
    }
  }
  const remaining = hand.slice();
  remaining.splice(remaining.indexOf(card), 1);
  const hands = { ...state.hands, [key]: remaining };
  const trick = state.trick.concat({ seat: seatIndex, card });
  const spadesBroken = state.spadesBroken || suit === 'S';
  const seats = seatedIndexes(state.hands);
  if (trick.length < seats.length) {
    return {
      phase: 'play',
      stage: 'trick',
      hands,
      bids: state.bids,
      tricks: state.tricks,
      trick,
      lastTrick: null,
      spadesBroken,
      turnSeatIndex: nextSeat(seats, seatIndex),
      dealerSeatIndex: state.dealerSeatIndex,
      scores: copyScore(state.scores),
      bags: copyScore(state.bags),
      handNumber: state.handNumber,
      winnerTeam: null,
      tableId: state.tableId,
    };
  }
  const winner = trickWinner(trick);
  const winnerKey = handKey(winner);
  const tricks = {
    ...state.tricks,
    [winnerKey]: (state.tricks[winnerKey] ?? 0) + 1,
  };
  const lastTrick = { cards: trick.slice(), winner };
  let emptied = true;
  for (const seat of seats) {
    const held = hands[handKey(seat)] ?? [];
    if (held.length > 0) {
      emptied = false;
    }
  }
  const mid: SpadesState = {
    phase: 'play',
    stage: 'trick',
    hands,
    bids: state.bids,
    tricks,
    trick: [],
    lastTrick,
    spadesBroken,
    turnSeatIndex: winner,
    dealerSeatIndex: state.dealerSeatIndex,
    scores: copyScore(state.scores),
    bags: copyScore(state.bags),
    handNumber: state.handNumber,
    winnerTeam: null,
    tableId: state.tableId,
  };
  if (emptied) {
    return finishHand(mid, lastTrick);
  }
  return mid;
}

function cloneState(state: SpadesState): SpadesState {
  const hands: Record<string, string[]> = {};
  for (const key of Object.keys(state.hands)) {
    hands[key] = state.hands[key].slice();
  }
  return {
    phase: state.phase,
    stage: state.stage,
    hands,
    bids: { ...state.bids },
    tricks: { ...state.tricks },
    trick: state.trick.slice(),
    lastTrick: state.lastTrick
      ? {
          winner: state.lastTrick.winner,
          cards: state.lastTrick.cards.slice(),
        }
      : null,
    spadesBroken: state.spadesBroken,
    turnSeatIndex: state.turnSeatIndex,
    dealerSeatIndex: state.dealerSeatIndex,
    scores: copyScore(state.scores),
    bags: copyScore(state.bags),
    handNumber: state.handNumber,
    winnerTeam: state.winnerTeam,
    tableId: state.tableId,
  };
}

function leaveSeat(state: SpadesState, seatIndex: number): SpadesState {
  const next = cloneState(state);
  if (next.phase !== 'play' || !(handKey(seatIndex) in next.hands)) {
    return next;
  }
  next.phase = 'finished';
  next.turnSeatIndex = null;
  next.winnerTeam = teamOf(seatIndex) === 'ns' ? 'ew' : 'ns';
  return next;
}

function noteFor(
  before: SpadesState,
  action: SpadesIntent,
  after: SpadesState,
  seatIndex: number,
): SpadesEventNote | null {
  if (action.type === 'bid') {
    return { kind: 'bid', seat: seatIndex, tricks: action.tricks };
  }
  if (after.phase === 'finished' && before.phase !== 'finished') {
    return {
      kind: 'hand',
      ns: after.scores.ns,
      ew: after.scores.ew,
      winner: after.winnerTeam,
    };
  }
  if (after.handNumber !== before.handNumber) {
    return {
      kind: 'hand',
      ns: after.scores.ns,
      ew: after.scores.ew,
      winner: null,
    };
  }
  if (before.trick.length > 0 && after.trick.length === 0 && after.lastTrick) {
    return { kind: 'trick', winner: after.lastTrick.winner };
  }
  return { kind: 'play', seat: seatIndex, card: action.card };
}

/**
 * Spades rules for gameType `spades`.
 * `initialState([], table)` is the not-started lobby. Exactly four seats are dealt.
 */
export const spadesRules = {
  initialState(players: GameSeat[], table: GameTable): SpadesState {
    const ordered = seatsInOrder(players);
    if (ordered.length !== SPADES_PLAYERS) {
      return notStartedState(table.id);
    }
    const seats = ordered.map((seat) => seat.seatIndex);
    const dealer = seats[0] ?? 0;
    return dealSeats(
      seats,
      table.id,
      1,
      dealer,
      { ns: 0, ew: 0 },
      { ns: 0, ew: 0 },
    );
  },
  applyIntent(
    prev: SpadesState,
    intent: SpadesIntent,
    ctx: IntentContext,
  ): SpadesState {
    const state = readSpadesState(prev);
    const action = readSpadesIntent(intent);
    if (state.phase !== 'play') {
      throw new Error('Invalid intent');
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'bid') {
      return applyBid(state, action.tricks, ctx.seat.seatIndex);
    }
    return applyPlay(state, action.card, ctx.seat.seatIndex);
  },
  eventNote(
    prev: SpadesState,
    intent: SpadesIntent,
    next: SpadesState,
    ctx: IntentContext,
  ): SpadesEventNote | null {
    return noteFor(
      readSpadesState(prev),
      readSpadesIntent(intent),
      readSpadesState(next),
      ctx.seat.seatIndex,
    );
  },
  onPlayerJoin(prev: SpadesState, seat: GameSeat): SpadesState {
    void seat;
    return cloneState(readSpadesState(prev));
  },
  onPlayerLeave(prev: SpadesState, seat: GameSeat): SpadesState {
    return leaveSeat(readSpadesState(prev), seat.seatIndex);
  },
} satisfies GameRules<SpadesState, SpadesIntent>;
