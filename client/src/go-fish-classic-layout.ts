import {
  GO_FISH_RANKS,
  rankOfCard,
  type GoFishState,
} from '../../src/shared/games/go-fish';
import type { DriverSeat } from './game-driver';

export function orderedGoFishHand(hand: readonly string[]): string[] {
  return [...hand].sort(
    (a, b) =>
      GO_FISH_RANKS.indexOf(rankOfCard(a)!) -
        GO_FISH_RANKS.indexOf(rankOfCard(b)!) || a.localeCompare(b),
  );
}
export function goFishTargetBoxes(
  seats: readonly DriverSeat[],
): { seat: DriverSeat; x: number; y: number; w: number; h: number }[] {
  return seats
    .filter((seat) => !seat.self)
    .map((seat, index) => ({
      seat,
      x: 368 + (index % 2) * 176,
      y: 300 + Math.floor(index / 2) * 44,
      w: 160,
      h: 40,
    }));
}
export function goFishStockPosition(choosing: boolean): {
  x: number;
  y: number;
} {
  return { x: choosing ? 300 : 480, y: 350 };
}
export function goFishBookRows(
  state: GoFishState,
  seats: readonly DriverSeat[],
): { seat: DriverSeat; count: number; ranks: string[]; place: number }[] {
  const sorted = seats
    .map((seat) => ({
      seat,
      count: state.books[String(seat.seatIndex)]?.length ?? 0,
      ranks: (state.books[String(seat.seatIndex)] ?? []).map(
        (book) => book.rank,
      ),
    }))
    .sort((a, b) => b.count - a.count || a.seat.seatIndex - b.seat.seatIndex);
  return sorted.map((row) => ({
    ...row,
    place: sorted.findIndex((other) => other.count === row.count) + 1,
  }));
}
export function goFishRankWord(rank: string, count = 2): string {
  const word =
    ({ A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' } as Record<string, string>)[
      rank
    ] ?? rank;
  return `${word}${count === 1 ? '' : 's'}`;
}
