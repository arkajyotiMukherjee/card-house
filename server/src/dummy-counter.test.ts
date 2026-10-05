import type { IntentContext } from '../../src/shared/games/game-rules.ts';
import {
  dummyCounterRules,
  dummyGameDefinition,
  type DummyIntent,
} from '../../src/shared/games/dummy-counter.ts';
import { registerGameRules, rulesByType } from './rules-by-type.ts';

const ctx: IntentContext = {
  seat: {
    id: 'seat-1',
    tableId: 'table-1',
    lobbyMemberId: 'member-1',
    seatIndex: 0,
    chips: null,
    joinedAt: 1,
    seatState: 'active',
  },
  now: 1,
};

const tableFields = {
  id: 'table-1',
  lobbyId: 'lobby-1',
  name: 'Dummy #1',
  minPlayers: 1,
  maxPlayers: 8,
  createdAt: 1,
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  rulesByType[dummyGameDefinition.gameType] === undefined,
  'registry starts without the dummy gameType',
);

registerGameRules(dummyGameDefinition, dummyCounterRules);

assert(
  rulesByType[dummyGameDefinition.gameType] === dummyCounterRules,
  'dummy gameType resolves to the counter rules',
);
assert(rulesByType.bluff === undefined, 'bluff stays unregistered');

const opened = dummyCounterRules.initialState([], {
  id: tableFields.id,
  lobbyId: tableFields.lobbyId,
  gameType: dummyGameDefinition.gameType,
  name: tableFields.name,
  status: 'waiting_for_players',
  minPlayers: tableFields.minPlayers,
  maxPlayers: tableFields.maxPlayers,
  stateJson: '{}',
  createdAt: tableFields.createdAt,
});
assert(opened.count === 0, 'a new dummy table starts at count 0');

const once = dummyCounterRules.applyIntent(
  opened as { count: number },
  { type: 'increment' },
  ctx,
);
const twice = dummyCounterRules.applyIntent(once, { type: 'increment' }, ctx);
assert(once.count === 1, 'one increment intent adds one');
assert(twice.count === 2, 'a second intent adds one to the stored count');
assert(opened !== once, 'applyIntent returns a new state object');

let rejected = false;
try {
  dummyCounterRules.applyIntent(
    once,
    { type: 'fold' } as unknown as DummyIntent,
    ctx,
  );
} catch (error) {
  rejected = error instanceof Error && error.message === 'Invalid intent';
}
assert(rejected, 'a non-increment intent is rejected');

let emptyState = false;
try {
  dummyCounterRules.applyIntent(
    {} as { count: number },
    { type: 'increment' },
    ctx,
  );
} catch (error) {
  emptyState =
    error instanceof Error && error.message === 'Invalid table state';
}
assert(emptyState, 'a missing count is not treated as a local zero');

console.log(
  JSON.stringify({
    gameType: dummyGameDefinition.gameType,
    opened,
    once,
    twice,
  }),
);
