import {
  POKER_GAME_TYPE,
  type PokerIntent,
  type PokerState,
  type PokerVariation,
  bestPokerHand,
  pokerBetRange,
  pokerCallAmount,
  pokerCanCall,
  pokerCanCheck,
  pokerCanDiscard,
  pokerCanFold,
  pokerRaiseRange,
  rankOfPokerCard,
  suitOfPokerCard,
} from '../poker.ts';
import { byLowestCard, lowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

const RANK_SCORE: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
};

type HandClass = 'strong' | 'playable' | 'weak';

function holeOf(state: PokerState, seatIndex: number): string[] {
  return state.seats[String(seatIndex)]?.hole ?? [];
}

function rankScore(card: string): number {
  const rank = rankOfPokerCard(card);
  if (rank === null) {
    return 0;
  }
  return RANK_SCORE[rank] ?? 0;
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

function topPair(hole: readonly string[]): number {
  const seen = new Map<number, number>();
  let best = 0;
  for (const card of hole) {
    const score = rankScore(card);
    if (score <= 0) {
      continue;
    }
    const count = (seen.get(score) ?? 0) + 1;
    seen.set(score, count);
    if (count >= 2 && score > best) {
      best = score;
    }
  }
  return best;
}

/** Two hole cards share a suit and sit within two ranks of each other. */
function speculativeDraw(hole: readonly string[]): boolean {
  for (let left = 0; left < hole.length; left += 1) {
    const leftCard = hole[left];
    if (leftCard === undefined) {
      continue;
    }
    for (let right = left + 1; right < hole.length; right += 1) {
      const rightCard = hole[right];
      if (rightCard === undefined) {
        continue;
      }
      const leftSuit = suitOfPokerCard(leftCard);
      const rightSuit = suitOfPokerCard(rightCard);
      if (leftSuit === null || leftSuit !== rightSuit) {
        continue;
      }
      const high = Math.max(rankScore(leftCard), rankScore(rightCard));
      const gap = Math.abs(rankScore(leftCard) - rankScore(rightCard));
      if (high >= 5 && gap > 0 && gap <= 2) {
        return true;
      }
    }
  }
  return false;
}

function classifyPreflop(
  hole: readonly string[],
  _variation: PokerVariation,
): HandClass {
  const pair = topPair(hole);
  if (pair >= 10) {
    return 'strong';
  }
  if (pair > 0) {
    return 'playable';
  }
  const scores = hole.map(rankScore).filter((score) => score > 0);
  const high = scores.reduce((best, score) => Math.max(best, score), 0);
  const broadway = scores.filter((score) => score >= 10).length;
  const suitedAce = high === 14 && speculativeDraw(hole);
  if (high === 14 && (suitedAce || scores.some((score) => score >= 11))) {
    return 'strong';
  }
  if (broadway >= 2) {
    return 'playable';
  }
  if (speculativeDraw(hole) || high === 14) {
    return 'playable';
  }
  return 'weak';
}

function flushDraw(hole: readonly string[], board: readonly string[]): boolean {
  const suits = new Map<string, { hole: number; total: number }>();
  for (const card of hole) {
    const suit = suitOfPokerCard(card);
    if (suit === null) {
      continue;
    }
    const row = suits.get(suit) ?? { hole: 0, total: 0 };
    row.hole += 1;
    row.total += 1;
    suits.set(suit, row);
  }
  for (const card of board) {
    const suit = suitOfPokerCard(card);
    if (suit === null) {
      continue;
    }
    const row = suits.get(suit) ?? { hole: 0, total: 0 };
    row.total += 1;
    suits.set(suit, row);
  }
  for (const row of suits.values()) {
    if (row.hole > 0 && row.total === 4) {
      return true;
    }
  }
  return false;
}

function straightDraw(
  hole: readonly string[],
  board: readonly string[],
): boolean {
  const holeRanks = new Set<number>();
  const all = new Set<number>();
  for (const card of hole) {
    const score = rankScore(card);
    if (score <= 0) {
      continue;
    }
    holeRanks.add(score);
    all.add(score);
  }
  for (const card of board) {
    const score = rankScore(card);
    if (score > 0) {
      all.add(score);
    }
  }
  if (all.has(14)) {
    all.add(1);
  }
  if (holeRanks.has(14)) {
    holeRanks.add(1);
  }
  for (let low = 1; low <= 10; low += 1) {
    let count = 0;
    let fromHole = false;
    for (let rank = low; rank < low + 5; rank += 1) {
      if (!all.has(rank)) {
        continue;
      }
      count += 1;
      if (holeRanks.has(rank)) {
        fromHole = true;
      }
    }
    if (count >= 4 && fromHole) {
      return true;
    }
  }
  return false;
}

/**
 * Strong hands bet or raise. Playable hands continue.
 * Weak hands only fold when the call costs chips.
 */
function classify(state: PokerState, seatIndex: number): HandClass {
  const hole = holeOf(state, seatIndex);
  if (state.board.length < 3) {
    return classifyPreflop(hole, state.variation);
  }
  const best = bestPokerHand(state.variation, hole, state.board);
  const category = best.score[0] ?? 0;
  if (category >= 2) {
    return 'strong';
  }
  if (category === 1) {
    return (best.score[1] ?? 0) >= 10 ? 'strong' : 'playable';
  }
  if (flushDraw(hole, state.board) || straightDraw(hole, state.board)) {
    return 'playable';
  }
  return 'weak';
}

function callCosts(state: PokerState, seatIndex: number): boolean {
  return pokerCallAmount(state, seatIndex) > 0;
}

/** A large call, measured against the pot, is paid rather than raised. */
function callIsExpensive(state: PokerState, seatIndex: number): boolean {
  const price = pokerCallAmount(state, seatIndex);
  if (price <= 0) {
    return false;
  }
  return price * 2 > Math.max(state.pot, 1);
}

function sizedStake(
  range: { min: number; max: number },
  extra: number,
): number {
  const want = range.min + Math.max(0, extra);
  if (want > range.max) {
    return range.max;
  }
  return want;
}

/**
 * The street is still the blind price: nobody has bet past the big blind.
 * A strong hand opens or raises once here. A larger price is called,
 * so two strong hands do not raise each other all-in.
 */
function streetStillCheap(state: PokerState): boolean {
  return state.currentBet > 0 && state.currentBet <= state.bigBlind;
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
    const hand = classify(state, seatIndex);
    if (hand === 'strong' && !callIsExpensive(state, seatIndex)) {
      const bet = pokerBetRange(state, seatIndex);
      if (bet) {
        return { type: 'bet', amount: sizedStake(bet, state.bigBlind) };
      }
      if (streetStillCheap(state)) {
        const raise = pokerRaiseRange(state, seatIndex);
        if (raise) {
          return {
            type: 'raise',
            amount: sizedStake(raise, state.minRaise),
          };
        }
      }
    }
    if (pokerCanCheck(state, seatIndex)) {
      return { type: 'check' };
    }
    if (
      (hand === 'strong' || hand === 'playable') &&
      pokerCanCall(state, seatIndex)
    ) {
      return { type: 'call' };
    }
    if (
      hand === 'weak' &&
      callCosts(state, seatIndex) &&
      pokerCanFold(state, seatIndex)
    ) {
      return { type: 'fold' };
    }
    if (pokerCanCheck(state, seatIndex)) {
      return { type: 'check' };
    }
    if (pokerCanCall(state, seatIndex)) {
      return { type: 'call' };
    }
    if (pokerCanFold(state, seatIndex)) {
      return { type: 'fold' };
    }
    throw new Error('No poker action');
  },
};
