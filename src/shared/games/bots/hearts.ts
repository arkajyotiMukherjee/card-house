import {
  HEARTS_GAME_TYPE,
  QUEEN_OF_SPADES,
  type HeartsIntent,
  type HeartsState,
  cardSuit,
  playError,
} from '../hearts.ts';
import { byLowestCard, lowestCard, rankValue, seatIndexes } from './order.ts';
import type { BotStrategy } from './types.ts';

function handOf(state: HeartsState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

/** Queen of spades, then hearts, then the highest other cards. */
function penalty(card: string): number {
  if (card === QUEEN_OF_SPADES) {
    return 200;
  }
  if (cardSuit(card) === 'H') {
    return 50 + rankValue(card);
  }
  return rankValue(card);
}

function firstTrick(state: HeartsState): boolean {
  for (const cards of Object.values(state.tricksTaken)) {
    if (cards.length > 0) {
      return false;
    }
  }
  return true;
}

function passCards(hand: readonly string[]): string[] {
  const ordered = hand.slice().sort((left, right) => {
    const delta = penalty(right) - penalty(left);
    if (delta !== 0) {
      return delta;
    }
    return byLowestCard(left, right);
  });
  return ordered.slice(0, 3);
}

export const heartsStrategy: BotStrategy<HeartsState, HeartsIntent> = {
  gameType: HEARTS_GAME_TYPE,
  actingSeats(state) {
    if (state.phase === 'pass') {
      return seatIndexes(state.hands).filter(
        (seat) => state.passes[String(seat)] === undefined,
      );
    }
    if (state.phase === 'play' && state.turnSeatIndex !== null) {
      return [state.turnSeatIndex];
    }
    return [];
  },
  choose(state, seatIndex) {
    const hand = handOf(state, seatIndex);
    if (state.phase === 'pass') {
      return { type: 'pass', cards: passCards(hand) };
    }
    const legal = hand.filter(
      (card) => playError(state, seatIndex, card) === null,
    );
    let pool = legal;
    if (firstTrick(state) && legal.some((card) => card !== QUEEN_OF_SPADES)) {
      pool = legal.filter((card) => card !== QUEEN_OF_SPADES);
    }
    return { type: 'play', card: lowestCard(pool) };
  },
};
