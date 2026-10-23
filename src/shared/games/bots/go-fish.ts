import {
  GO_FISH_GAME_TYPE,
  GO_FISH_RANKS,
  type GoFishIntent,
  type GoFishRank,
  type GoFishState,
  rankOfCard,
} from '../go-fish.ts';
import { seatIndexes } from './order.ts';
import type { BotStrategy } from './types.ts';

function rankIndex(rank: GoFishRank): number {
  if (rank === 'A') {
    return GO_FISH_RANKS.length;
  }
  const index = GO_FISH_RANKS.indexOf(rank);
  return index < 0 ? GO_FISH_RANKS.length : index;
}

export const goFishStrategy: BotStrategy<GoFishState, GoFishIntent> = {
  gameType: GO_FISH_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const seats = seatIndexes(state.hands);
    const at = seats.indexOf(seatIndex);
    const target = seats[(at + 1) % seats.length];
    if (target === undefined || target === seatIndex) {
      throw new Error('No seat to ask');
    }
    const hand = state.hands[String(seatIndex)] ?? [];
    let rank: GoFishRank | null = null;
    for (const card of hand) {
      const held = rankOfCard(card);
      if (held === null) {
        continue;
      }
      if (rank === null || rankIndex(held) < rankIndex(rank)) {
        rank = held;
      }
    }
    if (rank === null) {
      throw new Error('No card');
    }
    return { type: 'ask', targetSeat: target, rank };
  },
};
