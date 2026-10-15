/**
 * Membership shape for a later inactive-lobby pass.
 * Disconnect flips `connected` and leaves the row, the seats, and the lobby.
 * Leave Room is the only path that deletes a member. Nothing here is scheduled.
 */

export function markDisconnected<T extends { id: string; connected: boolean }>(
  member: T,
): T {
  return { ...member, connected: false };
}

/** Ids of seat, spectator, or voice rows that belong to one member. */
export function idsForMember(
  memberId: string,
  rows: readonly { id: string; lobbyMemberId: string }[],
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.lobbyMemberId === memberId) {
      ids.push(row.id);
    }
  }
  return ids;
}
