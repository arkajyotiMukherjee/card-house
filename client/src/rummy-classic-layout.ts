import {
  RUMMY_RANKS,
  rankOfCard,
  deadwoodPoints,
  type RummyState,
} from '../../src/shared/games/rummy';
import type { DriverSeat } from './game-driver';

export const RUMMY_STOCK = { x: 390, y: 350 };
export const RUMMY_DISCARD = { x: 570, y: 350 };
export const RUMMY_PUBLIC_SCALE = 1.35;
export const MELD_CARD_PAGE_SIZE = 6;

/** Stable rank/suit order keeps selection predictable across pages. */
export function orderedRummyHand(hand: readonly string[]): string[] {
  return [...hand].sort(
    (a, b) =>
      RUMMY_RANKS.indexOf(rankOfCard(a)!) -
        RUMMY_RANKS.indexOf(rankOfCard(b)!) || a.localeCompare(b),
  );
}
export function rummyMeldPage(
  state: RummyState,
  index: number,
  page: number,
): {
  index: number;
  page: number;
  pages: number;
  cards: string[];
  total: number;
} {
  const bounded = Math.max(0, Math.min(index, state.melds.length - 1));
  const all = state.melds[bounded]?.cards ?? [];
  const pages = Math.max(1, Math.ceil(all.length / MELD_CARD_PAGE_SIZE));
  const current = Math.max(0, Math.min(page, pages - 1));
  return {
    index: bounded,
    page: current,
    pages,
    cards: all.slice(
      current * MELD_CARD_PAGE_SIZE,
      (current + 1) * MELD_CARD_PAGE_SIZE,
    ),
    total: all.length,
  };
}
export function rummyMeldPositions(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 480 + (index - (count - 1) / 2) * 60,
    y: 330,
  }));
}
/** Only public finished scores are shown for opponents. */
export function rummyScoreRows(
  state: RummyState,
  seats: readonly DriverSeat[],
): { seat: DriverSeat; score: number; winner: boolean }[] {
  return seats
    .map((seat) => ({
      seat,
      score: state.scores[String(seat.seatIndex)] ?? 0,
      winner: state.winnerSeatIndex === seat.seatIndex,
    }))
    .sort((a, b) => a.score - b.score || a.seat.seatIndex - b.seat.seatIndex);
}
export function ownRummyDeadwood(
  state: RummyState,
  seat: number | null,
): number {
  return seat === null ? 0 : deadwoodPoints(state.hands[String(seat)] ?? []);
}
