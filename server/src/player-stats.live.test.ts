import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BLACKJACK_BET_AMOUNTS,
  blackjackRules,
  readBlackjackState,
  type BlackjackIntent,
  type BlackjackState,
} from '../../src/shared/games/blackjack.ts';
import type { GameSeat } from '../../src/shared/games/game-rules.ts';

const exec = promisify(execFile);

if (process.env.CARDROOM_LIVE !== '1') {
  console.log(JSON.stringify({ ok: true, skipped: true }));
  process.exit(0);
}

const server = process.env.SPACETIMEDB_SERVER ?? 'local';
const database = process.env.SPACETIMEDB_DB ?? 'cardroom';

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
    schema?: { elements?: { name?: { some?: string } }[] };
    rows?: unknown[][];
  };
  const columns = (payload.schema?.elements ?? []).map((element) => ({
    name: element.name?.some ?? '',
  }));
  return { columns, rows: payload.rows ?? [] };
}

function cellString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

interface LobbyRef {
  id: string;
  code: string;
}

async function lobbyRows(): Promise<LobbyRef[]> {
  const parsed = parseSql(await sql('SELECT id, code FROM Lobby'));
  const idIndex = parsed.columns.findIndex((column) => column.name === 'id');
  const codeIndex = parsed.columns.findIndex(
    (column) => column.name === 'code',
  );
  return parsed.rows.map((row) => ({
    id: cellString(row[idIndex]),
    code: cellString(row[codeIndex]),
  }));
}

interface TableRef {
  id: string;
  stateJson: string;
}

async function tablesInLobby(lobbyId: string): Promise<TableRef[]> {
  const parsed = parseSql(
    await sql(
      `SELECT id, stateJson FROM GameTable WHERE lobbyId = '${lobbyId.replaceAll("'", "''")}'`,
    ),
  );
  const idIndex = parsed.columns.findIndex((column) => column.name === 'id');
  const stateIndex = parsed.columns.findIndex(
    (column) => column.name === 'stateJson',
  );
  return parsed.rows.map((row) => ({
    id: cellString(row[idIndex]),
    stateJson: cellString(row[stateIndex]),
  }));
}

interface StoredStats {
  handsPlayed: number;
  gamesWon: number;
  present: boolean;
}

async function statsFor(clientId: string): Promise<StoredStats> {
  const parsed = parseSql(
    await sql(
      `SELECT clientId, handsPlayed, gamesWon FROM ClientStats WHERE clientId = '${clientId.replaceAll("'", "''")}'`,
    ),
  );
  const handsIndex = parsed.columns.findIndex(
    (column) => column.name === 'handsPlayed',
  );
  const winsIndex = parsed.columns.findIndex(
    (column) => column.name === 'gamesWon',
  );
  const row = parsed.rows[0];
  if (!row) {
    return { handsPlayed: 0, gamesWon: 0, present: false };
  }
  return {
    handsPlayed: cellNumber(row[handsIndex]),
    gamesWon: cellNumber(row[winsIndex]),
    present: true,
  };
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function winningLine(
  state: BlackjackState,
  seatIndex: number,
): BlackjackIntent[] | null {
  const seat: GameSeat = {
    id: 'seat',
    tableId: 'table',
    lobbyMemberId: 'member',
    seatIndex,
    chips: null,
    joinedAt: 0,
    seatState: 'active',
  };
  const seen = new Set<string>();
  const intents: BlackjackIntent[] = [
    ...BLACKJACK_BET_AMOUNTS.map(
      (amount) => ({ type: 'bet', amount }) as const,
    ),
    { type: 'stand' },
    { type: 'hit' },
    { type: 'double' },
    { type: 'split' },
  ];

  function walk(
    current: BlackjackState,
    path: BlackjackIntent[],
    depth: number,
  ): BlackjackIntent[] | null {
    if (current.phase === 'finished') {
      return current.winnerSeatIndexes.includes(seatIndex) ? path : null;
    }
    if (depth > 16 || current.turnSeatIndex !== seatIndex) {
      return null;
    }
    const key = JSON.stringify(current);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    for (const intent of intents) {
      let next: BlackjackState;
      try {
        next = readBlackjackState(
          blackjackRules.applyIntent(current, intent, { seat, now: 0 }),
        );
      } catch {
        continue;
      }
      const found = walk(next, path.concat(intent), depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return walk(state, [], 0);
}

async function main(): Promise<void> {
  const winnerId =
    process.env.CARDROOM_STATS_CLIENT?.trim() || crypto.randomUUID();
  const otherId = crypto.randomUUID();
  assert(winnerId !== otherId, 'the two client ids must differ');

  const before = await statsFor(winnerId);
  const otherBefore = await statsFor(otherId);
  const knownLobbies = new Set((await lobbyRows()).map((row) => row.code));
  await call('create_lobby');
  const lobby = (await lobbyRows()).find(
    (row) => !knownLobbies.has(row.code) && row.code.length > 0,
  );
  if (!lobby) {
    throw new Error('create_lobby did not add a lobby');
  }
  await call(
    'join_lobby',
    quoted(lobby.code),
    quoted(winnerId),
    quoted('Stats'),
  );
  const memberId = `member_${lobby.id}_${winnerId}`;

  let played: BlackjackIntent[] | null = null;
  let tableId = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const knownTables = new Set(
      (await tablesInLobby(lobby.id)).map((row) => row.id),
    );
    await call(
      'create_game_table',
      quoted(lobby.id),
      quoted('blackjack'),
      'null',
    );
    const created = (await tablesInLobby(lobby.id)).find(
      (row) => !knownTables.has(row.id),
    );
    if (!created) {
      throw new Error('create_game_table did not add a blackjack table');
    }
    await call('join_table', quoted(created.id), quoted(memberId));
    const seated = (await tablesInLobby(lobby.id)).find(
      (row) => row.id === created.id,
    );
    if (!seated) {
      throw new Error('joined table disappeared');
    }
    const state = readBlackjackState(JSON.parse(seated.stateJson));
    const line = winningLine(state, 0);
    if (line) {
      played = line;
      tableId = created.id;
      for (const intent of line) {
        await call(
          'handle_game_intent',
          quoted(created.id),
          quoted(winnerId),
          quoted(JSON.stringify(intent)),
        );
      }
      break;
    }
    await call('leave_table', quoted(created.id), quoted(memberId));
  }
  if (!played || tableId.length === 0) {
    throw new Error('no blackjack deal in 12 tables could be won');
  }

  const after = await statsFor(winnerId);
  const reloaded = await statsFor(winnerId);
  const other = await statsFor(otherId);

  assert(
    after.present &&
      after.handsPlayed === before.handsPlayed + 1 &&
      after.gamesWon === before.gamesWon + 1,
    `winner stats should rise by one: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`,
  );
  assert(
    reloaded.handsPlayed === after.handsPlayed &&
      reloaded.gamesWon === after.gamesWon &&
      reloaded.present,
    `reloaded stats should still be there: ${JSON.stringify(reloaded)}`,
  );
  assert(
    other.handsPlayed === otherBefore.handsPlayed &&
      other.gamesWon === otherBefore.gamesWon &&
      other.handsPlayed === 0 &&
      other.gamesWon === 0,
    `a different clientId inherited counts: ${JSON.stringify(other)}`,
  );

  console.log(
    JSON.stringify({
      ok: true,
      winnerId,
      otherId,
      tableId,
      intents: played,
      before,
      after,
      reloaded,
      other,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
