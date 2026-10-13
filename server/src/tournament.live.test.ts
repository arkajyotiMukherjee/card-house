import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

if (process.env.CARDROOM_LIVE !== '1') {
  console.log(JSON.stringify({ ok: true, skipped: true }));
  process.exit(0);
}

const server = process.env.SPACETIMEDB_SERVER ?? 'local';
const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
const GAME_TYPE = 'bluff';
const TABLES_PER_ROUND = 2;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function commandText(error: unknown): string {
  if (error && typeof error === 'object') {
    const stdout =
      'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '';
    const stderr =
      'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
    const message = error instanceof Error ? error.message : '';
    return `${stdout}${stderr}${message}`;
  }
  return String(error);
}

async function spacetime(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await exec('spacetime', args, {
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return `${stdout}${stderr}`;
  } catch (error: unknown) {
    throw new Error(commandText(error));
  }
}

async function call(
  reducer: string,
  ...reducerArgs: string[]
): Promise<string> {
  return spacetime([
    'call',
    '-s',
    server,
    '-y',
    '--anonymous',
    database,
    reducer,
    ...reducerArgs,
  ]);
}

interface SqlColumn {
  name: string;
  variants: string[];
}

async function sql(query: string): Promise<string> {
  return spacetime([
    'sql',
    '-s',
    server,
    '-y',
    '--anonymous',
    '--format',
    'json',
    database,
    query,
  ]);
}

function parseSql(text: string): { columns: SqlColumn[]; rows: unknown[][] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error(`SQL did not return JSON: ${text}`);
  }
  const payload = JSON.parse(text.slice(start, end + 1)) as {
    schema?: {
      elements?: {
        name?: { some?: string };
        algebraic_type?: {
          Sum?: { variants?: { name?: { some?: string } }[] };
        };
      }[];
    };
    rows?: unknown[][];
  };
  const columns = (payload.schema?.elements ?? []).map((element) => ({
    name: element.name?.some ?? '',
    variants: (element.algebraic_type?.Sum?.variants ?? []).map(
      (variant) => variant.name?.some ?? '',
    ),
  }));
  return { columns, rows: payload.rows ?? [] };
}

