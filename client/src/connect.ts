import { clientStatsQuery } from './client-stats';
import { lobbyTableQueries } from './lobby';
import { DbConnection } from './module_bindings';

export type ConnectionPhase =
  'connecting' | 'connected' | 'disconnected' | 'error';

/** Shown when Create or Join cannot call a reducer. */
export const SERVER_UNREACHABLE = 'Could not reach the server. Try again.';

/**
 * The SpacetimeDB SDK opens the websocket itself. It wants an `http` or
 * `https` URI. A `ws` or `wss` URI can fail the handshake. Local
 * `ws://127.0.0.1:3000` becomes `http://127.0.0.1:3000`. Maincloud `wss://`
 * becomes `https://`.
 */
export function sdkHost(host: string): string {
  const match = /^(wss?):\/\//i.exec(host);
  if (!match) {
    return host;
  }
  const scheme = match[1]?.toLowerCase() === 'wss' ? 'https' : 'http';
  return `${scheme}://${host.slice(match[0].length)}`;
}

/** Why Create or Join should stop, or undefined once the socket is up. */
export function roomEntryError(phase: ConnectionPhase): string | undefined {
  if (phase === 'connected') {
    return undefined;
  }
  if (phase === 'connecting') {
    return 'Still connecting to the server';
  }
  return SERVER_UNREACHABLE;
}

export interface CardroomHandlers {
  onPhase: (phase: ConnectionPhase) => void;
  onSubscribed: (connection: DbConnection) => void;
  /** Fires when this clientId's ClientStats subscription has applied. */
  onClientStats?: () => void;
}

export function connectCardroom(
  handlers: CardroomHandlers,
  clientId: string,
): void {
  const host = sdkHost(__SPACETIMEDB_HOST__);
  const database = __SPACETIMEDB_DB__;
  const report = (phase: ConnectionPhase): void => {
    handlers.onPhase(phase);
  };
  report('connecting');
  try {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((connection) => {
        report('connected');
        connection
          .subscriptionBuilder()
          .onApplied(() => {
            handlers.onClientStats?.();
          })
          .subscribe([clientStatsQuery(clientId)]);
        connection
          .subscriptionBuilder()
          .onApplied(() => {
            handlers.onSubscribed(connection);
          })
          .onError(() => {
            report('error');
          })
          .subscribe((query) => [
            query.lobby,
            query.lobbyMember,
            query.gameTable,
            query.voicePresence,
            query.speakingState,
          ]);
      })
      .onConnectError(() => {
        report('error');
      })
      .onDisconnect((_ctx, error) => {
        report(error ? 'error' : 'disconnected');
      })
      .build();
  } catch {
    report('error');
  }
}

export function subscribeLobbyTables(
  connection: DbConnection,
  lobbyId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    connection
      .subscriptionBuilder()
      .onApplied(() => {
        resolve();
      })
      .onError((ctx) => {
        const detail =
          ctx.event instanceof Error
            ? ctx.event.message
            : 'subscription failed';
        reject(new Error(detail));
      })
      .subscribe(lobbyTableQueries(lobbyId));
  });
}
