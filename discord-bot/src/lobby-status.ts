export interface LobbyStatusRow {
  id: string;
  code: string;
  status: { tag: string };
}

export interface LobbyStatusConnection {
  db: {
    lobby: { iter(): Iterable<LobbyStatusRow> };
    lobbyMember: { iter(): Iterable<{ lobbyId: string }> };
    gameTable: { iter(): Iterable<{ lobbyId: string }> };
  };
}

export interface LobbyStatusReport {
  code: string;
  found: boolean;
  live: boolean;
  tables: number;
  players: number;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function readLobbyStatus(
  connection: LobbyStatusConnection,
  rawCode: string,
): LobbyStatusReport {
  const code = normalizeRoomCode(rawCode);
  if (code.length === 0) {
    return { code, found: false, live: false, tables: 0, players: 0 };
  }
  let lobby: LobbyStatusRow | undefined;
  for (const row of connection.db.lobby.iter()) {
    if (row.code === code) {
      lobby = row;
      break;
    }
  }
  if (!lobby) {
    return { code, found: false, live: false, tables: 0, players: 0 };
  }
  return {
    code: lobby.code,
    found: true,
    live: isLive(lobby.status.tag),
    tables: countForLobby(connection.db.gameTable.iter(), lobby.id),
    players: countForLobby(connection.db.lobbyMember.iter(), lobby.id),
  };
}

export function statusReplyContent(report: LobbyStatusReport): string {
  if (!report.found) {
    if (report.code.length === 0) {
      return 'Room code is required';
    }
    return `Room ${report.code} was not found`;
  }
  const state = report.live ? 'live' : 'closed';
  const tables = countPhrase(report.tables, 'table', 'tables');
  const players = countPhrase(report.players, 'player', 'players');
  return `Lobby ${report.code} is ${state}\n${tables}, ${players}`;
}

function isLive(tag: string): boolean {
  return tag === 'open' || tag === 'Open';
}

function countForLobby(
  rows: Iterable<{ lobbyId: string }>,
  lobbyId: string,
): number {
  let count = 0;
  for (const row of rows) {
    if (row.lobbyId === lobbyId) {
      count += 1;
    }
  }
  return count;
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
