import { BUTTON_HEIGHT } from './button-style';
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
 * Opponent cards are a little smaller than the local hand so a full fan
 * still fits on the rail with a gap for the name.
 */
export const OPPONENT_FAN_CARD = 48;
export const OPPONENT_FAN_SCALE = OPPONENT_FAN_CARD / CARD_SIZE;

const PLATE_HEIGHT = 20;
const FAN_HALF = OPPONENT_FAN_CARD / 2;
/** How far a card center sits in from the point on the table edge. */
const FAN_BOTTOM_INSET = 0.92;
/**
 * Name, then the extra line (count, chips, or bet), then room for an Ask chip.
 * The wings stay outside this block.
 */
const LABEL_BLOCK_H = 56;
const FAN_CARD_REACH = FAN_HALF * 1.25;
/** How far a tilted card may hang past the point on the edge. */
const CLUSTER_OVERHANG = 36;

export interface FanSlot {
  x: number;
  y: number;
  rotation: number;
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

/** Axis-aligned bounds of one rotated fan card. */
export function fanCardRect(slot: FanSlot): CardRect {
  const c = Math.abs(Math.cos(slot.rotation));
  const s = Math.abs(Math.sin(slot.rotation));
  const hw = FAN_HALF * (c + s);
  const hh = FAN_HALF * (s + c);
  return {
    x: slot.x - hw,
    y: slot.y - hh,
    w: hw * 2,
    h: hh * 2,
  };
}

interface FanFrame {
  edge: FanEdge;
  edgeX: number;
  edgeY: number;
  /** The label is wide along this edge, so the gap is horizontal. */
  horizontal: boolean;
  outwardX: number;
  outwardY: number;
  inwardX: number;
  inwardY: number;
  /** How far card bottoms may travel from the seat, along the edge. */
  room: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fanFrame(seatX: number, seatY: number): FanFrame {
  const edge = fanEdge(seatX, seatY);
  if (edge === 'left') {
    return {
      edge,
      edgeX: 10,
      edgeY: clamp(seatY, 168, 392),
      horizontal: false,
      outwardX: -1,
      outwardY: 0,
      inwardX: 1,
      inwardY: 0,
      room: 156,
    };
  }
  if (edge === 'right') {
    return {
      edge,
      edgeX: LOGICAL_WIDTH - 10,
      edgeY: clamp(seatY, 168, 392),
      horizontal: false,
      outwardX: 1,
      outwardY: 0,
      inwardX: -1,
      inwardY: 0,
      room: 156,
    };
  }
  if (edge === 'top') {
    return {
      edge,
      edgeX: clamp(seatX, 280, 680),
      edgeY: 78,
      horizontal: true,
      outwardX: 0,
      outwardY: -1,
      inwardX: 0,
      inwardY: 1,
      room: 210,
    };
  }
  return {
    edge,
    edgeX: clamp(seatX, 200, 760),
    edgeY: 392,
    horizontal: true,
    outwardX: 0,
    outwardY: 1,
    inwardX: 0,
    inwardY: -1,
    room: 130,
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
  const x = frame.edgeX + frame.inwardX * FAN_HALF - box.w / 2;
  const y = frame.edgeY + frame.inwardY * FAN_HALF - box.h / 2;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: box.w,
    h: box.h,
  };
}

/** Center of the card's outer edge. It lies on the seat's table edge. */
export function fanCardBottom(slot: FanSlot): { x: number; y: number } {
  return {
    x: slot.x + Math.sin(slot.rotation) * FAN_HALF * FAN_BOTTOM_INSET,
    y: slot.y + Math.cos(slot.rotation) * FAN_HALF * FAN_BOTTOM_INSET,
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

function wingStep(
  cards: number,
  inner: number,
  room: number,
  packed: boolean,
): number {
  if (cards <= 1) {
    return 0;
  }
  const fit = (room - FAN_HALF - inner) / (cards - 1);
  if (packed) {
    return Math.max(0, Math.min(12, fit));
  }
  return Math.max(6, Math.min(12, fit));
}

function wingSlots(
  frame: FanFrame,
  cards: number,
  sign: -1 | 1,
  inner: number,
  step: number,
  room: number,
): FanSlot[] {
  const slots: FanSlot[] = [];
  const maxAlong = Math.max(inner, room - FAN_HALF);
  for (let index = 0; index < cards; index += 1) {
    const along = sign * Math.min(maxAlong, inner + index * step);
    const travel = Math.max(0, Math.abs(along) - inner);
    const tilt = sign * Math.min(0.8, 0.08 + (travel / 96) * 0.72);
    const dir = bottomDirection(frame, tilt);
    const reach = FAN_HALF * FAN_BOTTOM_INSET;
    const bottomX = frame.horizontal ? frame.edgeX + along : frame.edgeX;
    const bottomY = frame.horizontal ? frame.edgeY : frame.edgeY + along;
    slots.push({
      x: Math.round(bottomX - dir.x * reach),
      y: Math.round(bottomY - dir.y * reach),
      rotation: Math.atan2(dir.x, dir.y),
    });
  }
  return slots;
}

/**
 * The right fan's lower wing stops above the action cluster.
 * Other wings keep the full rail.
 */
function wingRoom(frame: FanFrame, sign: -1 | 1): number {
  if (frame.edge !== 'right' || sign < 0) {
    return frame.room;
  }
  const maxAlong = FELT_BOTTOM - frame.edgeY - CLUSTER_OVERHANG;
  return Math.min(frame.room, Math.max(FAN_HALF + 8, maxAlong + FAN_HALF));
}

/**
 * A rotated fan whose bottoms lie on that seat's table edge.
 * Left fans grow inward from the left, right from the right, and top
 * from the top. The middle of the fan is left open for the name.
 */
export function seatFan(
  seatX: number,
  seatY: number,
  count: number,
  name = 'Seat',
): FanSlot[] {
  if (count <= 0) {
    return [];
  }
  const frame = fanFrame(seatX, seatY);
  const box = fanLabelBox(name);
  const labelHalf = frame.horizontal ? box.w / 2 : box.h / 2;
  const inner = labelHalf + FAN_CARD_REACH + 4;
  const upper = Math.ceil(count / 2);
  const lower = count - upper;
  const upperRoom = wingRoom(frame, -1);
  const lowerRoom = wingRoom(frame, 1);
  return [
    ...wingSlots(
      frame,
      upper,
      -1,
      inner,
      wingStep(upper, inner, upperRoom, false),
      upperRoom,
    ),
    ...wingSlots(
      frame,
      lower,
      1,
      inner,
      wingStep(lower, inner, lowerRoom, frame.edge === 'right'),
      lowerRoom,
    ),
  ];
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
