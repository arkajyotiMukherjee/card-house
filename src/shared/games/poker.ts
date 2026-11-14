import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Poker. Texas Hold'em, Omaha, and Oklahoma share this table. */
export const POKER_GAME_TYPE = 'poker' as const;

/**
 * How long a finished hand stays on the table before the next deal.
 * The 800ms bot beat is a separate delay.
 */
export const POKER_HAND_PAUSE_MS = 10_000;

export const POKER_VARIATIONS = ['holdem', 'omaha', 'oklahoma'] as const;

export const POKER_RANKS = [
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

export const POKER_SUITS = ['S', 'H', 'D', 'C'] as const;

const POKER_PHASES = ['lobby', 'play', 'finished'] as const;
const POKER_STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
const POKER_STEPS = ['discard', 'bet', 'runout'] as const;
const POKER_LIMITS = ['no-limit', 'pot-limit'] as const;
const POKER_ENDS = ['fold', 'showdown'] as const;

const RANK_SET: ReadonlySet<string> = new Set(POKER_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(POKER_SUITS);
const VARIATION_SET: ReadonlySet<string> = new Set(POKER_VARIATIONS);

export type PokerVariation = (typeof POKER_VARIATIONS)[number];
export type PokerRank = (typeof POKER_RANKS)[number];
export type PokerSuit = (typeof POKER_SUITS)[number];
export type PokerPhase = (typeof POKER_PHASES)[number];
export type PokerStreet = (typeof POKER_STREETS)[number];
export type PokerStep = (typeof POKER_STEPS)[number];
export type PokerLimit = (typeof POKER_LIMITS)[number];
export type PokerEnd = (typeof POKER_ENDS)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type PokerCardId = `${PokerRank}${PokerSuit}`;

export const POKER_STARTING_CHIPS = 1000;
export const POKER_SMALL_BLIND = 10;
export const POKER_BIG_BLIND = 20;

export const POKER_VARIATION_LABELS = {
  holdem: "Hold'em",
  omaha: 'Omaha',
  oklahoma: 'Oklahoma',
} as const satisfies Record<PokerVariation, string>;

const RANK_VALUE: Record<PokerRank, number> = {
  A: 14,
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
};

export interface PokerSeatState {
  chips: number;
  hole: string[];
  /** Chips this seat has put in on the current street. */
  streetBet: number;
  /** Chips this seat has put in this hand. Side pots are cut from this. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** True after a check or a call that already matched the current bet. */
  acted: boolean;
  /** Oklahoma still owes a hole-card discard this street. */
  mustDiscard: boolean;
}

export interface PokerPot {
  amount: number;
  eligible: number[];
}

export interface PokerHandRank {
  cards: string[];
  name: string;
  /** Compared lexicographically. A higher tuple wins. */
  score: number[];
}

export interface PokerState {
  phase: PokerPhase;
  variation: PokerVariation;
  street: PokerStreet;
  /** `discard` is Oklahoma's mandatory drop. `runout` deals one street with no bet. */
  step: PokerStep;
  /** Hands dealt at this table. The first deal is 1. */
  handNumber: number;
  deck: string[];
  board: string[];
  seats: Record<string, PokerSeatState>;
  order: number[];
  dealerSeatIndex: number | null;
  turnSeatIndex: number | null;
  currentBet: number;
  minRaise: number;
  /** Every chip committed this hand, including the current street. */
  pot: number;
  pots: PokerPot[];
  winnerSeatIndexes: number[];
  hands: Record<string, PokerHandRank>;
  end: PokerEnd | null;
  smallBlind: number;
  bigBlind: number;
  limit: PokerLimit;
}

export type PokerIntent =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'discard'; card: string };

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type PokerEventNote =
  | { kind: 'fold'; seat: number }
  | { kind: 'check'; seat: number }
  | { kind: 'call'; seat: number; amount: number }
  | { kind: 'bet'; seat: number; amount: number }
  | { kind: 'raise'; seat: number; amount: number }
  | { kind: 'discard'; seat: number }
  | { kind: 'finished'; end: PokerEnd; winners: number[] };

export const pokerGameDefinition = {
  gameType: POKER_GAME_TYPE,
  displayName: 'Poker',
  minPlayers: 2,
  maxPlayers: 8,
  howToPlay:
    "# Poker\n\nTexas Hold'em, Omaha, and Oklahoma share one table. Choose the variation when you create the table. Blinds are 10 and 20. Each player starts with 1000 chips.\n\n## Texas Hold'em\n\nTwo hole cards. The board is a flop of three, then the turn, then the river. At showdown you may use any mix of hole cards and community cards. Betting is no-limit.\n\n## Omaha\n\nFour hole cards. The board and the betting rounds match Hold'em. At showdown you must use exactly two hole cards and three community cards. Betting is pot-limit.\n\n## Oklahoma\n\nThe deal starts like Omaha, with four hole cards. Before betting on the flop, each player still in discards one hole card. Before betting on the turn, each player still in discards one more. Showdown uses the two remaining hole cards and exactly three community cards. Betting is pot-limit.\n\n## Betting\n\nThe button posts the small blind and the next seat posts the big blind. Those seats are marked SB and BB for the whole hand, including after a fold. On your turn you may fold, check, call, bet, or raise. Bet and Raise ask for an amount from the minimum through all-in. Call matches the current bet. The maximum button reads Pot max when the pot-limit ceiling is below your full stack, and All-in when your full stack is legal. Once all remaining opponents are all-in and calls are settled, live hands turn face up and the board runs out without extra checks. Oklahoma still requires its flop and turn discards. The hand ends when everyone else folds, or at showdown. The best hand wins. Side pots pay players who were all-in for less. After a fold win, any undealt community cards are revealed without changing the winner. The finished hand stays up so the winner and any showdown cards can be read, then the next hand deals while two or more players are still seated. A player with no chips sits out and can stay or leave.",
} satisfies GameDefinition;

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function isSeatIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function isVariation(value: unknown): value is PokerVariation {
  return typeof value === 'string' && VARIATION_SET.has(value);
}

function isPhase(value: unknown): value is PokerPhase {
  return (
    typeof value === 'string' &&
    (POKER_PHASES as readonly string[]).includes(value)
  );
}

function isStreet(value: unknown): value is PokerStreet {
  return (
    typeof value === 'string' &&
    (POKER_STREETS as readonly string[]).includes(value)
  );
}

function isStep(value: unknown): value is PokerStep {
  return (
    typeof value === 'string' &&
    (POKER_STEPS as readonly string[]).includes(value)
  );
}

function isLimit(value: unknown): value is PokerLimit {
  return (
    typeof value === 'string' &&
    (POKER_LIMITS as readonly string[]).includes(value)
  );
}

function isEnd(value: unknown): value is PokerEnd {
  return (
    typeof value === 'string' &&
    (POKER_ENDS as readonly string[]).includes(value)
  );
}

function isRank(value: unknown): value is PokerRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfPokerCard(card: string): PokerRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

export function suitOfPokerCard(card: string): PokerSuit | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return suit as PokerSuit;
}

