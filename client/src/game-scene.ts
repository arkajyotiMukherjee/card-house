import {
  DUMMY_GAME_TYPE,
  readDummyState,
  type DummyIntent,
  type DummyState,
} from '../../src/shared/games/dummy-counter';
import { BUTTON_HEIGHT } from './button-style';
import { CHAT_TEXT } from './chat-layout';
import { isMobileDevice } from './mobile-shell';
const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();

export const LEAVE_TABLE_BUTTON = {
  x: 8,
  y: 16,
  w: PHONE_LAYOUT ? 140 : 168,
  h: PHONE_LAYOUT ? 44 : BUTTON_HEIGHT,
} as const;

/** The `?` control, top right. Opens the per-game How to Play overlay. */
export const HOW_TO_PLAY_BUTTON = {
  x: PHONE_LAYOUT ? 908 : 900,
  y: 16,
  w: PHONE_LAYOUT ? 44 : 52,
  h: PHONE_LAYOUT ? 44 : 52,
} as const;

/** The `Chat` control, top center. Opens the per-table chat overlay. */
export const TABLE_CHAT_BUTTON = {
  x: PHONE_LAYOUT ? 160 : 192,
  y: 16,
  w: PHONE_LAYOUT ? 80 : 64,
  h: PHONE_LAYOUT ? 44 : BUTTON_HEIGHT,
} as const;

/** How to Play window, centered on the 960×540 canvas. */
export const HOW_TO_PLAY_PANEL = {
  x: 120,
  y: PHONE_LAYOUT ? 88 : 50,
  w: 720,
  h: 440,
} as const;

/** Table chat window. Same box as How to Play; only one overlay is open at a time. */
export const TABLE_CHAT_PANEL = HOW_TO_PLAY_PANEL;

/** Message history grid inside the chat window. */
const chatText = CHAT_TEXT[PHONE_LAYOUT ? 'phone' : 'desktop'];
const CHAT_TEXT_PADDING = 24;
export const TABLE_CHAT_TEXT = {
  padding: CHAT_TEXT_PADDING,
  top: PHONE_LAYOUT ? 104 : 96,
  ...chatText,
  rows: PHONE_LAYOUT ? 10 : 12,
  columns: Math.floor(
    (TABLE_CHAT_PANEL.w - 2 * CHAT_TEXT_PADDING) / chatText.size,
  ),
} as const;

/** Text field and Send button along the bottom of the chat window. */
export const TABLE_CHAT_INPUT = {
  x: 144,
  y: PHONE_LAYOUT ? 448 : 442,
  w: 544,
  h: PHONE_LAYOUT ? 64 : BUTTON_HEIGHT,
} as const;
export const TABLE_CHAT_SEND_BUTTON = {
  x: 700,
  y: PHONE_LAYOUT ? 448 : 442,
  w: PHONE_LAYOUT ? 116 : 80,
  h: PHONE_LAYOUT ? 64 : BUTTON_HEIGHT,
} as const;

/**
 * Text grid inside the window. Press Start 2P at 8px is 8px per column,
 * so `columns` is the width left after padding divided by 8.
 */
export const HOW_TO_PLAY_TEXT = {
  padding: 24,
  top: 64,
  size: PHONE_LAYOUT ? 14 : 8,
  lineHeight: PHONE_LAYOUT ? 24 : 16,
  rows: PHONE_LAYOUT ? 11 : 19,
  columns: PHONE_LAYOUT ? 48 : 84,
} as const;

/** Click target on a dummy table. The number painted here is the subscribed count. */
export const COUNTER_BUTTON = { x: 392, y: 220, w: 176, h: 72 } as const;

export type SeatEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * One point on the felt. `edgeSeats` is how many seats share that edge in
 * the plan that uses this point, and `edgeIndex` counts left-to-right on
 * the top or top-to-bottom on a side.
 */
export interface SeatAnchor {
  x: number;
  y: number;
  edge: SeatEdge;
  edgeSeats: number;
  edgeIndex: number;
}

/** Top rail, left to right. Outer seats stay classified as top. */
const TOP_RAIL = { start: 246, end: 714 } as const;
/** Side rail, top to bottom, clear of the local hand and the action cluster. */
const SIDE_RAIL = { start: 136, end: 400, leftX: 92, rightX: 868 } as const;
export const PHONE_RIGHT_PAIR_RAIL = { start: 108, end: 300 } as const;

/**
 * A seat on `edge` when `count` seats share it.
 * The same edge, index, and count always land on the same pixel.
 */
