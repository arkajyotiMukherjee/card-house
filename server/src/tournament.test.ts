import {
  isRoundComplete,
  nextRoundError,
  roundStatusTag,
  roundTables,
  tournamentTableCountError,
  tournamentTableName,
  type TournamentTableRow,
} from './tournament.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function row(
  tournamentId: string,
  round: number,
  tag: TournamentTableRow['status']['tag'],
): TournamentTableRow {
  return { tournamentId, round, status: { tag } };
}

assert(
  tournamentTableCountError(1) === undefined,
  'one table is a valid round size',
);
assert(
  tournamentTableCountError(16) === undefined,
  'the max table count is accepted',
);
assert(
  tournamentTableCountError(0) ===
    'A tournament round needs at least one table',
  'zero tables is rejected',
);
assert(
  tournamentTableCountError(17) ===
    'A tournament round allows at most 16 tables',
  'past the max is rejected',
);
assert(
  tournamentTableCountError(1.5) ===
    'A tournament round needs at least one table',
  'a non-integer count is rejected',
);

assert(
  tournamentTableName('bluff', 1, 0) === 'bluff R1 T1',
  'the first table in round 1 is named T1',
);
assert(
  tournamentTableName('bluff', 2, 1) === 'bluff R2 T2',
  'the second table in round 2 is named T2',
);

const tables: TournamentTableRow[] = [
  row('t1', 1, 'finished'),
  row('t1', 1, 'finished'),
  row('t1', 2, 'waiting_for_players'),
  row('t2', 1, 'in_progress'),
];

assert(
  roundTables(tables, 't1', 1).length === 2,
  'round 1 of tournament t1 has two tables',
);
assert(
  roundTables(tables, 't1', 2).length === 1,
  'round 2 of tournament t1 has one table',
);
assert(
  roundTables(tables, 't1', 3).length === 0,
  'a round with no tables is empty',
);

assert(
  isRoundComplete(tables, 't1', 1),
  'round 1 is complete once both of its tables are finished',
);
assert(
  !isRoundComplete(tables, 't1', 2),
  'round 2 is not complete while its table is still waiting',
);
assert(
  !isRoundComplete(tables, 't1', 3),
  'a round with no tables is not complete',
);
assert(
  !isRoundComplete(tables, 't2', 1),
  'a round with an in-progress table is not complete',
);

assert(
  roundStatusTag(tables, 't1', 1) === 'complete',
  'a finished round reports complete',
);
assert(
  roundStatusTag(tables, 't1', 2) === 'in_progress',
  'a round still waiting reports in_progress',
);

assert(
  nextRoundError(true) === undefined,
  'a complete round allows the next round',
);
assert(
  nextRoundError(false) === 'Round is not complete',
  'an incomplete round rejects the next round',
);

console.log(
  JSON.stringify({
    round1Complete: isRoundComplete(tables, 't1', 1),
    round2Status: roundStatusTag(tables, 't1', 2),
    firstTableName: tournamentTableName('bluff', 1, 0),
  }),
);
