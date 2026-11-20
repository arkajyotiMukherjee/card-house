import { expect, it } from 'vitest';
import {
  LOBBY_ROWS,
  ROOM_TIERS,
  SPAWN,
  TABLE_APPROACH_RANGE,
  TABLES_PER_WING,
  WING_ROWS,
  floorPath,
  floorRows,
  floorTable,
  tableApproachDistance,
  tableEntrance,
  walkable,
} from '../../src/shared/casino-floor';
import {
  FLOOR_TABLE_PLAQUE,
  FLOOR_TABLE_SURFACE,
  floorTableChairBounds,
  floorTableChairs,
} from './floor-table-layout';

type Bounds = typeof FLOOR_TABLE_SURFACE;

it('fills aligned rows and keeps every table entrance reachable at the room cap', () => {
  const grid = [
    { x: 6, y: 4 },
    { x: 15, y: 4 },
    { x: 24, y: 4 },
    { x: 6, y: 11 },
    { x: 15, y: 11 },
    { x: 24, y: 11 },
  ];
  const capacity = ROOM_TIERS.pro.tables;
  const rows = floorRows(capacity);
  const occupied = new Set(Array.from({ length: capacity }, (_, slot) => slot));

  for (const slot of occupied) {
    const wingY = LOBBY_ROWS + Math.floor(slot / TABLES_PER_WING) * WING_ROWS;
    const { x, y } = grid[slot % TABLES_PER_WING];
    expect(floorTable(slot)).toEqual({ x, y: wingY + y });
    const entrance = { x, y: wingY + y + 2 };
    expect(tableEntrance(slot)).toEqual(entrance);
    const path = floorPath(SPAWN, entrance, rows, occupied);
    expect(path.at(-1)).toEqual(entrance);
    expect(path.every((point) => walkable(point, rows, occupied))).toBe(true);
  }
});

it('offers table actions within reach of either side, the back, or the front', () => {
  const slot = 0;
  const center = floorTable(slot);
  const occupied = new Set([slot]);
  for (const [dx, dy] of [
    [-5, -1],
    [5, -1],
    [0, -4],
    [0, 4],
  ]) {
    const point = { x: center.x + dx, y: center.y + dy };
    expect(walkable(point, floorRows(1), occupied)).toBe(true);
    expect(tableApproachDistance(point, slot)).toBeLessThanOrEqual(
      TABLE_APPROACH_RANGE,
    );
  }
  expect(
    tableApproachDistance({ x: center.x + 6, y: center.y }, slot),
  ).toBeGreaterThan(TABLE_APPROACH_RANGE);
  expect(tableApproachDistance(SPAWN, slot)).toBeGreaterThan(
    TABLE_APPROACH_RANGE,
  );
});

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

it.each([2, 3, 4, 5, 6, 7, 8])(
  'keeps the %i chairs clear of the felt, each other, and the entrance',
  (capacity) => {
    const chairs = floorTableChairs(capacity);
    expect(chairs).toHaveLength(capacity);

    const approach = { x: -12, y: 38, w: 24, h: 34 };
    const bounds = chairs.map(floorTableChairBounds);
    for (const [index, chair] of bounds.entries()) {
      expect(overlaps(chair, FLOOR_TABLE_SURFACE)).toBe(false);
      expect(overlaps(chair, FLOOR_TABLE_PLAQUE)).toBe(false);
      expect(overlaps(chair, approach)).toBe(false);
      expect(
        bounds.slice(index + 1).some((other) => overlaps(chair, other)),
      ).toBe(false);
    }
  },
);
