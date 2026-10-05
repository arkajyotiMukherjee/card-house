export const LEAVE_TABLE_BUTTON = { x: 16, y: 16, w: 168, h: 28 } as const;

/**
 * Clockwise from the local seat at bottom center.
 * Your seat stays at the first anchor. The rest follow seat order.
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
  return ordered.map((seat, index) => {
    const slot = (index - start + ordered.length) % ordered.length;
    const anchor = SEAT_ANCHORS[slot % SEAT_ANCHORS.length] ?? SEAT_ANCHORS[0];
    return { ...seat, x: anchor.x, y: anchor.y };
  });
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Filtered subscription for one table.
 * SQL uses the module's camelCase columns (`CaseConversionPolicy.None`).
 * The generated client `.name("table_id")` is not the column SpacetimeDB stores.
 */
export function tableSubscriptionQueries(
  tableId: string,
): readonly [string, string] {
  const id = quoteSqlString(tableId);
  return [
    `SELECT * FROM GameTable WHERE id = ${id}`,
    `SELECT * FROM GameSeat WHERE tableId = ${id}`,
  ];
}
