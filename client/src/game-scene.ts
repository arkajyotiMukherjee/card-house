import {
  DUMMY_GAME_TYPE,
  readDummyState,
  type DummyIntent,
  type DummyState,
} from '../../src/shared/games/dummy-counter';
import { BUTTON_HEIGHT } from './button-style';

export const LEAVE_TABLE_BUTTON = {
  x: 16,
  y: 16,
  w: 168,
  h: BUTTON_HEIGHT,
} as const;

/** The `?` control, top right. Opens the per-game How to Play overlay. */
export const HOW_TO_PLAY_BUTTON = {
  x: 916,
  y: 16,
  w: BUTTON_HEIGHT,
  h: BUTTON_HEIGHT,
} as const;

/** The `Chat` control, top center. Opens the per-table chat overlay. */
export const TABLE_CHAT_BUTTON = {
  x: 200,
  y: 16,
  w: 64,
  h: BUTTON_HEIGHT,
} as const;

/** How to Play window, centered on the 960×540 canvas. */
export const HOW_TO_PLAY_PANEL = { x: 120, y: 50, w: 720, h: 440 } as const;

/** Table chat window. Same box as How to Play; only one overlay is open at a time. */
export const TABLE_CHAT_PANEL = { x: 120, y: 50, w: 720, h: 440 } as const;

/** Message history grid inside the chat window. */
export const TABLE_CHAT_TEXT = {
  padding: 24,
  top: 64,
  lineHeight: 16,
  rows: 15,
  columns: 84,
} as const;

/** Text field and Send button along the bottom of the chat window. */
export const TABLE_CHAT_INPUT = {
  x: 144,
  y: 442,
  w: 544,
  h: BUTTON_HEIGHT,
} as const;
export const TABLE_CHAT_SEND_BUTTON = {
  x: 700,
  y: 442,
  w: 80,
  h: BUTTON_HEIGHT,
} as const;

/**
 * Text grid inside the window. Press Start 2P at 8px is 8px per column,
 * so `columns` is the width left after padding divided by 8.
 */
export const HOW_TO_PLAY_TEXT = {
  padding: 24,
  top: 64,
  lineHeight: 16,
  rows: 19,
  columns: 84,
} as const;

/** Click target on a dummy table. The number painted here is the subscribed count. */
export const COUNTER_BUTTON = { x: 392, y: 220, w: 176, h: 72 } as const;

/**
 * Points around the felt. Index 0 is bottom center. `seatAnchorsFor` picks
 * a subset so a short table does not stack every opponent on one side.
 */
export const SEAT_ANCHORS = [
  { x: 480, y: 456 },
  { x: 780, y: 310 },
  { x: 700, y: 128 },
  { x: 480, y: 72 },
  { x: 260, y: 128 },
  { x: 180, y: 310 },
  { x: 280, y: 456 },
  { x: 680, y: 456 },
] as const;

/**
 * Seats for this many players. The local player is first (bottom).
 * Three players use the left and right and leave the top empty.
 * The fourth player sits at the top. Larger tables spread around the felt.
 */
export function seatAnchorsFor(
  count: number,
): readonly { x: number; y: number }[] {
  const bottom = SEAT_ANCHORS[0];
  const right = SEAT_ANCHORS[1];
  const topRight = SEAT_ANCHORS[2];
  const top = SEAT_ANCHORS[3];
  const topLeft = SEAT_ANCHORS[4];
  const left = SEAT_ANCHORS[5];
  const bottomLeft = SEAT_ANCHORS[6];
  const bottomRight = SEAT_ANCHORS[7];
  if (count <= 1) {
    return [bottom];
  }
  if (count === 2) {
    return [bottom, top];
  }
  if (count === 3) {
    return [bottom, right, left];
  }
  if (count === 4) {
    return [bottom, right, left, top];
  }
  if (count === 5) {
    return [bottom, right, topRight, topLeft, left];
  }
  if (count === 6) {
    return [bottom, right, topRight, top, topLeft, left];
  }
  if (count === 7) {
    return [bottom, bottomRight, right, topRight, topLeft, left, bottomLeft];
  }
  return [bottom, bottomRight, right, topRight, top, topLeft, left, bottomLeft];
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