function limitFor(variation: PokerVariation): PokerLimit {
  return variation === 'holdem' ? 'no-limit' : 'pot-limit';
}

function holeCount(variation: PokerVariation): number {
  return variation === 'holdem' ? 2 : 4;
}

export function variationFromStateJson(stateJson: string): PokerVariation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    return 'holdem';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'holdem';
  }
  if (!('variation' in parsed)) {
    return 'holdem';
  }
  const variation = parsed.variation;
  if (!isVariation(variation)) {
    throw new Error('Invalid table state');
  }
  return variation;
}

function readSeat(value: unknown): PokerSeatState {
  const record = asRecord(value, 'Invalid table state');
  if (
    !isCount(record.chips) ||
    !isStringArray(record.hole) ||
    !isCount(record.streetBet) ||
    !isCount(record.committed) ||
    typeof record.folded !== 'boolean' ||
    typeof record.allIn !== 'boolean' ||
    typeof record.acted !== 'boolean' ||
    typeof record.mustDiscard !== 'boolean'
  ) {
    throw new Error('Invalid table state');
  }
  return {
    chips: record.chips,
    hole: record.hole.slice(),
    streetBet: record.streetBet,
    committed: record.committed,
    folded: record.folded,
    allIn: record.allIn,
    acted: record.acted,
    mustDiscard: record.mustDiscard,
  };
}

function readHand(value: unknown): PokerHandRank {
  const record = asRecord(value, 'Invalid table state');
  if (
    !isStringArray(record.cards) ||
    typeof record.name !== 'string' ||
    !isNumberArray(record.score)
  ) {
    throw new Error('Invalid table state');
  }
  return {
    cards: record.cards.slice(),
    name: record.name,
    score: record.score.slice(),
  };
}

function readPot(value: unknown): PokerPot {
  const record = asRecord(value, 'Invalid table state');
  if (!isCount(record.amount) || !Array.isArray(record.eligible)) {
    throw new Error('Invalid table state');
  }
  const eligible: number[] = [];
  for (const seat of record.eligible) {
    if (!isSeatIndex(seat)) {
      throw new Error('Invalid table state');
    }
    eligible.push(seat);
  }
  return { amount: record.amount, eligible };
}

export function readPokerState(value: unknown): PokerState {
  const record = asRecord(value, 'Invalid table state');
  if (
    !isPhase(record.phase) ||
    !isVariation(record.variation) ||
    !isStreet(record.street) ||
    !isStep(record.step) ||
    !isStringArray(record.deck) ||
    !isStringArray(record.board) ||
    !Array.isArray(record.order) ||
    !isCount(record.currentBet) ||
    !isCount(record.minRaise) ||
    !isCount(record.pot) ||
    !Array.isArray(record.pots) ||
    !Array.isArray(record.winnerSeatIndexes) ||
    !isCount(record.smallBlind) ||
    !isCount(record.bigBlind) ||
    !isLimit(record.limit)
  ) {
    throw new Error('Invalid table state');
  }
  if (record.limit !== limitFor(record.variation)) {
    throw new Error('Invalid table state');
  }
  const dealer = record.dealerSeatIndex;
  const turn = record.turnSeatIndex;
  if (dealer !== null && !isSeatIndex(dealer)) {
    throw new Error('Invalid table state');
  }
  if (turn !== null && !isSeatIndex(turn)) {
    throw new Error('Invalid table state');
  }
  const end = record.end;
  if (end !== null && !isEnd(end)) {
    throw new Error('Invalid table state');
  }
  const seatsRecord = asRecord(record.seats, 'Invalid table state');
  const seats: Record<string, PokerSeatState> = {};
  for (const key of Object.keys(seatsRecord)) {
    seats[key] = readSeat(seatsRecord[key]);
  }
  const handsRecord = asRecord(record.hands, 'Invalid table state');
  const hands: Record<string, PokerHandRank> = {};
  for (const key of Object.keys(handsRecord)) {
    hands[key] = readHand(handsRecord[key]);
  }
  const order: number[] = [];
  for (const seat of record.order) {
    if (!isSeatIndex(seat)) {
      throw new Error('Invalid table state');
    }
    order.push(seat);
  }
  const winners: number[] = [];
  for (const seat of record.winnerSeatIndexes) {
    if (!isSeatIndex(seat)) {
      throw new Error('Invalid table state');
    }
    winners.push(seat);
  }
  return {
    phase: record.phase,
    variation: record.variation,
    street: record.street,
    step: record.step,
    handNumber: isCount(record.handNumber) ? record.handNumber : 1,
    deck: record.deck.slice(),
    board: record.board.slice(),
    seats,
    order,
    dealerSeatIndex: dealer,
    turnSeatIndex: turn,
    currentBet: record.currentBet,
    minRaise: record.minRaise,
    pot: record.pot,
    pots: record.pots.map(readPot),
    winnerSeatIndexes: winners,
    hands,
    end,
    smallBlind: record.smallBlind,
    bigBlind: record.bigBlind,
    limit: record.limit,
  };
}

