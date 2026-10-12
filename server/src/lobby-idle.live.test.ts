import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

if (process.env.CARDROOM_LIVE !== '1') {
  console.log(JSON.stringify({ ok: true, skipped: true }));
  process.exit(0);
}

const server = process.env.SPACETIMEDB_SERVER ?? 'local';
const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
const devTimeoutMs = 2_000;
const productionTimeoutMs = 24 * 60 * 60 * 1000;

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
  variants: string[];
}

interface LobbyRow {
  code: string;
  status: string;
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

async function lobbyRows(): Promise<LobbyRow[]> {
  const parsed = parseSql(await sql('SELECT code, status FROM Lobby'));
  const codeIndex = parsed.columns.findIndex(
    (column) => column.name === 'code',
  );
  const statusIndex = parsed.columns.findIndex(
    (column) => column.name === 'status',
  );
  return parsed.rows.map((row) => ({
    code: typeof row[codeIndex] === 'string' ? row[codeIndex] : '',
    status: cellTag(
      row[statusIndex],
      parsed.columns[statusIndex]?.variants ?? [],
    ),
  }));
}

async function waitForClosed(code: string): Promise<LobbyRow> {
  const deadline = Date.now() + 12_000;
  let latest = '';
  while (Date.now() < deadline) {
    const rows = await lobbyRows();
    const row = rows.find((item) => item.code === code);
    latest = JSON.stringify(row ?? null);
    if (row && row.status === 'closed') {
      return row;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  throw new Error(`lobby ${code} stayed open: ${latest}`);
}

async function main(): Promise<void> {
  const before = new Set((await lobbyRows()).map((row) => row.code));
  await call('set_lobby_idle_timeout', String(devTimeoutMs), 'true');
  await call('create_lobby');
  const created = (await lobbyRows()).find(
    (row) => !before.has(row.code) && row.code.length > 0,
  );
  if (!created) {
    throw new Error('create_lobby did not add a lobby');
  }
  const code = created.code;
  assert(
    created.status === 'open',
    `new lobby ${code} should still be open before the timeout`,
  );

  const closed = await waitForClosed(code);
  let joinError = '';
  try {
    await call(
      'join_lobby',
      JSON.stringify(code),
      JSON.stringify('idle-check'),
      JSON.stringify('Ada'),
    );
    joinError = '';
  } catch (error: unknown) {
    joinError = error instanceof Error ? error.message : String(error);
  }
  assert(joinError.includes('Room closed'), `join should fail: ${joinError}`);

  const evidence = {
    ok: true,
    devTimeoutMs,
    code,
    closedStatus: closed.status,
    joinRejected: true,
    joinError,
  };
  console.log(JSON.stringify(evidence));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.CARDROOM_LIVE !== '1') {
      return;
    }
    try {
      await call(
        'set_lobby_idle_timeout',
        String(productionTimeoutMs),
        'false',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to restore production timeout: ${message}`);
      process.exitCode = 1;
    }
  });