export function seatPoint(
  edge: SeatEdge,
  index: number,
  count: number,
): SeatAnchor {
  if (edge === 'bottom') {
    return {
      x: 480,
      y: typeof window !== 'undefined' && isMobileDevice() ? 432 : 456,
      edge,
      edgeSeats: 1,
      edgeIndex: 0,
    };
  }
  if (edge === 'top') {
    const span = TOP_RAIL.end - TOP_RAIL.start;
    const x = Math.round(TOP_RAIL.start + (span / count) * (index + 0.5));
    return {
      x,
      y: count === 1 ? 96 : 104,
      edge,
      edgeSeats: count,
      edgeIndex: index,
    };
  }
  // Phone action buttons occupy the lower right; keep right-hand seats above them.
  const phoneRight =
    edge === 'right' && typeof window !== 'undefined' && isMobileDevice();
  const rail = phoneRight
    ? count === 2
      ? PHONE_RIGHT_PAIR_RAIL
      : { start: SIDE_RAIL.start, end: 270 }
    : SIDE_RAIL;
  const span = rail.end - rail.start;
  const y = Math.round(rail.start + (span / count) * (index + 0.5));
  return {
    x: edge === 'right' ? SIDE_RAIL.rightX : SIDE_RAIL.leftX,
    y,
    edge,
    edgeSeats: count,
    edgeIndex: index,
  };
}

const BOTTOM = seatPoint('bottom', 0, 1);
const RIGHT = seatPoint('right', 0, 1);
const LEFT = seatPoint('left', 0, 1);
const TOP = seatPoint('top', 0, 1);
const TOP_LEFT_2 = seatPoint('top', 0, 2);
const TOP_RIGHT_2 = seatPoint('top', 1, 2);
const TOP_LEFT_3 = seatPoint('top', 0, 3);
const TOP_MID_3 = seatPoint('top', 1, 3);
const TOP_RIGHT_3 = seatPoint('top', 2, 3);
const LEFT_UPPER = seatPoint('left', 0, 2);
const LEFT_LOWER = seatPoint('left', 1, 2);
const RIGHT_UPPER = seatPoint('right', 0, 2);
const RIGHT_LOWER = seatPoint('right', 1, 2);

/**
 * Points the older tests name by index. Index 0 is bottom, 1 is the lone
 * right seat, 3 is the lone top seat, and 5 is the lone left seat.
 * Full tables use the side pairs and the shared top seats as well.
 */
export const SEAT_ANCHORS = [
  BOTTOM,
  RIGHT,
  TOP_RIGHT_2,
  TOP,
  TOP_LEFT_2,
  LEFT,
  LEFT_LOWER,
  RIGHT_LOWER,
] as const;

const SEAT_PLANS: Readonly<Record<number, readonly SeatAnchor[]>> = {
  1: [BOTTOM],
  2: [BOTTOM, TOP],
  3: [BOTTOM, RIGHT, LEFT],
  4: [BOTTOM, RIGHT, LEFT, TOP],
  5: [BOTTOM, RIGHT, TOP_RIGHT_2, TOP_LEFT_2, LEFT],
  6: [BOTTOM, RIGHT, TOP_RIGHT_3, TOP_MID_3, TOP_LEFT_3, LEFT],
  7: [
    BOTTOM,
    RIGHT_LOWER,
    RIGHT_UPPER,
    TOP_RIGHT_2,
    TOP_LEFT_2,
    LEFT_UPPER,
    LEFT_LOWER,
  ],
  8: [
    BOTTOM,
    RIGHT_LOWER,
    RIGHT_UPPER,
    TOP_RIGHT_3,
    TOP_MID_3,
    TOP_LEFT_3,
    LEFT_UPPER,
    LEFT_LOWER,
  ],
};

const ANCHORS_BY_PIXEL = new Map<string, SeatAnchor>();
for (const plan of Object.values(SEAT_PLANS)) {
  for (const anchor of plan) {
    ANCHORS_BY_PIXEL.set(`${anchor.x},${anchor.y}`, anchor);
  }
}

/** The registered seat at this pixel, when the plans use it. */
export function anchorAt(x: number, y: number): SeatAnchor | undefined {
  return ANCHORS_BY_PIXEL.get(`${x},${y}`);
}

/**
 * Seats for this many players. The local player is first (bottom).
 * Two sit across the top. Three use the left and right and leave the top
 * empty. Four adds that top seat. Five and six fill the top. Seven and
 * eight put two seats on each side, with two or three across the top.
 * The order is clockwise from the local player, screen-right first, and
 * it does not change between reconnects.
 */
export function seatAnchorsFor(count: number): readonly SeatAnchor[] {
  if (count <= 1) {
    return SEAT_PLANS[1];
  }
  return SEAT_PLANS[Math.min(8, count)] ?? SEAT_PLANS[8];
}

export interface TableRef {
  id: string;
  lobbyId: string;
  createdAtMicros: bigint;
}

