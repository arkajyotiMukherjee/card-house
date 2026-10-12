import { DbConnection } from '../../client/src/module_bindings/index.ts';
import { joinUrl } from './join-url.ts';

export const CREATE_LOBBY_REDUCER = 'create_lobby';

const DISCORD_CHANNEL_ID = /^\d{17,20}$/;

export interface LobbySnapshot {
  id: string;
  code: string;
  discordChannelId: string;
}

export interface LobbyConnection {
  identity?: { toHexString(): string };
  reducers: {
    createLobby(args: Record<string, never>): Promise<void>;
    setLobbyDiscordChannel(args: {
      lobbyCode: string;
      discordChannelId: string;
    }): Promise<void>;
  };
  db: {
    lobby: {
      iter(): Iterable<LobbySnapshot>;
    };
  };
}

export interface CreatedLobby {
  code: string;
  joinUrl: string;
  discordChannelId: string;
  reducer: typeof CREATE_LOBBY_REDUCER;
}

export interface CreateLobbyHooks {
  onCreateLobby?: (args: Record<string, never>) => void;
  onSetChannel?: (args: {
    lobbyCode: string;
    discordChannelId: string;
  }) => void;
}

export function connectLobby(
  host: string,
  database: string,
): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('SpacetimeDB connection timed out'));
    }, 10_000);
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((connection) => {
        connection
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve(connection);
          })
          .onError((ctx) => {
            clearTimeout(timer);
            const detail =
              ctx.event instanceof Error
                ? ctx.event.message
                : 'subscription failed';
            reject(new Error(detail));
          })
          .subscribe((query) => [
            query.lobby,
            query.lobbyMember,
            query.gameTable,
            query.voicePresence,
          ]);
      })
      .onConnectError((_ctx, error) => {
        clearTimeout(timer);
        reject(error);
      })
      .build();
  });
}

export async function createDiscordLobby(
  connection: LobbyConnection,
  discordChannelId: string,
  publicBase: string,
  hooks?: CreateLobbyHooks,
): Promise<CreatedLobby> {
  const channelId = discordChannelId.trim();
  if (!DISCORD_CHANNEL_ID.test(channelId)) {
    throw new Error('Discord channel id is invalid');
  }
  const senderHex = connection.identity?.toHexString() ?? '';
  const knownIds = new Set(readLobbies(connection).map((lobby) => lobby.id));
  const createArgs = {} as Record<string, never>;
  hooks?.onCreateLobby?.(createArgs);
  await connection.reducers.createLobby(createArgs);
  const created = await waitForLobby(connection, knownIds, senderHex);
  const linkArgs = {
    lobbyCode: created.code,
    discordChannelId: channelId,
  };
  hooks?.onSetChannel?.(linkArgs);
  await connection.reducers.setLobbyDiscordChannel(linkArgs);
  const linked = await waitForChannel(connection, created.code, channelId);
  return {
    code: linked.code,
    joinUrl: joinUrl(publicBase, linked.code),
    discordChannelId: linked.discordChannelId,
    reducer: CREATE_LOBBY_REDUCER,
  };
}

function readLobbies(connection: LobbyConnection): LobbySnapshot[] {
  const rows: LobbySnapshot[] = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({
      id: lobby.id,
      code: lobby.code,
      discordChannelId: lobby.discordChannelId,
    });
  }
  return rows;
}

function findCreatedLobby(
  lobbies: Iterable<LobbySnapshot>,
  knownIds: ReadonlySet<string>,
  senderHex: string,
): LobbySnapshot | undefined {
  const fresh: LobbySnapshot[] = [];
  for (const lobby of lobbies) {
    if (!knownIds.has(lobby.id)) {
      fresh.push(lobby);
    }
  }
  const prefix = senderHex.length > 0 ? `lobby_${senderHex}_` : '';
  const owned =
    prefix.length > 0
      ? fresh.filter((lobby) => lobby.id.startsWith(prefix))
      : [];
  const pool = owned.length > 0 ? owned : fresh.length === 1 ? fresh : [];
  let match: LobbySnapshot | undefined;
  for (const lobby of pool) {
    if (!match || lobby.id > match.id) {
      match = lobby;
    }
  }
  return match;
}

async function waitForLobby(
  connection: LobbyConnection,
  knownIds: ReadonlySet<string>,
  senderHex: string,
): Promise<LobbySnapshot> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const created = findCreatedLobby(
      readLobbies(connection),
      knownIds,
      senderHex,
    );
    if (created) {
      return created;
    }
    await delay(50);
  }
  throw new Error('Could not read the new room');
}

async function waitForChannel(
  connection: LobbyConnection,
  code: string,
  channelId: string,
): Promise<LobbySnapshot> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const lobby of readLobbies(connection)) {
      if (lobby.code === code && lobby.discordChannelId === channelId) {
        return lobby;
      }
    }
    await delay(50);
  }
  throw new Error('Could not record the Discord channel');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
