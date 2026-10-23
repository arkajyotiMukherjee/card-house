import {
  RUMMY_GAME_TYPE,
  RUMMY_RANKS,
  type RummyIntent,
  type RummyMeld,
  type RummyState,
  cardPoints,
  rankOfCard,
} from '../rummy.ts';
import { byLowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

interface ParsedCard {
  card: string;
  suit: string;
  index: number;
}

function parseCard(card: string): ParsedCard | null {
  const rank = rankOfCard(card);
  if (rank === null) {
    return null;
  }
  return { card, suit: card.slice(-1), index: RUMMY_RANKS.indexOf(rank) };
}

function isConsecutive(indexes: readonly number[]): boolean {
  if (indexes.length === 0) {
    return false;
  }
  const sorted = indexes.slice().sort((left, right) => left - right);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== (sorted[index - 1] ?? 0) + 1) {
      return false;
    }
  }
  return true;
}

function isSet(cards: readonly string[]): boolean {
  if (cards.length < 3 || cards.length > 4) {
    return false;
  }
  const rank = rankOfCard(cards[0] ?? '');
  if (rank === null) {
    return false;
  }
  return cards.every((card) => rankOfCard(card) === rank);
}

function isRun(cards: readonly string[]): boolean {
  if (cards.length < 3) {
    return false;
  }
  const parsed: ParsedCard[] = [];
  for (const card of cards) {
    const item = parseCard(card);
    if (item === null) {
      return false;
    }
    parsed.push(item);
  }
  const suit = parsed[0]?.suit;
  if (!parsed.every((item) => item.suit === suit)) {
    return false;
  }
  const indexes = parsed.map((item) => item.index);
  if (isConsecutive(indexes)) {
    return true;
  }
  if (!indexes.includes(0)) {
    return false;
  }
  return isConsecutive(indexes.map((index) => (index === 0 ? 13 : index)));
}

function combinations(cards: readonly string[], count: number): string[][] {
  if (count === 0) {
    return [[]];
  }
  if (cards.length < count) {
    return [];
  }
  const head = cards[0];
  const tail = cards.slice(1);
  if (head === undefined) {
    return [];
  }
  const withHead = combinations(tail, count - 1).map((row) => [head, ...row]);
  return withHead.concat(combinations(tail, count));
}

function meldKey(cards: readonly string[]): string {
  return cards.slice().sort(byLowestCard).join(',');
}

function meldsIn(hand: readonly string[]): string[][] {
  const found: string[][] = [];
  const seen = new Set<string>();
  const limit = Math.min(hand.length, 7);
  for (let count = 3; count <= limit; count += 1) {
    for (const cards of combinations(hand, count)) {
      if (!isSet(cards) && !isRun(cards)) {
        continue;
      }
      const key = meldKey(cards);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      found.push(cards);
    }
  }
  found.sort((left, right) => {
    const leftKey = meldKey(left);
    const rightKey = meldKey(right);
    if (leftKey < rightKey) {
      return -1;
    }
    if (leftKey > rightKey) {
      return 1;
    }
    return 0;
  });
  return found;
}

function discardCompletes(hand: readonly string[], upcard: string): boolean {
  for (const meld of meldsIn(hand.concat(upcard))) {
    if (meld.includes(upcard)) {
      return true;
    }
  }
  return false;
}

function layoff(
  hand: readonly string[],
  melds: readonly RummyMeld[],
): { meldIndex: number; cards: string[] } | null {
  let bestIndex = -1;
  let bestCard = '';
  for (let index = 0; index < melds.length; index += 1) {
    const meld = melds[index];
    if (!meld) {
      continue;
    }
    const beforeSet = isSet(meld.cards);
    const beforeRun = isRun(meld.cards);
    for (const card of hand) {
      const combined = meld.cards.concat(card);
      const kept =
        (beforeSet && isSet(combined)) || (beforeRun && isRun(combined));
      if (!kept) {
        continue;
      }
      if (
        bestCard === '' ||
        byLowestCard(card, bestCard) < 0 ||
        (card === bestCard && index < bestIndex)
      ) {
        bestCard = card;
        bestIndex = index;
      }
    }
  }
  if (bestIndex < 0) {
    return null;
  }
  return { meldIndex: bestIndex, cards: [bestCard] };
}

function highestDeadwood(hand: readonly string[]): string {
  const first = hand[0];
  if (first === undefined) {
    throw new Error('No card');
  }
  let best = first;
  for (let index = 1; index < hand.length; index += 1) {
    const card = hand[index];
    if (card === undefined) {
      continue;
    }
    const points = cardPoints(card) - cardPoints(best);
    if (points > 0 || (points === 0 && byLowestCard(card, best) < 0)) {
      best = card;
    }
  }
  return best;
}

export const rummyStrategy: BotStrategy<RummyState, RummyIntent> = {
  gameType: RUMMY_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const hand = state.hands[String(seatIndex)] ?? [];
    if (!state.drawn) {
      const upcard = state.discardPile.at(-1);
      if (
        upcard &&
        (state.stock.length === 0 || discardCompletes(hand, upcard))
      ) {
        return { type: 'draw', source: 'discard' };
      }
      return { type: 'draw', source: 'stock' };
    }
    const meld = meldsIn(hand)[0];
    if (meld) {
      return { type: 'meld', cards: meld };
    }
    const laid = layoff(hand, state.melds);
    if (laid) {
      return { type: 'layoff', meldIndex: laid.meldIndex, cards: laid.cards };
    }
    return { type: 'discard', card: highestDeadwood(hand) };
  },
};