export function readPokerIntent(value: unknown): PokerIntent {
  const record = asRecord(value, 'Invalid intent');
  if (
    record.type === 'fold' ||
    record.type === 'check' ||
    record.type === 'call'
  ) {
    return { type: record.type };
  }
  if (record.type === 'bet' || record.type === 'raise') {
    if (!isCount(record.amount) || record.amount <= 0) {
      throw new Error('Invalid intent');
    }
    return { type: record.type, amount: record.amount };
  }
  if (record.type === 'discard') {
    if (
      typeof record.card !== 'string' ||
      rankOfPokerCard(record.card) === null
    ) {
      throw new Error('Invalid intent');
    }
    return { type: 'discard', card: record.card };
  }
  throw new Error('Invalid intent');
}

export function readPokerEventNote(value: unknown): PokerEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind === 'fold' ||
    record.kind === 'check' ||
    record.kind === 'discard'
  ) {
    if (!isSeatIndex(record.seat)) {
      return null;
    }
    return { kind: record.kind, seat: record.seat };
  }
  if (
    record.kind === 'call' ||
    record.kind === 'bet' ||
    record.kind === 'raise'
  ) {
    if (!isSeatIndex(record.seat) || !isCount(record.amount)) {
      return null;
    }
    return { kind: record.kind, seat: record.seat, amount: record.amount };
  }
  if (record.kind === 'finished') {
    if (!isEnd(record.end) || !Array.isArray(record.winners)) {
      return null;
    }
    const winners: number[] = [];
    for (const seat of record.winners) {
      if (!isSeatIndex(seat)) {
        return null;
      }
      winners.push(seat);
    }
    return { kind: 'finished', end: record.end, winners };
  }
  return null;
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of POKER_SUITS) {
    for (const rank of POKER_RANKS) {
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

function shuffleDeck(
  deck: string[],
  tableId: string,
  handNumber = 1,
): string[] {
  const seedKey = handNumber <= 1 ? tableId : `${tableId}#${handNumber}`;
  const random = mulberry32(seedFromTableId(seedKey));
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

function seatKey(seatIndex: number): string {
  return String(seatIndex);
}

function emptySeat(): PokerSeatState {
  return {
    chips: POKER_STARTING_CHIPS,
    hole: [],
    streetBet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    mustDiscard: false,
  };
}

function lobbyState(variation: PokerVariation): PokerState {
  return {
    phase: 'lobby',
    variation,
    street: 'preflop',
    step: 'bet',
    handNumber: 0,
    deck: [],
    board: [],
    seats: {},
    order: [],
    dealerSeatIndex: null,
    turnSeatIndex: null,
    currentBet: 0,
    minRaise: POKER_BIG_BLIND,
    pot: 0,
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: POKER_SMALL_BLIND,
    bigBlind: POKER_BIG_BLIND,
    limit: limitFor(variation),
  };
}

function nextAfter(
  order: readonly number[],
  anchor: number,
  pred: (seatIndex: number) => boolean,
): number | null {
  const start = order.indexOf(anchor);
  if (start < 0) {
    return null;
  }
  for (let step = 1; step <= order.length; step += 1) {
    const index = order[(start + step) % order.length];
    if (index !== undefined && pred(index)) {
      return index;
    }
  }
  return null;
}

function blindSeats(
  order: readonly number[],
  dealer: number,
): {
  small: number;
  big: number;
} {
  const small =
    order.length === 2
      ? dealer
      : (nextAfter(order, dealer, () => true) ?? dealer);
  const big = nextAfter(order, small, () => true) ?? small;
  return { small, big };
}

/** Seats that posted the blinds for this hand. Null before the deal. */
export function pokerBlindSeats(
  state: PokerState,
): { small: number; big: number } | null {
  if (
    state.phase === 'lobby' ||
    state.dealerSeatIndex === null ||
    state.order.length < 2
  ) {
    return null;
  }
  return blindSeats(state.order, state.dealerSeatIndex);
}

/** `SB` or `BB` for the current hand. A fold does not clear it. */
export function pokerBlindMark(
  state: PokerState,
  seatIndex: number,
): 'SB' | 'BB' | null {
  const blinds = pokerBlindSeats(state);
  if (!blinds) {
    return null;
  }
  if (seatIndex === blinds.small) {
    return 'SB';
  }
  if (seatIndex === blinds.big) {
    return 'BB';
  }
  return null;
}

function aliveCount(state: PokerState): number {
  let count = 0;
  for (const index of state.order) {
    const seat = state.seats[seatKey(index)];
    if (seat && !seat.folded) {
      count += 1;
    }
  }
  return count;
}

/** A side pot needs another live player who can still put chips into it. */
function canContestBet(state: PokerState, seatIndex: number): boolean {
  return state.order.some((index) => {
    const other = state.seats[seatKey(index)];
    return (
      index !== seatIndex &&
      other &&
      !other.folded &&
      !other.allIn &&
      other.chips > 0
    );
  });
}

function needsAction(state: PokerState, seatIndex: number): boolean {
  const seat = state.seats[seatKey(seatIndex)];
  if (!seat || seat.folded || seat.allIn) {
    return false;
  }
  if (seat.streetBet < state.currentBet) {
    return true;
  }
  return canContestBet(state, seatIndex) && !seat.acted;
}

function firstToAct(
  state: PokerState,
  pred: (seatIndex: number) => boolean,
): number | null {
  const anchor =
    state.street === 'preflop'
      ? blindSeats(state.order, state.dealerSeatIndex ?? 0).big
      : state.dealerSeatIndex;
  if (anchor === null) {
    return null;
  }
  return nextAfter(state.order, anchor, pred);
}

function postChips(
  seat: PokerSeatState,
  amount: number,
  state: PokerState,
): number {
  const pay = Math.min(amount, seat.chips);
  seat.chips -= pay;
  seat.streetBet += pay;
  seat.committed += pay;
  state.pot += pay;
  if (seat.chips === 0) {
    seat.allIn = true;
  }
  return pay;
}

function dealHole(state: PokerState, count: number): void {
  const dealer = state.dealerSeatIndex ?? state.order[0] ?? 0;
  for (let round = 0; round < count; round += 1) {
    const start = nextAfter(state.order, dealer, () => true);
    if (start === null) {
      return;
    }
    const startAt = state.order.indexOf(start);
    for (let step = 0; step < state.order.length; step += 1) {
      const index = state.order[(startAt + step) % state.order.length];
      const card = state.deck.shift();
      const seat =
        index === undefined ? undefined : state.seats[seatKey(index)];
      if (!card || !seat) {
        throw new Error('Invalid table state');
      }
      seat.hole.push(card);
    }
  }
}

function openingDeal(players: GameSeat[], table: GameTable): PokerState {
  const ordered = seatsInOrder(players);
  const variation = variationFromStateJson(table.stateJson);
  if (ordered.length < pokerGameDefinition.minPlayers) {
    return lobbyState(variation);
  }
  const holes = holeCount(variation);
  if (ordered.length * holes + 5 > 52) {
    throw new Error('Invalid table state');
  }
  const order = ordered.map((seat) => seat.seatIndex);
  const dealer = order[0] ?? 0;
  const state = lobbyState(variation);
  state.phase = 'play';
  state.handNumber = 1;
  state.order = order;
  state.dealerSeatIndex = dealer;
  state.deck = shuffleDeck(freshDeck(), table.id, 1);
  for (const seat of ordered) {
    state.seats[seatKey(seat.seatIndex)] = emptySeat();
  }
  dealHole(state, holes);
  const blinds = blindSeats(order, dealer);
  const small = state.seats[seatKey(blinds.small)];
  const big = state.seats[seatKey(blinds.big)];
  if (!small || !big) {
    throw new Error('Invalid table state');
  }
  postChips(small, state.smallBlind, state);
  postChips(big, state.bigBlind, state);
  state.currentBet = big.streetBet;
  state.minRaise = state.bigBlind;
  const turn = firstToAct(state, (index) => needsAction(state, index));
  state.turnSeatIndex = turn;
  if (turn === null) {
    state.step = aliveCount(state) <= 1 ? 'bet' : 'runout';
    if (aliveCount(state) <= 1) {
      return awardFold(state);
    }
  }
  return state;
}

function combinations(items: readonly string[], count: number): string[][] {
  if (count === 0) {
    return [[]];
  }
  if (items.length < count) {
    return [];
  }
  const head = items[0];
  const tail = items.slice(1);
  if (head === undefined) {
    return [];
  }
  const withHead = combinations(tail, count - 1).map((row) => [head, ...row]);
  return withHead.concat(combinations(tail, count));
}

function rankValue(card: string): number {
  const rank = rankOfPokerCard(card);
  if (rank === null) {
    throw new Error('Invalid table state');
  }
  return RANK_VALUE[rank];
}

function straightHigh(ranksDesc: readonly number[]): number | null {
  const unique: number[] = [];
  for (const rank of ranksDesc) {
    if (!unique.includes(rank)) {
      unique.push(rank);
    }
  }
  if (unique.length !== 5) {
    return null;
  }
  const high = unique[0] ?? 0;
  let run = true;
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] !== high - index) {
      run = false;
    }
  }
  if (run) {
    return high;
  }
  if (unique.join(',') === '14,5,4,3,2') {
    return 5;
  }
  return null;
}