export interface MemberRef {
  id: string;
  lobbyId: string;
  clientId: string;
  name: string;
}

export interface SeatRef {
  tableId: string;
  lobbyMemberId: string;
  seatIndex: number;
}

export interface NamedSeat {
  seatIndex: number;
  name: string;
  self: boolean;
  lobbyMemberId: string;
  /** The bot saw this member in this table's voice channel. */
  inVoice: boolean;
}

export interface PlacedSeat extends NamedSeat {
  x: number;
  y: number;
}

/** The one table this lobby can sit at. Newest row wins when several exist. */
export function knownTableId(
  tables: Iterable<TableRef>,
  lobbyId: string,
): string | undefined {
  let match: TableRef | undefined;
  for (const table of tables) {
    if (table.lobbyId !== lobbyId) {
      continue;
    }
    if (
      !match ||
      table.createdAtMicros > match.createdAtMicros ||
      (table.createdAtMicros === match.createdAtMicros && table.id > match.id)
    ) {
      match = table;
    }
  }
  return match?.id;
}

export function memberForClient(
  members: Iterable<MemberRef>,
  lobbyId: string,
  clientId: string,
): MemberRef | undefined {
  for (const member of members) {
    if (member.lobbyId === lobbyId && member.clientId === clientId) {
      return member;
    }
  }
  return undefined;
}

export function seatLabels(
  seats: Iterable<SeatRef>,
  members: Iterable<MemberRef>,
  tableId: string,
  selfClientId: string,
  inVoice: ReadonlySet<string> = new Set(),
): NamedSeat[] {
  const byId = new Map<string, MemberRef>();
  for (const member of members) {
    byId.set(member.id, member);
  }
  const labels: NamedSeat[] = [];
  for (const seat of seats) {
    if (seat.tableId !== tableId) {
      continue;
    }
    const member = byId.get(seat.lobbyMemberId);
    labels.push({
      seatIndex: seat.seatIndex,
      name: member?.name ?? 'Player',
      self: member?.clientId === selfClientId,
      lobbyMemberId: seat.lobbyMemberId,
      inVoice: inVoice.has(seat.lobbyMemberId),
    });
  }
  labels.sort((a, b) => a.seatIndex - b.seatIndex);
  return labels;
}

export function placeSeats(labels: readonly NamedSeat[]): PlacedSeat[] {
  const ordered = [...labels].sort((a, b) => a.seatIndex - b.seatIndex);
  let start = ordered.findIndex((seat) => seat.self);
  if (start < 0) {
    start = 0;
  }
  const anchors = seatAnchorsFor(ordered.length);
  return ordered.map((seat, index) => {
    const slot = (index - start + ordered.length) % ordered.length;
    const anchor = anchors[slot % anchors.length] ?? anchors[0];
    return { ...seat, x: anchor.x, y: anchor.y };
  });
}

/**
 * Counter state from a subscribed `GameTable` row.
 * Other game types have no dummy state. Invalid JSON throws.
 */
export function dummyStateFromJson(
  gameType: string,
  stateJson: string,
): DummyState | undefined {
  if (gameType !== DUMMY_GAME_TYPE) {
    return undefined;
  }
  return readDummyState(JSON.parse(stateJson));
}

export function dummyIntentPayload(intent: DummyIntent): string {
  return JSON.stringify(intent);
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Filtered subscription for one table.
 * SQL uses the module's camelCase columns (`CaseConversionPolicy.None`).
 * The generated client `.name("table_id")` is not the column SpacetimeDB stores.
 */
export function memberIsWatching(
  spectators: Iterable<{ tableId: string; lobbyMemberId: string }>,
  tableId: string,
  lobbyMemberId: string,
): boolean {
  if (tableId.length === 0 || lobbyMemberId.length === 0) {
    return false;
  }
  for (const row of spectators) {
    if (row.tableId === tableId && row.lobbyMemberId === lobbyMemberId) {
      return true;
    }
  }
  return false;
}

/** Shown when this member is watching and has no player seat. */
export function spectatingLine(
  seatedHere: boolean,
  watchingHere: boolean,
): string {
  if (seatedHere || !watchingHere) {
    return '';
  }
  return 'Spectating';
}

export function tableSubscriptionQueries(
  tableId: string,
): readonly [string, string, string, string, string] {
  const id = quoteSqlString(tableId);
  return [
    `SELECT * FROM GameTable WHERE id = ${id}`,
    `SELECT * FROM GameSeat WHERE tableId = ${id}`,
    `SELECT * FROM GameEvent WHERE tableId = ${id}`,
    `SELECT * FROM Spectator WHERE tableId = ${id}`,
    `SELECT * FROM TableChatMessage WHERE tableId = ${id}`,
  ];
}
