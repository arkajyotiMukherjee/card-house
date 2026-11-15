import { classicSeats } from './classic-table-design';
import type { DriverSeat } from './game-driver';
import { inspectionPose } from './hand-hover';

export const HAND_PREV = { x: 208, y: 462, w: 28, h: 52 };
export const HAND_NEXT = { x: 704, y: 462, w: 28, h: 52 };

/** Small hands use the pager margins too; large hands reserve space for navigation. */
export function handPageSize(
  count: number,
  mobile = false,
  gutter = 0,
): number {
  const width = 40 * (mobile ? 1.35 : 1.1);
  const step = mobile ? 58 : 52;
  const unpaged =
    Math.floor((528 + Math.max(0, gutter) * 2 - width) / step) + 1;
  const paged = Math.floor((464 + Math.max(0, gutter) * 2 - width) / step) + 1;
  return count <= unpaged ? unpaged : paged;
}

export function handPositions(
  count: number,
  mobile = false,
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 470 + (index - (count - 1) / 2) * (mobile ? 58 : 52),
    y: 484 + inspectionPose(0, mobile, false, true).lift,
  }));
}

/** One compact column; a third legal action shares the top row rather than widening it. */
export function classicControlBoxes(
  count: number,
): { x: number; y: number; w: number; h: number }[] {
  if (count === 1) return [{ x: 752, y: 462, w: 184, h: 44 }];
  if (count === 2)
    return [
      { x: 752, y: 442, w: 184, h: 40 },
      { x: 752, y: 490, w: 184, h: 40 },
    ];
  return [
    { x: 752, y: 442, w: 88, h: 40 },
    { x: 848, y: 442, w: 88, h: 40 },
    { x: 752, y: 490, w: 184, h: 40 },
  ];
}
/** Compact backs communicate ownership; the exact count is always separate text. */
export function classicBackSlots(
  seats: readonly DriverSeat[],
  hands: Readonly<Record<string, readonly string[]>>,
): {
  key: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}[] {
  return classicSeats(seats).flatMap((box) => {
    const count = Math.min(4, hands[String(box.seat.seatIndex)]?.length ?? 0);
    return Array.from({ length: count }, (_, index) => ({
      key: `${box.seat.seatIndex}:${index}`,
      x: box.x + box.w / 2 + (index - (count - 1) / 2) * 16,
      y: box.y - 54,
      z: 6 + index,
      rotation: 0,
      scale: 0.9,
    }));
  });
}
