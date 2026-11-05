import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for Go Fish. */
export const GO_FISH_GAME_TYPE = 'go_fish' as const;

export const GO_FISH_RANKS = [
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

export const GO_FISH_SUITS = ['S', 'H', 'D', 'C'] as const;

const GO_FISH_PHASES = ['lobby', 'play', 'finished'] as const;

const RANK_SET: ReadonlySet<string> = new Set(GO_FISH_RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(GO_FISH_SUITS);

/** Two or three players take seven cards. Four or more take five. */
const DEAL_FEW = 7;
const DEAL_MANY = 5;
const BOOK_SIZE = 4;

export type GoFishRank = (typeof GO_FISH_RANKS)[number];
export type GoFishSuit = (typeof GO_FISH_SUITS)[number];
export type GoFishPhase = (typeof GO_FISH_PHASES)[number];

/** Rank plus suit, such as `AS` or `10H`. */
export type GoFishCardId = `${GoFishRank}${GoFishSuit}`;

export interface GoFishBook {
  rank: GoFishRank;
  cards: string[];
}

export interface GoFishLastAsk {
  from: number;
  to: number;
  rank: GoFishRank;
  /** How many cards the asked seat gave. Zero means they had none. */
  given: number;
  /** The stock card drawn after a miss, or null when nothing was drawn. */
  drawn: string | null;
}

export interface GoFishState {
  phase: GoFishPhase;
  /** Seat index string to the cards that seat holds. */
  hands: Record<string, string[]>;
  /** Next draw is the first card. */
  stock: string[];
  /** Completed four-of-a-kind books, in the order they were laid. */
  books: Record<string, GoFishBook[]>;
  turnSeatIndex: number | null;
  winnerSeatIndex: number | null;
  lastAsk: GoFishLastAsk | null;
  /** Per-seat ask counts let bots vary their guesses without seeing hidden cards. */
  askCounts?: Record<string, number>;
}

export type GoFishIntent = {
  type: 'ask';
  targetSeat: number;
  rank: GoFishRank;
};

/** What a table event says. Seat numbers stay indexes; clients add names. */
export type GoFishEventNote = {
  kind: 'ask';
  from: number;
  to: number;
  rank: GoFishRank;
  given: number;
  drawn: boolean;
};

export const goFishGameDefinition = {
  gameType: GO_FISH_GAME_TYPE,
  displayName: 'Go Fish',
  minPlayers: 2,
  maxPlayers: 6,
  howToPlay:
    '# Go Fish\n\nAsk another player for a rank you already hold. If they have it, they give you every card of that rank and you ask again. If they do not, draw one card from the stock. Draw the rank you asked for and you ask again. Four of one rank is a book and scores one point. The player with the most books wins when the stock is empty and only one player still holds cards, or when every card is in a book.',
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

function isRank(value: unknown): value is GoFishRank {
  return typeof value === 'string' && RANK_SET.has(value);
}

function isPhase(value: unknown): value is GoFishPhase {
  return (
    typeof value === 'string' &&
    (GO_FISH_PHASES as readonly string[]).includes(value)
  );
}

/** Rank encoded at the front of a card id. `10` is the only two-letter rank. */
export function rankOfCard(card: string): GoFishRank | null {
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

function readBook(value: unknown): GoFishBook {
  const record = asRecord(value, 'Invalid table state');
  if (!isRank(record.rank) || !isStringArray(record.cards)) {
    throw new Error('Invalid table state');
  }
  return { rank: record.rank, cards: record.cards.slice() };
}

function readBooks(value: unknown): Record<string, GoFishBook[]> {
  const record = asRecord(value, 'Invalid table state');
  const books: Record<string, GoFishBook[]> = {};
  for (const key of Object.keys(record)) {
    const seatIndex = Number(key);
    if (!isSeatIndex(seatIndex) || handKey(seatIndex) !== key) {
      throw new Error('Invalid table state');
    }
    const list = record[key];
    if (!Array.isArray(list)) {
      throw new Error('Invalid table state');
    }
    books[key] = list.map((book) => readBook(book));
  }
  return books;
}

function readLastAsk(value: unknown): GoFishLastAsk | null {
  if (value === null) {
    return null;
  }
  const record = asRecord(value, 'Invalid table state');
  if (
    !isSeatIndex(record.from) ||
    !isSeatIndex(record.to) ||
    !isRank(record.rank) ||
    !isSeatIndex(record.given)
  ) {
    throw new Error('Invalid table state');
  }
  if (!(record.drawn === null || typeof record.drawn === 'string')) {
    throw new Error('Invalid table state');
  }
  return {
    from: record.from,
    to: record.to,
    rank: record.rank,
    given: record.given,
    drawn: record.drawn,
  };
}

export function readGoFishState(value: unknown): GoFishState {
  const record = asRecord(value, 'Invalid table state');
  if (!isPhase(record.phase) || !isStringArray(record.stock)) {
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
  const askCounts: Record<string, number> = {};
  if (record.askCounts !== undefined) {
    const counts = asRecord(record.askCounts, 'Invalid table state');
    for (const [key, count] of Object.entries(counts)) {
      if (
        !(key in hands) ||
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        throw new Error('Invalid table state');
      }
      askCounts[key] = count;
    }
  }
  return {
    phase: record.phase,
    hands,
    stock: record.stock.slice(),
    books: readBooks(record.books),
    turnSeatIndex: record.turnSeatIndex,
    winnerSeatIndex: record.winnerSeatIndex,
    lastAsk: readLastAsk(record.lastAsk),
    askCounts,
  };
}

export function readGoFishIntent(value: unknown): GoFishIntent {
  const record = asRecord(value, 'Invalid intent');
  if (
    record.type !== 'ask' ||
    !isSeatIndex(record.targetSeat) ||
    !isRank(record.rank)
  ) {
    throw new Error('Invalid intent');
  }
  return {
    type: 'ask',
    targetSeat: record.targetSeat,
    rank: record.rank,
  };
}

export function readGoFishEventNote(value: unknown): GoFishEventNote | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const note = value as Record<string, unknown>;
  if (
    note.kind !== 'ask' ||
    !isSeatIndex(note.from) ||
    !isSeatIndex(note.to) ||
    !isRank(note.rank) ||
    !isSeatIndex(note.given) ||
    typeof note.drawn !== 'boolean'
  ) {
    return null;
  }
  return {
    kind: 'ask',
    from: note.from,
    to: note.to,
    rank: note.rank,
    given: note.given,
    drawn: note.drawn,
  };
}

function notStartedState(): GoFishState {
  return {
    phase: 'lobby',
    hands: {},
    stock: [],
    books: {},
    turnSeatIndex: null,
    lastAsk: null,
    winnerSeatIndex: null,
  };
}

function freshDeck(): string[] {
  const deck: string[] = [];
  for (const suit of GO_FISH_SUITS) {
    for (const rank of GO_FISH_RANKS) {
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

function copyHands(hands: Record<string, string[]>): Record<string, string[]> {
  const copy: Record<string, string[]> = {};
  for (const key of Object.keys(hands)) {
    const hand = hands[key] ?? [];
    copy[key] = hand.slice();
  }
  return copy;
}

function copyBooks(
  books: Record<string, GoFishBook[]>,
): Record<string, GoFishBook[]> {
  const copy: Record<string, GoFishBook[]> = {};
  for (const key of Object.keys(books)) {
    const list = books[key] ?? [];
    copy[key] = list.map((book) => ({
      rank: book.rank,
      cards: book.cards.slice(),
    }));
  }
  return copy;
}

function copyLastAsk(lastAsk: GoFishLastAsk | null): GoFishLastAsk | null {
  if (lastAsk === null) {
    return null;
  }
  return {
    from: lastAsk.from,
    to: lastAsk.to,
    rank: lastAsk.rank,
    given: lastAsk.given,
    drawn: lastAsk.drawn,
  };
}

function holdsRank(hand: readonly string[], rank: GoFishRank): boolean {
  for (const card of hand) {
    if (rankOfCard(card) === rank) {
      return true;
    }
  }
  return false;
}

/**
 * Four of one rank leave the hand as a book.
 * Fewer than four stay, in their previous order.
 */
function layBooks(
  hand: readonly string[],
  already: readonly GoFishBook[],
): { hand: string[]; books: GoFishBook[] } {
  const groups = new Map<string, string[]>();
  for (const card of hand) {
    const rank = rankOfCard(card);
    if (!rank) {
      continue;
    }
    const group = groups.get(rank);
    if (group) {
      group.push(card);
    } else {
      groups.set(rank, [card]);
    }
  }
  const books = already.map((book) => ({
    rank: book.rank,
    cards: book.cards.slice(),
  }));
  const booked = new Set<string>();
  for (const [rank, group] of groups) {
    if (group.length >= BOOK_SIZE && isRank(rank)) {
      books.push({ rank, cards: group.slice(0, BOOK_SIZE) });
      booked.add(rank);
    }
  }
  if (booked.size === 0) {
    return { hand: hand.slice(), books };
  }
  const kept: string[] = [];
  const dropped = new Map<string, number>();
  for (const card of hand) {
    const rank = rankOfCard(card);
    if (rank && booked.has(rank)) {
      const used = dropped.get(rank) ?? 0;
      if (used < BOOK_SIZE) {
        dropped.set(rank, used + 1);
        continue;
      }
    }
    kept.push(card);
  }
  return { hand: kept, books };
}

function cardsPerSeat(playerCount: number): number {
  if (playerCount <= 3) {
    return DEAL_FEW;
  }
  return DEAL_MANY;
}

function dealState(players: GameSeat[], tableId: string): GoFishState {
  const ordered = seatsInOrder(players);
  if (ordered.length === 0) {
    return notStartedState();
  }
  const deck = shuffleDeck(freshDeck(), tableId);
  const hands: Record<string, string[]> = {};
  const books: Record<string, GoFishBook[]> = {};
  for (const seat of ordered) {
    const key = handKey(seat.seatIndex);
    hands[key] = [];
    books[key] = [];
  }
  const perSeat = cardsPerSeat(ordered.length);
  const dealCount = Math.min(deck.length, perSeat * ordered.length);
  for (let i = 0; i < dealCount; i += 1) {
    const seat = ordered[i % ordered.length];
    if (!seat) {
      continue;
    }
    hands[handKey(seat.seatIndex)].push(deck[i] ?? '');
  }
  for (const seat of ordered) {
    const key = handKey(seat.seatIndex);
    const laid = layBooks(hands[key] ?? [], []);
    hands[key] = laid.hand;
    books[key] = laid.books;
  }
  return {
    phase: 'play',
    hands,
    stock: deck.slice(dealCount),
    books,
    turnSeatIndex: ordered[0]?.seatIndex ?? null,
    winnerSeatIndex: null,
    lastAsk: null,
  };
}

function seatsWithCards(hands: Record<string, string[]>): number[] {
  const holding: number[] = [];
  for (const seat of seatedIndexes(hands)) {
    const hand = hands[handKey(seat)] ?? [];
    if (hand.length > 0) {
      holding.push(seat);
    }
  }
  return holding;
}

function winnerOf(
  books: Record<string, GoFishBook[]>,
  hands: Record<string, string[]>,
): number | null {
  const seats = new Set<number>();
  for (const key of Object.keys(books)) {
    seats.add(Number(key));
  }
  for (const key of Object.keys(hands)) {
    seats.add(Number(key));
  }
  const ordered = [...seats].sort((a, b) => a - b);
  let best = -1;
  const winners: number[] = [];
  for (const seat of ordered) {
    const score = books[handKey(seat)]?.length ?? 0;
    if (score > best) {
      best = score;
      winners.length = 0;
      winners.push(seat);
    } else if (score === best) {
      winners.push(seat);
    }
  }
  if (winners.length === 1) {
    return winners[0] ?? null;
  }
  return null;
}

function finish(state: GoFishState): GoFishState {
  return {
    ...state,
    phase: 'finished',
    hands: copyHands(state.hands),
    stock: state.stock.slice(),
    books: copyBooks(state.books),
    turnSeatIndex: null,
    winnerSeatIndex: winnerOf(state.books, state.hands),
    lastAsk: copyLastAsk(state.lastAsk),
  };
}

/** The stock is gone and fewer than two players can still be asked. */
function stuck(state: GoFishState): boolean {
  if (state.stock.length > 0) {
    return false;
  }
  return seatsWithCards(state.hands).length < 2;
}

function drawOne(
  stock: readonly string[],
): { card: string; stock: string[] } | null {
  if (stock.length === 0) {
    return null;
  }
  const card = stock[0];
  if (!card) {
    return null;
  }
  return { card, stock: stock.slice(1) };
}

/** An empty hand draws one stock card so that seat can ask. */
function fillHand(
  hand: readonly string[],
  stock: readonly string[],
): { hand: string[]; stock: string[] } {
  if (hand.length > 0 || stock.length === 0) {
    return { hand: hand.slice(), stock: stock.slice() };
  }
  const drawn = drawOne(stock);
  if (!drawn) {
    return { hand: hand.slice(), stock: stock.slice() };
  }
  return { hand: [drawn.card], stock: drawn.stock };
}

function indexAfter(seats: readonly number[], after: number): number {
  for (let i = 0; i < seats.length; i += 1) {
    if ((seats[i] ?? 0) > after) {
      return i;
    }
  }
  return 0;
}

function passTurn(state: GoFishState, from: number): GoFishState {
  if (stuck(state)) {
    return finish(state);
  }
  const seats = seatedIndexes(state.hands);
  if (seats.length < 2) {
    return finish(state);
  }
  let hands = copyHands(state.hands);
  let stock = state.stock.slice();
  const start = indexAfter(seats, from);
  for (let n = 0; n < seats.length; n += 1) {
    const seat = seats[(start + n) % seats.length];
    if (seat === undefined) {
      continue;
    }
    const key = handKey(seat);
    const filled = fillHand(hands[key] ?? [], stock);
    hands = { ...hands, [key]: filled.hand };
    stock = filled.stock;
    if (filled.hand.length === 0) {
      continue;
    }
    const next: GoFishState = {
      ...state,
      phase: 'play',
      hands,
      stock,
      books: copyBooks(state.books),
      turnSeatIndex: seat,
      winnerSeatIndex: null,
      lastAsk: copyLastAsk(state.lastAsk),
    };
    if (stuck(next)) {
      return finish(next);
    }
    return next;
  }
  return finish({
    ...state,
    phase: state.phase,
    hands,
    stock,
    books: copyBooks(state.books),
    turnSeatIndex: state.turnSeatIndex,
    winnerSeatIndex: state.winnerSeatIndex,
    lastAsk: copyLastAsk(state.lastAsk),
  });
}

function applyAsk(
  state: GoFishState,
  actor: number,
  target: number,
  rank: GoFishRank,
): GoFishState {
  if (state.phase !== 'play') {
    throw new Error('Invalid intent');
  }
  const actorKey = handKey(actor);
  const targetKey = handKey(target);
  if (target === actor || !(targetKey in state.hands)) {
    throw new Error('Invalid intent');
  }
  const actorHand = state.hands[actorKey];
  const targetHand = state.hands[targetKey];
  if (!actorHand || !targetHand || !holdsRank(actorHand, rank)) {
    throw new Error('Invalid intent');
  }
  const given: string[] = [];
  const kept: string[] = [];
  for (const card of targetHand) {
    if (rankOfCard(card) === rank) {
      given.push(card);
    } else {
      kept.push(card);
    }
  }
  const hands = copyHands(state.hands);
  hands[targetKey] = kept;
  hands[actorKey] = actorHand.concat(given);
  let books = copyBooks(state.books);
  const laid = layBooks(hands[actorKey] ?? [], books[actorKey] ?? []);
  hands[actorKey] = laid.hand;
  books = { ...books, [actorKey]: laid.books };

  let stock = state.stock.slice();
  let drawn: string | null = null;
  if (given.length === 0) {
    const take = drawOne(stock);
    if (take) {
      drawn = take.card;
      stock = take.stock;
      const withDraw = layBooks(
        (hands[actorKey] ?? []).concat(drawn),
        books[actorKey] ?? [],
      );
      hands[actorKey] = withDraw.hand;
      books = { ...books, [actorKey]: withDraw.books };
    }
  }

  const matchedDraw = drawn !== null && rankOfCard(drawn) === rank;
  const keepTurn = given.length > 0 || matchedDraw;
  if (keepTurn && (hands[actorKey] ?? []).length === 0) {
    const filled = fillHand(hands[actorKey] ?? [], stock);
    hands[actorKey] = filled.hand;
    stock = filled.stock;
  }

  const lastAsk: GoFishLastAsk = {
    from: actor,
    to: target,
    rank,
    given: given.length,
    drawn,
  };
  let next: GoFishState = {
    phase: 'play',
    hands,
    stock,
    books,
    turnSeatIndex: actor,
    winnerSeatIndex: null,
    lastAsk,
    askCounts: {
      ...state.askCounts,
      [actorKey]: (state.askCounts?.[actorKey] ?? 0) + 1,
    },
  };
  if (!keepTurn || (next.hands[actorKey] ?? []).length === 0) {
    next = passTurn(next, actor);
    return { ...next, lastAsk };
  }
  if (stuck(next)) {
    next = finish(next);
    return { ...next, lastAsk };
  }
  return next;
}

function leaveSeat(state: GoFishState, seatIndex: number): GoFishState {
  const key = handKey(seatIndex);
  if (!(key in state.hands) && !(key in state.books)) {
    return {
      ...state,
      phase: state.phase,
      hands: copyHands(state.hands),
      stock: state.stock.slice(),
      books: copyBooks(state.books),
      turnSeatIndex: state.turnSeatIndex,
      winnerSeatIndex: state.winnerSeatIndex,
      lastAsk: copyLastAsk(state.lastAsk),
    };
  }
  const hands = copyHands(state.hands);
  const leavingHand = hands[key] ?? [];
  delete hands[key];
  const books = copyBooks(state.books);
  const leavingBooks = books[key] ?? [];
  delete books[key];
  const returned = leavingHand.slice();
  for (const book of leavingBooks) {
    for (const card of book.cards) {
      returned.push(card);
    }
  }
  const next: GoFishState = {
    phase: state.phase,
    hands,
    stock: state.stock.concat(returned),
    books,
    turnSeatIndex:
      state.turnSeatIndex === seatIndex ? null : state.turnSeatIndex,
    winnerSeatIndex:
      state.winnerSeatIndex === seatIndex ? null : state.winnerSeatIndex,
    lastAsk: copyLastAsk(state.lastAsk),
    askCounts: { ...state.askCounts },
  };
  delete next.askCounts?.[key];
  if (next.phase === 'finished') {
    return {
      ...next,
      winnerSeatIndex: winnerOf(next.books, next.hands),
    };
  }
  if (next.phase !== 'play') {
    return next;
  }
  if (seatedIndexes(next.hands).length < 2) {
    return finish(next);
  }
  if (state.turnSeatIndex === seatIndex) {
    return passTurn(next, seatIndex);
  }
  return next;
}

/**
 * Go Fish rules for gameType `go_fish`.
 * `initialState([], table)` is the not-started lobby. Seated players are dealt.
 */
export const goFishRules = {
  initialState(players: GameSeat[], table: GameTable): GoFishState {
    if (players.length === 0) {
      return notStartedState();
    }
    return dealState(players, table.id);
  },
  applyIntent(
    prev: GoFishState,
    intent: GoFishIntent,
    ctx: IntentContext,
  ): GoFishState {
    const state = readGoFishState(prev);
    const action = readGoFishIntent(intent);
    if (state.turnSeatIndex !== ctx.seat.seatIndex) {
      throw new Error('Not your turn');
    }
    return applyAsk(state, ctx.seat.seatIndex, action.targetSeat, action.rank);
  },
  eventNote(
    prev: GoFishState,
    intent: GoFishIntent,
    next: GoFishState,
    ctx: IntentContext,
  ): GoFishEventNote | null {
    void prev;
    void intent;
    const after = readGoFishState(next);
    const ask = after.lastAsk;
    if (ask === null || ask.from !== ctx.seat.seatIndex) {
      return null;
    }
    return {
      kind: 'ask',
      from: ask.from,
      to: ask.to,
      rank: ask.rank,
      given: ask.given,
      drawn: ask.drawn !== null,
    };
  },
  onPlayerJoin(prev: GoFishState, seat: GameSeat): GoFishState {
    void seat;
    return readGoFishState(prev);
  },
  onPlayerLeave(prev: GoFishState, seat: GameSeat): GoFishState {
    return leaveSeat(readGoFishState(prev), seat.seatIndex);
  },
} satisfies GameRules<GoFishState, GoFishIntent>;