function rankFive(cards: readonly string[]): PokerHandRank {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map((card) => suitOfPokerCard(card));
  const flush = suits.every((suit) => suit !== null && suit === suits[0]);
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const high = straightHigh(ranks);
  const five = cards.slice();
  if (flush && high !== null) {
    return {
      cards: five,
      name: high === 14 ? 'royal flush' : 'straight flush',
      score: [8, high],
    };
  }
  const primary = groups[0];
  const secondary = groups[1];
  if (primary && primary[1] === 4) {
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return {
      cards: five,
      name: 'four of a kind',
      score: [7, primary[0], kicker],
    };
  }
  if (primary && secondary && primary[1] === 3 && secondary[1] === 2) {
    return {
      cards: five,
      name: 'full house',
      score: [6, primary[0], secondary[0]],
    };
  }
  if (flush) {
    return { cards: five, name: 'flush', score: [5, ...ranks] };
  }
  if (high !== null) {
    return { cards: five, name: 'straight', score: [4, high] };
  }
  if (primary && primary[1] === 3) {
    const kickers = groups
      .filter((group) => group[1] === 1)
      .map((group) => group[0]);
    return {
      cards: five,
      name: 'three of a kind',
      score: [3, primary[0], ...kickers],
    };
  }
  if (primary && secondary && primary[1] === 2 && secondary[1] === 2) {
    const highPair = Math.max(primary[0], secondary[0]);
    const lowPair = Math.min(primary[0], secondary[0]);
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return {
      cards: five,
      name: 'two pair',
      score: [2, highPair, lowPair, kicker],
    };
  }
  if (primary && primary[1] === 2) {
    const kickers = groups
      .filter((group) => group[1] === 1)
      .map((group) => group[0]);
    return {
      cards: five,
      name: 'one pair',
      score: [1, primary[0], ...kickers],
    };
  }
  return { cards: five, name: 'high card', score: [0, ...ranks] };
}

