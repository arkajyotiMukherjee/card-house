/** A solo lobby this client started, plus the table they sit at. */
export interface SoloSeat {
  lobbyId: string;
  code: string;
  tableId: string;
  lobbyMemberId: string;
}

export interface SoloLobbyRef {
  id: string;
  code: string;
  solo: boolean;
  createdAtMicros: bigint;
}

export interface SoloMemberRef {
  id: string;
  lobbyId: string;
  clientId: string;
  isBot: boolean;
}

export interface SoloTableRef {
  id: string;
  lobbyId: string;
  createdAtMicros: bigint;
}

function newer(
  createdAtMicros: bigint,
  id: string,
  match: { createdAtMicros: bigint; id: string } | undefined,
): boolean {
  if (!match) {
    return true;
  }
  return (
    createdAtMicros > match.createdAtMicros ||
    (createdAtMicros === match.createdAtMicros && id > match.id)
  );
}

/**
 * The newest solo lobby this person started, and its newest table.
 * Bot members are not a seat this client can open.
 */
export function findSoloSeat(
  clientId: string,
  lobbies: readonly SoloLobbyRef[],
  members: readonly SoloMemberRef[],
  tables: readonly SoloTableRef[],
): SoloSeat | undefined {
  let lobby: SoloLobbyRef | undefined;
  let member: SoloMemberRef | undefined;
  for (const row of lobbies) {
    if (!row.solo) {
      continue;
    }
    const seated = members.find(
      (entry) =>
        entry.lobbyId === row.id && entry.clientId === clientId && !entry.isBot,
    );
    if (!seated || !newer(row.createdAtMicros, row.id, lobby)) {
      continue;
    }
    lobby = row;
    member = seated;
  }
  if (!lobby || !member) {
    return undefined;
  }
  let table: SoloTableRef | undefined;
  for (const row of tables) {
    if (row.lobbyId !== lobby.id) {
      continue;
    }
    if (newer(row.createdAtMicros, row.id, table)) {
      table = row;
    }
  }
  if (!table) {
    return undefined;
  }
  return {
    lobbyId: lobby.id,
    code: lobby.code,
    tableId: table.id,
    lobbyMemberId: member.id,
  };
}

/** True while this client still has their own lobby membership. */
export function hasOwnMembership(
  members: readonly Pick<SoloMemberRef, 'clientId' | 'isBot'>[],
  clientId: string,
): boolean {
  for (const member of members) {
    if (member.clientId === clientId && !member.isBot) {
      return true;
    }
  }
  return false;
}
