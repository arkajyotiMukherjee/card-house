import { type HeartsState } from '../../src/shared/games/hearts';
import type { DriverSeat } from './game-driver';
import { passDirection } from '../../src/shared/games/hearts';

/** Suit groups make following suit readable; Ace remains high within each group. */
export function orderedHeartsHand(hand: readonly string[]): string[] {
  const ranks = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
    'A',
  ];
  const suits = ['C', 'D', 'S', 'H'];
  return [...hand].sort(
    (a, b) =>
      suits.indexOf(a.slice(-1)) - suits.indexOf(b.slice(-1)) ||
      ranks.indexOf(a.slice(0, -1)) - ranks.indexOf(b.slice(0, -1)),
  );
}
export const HEARTS_PUBLIC_SCALE = 1.35;
export function heartsTrickPosition(index: number): { x: number; y: number } {
  return { x: 300 + index * 120, y: 330 };
}
export function heartsScoreRows(
  state: HeartsState,
  seats: readonly DriverSeat[],
): { seat: DriverSeat; score: number; points: number; place: number }[] {
  const rows = seats
    .map((seat) => ({
      seat,
      score: state.scores[String(seat.seatIndex)] ?? 0,
      points: heartsHandPoints(state.tricksTaken[String(seat.seatIndex)] ?? []),
    }))
    .sort((a, b) => a.score - b.score || a.seat.seatIndex - b.seat.seatIndex);
  return rows.map((row) => ({
    ...row,
    place: rows.findIndex((other) => other.score === row.score) + 1,
  }));
}
export function heartsPenaltySummary(cards: readonly string[]): string {
  const hearts = cards.filter((card) => card.endsWith('H')).length,
    queen = cards.includes('QS');
  return (
    [
      hearts ? `${hearts} ${hearts === 1 ? 'heart' : 'hearts'}` : '',
      queen ? 'Q♠' : '',
    ]
      .filter(Boolean)
      .join(' + ') || 'No penalties'
  );
}

export function heartsHandPoints(cards: readonly string[]): number {
  return cards.reduce(
    (sum, card) => sum + (card === 'QS' ? 13 : card.endsWith('H') ? 1 : 0),
    0,
  );
}

/** With the viewer below, server clockwise order is left, opposite, then right. */
export function heartsSeatOrder(seats: readonly DriverSeat[]): DriverSeat[] {
  const me = seats.find((seat) => seat.self);
  if (!me) return [...seats];
  const sorted = [...seats].sort((a, b) => a.seatIndex - b.seatIndex),
    index = sorted.findIndex((seat) => seat.self);
  const at = (offset: number): DriverSeat =>
    sorted[(index + offset) % sorted.length];
  return [me, at(2), at(1), at(3)].filter(
    (seat, index, list) => list.indexOf(seat) === index,
  );
}
export function heartsPassTarget(
  state: HeartsState,
  seats: readonly DriverSeat[],
  seat: number | null,
): DriverSeat | undefined {
  if (seat === null) return undefined;
  const sorted = [...seats].sort((a, b) => a.seatIndex - b.seatIndex),
    index = sorted.findIndex((row) => row.seatIndex === seat),
    dir = passDirection(state.handIndex),
    offset =
      dir === 'left' ? 1 : dir === 'right' ? 3 : dir === 'across' ? 2 : 0;
  return offset ? sorted[(index + offset) % sorted.length] : undefined;
}

/** A completed moon adds 26 to all three opponents and zero to its shooter. */
export function heartsMoonShooter(
  before: HeartsState,
  after: HeartsState,
): number | null {
  const ids = Object.keys(after.scores).map(Number);
  if (ids.length !== 4) return null;
  const deltas = ids.map((seat) => ({
    seat,
    delta:
      (after.scores[String(seat)] ?? 0) - (before.scores[String(seat)] ?? 0),
  }));
  return deltas.filter((row) => row.delta === 26).length === 3
    ? (deltas.find((row) => row.delta === 0)?.seat ?? null)
    : null;
}