export function comparePokerScores(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function betterHand(
  current: PokerHandRank | null,
  next: PokerHandRank,
): PokerHandRank {
  if (current === null || comparePokerScores(next.score, current.score) > 0) {
    return next;
  }
  return current;
}

/**
 * Best five-card hand for the variation.
 * Hold'em may use any mix. Omaha and Oklahoma use exactly two hole cards
 * and three community cards.
 */
export function bestPokerHand(
  variation: PokerVariation,
  hole: readonly string[],
  board: readonly string[],
): PokerHandRank {
  let best: PokerHandRank | null = null;
  if (variation === 'holdem') {
    const pool = [...hole, ...board];
    for (const five of combinations(pool, 5)) {
      best = betterHand(best, rankFive(five));
    }
  } else {
    for (const pocket of combinations(hole, 2)) {
      for (const community of combinations(board, 3)) {
        best = betterHand(best, rankFive([...pocket, ...community]));
      }
    }
  }
  if (best === null) {
    throw new Error('Invalid table state');
  }
  return best;
}

function requireSeat(state: PokerState, seatIndex: number): PokerSeatState {
  const seat = state.seats[seatKey(seatIndex)];
  if (!seat || seat.folded) {
    throw new Error('Invalid intent');
  }
  return seat;
}

/**
 * Pot-limit ceiling for the street bet this seat may make.
 * The call is counted in the pot, then the raise may be that pot again.
 */
export function potLimitCeiling(state: PokerState, seatIndex: number): number {
  const seat = state.seats[seatKey(seatIndex)];
  const streetBet = seat?.streetBet ?? 0;
  const toCall = Math.max(0, state.currentBet - streetBet);
  return state.currentBet + state.pot + toCall;
}

export function pokerCallAmount(state: PokerState, seatIndex: number): number {
  const seat = state.seats[seatKey(seatIndex)];
  if (!seat) {
    return 0;
  }
  return Math.min(seat.chips, Math.max(0, state.currentBet - seat.streetBet));
}

function acting(state: PokerState, seatIndex: number): boolean {
  return state.phase === 'play' && state.turnSeatIndex === seatIndex;
}

export function pokerCanFold(state: PokerState, seatIndex: number): boolean {
  const seat = state.seats[seatKey(seatIndex)];
  return Boolean(
    seat && acting(state, seatIndex) && !seat.folded && !seat.allIn,
  );
}

export function pokerCanCheck(state: PokerState, seatIndex: number): boolean {
  const seat = state.seats[seatKey(seatIndex)];
  return Boolean(
    seat &&
    acting(state, seatIndex) &&
    state.step === 'bet' &&
    !seat.folded &&
    !seat.allIn &&
    seat.streetBet === state.currentBet,
  );
}

export function pokerCanCall(state: PokerState, seatIndex: number): boolean {
  const seat = state.seats[seatKey(seatIndex)];
  return Boolean(
    seat &&
    acting(state, seatIndex) &&
    state.step === 'bet' &&
    !seat.folded &&
    !seat.allIn &&
    state.currentBet > seat.streetBet &&
    seat.chips > 0,
  );
}

/** Opening bet, as the street total. `null` when a bet is not legal. */
export function pokerBetTo(
  state: PokerState,
  seatIndex: number,
): number | null {
  const seat = state.seats[seatKey(seatIndex)];
  if (
    !seat ||
    !acting(state, seatIndex) ||
    state.step !== 'bet' ||
    seat.folded ||
    seat.allIn ||
    state.currentBet !== 0 ||
    !canContestBet(state, seatIndex) ||
    seat.chips <= 0
  ) {
    return null;
  }
  let amount = Math.min(state.bigBlind, seat.chips);
  if (state.limit === 'pot-limit') {
    const ceiling = potLimitCeiling(state, seatIndex);
    if (ceiling <= 0) {
      return null;
    }
    amount = Math.min(amount, ceiling);
  }
  if (amount <= 0) {
    return null;
  }
  return amount;
}

/** Minimum legal raise, as the new street total. `null` when a raise is not legal. */
export function pokerRaiseTo(
  state: PokerState,
  seatIndex: number,
): number | null {
  const seat = state.seats[seatKey(seatIndex)];
  if (
    !seat ||
    !acting(state, seatIndex) ||
    state.step !== 'bet' ||
    seat.folded ||
    seat.allIn ||
    state.currentBet <= 0 ||
    !canContestBet(state, seatIndex)
  ) {
    return null;
  }
  const toCall = state.currentBet - seat.streetBet;
  if (seat.chips <= toCall) {
    return null;
  }
  let target = state.currentBet + state.minRaise;
  const maxTo = seat.streetBet + seat.chips;
  if (state.limit === 'pot-limit') {
    target = Math.min(target, potLimitCeiling(state, seatIndex));
  }
  if (target > maxTo) {
    target = maxTo;
  }
  if (target <= state.currentBet) {
    return null;
  }
  const short = target < state.currentBet + state.minRaise;
  if (short && target < maxTo) {
    return null;
  }
  if (
    state.limit === 'pot-limit' &&
    target > potLimitCeiling(state, seatIndex)
  ) {
    return null;
  }
  return target;
}

export interface PokerStakeRange {
  min: number;
  max: number;
}

function cappedStreetTotal(
  state: PokerState,
  seatIndex: number,
): number | null {
  const seat = state.seats[seatKey(seatIndex)];
  if (!seat) {
    return null;
  }
  let max = seat.streetBet + seat.chips;
  if (state.limit === 'pot-limit') {
    max = Math.min(max, potLimitCeiling(state, seatIndex));
  }
  return max;
}

/**
 * Legal opening bets, as street totals.
 * The minimum is the big blind, or all-in when the stack is shorter.
 * The maximum is all-in, capped by the pot in a pot-limit game.
 */
export function pokerBetRange(
  state: PokerState,
  seatIndex: number,
): PokerStakeRange | null {
  const min = pokerBetTo(state, seatIndex);
  const seat = state.seats[seatKey(seatIndex)];
  const max = cappedStreetTotal(state, seatIndex);
  if (min === null || !seat || max === null || max < min) {
    return null;
  }
  const allIn = seat.streetBet + seat.chips;
  if (min < state.bigBlind && min !== allIn) {
    return null;
  }
  return { min, max };
}

/**
 * Legal raises, as the new street total.
 * The minimum is a full min-raise, or a short all-in when that is all the stack can post.
 * The maximum is all-in, capped by the pot in a pot-limit game.
 */
export function pokerRaiseRange(
  state: PokerState,
  seatIndex: number,
): PokerStakeRange | null {
  const min = pokerRaiseTo(state, seatIndex);
  const max = cappedStreetTotal(state, seatIndex);
  if (min === null || max === null || max < min) {
    return null;
  }
  return { min, max };
}

export function pokerCanDiscard(state: PokerState, seatIndex: number): boolean {
  const seat = state.seats[seatKey(seatIndex)];
  return Boolean(
    seat &&
    acting(state, seatIndex) &&
    state.variation === 'oklahoma' &&
    state.step === 'discard' &&
    !seat.folded &&
    seat.mustDiscard &&
    seat.hole.length > 0,
  );
}

function awardFold(state: PokerState): PokerState {
  const winner = state.order.find((index) => {
    const seat = state.seats[seatKey(index)];
    return seat !== undefined && !seat.folded;
  });
  if (winner === undefined) {
    throw new Error('Invalid table state');
  }
  const seat = state.seats[seatKey(winner)];
  if (!seat) {
    throw new Error('Invalid table state');
  }
  takeBoard(state, Math.max(0, 5 - state.board.length));
  seat.chips += state.pot;
  state.phase = 'finished';
  state.end = 'fold';
  state.turnSeatIndex = null;
  state.winnerSeatIndexes = [winner];
  state.step = 'bet';
  return state;
}

function buildPots(state: PokerState): PokerPot[] {
  const levels = state.order.map((index) => {
    const seat = state.seats[seatKey(index)];
    return {
      index,
      committed: seat?.committed ?? 0,
      folded: seat?.folded ?? true,
    };
  });
  const pots: PokerPot[] = [];
  let orphan = 0;
  while (levels.some((level) => level.committed > 0)) {
    const live = levels.filter((level) => level.committed > 0);
    const slice = Math.min(...live.map((level) => level.committed));
    const eligible = live
      .filter((level) => !level.folded)
      .map((level) => level.index);
    const amount = slice * live.length;
    if (eligible.length === 0) {
      orphan += amount;
    } else {
      pots.push({ amount: amount + orphan, eligible });
      orphan = 0;
    }
    for (const level of live) {
      level.committed -= slice;
    }
  }
  if (orphan > 0 && pots.length > 0) {
    const last = pots[pots.length - 1];
    if (last) {
      last.amount += orphan;
    }
  }
  return pots;
}

function oddChips(
  state: PokerState,
  winners: readonly number[],
  extra: number,
  awards: Map<number, number>,
): void {
  const dealer = state.dealerSeatIndex;
  if (dealer === null || extra <= 0) {
    return;
  }
  const start = state.order.indexOf(dealer);
  if (start < 0) {
    return;
  }
  let left = extra;
  for (let step = 1; step <= state.order.length && left > 0; step += 1) {
    const index = state.order[(start + step) % state.order.length];
    if (index !== undefined && winners.includes(index)) {
      awards.set(index, (awards.get(index) ?? 0) + 1);
      left -= 1;
    }
  }
}

function showdown(state: PokerState): PokerState {
  for (const index of state.order) {
    const seat = state.seats[seatKey(index)];
    if (!seat || seat.folded) {
      continue;
    }
    state.hands[seatKey(index)] = bestPokerHand(
      state.variation,
      seat.hole,
      state.board,
    );
  }
  const pots = buildPots(state);
  state.pots = pots;
  const awards = new Map<number, number>();
  for (const pot of pots) {
    let best: number[] | null = null;
    for (const index of pot.eligible) {
      const score = state.hands[seatKey(index)]?.score;
      if (!score) {
        continue;
      }
      if (best === null || comparePokerScores(score, best) > 0) {
        best = score;
      }
    }
    if (best === null) {
      continue;
    }
    const winners = pot.eligible.filter((index) => {
      const score = state.hands[seatKey(index)]?.score;
      return score !== undefined && comparePokerScores(score, best) === 0;
    });
    if (winners.length === 0) {
      continue;
    }
    const share = Math.floor(pot.amount / winners.length);
    for (const index of winners) {
      awards.set(index, (awards.get(index) ?? 0) + share);
    }
    oddChips(state, winners, pot.amount % winners.length, awards);
  }
  for (const [index, amount] of awards) {
    const seat = state.seats[seatKey(index)];
    if (seat) {
      seat.chips += amount;
    }
  }
  state.winnerSeatIndexes = [...awards.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([index]) => index)
    .sort((a, b) => a - b);
  state.phase = 'finished';
  state.end = 'showdown';
  state.turnSeatIndex = null;
  state.step = 'bet';
  return state;
}

function takeBoard(state: PokerState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const card = state.deck.shift();
    if (!card) {
      throw new Error('Invalid table state');
    }
    state.board.push(card);
  }
}

