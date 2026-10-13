/** Hands played and games won stored for one clientId. */
export interface ClientStatCounts {
  handsPlayed: number;
  gamesWon: number;
}

export interface ClientStatRow {
  clientId: string;
  handsPlayed: number;
  gamesWon: number;
}

export function emptyClientStats(): ClientStatCounts {
  return { handsPlayed: 0, gamesWon: 0 };
}

/** One line for the menu, lobby, and table. */
export function statsCaption(counts: ClientStatCounts): string {
  return `Hands ${counts.handsPlayed}  Wins ${counts.gamesWon}`;
}

export function statsForClient(
  rows: Iterable<ClientStatRow>,
  clientId: string,
): ClientStatCounts {
  for (const row of rows) {
    if (row.clientId === clientId) {
      return {
        handsPlayed: row.handsPlayed,
        gamesWon: row.gamesWon,
      };
    }
  }
  return emptyClientStats();
}

/** Subscription for this browser's row. Another clientId is a different row. */
export function clientStatsQuery(clientId: string): string {
  const id = `'${clientId.replaceAll("'", "''")}'`;
  return `SELECT * FROM "ClientStats" WHERE "clientId" = ${id}`;
}
