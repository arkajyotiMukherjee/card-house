/** Tile coordinates are shared by rendering, pathfinding and the module. */
export interface FloorPoint {
  x: number;
  y: number;
}
export const FLOOR_COLUMNS = 32;
export const FLOOR_TILE_SIZE = 24;
export const LOBBY_ROWS = 16;
export const WING_ROWS = 17;
const TABLE_COLUMNS = [6, 15, 24];
const TABLE_ROW_OFFSETS = [4, 11];
const TABLE_HALF_WIDTH = 3;
const TABLE_HALF_HEIGHT = 2;
export const TABLE_APPROACH_RANGE = 2;
export const TABLES_PER_WING = TABLE_COLUMNS.length * TABLE_ROW_OFFSETS.length;
export const SPAWN: FloorPoint = { x: 15, y: 8 };
export const RECEPTION: FloorPoint = { x: 6, y: 6 };
const JUKEBOX_FOOTPRINT = { x: 2, y: 10, w: 2, h: 3 };
const JUKEBOX_CONTROL_RADIUS = 2;
export const JUKEBOX: FloorPoint = {
  x: JUKEBOX_FOOTPRINT.x,
  y: JUKEBOX_FOOTPRINT.y + JUKEBOX_FOOTPRINT.h,
};
export const JUKEBOX_CABINET = {
  x: JUKEBOX_FOOTPRINT.x * FLOOR_TILE_SIZE - 6,
  y: JUKEBOX_FOOTPRINT.y * FLOOR_TILE_SIZE,
  w: 48,
  h: 64,
  baseY: (JUKEBOX.y - 0.5) * FLOOR_TILE_SIZE,
};

function jukeboxDistanceSquared(point: FloorPoint): number {
  const { x, y, w, h } = JUKEBOX_FOOTPRINT;
  const dx = Math.max(x - point.x, point.x - (x + w - 1), 0);
  const dy = Math.max(y - point.y, point.y - (y + h - 1), 0);
  return dx ** 2 + dy ** 2;
}

export function floorServiceAt(
  point: FloorPoint,
): 'reception' | 'jukebox' | undefined {
  if (point.y === RECEPTION.y && Math.abs(point.x - RECEPTION.x) <= 2)
    return 'reception';
  if (
    jukeboxDistanceSquared(point) <= JUKEBOX_CONTROL_RADIUS ** 2 &&
    walkable(point, floorRows(0))
  )
    return 'jukebox';
}

export const LOUNGE_CHAIRS: readonly FloorPoint[] = [
  { x: 22, y: 5 },
  { x: 25, y: 5 },
  { x: 28, y: 5 },
  { x: 22, y: 11 },
  { x: 25, y: 11 },
  { x: 28, y: 11 },
];
export const FLOOR_STEP_MS = 145;
export const FLOOR_STEER_STEPS = 4;
const NO_TABLES: ReadonlySet<number> = new Set();

export interface FloorWalk extends FloorPoint {
  path: FloorPoint[];
  started: number;
}

/** Change direction at the next tile without restarting the current stride. */
export function redirectFloorWalk(
  walk: FloorWalk,
  now: number,
  nextPath: (point: FloorPoint) => FloorPoint[],
): FloorWalk {
  const completed = Math.max(
    0,
    Math.floor((now - walk.started) / FLOOR_STEP_MS),
  );
  const from = walk.path[Math.min(walk.path.length, completed) - 1] ?? walk;
  const inFlight = walk.path[completed];
  return {
    x: from.x,
    y: from.y,
    started: inFlight ? walk.started + completed * FLOOR_STEP_MS : now,
    path: [...(inFlight ? [inFlight] : []), ...nextPath(inFlight ?? from)],
  };
}

export function floorDirectionPath(
  from: FloorPoint,
  direction: FloorPoint,
  rows: number,
  tableSlots: ReadonlySet<number>,
  limit = FLOOR_STEER_STEPS,
): FloorPoint[] {
  const path: FloorPoint[] = [];
  if (!direction.x && !direction.y) return path;
  for (let step = 1; step <= limit; step += 1) {
    const next = {
      x: from.x + step * direction.x,
      y: from.y + step * direction.y,
    };
    if (!floorStepAllowed(path.at(-1) ?? from, next, rows, tableSlots)) break;
    path.push(next);
  }
  return path;
}
export const ROOM_TIERS = {
  free: { players: 16, tables: 3 },
  pro: { players: 100, tables: 25 },
} as const;
export type RoomTier = keyof typeof ROOM_TIERS;

export function floorRows(slots: number): number {
  return (
    LOBBY_ROWS + Math.max(1, Math.ceil(slots / TABLES_PER_WING)) * WING_ROWS
  );
}

/** Keep the wing an avatar is leaving reachable after its last table closes. */
export function floorRowsAt(y: number): number {
  return floorRows(
    (Math.floor((y - LOBBY_ROWS) / WING_ROWS) + 1) * TABLES_PER_WING,
  );
}

