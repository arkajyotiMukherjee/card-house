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

export function connectCardroom(onStatus: (line: string) => void): void {
  const host = __SPACETIMEDB_HOST__;
  const database = __SPACETIMEDB_DB__;
  onStatus(connectionLine('connecting', host, database));
  DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect(() => {
      onStatus(connectionLine('connected', host, database));
    })
    .onConnectError((_ctx, error) => {
      onStatus(connectionLine('error', host, database, error.message));
    })
    .onDisconnect((_ctx, error) => {
      if (error) {
        onStatus(connectionLine('error', host, database, error.message));
        return;
      }
      onStatus(connectionLine('disconnected', host, database));
    })
    .build();
}
