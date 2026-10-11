import { statusTagForState } from './table-status.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  statusTagForState({ phase: 'lobby' }, 'waiting_for_players') ===
    'waiting_for_players',
  'a lobby phase stays waiting',
);
assert(
  statusTagForState({ phase: 'play' }, 'waiting_for_players') === 'in_progress',
  'a dealt Bluff table is in progress',
);
assert(
  statusTagForState({ phase: 'pass' }, 'waiting_for_players') === 'in_progress',
  'a Hearts pass is in progress',
);
assert(
  statusTagForState(
    { phase: 'finished', winnerSeatIndex: 0 },
    'in_progress',
  ) === 'finished',
  'a finished Bluff table is finished',
);
assert(
  statusTagForState({ count: 1 }, 'waiting_for_players') ===
    'waiting_for_players',
  'a dummy counter keeps its status',
);
assert(
  statusTagForState({ label: 'stub' }, 'waiting_for_players') ===
    'waiting_for_players',
  'a stub table keeps its status',
);

console.log(JSON.stringify({ ok: true }));
