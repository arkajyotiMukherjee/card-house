import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for President. */
export const PRESIDENT_GAME_TYPE = 'president' as const;

/** Low to high. Three is low and two is high. */
export const PRESIDENT_RANKS = [
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
  '2',
] as const;

export const PRESIDENT_SUITS = ['S', 'H', 'D', 'C'] as const;

const PRESIDENT_PHASES = ['lobby', 'play', 'finished'] as const;

/** The opening lead has to include this card. */
const OPENING_CARD = '3C';

const RANK_SET: ReadonlySet<string> = new Set(PRESIDENT_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(PRESIDENT_SUITS);

export type PresidentRank = (typeof PRESIDENT_RANKS)[number];
export type PresidentSuit = (typeof PRESIDENT_SUITS)[number];
export type PresidentPhase = (typeof PRESIDENT_PHASES)[number];

export interface PresidentLastPlay {
  seat: number;
  cards: string[];
  rank: PresidentRank;
}

export interface PresidentRankEntry {
  seat: number;
  title: string;
  score: number;
}

export interface PresidentState {
  phase: PresidentPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** Cards in the current trick. A cleared trick is an empty pile. */
  playPile: string[];
  /** Rank that must be beaten. Null when the seat to act may lead. */
  currentRank: PresidentRank | null;
  /** Cards required in the next play. 0 when the seat to act may lead. */
  currentCount: number;
  passes: number;
  turnSeatIndex: number | null;
  lastPlay: PresidentLastPlay | null;
  /** True until the first play, which must include the 3 of clubs. */
  openingLead: boolean;
  /** Seats that have gone out, best first. */
  finishOrder: number[];
  /** Titles and scores. Filled when the hand ends. */
  rankOrder: PresidentRankEntry[];
  winnerSeatIndex: number | null;
}

export type PresidentIntent =
  { type: 'play'; cards: string[] } | { type: 'pass' };

export type PresidentEventNote =
  | {
      kind: 'play';
      seat: number;
      count: number;
      rank: PresidentRank;
    }
  | { kind: 'pass'; seat: number }
  | { kind: 'finish'; president: number; scum: number };

export const presidentGameDefinition = {
  gameType: PRESIDENT_GAME_TYPE,
  displayName: 'President',
  minPlayers: 3,
  maxPlayers: 6,
  howToPlay:
    '# President\n\nThe player with the 3 of clubs leads. Play 1 to 4 cards of one rank. The next player matches that count with a higher rank, or passes. 3 is low and 2 is high. Twos clear the pile and that player leads again. When the others pass, the last player to play leads. First out is President. The last player holding cards is Scum. Scores run from high to low in that order.',
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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isRank(value: unknown): value is PresidentRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is PresidentPhase {
  return (
    typeof value === 'string' &&
    (PRESIDENT_PHASES as readonly string[]).includes(value)
  );
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function presidentRankOf(card: string): PresidentRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

function rankIndex(rank: PresidentRank): number {
  return PRESIDENT_RANKS.indexOf(rank);
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

function readLastPlay(value: unknown): PresidentLastPlay | null {
  if (value === null) {
    return null;
  }
  const record = asRecord(value, 'Invalid table state');
  if (!isSeatIndex(record.seat) || !isStringArray(record.cards)) {
    throw new Error('Invalid table state');
  }
  if (!isRank(record.rank)) {
    throw new Error('Invalid table state');
  }
  return {
    seat: record.seat,
    cards: record.cards.slice(),
    rank: record.rank,
  };
}

function readSeatList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const seats: number[] = [];
  for (const item of value) {
    if (!isSeatIndex(item)) {
      throw new Error('Invalid table state');
    }
    seats.push(item);
  }
  return seats;
}

function readRankOrder(value: unknown): PresidentRankEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const entries: PresidentRankEntry[] = [];
  for (const item of value) {
    const record = asRecord(item, 'Invalid table state');
    if (!isSeatIndex(record.seat) || typeof record.title !== 'string') {
      throw new Error('Invalid table state');
    }
    if (!isCount(record.score)) {
      throw new Error('Invalid table state');
    }
    entries.push({
      seat: record.seat,
      title: record.title,
      score: record.score,
    });
  }
  return entries;
}

export function readPresidentState(value: unknown): PresidentState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || typeof record.openingLead !== 'boolean') {
    throw new Error('Invalid table state');
  }
  if (!isStringArray(record.playPile)) {
    throw new Error('Invalid table state');
  }
  if (!(record.currentRank === null || isRank(record.currentRank))) {
    throw new Error('Invalid table state');
  }
  if (!isCount(record.currentCount) || !isCount(record.passes)) {
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
    playPile: record.playPile.slice(),
    currentRank: record.currentRank,
    currentCount: record.currentCount,
    passes: record.passes,
    turnSeatIndex: record.turnSeatIndex,
    lastPlay: readLastPlay(record.lastPlay),
    openingLead: record.openingLead,
    finishOrder: readSeatList(record.finishOrder),
    rankOrder: readRankOrder(record.rankOrder),
    winnerSeatIndex: record.winnerSeatIndex,
  };
}

