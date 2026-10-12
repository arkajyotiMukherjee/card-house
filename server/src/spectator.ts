/**
 * A spectator watches one table without a `GameSeat`.
 * A full table, a game in progress, and a finished game are not reasons to refuse.
 * The viewer does not count toward `maxPlayers` and is not dealt a hand.
 */
export function spectateBlock(input: {
  seated: boolean;
  watchingThis: boolean;
  watchingOther: boolean;
}): string | undefined {
  if (input.seated) {
    return 'Already seated';
  }
  if (input.watchingThis || input.watchingOther) {
    return 'Already watching';
  }
  return undefined;
}

export function spectatorRowId(tableId: string, lobbyMemberId: string): string {
  return `spectator_${tableId}_${lobbyMemberId}`;
}
