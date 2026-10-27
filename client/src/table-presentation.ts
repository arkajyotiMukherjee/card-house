import { BUTTON_HEIGHT } from './button-style';
import { anchorAt } from './game-scene';
import {
  CARD_SIZE,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
} from './sheets';

/**
 * Shared table presentation: one rail fan for every opponent hand, and one
 * action cluster in the lower-right green.
 * The table actor sits at the canvas center plus 8, matching `GameScene`.
 * Source rows 0–5 and 74–79 of the table sprite are the wooden rail, so the
 * green playing surface ends at row 74.
 */
const TABLE_SPRITE_CENTER_Y = LOGICAL_HEIGHT / 2 + 8;
const TABLE_SPRITE_TOP =
  TABLE_SPRITE_CENTER_Y - (TABLE_HEIGHT * TABLE_SCALE) / 2;
const PLAYING_SURFACE_ROWS = 74;

/** Bottom of the green playing surface. Buttons sit on the rail below this. */
export const FELT_BOTTOM =
  TABLE_SPRITE_TOP + PLAYING_SURFACE_ROWS * TABLE_SCALE;

export const CLUSTER_GAP = 4;
export const CLUSTER_COLUMNS = 2;
export const CLUSTER_BUTTON_W = 96;
const CLUSTER_MARGIN = 8;
const CLUSTER_WIDTH =
  CLUSTER_COLUMNS * CLUSTER_BUTTON_W + (CLUSTER_COLUMNS - 1) * CLUSTER_GAP;

/** Top-left of the two-across action grid, below the felt and at the right. */
export const ACTION_CLUSTER = {
  x: LOGICAL_WIDTH - CLUSTER_MARGIN - CLUSTER_WIDTH,
  y: FELT_BOTTOM,
  w: CLUSTER_WIDTH,
  h: LOGICAL_HEIGHT - FELT_BOTTOM,
} as const;

/** Short turn line just above the cluster. */
export const TURN_LINE = {
  x: ACTION_CLUSTER.x,
  y: ACTION_CLUSTER.y - 12,
} as const;

/**
 * One row of the green band, between the playing surface and the local hand.
 * Pickers use this row and stay left of the cluster.
 */
export const PICKER_Y = FELT_BOTTOM;
export const PICKER_LEFT = 16;
export const PICKER_RIGHT = ACTION_CLUSTER.x - 8;

export interface ActionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Slot `index` in the cluster, filled left to right then down. */
export function actionBox(index: number): ActionBox {
  const col = index % CLUSTER_COLUMNS;
  const row = Math.floor(index / CLUSTER_COLUMNS);
  return {
    x: ACTION_CLUSTER.x + col * (CLUSTER_BUTTON_W + CLUSTER_GAP),
    y: ACTION_CLUSTER.y + row * (BUTTON_HEIGHT + CLUSTER_GAP),
    w: CLUSTER_BUTTON_W,
    h: BUTTON_HEIGHT,
  };
}

/** Fold, and any other give-up control, uses the Leave Table red. */
export function isGiveUpControl(label: string): boolean {
  return label === 'Fold';
}

export function belowFelt(box: { y: number }): boolean {
  return box.y >= FELT_BOTTOM;
}

export function insideCluster(box: ActionBox): boolean {
  return (
    box.x >= ACTION_CLUSTER.x &&
    box.y >= ACTION_CLUSTER.y &&
    box.x + box.w <= ACTION_CLUSTER.x + ACTION_CLUSTER.w &&
    box.y + box.h <= LOGICAL_HEIGHT
  );
}

/** Play center. Seat edges are measured from here, matching the old table. */
export const TABLE_CENTER = { x: 480, y: 270 } as const;

/**
 * Largest opponent card. A crowded edge or a long hand draws smaller,
 * and `FanSlot.scale` is that size over `CARD_SIZE`.
 */
export const OPPONENT_FAN_CARD = 48;
export const OPPONENT_FAN_SCALE = OPPONENT_FAN_CARD / CARD_SIZE;

const PLATE_HEIGHT = 20;
/** How far a card center sits in from the point on the table edge. */
const FAN_BOTTOM_INSET = 0.92;
/**
 * Name, then the extra line (count, chips, or bet), then room for an Ask chip.
 * The arc stays outside this block.
 */
