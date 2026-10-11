import {
  HAND_LEFT,
  HAND_Y,
  PILE_X,
  PILE_Y,
  TABLE_CENTER,
} from './bluff-layout';
import type { GoFishState } from '../../src/shared/games/go-fish';

/** Face-down stock, left of the table center. */
export const STOCK_X = PILE_X - 96;
export const STOCK_Y = PILE_Y;
export const BOOK_STEP = 20;
export const BOOK_Y = HAND_Y - 96;

export const ASK_BUTTON = { w: 56, h: 22 } as const;

export function stockPosition(): { x: number; y: number } {
  return { x: STOCK_X, y: STOCK_Y };
}

export function bookSlots(
  originX: number,
  originY: number,
  count: number,
): { x: number; y: number }[] {
  const slots: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    slots.push({
      x: Math.round(originX + index * BOOK_STEP),
      y: originY,
    });
  }
  return slots;
}

/** Your books sit in a row above your hand. */
export function selfBookOrigin(): { x: number; y: number } {
  return { x: HAND_LEFT + 32, y: BOOK_Y };
}

/** Other books step from the seat toward the middle of the table. */
export function opponentBookOrigin(
  seatX: number,
  seatY: number,
): { x: number; y: number } {
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: Math.round(seatX + (dx / len) * 28),
    y: Math.round(seatY + (dy / len) * 28 + 22),
  };
}

export function askButtonBox(
  seatX: number,
  seatY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(seatX - ASK_BUTTON.w / 2),
    y: seatY + 24,
    w: ASK_BUTTON.w,
    h: ASK_BUTTON.h,
  };
}

export function legalCard(
  state: GoFishState,
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

export function askSeat(target: string): number | null {
  if (!target.startsWith('ask:')) {
    return null;
  }
  const seatIndex = Number(target.slice(4));
  if (!Number.isSafeInteger(seatIndex)) {
    return null;
  }
  return seatIndex;
}

/**
 * End-of-game line from the subscribed state.
 * A null winner is a tie on book count.
 */
export function finishedLine(
  state: GoFishState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  const seatIndex = state.winnerSeatIndex;
  if (seatIndex === null) {
    return 'Tie';
  }
  const seat = seats.find((row) => row.seatIndex === seatIndex);
  const name = seat?.name ?? '';
  if (name.length > 0) {
    return `Winner seat ${seatIndex} ${name}`;
  }
  return `Winner seat ${seatIndex}`;
}
