import type { GameDefinition, GameRules } from '../../src/shared/games';

/**
 * State and Intent differ per game, so the map erases them.
 * The stored value is still the registered `GameRules` object.
 */
type RegisteredRules = GameRules<unknown, unknown>;

/** Empty until `registerGameRules` stores a game under its `gameType`. */
export const rulesByType: Record<string, RegisteredRules> = {};

export function registerGameRules<State, Intent>(
  definition: GameDefinition,
  rules: GameRules<State, Intent>,
): void {
  rulesByType[definition.gameType] = rules as unknown as RegisteredRules;
}
