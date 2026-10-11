import type { RummyState } from '../../src/shared/games/rummy';
import { CARD_DRAW, TABLE_CENTER } from './bluff-layout';

export const DISCARD_X = 400;
export const DISCARD_Y = 248;
export const STOCK_X = 580;
export const STOCK_Y = 248;

export const DRAW_STOCK_BUTTON = { x: 748, y: 400, w: 96, h: 28 } as const;
export const DRAW_DISCARD_BUTTON = { x: 852, y: 400, w: 96, h: 28 } as const;
export const MELD_BUTTON = { x: 748, y: 436, w: 96, h: 28 } as const;
export const DISCARD_BUTTON = { x: 852, y: 436, w: 96, h: 28 } as const;

/** Turn hint and deadwood points sit above the action buttons. */
export const HINT_X = 748;
export const HINT_Y = 362;

const DISCARD_SHOWN = 5;
const DISCARD_STEP = 20;
const MELD_SHOWN = 8;
const MELD_STEP = 18;
const MELD_ROW_STEP = 44;
const MELD_GAP = 14;

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

export interface MeldSlot {
  x: number;
  y: number;
  z: number;
}

interface MeldZone {
  seatX: number;
  seatY: number;
  left: number;
  right: number;
  y: number;
  dir: 1 | -1;
  flow: boolean;
}

/**
 * Where each seat's melds sit. Zones keep clear of the seat plate, the card
 * backs, the center piles, the buttons, and the hand strip.
 * Your melds flow in a band above the hand. Others stack beside their seat.
 */
const MELD_ZONES: readonly MeldZone[] = [
  {
    seatX: 480,
    seatY: 456,
    left: 352,
    right: 736,
    y: 404,
    dir: -1,
    flow: true,
  },
  {
    seatX: 780,
    seatY: 310,
    left: 810,
    right: 952,
    y: 296,
    dir: -1,
    flow: false,
  },
  {
    seatX: 700,
    seatY: 128,
    left: 744,
    right: 952,
    y: 116,
    dir: 1,
    flow: false,
  },
  { seatX: 480, seatY: 72, left: 520, right: 664, y: 88, dir: 1, flow: true },
  { seatX: 260, seatY: 128, left: 16, right: 220, y: 116, dir: 1, flow: false },
  { seatX: 180, seatY: 310, left: 16, right: 140, y: 360, dir: 1, flow: false },
];

function zoneFor(seatX: number, seatY: number, self: boolean): MeldZone {
  const found = MELD_ZONES.find((zone) =>
    self
      ? zone === MELD_ZONES[0]
      : zone.seatX === seatX && zone.seatY === seatY,
  );
  if (found) {
    return found;
  }
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  return {
    seatX,
    seatY,
    left: Math.round(seatX + (dx / len) * 120) - 32,
    right: 952,
    y: Math.round(seatY + (dy / len) * 120),
    dir: 1,
    flow: false,
  };
}

/**
 * Card slots for every meld a seat has played, in play order.
 * Rows overlap so the rank corner of each card stays readable, and the row
 * nearest the seat sits on top.
 */
export function meldLayout(
  seatX: number,
  seatY: number,
  self: boolean,
  sizes: readonly number[],
): MeldSlot[][] {
  const zone = zoneFor(seatX, seatY, self);
  const layout: MeldSlot[][] = [];
  let row = 0;
  let cursor = zone.left;
  for (const size of sizes) {
    const shown = Math.min(size, MELD_SHOWN);
    const width = CARD_DRAW + Math.max(0, shown - 1) * MELD_STEP;
    if (zone.flow) {
      if (cursor > zone.left && cursor + width > zone.right) {
        row += 1;
        cursor = zone.left;
      }
    } else if (layout.length > 0) {
      row += 1;
    }
    const left = zone.flow
      ? cursor
      : Math.max(16, Math.min(zone.left, 952 - width));
    const y = zone.y + zone.dir * MELD_ROW_STEP * row;
    const rank = zone.dir > 0 ? Math.min(row, 6) : Math.max(0, 6 - row);
    const slots: MeldSlot[] = [];
    for (let index = 0; index < shown; index += 1) {
      slots.push({
        x: left + CARD_DRAW / 2 + index * MELD_STEP,
        y,
        z: 5 + rank + index * 0.1,
      });
    }
    layout.push(slots);
    cursor = left + width + MELD_GAP;
  }
  return layout;
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
