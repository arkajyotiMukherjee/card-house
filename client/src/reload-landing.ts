/** Where a resolved reload opens. A table wins over a room. */
export type ReloadLanding = 'table' | 'lobby' | 'menu';

/**
 * The message on the shared loading screen while a saved session resolves.
 * A stored table id is a table. A stored room with an empty table id is a room.
 */
export function reloadLoadingLine(
  saved: { tableId: string } | undefined,
): string | undefined {
  if (!saved) {
    return undefined;
  }
  if (saved.tableId.trim().length > 0) {
    return 'Loading table';
  }
  return 'Loading room';
}

/**
 * After the connection is ready. `atTable` is true when this player's
 * `GameSeat` or `Spectator` row is still at the stored table. A room
 * with no table opens the lobby. Neither opens the main menu.
 */
export function reloadLanding(place: {
  atTable: boolean;
  inRoom: boolean;
}): ReloadLanding {
  if (place.atTable) {
    return 'table';
  }
  if (place.inRoom) {
    return 'lobby';
  }
  return 'menu';
}