const LABEL_BLOCK_H = 56;
/** Card bottoms sit on this screen edge. */
const LEFT_EDGE = 10;
const RIGHT_EDGE = 950;
const TOP_EDGE = 78;
/** Name plate for a top fan. It stays under the arc, in the open middle. */
const TOP_LABEL_Y = 140;
/**
 * Lowest pixel a top-fan card may use.
 * High enough that a top fan keeps the same card size as a side fan.
 * The name starts just under this.
 */
const TOP_CARD_LIMIT = 136;
/** How far a side fan may reach inward before the name. */
const SIDE_POCKET = 54;
/** Same rails `seatPoint` divides, so a fan stays inside its seat's slice. */
const TOP_SPAN = 714 - 246;
const SIDE_SPAN = 400 - 136;

export interface FanSlot {
  x: number;
  y: number;
  rotation: number;
  /** Sprite scale relative to the 64px card. */
  scale: number;
}

/** Which table edge that seat sits on. The fan's bottom lies along it. */
export type FanEdge = 'left' | 'right' | 'top' | 'bottom';

export function fanEdge(seatX: number, seatY: number): FanEdge {
  const dx = seatX - TABLE_CENTER.x;
  const dy = seatY - TABLE_CENTER.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

/** Width of the seat name plate `GameScene` draws for this name. */
export function seatPlateWidth(name: string): number {
  return Math.max(48, name.length * 8 + 16);
}

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function cardHalf(slot: FanSlot): number {
  return (CARD_SIZE * slot.scale) / 2;
}

/** Axis-aligned bounds of one rotated fan card. */
export function fanCardRect(slot: FanSlot): CardRect {
  const half = cardHalf(slot);
  const c = Math.abs(Math.cos(slot.rotation));
  const s = Math.abs(Math.sin(slot.rotation));
  const hw = half * (c + s);
  const hh = half * (s + c);
  return {
    x: slot.x - hw,
    y: slot.y - hh,
    w: hw * 2,
    h: hh * 2,
  };
}

interface FanFrame {
  edge: FanEdge;
  /** Screen position of the rail the card bottoms sit on. */
  edgeX: number;
  edgeY: number;
  /** Center of this seat's slice, along the rail. */
  along: number;
  /** Half the slice, with a gap so the next seat's fan stays clear. */
  half: number;
  horizontal: boolean;
  outwardX: number;
  outwardY: number;
  inwardX: number;
  inwardY: number;
  /** Extra lean for a corner seat. The middle of an edge stays square. */
  corner: number;
  edgeSeats: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cornerBias(edge: FanEdge, index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const end = index === 0 ? -1 : index === count - 1 ? 1 : 0;
  if (end === 0) {
    return 0;
  }
  if (edge === 'top') {
    return end * 0.16;
  }
  if (edge === 'right') {
    return end * 0.1;
  }
  if (edge === 'left') {
    return -end * 0.1;
  }
  return 0;
}

function fanFrame(seatX: number, seatY: number): FanFrame {
  const known = anchorAt(seatX, seatY);
  const edge = known?.edge ?? fanEdge(seatX, seatY);
  const edgeSeats = known?.edgeSeats ?? 1;
  const edgeIndex = known?.edgeIndex ?? 0;
  const corner = known ? cornerBias(edge, edgeIndex, edgeSeats) : 0;
  const span = edge === 'top' || edge === 'bottom' ? TOP_SPAN : SIDE_SPAN;
  const sliced = Math.max(40, span / edgeSeats / 2 - 10);
  if (edge === 'left' || edge === 'right') {
    const along = known ? known.y : clamp(seatY, 168, 380);
    const right = edge === 'right';
    return {
      edge,
      edgeX: right ? RIGHT_EDGE : LEFT_EDGE,
      edgeY: along,
      along,
      half: known ? sliced : 120,
      horizontal: false,
      outwardX: right ? 1 : -1,
      outwardY: 0,
      inwardX: right ? -1 : 1,
      inwardY: 0,
      corner,
      edgeSeats,
    };
  }
  if (edge === 'top') {
    const along = known ? known.x : clamp(seatX, 300, 660);
    return {
      edge,
      edgeX: along,
      edgeY: TOP_EDGE,
      along,
      half: known ? sliced : 150,
      horizontal: true,
      outwardX: 0,
      outwardY: -1,
      inwardX: 0,
      inwardY: 1,
      corner,
      edgeSeats,
    };
  }
  const along = known ? known.x : clamp(seatX, 220, 700);
  return {
    edge,
    edgeX: along,
    edgeY: 392,
    along,
    half: known ? sliced : 90,
    horizontal: true,
    outwardX: 0,
    outwardY: 1,
    inwardX: 0,
    inwardY: -1,
    corner: 0,
    edgeSeats,
  };
}

export interface FanLabel {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Name plate over the extra line. Both sit in the middle of the fan. */
export function fanLabelBox(name: string): { w: number; h: number } {
  return { w: seatPlateWidth(name), h: LABEL_BLOCK_H };
}

function labelOrigin(frame: FanFrame, name: string): FanLabel {
  const box = fanLabelBox(name);
  if (frame.edge === 'top') {
    return {
      x: Math.round(frame.along - box.w / 2),
      y: TOP_LABEL_Y,
      w: box.w,
      h: box.h,
    };
  }
  if (frame.edge === 'right') {
    const face = frame.edgeX - SIDE_POCKET;
    return {
      x: Math.round(face - 4 - box.w),
      y: Math.round(frame.along - 15),
      w: box.w,
      h: box.h,
    };
  }
  if (frame.edge === 'left') {
    const face = frame.edgeX + SIDE_POCKET;
    return {
      x: Math.round(face + 4),
      y: Math.round(frame.along - 15),
      w: box.w,
      h: box.h,
    };
  }
  return {
    x: Math.round(frame.along - box.w / 2),
    y: Math.round(frame.edgeY - box.h - 4),
    w: box.w,
    h: box.h,
  };
}

/** Center of the card's outer edge. It lies on the seat's table edge. */
export function fanCardBottom(slot: FanSlot): { x: number; y: number } {
  const half = cardHalf(slot);
  return {
    x: slot.x + Math.sin(slot.rotation) * half * FAN_BOTTOM_INSET,
    y: slot.y + Math.cos(slot.rotation) * half * FAN_BOTTOM_INSET,
  };
}

function bottomDirection(
  frame: FanFrame,
  tilt: number,
): { x: number; y: number } {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  if (frame.horizontal) {
    return { x: frame.outwardX * c + s, y: frame.outwardY * c };
  }
  return { x: frame.outwardX * c, y: frame.outwardY * c + s };
}

/**
 * Pixel size of one opponent card. Top and side edges start at the same
 * size. A shared edge and a longer hand shrink the card so the arc still
 * fits the slice.
 */
function fanCardPixels(handCount: number, frame: FanFrame): number {
  const crowded = frame.edgeSeats >= 3 ? 6 : frame.edgeSeats >= 2 ? 2 : 0;
  let size = 44 - crowded;
  if (handCount <= 2) {
    size += 2;
  } else if (handCount <= 5 && handCount > 4) {
    size -= 4;
  } else if (handCount >= 13) {
    size -= frame.edgeSeats >= 2 ? 10 : 6;
  } else if (handCount >= 8) {
    size -= 8;
  }
  return clamp(size, 22, 46);
}

function tiltSpan(handCount: number, edge: FanEdge): number {
  const top = edge === 'top';
  if (handCount <= 1) {
    return 0.08;
  }
  if (handCount <= 2) {
    return top ? 0.24 : 0.34;
  }
  if (handCount <= 4) {
    return top ? 0.36 : 0.5;
  }
  if (handCount <= 5) {
    return top ? 0.32 : 0.44;
  }
  return top ? 0.26 : 0.36;
}

function placeArc(frame: FanFrame, count: number, size: number): FanSlot[] {
  const scale = size / CARD_SIZE;
  const half = size / 2;
  const tiltMax = tiltSpan(count, frame.edge);
  const bleed =
    half * (Math.abs(Math.cos(tiltMax)) + Math.abs(Math.sin(tiltMax)));
  const usable = Math.max(0, frame.half * 2 - bleed * 2);
  const prefer =
    count <= 4
      ? Math.round(size * 0.55)
      : Math.min(12, Math.round(size * 0.42));
  const step = count <= 1 ? 0 : Math.min(prefer, usable / (count - 1));
  const droop = frame.edge === 'top' || count <= 2 ? 2 : 4;
  const slots: FanSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
    const along = (index - (count - 1) / 2) * step;
    const tilt = t * tiltMax + frame.corner;
    const dir = bottomDirection(frame, tilt);
    const reach = half * FAN_BOTTOM_INSET;
    const bow = t * t * droop;
    const bottomX = frame.horizontal ? frame.along + along : frame.edgeX;
    const bottomY = frame.horizontal ? frame.edgeY : frame.along + along;
    slots.push({
      x: Math.round(bottomX + frame.inwardX * bow - dir.x * reach),
      y: Math.round(bottomY + frame.inwardY * bow - dir.y * reach),
      rotation: Math.atan2(dir.x, dir.y),
      scale,
    });
  }
  return slots;
}

function arcFits(frame: FanFrame, slots: readonly FanSlot[]): boolean {
  for (const slot of slots) {
    const rect = fanCardRect(slot);
    if (frame.edge === 'top') {
      if (rect.y < 69 || rect.y + rect.h > TOP_CARD_LIMIT) {
        return false;
      }
      if (
        rect.x < frame.along - frame.half ||
        rect.x + rect.w > frame.along + frame.half
      ) {
        return false;
      }
    } else if (frame.edge === 'left') {
      if (rect.x + rect.w > LEFT_EDGE + SIDE_POCKET) {
        return false;
      }
      if (
        rect.y < frame.along - frame.half ||
        rect.y + rect.h > frame.along + frame.half
      ) {
        return false;
      }
    } else if (frame.edge === 'right') {
      if (rect.x < RIGHT_EDGE - SIDE_POCKET) {
        return false;
      }
      if (
        rect.y < frame.along - frame.half ||
        rect.y + rect.h > frame.along + frame.half
      ) {
        return false;
      }
    }
    if (coversCluster(slot)) {
      return false;
    }
  }
  return true;
}

/**
 * One arc whose bottoms lie on that seat's table edge.
 * Top arcs open downward. A corner seat leans a little.
 * Card size and spread shrink when the edge is shared or the hand is long,
 * and the name sits in the open middle of the arc.
 */
export function seatFan(
  seatX: number,
  seatY: number,
  count: number,
  _name = 'Seat',
): FanSlot[] {
  if (count <= 0) {
    return [];
  }
  const frame = fanFrame(seatX, seatY);
  let size = fanCardPixels(count, frame);
  let slots = placeArc(frame, count, size);
  while (size > 22 && !arcFits(frame, slots)) {
    size -= 2;
    slots = placeArc(frame, count, size);
  }
  return slots;
}

/** Top-left of the name plate, centered on the fan. */
export function opponentNameAnchor(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  const label = labelOrigin(fanFrame(seatX, seatY), name);
  return { x: label.x, y: label.y };
}

/**
 * Top-left of an extra line in the fan gap, under the name.
 * Line 0 is the count, the chip stack, or the bet. Line 1 is a second note.
 */
export function fanGapLine(
  seatX: number,
  seatY: number,
  name: string,
  text: string,
  line = 0,
): { x: number; y: number } {
  const label = labelOrigin(fanFrame(seatX, seatY), name);
  const textW = text.length * 8;
  return {
    x: Math.round(label.x + (label.w - textW) / 2),
    y: label.y + PLATE_HEIGHT + 2 + line * 12,
  };
}

/** Top-left of the `xN` count, under the name and still in the fan center. */
export function opponentCountAnchor(
  seatX: number,
  seatY: number,
  count: number,
  name: string,
): { x: number; y: number } {
  return fanGapLine(seatX, seatY, name, `x${count}`, 0);
}

/** Ask chip under the name, in the same gap, clear of the cards. */
export function askChipBox(
  seatX: number,
  seatY: number,
  name: string,
  width: number,
  height: number,
): ActionBox {
  const label = labelOrigin(fanFrame(seatX, seatY), name);
  return {
    x: Math.round(label.x + (label.w - width) / 2),
    y: label.y + PLATE_HEIGHT + 2 + 12,
    w: width,
    h: height,
  };
}

export function rectsOverlap(a: CardRect, b: CardRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** True when a fan card covers the action cluster. */
export function coversCluster(slot: FanSlot): boolean {
  const rect = fanCardRect(slot);
  return rectsOverlap(rect, {
    x: ACTION_CLUSTER.x,
    y: ACTION_CLUSTER.y,
    w: ACTION_CLUSTER.w,
    h: ACTION_CLUSTER.h,
  });
}
