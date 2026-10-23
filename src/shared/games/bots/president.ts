import {
  PRESIDENT_GAME_TYPE,
  PRESIDENT_RANKS,
  type PresidentIntent,
  type PresidentRank,
  type PresidentState,
  presidentRankOf,
} from '../president.ts';
import { byLowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

const OPENING_CARD = '3C';

function handOf(state: PresidentState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

function rankIndex(rank: PresidentRank): number {
  const index = PRESIDENT_RANKS.indexOf(rank);
  return index < 0 ? PRESIDENT_RANKS.length : index;
}

function groups(hand: readonly string[]): Map<PresidentRank, string[]> {
  const byRank = new Map<PresidentRank, string[]>();
  for (const card of hand) {
    const rank = presidentRankOf(card);
    if (rank === null) {
      continue;
    }
    const held = byRank.get(rank) ?? [];
    held.push(card);
    byRank.set(rank, held);
  }
  return byRank;
}

export const presidentStrategy: BotStrategy<PresidentState, PresidentIntent> = {
  gameType: PRESIDENT_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const hand = handOf(state, seatIndex);
    if (state.openingLead) {
      if (!hand.includes(OPENING_CARD)) {
        throw new Error('Opening lead is missing the 3 of clubs');
      }
      return { type: 'play', cards: [OPENING_CARD] };
    }
    if (state.currentCount === 0 || state.currentRank === null) {
      const ordered = hand.slice().sort((left, right) => {
        const leftRank = presidentRankOf(left);
        const rightRank = presidentRankOf(right);
        const delta =
          (leftRank ? rankIndex(leftRank) : 99) -
          (rightRank ? rankIndex(rightRank) : 99);
        if (delta !== 0) {
          return delta;
        }
        return byLowestCard(left, right);
      });
      const card = ordered[0];
      if (card === undefined) {
        throw new Error('No card');
      }
      return { type: 'play', cards: [card] };
    }
    const need = state.currentCount;
    const floor = rankIndex(state.currentRank);
    let bestRank: PresidentRank | null = null;
    let bestCards: string[] = [];
    for (const [rank, cards] of groups(hand)) {
      if (cards.length < need || rankIndex(rank) <= floor) {
        continue;
      }
      if (bestRank === null || rankIndex(rank) < rankIndex(bestRank)) {
        bestRank = rank;
        bestCards = cards.slice().sort(byLowestCard).slice(0, need);
      }
    }
    if (bestRank === null) {
      return { type: 'pass' };
    }
    return { type: 'play', cards: bestCards };
  },
};
