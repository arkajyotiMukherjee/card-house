/**
 * Deal a table that is still in the lobby phase once enough seats exist.
 * Dummy `{ count }` and stub `{ label }` have no `phase`, so they stay put.
 * A `play` or `finished` phase is left alone.
 */
export function stateIfLobbyReady(
  stateJson: string,
  seatedCount: number,
  minPlayers: number,
): 'deal' | 'keep' {
  if (seatedCount < minPlayers) {
    return 'keep';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    return 'keep';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'keep';
  }
  if (!('phase' in parsed) || parsed.phase !== 'lobby') {
    return 'keep';
  }
  return 'deal';
}
