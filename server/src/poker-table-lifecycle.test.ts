function assertEqual(
  actual: unknown,
  expected: unknown,
  message = 'Unexpected lifecycle state',
): void {
  if (!Object.is(actual, expected)) throw new Error(message);
}
import {
  pokerHandFinished,
  pokerSessionFinished,
} from './poker-table-lifecycle.ts';
import { pokerRules, advancePoker } from '../../src/shared/games/poker.ts';
import type { GameTable, GameSeat } from '../../src/shared/games/game-rules.ts';
const table = {
  id: 'lifecycle-regression',
  gameType: 'poker',
  stateJson: '{}',
} as GameTable;
const seats = [0, 1].map((seatIndex) => ({
  seatIndex,
  id: `seat-${seatIndex}`,
})) as GameSeat[];
let state = pokerRules.initialState(seats, table);
assertEqual(pokerHandFinished(state), false);
assertEqual(pokerSessionFinished(state), false);
const folded = pokerRules.applyIntent(
  state,
  { type: 'fold' },
  { seat: seats[0]!, now: 0 },
);
assertEqual(pokerHandFinished(folded), true);
assertEqual(
  pokerSessionFinished(folded),
  false,
  'a normal hand still permits another cash-game hand',
);
state = pokerRules.applyIntent(
  state,
  { type: 'raise', amount: 1000 },
  { seat: seats[0]!, now: 0 },
);
state = pokerRules.applyIntent(
  state,
  { type: 'call' },
  { seat: seats[1]!, now: 0 },
);
while (state.phase === 'play') state = advancePoker(state, table, [0, 1]);
assertEqual(pokerHandFinished(state), true);
assertEqual(
  pokerSessionFinished(state),
  Object.values(state.seats).filter((s) => s.chips > 0).length < 2,
);
assertEqual(pokerSessionFinished({}), false);
console.log('Poker completed-hand/session lifecycle checks passed');
