import {
  CRAZY_EIGHTS_GAME_TYPE,
  CRAZY_EIGHTS_SUITS,
  type CrazyEightsIntent,
  type CrazyEightsState,
  type CrazyEightsSuit,
  cardIsPlayable,
  rankOfCard,
  seatMustPass,
  suitOfCard,
} from '../crazy-eights.ts';
import { lowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

function handOf(state: CrazyEightsState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

/** Suit this seat holds the most of. Ties use the earliest suit id. */
function namedSuit(hand: readonly string[]): CrazyEightsSuit {
  let best: CrazyEightsSuit = CRAZY_EIGHTS_SUITS[0];
  let bestCount = -1;
  for (const suit of CRAZY_EIGHTS_SUITS) {
    let count = 0;
    for (const card of hand) {
      if (suitOfCard(card) === suit) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = suit;
      bestCount = count;
    }
  }
  return best;
}

export const crazyEightsStrategy: BotStrategy<
  CrazyEightsState,
  CrazyEightsIntent
> = {
  gameType: CRAZY_EIGHTS_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    const hand = handOf(state, seatIndex);
    const legal = hand.filter((card) => cardIsPlayable(state, card));
    if (legal.length > 0) {
      const card = lowestCard(legal);
      if (rankOfCard(card) === '8') {
        const rest = hand.filter((held) => held !== card);
        return { type: 'play', card, suit: namedSuit(rest) };
      }
      return { type: 'play', card };
    }
    if (seatMustPass(state, seatIndex)) {
      return { type: 'pass' };
    }
    return { type: 'draw' };
  },
};
