/** Production idle window. Twenty-four hours. */
export const PRODUCTION_LOBBY_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Initial dev window, replaced when `set_lobby_idle_timeout` stores another. */
export const DEV_LOBBY_IDLE_TIMEOUT_MS = 2_000;

export const MIN_DEV_LOBBY_IDLE_TIMEOUT_MS = 1_000;
export const MAX_DEV_LOBBY_IDLE_TIMEOUT_MS = 60_000;
export const MIN_PRODUCTION_LOBBY_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const MAX_LOBBY_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export const PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS =
  BigInt(PRODUCTION_LOBBY_IDLE_TIMEOUT_MS) * 1_000n;
export const DEV_LOBBY_IDLE_TIMEOUT_MICROS =
  BigInt(DEV_LOBBY_IDLE_TIMEOUT_MS) * 1_000n;

/** How often `close_idle_lobbies` runs. One second. */
export const LOBBY_IDLE_SWEEP_INTERVAL_MICROS = 1_000_000n;

export const LOBBY_IDLE_CONFIG_ID = 'default';

export interface LobbyIdleSetting {
  idleTimeoutMicros: bigint;
  devTimeoutMicros: bigint;
  dev: boolean;
}

export function activeLobbyIdleTimeoutMicros(
  setting: LobbyIdleSetting,
): bigint {
  if (setting.dev) {
    return setting.devTimeoutMicros;
  }
  return setting.idleTimeoutMicros;
}

/** True when the lobby's last activity is at least `timeoutMicros` old. */
export function lobbyIsIdle(
  lastActivityMicros: bigint,
  nowMicros: bigint,
  timeoutMicros: bigint,
): boolean {
  return nowMicros - lastActivityMicros >= timeoutMicros;
}

/**
 * Reject a timeout that is not a short dev window or a long production window.
 * Returns the error text, or `undefined` when the value can be stored.
 */
export function lobbyIdleTimeoutError(
  dev: boolean,
  timeoutMs: number,
): string | undefined {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    return 'Timeout must be a positive number of milliseconds';
  }
  if (dev) {
    if (
      timeoutMs < MIN_DEV_LOBBY_IDLE_TIMEOUT_MS ||
      timeoutMs > MAX_DEV_LOBBY_IDLE_TIMEOUT_MS
    ) {
      return 'Dev timeout must be between 1 and 60 seconds';
    }
    return undefined;
  }
  if (
    timeoutMs < MIN_PRODUCTION_LOBBY_IDLE_TIMEOUT_MS ||
    timeoutMs > MAX_LOBBY_IDLE_TIMEOUT_MS
  ) {
    return 'Timeout must be between 1 hour and 7 days';
  }
  return undefined;
}

export function lobbyIdleTimeoutMicros(timeoutMs: number): bigint {
  return BigInt(timeoutMs) * 1_000n;
}
