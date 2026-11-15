import {
  EMPTY_TABLE_IDLE_MICROS,
  MAX_EMPTY_TABLE_IDLE_MICROS,
  MIN_EMPTY_TABLE_IDLE_MICROS,
  TABLE_CLEANUP_INTERVAL_MICROS,
  idleTimeoutAllowed,
  shouldRemoveEmptyTable,
} from './table-cleanup.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const limit = 3_000_000n;

assert(
  shouldRemoveEmptyTable(0, 'finished', 0n, limit) === true,
  'a finished table with no seats is removed',
);
assert(
  shouldRemoveEmptyTable(1, 'finished', limit, limit) === false,
  'a finished table with a seat stays',
);
assert(
  shouldRemoveEmptyTable(0, 'waiting_for_players', limit - 1n, limit) === false,
  'an empty waiting table stays until the idle timeout',
);
assert(
  shouldRemoveEmptyTable(0, 'waiting_for_players', limit, limit) === true,
  'an empty waiting table is removed at the idle timeout',
);
assert(
  shouldRemoveEmptyTable(0, 'in_progress', limit, limit) === true,
  'an empty in-progress table is removed once it is idle',
);
assert(
  shouldRemoveEmptyTable(0, 'in_progress', limit - 1n, limit) === false,
  'an empty in-progress table stays before the idle timeout',
);
assert(
  shouldRemoveEmptyTable(2, 'waiting_for_players', limit * 4n, limit) === false,
  'an occupied table stays after the idle timeout',
);
assert(
  shouldRemoveEmptyTable(1, 'in_progress', limit * 4n, limit) === false,
  'a seated game stays after the idle timeout',
);
assert(
  shouldRemoveEmptyTable(0, 'finished', 0n, limit, '123456789012345678') ===
    false,
  'a voice channel keeps an empty table until the channel id is cleared',
);
assert(
  shouldRemoveEmptyTable(0, 'finished', 0n, limit, '') === true,
  'a cleared voice channel lets an empty finished table go',
);
assert(
  idleTimeoutAllowed(MIN_EMPTY_TABLE_IDLE_MICROS),
  'one second is allowed',
);
assert(idleTimeoutAllowed(MAX_EMPTY_TABLE_IDLE_MICROS), '24 hours is allowed');
assert(
  idleTimeoutAllowed(MIN_EMPTY_TABLE_IDLE_MICROS - 1n) === false,
  'under one second is rejected',
);
assert(
  idleTimeoutAllowed(MAX_EMPTY_TABLE_IDLE_MICROS + 1n) === false,
  'over 24 hours is rejected',
);
assert(
  EMPTY_TABLE_IDLE_MICROS === 15n * 60n * 1_000_000n,
  'the default idle timeout is 15 minutes',
);
assert(
  TABLE_CLEANUP_INTERVAL_MICROS < EMPTY_TABLE_IDLE_MICROS,
  'the sweep runs more often than the idle timeout',
);
assert(idleTimeoutAllowed(EMPTY_TABLE_IDLE_MICROS), 'the default is allowed');

console.log(JSON.stringify({ ok: true }));

assert(
  !shouldRemoveEmptyTable(
    0,
    'waiting_for_players',
    60_000_000n,
    EMPTY_TABLE_IDLE_MICROS,
    '',
    59_999_999n,
  ),
  'an absent host can return during the grace period',
);
assert(
  shouldRemoveEmptyTable(
    0,
    'waiting_for_players',
    60_000_000n,
    EMPTY_TABLE_IDLE_MICROS,
    '',
    60_000_000n,
  ),
  'an abandoned empty table is removed after host grace',
);
assert(
  !shouldRemoveEmptyTable(
    1,
    'in_progress',
    EMPTY_TABLE_IDLE_MICROS,
    EMPTY_TABLE_IDLE_MICROS,
    '',
    90_000_000n,
  ),
  'host absence never removes an occupied game',
);
assert(
  !shouldRemoveEmptyTable(
    0,
    'waiting_for_players',
    90_000_000n,
    EMPTY_TABLE_IDLE_MICROS,
    '123456789012345678',
    90_000_000n,
  ),
  'voice channel must be released before its abandoned table',
);