function cellTag(value: unknown, variants: string[]): string {
  if (Array.isArray(value) && typeof value[0] === 'number') {
    return variants[value[0]] ?? String(value[0]);
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function cellString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

async function rowsOf(
  query: string,
): Promise<{ columns: SqlColumn[]; rows: unknown[][] }> {
  return parseSql(await sql(query));
}

function column(columns: SqlColumn[], name: string): number {
  const index = columns.findIndex((candidate) => candidate.name === name);
  if (index < 0) {
    throw new Error(`Column ${name} not found`);
  }
  return index;
}

async function main(): Promise<void> {
  const beforeLobbies = new Set(
    (await rowsOf('SELECT id FROM Lobby')).rows.map((row) =>
      cellString(row[0]),
    ),
  );
  await call('create_lobby');
  const lobbyRows = await rowsOf('SELECT id, code FROM Lobby');
  const idIndex = column(lobbyRows.columns, 'id');
  const codeIndex = column(lobbyRows.columns, 'code');
  const createdLobby = lobbyRows.rows.find(
    (row) => !beforeLobbies.has(cellString(row[idIndex])),
  );
  if (!createdLobby) {
    throw new Error('create_lobby did not add a lobby');
  }
  const lobbyId = cellString(createdLobby[idIndex]);
  const lobbyCode = cellString(createdLobby[codeIndex]);

  const clientIds = [
    'tourney-t1-a',
    'tourney-t1-b',
    'tourney-t2-a',
    'tourney-t2-b',
  ];
  const memberIdByClient = new Map<string, string>();
  for (const [index, clientId] of clientIds.entries()) {
    await call(
      'join_lobby',
      JSON.stringify(lobbyCode),
      JSON.stringify(clientId),
      JSON.stringify(`Player ${index + 1}`),
    );
  }
  const memberRows = await rowsOf(
    `SELECT id, clientId FROM LobbyMember WHERE lobbyId = '${lobbyId}'`,
  );
  const memberIdIndex = column(memberRows.columns, 'id');
  const memberClientIndex = column(memberRows.columns, 'clientId');
  for (const row of memberRows.rows) {
    memberIdByClient.set(
      cellString(row[memberClientIndex]),
      cellString(row[memberIdIndex]),
    );
  }
  for (const clientId of clientIds) {
    assert(memberIdByClient.has(clientId), `${clientId} joined the lobby`);
  }

  await call(
    'create_tournament',
    JSON.stringify(lobbyId),
    JSON.stringify(GAME_TYPE),
    String(TABLES_PER_ROUND),
    'null',
  );

  const tournamentRows = await rowsOf(
    `SELECT id, currentRound, roundStatus FROM Tournament WHERE lobbyId = '${lobbyId}'`,
  );
  assert(
    tournamentRows.rows.length === 1,
    'create_tournament inserted one Tournament row',
  );
  const tournamentIdIndex = column(tournamentRows.columns, 'id');
  const currentRoundIndex = column(tournamentRows.columns, 'currentRound');
  const roundStatusIndex = column(tournamentRows.columns, 'roundStatus');
  const tournamentId = cellString(tournamentRows.rows[0][tournamentIdIndex]);
  const roundStatusVariants = tournamentRows.columns[roundStatusIndex].variants;
  assert(
    cellNumber(tournamentRows.rows[0][currentRoundIndex]) === 1,
    'the tournament opens on round 1',
  );
  assert(
    cellTag(tournamentRows.rows[0][roundStatusIndex], roundStatusVariants) ===
      'in_progress',
    'round 1 starts in_progress',
  );

  async function roundTableIds(round: number): Promise<string[]> {
    const rows = await rowsOf(
      `SELECT id FROM GameTable WHERE tournamentId = '${tournamentId}' AND round = ${round}`,
    );
    const idCol = column(rows.columns, 'id');
    return rows.rows.map((row) => cellString(row[idCol]));
  }

  const round1TableIds = await roundTableIds(1);
  assert(
    round1TableIds.length === TABLES_PER_ROUND,
    `round 1 created ${TABLES_PER_ROUND} tables, got ${round1TableIds.length}`,
  );

  const tablePlayers = [
    [clientIds[0], clientIds[1]],
    [clientIds[2], clientIds[3]],
  ];

  for (const [tableIndex, tableId] of round1TableIds.entries()) {
    for (const clientId of tablePlayers[tableIndex]) {
      const memberId = memberIdByClient.get(clientId);
      if (!memberId) {
        throw new Error(`no member id for ${clientId}`);
      }
      await call(
        'join_table',
        JSON.stringify(tableId),
        JSON.stringify(memberId),
      );
    }
  }

  async function seatMap(tableId: string): Promise<Map<number, string>> {
    const seatRows = await rowsOf(
      `SELECT seatIndex, lobbyMemberId FROM GameSeat WHERE tableId = '${tableId}'`,
    );
    const seatIndexCol = column(seatRows.columns, 'seatIndex');
    const seatMemberCol = column(seatRows.columns, 'lobbyMemberId');
    const clientByMember = new Map<string, string>();
    for (const [clientId, memberId] of memberIdByClient) {
      clientByMember.set(memberId, clientId);
    }
    const map = new Map<number, string>();
    for (const row of seatRows.rows) {
      const seatIndex = cellNumber(row[seatIndexCol]);
      const memberId = cellString(row[seatMemberCol]);
      const clientId = clientByMember.get(memberId);
      if (clientId) {
        map.set(seatIndex, clientId);
      }
    }
    return map;
  }

  async function tableState(
    tableId: string,
  ): Promise<{ stateJson: string; statusTag: string }> {
    const rows = await rowsOf(
      `SELECT stateJson, status FROM GameTable WHERE id = '${tableId}'`,
    );
    const stateCol = column(rows.columns, 'stateJson');
    const statusCol = column(rows.columns, 'status');
    const row = rows.rows[0];
    if (!row) {
      throw new Error(`table ${tableId} not found`);
    }
    return {
      stateJson: cellString(row[stateCol]),
      statusTag: cellTag(row[statusCol], rows.columns[statusCol].variants),
    };
  }

  interface BluffPlayState {
    phase: string;
    hands: Record<string, string[]>;
    turnSeatIndex: number | null;
  }

  async function playBluffToFinish(tableId: string): Promise<string> {
    const seats = await seatMap(tableId);
    let intents = 0;
    for (let safety = 0; safety < 60; safety += 1) {
      const { stateJson, statusTag } = await tableState(tableId);
      const state = JSON.parse(stateJson) as BluffPlayState;
      if (state.phase === 'finished' || statusTag === 'finished') {
        return `finished after ${intents} intents`;
      }
      assert(
        state.phase === 'play',
        `table ${tableId} is in play, got ${state.phase}`,
      );
      const turnSeatIndex = state.turnSeatIndex;
      if (turnSeatIndex === null) {
        throw new Error(`table ${tableId} has no turn seat while in play`);
      }
      const clientId = seats.get(turnSeatIndex);
      if (!clientId) {
        throw new Error(
          `no client mapped to seat ${turnSeatIndex} at ${tableId}`,
        );
      }
      const hand = state.hands[String(turnSeatIndex)] ?? [];
      assert(hand.length > 0, `seat ${turnSeatIndex} has cards to play`);
      const cards = hand.slice(0, Math.min(4, hand.length));
      await call(
        'handle_game_intent',
        JSON.stringify(tableId),
        JSON.stringify(clientId),
        JSON.stringify(JSON.stringify({ type: 'play', cards })),
      );
      intents += 1;
    }
    throw new Error(`table ${tableId} did not finish within the safety limit`);
  }

  const finishSummaries: string[] = [];
  for (const tableId of round1TableIds) {
    finishSummaries.push(await playBluffToFinish(tableId));
  }

  const finishedStates = await Promise.all(
    round1TableIds.map((tableId) => tableState(tableId)),
  );
  for (const [index, state] of finishedStates.entries()) {
    assert(
      state.statusTag === 'finished',
      `table ${round1TableIds[index]} status is finished, got ${state.statusTag}`,
    );
  }

  const afterRound1 = await rowsOf(
    `SELECT currentRound, roundStatus FROM Tournament WHERE id = '${tournamentId}'`,
  );
  const afterRound1CurrentRoundIndex = column(
    afterRound1.columns,
    'currentRound',
  );
  const afterRound1RoundStatusIndex = column(
    afterRound1.columns,
    'roundStatus',
  );
  const afterRound1Row = afterRound1.rows[0];
  assert(
    cellNumber(afterRound1Row[afterRound1CurrentRoundIndex]) === 1,
    'the tournament is still on round 1 before the next round is created',
  );
  assert(
    cellTag(
      afterRound1Row[afterRound1RoundStatusIndex],
      afterRound1.columns[afterRound1RoundStatusIndex].variants,
    ) === 'complete',
    'round 1 shows complete once both of its tables finished',
  );

  await call(
    'create_tournament_round',
    JSON.stringify(tournamentId),
    String(TABLES_PER_ROUND),
    'null',
  );

  const round2TableIds = await roundTableIds(2);
  assert(
    round2TableIds.length === TABLES_PER_ROUND,
    `round 2 created ${TABLES_PER_ROUND} tables, got ${round2TableIds.length}`,
  );

  const afterRound2 = await rowsOf(
    `SELECT currentRound, roundStatus FROM Tournament WHERE id = '${tournamentId}'`,
  );
  const afterRound2CurrentRoundIndex = column(
    afterRound2.columns,
    'currentRound',
  );
  const afterRound2RoundStatusIndex = column(
    afterRound2.columns,
    'roundStatus',
  );
  const afterRound2Row = afterRound2.rows[0];
  assert(
    cellNumber(afterRound2Row[afterRound2CurrentRoundIndex]) === 2,
    'the tournament advances to round 2',
  );
  assert(
    cellTag(
      afterRound2Row[afterRound2RoundStatusIndex],
      afterRound2.columns[afterRound2RoundStatusIndex].variants,
    ) === 'in_progress',
    'round 2 starts in_progress',
  );

  let rejectedSecondRound2 = '';
  try {
    await call(
      'create_tournament_round',
      JSON.stringify(tournamentId),
      String(TABLES_PER_ROUND),
      'null',
    );
    rejectedSecondRound2 = 'did not reject';
  } catch (error: unknown) {
    rejectedSecondRound2 =
      error instanceof Error ? error.message : String(error);
  }
  assert(
    rejectedSecondRound2.includes('Round is not complete'),
    `creating round 3 before round 2 finishes should be rejected, got: ${rejectedSecondRound2}`,
  );

  const evidence = {
    ok: true,
    lobbyId,
    lobbyCode,
    tournamentId,
    round1TableIds,
    round1FinishSummaries: finishSummaries,
    round1Status: cellTag(
      afterRound1Row[afterRound1RoundStatusIndex],
      afterRound1.columns[afterRound1RoundStatusIndex].variants,
    ),
    round2TableIds,
    round2CurrentRound: cellNumber(
      afterRound2Row[afterRound2CurrentRoundIndex],
    ),
    round2Status: cellTag(
      afterRound2Row[afterRound2RoundStatusIndex],
      afterRound2.columns[afterRound2RoundStatusIndex].variants,
    ),
    round3RejectedBecauseRound2Incomplete: rejectedSecondRound2,
  };
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
