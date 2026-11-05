import type { RummyState } from '../../src/shared/games/rummy';
import { CARD_DRAW, TABLE_CENTER } from './bluff-layout';
import { TURN_LINE, actionBox } from './table-presentation';

export const DISCARD_X = 400;
export const DISCARD_Y = 248;
export const STOCK_X = 580;
export const STOCK_Y = 248;

export const DRAW_STOCK_BUTTON = actionBox(0);
export const DRAW_DISCARD_BUTTON = actionBox(1);
export const MELD_BUTTON = actionBox(2);
export const DISCARD_BUTTON = actionBox(3);

/** Turn hint sits above the shared cluster. */
export const HINT_X = TURN_LINE.x;
export const HINT_Y = TURN_LINE.y;

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
    left: 500,
    right: 760,
    y: 330,
    dir: -1,
    flow: true,
  },
  {
    seatX: 700,
    seatY: 128,
    left: 620,
    right: 860,
    y: 180,
    dir: 1,
    flow: true,
  },
  { seatX: 480, seatY: 72, left: 300, right: 540, y: 180, dir: 1, flow: true },
  { seatX: 260, seatY: 128, left: 96, right: 280, y: 180, dir: 1, flow: true },
  { seatX: 180, seatY: 310, left: 220, right: 460, y: 330, dir: 1, flow: true },
  // Six-player ring. One row stays above the piles and off the side fans.
  {
    seatX: 868,
    seatY: 268,
    left: 500,
    right: 760,
    y: 312,
    dir: -1,
    flow: true,
  },
  { seatX: 636, seatY: 104, left: 620, right: 880, y: 184, dir: 1, flow: true },
  { seatX: 480, seatY: 104, left: 376, right: 616, y: 184, dir: 1, flow: true },
  { seatX: 324, seatY: 104, left: 120, right: 360, y: 184, dir: 1, flow: true },
  { seatX: 92, seatY: 268, left: 150, right: 400, y: 312, dir: 1, flow: true },
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
  const score = state.scores[String(seatIndex)];
  const result = score === undefined ? '' : ` - ${score} deadwood`;
  if (name.length > 0) {
    return `${name} wins${result}`;
  }
  return `Seat ${seatIndex} wins${result}`;
}
