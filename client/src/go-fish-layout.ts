import { HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import type { GoFishState } from '../../src/shared/games/go-fish';
import { LOGICAL_WIDTH } from './sheets';
import {
  askChipBox,
  fanCardRect,
  fanEdge,
  opponentNameAnchor,
  seatFan,
  seatPlateWidth,
} from './table-presentation';

/** Face-down stock, left of the table center. */
export const STOCK_X = PILE_X - 96;
export const STOCK_Y = PILE_Y;
/** Caption under the stock stack. */
export const STOCK_LABEL_DY = 44;
/** A laid book is one card at half size with its rank written under it. */
export const BOOK_STEP = 22;
export const BOOK_ART_W = 24;
export const BOOK_Y = HAND_Y - 96;
export const BOOK_LEFT = 216;

const SCREEN_MARGIN = 8;
const PLATE_MIN_WIDTH = 48;
const PLATE_CHAR_WIDTH = 8;
const PLATE_PAD = 16;
const BOOK_GAP = 10;

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

function bookSpan(count: number): number {
  return BOOK_ART_W + BOOK_STEP * Math.max(0, count - 1);
}

/** Your books sit in a row on the felt above your hand. */
export function selfBookOrigin(): { x: number; y: number } {
  return { x: BOOK_LEFT + BOOK_ART_W / 2, y: BOOK_Y };
}

/** Same width the shared seat plate is drawn with. */
export function plateWidth(name: string): number {
  return Math.max(PLATE_MIN_WIDTH, name.length * PLATE_CHAR_WIDTH + PLATE_PAD);
}

/**
 * Other books sit just inward of the rail fan, toward the table center,
 * so they stay off the cards and the name.
 */
export function opponentBookOrigin(
  seatX: number,
  seatY: number,
  count: number,
  name = 'Seat',
): { x: number; y: number } {
  const span = bookSpan(count);
  const label = opponentNameAnchor(seatX, seatY, name);
  const width = seatPlateWidth(name);
  const edge = fanEdge(seatX, seatY);
  const fan = seatFan(seatX, seatY, 13, name).map((slot) => fanCardRect(slot));
  let left = label.x + width / 2 - span / 2;
  let y = label.y + 36;
  if (edge === 'right') {
    const inward = Math.min(...fan.map((rect) => rect.x));
    left = inward - BOOK_GAP - span;
    y = label.y;
  } else if (edge === 'left') {
    const inward = Math.max(...fan.map((rect) => rect.x + rect.w));
    left = inward + BOOK_GAP;
    y = label.y;
  } else if (edge === 'top') {
    const inward = Math.max(...fan.map((rect) => rect.y + rect.h));
    y = inward + BOOK_GAP + 16;
  } else if (fan.length > 0) {
    const inward = Math.min(...fan.map((rect) => rect.y));
    y = inward - BOOK_GAP - 16;
  }
  const clamped = Math.min(
    Math.max(left, SCREEN_MARGIN),
    LOGICAL_WIDTH - SCREEN_MARGIN - span,
  );
  return {
    x: Math.round(clamped + BOOK_ART_W / 2),
    y: Math.round(y),
  };
}

/** Ask chip in the fan gap, under the name and clear of the cards. */
export function askButtonBox(
  seatX: number,
  seatY: number,
  name = 'Seat',
): { x: number; y: number; w: number; h: number } {
  return askChipBox(seatX, seatY, name, ASK_BUTTON.w, ASK_BUTTON.h);
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
