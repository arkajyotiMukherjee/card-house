import type { Direction } from './casino-art';

export interface FloorTableChair {
  x: number;
  y: number;
  direction: Direction;
}

export const FLOOR_TABLE_SURFACE = { x: -56, y: -26, w: 112, h: 64 };
export const FLOOR_TABLE_PLAQUE = { x: -72, y: -84, w: 144, h: 24 };

const topLeft: FloorTableChair = { x: -35, y: -43, direction: 'down' };
const topCenter: FloorTableChair = { x: 0, y: -43, direction: 'down' };
const topRight: FloorTableChair = { x: 35, y: -43, direction: 'down' };
const bottomLeft: FloorTableChair = { x: -35, y: 54, direction: 'up' };
const bottomRight: FloorTableChair = { x: 35, y: 54, direction: 'up' };
const left: FloorTableChair = { x: -76, y: 6, direction: 'right' };
const right: FloorTableChair = { x: 76, y: 6, direction: 'left' };
const upperLeft: FloorTableChair = { ...left, y: -13 };
const lowerLeft: FloorTableChair = { ...left, y: 24 };
const upperRight: FloorTableChair = { ...right, y: -13 };
const lowerRight: FloorTableChair = { ...right, y: 24 };

// Clockwise around the table, with a gap at the center of the near edge.
const chairsByCapacity: readonly (readonly FloorTableChair[])[] = [
  [],
  [topCenter],
  [right, left],
  [topCenter, bottomRight, bottomLeft],
  [topLeft, topRight, bottomRight, bottomLeft],
  [topLeft, topCenter, topRight, bottomRight, bottomLeft],
  [topLeft, topRight, right, bottomRight, bottomLeft, left],
  [topLeft, topCenter, topRight, right, bottomRight, bottomLeft, left],
  [
    topLeft,
    topRight,
    upperRight,
    lowerRight,
    bottomRight,
    bottomLeft,
    lowerLeft,
    upperLeft,
  ],
];

export function floorTableChairs(capacity: number): readonly FloorTableChair[] {
  return chairsByCapacity[capacity] ?? [];
}

export function floorTableChairBounds(chair: FloorTableChair): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return chair.direction === 'left' || chair.direction === 'right'
    ? { x: chair.x - 13, y: chair.y - 16, w: 26, h: 32 }
    : { x: chair.x - 16, y: chair.y - 12, w: 32, h: 26 };
}
