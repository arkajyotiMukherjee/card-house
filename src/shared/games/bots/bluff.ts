import {
  BLUFF_GAME_TYPE,
  BLUFF_RANKS,
  type BluffIntent,
  type BluffRank,
  type BluffState,
  rankOfCard,
} from '../bluff.ts';
import { byLowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

function handOf(state: BluffState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

function rankIndex(rank: BluffRank): number {
  const index = BLUFF_RANKS.indexOf(rank);
  if (rank === 'A') {
    return BLUFF_RANKS.length;
  }
  return index < 0 ? BLUFF_RANKS.length : index;
}

function byRank(left: string, right: string): number {
  const leftRank = rankOfCard(left);
  const rightRank = rankOfCard(right);
  const delta =
    (leftRank ? rankIndex(leftRank) : 99) -
    (rightRank ? rankIndex(rightRank) : 99);
  if (delta !== 0) {
    return delta;
  }
  return byLowestCard(left, right);
}

export const bluffStrategy: BotStrategy<BluffState, BluffIntent> = {
  gameType: BLUFF_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const last = state.lastPlay;
    if (last && last.cards.length === 4) {
      return { type: 'challenge' };
    }
    const hand = handOf(state, seatIndex);
    const matched = hand
      .filter((card) => rankOfCard(card) === state.requiredRank)
      .sort(byRank);
    if (matched.length > 0) {
      return { type: 'play', cards: matched.slice(0, 4) };
    }
    const ordered = hand.slice().sort(byRank);
    const card = ordered[0];
    if (card === undefined) {
      throw new Error('No card');
    }
    return { type: 'play', cards: [card] };
  },
};
