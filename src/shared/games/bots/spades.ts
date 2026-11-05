import {
  SPADES_GAME_TYPE,
  type SpadesIntent,
  type SpadesState,
  spadesCardRank,
  spadesCardSuit,
} from '../spades.ts';
import { lowestCard, rankValue, seatIndexes, turnThen } from './order.ts';
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
  const hand = handOf(state, seatIndex);
  const spades = hand.filter((card) => spadesCardSuit(card) === 'S');
  // Low trump cards are not all guaranteed tricks. Long trump holdings and
  // protected side honors are more useful than counting every king as a win.
  let bid = Math.max(0, spades.length - 3);
  for (const card of hand) {
    const suit = spadesCardSuit(card);
    const rank = spadesCardRank(card);
    const length = hand.filter((held) => spadesCardSuit(held) === suit).length;
    if (rank === 'A') bid += 1;
    else if (rank === 'K' && length >= 2) bid += suit === 'S' ? 1 : 0.5;
    else if (rank === 'Q' && length >= 3) bid += 0.5;
  }
  // Nil needs a dedicated avoidance strategy; this policy plays for tricks.
  return Math.min(13, Math.max(1, Math.floor(bid)));
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
    const led = state.trick[0] && spadesCardSuit(state.trick[0].card);
    if (!led) {
      const aces = legal.filter((card) => spadesCardRank(card) === 'A');
      const quiet = legal.filter((card) => spadesCardSuit(card) !== 'S');
      return {
        type: 'play',
        card: lowestCard(aces.length ? aces : quiet.length ? quiet : legal),
      };
    }
    const strength = (card: string): number => {
      const suit = spadesCardSuit(card);
      return (suit === 'S' ? 100 : suit === led ? 50 : 0) + rankValue(card);
    };
    let winner = state.trick[0]!;
    for (const played of state.trick) {
      if (strength(played.card) > strength(winner.card)) winner = played;
    }
    // Do not spend a winning card over our partner's winning trick.
    if (winner.seat % 2 === seatIndex % 2) {
      return { type: 'play', card: lowestCard(legal) };
    }
    const winners = legal.filter(
      (card) => strength(card) > strength(winner.card),
    );
    winners.sort((a, b) => strength(a) - strength(b));
    return { type: 'play', card: winners[0] ?? lowestCard(legal) };
  },
};
