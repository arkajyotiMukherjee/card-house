import type { SpadesState } from '../../src/shared/games/spades';
import type { DriverSeat } from './game-driver';
import { seatTeam } from './spades-layout';

export const SPADES_PLAY = { x: 752, y: 442, w: 184, h: 40 };
export const SPADES_SCORES = { x: 752, y: 490, w: 184, h: 40 };
export const SPADES_PUBLIC_SCALE = 1.25;

/** Partners sit opposite the local player rather than inheriting a generic side slot. */
export function spadesRailSeats(seats: readonly DriverSeat[]): DriverSeat[] {
  const me = seats.find((seat) => seat.self);
  if (!me) return [...seats];
  return [
    me,
    ...seats
      .filter((seat) => !seat.self)
      .sort(
        (a, b) =>
          Number(seatTeam(b.seatIndex) === seatTeam(me.seatIndex)) -
            Number(seatTeam(a.seatIndex) === seatTeam(me.seatIndex)) ||
          a.seatIndex - b.seatIndex,
      ),
  ];
}
export function orderedSpadesHand(hand: readonly string[]): string[] {
  const suits = 'CDHS',
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return [...hand].sort(
    (a, b) =>
      suits.indexOf(a.slice(-1)) - suits.indexOf(b.slice(-1)) ||
      ranks.indexOf(a.slice(0, -1)) - ranks.indexOf(b.slice(0, -1)) ||
      a.localeCompare(b),
  );
}
export function spadesBidBoxes(): {
  tricks: number;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  return Array.from({ length: 14 }, (_, tricks) => ({
    tricks,
    x: 250 + (tricks % 7) * 66,
    y: 298 + Math.floor(tricks / 7) * 54,
    w: 60,
    h: 44,
  }));
}
export function spadesPublicCards(
  state: SpadesState,
): { seat: number; card: string }[] {
  return state.phase === 'play' && state.stage === 'trick'
    ? state.trick.length
      ? state.trick
      : (state.lastTrick?.cards ?? [])
    : [];
}
export function spadesTrickPositions(
  count: number,
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 480 + (index - (count - 1) / 2) * 112,
    y: 328,
  }));
}
export function spadesTeamTotals(
  state: SpadesState,
  team: 'ns' | 'ew',
): { bid: number; pending: boolean; tricks: number } {
  const seats = Object.keys(state.hands)
    .map(Number)
    .filter((seat) => seatTeam(seat) === team);
  return {
    bid: seats.reduce((n, seat) => n + (state.bids[String(seat)] ?? 0), 0),
    pending: seats.some((seat) => state.bids[String(seat)] == null),
    tricks: seats.reduce((n, seat) => n + (state.tricks[String(seat)] ?? 0), 0),
  };
}
