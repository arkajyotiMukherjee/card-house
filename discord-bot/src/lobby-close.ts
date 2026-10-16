import { normalizeRoomCode } from './lobby-status.ts';

export interface CloseLobbyRow {
  id: string;
  code: string;
  status: { tag: string };
}

export interface CloseRoomConnection {
  db: {
    lobby: { iter(): Iterable<CloseLobbyRow> };
    lobbyMember: { iter(): Iterable<{ lobbyId: string }> };
    gameTable: { iter(): Iterable<{ id: string; lobbyId: string }> };
    gameSeat: { iter(): Iterable<{ tableId: string }> };
  };
  reducers: {
    closeLobby(args: { lobbyCode: string }): Promise<void>;
  };
}

export interface CloseRoomReport {
  code: string;
  found: boolean;
  alreadyClosed: boolean;
  lobbyPlayers: number;
  tablePlayers: number;
  closed: boolean;
}

/**
 * A room can close only when nobody is in the lobby and nobody is seated
 * at one of its tables. `close_lobby` then marks it closed, and the voice
 * watch deletes the lobby channel and any table channels still open.
 */
export async function closeEmptyRoom(
  connection: CloseRoomConnection,
  rawCode: string,
): Promise<CloseRoomReport> {
  const report = inspectRoom(connection, rawCode);
  if (
    !report.found ||
    report.alreadyClosed ||
    report.lobbyPlayers > 0 ||
    report.tablePlayers > 0
  ) {
    return report;
  }
  await connection.reducers.closeLobby({ lobbyCode: report.code });
  return { ...report, closed: true };
}

export function inspectRoom(
  connection: CloseRoomConnection,
  rawCode: string,
): CloseRoomReport {
  const code = normalizeRoomCode(rawCode);
  const empty: CloseRoomReport = {
    code,
    found: false,
    alreadyClosed: false,
    lobbyPlayers: 0,
    tablePlayers: 0,
    closed: false,
  };
  if (code.length === 0) {
    return empty;
  }
  let lobby: CloseLobbyRow | undefined;
  for (const row of connection.db.lobby.iter()) {
    if (row.code === code) {
      lobby = row;
      break;
    }
  }
  if (!lobby) {
    return empty;
  }
  const tableIds = new Set<string>();
  for (const table of connection.db.gameTable.iter()) {
    if (table.lobbyId === lobby.id) {
      tableIds.add(table.id);
    }
  }
  let lobbyPlayers = 0;
  for (const member of connection.db.lobbyMember.iter()) {
    if (member.lobbyId === lobby.id) {
      lobbyPlayers += 1;
    }
  }
  let tablePlayers = 0;
  for (const seat of connection.db.gameSeat.iter()) {
    if (tableIds.has(seat.tableId)) {
      tablePlayers += 1;
    }
  }
  return {
    code: lobby.code,
    found: true,
    alreadyClosed: isClosed(lobby.status.tag),
    lobbyPlayers,
    tablePlayers,
    closed: false,
  };
}

export function closeReplyContent(report: CloseRoomReport): string {
  if (!report.found) {
    if (report.code.length === 0) {
      return 'Room code is required';
    }
    return `Room ${report.code} was not found`;
  }
  if (report.lobbyPlayers > 0) {
    const noun = report.lobbyPlayers === 1 ? 'player' : 'players';
    return `Lobby ${report.code} still has ${report.lobbyPlayers} ${noun}`;
  }
  if (report.tablePlayers > 0) {
    return `Lobby ${report.code} still has players at a table`;
  }
  if (report.alreadyClosed) {
    return `Lobby ${report.code} is already closed`;
  }
  return `Lobby ${report.code} is closed`;
}

function isClosed(tag: string): boolean {
  return tag === 'closed' || tag === 'Closed';
}
