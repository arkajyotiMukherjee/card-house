/** Empty tables with nobody seated are removed after this long with no activity. */
export const EMPTY_TABLE_IDLE_MICROS = 15n * 60n * 1_000_000n;

/** How often the sweep looks for those tables. */
export const TABLE_CLEANUP_INTERVAL_MICROS = 1_000_000n;

/** Shortest idle timeout `set_empty_table_idle_timeout` accepts. */
export const MIN_EMPTY_TABLE_IDLE_MICROS = 1_000_000n;

/** Longest idle timeout `set_empty_table_idle_timeout` accepts. */
export const MAX_EMPTY_TABLE_IDLE_MICROS = 24n * 60n * 60n * 1_000_000n;

export function idleTimeoutAllowed(idleMicros: bigint): boolean {
  return (
    idleMicros >= MIN_EMPTY_TABLE_IDLE_MICROS &&
    idleMicros <= MAX_EMPTY_TABLE_IDLE_MICROS
  );
}

/**
 * A sweep removes a table only when every seat is empty.
 * `finished` goes on the next sweep. Any other status waits until `idleMicros`
 * reaches the timeout. A seated table stays, including one that has been quiet.
 */
export function shouldRemoveEmptyTable(
  seatCount: number,
  status: string,
  idleMicros: bigint,
  idleLimitMicros: bigint,
): boolean {
  if (seatCount !== 0) {
    return false;
  }
  if (status === 'finished') {
    return true;
  }
  return idleMicros >= idleLimitMicros;
}
