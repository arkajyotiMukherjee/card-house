export type TableStatusTag = 'waiting_for_players' | 'in_progress' | 'finished';

/**
 * Table row status follows a stored game phase.
 * Dummy `{ count }` and stub `{ label }` have no phase, so they keep `current`.
 */
export function statusTagForState(
  state: unknown,
  current: TableStatusTag,
): TableStatusTag {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return current;
  }
  if (!('phase' in state) || typeof state.phase !== 'string') {
    return current;
  }
  if (state.phase === 'play' || state.phase === 'pass') {
    return 'in_progress';
  }
  if (state.phase === 'finished') {
    return 'finished';
  }
  return current;
}

/**
 * `join_table` refuses a table whose game already started or ended.
 * `waiting_for_players` stays open. The message is the `SenderError` text the
 * client maps to its own line.
 */
export function joinBlockForStatus(status: TableStatusTag): string | undefined {
  if (status === 'in_progress') {
    return 'Game already started';
  }
  if (status === 'finished') {
    return 'Game already ended';
  }
  return undefined;
}