export function readPresidentIntent(value: unknown): PresidentIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'pass') {
    return { type: 'pass' };
  }
  if (record.type !== 'play' || !Array.isArray(record.cards)) {
    throw new Error('Invalid intent');
  }
  const cards: string[] = [];
  for (const card of record.cards) {
    if (typeof card !== 'string') {
      throw new Error('Invalid intent');
    }
    cards.push(card);
  }
  return { type: 'play', cards };
}

export function readPresidentEventNote(
  value: unknown,
): PresidentEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (
    note.kind === 'play' &&
    isSeatIndex(note.seat) &&
    isSeatIndex(note.count) &&
    isRank(note.rank)
  ) {
    return {
      kind: 'play',
      seat: note.seat,
      count: note.count,
      rank: note.rank,
    };
  }
  if (note.kind === 'pass' && isSeatIndex(note.seat)) {
    return { kind: 'pass', seat: note.seat };
  }
  if (
    note.kind === 'finish' &&
    isSeatIndex(note.president) &&
    isSeatIndex(note.scum)
  ) {
    return {
      kind: 'finish',
      president: note.president,
      scum: note.scum,
    };
  }
  return null;
}

function notStartedState(): PresidentState {
  return {
    phase: 'lobby',
    hands: {},
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: null,
    lastPlay: null,
    openingLead: true,
    finishOrder: [],
    rankOrder: [],
    winnerSeatIndex: null,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of PRESIDENT_SUITS) {
    for (const rank of PRESIDENT_RANKS) {
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

function seatedIndexes(hands: Record<string, string[]>): number[] {
  const seats: number[] = [];
  for (const key of Object.keys(hands)) {
    seats.push(Number(key));
  }
  seats.sort((a, b) => a - b);
  return seats;
}

function seatsWithCards(hands: Record<string, string[]>): number[] {
  const holding: number[] = [];
  for (const seat of seatedIndexes(hands)) {
    const hand = hands[handKey(seat)];
    if (hand && hand.length > 0) {
      holding.push(seat);
    }
  }
  return holding;
}

function nextHolding(
  hands: Record<string, string[]>,
  after: number,
): number | null {
  const holding = seatsWithCards(hands);
  if (holding.length === 0) {
    return null;
  }
  for (const seat of holding) {
    if (seat > after) {
      return seat;
    }
  }
  return holding[0] ?? null;
}

function seatHoldingCard(
  hands: Record<string, string[]>,
  cardId: string,
): number | null {
  for (const seat of seatedIndexes(hands)) {
    const hand = hands[handKey(seat)];
    if (hand?.includes(cardId)) {
      return seat;
    }
  }
  return null;
}

function copyLastPlay(
  lastPlay: PresidentLastPlay | null,
): PresidentLastPlay | null {
  if (lastPlay === null) {
    return null;
  }
  return {
    seat: lastPlay.seat,
    cards: lastPlay.cards.slice(),
    rank: lastPlay.rank,
  };
}

function copyHands(hands: Record<string, string[]>): Record<string, string[]> {
  const copy: Record<string, string[]> = {};
  for (const key of Object.keys(hands)) {
    copy[key] = hands[key]?.slice() ?? [];
  }
  return copy;
}

/**
 * President, then Vice Pres when there is room, then Neutrals,
 * then Vice Scum, then Scum. A short table skips the vice titles.
 */
function rankTitle(place: number, total: number): string {
  if (place === 0) {
    return 'President';
  }
  if (place === total - 1) {
    return 'Scum';
  }
  if (total >= 4 && place === 1) {
    return 'Vice Pres';
  }
  if (total >= 4 && place === total - 2) {
    return 'Vice Scum';
  }
  return 'Neutral';
}

function scoredOrder(order: readonly number[]): PresidentRankEntry[] {
  const total = order.length;
  const entries: PresidentRankEntry[] = [];
  for (let place = 0; place < total; place += 1) {
    const seat = order[place];
    if (seat === undefined) {
      continue;
    }
    entries.push({
      seat,
      title: rankTitle(place, total),
      score: total - place,
    });
  }
  return entries;
}

function finishedState(
  hands: Record<string, string[]>,
  finishOrder: readonly number[],
  playPile: readonly string[],
  lastPlay: PresidentLastPlay | null,
): PresidentState {
  const order = finishOrder.slice();
  for (const seat of seatsWithCards(hands)) {
    if (!order.includes(seat)) {
      order.push(seat);
    }
  }
  return {
    phase: 'finished',
    hands,
    playPile: playPile.slice(),
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: null,
    lastPlay: copyLastPlay(lastPlay),
    openingLead: false,
    finishOrder: order,
    rankOrder: scoredOrder(order),
    winnerSeatIndex: order[0] ?? null,
  };
}

function leadState(
  hands: Record<string, string[]>,
  finishOrder: readonly number[],
  turnSeatIndex: number | null,
): PresidentState {
  return {
    phase: 'play',
    hands,
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex,
    lastPlay: null,
    openingLead: false,
    finishOrder: finishOrder.slice(),
    rankOrder: [],
    winnerSeatIndex: null,
  };
}

function dealState(players: GameSeat[], tableId: string): PresidentState {
  const ordered = seatsInOrder(players);
  if (ordered.length === 0) {
    return notStartedState();
  }
  const deck = shuffleDeck(freshDeck(), tableId);
  const hands: Record<string, string[]> = {};
  for (const seat of ordered) {
    hands[handKey(seat.seatIndex)] = [];
  }
  for (let i = 0; i < deck.length; i += 1) {
    const seat = ordered[i % ordered.length];
    hands[handKey(seat.seatIndex)].push(deck[i]);
  }
  const starter = seatHoldingCard(hands, OPENING_CARD) ?? ordered[0].seatIndex;
  return {
    phase: 'play',
    hands,
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: starter,
    lastPlay: null,
    openingLead: seatHoldingCard(hands, OPENING_CARD) !== null,
    finishOrder: [],
    rankOrder: [],
    winnerSeatIndex: null,
  };
}

function takeCards(
  hand: readonly string[],
  cards: readonly string[],
): string[] {
  const remaining = hand.slice();
  const seen = new Set<string>();
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

function sameRank(cards: readonly string[]): PresidentRank {
  if (cards.length < 1 || cards.length > 4) {
    throw new Error('Invalid intent');
  }
  let rank: PresidentRank | null = null;
  for (const card of cards) {
    const cardRank = presidentRankOf(card);
    if (cardRank === null) {
      throw new Error('Invalid intent');
    }
    if (rank === null) {
      rank = cardRank;
    } else if (cardRank !== rank) {
      throw new Error('Invalid intent');
    }
  }
  if (rank === null) {
    throw new Error('Invalid intent');
  }
  return rank;
}

/** Players besides the last one to play must pass before the trick clears. */
function passesNeeded(
  hands: Record<string, string[]>,
  lastSeat: number,
): number {
  let count = 0;
  for (const seat of seatsWithCards(hands)) {
    if (seat !== lastSeat) {
      count += 1;
    }
  }
  return count;
}

function handEnded(
  hands: Record<string, string[]>,
  finishOrder: readonly number[],
): boolean {
  return seatsWithCards(hands).length <= 1 && finishOrder.length > 0;
}

function applyPlay(
  state: PresidentState,
  cards: string[],
  seatIndex: number,
): PresidentState {
  const rank = sameRank(cards);
  const key = handKey(seatIndex);
  const hand = state.hands[key];
  if (!hand) {
    throw new Error('Invalid intent');
  }
  const remaining = takeCards(hand, cards);
  if (state.openingLead && !cards.includes(OPENING_CARD)) {
    throw new Error('Include the 3 of clubs');
  }
  if (state.currentCount > 0) {
    if (state.currentRank === null) {
      throw new Error('Invalid table state');
    }
    if (cards.length !== state.currentCount) {
      throw new Error('Match the count');
    }
    if (rankIndex(rank) <= rankIndex(state.currentRank)) {
      throw new Error('Play a higher rank');
    }
  }
  const hands: Record<string, string[]> = {
    ...state.hands,
    [key]: remaining,
  };
  const finishOrder = state.finishOrder.slice();
  if (remaining.length === 0 && !finishOrder.includes(seatIndex)) {
    finishOrder.push(seatIndex);
  }
  const playPile = state.playPile.concat(cards);
  const lastPlay: PresidentLastPlay = {
    seat: seatIndex,
    cards: cards.slice(),
    rank,
  };
  if (handEnded(hands, finishOrder)) {
    return finishedState(hands, finishOrder, playPile, lastPlay);
  }
  // A two beats anything of that count and clears the trick.
  // A player alone at the table leads again instead of beating their own card.
  if (rank === '2' || passesNeeded(hands, seatIndex) === 0) {
    const turn =
      remaining.length > 0 ? seatIndex : nextHolding(hands, seatIndex);
    return leadState(hands, finishOrder, turn);
  }
  return {
    phase: 'play',
    hands,
    playPile,
    currentRank: rank,
    currentCount: cards.length,
    passes: 0,
    turnSeatIndex: nextHolding(hands, seatIndex),
    lastPlay,
    openingLead: false,
    finishOrder,
    rankOrder: [],
    winnerSeatIndex: null,
  };
}

function applyPass(state: PresidentState, seatIndex: number): PresidentState {
  if (state.currentCount === 0 || state.lastPlay === null) {
    throw new Error('You must play');
  }
  const passes = state.passes + 1;
  const needed = passesNeeded(state.hands, state.lastPlay.seat);
  if (needed === 0 || passes >= needed) {
    const leader = state.lastPlay.seat;
    const hand = state.hands[handKey(leader)];
    const turn =
      hand && hand.length > 0 ? leader : nextHolding(state.hands, leader);
    return leadState(state.hands, state.finishOrder, turn);
  }
  return {
    phase: 'play',
    hands: state.hands,
    playPile: state.playPile.slice(),
    currentRank: state.currentRank,
    currentCount: state.currentCount,
    passes,
    turnSeatIndex: nextHolding(state.hands, seatIndex),
    lastPlay: copyLastPlay(state.lastPlay),
    openingLead: false,
    finishOrder: state.finishOrder.slice(),
    rankOrder: [],
    winnerSeatIndex: null,
  };
}

function leaveSeat(state: PresidentState, seatIndex: number): PresidentState {
  const key = handKey(seatIndex);
  if (!(key in state.hands)) {
    return readPresidentState(state);
  }
  const hands = copyHands(state.hands);
  delete hands[key];
  const finishOrder = state.finishOrder.filter((seat) => seat !== seatIndex);
  let openingLead = state.openingLead;
  if (openingLead && seatHoldingCard(hands, OPENING_CARD) === null) {
    openingLead = false;
  }
  const lastWasLeader =
    state.lastPlay !== null && state.lastPlay.seat === seatIndex;
  if (seatsWithCards(hands).length <= 1) {
    return finishedState(hands, finishOrder, [], null);
  }
  let turnSeatIndex = state.turnSeatIndex;
  if (turnSeatIndex === seatIndex || turnSeatIndex === null || lastWasLeader) {
    turnSeatIndex = nextHolding(hands, seatIndex);
  }
  if (openingLead) {
    turnSeatIndex = seatHoldingCard(hands, OPENING_CARD) ?? turnSeatIndex;
  }
  if (lastWasLeader) {
    return {
      ...leadState(hands, finishOrder, turnSeatIndex),
      openingLead,
    };
  }
  return {
    phase: state.phase === 'finished' ? 'finished' : 'play',
    hands,
    playPile: state.playPile.slice(),
    currentRank: state.currentRank,
    currentCount: state.currentCount,
    passes: state.passes,
    turnSeatIndex,
    lastPlay: copyLastPlay(state.lastPlay),
    openingLead,
    finishOrder,
    rankOrder: state.phase === 'finished' ? scoredOrder(finishOrder) : [],
    winnerSeatIndex:
      state.phase === 'finished' ? (finishOrder[0] ?? null) : null,
  };
}

/**
 * President rules for gameType `president`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 * The hand ends when only one player still holds cards. That player is Scum.
 */
export const presidentRules = {
  initialState(players: GameSeat[], table: GameTable): PresidentState {
    if (players.length === 0) {
      return notStartedState();
    }
    return dealState(players, table.id);
  },
  applyIntent(
    prev: PresidentState,
    intent: PresidentIntent,
    ctx: IntentContext,
  ): PresidentState {
    const state = readPresidentState(prev);
    const action = readPresidentIntent(intent);
    if (state.phase !== 'play') {
      throw new Error('Invalid intent');
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'play') {
      return applyPlay(state, action.cards, ctx.seat.seatIndex);
    }
    return applyPass(state, ctx.seat.seatIndex);
  },
  eventNote(
    prev: PresidentState,
    intent: PresidentIntent,
    next: PresidentState,
    ctx: IntentContext,
  ): PresidentEventNote | null {
    void prev;
    const action = readPresidentIntent(intent);
    if (next.phase === 'finished') {
      const president = next.rankOrder[0]?.seat ?? ctx.seat.seatIndex;
      const scum = next.rankOrder[next.rankOrder.length - 1]?.seat ?? president;
      return { kind: 'finish', president, scum };
    }
    if (action.type === 'pass') {
      return { kind: 'pass', seat: ctx.seat.seatIndex };
    }
    const rank = action.cards[0] ? presidentRankOf(action.cards[0]) : null;
    if (rank === null) {
      return null;
    }
    return {
      kind: 'play',
      seat: ctx.seat.seatIndex,
      count: action.cards.length,
      rank,
    };
  },
  onPlayerJoin(prev: PresidentState, seat: GameSeat): PresidentState {
    void seat;
    return readPresidentState(prev);
  },
  onPlayerLeave(prev: PresidentState, seat: GameSeat): PresidentState {
    return leaveSeat(readPresidentState(prev), seat.seatIndex);
  },
} satisfies GameRules<PresidentState, PresidentIntent>;
