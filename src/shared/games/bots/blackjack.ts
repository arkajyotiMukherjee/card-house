import {
  BLACKJACK_GAME_TYPE,
  type BlackjackIntent,
  type BlackjackState,
  blackjackTotal,
  rankOfBlackjackCard,
} from '../blackjack.ts';
import { seatIndexes, turnThen } from './order.ts';
import type { BotStrategy } from './types.ts';

export const blackjackStrategy: BotStrategy<BlackjackState, BlackjackIntent> = {
  gameType: BLACKJACK_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play') {
      return [];
    }
    if (state.step === 'bet') {
      const pending = seatIndexes(state.seats).filter((seat) => {
        const row = state.seats[String(seat)];
        return row !== undefined && row.bet === 0;
      });
      return turnThen(state.turnSeatIndex, pending);
    }
    if (state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    if (state.step === 'insurance') return { type: 'insurance', take: false };
    if (state.step === 'bet') {
      return { type: 'bet', amount: state.minBet ?? 10 };
    }
    const seat = state.seats[String(seatIndex)];
    const hand = seat?.hands[seat.handIndex];
    if (!seat || !hand) {
      throw new Error('No hand');
    }
    const left = rankOfBlackjackCard(hand.cards[0] ?? '');
    const right = rankOfBlackjackCard(hand.cards[1] ?? '');
    const pair = hand.cards.length === 2 && left !== null && left === right;
    const canSplit =
      pair && seat.hands.length < 4 && hand.bet > 0 && seat.chips >= hand.bet;
    if (canSplit && (left === 'A' || left === '8')) {
      return { type: 'split' };
    }
    const total = blackjackTotal(hand.cards);
    const canDouble =
      hand.cards.length === 2 && hand.bet > 0 && seat.chips >= hand.bet;
    if (canDouble && (total === 10 || total === 11)) {
      return { type: 'double' };
    }
    if (total < 17) {
      return { type: 'hit' };
    }
    return { type: 'stand' };
  },
};
