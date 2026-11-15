import {
  blackjackTotal,
  type BlackjackHand,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import type { DriverSeat } from './game-driver';

export const BLACKJACK_ACTIONS = { x: 676, y: 442, w: 260, h: 88 } as const;
export const BLACKJACK_HAND = { x: 220, y: 436, w: 436, h: 96 } as const;
export const BLACKJACK_DEALER = { x: 480, y: 134 } as const;
export interface BlackjackRailSeat {
  seat: DriverSeat;
  x: number;
  y: number;
  edge: 'left' | 'right';
}
/** The house owns the top rail; four player groups use two quiet side rails. */
export function blackjackRailSeats(
  seats: readonly DriverSeat[],
): BlackjackRailSeat[] {
  return seats
    .filter((seat) => !seat.self)
    .slice(0, 4)
    .map((seat, index) => ({
      seat,
      x: index < 2 ? 8 : 784,
      y: index % 2 === 0 ? 162 : 330,
      edge: index < 2 ? 'left' : 'right',
    }));
}
export function blackjackFooterSeat(
  seats: readonly DriverSeat[],
): DriverSeat | undefined {
  return (
    seats.find((seat) => seat.self) ?? (seats.length > 4 ? seats[4] : undefined)
  );
}
export function blackjackCardPageSize(mobile: boolean, paged = false): number {
  const width = mobile ? 54 : 44,
    step = mobile ? 58 : 52;
  return Math.floor(((paged ? 364 : 436) - width) / step) + 1;
}
export function blackjackLocalPositions(
  count: number,
  mobile: boolean,
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 438 + (index - (count - 1) / 2) * (mobile ? 58 : 52),
    y: 484,
  }));
}
export function blackjackPublicPositions(
  count: number,
  y = 334,
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 480 + (index - (count - 1) / 2) * 56,
    y,
  }));
}
export function blackjackActionBoxes(
  count: number,
): { x: number; y: number; w: number; h: number }[] {
  if (count === 1) return [{ x: 676, y: 466, w: 260, h: 44 }];
  if (count === 2)
    return [
      { x: 676, y: 442, w: 260, h: 40 },
      { x: 676, y: 490, w: 260, h: 40 },
    ];
  if (count === 3)
    return [
      { x: 676, y: 442, w: 126, h: 40 },
      { x: 810, y: 442, w: 126, h: 40 },
      { x: 676, y: 490, w: 260, h: 40 },
    ];
  if (count <= 4)
    return Array.from({ length: count }, (_, index) => ({
      x: 676 + (index % 2) * 134,
      y: 442 + Math.floor(index / 2) * 48,
      w: 126,
      h: 40,
    }));
  return [0, 1, 2]
    .map((index) => ({ x: 676 + index * 88, y: 442, w: 84, h: 40 }))
    .concat([
      { x: 676, y: 490, w: 126, h: 40 },
      { x: 810, y: 490, w: 126, h: 40 },
    ]);
}
export function blackjackHandCaption(
  hand: BlackjackHand,
  result?: string,
): string {
  const total = blackjackTotal(hand.cards);
  return `${total > 21 ? `Bust ${total}` : `Total ${total}`} · Bet ${hand.bet.toLocaleString('en-US')}${result ? ` · ${result === 'blackjack' ? 'Blackjack' : result[0].toUpperCase() + result.slice(1)}` : hand.done && total <= 21 ? ' · Done' : ''}`;
}
export function blackjackShownDealer(state: BlackjackState): string {
  return state.holeHidden
    ? 'Dealer · Hole hidden'
    : state.dealer.length
      ? `Dealer · ${blackjackTotal(state.dealer) > 21 ? 'Bust ' : ''}${blackjackTotal(state.dealer)}`
      : 'Dealer';
}
