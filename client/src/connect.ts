import { DbConnection } from './module_bindings';

export function connectionLine(
  state: 'connecting' | 'connected' | 'disconnected' | 'error',
  host: string,
  database: string,
  detail?: string,
): string {
  const target = `${host} / ${database}`;
  if (state === 'error') {
    return `SpacetimeDB: error ${detail ?? 'unknown'} (${target})`;
  }
  return `SpacetimeDB: ${state} ${target}`;
}

export interface CardroomHandlers {
  onStatus: (line: string) => void;
  onSubscribed: (connection: DbConnection) => void;
}

export function connectCardroom(handlers: CardroomHandlers): void {
  const host = __SPACETIMEDB_HOST__;
  const database = __SPACETIMEDB_DB__;
  handlers.onStatus(connectionLine('connecting', host, database));
  DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect((connection) => {
      handlers.onStatus(connectionLine('connected', host, database));
      connection
        .subscriptionBuilder()
        .onApplied(() => {
          handlers.onSubscribed(connection);
        })
        .onError((ctx) => {
          const detail =
            ctx.event instanceof Error
              ? ctx.event.message
              : 'subscription failed';
          handlers.onStatus(connectionLine('error', host, database, detail));
        })
        .subscribe((query) => [
          query.lobby,
          query.lobbyMember,
          query.gameTable,
        ]);
    })
    .onConnectError((_ctx, error) => {
      handlers.onStatus(connectionLine('error', host, database, error.message));
    })
    .onDisconnect((_ctx, error) => {
      if (error) {
        handlers.onStatus(
          connectionLine('error', host, database, error.message),
        );
        return;
      }
      handlers.onStatus(connectionLine('disconnected', host, database));
    })
    .build();
}
