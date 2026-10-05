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
  if (state.phase === 'play') {
    return 'in_progress';
  }
  if (state.phase === 'finished') {
    return 'finished';
  }
  return current;
}