function resetStreet(state: PokerState): void {
  for (const index of state.order) {
    const seat = state.seats[seatKey(index)];
    if (!seat) {
      continue;
    }
    seat.streetBet = 0;
    seat.acted = false;
    seat.mustDiscard = false;
  }
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
}

function openBetting(state: PokerState): PokerState {
  state.step = 'bet';
  for (const index of state.order) {
    const seat = state.seats[seatKey(index)];
    if (seat) {
      seat.mustDiscard = false;
    }
  }
  const turn = firstToAct(state, (index) => needsAction(state, index));
  if (turn === null) {
    state.turnSeatIndex = null;
    state.step = 'runout';
    return state;
  }
  state.turnSeatIndex = turn;
  return state;
}

function dealNext(state: PokerState): PokerState {
  if (aliveCount(state) <= 1) {
    return awardFold(state);
  }
  if (state.street === 'river') {
    return showdown(state);
  }
  takeBoard(state, state.street === 'preflop' ? 3 : 1);
  state.street =
    state.street === 'preflop'
      ? 'flop'
      : state.street === 'flop'
        ? 'turn'
        : 'river';
  resetStreet(state);
  if (
    state.variation === 'oklahoma' &&
    (state.street === 'flop' || state.street === 'turn')
  ) {
    for (const index of state.order) {
      const seat = state.seats[seatKey(index)];
      if (seat && !seat.folded) {
        seat.mustDiscard = true;
      }
    }
    state.step = 'discard';
    const turn = firstToAct(state, (index) => {
      const seat = state.seats[seatKey(index)];
      return Boolean(seat && !seat.folded && seat.mustDiscard);
    });
    if (turn === null) {
      return awardFold(state);
    }
    state.turnSeatIndex = turn;
    return state;
  }
  return openBetting(state);
}

