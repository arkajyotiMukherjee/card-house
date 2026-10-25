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

/** Red joker, then black joker. Neither id is a queen. */
export const BLUFF_JOKERS = ['JR', 'JB'] as const;

/** Four suits of one rank, plus both jokers, can honestly match one call. */
export const BLUFF_TRUE_PER_RANK = BLUFF_SUITS.length + BLUFF_JOKERS.length;

const BLUFF_PHASES = ['lobby', 'play', 'finished'] as const;

const RANK_SET: ReadonlySet<string> = new Set(BLUFF_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(BLUFF_SUITS);
const JOKER_SET: ReadonlySet<string> = new Set(BLUFF_JOKERS);

export type BluffRank = (typeof BLUFF_RANKS)[number];
export type BluffSuit = (typeof BLUFF_SUITS)[number];
export type BluffJokerId = (typeof BLUFF_JOKERS)[number];
export type BluffPhase = (typeof BLUFF_PHASES)[number];

/** Rank plus suit, such as `AS` or `10H`, or a joker id `JR` / `JB`. */
export type BluffCardId = `${BluffRank}${BluffSuit}` | BluffJokerId;

export const BLUFF_RANK_NAMES: Record<BluffRank, string> = {
  A: 'Ace',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
};

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
  /** Rank called for this round. Null while the lead has not called. */
  requiredRank: BluffRank | null;
  /** Seats that passed and cannot play again until the next call. */
  passed: number[];
  /** Plays each seat has made in the current hand. The Bluff bot reads its own. */
  playCounts: Record<string, number>;
  /** Turns each seat has taken. The Bluff bot challenges on a fixed cadence of these. */
  turnCounts: Record<string, number>;
  turnSeatIndex: number | null;
  lastPlay: BluffLastPlay | null;
  winnerSeatIndex: number | null;
}

export type BluffIntent =
  | { type: 'play'; cards: string[]; claimRank?: BluffRank }
  | { type: 'pass' }
  | { type: 'challenge' };

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type BluffEventNote =
  | { kind: 'play'; seat: number; count: number; claimRank: BluffRank }
  | { kind: 'pass'; seat: number }
  | {
      kind: 'challenge';
      challenger: number;
      accused: number;
      /** True when the accused played a card that was not the called rank. */
      bluff: boolean;
      pickedUp: number;
    };

export const bluffGameDefinition = {
  gameType: BLUFF_GAME_TYPE,
  displayName: 'Bluff',
  minPlayers: 2,
  maxPlayers: 6,
  howToPlay:
    '# Bluff\n\nThe lead selects any number of cards and chooses a rank before playing them face down. One card is a legal play. That call may be a lie. A joker is wild and is always a true card. It is not a queen. Each other player plays any number of cards as that rank, or passes. A pass sits out for the rest of the round. Only the lead calls a rank. Anyone else may challenge the latest play. Four of a rank plus both jokers is the most that claim can honestly be. A lie makes the player who played pick up the pile, and the challenger leads. An honest call, including a joker, makes the challenger pick it up, and the player who was challenged leads. If everyone else passes, the pile is set aside and the last player to play leads. Empty your hand to win.',
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

export function isJoker(card: string): card is BluffJokerId {
  return JOKER_SET.has(card);
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfCard(card: string): BluffRank | null {
  if (isJoker(card)) {
    return null;
  }
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  if (!SUIT_SET.has(suit) || !isRank(rank)) {
    return null;
  }
  return rank;
}

/** A joker matches every call. Any other card matches only its own rank. */
export function cardIsTrue(card: string, rank: BluffRank): boolean {
  if (isJoker(card)) {
    return true;
  }
  return rankOfCard(card) === rank;
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

function readPassed(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  const passed: number[] = [];
  for (const seat of value) {
    if (!isSeatIndex(seat)) {
      throw new Error('Invalid table state');
    }
    passed.push(seat);
  }
  return passed;
}

function readPlayCounts(value: unknown): Record<string, number> {
  const record = asRecord(value, 'Invalid table state');
  const counts: Record<string, number> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    const count = record[key];
    if (
      !isSeatIndex(seatIndex) ||
      handKey(seatIndex) !== key ||
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      throw new Error('Invalid table state');
    }
    counts[key] = count;
  }
  return counts;
}

function handKey(seatIndex: number): string {
  return String(seatIndex);
}

function bumpTurns(
  counts: Record<string, number>,
  seatIndex: number,
): Record<string, number> {
  const key = handKey(seatIndex);
  return { ...counts, [key]: (counts[key] ?? 0) + 1 };
}

export function readBluffState(value: unknown): BluffState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase)) {
    throw new Error('Invalid table state');
  }
  if (!(record.requiredRank === null || isRank(record.requiredRank))) {
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
    passed: readPassed(record.passed),
    playCounts: readPlayCounts(record.playCounts),
    turnCounts:
      record.turnCounts === undefined ? {} : readPlayCounts(record.turnCounts),
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
  if (record.claimRank === undefined) {
    return { type: 'play', cards };
  }
  if (!isRank(record.claimRank)) {
    throw new Error('Invalid intent');
  }
  return { type: 'play', cards, claimRank: record.claimRank };
}

