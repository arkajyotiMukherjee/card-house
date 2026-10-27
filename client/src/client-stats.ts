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

/** One `Hands N  Wins N` line. Menu and lobby pass lifetime totals. */
export function statsCaption(counts: ClientStatCounts): string {
  return `Hands ${counts.handsPlayed}  Wins ${counts.gamesWon}`;
}

export type StatsSurface = 'menu' | 'lobby' | 'table';

/**
 * The menu and the lobby keep the stored lifetime totals.
 * The table shows only this sitting.
 */
export function statsCaptionFor(
  surface: StatsSurface,
  lifetime: ClientStatCounts,
  session: ClientStatCounts,
): string {
  if (surface === 'table') {
    return statsCaption(session);
  }
  return statsCaption(lifetime);
}

/** localStorage baseline for the open table. Lifetime rows stay in ClientStats. */
export const TABLE_SESSION_STATS_KEY = 'tableSessionStats';

export interface TableSessionBaseline {
  clientId: string;
  tableId: string;
  handsPlayed: number;
  gamesWon: number;
}

export interface StatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Hands and wins gained since the baseline captured at the start of this sitting. */
export function tableSessionCounts(
  lifetime: ClientStatCounts,
  baseline: ClientStatCounts,
): ClientStatCounts {
  return {
    handsPlayed: countDelta(lifetime.handsPlayed, baseline.handsPlayed),
    gamesWon: countDelta(lifetime.gamesWon, baseline.gamesWon),
  };
}

/**
 * Counts for the open table. A new table snapshots the lifetime totals so the
 * line starts at zero. The same table keeps that snapshot, including a reload.
 * Leaving clears it, so the next sitting starts over.
 */
export function countsForTableSession(
  clientId: string,
  tableId: string,
  lifetime: ClientStatCounts,
  storage: StatStorage,
): ClientStatCounts {
  const id = tableId.trim();
  if (!isSessionToken(clientId, 128) || !isSessionToken(id, 240)) {
    return emptyClientStats();
  }
  const stored = readTableSession(storage);
  if (stored && stored.clientId === clientId && stored.tableId === id) {
    return tableSessionCounts(lifetime, stored);
  }
  writeTableSession(storage, {
    clientId,
    tableId: id,
    handsPlayed: wholeCount(lifetime.handsPlayed),
    gamesWon: wholeCount(lifetime.gamesWon),
  });
  return emptyClientStats();
}

/** Drops the sitting baseline. The ClientStats lifetime row is left in place. */
export function clearTableSession(storage: StatStorage): void {
  storage.removeItem(TABLE_SESSION_STATS_KEY);
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

function countDelta(lifetime: number, baseline: number): number {
  const delta = wholeCount(lifetime) - wholeCount(baseline);
  if (delta < 0) {
    return 0;
  }
  return delta;
}

function wholeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

function readTableSession(
  storage: StatStorage,
): TableSessionBaseline | undefined {
  const raw = storage.getItem(TABLE_SESSION_STATS_KEY);
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.clientId !== 'string' ||
    typeof record.tableId !== 'string' ||
    !isSessionToken(record.clientId, 128) ||
    !isSessionToken(record.tableId, 240) ||
    !isWholeCount(record.handsPlayed) ||
    !isWholeCount(record.gamesWon)
  ) {
    return undefined;
  }
  return {
    clientId: record.clientId,
    tableId: record.tableId,
    handsPlayed: record.handsPlayed,
    gamesWon: record.gamesWon,
  };
}

function writeTableSession(
  storage: StatStorage,
  baseline: TableSessionBaseline,
): void {
  storage.setItem(TABLE_SESSION_STATS_KEY, JSON.stringify(baseline));
}

function isWholeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSessionToken(value: string, max: number): boolean {
  if (value.length === 0 || value.length > max) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const upper = code >= 65 && code <= 90;
    const lower = code >= 97 && code <= 122;
    if (!digit && !upper && !lower && char !== '_' && char !== '-') {
      return false;
    }
  }
  return true;
}