function continueAction(state: PokerState, actor: number): PokerState {
  if (aliveCount(state) <= 1) {
    return awardFold(state);
  }
  if (state.step === 'discard') {
    const next = nextAfter(state.order, actor, (index) => {
      const seat = state.seats[seatKey(index)];
      return Boolean(seat && !seat.folded && seat.mustDiscard);
    });
    if (next !== null) {
      state.turnSeatIndex = next;
      return state;
    }
    return openBetting(state);
  }
  const next = nextAfter(state.order, actor, (index) =>
    needsAction(state, index),
  );
  if (next !== null) {
    state.turnSeatIndex = next;
    return state;
  }
  return dealNext(state);
}

function applyFold(state: PokerState, seatIndex: number): PokerState {
  const seat = requireSeat(state, seatIndex);
  if (seat.allIn) {
    throw new Error('Invalid intent');
  }
  seat.folded = true;
  seat.acted = true;
  seat.mustDiscard = false;
  return continueAction(state, seatIndex);
}

function applyCheck(state: PokerState, seatIndex: number): PokerState {
  if (state.step !== 'bet') {
    throw new Error('Invalid intent');
  }
  const seat = requireSeat(state, seatIndex);
  if (seat.allIn || seat.streetBet !== state.currentBet) {
    throw new Error('Invalid intent');
  }
  seat.acted = true;
  return continueAction(state, seatIndex);
}

function applyCall(state: PokerState, seatIndex: number): PokerState {
  if (state.step !== 'bet') {
    throw new Error('Invalid intent');
  }
  const seat = requireSeat(state, seatIndex);
  const toCall = state.currentBet - seat.streetBet;
  if (seat.allIn || toCall <= 0 || seat.chips <= 0) {
    throw new Error('Invalid intent');
  }
  postChips(seat, toCall, state);
  seat.acted = true;
  return continueAction(state, seatIndex);
}

function applyBet(
  state: PokerState,
  seatIndex: number,
  amount: number,
): PokerState {
  if (state.step !== 'bet' || state.currentBet !== 0) {
    throw new Error('Invalid intent');
  }
  const seat = requireSeat(state, seatIndex);
  if (
    seat.allIn ||
    !canContestBet(state, seatIndex) ||
    amount <= seat.streetBet
  ) {
    throw new Error('Invalid intent');
  }
  const add = amount - seat.streetBet;
  if (add > seat.chips) {
    throw new Error('Invalid intent');
  }
  const allIn = add === seat.chips;
  if (!allIn && amount < state.bigBlind) {
    throw new Error('Invalid intent');
  }
  if (
    state.limit === 'pot-limit' &&
    amount > potLimitCeiling(state, seatIndex)
  ) {
    throw new Error('Invalid intent');
  }
  postChips(seat, add, state);
  state.currentBet = seat.streetBet;
  state.minRaise = Math.max(state.bigBlind, amount);
  seat.acted = true;
  return continueAction(state, seatIndex);
}

function applyRaise(
  state: PokerState,
  seatIndex: number,
  amount: number,
): PokerState {
  if (state.step !== 'bet' || state.currentBet <= 0) {
    throw new Error('Invalid intent');
  }
  const seat = requireSeat(state, seatIndex);
  if (
    seat.allIn ||
    !canContestBet(state, seatIndex) ||
    amount <= state.currentBet
  ) {
    throw new Error('Invalid intent');
  }
  const add = amount - seat.streetBet;
  if (add > seat.chips) {
    throw new Error('Invalid intent');
  }
  const allIn = add === seat.chips;
  const raiseSize = amount - state.currentBet;
  if (!allIn && raiseSize < state.minRaise) {
    throw new Error('Invalid intent');
  }
  if (
    state.limit === 'pot-limit' &&
    amount > potLimitCeiling(state, seatIndex)
  ) {
    throw new Error('Invalid intent');
  }
  const full = raiseSize >= state.minRaise;
  postChips(seat, add, state);
  if (full) {
    state.minRaise = raiseSize;
  }
  state.currentBet = Math.max(state.currentBet, seat.streetBet);
  seat.acted = true;
  return continueAction(state, seatIndex);
}

function applyDiscard(
  state: PokerState,
  seatIndex: number,
  card: string,
): PokerState {
  if (state.variation !== 'oklahoma' || state.step !== 'discard') {
    throw new Error('Invalid intent');
  }
  const seat = requireSeat(state, seatIndex);
  if (!seat.mustDiscard) {
    throw new Error('Invalid intent');
  }
  const at = seat.hole.indexOf(card);
  if (at < 0) {
    throw new Error('Invalid intent');
  }
  seat.hole = seat.hole.filter((_, index) => index !== at);
  seat.mustDiscard = false;
  return continueAction(state, seatIndex);
}

/**
 * Hole cards the table may see.
 * Show live hands as soon as all-in betting closes, and at showdown.
 * Folded and uncalled winning hands stay private.
 */
export function pokerHoleFaceUp(state: PokerState, seatIndex: number): boolean {
  const showdown = state.phase === 'finished' && state.end === 'showdown';
  const locked =
    state.phase === 'play' &&
    aliveCount(state) > 1 &&
    state.order.every((index) => {
      const row = state.seats[seatKey(index)];
      return (
        !row ||
        row.folded ||
        row.allIn ||
        (!canContestBet(state, index) && row.streetBet >= state.currentBet)
      );
    });
  const seat = state.seats[seatKey(seatIndex)];
  return Boolean((showdown || locked) && seat && !seat.folded);
}

function fundedSeats(state: PokerState, seated: readonly number[]): number[] {
  const live: number[] = [];
  for (const index of seated) {
    const known = state.seats[seatKey(index)];
    const chips = known ? known.chips : POKER_STARTING_CHIPS;
    if (chips > 0) {
      live.push(index);
    }
  }
  return live;
}

/** What the table should publish next, without applying it. */
export function pokerAdvanceKind(
  state: PokerState,
  seated: readonly number[],
): 'street' | 'hand' | null {
  if (state.phase === 'play' && state.step === 'runout') {
    return 'street';
  }
  if (state.phase !== 'finished' || seated.length < 2) {
    return null;
  }
  if (fundedSeats(state, seated).length < 2) {
    return null;
  }
  return 'hand';
}

