import { BUTTON_HEIGHT } from './button-style';
import {
  HOW_TO_PLAY_BUTTON,
  LEAVE_TABLE_BUTTON,
  TABLE_CHAT_BUTTON,
  anchorAt,
} from './game-scene';
import { STATUS_HUD } from './status-hud';
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
 * Opponent fan cards draw at the same 64px size as the local hand
 * (`CARD_DRAW`) and the community cards. `FanSlot.scale` stays 1.
 * A crowded edge or a long hand tightens the spread instead of the card.
 */
export const OPPONENT_FAN_CARD = CARD_SIZE;
export const OPPONENT_FAN_SCALE = OPPONENT_FAN_CARD / CARD_SIZE;

const PLATE_HEIGHT = 20;
/** How far a card center sits in from the point on the table edge. */
const FAN_BOTTOM_INSET = 0.92;
/**
 * Name, then the extra line (count, chips, or bet), then room for an Ask chip.
 * The arc stays outside this block.
 */
const LABEL_BLOCK_H = 56;
/**
 * Card bottoms sit on this screen edge, a little farther out than the
 * old rail so a full-size card still ends before the name.
 */
const LEFT_EDGE = 4;
const RIGHT_EDGE = 956;
const TOP_EDGE = 75;
/** Name plate for a top fan. It stays under the arc, in the open middle. */
const TOP_LABEL_Y = 144;
/** Lowest pixel a top-fan card may use. The name starts just under this. */
const TOP_CARD_LIMIT = TOP_LABEL_Y - 4;
/**
 * How far a side fan may reach inward before the name.
 * Past the inner edge of a 64px card, so a short name plus a showdown
 * hand name still sits in the open middle.
 */
const SIDE_POCKET = 108;
/** Side fans stay below the header row and above the hand and cluster. */
const LEFT_SAFE = { start: 46, end: 470 } as const;
const RIGHT_SAFE = { start: 70, end: 440 } as const;
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
    return 0;
  }
  if (edge === 'right') {
    return end * 0.05;
  }
  if (edge === 'left') {
    return -end * 0.05;
  }
  return 0;
}

/** Keep `along ± half` inside a safe band without moving a seat that already fits. */
function contained(
  along: number,
  half: number,
  safeStart: number,
  safeEnd: number,
): { along: number; half: number } {
  const start = Math.max(along - half, safeStart);
  const end = Math.min(along + half, safeEnd);
  if (end - start < 48) {
    return { along, half };
  }
  const nextAlong = clamp(along, start, end);
  const nextHalf = Math.min(nextAlong - start, end - nextAlong);
  return { along: nextAlong, half: Math.max(nextHalf, 24) };
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
    const rawAlong = known ? known.y : clamp(seatY, 168, 380);
    const rawHalf = known ? sliced : 120;
    const right = edge === 'right';
    const safe = right ? RIGHT_SAFE : LEFT_SAFE;
    const fitted = contained(rawAlong, rawHalf, safe.start, safe.end);
    return {
      edge,
      edgeX: right ? RIGHT_EDGE : LEFT_EDGE,
      edgeY: fitted.along,
      along: fitted.along,
      half: fitted.half,
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
 * How far the end cards lean. Short hands open a little. Long hands and
 * the top edge stay flatter so a 64px card still fits the slice.
 */
function tiltSpan(handCount: number, edge: FanEdge): number {
  const top = edge === 'top';
  if (handCount <= 1) {
    return top ? 0.04 : 0.08;
  }
  if (handCount <= 4) {
    return top ? 0.1 : 0.16;
  }
  if (handCount <= 5) {
    return top ? 0.08 : 0.14;
  }
  return top ? 0.06 : 0.12;
}

/** Header, hand, and the hands-and-wins line. Fans stay off these. */
const FAN_CLEAR: readonly CardRect[] = [
  LEAVE_TABLE_BUTTON,
  TABLE_CHAT_BUTTON,
  HOW_TO_PLAY_BUTTON,
  STATUS_HUD,
  { x: 280, y: 16, w: 176, h: 20 },
  { x: 16, y: 476, w: 720, h: 64 },
];

function placeArc(
  frame: FanFrame,
  count: number,
  tiltMax: number,
  stepCap: number,
): FanSlot[] {
  const half = OPPONENT_FAN_CARD / 2;
  const bleed =
    half * (Math.abs(Math.cos(tiltMax)) + Math.abs(Math.sin(tiltMax)));
  const usable = Math.max(0, frame.half * 2 - bleed * 2);
  const step =
    count <= 1 ? 0 : Math.min(stepCap, usable / Math.max(1, count - 1));
  const droop = frame.edge === 'top' ? 0 : 2;
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
      scale: OPPONENT_FAN_SCALE,
    });
  }
  return slots;
}

function arcFits(frame: FanFrame, slots: readonly FanSlot[]): boolean {
  for (const slot of slots) {
    const rect = fanCardRect(slot);
    if (frame.edge === 'top') {
      if (rect.y + rect.h > TOP_CARD_LIMIT) {
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
    for (const block of FAN_CLEAR) {
      if (rectsOverlap(rect, block)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * One arc whose bottoms lie on that seat's table edge.
 * Top arcs open downward. A corner seat leans a little.
 * Every card is `OPPONENT_FAN_CARD` (64). The spread tightens when the
 * edge is shared or the hand is long, and the name sits in the open middle.
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
  let tilt = tiltSpan(count, frame.edge);
  let stepCap = count <= 4 ? 28 : 12;
  let slots = placeArc(frame, count, tilt, stepCap);
  const tiltFloor = frame.edge === 'top' ? 0.04 : 0.1;
  while (!arcFits(frame, slots) && (tilt > tiltFloor || stepCap > 6)) {
    if (tilt > tiltFloor) {
      tilt = Math.max(tiltFloor, +(tilt - 0.02).toFixed(2));
    } else {
      stepCap -= 2;
    }
    slots = placeArc(frame, count, tilt, stepCap);
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
