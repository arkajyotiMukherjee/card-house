import { clientStatsQuery } from './client-stats';
import {
  beginOpen,
  decideLink,
  forgetSessionToken,
  readSessionToken,
  rememberSessionToken,
  RECONNECTING_LABEL,
  type ConnectionPhase,
  type LinkDecision,
  type LinkState,
} from './connection-session';
import { lobbyTableQueries } from './lobby';
import { LiveConnection, type SocketLike } from './live-connection';
import { DbConnection } from './module_bindings';

export type { ConnectionPhase } from './connection-session';
export { RECONNECTING_LABEL, linkStatusLine } from './connection-session';

/** Shown when Create or Join cannot call a reducer. */
export const SERVER_UNREACHABLE = 'Could not reach the server. Try again.';

/** How often to notice a socket that closed without an `onclose` event. */
const SOCKET_CHECK_MS = 15_000;

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
  if (phase === 'reconnecting') {
    return RECONNECTING_LABEL;
  }
  return SERVER_UNREACHABLE;
}

export interface CardroomHandlers {
  onPhase: (phase: ConnectionPhase) => void;
  onSubscribed: (connection: DbConnection) => void;
  /** Fires when this clientId's ClientStats subscription has applied. */
  onClientStats?: () => void;
  /**
   * Fires after a later socket replaces a dead one and the base queries are
   * already recorded. Scenes stay mounted; they do not reload.
   */
  onReconnected?: () => void;
}

interface LobbyQuery {
  myCasinoProfile: unknown;
  lobby: unknown;
  lobbyMember: unknown;
  myCasinoTables: unknown;
  voicePresence: unknown;
  speakingState: unknown;
}

/**
 * Opens the cardroom socket and replaces it when it dies.
 *
 * A close, a rejected identity token, a tab that was hidden for a long gap,
 * or a reducer call that never settles used to leave the scenes holding a
 * dead `DbConnection`. Clicks queued on that socket and never ran. The
 * replacement socket gets the same subscriptions and row listeners. `clientId`
 * and `theme` are not touched. The identity token, when one is kept, lives
 * under `stdbToken`.
 */
