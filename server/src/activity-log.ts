/** Operator log lines. They never include an identity, a token, or a hidden card. */

export const RATE_WINDOW_SEC = 60;
export const RATE_WINDOW_MICROS = 60_000_000n;

const FALLBACK_REASON = 'rules rejected the intent';
const CARD_CODE = /\b(?:10|[AKQJ2-9])[HDCS]\b/;
const OF_SUIT = /\bof\s+(hearts|diamonds|clubs|spades)\b/i;
const SECRET = /token|secret|password|authorization|bearer/i;
const PLAIN_REASON = /^[A-Za-z0-9 .,']+$/;

export interface RateWindow {
  windowStartMicros: bigint;
  count: number;
}

export interface OperatorSessionRow {
  identity: string;
  lobbyId: string;
  tableId: string;
  connected: boolean;
  /** Browser `clientId` for the member this connection joined as. Empty until a join. */
  clientId: string;
}

export interface ConnectionRateRow {
  id: string;
  windowStartMicros: bigint;
  count: number;
}

export interface ActivityDb {
  OperatorSession: {
    identity: {
      find(identity: string): OperatorSessionRow | null;
      update(row: OperatorSessionRow): unknown;
    };
    insert(row: OperatorSessionRow): unknown;
    iter(): Iterable<OperatorSessionRow>;
  };
  ConnectionRate: {
    id: {
      find(id: string): ConnectionRateRow | null;
      update(row: ConnectionRateRow): unknown;
    };
    insert(row: ConnectionRateRow): unknown;
  };
}

export function lobbyCreatedLine(lobbyId: string): string {
  return `lobby created lobbyId=${lobbyId}`;
}

export function tableCreatedLine(tableId: string, lobbyId: string): string {
  return `table created tableId=${tableId} lobbyId=${lobbyId}`;
}

export function rulesReason(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (
    trimmed.length === 0 ||
    trimmed.length > 80 ||
    /[{}[\]"]/.test(trimmed) ||
    CARD_CODE.test(trimmed) ||
    OF_SUIT.test(trimmed) ||
    SECRET.test(trimmed) ||
    !PLAIN_REASON.test(trimmed)
  ) {
    return FALLBACK_REASON;
  }
  return trimmed;
}

export function rulesErrorLine(
  tableId: string,
  lobbyId: string,
  message: string,
): string {
  return `rules error tableId=${tableId} lobbyId=${lobbyId} reason=${rulesReason(message)}`;
}

export function disconnectLine(
  lobbyId: string,
  tableId: string,
  disconnectsPerMinute: number,
): string {
  const table = tableId.length > 0 ? ` tableId=${tableId}` : '';
  return `disconnect lobbyId=${lobbyId}${table} disconnectsPerMinute=${disconnectsPerMinute}`;
}

export function reconnectLine(
  lobbyId: string,
  tableId: string,
  reconnectsPerMinute: number,
): string {
  const table = tableId.length > 0 ? ` tableId=${tableId}` : '';
  return `reconnect lobbyId=${lobbyId}${table} reconnectsPerMinute=${reconnectsPerMinute}`;
}

export function advanceRate(
  previous: RateWindow | undefined,
  nowMicros: bigint,
): RateWindow {
  if (
    previous === undefined ||
    nowMicros < previous.windowStartMicros ||
    nowMicros - previous.windowStartMicros >= RATE_WINDOW_MICROS
  ) {
    return { windowStartMicros: nowMicros, count: 1 };
  }
  return {
    windowStartMicros: previous.windowStartMicros,
    count: previous.count + 1,
  };
}

export function rememberLobby(
  db: ActivityDb,
  identity: string,
  lobbyId: string,
  clientId = '',
): void {
  const session = db.OperatorSession.identity.find(identity);
  const storedClient =
    clientId.length > 0 ? clientId : (session?.clientId ?? '');
  if (session == null) {
    db.OperatorSession.insert({
      identity,
      lobbyId,
      tableId: '',
      connected: true,
      clientId: storedClient,
    });
    return;
  }
  db.OperatorSession.identity.update({
    identity,
    lobbyId,
    tableId: session.lobbyId === lobbyId ? session.tableId : '',
    connected: true,
    clientId: storedClient,
  });
}

export function rememberTable(
  db: ActivityDb,
  identity: string,
  lobbyId: string,
  tableId: string,
): void {
  const session = db.OperatorSession.identity.find(identity);
  if (session == null) {
    db.OperatorSession.insert({
      identity,
      lobbyId,
      tableId,
      connected: true,
      clientId: '',
    });
    return;
  }
  db.OperatorSession.identity.update({
    identity,
    lobbyId,
    tableId,
    connected: true,
    clientId: session.clientId,
  });
}

export function forgetTable(
  db: ActivityDb,
  identity: string,
  tableId: string,
): void {
  const session = db.OperatorSession.identity.find(identity);
  if (session == null || session.tableId !== tableId) {
    return;
  }
  db.OperatorSession.identity.update({ ...session, tableId: '' });
}

/** Drops the lobby from this connection after Leave Room. The member row is removed separately. */
export function forgetLobby(db: ActivityDb, identity: string): void {
  const session = db.OperatorSession.identity.find(identity);
  if (session == null) {
    return;
  }
  db.OperatorSession.identity.update({
    ...session,
    lobbyId: '',
    tableId: '',
    clientId: '',
    connected: false,
  });
}

export function forgetTableForEveryone(db: ActivityDb, tableId: string): void {
  const matching: OperatorSessionRow[] = [];
  for (const session of db.OperatorSession.iter()) {
    if (session.tableId === tableId) {
      matching.push(session);
    }
  }
  for (const session of matching) {
    db.OperatorSession.identity.update({ ...session, tableId: '' });
  }
}

export function disconnectActivity(
  db: ActivityDb,
  identity: string,
  nowMicros: bigint,
): string | undefined {
  const session = db.OperatorSession.identity.find(identity);
  if (session == null || !session.connected || session.lobbyId.length === 0) {
    return undefined;
  }
  const rate = recordRate(db, 'disconnect', session.lobbyId, nowMicros);
  db.OperatorSession.identity.update({ ...session, connected: false });
  return disconnectLine(session.lobbyId, session.tableId, rate.count);
}

export function reconnectActivity(
  db: ActivityDb,
  identity: string,
  nowMicros: bigint,
): string | undefined {
  const session = db.OperatorSession.identity.find(identity);
  if (session == null || session.connected || session.lobbyId.length === 0) {
    return undefined;
  }
  const rate = recordRate(db, 'reconnect', session.lobbyId, nowMicros);
  db.OperatorSession.identity.update({ ...session, connected: true });
  return reconnectLine(session.lobbyId, session.tableId, rate.count);
}

function recordRate(
  db: ActivityDb,
  kind: 'disconnect' | 'reconnect',
  lobbyId: string,
  nowMicros: bigint,
): RateWindow {
  const id = `${kind}:${lobbyId}`;
  const existing = db.ConnectionRate.id.find(id);
  const next = advanceRate(
    existing == null
      ? undefined
      : {
          windowStartMicros: existing.windowStartMicros,
          count: existing.count,
        },
    nowMicros,
  );
  const row = {
    id,
    windowStartMicros: next.windowStartMicros,
    count: next.count,
  };
  if (existing == null) {
    db.ConnectionRate.insert(row);
  } else {
    db.ConnectionRate.id.update(row);
  }
  return next;
}
