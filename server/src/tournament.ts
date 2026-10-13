/**
 * Pure helpers for the tournament structure: one event grouping several
 * tables of one `gameType` into numbered rounds. `src/index.ts` owns the
 * `Tournament` table and the `tournamentId` / `round` columns on `GameTable`.
 */

export type TournamentRoundStatusTag = 'in_progress' | 'complete';

const MIN_TOURNAMENT_TABLES = 1;
const MAX_TOURNAMENT_TABLES = 16;

export interface TournamentTableRow {
  tournamentId: string;
  round: number;
  status: { tag: 'waiting_for_players' | 'in_progress' | 'finished' };
}

/** A tournament round needs at least one table and stays under the lobby's table cap. */
export function tournamentTableCountError(count: number): string | undefined {
  if (!Number.isInteger(count) || count < MIN_TOURNAMENT_TABLES) {
    return 'A tournament round needs at least one table';
  }
  if (count > MAX_TOURNAMENT_TABLES) {
    return `A tournament round allows at most ${MAX_TOURNAMENT_TABLES} tables`;
  }
  return undefined;
}

/** Default name for a table SpacetimeDB creates as part of a tournament round. */
export function tournamentTableName(
  gameType: string,
  round: number,
  index: number,
): string {
  return `${gameType} R${round} T${index + 1}`;
}

/** The tables that belong to one round of one tournament. */
export function roundTables<T extends TournamentTableRow>(
  tables: Iterable<T>,
  tournamentId: string,
  round: number,
): T[] {
  const matched: T[] = [];
  for (const row of tables) {
    if (row.tournamentId === tournamentId && row.round === round) {
      matched.push(row);
    }
  }
  return matched;
}

/** A round is complete once it has at least one table and every table there is finished. */
export function isRoundComplete<T extends TournamentTableRow>(
  tables: Iterable<T>,
  tournamentId: string,
  round: number,
): boolean {
  const matched = roundTables(tables, tournamentId, round);
  if (matched.length === 0) {
    return false;
  }
  return matched.every((row) => row.status.tag === 'finished');
}

/** `Tournament.roundStatus` for the current round, derived from its tables. */
export function roundStatusTag<T extends TournamentTableRow>(
  tables: Iterable<T>,
  tournamentId: string,
  round: number,
): TournamentRoundStatusTag {
  return isRoundComplete(tables, tournamentId, round)
    ? 'complete'
    : 'in_progress';
}

/** `create_tournament_round` rejects a new round while the current one is not complete. */
export function nextRoundError(roundComplete: boolean): string | undefined {
  if (!roundComplete) {
    return 'Round is not complete';
  }
  return undefined;
}
