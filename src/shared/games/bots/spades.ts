import {
  SPADES_GAME_TYPE,
  type SpadesIntent,
  type SpadesState,
  spadesCardRank,
  spadesCardSuit,
} from '../spades.ts';
import { lowestCard, seatIndexes, turnThen } from './order.ts';
import type { BotStrategy } from './types.ts';

function handOf(state: SpadesState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

function legalCard(
  state: SpadesState,
  seatIndex: number,
  card: string,
): boolean {
  const suit = spadesCardSuit(card);
  const hand = handOf(state, seatIndex);
  if (suit === null || !hand.includes(card)) {
    return false;
  }
  if (state.trick.length === 0) {
    if (
      suit === 'S' &&
      !state.spadesBroken &&
      hand.some((held) => spadesCardSuit(held) !== 'S')
    ) {
      return false;
    }
    return true;
  }
  const led = spadesCardSuit(state.trick[0]?.card ?? '');
  if (
    led &&
    suit !== led &&
    hand.some((held) => spadesCardSuit(held) === led)
  ) {
    return false;
  }
  return true;
}

function bidOf(state: SpadesState, seatIndex: number): number {
  let bid = 0;
  for (const card of handOf(state, seatIndex)) {
    const suit = spadesCardSuit(card);
    const rank = spadesCardRank(card);
    if (suit === 'S') {
      bid += 1;
    } else if (rank === 'A' || rank === 'K') {
      bid += 1;
    }
  }
  if (bid < 0) {
    return 0;
  }
  if (bid > 13) {
    return 13;
  }
  return bid;
}

export const spadesStrategy: BotStrategy<SpadesState, SpadesIntent> = {
  gameType: SPADES_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play') {
      return [];
    }
    if (state.stage === 'bid') {
      const pending = seatIndexes(state.hands).filter(
        (seat) => state.bids[String(seat)] === null,
      );
      return turnThen(state.turnSeatIndex, pending);
    }
    if (state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    if (state.stage === 'bid') {
      return { type: 'bid', tricks: bidOf(state, seatIndex) };
    }
    const hand = handOf(state, seatIndex);
    const legal = hand.filter((card) => legalCard(state, seatIndex, card));
    const led =
      state.trick.length === 0
        ? null
        : spadesCardSuit(state.trick[0]?.card ?? '');
    if (led) {
      const follow = legal.filter((card) => spadesCardSuit(card) === led);
      if (follow.length > 0) {
        return { type: 'play', card: lowestCard(follow) };
      }
      const trumps = legal.filter((card) => spadesCardSuit(card) === 'S');
      if (trumps.length > 0) {
        return { type: 'play', card: lowestCard(trumps) };
      }
      return { type: 'play', card: lowestCard(legal) };
    }
    const quiet = legal.filter((card) => spadesCardSuit(card) !== 'S');
    return { type: 'play', card: lowestCard(quiet.length > 0 ? quiet : legal) };
  },
};