function nextButton(
  previousOrder: readonly number[],
  dealer: number | null,
  live: readonly number[],
): number {
  const liveSet = new Set(live);
  if (dealer !== null) {
    const start = previousOrder.indexOf(dealer);
    if (start >= 0) {
      for (let step = 1; step <= previousOrder.length; step += 1) {
        const index = previousOrder[(start + step) % previousOrder.length];
        if (index !== undefined && liveSet.has(index)) {
          return index;
        }
      }
    }
  }
  return live[0] ?? 0;
}

function dealNextHand(
  prev: PokerState,
  table: GameTable,
  seated: readonly number[],
): PokerState {
  const live = fundedSeats(prev, seated);
  if (seated.length < 2 || live.length < 2) {
    return prev;
  }
  const handNumber = (prev.handNumber || 1) + 1;
  const dealer = nextButton(prev.order, prev.dealerSeatIndex, live);
  const state = lobbyState(prev.variation);
  state.phase = 'play';
  state.handNumber = handNumber;
  state.order = live.slice();
  state.dealerSeatIndex = dealer;
  state.deck = shuffleDeck(freshDeck(), table.id, handNumber);
  for (const index of seated) {
    const previous = prev.seats[seatKey(index)];
    const chips = previous ? previous.chips : POKER_STARTING_CHIPS;
    const row = emptySeat();
    row.chips = chips;
    if (chips <= 0) {
      row.folded = true;
    }
    state.seats[seatKey(index)] = row;
  }
  dealHole(state, holeCount(state.variation));
  const blinds = blindSeats(live, dealer);
  const small = state.seats[seatKey(blinds.small)];
  const big = state.seats[seatKey(blinds.big)];
  if (!small || !big) {
    throw new Error('Invalid table state');
  }
  postChips(small, state.smallBlind, state);
  postChips(big, state.bigBlind, state);
  state.currentBet = big.streetBet;
  state.minRaise = state.bigBlind;
  const turn = firstToAct(state, (index) => needsAction(state, index));
  state.turnSeatIndex = turn;
  if (turn === null) {
    if (aliveCount(state) <= 1) {
      return awardFold(state);
    }
    state.step = 'runout';
  }
  return state;
}

/**
 * One automatic step. A runout deals a single street. A finished hand
 * deals the next hand for everyone still seated who can post.
 */
export function advancePoker(
  prev: PokerState,
  table: GameTable,
  seated: readonly number[],
): PokerState {
  const state = readPokerState(prev);
  const kind = pokerAdvanceKind(state, seated);
  if (kind === 'street') {
    return dealNext(state);
  }
  if (kind === 'hand') {
    return dealNextHand(state, table, seated);
  }
  return state;
}

/** A seat that left folds out of the current hand and keeps their chips. */
export function pokerSeatLeft(prev: PokerState, seatIndex: number): PokerState {
  const state = readPokerState(prev);
  const seat = state.seats[seatKey(seatIndex)];
  if (!seat || state.phase !== 'play' || seat.folded || seat.allIn) {
    return state;
  }
  seat.folded = true;
  seat.acted = true;
  seat.mustDiscard = false;
  if (state.turnSeatIndex === seatIndex) {
    return continueAction(state, seatIndex);
  }
  if (aliveCount(state) <= 1) {
    return awardFold(state);
  }
  return state;
}

/**
 * Poker rules for gameType `poker`.
 * `initialState([], table)` waits in the lobby.
 * The variation is read from `table.stateJson` (`holdem` when it is absent).
 */
export const pokerRules = {
  initialState(players: GameSeat[], table: GameTable): PokerState {
    if (players.length === 0) {
      return lobbyState(variationFromStateJson(table.stateJson));
    }
    return openingDeal(players, table);
  },
  applyIntent(
    prev: PokerState,
    intent: PokerIntent,
    ctx: IntentContext,
  ): PokerState {
    const state = readPokerState(prev);
    const action = readPokerIntent(intent);
    if (state.phase !== 'play') {
      throw new Error('Invalid intent');
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    const seatIndex = ctx.seat.seatIndex;
    if (action.type === 'fold') {
      return applyFold(state, seatIndex);
    }
    if (action.type === 'check') {
      return applyCheck(state, seatIndex);
    }
    if (action.type === 'call') {
      return applyCall(state, seatIndex);
    }
    if (action.type === 'bet') {
      return applyBet(state, seatIndex, action.amount);
    }
    if (action.type === 'raise') {
      return applyRaise(state, seatIndex, action.amount);
    }
    return applyDiscard(state, seatIndex, action.card);
  },
  eventNote(
    prev: PokerState,
    intent: PokerIntent,
    next: PokerState,
    ctx: IntentContext,
  ): PokerEventNote | null {
    const before = readPokerState(prev);
    const action = readPokerIntent(intent);
    const after = readPokerState(next);
    if (
      before.phase === 'play' &&
      after.phase === 'finished' &&
      after.end !== null
    ) {
      return {
        kind: 'finished',
        end: after.end,
        winners: after.winnerSeatIndexes.slice(),
      };
    }
    const seat = ctx.seat.seatIndex;
    if (action.type === 'fold') {
      return { kind: 'fold', seat };
    }
    if (action.type === 'check') {
      return { kind: 'check', seat };
    }
    if (action.type === 'call') {
      const from = before.seats[seatKey(seat)];
      const to = after.seats[seatKey(seat)];
      return {
        kind: 'call',
        seat,
        amount: (to?.committed ?? 0) - (from?.committed ?? 0),
      };
    }
    if (action.type === 'bet') {
      return { kind: 'bet', seat, amount: action.amount };
    }
    if (action.type === 'raise') {
      return { kind: 'raise', seat, amount: action.amount };
    }
    if (action.type === 'discard') {
      return { kind: 'discard', seat };
    }
    return null;
  },
} satisfies GameRules<PokerState, PokerIntent>;
