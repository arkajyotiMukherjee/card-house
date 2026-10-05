import type { GameTable } from '../../src/shared/games';
import { rulesByType } from './rules-by-type';

/**
 * State stored on a new table.
 * Registered rules supply `initialState`. Other game types stay `{}`.
 */
export function openingTableState(
  gameType: string,
  table: Pick<
    GameTable,
    'lobbyId' | 'name' | 'minPlayers' | 'maxPlayers' | 'createdAt'
  > & { id?: string },
): unknown {
  const rules = rulesByType[gameType];
  if (!rules) {
    return {};
  }
  return rules.initialState([], {
    id: table.id ?? '',
    lobbyId: table.lobbyId,
    gameType,
    name: table.name,
    status: 'waiting_for_players',
    minPlayers: table.minPlayers,
    maxPlayers: table.maxPlayers,
    stateJson: '{}',
    createdAt: table.createdAt,
  });
}
