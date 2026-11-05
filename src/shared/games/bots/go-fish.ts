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

export const goFishStrategy: BotStrategy<GoFishState, GoFishIntent> = {
  gameType: GO_FISH_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const opponents = seatIndexes(state.hands).filter(
      (seat) => seat !== seatIndex,
    );
    const holding = opponents.filter(
      (seat) => state.hands[String(seat)]?.length,
    );
    const targets = holding.length > 0 ? holding : opponents;
    if (targets.length === 0) {
      throw new Error('No seat to ask');
    }
    const key = String(seatIndex);
    const held = new Set((state.hands[key] ?? []).map(rankOfCard));
    const ranks = GO_FISH_RANKS.filter((rank) => held.has(rank));
    if (ranks.length === 0) {
      throw new Error('No card');
    }
    // Cover every rank/target pair if hands stop changing after the stock empties.
    const count = state.askCounts?.[key] ?? 0;
    const targetSeat = targets[count % targets.length]!;
    const rank: GoFishRank =
      ranks[Math.floor(count / targets.length) % ranks.length]!;
    return { type: 'ask', targetSeat, rank };
  },
};
