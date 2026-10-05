import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Catalog key for the click counter. */
export const DUMMY_GAME_TYPE = 'dummy' as const;

/** Intent `type` that adds one to the shared counter. */
export const DUMMY_INCREMENT = 'increment' as const;

export interface DummyState {
  count: number;
}

export interface DummyIntent {
  type: typeof DUMMY_INCREMENT;
}

export const dummyGameDefinition = {
  gameType: DUMMY_GAME_TYPE,
  displayName: 'Dummy',
  minPlayers: 1,
  maxPlayers: 8,
  howToPlay:
    '# Dummy\n\nClick the counter. The table adds one and every seat sees the new count.',
} satisfies GameDefinition;

export function readDummyState(value: unknown): DummyState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid table state');
  }
  if (!('count' in value) || typeof value.count !== 'number') {
    throw new Error('Invalid table state');
  }
  if (!Number.isSafeInteger(value.count) || value.count < 0) {
    throw new Error('Invalid table state');
  }
  return { count: value.count };
}

export function readDummyIntent(value: unknown): DummyIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid intent');
  }
  if (!('type' in value) || value.type !== DUMMY_INCREMENT) {
    throw new Error('Invalid intent');
  }
  return { type: DUMMY_INCREMENT };
}

/**
 * Counter rules for gameType `dummy`.
 * `applyIntent` returns a new `{ count }` and does not keep a local tally.
 */
export const dummyCounterRules = {
  initialState(_players: GameSeat[], _table: GameTable): DummyState {
    return { count: 0 };
  },
  applyIntent(
    prev: DummyState,
    intent: DummyIntent,
    _ctx: IntentContext,
  ): DummyState {
    const state = readDummyState(prev);
    readDummyIntent(intent);
    return { count: state.count + 1 };
  },
} satisfies GameRules<DummyState, DummyIntent>;
