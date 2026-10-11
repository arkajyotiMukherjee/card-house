import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Blackjack. */
export const BLACKJACK_GAME_TYPE = 'blackjack' as const;

export const BLACKJACK_RANKS = [
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

export const BLACKJACK_SUITS = ['S', 'H', 'D', 'C'] as const;

const BLACKJACK_PHASES = ['lobby', 'play', 'finished'] as const;
const BLACKJACK_STEPS = ['bet', 'act'] as const;
const BLACKJACK_RESULTS = ['win', 'lose', 'push', 'blackjack'] as const;

const RANK_SET: ReadonlySet<string> = new Set(BLACKJACK_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(BLACKJACK_SUITS);

export type BlackjackRank = (typeof BLACKJACK_RANKS)[number];
export type BlackjackSuit = (typeof BLACKJACK_SUITS)[number];
export type BlackjackPhase = (typeof BLACKJACK_PHASES)[number];
export type BlackjackStep = (typeof BLACKJACK_STEPS)[number];
export type BlackjackResult = (typeof BLACKJACK_RESULTS)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type BlackjackCardId = `${BlackjackRank}${BlackjackSuit}`;

/** Stakes the table accepts. Each pays an integer chip count. */
export const BLACKJACK_BET_AMOUNTS = [10, 25, 50] as const;

export const BLACKJACK_STARTING_CHIPS = 200;

const BET_SET: ReadonlySet<number> = new Set(BLACKJACK_BET_AMOUNTS);

export interface BlackjackHand {
  cards: string[];
  bet: number;
  done: boolean;
}

export interface BlackjackSeatState {
  chips: number;
  /** Stake committed this round. 0 until that seat bets. */
  bet: number;
  hands: BlackjackHand[];
  /** Hand waiting for hit, stand, double, or split. */
  handIndex: number;
  results: BlackjackResult[];
}

export interface BlackjackState {
  phase: BlackjackPhase;
  /** `bet` collects stakes. `act` is the card play. */
  step: BlackjackStep;
  deck: string[];
  dealer: string[];
  /** The dealer's second card stays face down until the round is scored. */
  holeHidden: boolean;
  seats: Record<string, BlackjackSeatState>;
  turnSeatIndex: number | null;
  /** Seats with a win or a natural. A push-only table leaves this empty. */
  winnerSeatIndexes: number[];
}

export type BlackjackIntent =
  | { type: 'bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' };

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type BlackjackEventNote =
  | { kind: 'bet'; seat: number; amount: number }
  | { kind: 'hit'; seat: number; total: number; bust: boolean }
  | { kind: 'stand'; seat: number; total: number }
  | { kind: 'double'; seat: number; total: number; bust: boolean }
  | { kind: 'split'; seat: number };

export const blackjackGameDefinition = {
  gameType: BLACKJACK_GAME_TYPE,
  displayName: 'Blackjack',
  minPlayers: 1,
  maxPlayers: 5,
  howToPlay:
    '# Blackjack\n\nEach player bets 10, 25, or 50, then receives two cards. The dealer receives one face-up card and one hole card. Hit to take a card, stand to stop, double to take one card for twice the bet, or split a matching pair. Aces count as 1 or 11. Face cards count as 10. The dealer hits until 17. A higher hand wins even money. A two-card 21 pays 3 to 2. A bust loses. The round ends when every hand is scored.',
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

function isRank(value: unknown): value is BlackjackRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is BlackjackPhase {
  return (
    typeof value === 'string' &&
    (BLACKJACK_PHASES as readonly string[]).includes(value)
  );
}

function isStep(value: unknown): value is BlackjackStep {
  return (
    typeof value === 'string' &&
    (BLACKJACK_STEPS as readonly string[]).includes(value)
  );
}

function isResult(value: unknown): value is BlackjackResult {
  return (
    typeof value === 'string' &&
    (BLACKJACK_RESULTS as readonly string[]).includes(value)
  );
}

function isBetAmount(
  value: unknown,
): value is (typeof BLACKJACK_BET_AMOUNTS)[number] {
  return typeof value === 'number' && BET_SET.has(value);
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfBlackjackCard(card: string): BlackjackRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

/**
 * Best total that does not bust, counting an ace as 11 while that still fits.
 * An unknown card id adds nothing.
 */
export function blackjackTotal(cards: readonly string[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = rankOfBlackjackCard(card);
    if (rank === null) {
      continue;
    }
    if (rank === 'A') {
      aces += 1;
      total += 11;
      continue;
    }
    if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') {
      total += 10;
      continue;
    }
    total += Number(rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/** Chips staked this round. Split hands add their bets together. */
export function blackjackStake(seat: BlackjackSeatState): number {
  if (seat.hands.length === 0) {
    return seat.bet;
  }
  let total = 0;
  for (const hand of seat.hands) {
    total += hand.bet;
  }
  return total;
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

function readHand(value: unknown): BlackjackHand {
  const record = asRecord(value, 'Invalid table state');
  if (!isStringArray(record.cards) || !isCount(record.bet)) {
    throw new Error('Invalid table state');
  }
  if (typeof record.done !== 'boolean') {
    throw new Error('Invalid table state');
  }
  return {
    cards: record.cards.slice(),
    bet: record.bet,
    done: record.done,
  };
}

function readSeat(value: unknown): BlackjackSeatState {
  const record = asRecord(value, 'Invalid table state');
  if (
    !isCount(record.chips) ||
    !isCount(record.bet) ||
    !isCount(record.handIndex)
  ) {
    throw new Error('Invalid table state');
  }
  if (!Array.isArray(record.hands) || !Array.isArray(record.results)) {
    throw new Error('Invalid table state');
  }
  const hands: BlackjackHand[] = [];
  for (const hand of record.hands) {
    hands.push(readHand(hand));
  }
  const results: BlackjackResult[] = [];
  for (const result of record.results) {
    if (!isResult(result)) {
      throw new Error('Invalid table state');
    }
    results.push(result);
  }
  return {
    chips: record.chips,
    bet: record.bet,
    hands,
    handIndex: record.handIndex,
    results,
  };
}

function readSeatIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const seats: number[] = [];
  for (const seat of value) {
    if (!isSeatIndex(seat)) {
      throw new Error('Invalid table state');
    }
    seats.push(seat);
  }
  return seats;
}

export function readBlackjackState(value: unknown): BlackjackState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || !isStep(record.step)) {
    throw new Error('Invalid table state');
  }
  if (!isStringArray(record.deck) || !isStringArray(record.dealer)) {
    throw new Error('Invalid table state');
  }
  if (typeof record.holeHidden !== 'boolean') {
    throw new Error('Invalid table state');
  }
  if (!(record.turnSeatIndex === null || isSeatIndex(record.turnSeatIndex))) {
    throw new Error('Invalid table state');
  }
  const seatsRecord = asRecord(record.seats, 'Invalid table state');
  const seats: Record<string, BlackjackSeatState> = {};
  for (const key of Object.keys(seatsRecord)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    seats[key] = readSeat(seatsRecord[key]);
  }
  return {
    phase: record.phase,
    step: record.step,
    deck: record.deck.slice(),
    dealer: record.dealer.slice(),
    holeHidden: record.holeHidden,
    seats,
    turnSeatIndex: record.turnSeatIndex,
    winnerSeatIndexes: readSeatIndexes(record.winnerSeatIndexes),
  };
}

export function readBlackjackIntent(value: unknown): BlackjackIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'hit') {
    return { type: 'hit' };
  }
  if (record.type === 'stand') {
    return { type: 'stand' };
  }
  if (record.type === 'double') {
    return { type: 'double' };
  }
  if (record.type === 'split') {
    return { type: 'split' };
  }
  if (record.type !== 'bet' || typeof record.amount !== 'number') {
    throw new Error('Invalid intent');
  }
  return { type: 'bet', amount: record.amount };
}

export function readBlackjackEventNote(
  value: unknown,
): BlackjackEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (!isSeatIndex(note.seat)) {
    return null;
  }
  if (note.kind === 'bet' && isBetAmount(note.amount)) {
    return { kind: 'bet', seat: note.seat, amount: note.amount };
  }
  if (note.kind === 'split') {
    return { kind: 'split', seat: note.seat };
  }
  if (!isCount(note.total)) {
    return null;
  }
  if (note.kind === 'stand') {
    return { kind: 'stand', seat: note.seat, total: note.total };
  }
  if (
    (note.kind === 'hit' || note.kind === 'double') &&
    typeof note.bust === 'boolean'
  ) {
    return {
      kind: note.kind,
      seat: note.seat,
      total: note.total,
      bust: note.bust,
    };
  }
  return null;
}

function notStartedState(): BlackjackState {
  return {
    phase: 'lobby',
    step: 'bet',
    deck: [],
    dealer: [],
    holeHidden: true,
    seats: {},
    turnSeatIndex: null,
    winnerSeatIndexes: [],
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of BLACKJACK_SUITS) {
    for (const rank of BLACKJACK_RANKS) {
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

function seatedIndexes(seats: Record<string, BlackjackSeatState>): number[] {
  const indexes: number[] = [];
  for (const key of Object.keys(seats)) {
    indexes.push(Number(key));
  }
  indexes.sort((a, b) => a - b);
  return indexes;
}

function emptySeat(): BlackjackSeatState {
  return {
    chips: BLACKJACK_STARTING_CHIPS,
    bet: 0,
    hands: [],
    handIndex: 0,
    results: [],
  };
}

function openingState(players: GameSeat[], tableId: string): BlackjackState {
  const ordered = seatsInOrder(players);
  if (ordered.length === 0) {
    return notStartedState();
  }
  const seats: Record<string, BlackjackSeatState> = {};
  for (const seat of ordered) {
    seats[handKey(seat.seatIndex)] = emptySeat();
  }
  return {
    phase: 'play',
    step: 'bet',
    deck: shuffleDeck(freshDeck(), tableId),
    dealer: [],
    holeHidden: true,
    seats,
    turnSeatIndex: ordered[0].seatIndex,
    winnerSeatIndexes: [],
  };
}

function takeCard(deck: readonly string[]): [string, string[]] {
  const card = deck[0];
  if (card === undefined) {
    throw new Error('Invalid intent');
  }
  return [card, deck.slice(1)];
}

function replaceSeat(
  state: BlackjackState,
  seatIndex: number,
  seat: BlackjackSeatState,
): BlackjackState {
  return {
    phase: state.phase,
    step: state.step,
    deck: state.deck,
    dealer: state.dealer,
    holeHidden: state.holeHidden,
    seats: { ...state.seats, [handKey(seatIndex)]: seat },
    turnSeatIndex: state.turnSeatIndex,
    winnerSeatIndexes: state.winnerSeatIndexes.slice(),
  };
}

function handAt(
  state: BlackjackState,
  seatIndex: number,
): { seat: BlackjackSeatState; hand: BlackjackHand } {
  const seat = state.seats[handKey(seatIndex)];
  const hand = seat?.hands[seat.handIndex];
  if (!seat || !hand || hand.done) {
    throw new Error('Invalid intent');
  }
  return { seat, hand };
}

function liveHand(hand: BlackjackHand): boolean {
  return blackjackTotal(hand.cards) <= 21;
}

function isNatural(hand: BlackjackHand, split: boolean): boolean {
  return !split && hand.cards.length === 2 && blackjackTotal(hand.cards) === 21;
}

/** The dealer draws only when a live hand can still lose to a higher total. */
function dealerShouldDraw(state: BlackjackState): boolean {
  for (const seatIndex of seatedIndexes(state.seats)) {
    const seat = state.seats[handKey(seatIndex)];
    const split = seat.hands.length > 1;
    for (const hand of seat.hands) {
      if (liveHand(hand) && !isNatural(hand, split)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Even-money profit is the bet. A natural pays floor(3/2 of the bet):
 * 10 pays 15, 25 pays 37, and 50 pays 75. The stake was already taken.
 */
function payout(hand: BlackjackHand, result: BlackjackResult): number {
  if (result === 'blackjack') {
    return hand.bet + Math.floor((hand.bet * 3) / 2);
  }
  if (result === 'win') {
    return hand.bet * 2;
  }
  if (result === 'push') {
    return hand.bet;
  }
  return 0;
}

function scoreHand(
  hand: BlackjackHand,
  split: boolean,
  dealer: readonly string[],
  dealerTotal: number,
): BlackjackResult {
  const total = blackjackTotal(hand.cards);
  const natural = isNatural(hand, split);
  const dealerNatural = dealer.length === 2 && dealerTotal === 21;
  if (total > 21) {
    return 'lose';
  }
  if (dealerNatural && natural) {
    return 'push';
  }
  if (dealerNatural) {
    return 'lose';
  }
  if (natural) {
    return 'blackjack';
  }
  if (dealerTotal > 21 || total > dealerTotal) {
    return 'win';
  }
  if (total === dealerTotal) {
    return 'push';
  }
  return 'lose';
}

function settle(state: BlackjackState): BlackjackState {
  let deck = state.deck.slice();
  let dealer = state.dealer.slice();
  const dealerStartsNatural =
    dealer.length === 2 && blackjackTotal(dealer) === 21;
  if (dealerShouldDraw(state) && !dealerStartsNatural) {
    while (blackjackTotal(dealer) < 17 && deck.length > 0) {
      const [card, next] = takeCard(deck);
      deck = next;
      dealer = dealer.concat(card);
    }
  }
  const dealerTotal = blackjackTotal(dealer);
  const seats: Record<string, BlackjackSeatState> = {};
  const winners: number[] = [];
  for (const seatIndex of seatedIndexes(state.seats)) {
    const seat = state.seats[handKey(seatIndex)];
    let chips = seat.chips;
    const results: BlackjackResult[] = [];
    const split = seat.hands.length > 1;
    for (const hand of seat.hands) {
      const result = scoreHand(hand, split, dealer, dealerTotal);
      chips += payout(hand, result);
      results.push(result);
    }
    if (results.some((result) => result === 'win' || result === 'blackjack')) {
      winners.push(seatIndex);
    }
    seats[handKey(seatIndex)] = {
      chips,
      bet: seat.bet,
      hands: seat.hands.map((hand) => ({
        cards: hand.cards.slice(),
        bet: hand.bet,
        done: true,
      })),
      handIndex: seat.handIndex,
      results,
    };
  }
  return {
    phase: 'finished',
    step: 'act',
    deck,
    dealer,
    holeHidden: false,
    seats,
    turnSeatIndex: null,
    winnerSeatIndexes: winners,
  };
}

function firstOpenHand(seat: BlackjackSeatState): number {
  return seat.hands.findIndex((hand) => !hand.done);
}

function advanceFrom(state: BlackjackState, seatIndex: number): BlackjackState {
  const key = handKey(seatIndex);
  const seat = state.seats[key];
  if (!seat) {
    return settle(state);
  }
  const nextHand = seat.handIndex + 1;
  if (nextHand < seat.hands.length && !seat.hands[nextHand].done) {
    return replaceSeat({ ...state, turnSeatIndex: seatIndex }, seatIndex, {
      ...seat,
      handIndex: nextHand,
    });
  }
  const order = seatedIndexes(state.seats);
  const start = order.indexOf(seatIndex);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(start + offset) % order.length];
    if (candidate === undefined) {
      continue;
    }
    const candidateSeat = state.seats[handKey(candidate)];
    const open = firstOpenHand(candidateSeat);
    if (open >= 0) {
      return replaceSeat({ ...state, turnSeatIndex: candidate }, candidate, {
        ...candidateSeat,
        handIndex: open,
      });
    }
  }
  return settle(state);
}

function dealRound(state: BlackjackState): BlackjackState {
  const order = seatedIndexes(state.seats);
  let deck = state.deck.slice();
  const dealt: Record<string, string[]> = {};
  for (const seatIndex of order) {
    dealt[handKey(seatIndex)] = [];
  }
  const dealer: string[] = [];
  for (let pass = 0; pass < 2; pass += 1) {
    for (const seatIndex of order) {
      const [card, next] = takeCard(deck);
      deck = next;
      dealt[handKey(seatIndex)].push(card);
    }
    const [card, next] = takeCard(deck);
    deck = next;
    dealer.push(card);
  }
  const seats: Record<string, BlackjackSeatState> = {};
  for (const seatIndex of order) {
    const prev = state.seats[handKey(seatIndex)];
    const cards = dealt[handKey(seatIndex)];
    seats[handKey(seatIndex)] = {
      chips: prev.chips,
      bet: prev.bet,
      hands: [
        {
          cards,
          bet: prev.bet,
          done: blackjackTotal(cards) === 21,
        },
      ],
      handIndex: 0,
      results: [],
    };
  }
  const dealtState: BlackjackState = {
    phase: 'play',
    step: 'act',
    deck,
    dealer,
    holeHidden: true,
    seats,
    turnSeatIndex: null,
    winnerSeatIndexes: [],
  };
  for (const seatIndex of order) {
    const open = firstOpenHand(dealtState.seats[handKey(seatIndex)]);
    if (open >= 0) {
      return replaceSeat(
        { ...dealtState, turnSeatIndex: seatIndex },
        seatIndex,
        { ...dealtState.seats[handKey(seatIndex)], handIndex: open },
      );
    }
  }
  return settle(dealtState);
}

function applyBet(
  state: BlackjackState,
  amount: number,
  seatIndex: number,
): BlackjackState {
  if (state.step !== 'bet' || !isBetAmount(amount)) {
    throw new Error('Invalid intent');
  }
  const seat = state.seats[handKey(seatIndex)];
  if (!seat || seat.bet !== 0 || amount > seat.chips) {
    throw new Error('Invalid intent');
  }
  const updated = replaceSeat(state, seatIndex, {
    ...seat,
    chips: seat.chips - amount,
    bet: amount,
  });
  const pending = seatedIndexes(updated.seats).filter(
    (index) => updated.seats[handKey(index)].bet === 0,
  );
  if (pending.length === 0) {
    return dealRound(updated);
  }
  return { ...updated, turnSeatIndex: pending[0] };
}

function applyHit(state: BlackjackState, seatIndex: number): BlackjackState {
  if (state.step !== 'act') {
    throw new Error('Invalid intent');
  }
  const { seat, hand } = handAt(state, seatIndex);
  const [card, deck] = takeCard(state.deck);
  const cards = hand.cards.concat(card);
  const hands = seat.hands.slice();
  hands[seat.handIndex] = {
    cards,
    bet: hand.bet,
    done: blackjackTotal(cards) >= 21,
  };
  const next = replaceSeat({ ...state, deck }, seatIndex, { ...seat, hands });
  if (!hands[seat.handIndex].done) {
    return next;
  }
  return advanceFrom(next, seatIndex);
}

function applyStand(state: BlackjackState, seatIndex: number): BlackjackState {
  if (state.step !== 'act') {
    throw new Error('Invalid intent');
  }
  const { seat, hand } = handAt(state, seatIndex);
  const hands = seat.hands.slice();
  hands[seat.handIndex] = {
    cards: hand.cards.slice(),
    bet: hand.bet,
    done: true,
  };
  return advanceFrom(
    replaceSeat(state, seatIndex, { ...seat, hands }),
    seatIndex,
  );
}

function applyDouble(state: BlackjackState, seatIndex: number): BlackjackState {
  if (state.step !== 'act') {
    throw new Error('Invalid intent');
  }
  const { seat, hand } = handAt(state, seatIndex);
  if (hand.cards.length !== 2 || seat.chips < hand.bet || hand.bet === 0) {
    throw new Error('Invalid intent');
  }
  const [card, deck] = takeCard(state.deck);
  const cards = hand.cards.concat(card);
  const hands = seat.hands.slice();
  hands[seat.handIndex] = {
    cards,
    bet: hand.bet * 2,
    done: true,
  };
  const next = replaceSeat({ ...state, deck }, seatIndex, {
    ...seat,
    chips: seat.chips - hand.bet,
    hands,
  });
  return advanceFrom(next, seatIndex);
}

function applySplit(state: BlackjackState, seatIndex: number): BlackjackState {
  if (state.step !== 'act') {
    throw new Error('Invalid intent');
  }
  const { seat, hand } = handAt(state, seatIndex);
  if (seat.hands.length !== 1 || hand.cards.length !== 2) {
    throw new Error('Invalid intent');
  }
  const left = rankOfBlackjackCard(hand.cards[0] ?? '');
  const right = rankOfBlackjackCard(hand.cards[1] ?? '');
  if (
    left === null ||
    left !== right ||
    seat.chips < hand.bet ||
    hand.bet === 0
  ) {
    throw new Error('Invalid intent');
  }
  const [first, deckAfterFirst] = takeCard(state.deck);
  const [second, deck] = takeCard(deckAfterFirst);
  const aces = left === 'A';
  const hands: BlackjackHand[] = [
    { cards: [hand.cards[0], first], bet: hand.bet, done: aces },
    { cards: [hand.cards[1], second], bet: hand.bet, done: aces },
  ];
  const next = replaceSeat({ ...state, deck }, seatIndex, {
    ...seat,
    chips: seat.chips - hand.bet,
    hands,
    handIndex: 0,
  });
  if (aces) {
    return advanceFrom(next, seatIndex);
  }
  return next;
}

function copyState(state: BlackjackState): BlackjackState {
  return readBlackjackState(state);
}

function leaveSeat(state: BlackjackState, seatIndex: number): BlackjackState {
  const key = handKey(seatIndex);
  if (!(key in state.seats)) {
    return copyState(state);
  }
  const seats = { ...state.seats };
  delete seats[key];
  const remaining = seatedIndexes(seats);
  if (state.phase !== 'play') {
    return {
      ...copyState(state),
      seats,
      winnerSeatIndexes: state.winnerSeatIndexes.filter(
        (index) => index !== seatIndex,
      ),
    };
  }
  if (remaining.length === 0) {
    return {
      phase: 'finished',
      step: 'act',
      deck: state.deck.slice(),
      dealer: state.dealer.slice(),
      holeHidden: false,
      seats,
      turnSeatIndex: null,
      winnerSeatIndexes: [],
    };
  }
  const base: BlackjackState = {
    ...state,
    deck: state.deck.slice(),
    dealer: state.dealer.slice(),
    seats,
    winnerSeatIndexes: [],
  };
  if (state.step === 'bet') {
    const pending = remaining.filter(
      (index) => seats[handKey(index)].bet === 0,
    );
    if (pending.length === 0) {
      return dealRound(base);
    }
    const stillPending =
      state.turnSeatIndex !== null &&
      state.turnSeatIndex !== seatIndex &&
      pending.includes(state.turnSeatIndex);
    return {
      ...base,
      turnSeatIndex: stillPending ? state.turnSeatIndex : pending[0],
    };
  }
  if (state.turnSeatIndex !== seatIndex && state.turnSeatIndex !== null) {
    return base;
  }
  for (const candidate of remaining) {
    const open = firstOpenHand(seats[handKey(candidate)]);
    if (open >= 0) {
      return replaceSeat({ ...base, turnSeatIndex: candidate }, candidate, {
        ...seats[handKey(candidate)],
        handIndex: open,
      });
    }
  }
  return settle({ ...base, turnSeatIndex: null });
}

function noteTotal(
  prev: BlackjackState,
  next: BlackjackState,
  seatIndex: number,
): { total: number; bust: boolean } {
  const before = prev.seats[handKey(seatIndex)];
  const after = next.seats[handKey(seatIndex)];
  const hand = after?.hands[before?.handIndex ?? 0];
  const total = hand ? blackjackTotal(hand.cards) : 0;
  return { total, bust: total > 21 };
}

/**
 * Blackjack rules for gameType `blackjack`.
 * `initialState([], table)` is the not-started lobby.
 * Seated players buy in and bet before the deal.
 */
export const blackjackRules = {
  initialState(players: GameSeat[], table: GameTable): BlackjackState {
    if (players.length === 0) {
      return notStartedState();
    }
    return openingState(players, table.id);
  },
  applyIntent(
    prev: BlackjackState,
    intent: BlackjackIntent,
    ctx: IntentContext,
  ): BlackjackState {
    const state = readBlackjackState(prev);
    const action = readBlackjackIntent(intent);
    if (state.phase !== 'play') {
      throw new Error('Invalid intent');
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    const seatIndex = ctx.seat.seatIndex;
    if (action.type === 'bet') {
      return applyBet(state, action.amount, seatIndex);
    }
    if (action.type === 'hit') {
      return applyHit(state, seatIndex);
    }
    if (action.type === 'stand') {
      return applyStand(state, seatIndex);
    }
    if (action.type === 'double') {
      return applyDouble(state, seatIndex);
    }
    return applySplit(state, seatIndex);
  },
  eventNote(
    prev: BlackjackState,
    intent: BlackjackIntent,
    next: BlackjackState,
    ctx: IntentContext,
  ): BlackjackEventNote | null {
    const before = readBlackjackState(prev);
    const after = readBlackjackState(next);
    const action = readBlackjackIntent(intent);
    const seat = ctx.seat.seatIndex;
    if (action.type === 'bet' && isBetAmount(action.amount)) {
      return { kind: 'bet', seat, amount: action.amount };
    }
    if (action.type === 'split') {
      return { kind: 'split', seat };
    }
    const scored = noteTotal(before, after, seat);
    if (action.type === 'hit') {
      return { kind: 'hit', seat, total: scored.total, bust: scored.bust };
    }
    if (action.type === 'stand') {
      return { kind: 'stand', seat, total: scored.total };
    }
    if (action.type === 'double') {
      return { kind: 'double', seat, total: scored.total, bust: scored.bust };
    }
    return null;
  },
  onPlayerJoin(prev: BlackjackState, seat: GameSeat): BlackjackState {
    void seat;
    return readBlackjackState(prev);
  },
  onPlayerLeave(prev: BlackjackState, seat: GameSeat): BlackjackState {
    return leaveSeat(readBlackjackState(prev), seat.seatIndex);
  },
} satisfies GameRules<BlackjackState, BlackjackIntent>;
