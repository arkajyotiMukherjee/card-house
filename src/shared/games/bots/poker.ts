import {
  POKER_GAME_TYPE,
  type PokerIntent,
  type PokerState,
  bestPokerHand,
  pokerBetTo,
  pokerCanCall,
  pokerCanCheck,
  pokerCanDiscard,
  pokerCanFold,
  rankOfPokerCard,
} from '../poker.ts';
import { byLowestCard, lowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

function holeOf(state: PokerState, seatIndex: number): string[] {
  return state.seats[String(seatIndex)]?.hole ?? [];
}

function hasPairOrBetter(state: PokerState, seatIndex: number): boolean {
  const hole = holeOf(state, seatIndex);
  if (state.board.length >= 3) {
    const best = bestPokerHand(state.variation, hole, state.board);
    return (best.score[0] ?? 0) >= 1;
  }
  const counts = new Map<string, number>();
  for (const card of hole) {
    const rank = rankOfPokerCard(card);
    if (rank === null) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 2) {
      return true;
    }
  }
  return false;
}

function lowestUnpaired(hole: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const card of hole) {
    const rank = rankOfPokerCard(card);
    if (rank === null) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const unpaired = hole.filter((card) => {
    const rank = rankOfPokerCard(card);
    return rank !== null && counts.get(rank) === 1;
  });
  const pool = unpaired.length > 0 ? unpaired : hole.slice();
  return lowestCard(pool.slice().sort(byLowestCard));
}

export const pokerStrategy: BotStrategy<PokerState, PokerIntent> = {
  gameType: POKER_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    if (pokerCanDiscard(state, seatIndex)) {
      return {
        type: 'discard',
        card: lowestUnpaired(holeOf(state, seatIndex)),
      };
    }
    const strong = hasPairOrBetter(state, seatIndex);
    if (!strong && pokerCanCheck(state, seatIndex)) {
      return { type: 'check' };
    }
    if (strong) {
      const bet = pokerBetTo(state, seatIndex);
      if (bet !== null) {
        return { type: 'bet', amount: bet };
      }
      if (pokerCanCall(state, seatIndex)) {
        return { type: 'call' };
      }
    }
    if (pokerCanCheck(state, seatIndex)) {
      return { type: 'check' };
    }
    if (pokerCanFold(state, seatIndex)) {
      return { type: 'fold' };
    }
    if (pokerCanCall(state, seatIndex)) {
      return { type: 'call' };
    }
    throw new Error('No poker action');
  },
};