export function readBluffEventNote(value: unknown): BluffEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (note.kind === 'pass' && isSeatIndex(note.seat)) {
    return { kind: 'pass', seat: note.seat };
  }
  if (
    note.kind === 'play' &&
    isSeatIndex(note.seat) &&
    isSeatIndex(note.count) &&
    isRank(note.claimRank)
  ) {
    return {
      kind: 'play',
      seat: note.seat,
      count: note.count,
      claimRank: note.claimRank,
    };
  }
  if (
    note.kind === 'challenge' &&
    isSeatIndex(note.challenger) &&
    isSeatIndex(note.accused) &&
    typeof note.bluff === 'boolean' &&
    isSeatIndex(note.pickedUp)
  ) {
    return {
      kind: 'challenge',
      challenger: note.challenger,
      accused: note.accused,
      bluff: note.bluff,
      pickedUp: note.pickedUp,
    };
  }
  return null;
}

function notStartedState(): BluffState {
  return {
    phase: 'lobby',
    hands: {},
    discardPile: [],
    requiredRank: null,
    passed: [],
    playCounts: {},
    turnCounts: {},
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
  for (const joker of BLUFF_JOKERS) {
    deck.push(joker);
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

function nextActive(state: BluffState, after: number): number | null {
  const seats = seatedIndexes(state.hands).filter(
    (seat) => !state.passed.includes(seat),
  );
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
    requiredRank: null,
    passed: [],
    playCounts: {},
    turnCounts: {},
    turnSeatIndex: ordered[0].seatIndex,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

/**
 * Playing the last card does not win until the next player lets it stand.
 * A play or a pass closes that window. A challenge still judges the card.
 */
function acceptUnchallengedOut(state: BluffState): BluffState | null {
  const lastPlay = state.lastPlay;
  if (lastPlay === null) {
    return null;
  }
  const hand = state.hands[handKey(lastPlay.seat)];
  if (hand === undefined || hand.length > 0) {
    return null;
  }
  return {
    phase: 'finished',
    hands: state.hands,
    discardPile: state.discardPile.slice(),
    requiredRank: state.requiredRank,
    passed: state.passed.slice(),
    playCounts: state.playCounts,
    turnCounts: state.turnCounts,
    turnSeatIndex: null,
    lastPlay: copyLastPlay(lastPlay),
    winnerSeatIndex: lastPlay.seat,
  };
}

function calledRank(card: string, claimRank: BluffRank | undefined): BluffRank {
  if (claimRank !== undefined) {
    return claimRank;
  }
  return rankOfCard(card) ?? 'A';
}

function applyPlay(
  state: BluffState,
  cards: string[],
  claimRank: BluffRank | undefined,
  seatIndex: number,
): BluffState {
  const accepted = acceptUnchallengedOut(state);
  if (accepted) {
    return accepted;
  }
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  if (cards.length < 1) {
    throw new Error('Play at least one card');
  }
  if (state.passed.includes(seatIndex)) {
    throw new Error('You passed');
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
  let rank = state.requiredRank;
  if (rank === null) {
    rank = calledRank(cards[0] ?? '', claimRank);
  } else if (claimRank !== undefined && claimRank !== rank) {
    throw new Error('The rank is already called');
  }
  const hands: Record<string, string[]> = { ...state.hands, [key]: remaining };
  const playCounts = {
    ...state.playCounts,
    [key]: (state.playCounts[key] ?? 0) + 1,
  };
  return {
    phase: 'play',
    hands,
    discardPile: state.discardPile.concat(cards),
    requiredRank: rank,
    passed: state.passed.slice(),
    playCounts,
    turnCounts: bumpTurns(state.turnCounts, seatIndex),
    turnSeatIndex: nextActive(state, seatIndex),
    lastPlay: {
      seat: seatIndex,
      cards: cards.slice(),
      claimRank: rank,
    },
    winnerSeatIndex: null,
  };
}

/** Every seated player except the last one to play has passed. */
function everyOtherSeatPassed(
  hands: Record<string, string[]>,
  passed: readonly number[],
  lastSeat: number,
): boolean {
  const seats = seatedIndexes(hands);
  if (seats.length === 0 || !seats.includes(lastSeat)) {
    return false;
  }
  for (const seat of seats) {
    if (seat !== lastSeat && !passed.includes(seat)) {
      return false;
    }
  }
  return true;
}

function applyPass(state: BluffState, seatIndex: number): BluffState {
  const accepted = acceptUnchallengedOut(state);
  if (accepted) {
    return accepted;
  }
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  if (state.requiredRank === null) {
    throw new Error('Call a rank');
  }
  if (state.passed.includes(seatIndex)) {
    throw new Error('You passed');
  }
  const passed = state.passed.concat(seatIndex);
  const lastSeat = state.lastPlay?.seat;
  const othersDone =
    lastSeat !== undefined &&
    everyOtherSeatPassed(state.hands, passed, lastSeat);
  const stillIn = seatedIndexes(state.hands).filter(
    (seat) => !passed.includes(seat),
  );
  if (othersDone || stillIn.length === 0) {
    const lead = state.lastPlay?.seat ?? seatIndex;
    const leadHand = state.hands[handKey(lead)];
    const leadOut = leadHand !== undefined && leadHand.length === 0;
    return {
      phase: leadOut ? 'finished' : 'play',
      hands: state.hands,
      discardPile: [],
      requiredRank: null,
      passed: [],
      playCounts: state.playCounts,
      turnCounts: bumpTurns(state.turnCounts, seatIndex),
      turnSeatIndex: leadOut ? null : lead,
      lastPlay: null,
      winnerSeatIndex: leadOut ? lead : null,
    };
  }
  return {
    phase: 'play',
    hands: state.hands,
    discardPile: state.discardPile.slice(),
    requiredRank: state.requiredRank,
    passed,
    playCounts: state.playCounts,
    turnCounts: bumpTurns(state.turnCounts, seatIndex),
    turnSeatIndex: nextActive({ ...state, passed }, seatIndex),
    lastPlay: copyLastPlay(state.lastPlay),
    winnerSeatIndex: null,
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
 * A challenge judges only the last play and ends the round.
 * A lie sends the pile to the player who played, and the challenger leads.
 * An honest play, including a joker, sends the pile to the challenger, and
 * the player who was challenged leads.
 * An emptied hand wins only when that play was honest.
 */
function applyChallenge(state: BluffState, challenger: number): BluffState {
  if (state.lastPlay === null) {
    throw new Error('Nothing to challenge');
  }
  if (state.lastPlay.seat === challenger) {
    throw new Error('Not your play to challenge');
  }
  const lastPlay = state.lastPlay;
  const previousHand = state.hands[handKey(lastPlay.seat)];
  const emptied = previousHand !== undefined && previousHand.length === 0;
  const honest = lastPlay.cards.every((card) =>
    cardIsTrue(card, lastPlay.claimRank),
  );
  const picker = honest ? challenger : lastPlay.seat;
  const hands = givePile(state.hands, picker, state.discardPile);
  const confirmedWin = honest && emptied;
  const lead = honest ? lastPlay.seat : challenger;
  return {
    phase: confirmedWin ? 'finished' : 'play',
    hands,
    discardPile: [],
    requiredRank: null,
    passed: [],
    playCounts: state.playCounts,
    turnCounts: bumpTurns(state.turnCounts, challenger),
    turnSeatIndex: confirmedWin ? null : lead,
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
      passed: state.passed.slice(),
      playCounts: state.playCounts,
      turnCounts: state.turnCounts,
      turnSeatIndex: state.turnSeatIndex,
      lastPlay: copyLastPlay(state.lastPlay),
      winnerSeatIndex: state.winnerSeatIndex,
    };
  }
  const hands: Record<string, string[]> = { ...state.hands };
  delete hands[key];
  const passed = state.passed.filter((seat) => seat !== seatIndex);
  let turnSeatIndex = state.turnSeatIndex;
  if (turnSeatIndex === seatIndex) {
    turnSeatIndex = nextActive({ ...state, hands, passed }, seatIndex);
  }
  const holding = seatsWithCards(hands);
  let phase = state.phase;
  let winnerSeatIndex = state.winnerSeatIndex;
  const winnerStillSeated =
    winnerSeatIndex !== null && handKey(winnerSeatIndex) in hands;
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
    passed,
    playCounts: state.playCounts,
    turnCounts: state.turnCounts,
    turnSeatIndex,
    lastPlay: copyLastPlay(state.lastPlay),
    winnerSeatIndex,
  };
}

function playWasAcceptedOut(before: BluffState, next: BluffState): boolean {
  const lastPlay = before.lastPlay;
  if (lastPlay === null || next.phase !== 'finished') {
    return false;
  }
  const hand = before.hands[handKey(lastPlay.seat)];
  return (
    hand !== undefined &&
    hand.length === 0 &&
    next.winnerSeatIndex === lastPlay.seat
  );
}

/**
 * Bluff rules for gameType `bluff`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 * Any number of cards per play. The lead calls the rank. Jokers are always true.
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
    if (!(handKey(ctx.seat.seatIndex) in state.hands)) {
      throw new Error('Invalid intent');
    }
    if (action.type === 'challenge') {
      return applyChallenge(state, ctx.seat.seatIndex);
    }
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    if (action.type === 'pass') {
      return applyPass(state, ctx.seat.seatIndex);
    }
    return applyPlay(state, action.cards, action.claimRank, ctx.seat.seatIndex);
  },
  eventNote(
    prev: BluffState,
    intent: BluffIntent,
    next: BluffState,
    ctx: IntentContext,
  ): BluffEventNote | null {
    const before = readBluffState(prev);
    const after = readBluffState(next);
    const action = readBluffIntent(intent);
    if (action.type === 'pass') {
      if (playWasAcceptedOut(before, after)) {
        return null;
      }
      return { kind: 'pass', seat: ctx.seat.seatIndex };
    }
    if (action.type === 'play') {
      if (playWasAcceptedOut(before, after)) {
        return null;
      }
      const claim = after.lastPlay?.claimRank ?? before.requiredRank;
      if (claim === null) {
        return null;
      }
      return {
        kind: 'play',
        seat: ctx.seat.seatIndex,
        count: action.cards.length,
        claimRank: claim,
      };
    }
    const lastPlay = before.lastPlay;
    if (lastPlay === null) {
      return null;
    }
    const bluff = !lastPlay.cards.every((card) =>
      cardIsTrue(card, lastPlay.claimRank),
    );
    return {
      kind: 'challenge',
      challenger: ctx.seat.seatIndex,
      accused: lastPlay.seat,
      bluff,
      pickedUp: bluff ? lastPlay.seat : ctx.seat.seatIndex,
    };
  },
  onPlayerJoin(prev: BluffState, seat: GameSeat): BluffState {
    void seat;
    return readBluffState(prev);
  },
  onPlayerLeave(prev: BluffState, seat: GameSeat): BluffState {
    return leaveSeat(readBluffState(prev), seat.seatIndex);
  },
} satisfies GameRules<BluffState, BluffIntent>;
