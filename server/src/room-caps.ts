/**
 * Soft caps for lobbies, tables in one lobby, and seats at one table.
 * A catalog max stays the seat count when the seat cap is higher.
 */
export interface RoomCaps {
  maxLobbies: number;
  maxTablesPerLobby: number;
  maxSeatsPerTable: number;
}

export const ROOM_CAPS_ID = 'room';

export const DEFAULT_ROOM_CAPS: RoomCaps = {
  maxLobbies: 64,
  maxTablesPerLobby: 16,
  maxSeatsPerTable: 8,
};

const CAP_FIELDS = [
  'maxLobbies',
  'maxTablesPerLobby',
  'maxSeatsPerTable',
] as const;

const DEFAULT_MIN_PLAYERS = 2;
const DEFAULT_MAX_PLAYERS = 8;

export interface SeatCatalog {
  minPlayers: number;
  maxPlayers: number;
}

export interface RequestedSeats {
  minPlayers?: number;
  maxPlayers?: number;
}

export type SeatLimits =
  { minPlayers: number; maxPlayers: number } | { error: string };

export function roomCapsRejection(caps: RoomCaps): string | undefined {
  for (const field of CAP_FIELDS) {
    const value = caps[field];
    if (!Number.isInteger(value) || value < 1 || value > 4_294_967_295) {
      return `${field} must be a positive integer`;
    }
  }
  return undefined;
}

export function lobbyCapRejection(
  existingLobbies: number,
  caps: RoomCaps,
): string | undefined {
  if (existingLobbies >= caps.maxLobbies) {
    return 'Lobby cap reached';
  }
  return undefined;
}

export function tableCapRejection(
  existingTables: number,
  caps: RoomCaps,
): string | undefined {
  if (existingTables >= caps.maxTablesPerLobby) {
    return 'Table cap reached';
  }
  return undefined;
}

/**
 * Seat count for a new table.
 * Catalog max wins over a higher cap. A request above either limit is refused.
 */
export function tableSeatLimits(
  catalog: SeatCatalog | undefined,
  requested: RequestedSeats,
  caps: RoomCaps,
): SeatLimits {
  const minPlayers =
    requested.minPlayers ?? catalog?.minPlayers ?? DEFAULT_MIN_PLAYERS;
  const maxPlayers =
    requested.maxPlayers ?? catalog?.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  if (catalog && maxPlayers > catalog.maxPlayers) {
    return { error: 'maxPlayers exceeds this game' };
  }
  if (maxPlayers > caps.maxSeatsPerTable) {
    return { error: 'Seat cap reached' };
  }
  if (maxPlayers < minPlayers) {
    return { error: 'maxPlayers must be at least minPlayers' };
  }
  return { minPlayers, maxPlayers };
}

export function openSeatCount(tableMaxPlayers: number, caps: RoomCaps): number {
  return Math.min(tableMaxPlayers, caps.maxSeatsPerTable);
}

export function joinSeatRejection(
  seated: number,
  tableMaxPlayers: number,
  caps: RoomCaps,
): string | undefined {
  if (seated >= tableMaxPlayers) {
    return 'Table is full';
  }
  if (seated >= caps.maxSeatsPerTable) {
    return 'Seat cap reached';
  }
  return undefined;
}