export function connectCardroom(
  handlers: CardroomHandlers,
  clientId: string,
): void {
  const host = sdkHost(__SPACETIMEDB_HOST__);
  const database = __SPACETIMEDB_DB__;
  const storage = localStorage;
  let state: LinkState = {
    phase: 'connecting',
    everConnected: false,
    attempt: 0,
    retryPending: false,
    opening: false,
    token: readSessionToken(storage),
  };
  let generation = 0;
  let current: DbConnection | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let announced = false;
  let initialSent = false;
  let hiddenAt: number | undefined;

  const report = (phase: ConnectionPhase): void => {
    state = { ...state, phase };
    handlers.onPhase(phase);
  };

  const live = new LiveConnection(() => {
    apply(decideLink(state, { kind: 'stale' }));
  });

  const clearRetry = (): void => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const apply = (decision: LinkDecision): void => {
    if (decision.dropToken) {
      forgetSessionToken(storage);
    }
    state = {
      phase: decision.phase,
      everConnected: decision.everConnected,
      attempt: decision.attempt,
      retryPending: decision.retryPending,
      opening: decision.opening,
      token: decision.dropToken ? undefined : decision.token,
    };
    report(state.phase);
    if (decision.openNow) {
      clearRetry();
      open();
      return;
    }
    if (decision.delayMs === undefined) {
      return;
    }
    clearRetry();
    state = { ...state, retryPending: true };
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      state = { ...state, retryPending: false };
      open();
    }, decision.delayMs);
  };

  const subscribeInitial = (): void => {
    live
      .subscriptionBuilder()
      .onApplied(() => {
        handlers.onClientStats?.();
      })
      .subscribe([clientStatsQuery(clientId)]);
    live
      .subscriptionBuilder()
      .onApplied(() => {
        if (announced) {
          return;
        }
        announced = true;
        handlers.onSubscribed(live as unknown as DbConnection);
      })
      .onError(() => {
        if (!announced) {
          report('error');
        }
      })
      .subscribe((query: LobbyQuery) => [
        query.lobby,
        query.myCasinoProfile,
        query.lobbyMember,
        query.myCasinoTables,
        query.voicePresence,
        query.speakingState,
      ]);
  };

  const open = (): void => {
    state = beginOpen(state);
    report(state.phase);
    generation += 1;
    const gen = generation;
    const previous = current;
    current = undefined;
    live.detach();
    previous?.disconnect();
    const token = state.token;
    try {
      const builder = DbConnection.builder()
        .withUri(host)
        .withDatabaseName(database);
      if (token) {
        builder.withToken(token);
      }
      current = builder
        .onConnect((connection, _identity, issued) => {
          if (gen !== generation) {
            return;
          }
          const next = issued.trim();
          if (next.length > 0) {
            state = { ...state, token: next };
            rememberSessionToken(storage, next);
          }
          current = connection;
          apply(decideLink(state, { kind: 'opened' }));
          live.attach(connection as unknown as SocketLike);
          if (!initialSent) {
            initialSent = true;
            subscribeInitial();
            return;
          }
          if (announced) {
            handlers.onReconnected?.();
          }
        })
        .onConnectError((_ctx, error) => {
          if (gen !== generation) {
            return;
          }
          current = undefined;
          live.detach();
          apply(
            decideLink(state, {
              kind: 'connect-failed',
              message: error.message,
            }),
          );
        })
        .onDisconnect((ctx) => {
          const socket = current;
          if (gen !== generation || socket === undefined || ctx !== socket) {
            return;
          }
          if (socket.isDisconnectRequested) {
            return;
          }
          current = undefined;
          live.detach();
          apply(decideLink(state, { kind: 'dropped' }));
        })
        .build();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'connect failed';
      apply(
        decideLink(
          { ...state, opening: false },
          { kind: 'connect-failed', message },
        ),
      );
    }
  };

  const resume = (): void => {
    const hiddenMs = hiddenAt === undefined ? 0 : Date.now() - hiddenAt;
    if (
      typeof document === 'undefined' ||
      document.visibilityState === 'visible'
    ) {
      hiddenAt = undefined;
    }
    apply(
      decideLink(state, {
        kind: 'resume',
        hiddenMs,
        socketClosed: current?.isSocketClosed === true,
      }),
    );
  };

  if (
    typeof document !== 'undefined' &&
    typeof document.addEventListener === 'function'
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenAt === undefined) {
          hiddenAt = Date.now();
        }
        return;
      }
      resume();
    });
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
  }
  setInterval(() => {
    if (current?.isSocketClosed !== true) {
      return;
    }
    apply(decideLink(state, { kind: 'stale' }));
  }, SOCKET_CHECK_MS);

  open();
}

export function subscribeLobbyTables(
  connection: DbConnection,
  lobbyId: string,
  track?: (handle: { isEnded(): boolean; unsubscribe(): void }) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = connection
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
      .subscribe([
        ...lobbyTableQueries(lobbyId).filter(
          (query) => !query.startsWith('SELECT * FROM "GameTable"'),
        ),
        ...['CasinoPresence', 'CasinoTableSpot', 'CasinoDiscordMember'].map(
          (table) =>
            `SELECT * FROM "${table}" WHERE "lobbyId" = '${lobbyId.replaceAll("'", "''")}'`,
        ),
        `SELECT * FROM "CasinoRoomTier" WHERE "lobbyId" = '${lobbyId.replaceAll("'", "''")}'`,
        `SELECT * FROM "VoicePresence" WHERE "lobbyId" = '${lobbyId.replaceAll("'", "''")}'`,
        `SELECT * FROM "SpeakingState" WHERE "lobbyId" = '${lobbyId.replaceAll("'", "''")}'`,
        'SELECT * FROM my_casino_room_chat',
      ]);
    track?.(handle);
  });
}
