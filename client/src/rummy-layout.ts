import type { RummyState } from '../../src/shared/games/rummy';
import { TABLE_CENTER } from './bluff-layout';

export const DISCARD_X = 400;
export const DISCARD_Y = 248;
export const STOCK_X = 580;
export const STOCK_Y = 248;

export const DRAW_STOCK_BUTTON = { x: 748, y: 400, w: 96, h: 28 } as const;
export const DRAW_DISCARD_BUTTON = { x: 852, y: 400, w: 96, h: 28 } as const;
export const MELD_BUTTON = { x: 748, y: 436, w: 96, h: 28 } as const;
export const DISCARD_BUTTON = { x: 852, y: 436, w: 96, h: 28 } as const;

const DISCARD_SHOWN = 5;
const DISCARD_STEP = 20;
const MELD_SHOWN = 8;
const MELD_STEP = 18;

export function discardPositions(count: number): { x: number; y: number }[] {
  const shown = Math.min(count, DISCARD_SHOWN);
  if (shown <= 0) {
    return [];
  }
  const span = (shown - 1) * DISCARD_STEP;
  const origin = DISCARD_X - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    positions.push({
      x: Math.round(origin + index * DISCARD_STEP),
      y: DISCARD_Y,
    });
  }
  return positions;
}

export function stockPosition(): { x: number; y: number } {
  return { x: STOCK_X, y: STOCK_Y };
}

/** A short row of meld cards, near the seat that played them. */
export function meldOrigin(
  seatX: number,
  seatY: number,
  self: boolean,
  meldIndex: number,
): { x: number; y: number } {
  if (self) {
    return { x: 24, y: 392 - meldIndex * 24 };
  }
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const dist = 78 + meldIndex * 22;
  return {
    x: Math.round(seatX + (dx / len) * dist),
    y: Math.round(seatY + (dy / len) * dist),
  };
}

export function meldPositions(
  originX: number,
  originY: number,
  count: number,
): { x: number; y: number }[] {
  const shown = Math.min(count, MELD_SHOWN);
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    positions.push({ x: originX + index * MELD_STEP, y: originY });
  }
  return positions;
}

export function legalCard(
  state: RummyState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (state.phase !== 'play' || seatIndex === null) {
    return false;
  }
  if (state.turnSeatIndex !== seatIndex) {
    return false;
  }
  const hand = state.hands[String(seatIndex)];
  return hand?.includes(cardId) ?? false;
}

/**
 * End-of-game line from the subscribed state.
 * The seat index is the rules winner, and the name is that seated player.
 */
export function finishedLine(
  state: RummyState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  const seatIndex = state.winnerSeatIndex;
  if (seatIndex === null) {
    return 'Finished';
  }
  const seat = seats.find((row) => row.seatIndex === seatIndex);
  const name = seat?.name ?? '';
  if (name.length > 0) {
    return `Winner seat ${seatIndex} ${name}`;
  }
  return `Winner seat ${seatIndex}`;
}
