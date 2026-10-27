/**
 * Pure reconnect decisions for the SpacetimeDB socket.
 *
 * The SDK opens one websocket and does not replace it. After a close, an
 * expired token, a frozen tab, or a long idle gap, reducer calls sit in that
 * socket's queue and never resolve. These helpers decide when to open again.
 * They do not read or write `clientId` or `theme`.
 */

export type ConnectionPhase =
  'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

/** Short line while a dead socket is being replaced. */
export const RECONNECTING_LABEL = 'Reconnecting...';

/** localStorage key for the SpacetimeDB identity token. Not `clientId` or `theme`. */
export const SESSION_TOKEN_KEY = 'stdbToken';

export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * A hidden tab longer than this is treated as a stale socket, even when the
 * browser still reports the websocket as open.
 */
export const IDLE_GAP_MS = 60_000;

/** A reducer call that does not settle is a dead socket. */
export const REDUCER_TIMEOUT_MS = 8_000;

export interface LinkState {
  phase: ConnectionPhase;
  everConnected: boolean;
  /** Backoff step. The delay uses the value from before it is incremented. */
  attempt: number;
  retryPending: boolean;
  opening: boolean;
  token?: string;
}

export type LinkEvent =
  | { kind: 'opened' }
  | { kind: 'dropped' }
  | { kind: 'connect-failed'; message: string }
  | { kind: 'resume'; hiddenMs: number; socketClosed: boolean }
  | { kind: 'stale' };

export interface LinkDecision {
  phase: ConnectionPhase;
  everConnected: boolean;
  attempt: number;
  retryPending: boolean;
  opening: boolean;
  token?: string;
  /** Open a socket on this turn, instead of waiting out the backoff. */
  openNow: boolean;
  /** Forget the identity token and connect anonymously. */
  dropToken: boolean;
  /** Arm a retry timer. Ignored when `openNow` is set. */
  delayMs?: number;
}

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function reconnectDelayMs(attempt: number): number {
  const step = attempt > 0 ? attempt : 0;
  const delay = RECONNECT_BASE_DELAY_MS * 2 ** step;
  if (!Number.isFinite(delay)) {
    return RECONNECT_MAX_DELAY_MS;
  }
  return Math.min(delay, RECONNECT_MAX_DELAY_MS);
}

export function linkStatusLine(phase: ConnectionPhase): string {
  if (phase === 'reconnecting') {
    return RECONNECTING_LABEL;
  }
  return '';
}

/** The server rejected the stored identity token. */
export function tokenFailure(message: string): boolean {
  return (
    /failed to verify token/i.test(message) ||
    /unauthorized/i.test(message) ||
    /\b401\b/.test(message)
  );
}

export function readSessionToken(storage: TokenStorage): string | undefined {
  const value = storage.getItem(SESSION_TOKEN_KEY)?.trim() ?? '';
  if (value.length === 0) {
    return undefined;
  }
  return value;
}

/** Writes only `stdbToken`. */
export function rememberSessionToken(
  storage: TokenStorage,
  token: string,
): void {
  const value = token.trim();
  if (value.length === 0) {
    return;
  }
  storage.setItem(SESSION_TOKEN_KEY, value);
}

/** Removes only `stdbToken`. */
export function forgetSessionToken(storage: TokenStorage): void {
  storage.removeItem(SESSION_TOKEN_KEY);
}

export function beginOpen(state: LinkState): LinkState {
  return {
    ...state,
    opening: true,
    retryPending: false,
    phase: state.everConnected ? 'reconnecting' : 'connecting',
  };
}

export function decideLink(state: LinkState, event: LinkEvent): LinkDecision {
  if (event.kind === 'opened') {
    return {
      phase: 'connected',
      everConnected: true,
      attempt: 0,
      retryPending: false,
      opening: false,
      token: state.token,
      openNow: false,
      dropToken: false,
    };
  }

  if (
    event.kind === 'connect-failed' &&
    tokenFailure(event.message) &&
    state.token
  ) {
    return {
      phase: state.everConnected ? 'reconnecting' : 'connecting',
      everConnected: state.everConnected,
      attempt: state.attempt,
      retryPending: false,
      opening: false,
      token: undefined,
      openNow: true,
      dropToken: true,
    };
  }

  if (state.opening && event.kind !== 'connect-failed') {
    return hold(state);
  }

  if (event.kind === 'resume') {
    return decideResume(state, event.hiddenMs, event.socketClosed);
  }

  if (event.kind === 'stale') {
    return decideStale(state);
  }

  return decideRetry(state);
}

function decideResume(
  state: LinkState,
  hiddenMs: number,
  socketClosed: boolean,
): LinkDecision {
  if (!state.everConnected) {
    return hold(state);
  }
  const idle = hiddenMs >= IDLE_GAP_MS;
  if (!state.retryPending && !socketClosed && !idle) {
    return hold(state);
  }
  return {
    phase: 'reconnecting',
    everConnected: true,
    attempt: 0,
    retryPending: false,
    opening: false,
    token: state.token,
    openNow: true,
    dropToken: false,
  };
}

function decideStale(state: LinkState): LinkDecision {
  if (!state.everConnected) {
    return hold(state);
  }
  return {
    phase: 'reconnecting',
    everConnected: true,
    attempt: 0,
    retryPending: false,
    opening: false,
    token: state.token,
    openNow: true,
    dropToken: false,
  };
}

function decideRetry(state: LinkState): LinkDecision {
  if (!state.everConnected) {
    return {
      phase: 'error',
      everConnected: false,
      attempt: state.attempt,
      retryPending: false,
      opening: false,
      token: state.token,
      openNow: false,
      dropToken: false,
    };
  }
  if (state.retryPending) {
    return {
      ...hold(state),
      phase: 'reconnecting',
      opening: false,
    };
  }
  return {
    phase: 'reconnecting',
    everConnected: true,
    attempt: state.attempt + 1,
    retryPending: false,
    opening: false,
    token: state.token,
    openNow: false,
    dropToken: false,
    delayMs: reconnectDelayMs(state.attempt),
  };
}

function hold(state: LinkState): LinkDecision {
  return {
    phase: state.phase,
    everConnected: state.everConnected,
    attempt: state.attempt,
    retryPending: state.retryPending,
    opening: state.opening,
    token: state.token,
    openNow: false,
    dropToken: false,
  };
}
