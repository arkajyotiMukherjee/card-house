import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Bluff (Cheat). */
export const BLUFF_GAME_TYPE = 'bluff' as const;

export const BLUFF_RANKS = [
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

export const BLUFF_SUITS = ['S', 'H', 'D', 'C'] as const;

const BLUFF_PHASES = ['lobby', 'play', 'finished'] as const;

const RANK_SET: ReadonlySet<string> = new Set(BLUFF_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(BLUFF_SUITS);

export type BluffRank = (typeof BLUFF_RANKS)[number];
export type BluffSuit = (typeof BLUFF_SUITS)[number];
export type BluffPhase = (typeof BLUFF_PHASES)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type BluffCardId = `${BluffRank}${BluffSuit}`;

export interface BluffLastPlay {
  seat: number;
  cards: string[];
  claimRank: BluffRank;
}

export interface BluffState {
  phase: BluffPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  discardPile: string[];
  requiredRank: BluffRank;
  turnSeatIndex: number | null;
  lastPlay: BluffLastPlay | null;
  winnerSeatIndex: number | null;
}

export type BluffIntent =
  { type: 'play'; cards: string[] } | { type: 'challenge' };

export const bluffGameDefinition = {
  gameType: BLUFF_GAME_TYPE,
  displayName: 'Bluff',
  minPlayers: 2,
  maxPlayers: 6,
  howToPlay:
    '# Bluff\n\nPlay 1 to 4 cards on your turn. The table claims they are the required rank. That rank starts at Ace and steps forward after each play. The next player may challenge the last play or play in turn. A false claim makes the previous player pick up the pile. An honest claim makes the challenger pick it up. Empty your hand to win.',
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

function isRank(value: unknown): value is BluffRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is BluffPhase {
  return (
    typeof value === 'string' &&
    (BLUFF_PHASES as readonly string[]).includes(value)
  );
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfCard(card: string): BluffRank | null {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

function readLastPlay(value: unknown): BluffLastPlay | null {
  if (value === null) {
    return null;
  }
  const record = asRecord(value, 'Invalid table state');
  if (!isSeatIndex(record.seat) || !isStringArray(record.cards)) {
    throw new Error('Invalid table state');
  }
  if (!isRank(record.claimRank)) {
    throw new Error('Invalid table state');
  }
  return {
    seat: record.seat,
    cards: record.cards.slice(),
    claimRank: record.claimRank,
  };
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

export function readBluffState(value: unknown): BluffState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || !isRank(record.requiredRank)) {
    throw new Error('Invalid table state');
  }
  if (!isStringArray(record.discardPile)) {
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
    discardPile: record.discardPile.slice(),
    requiredRank: record.requiredRank,
    turnSeatIndex: record.turnSeatIndex,
    lastPlay: readLastPlay(record.lastPlay),
    winnerSeatIndex: record.winnerSeatIndex,
  };
}

export function readBluffIntent(value: unknown): BluffIntent {
  const record = asRecord(value, 'Invalid intent');
  if (record.type === 'challenge') {
    return { type: 'challenge' };
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

function notStartedState(): BluffState {
  return {
    phase: 'lobby',
    hands: {},
    discardPile: [],
    requiredRank: 'A',
    turnSeatIndex: null,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of BLUFF_SUITS) {
    for (const rank of BLUFF_RANKS) {
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

function seatsWithCards(hands: Record<string, string[]>): number[] {
  const holding: number[] = [];
  for (const seat of seatedIndexes(hands)) {
    const hand = hands[handKey(seat)];
    if (hand.length > 0) {
      holding.push(seat);
    }
  }
  return holding;
}

function copyLastPlay(lastPlay: BluffLastPlay | null): BluffLastPlay | null {
  if (lastPlay === null) {
    return null;
  }
  return {
    seat: lastPlay.seat,
    cards: lastPlay.cards.slice(),
    claimRank: lastPlay.claimRank,
  };
}

function dealState(players: GameSeat[], tableId: string): BluffState {
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
  return {
    phase: 'play',
    hands,
    discardPile: [],
    requiredRank: 'A',
    turnSeatIndex: ordered[0].seatIndex,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

function nextRank(rank: BluffRank): BluffRank {
  const index = BLUFF_RANKS.indexOf(rank);
  return BLUFF_RANKS[(index + 1) % BLUFF_RANKS.length];
}

function applyPlay(
  state: BluffState,
  cards: string[],
  seatIndex: number,
): BluffState {
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  if (cards.length < 1 || cards.length > 4) {
    throw new Error('Invalid intent');
  }
  const key = handKey(seatIndex);
  const hand = state.hands[key];
  if (!hand) {
    throw new Error('Invalid intent');
  }
  const remaining = hand.slice();
  for (const card of cards) {
    const index = remaining.indexOf(card);
    if (index < 0) {
      throw new Error('Invalid intent');
    }
    remaining.splice(index, 1);
  }
  const hands: Record<string, string[]> = { ...state.hands, [key]: remaining };
  const emptied = remaining.length === 0;
  return {
    phase: emptied ? 'finished' : 'play',
    hands,
    discardPile: state.discardPile.concat(cards),
    requiredRank: nextRank(state.requiredRank),
    turnSeatIndex: nextSeat(hands, seatIndex),
    lastPlay: {
      seat: seatIndex,
      cards: cards.slice(),
      claimRank: state.requiredRank,
    },
    winnerSeatIndex: emptied ? seatIndex : null,
  };
}

function givePile(
  hands: Record<string, string[]>,
  seatIndex: number,
  pile: string[],
): Record<string, string[]> {
  const key = handKey(seatIndex);
  const held = hands[key] ?? [];
  return { ...hands, [key]: held.concat(pile) };
}

/**
 * A challenge judges only the last play.
 * The player who does not pick up the pile acts next.
 * An emptied hand wins only when that play was honest.
 */
function applyChallenge(state: BluffState, challenger: number): BluffState {
  if (state.lastPlay === null) {
    throw new Error('Invalid intent');
  }
  const lastPlay = state.lastPlay;
  const previousHand = state.hands[handKey(lastPlay.seat)];
  const emptied = previousHand !== undefined && previousHand.length === 0;
  const honest = lastPlay.cards.every(
    (card) => rankOfCard(card) === lastPlay.claimRank,
  );
  const picker = honest ? challenger : lastPlay.seat;
  const hands = givePile(state.hands, picker, state.discardPile);
  const confirmedWin = honest && emptied;
  return {
    phase: confirmedWin ? 'finished' : 'play',
    hands,
    discardPile: [],
    requiredRank: state.requiredRank,
    turnSeatIndex: picker === challenger ? lastPlay.seat : challenger,
    lastPlay: null,
    winnerSeatIndex: confirmedWin ? lastPlay.seat : null,
  };
}

function leaveSeat(state: BluffState, seatIndex: number): BluffState {
  const key = handKey(seatIndex);
  if (!(key in state.hands)) {
    return {
      phase: state.phase,
      hands: state.hands,
      discardPile: state.discardPile.slice(),
      requiredRank: state.requiredRank,
      turnSeatIndex: state.turnSeatIndex,
      lastPlay: copyLastPlay(state.lastPlay),
      winnerSeatIndex: state.winnerSeatIndex,
    };
  }
  const hands: Record<string, string[]> = { ...state.hands };
  delete hands[key];
  let turnSeatIndex = state.turnSeatIndex;
  if (turnSeatIndex === seatIndex) {
    turnSeatIndex = nextSeat(hands, seatIndex);
  }
  const holding = seatsWithCards(hands);
  let phase = state.phase;
  let winnerSeatIndex = state.winnerSeatIndex;
  const winnerStillSeated =
    winnerSeatIndex !== null && handKey(winnerSeatIndex) in hands;
  // An emptied-hand winner stays while that seat is still seated.
  if (holding.length === 1 && (phase !== 'finished' || !winnerStillSeated)) {
    phase = 'finished';
    winnerSeatIndex = holding[0];
  } else if (!winnerStillSeated) {
    winnerSeatIndex = null;
  }
  return {
    phase,
    hands,
    discardPile: state.discardPile.slice(),
    requiredRank: state.requiredRank,
    turnSeatIndex,
    lastPlay: copyLastPlay(state.lastPlay),
    winnerSeatIndex,
  };
}

/**
 * Bluff rules for gameType `bluff`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 */
export const bluffRules = {
  initialState(players: GameSeat[], table: GameTable): BluffState {
    if (players.length === 0) {
      return notStartedState();
    }
    return dealState(players, table.id);
  },
  applyIntent(
    prev: BluffState,
    intent: BluffIntent,
    ctx: IntentContext,
  ): BluffState {
    const state = readBluffState(prev);
    const action = readBluffIntent(intent);
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'play') {
      return applyPlay(state, action.cards, ctx.seat.seatIndex);
    }
    return applyChallenge(state, ctx.seat.seatIndex);
  },
  onPlayerJoin(prev: BluffState, seat: GameSeat): BluffState {
    void seat;
    return readBluffState(prev);
  },
  onPlayerLeave(prev: BluffState, seat: GameSeat): BluffState {
    return leaveSeat(readBluffState(prev), seat.seatIndex);
  },
} satisfies GameRules<BluffState, BluffIntent>;
