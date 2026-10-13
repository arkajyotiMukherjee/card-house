import {
  advanceRate,
  disconnectActivity,
  disconnectLine,
  forgetTable,
  lobbyCreatedLine,
  RATE_WINDOW_MICROS,
  reconnectActivity,
  rememberLobby,
  rememberTable,
  rulesErrorLine,
  rulesReason,
  tableCreatedLine,
  tournamentCreatedLine,
  type ActivityDb,
  type ConnectionRateRow,
  type OperatorSessionRow,
} from './activity-log.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function memoryDb(): ActivityDb {
  const sessions = new Map<string, OperatorSessionRow>();
  const rates = new Map<string, ConnectionRateRow>();
  return {
    OperatorSession: {
      identity: {
        find(identity: string): OperatorSessionRow | null {
          return sessions.get(identity) ?? null;
        },
        update(row: OperatorSessionRow): unknown {
          sessions.set(row.identity, row);
          return row;
        },
      },
      insert(row: OperatorSessionRow): unknown {
        sessions.set(row.identity, row);
        return row;
      },
      iter(): Iterable<OperatorSessionRow> {
        return sessions.values();
      },
    },
    ConnectionRate: {
      id: {
        find(id: string): ConnectionRateRow | null {
          return rates.get(id) ?? null;
        },
        update(row: ConnectionRateRow): unknown {
          rates.set(row.id, row);
          return row;
        },
      },
      insert(row: ConnectionRateRow): unknown {
        rates.set(row.id, row);
        return row;
      },
    },
  };
}

const lobbyId = 'lobby_abc';
const tableId = 'table_abc';
const identity = 'secret-identity-token';

assert(
  lobbyCreatedLine(lobbyId) === `lobby created lobbyId=${lobbyId}`,
  'lobby creation names the lobby',
);
assert(
  tableCreatedLine(tableId, lobbyId) ===
    `table created tableId=${tableId} lobbyId=${lobbyId}`,
  'table creation names the table',
);
assert(
  tournamentCreatedLine('tournament_abc', lobbyId) ===
    `tournament created tournamentId=tournament_abc lobbyId=${lobbyId}`,
  'tournament creation names the tournament',
);
assert(
  rulesErrorLine(tableId, lobbyId, 'Invalid intent') ===
    `rules error tableId=${tableId} lobbyId=${lobbyId} reason=Invalid intent`,
  'a rules error names the table',
);
assert(
  rulesReason('Include the 3 of clubs') === 'rules rejected the intent',
  'a named card stays out of the log',
);
assert(
  rulesReason('played AS') === 'rules rejected the intent',
  'a card code stays out of the log',
);
assert(
  rulesReason('bearer token abc') === 'rules rejected the intent',
  'a token stays out of the log',
);
assert(
  rulesReason('Not your turn') === 'Not your turn',
  'a plain reason stays',
);

const db = memoryDb();
rememberLobby(db, identity, lobbyId);
rememberTable(db, identity, lobbyId, tableId);

const firstDisconnect = disconnectActivity(db, identity, 1_000n);
assert(
  firstDisconnect === disconnectLine(lobbyId, tableId, 1),
  'the first disconnect is one per minute',
);
assert(
  firstDisconnect !== undefined && !firstDisconnect.includes(identity),
  'the disconnect line hides the identity',
);
assert(
  disconnectActivity(db, identity, 2_000n) === undefined,
  'a second disconnect in the same drop is not counted again',
);

const reconnect = reconnectActivity(db, identity, 3_000n);
assert(
  reconnect ===
    `reconnect lobbyId=${lobbyId} tableId=${tableId} reconnectsPerMinute=1`,
  'a reconnect names the lobby and table',
);
assert(
  reconnect !== undefined && !reconnect.includes(identity),
  'the reconnect line hides the identity',
);

const secondDisconnect = disconnectActivity(db, identity, 4_000n);
assert(
  secondDisconnect === disconnectLine(lobbyId, tableId, 2),
  'two disconnects in the window raise the rate',
);

const later = disconnectActivity(db, identity, 4_000n + RATE_WINDOW_MICROS);
assert(later === undefined, 'still disconnected, so the new window waits');
reconnectActivity(db, identity, 5_000n + RATE_WINDOW_MICROS);
const fresh = disconnectActivity(db, identity, 6_000n + RATE_WINDOW_MICROS);
assert(
  fresh === disconnectLine(lobbyId, tableId, 1),
  'a later window starts the rate over',
);

const left = memoryDb();
rememberLobby(left, identity, lobbyId);
rememberTable(left, identity, lobbyId, tableId);
forgetTable(left, identity, tableId);
assert(
  disconnectActivity(left, identity, 10n) === disconnectLine(lobbyId, '', 1),
  'leaving the table keeps the lobby on the disconnect line',
);

const window = advanceRate(
  { windowStartMicros: 0n, count: 4 },
  RATE_WINDOW_MICROS,
);
assert(window.count === 1, 'the rate window closes after sixty seconds');

console.log(
  JSON.stringify({
    ok: true,
    lobby: lobbyCreatedLine(lobbyId),
    table: tableCreatedLine(tableId, lobbyId),
    rules: rulesErrorLine(tableId, lobbyId, 'Invalid intent'),
    disconnect: firstDisconnect,
  }),
);
