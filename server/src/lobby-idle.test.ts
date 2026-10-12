import {
  DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  MAX_DEV_LOBBY_IDLE_TIMEOUT_MS,
  MIN_DEV_LOBBY_IDLE_TIMEOUT_MS,
  PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  PRODUCTION_LOBBY_IDLE_TIMEOUT_MS,
  activeLobbyIdleTimeoutMicros,
  lobbyIdleTimeoutError,
  lobbyIdleTimeoutMicros,
  lobbyIsIdle,
} from './lobby-idle.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const setting = {
  idleTimeoutMicros: PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  devTimeoutMicros: DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  dev: false,
};

assert(
  activeLobbyIdleTimeoutMicros(setting) ===
    PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  'production mode uses the long timeout',
);
assert(
  activeLobbyIdleTimeoutMicros({ ...setting, dev: true }) ===
    DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  'dev mode uses the short timeout',
);

const created = 1_000_000n;
assert(
  lobbyIsIdle(
    created,
    created + DEV_LOBBY_IDLE_TIMEOUT_MICROS - 1n,
    DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  ) === false,
  'a lobby inside the dev window stays open',
);
assert(
  lobbyIsIdle(
    created,
    created + DEV_LOBBY_IDLE_TIMEOUT_MICROS,
    DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  ),
  'a lobby at the dev timeout is idle',
);
assert(
  lobbyIsIdle(
    created,
    created + 5_000_000n,
    PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  ) === false,
  'a few seconds is not idle on the production window',
);
assert(
  lobbyIsIdle(
    created,
    created + PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
    PRODUCTION_LOBBY_IDLE_TIMEOUT_MICROS,
  ),
  'a lobby at 24 hours is idle',
);
assert(
  lobbyIsIdle(
    created + 4_000_000n,
    created + 5_000_000n,
    DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  ) === false,
  'a later activity keeps the lobby inside the dev window',
);

assert(
  lobbyIdleTimeoutError(true, 2_000) === undefined,
  'two seconds is a dev timeout',
);
assert(
  lobbyIdleTimeoutError(true, MIN_DEV_LOBBY_IDLE_TIMEOUT_MS - 1) ===
    'Dev timeout must be between 1 and 60 seconds',
  'a sub-second dev timeout is rejected',
);
assert(
  lobbyIdleTimeoutError(true, MAX_DEV_LOBBY_IDLE_TIMEOUT_MS + 1) ===
    'Dev timeout must be between 1 and 60 seconds',
  'a long dev timeout is rejected',
);
assert(
  lobbyIdleTimeoutError(false, PRODUCTION_LOBBY_IDLE_TIMEOUT_MS) === undefined,
  '24 hours is a production timeout',
);
assert(
  lobbyIdleTimeoutError(false, 2_000) ===
    'Timeout must be between 1 hour and 7 days',
  'a short production timeout is rejected',
);
assert(
  lobbyIdleTimeoutError(false, 1.5) ===
    'Timeout must be a positive number of milliseconds',
  'a fractional timeout is rejected',
);
assert(
  lobbyIdleTimeoutMicros(2_000) === DEV_LOBBY_IDLE_TIMEOUT_MICROS,
  'milliseconds convert to microseconds',
);

console.log(JSON.stringify({ ok: true }));