export function floorTable(slot: number): FloorPoint {
  const wing = Math.floor(slot / TABLES_PER_WING);
  const spot = slot % TABLES_PER_WING;
  const row = Math.floor(spot / TABLE_COLUMNS.length);
  return {
    x: TABLE_COLUMNS[spot % TABLE_COLUMNS.length],
    y: LOBBY_ROWS + wing * WING_ROWS + TABLE_ROW_OFFSETS[row],
  };
}

export function tableEntrance(slot: number): FloorPoint {
  const { x, y } = floorTable(slot);
  return { x, y: y + 2 };
}

/** Distance to the approach around the table, in tiles. */
export function tableApproachDistance(point: FloorPoint, slot: number): number {
  const center = floorTable(slot);
  return (
    Math.max(0, Math.abs(point.x - center.x) - TABLE_HALF_WIDTH) +
    Math.max(0, Math.abs(point.y - center.y) - TABLE_HALF_HEIGHT)
  );
}

function tableDepth(
  point: FloorPoint,
  tableSlots: ReadonlySet<number>,
): number {
  const wing = Math.floor((point.y - LOBBY_ROWS) / WING_ROWS);
  if (wing < 0) return 0;
  for (let spot = 0; spot < TABLES_PER_WING; spot += 1) {
    const slot = wing * TABLES_PER_WING + spot;
    if (!tableSlots.has(slot)) continue;
    const center = floorTable(slot);
    const depth = Math.min(
      TABLE_HALF_WIDTH - Math.abs(point.x - center.x),
      TABLE_HALF_HEIGHT - Math.abs(point.y - center.y),
    );
    if (depth > 0) return depth;
  }
  return 0;
}

export function walkable(
  point: FloorPoint,
  rows: number,
  tableSlots: ReadonlySet<number> = NO_TABLES,
): boolean {
  if (
    !Number.isInteger(point.x) ||
    !Number.isInteger(point.y) ||
    point.x < 1 ||
    point.x >= FLOOR_COLUMNS - 1 ||
    point.y < 1 ||
    point.y >= rows - 1
  )
    return false;
  if (point.y >= LOBBY_ROWS) return tableDepth(point, tableSlots) === 0;
  const desk = point.x >= 3 && point.x <= 9 && point.y >= 3 && point.y <= 5;
  const loungeTable =
    point.x >= 22 && point.x <= 28 && point.y >= 7 && point.y <= 9;
  return !desk && !loungeTable && jukeboxDistanceSquared(point) > 0;
}

export function floorStepAllowed(
  from: FloorPoint,
  to: FloorPoint,
  rows: number,
  tableSlots: ReadonlySet<number>,
): boolean {
  if (walkable(to, rows, tableSlots)) return true;
  // A table can be placed under an avatar. Let them take the shortest way out.
  const depth = tableDepth(to, tableSlots);
  return depth > 0 && depth < tableDepth(from, tableSlots);
}

/** Bounded shortest path through the tile grid. Players do not block each other. */
export function floorPath(
  from: FloorPoint,
  to: FloorPoint,
  rows: number,
  tableSlots: ReadonlySet<number> = NO_TABLES,
): FloorPoint[] {
  if (!walkable(to, rows, tableSlots)) return [];
  // A position saved before cabinet collision was added can still walk out.
  const leavingJukebox =
    Number.isInteger(from.x) &&
    Number.isInteger(from.y) &&
    jukeboxDistanceSquared(from) === 0;
  if (
    !walkable(from, rows, tableSlots) &&
    !tableDepth(from, tableSlots) &&
    !leavingJukebox
  )
    return [];
  const key = (point: FloorPoint) => point.y * FLOOR_COLUMNS + point.x;
  const first = key(from),
    last = key(to);
  const parents = new Int32Array(rows * FLOOR_COLUMNS).fill(-1);
  parents[first] = first;
  const queue = [first];
  for (
    let cursor = 0;
    cursor < queue.length && parents[last] < 0;
    cursor += 1
  ) {
    const at = queue[cursor];
    const x = at % FLOOR_COLUMNS,
      y = Math.floor(at / FLOOR_COLUMNS);
    for (const next of [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ]) {
      const id = key(next);
      if (
        !floorStepAllowed({ x, y }, next, rows, tableSlots) ||
        parents[id] >= 0
      )
        continue;
      parents[id] = at;
      queue.push(id);
    }
  }
  if (parents[last] < 0) return [];
  const path = [];
  for (let at = last; at !== first; at = parents[at])
    path.push({ x: at % FLOOR_COLUMNS, y: Math.floor(at / FLOOR_COLUMNS) });
  return path.reverse();
}

export function nextFloorSlot(used: Iterable<number>): number {
  const slots = new Set(used);
  let slot = 0;
  while (slots.has(slot)) slot += 1;
  return slot;
}
