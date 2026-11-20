import assert from './test-assert.ts';
import {
  blackjackRules,
  readBlackjackState,
  type BlackjackSeatState,
  type BlackjackState,
  type BlackjackIntent,
} from '../../src/shared/games/blackjack.ts';
import type { IntentContext } from '../../src/shared/games/game-rules.ts';
function player(cards: string[], bet = 25, chips = 175): BlackjackSeatState {
  return {
    chips,
    bet,
    hands: [{ cards, bet, done: cards.includes('AS') && cards.includes('KS') }],
    handIndex: 0,
    results: [],
  };
}
function state(
  seats: Record<string, BlackjackSeatState>,
  extra: Partial<BlackjackState> = {},
): BlackjackState {
  return {
    phase: 'play',
    step: 'act',
    deck: ['2C', '3D', '4H', '5S', '6C', '7D'],
    dealer: ['10H', '7C'],
    holeHidden: true,
    seats,
    turnSeatIndex: 0,
    winnerSeatIndexes: [],
    ...extra,
  };
}
function act(before: BlackjackState, intent: BlackjackIntent): BlackjackState {
  const index = before.turnSeatIndex ?? 0;
  const ctx: IntentContext = {
    seat: {
      id: '',
      tableId: '',
      lobbyMemberId: '',
      seatIndex: index,
      chips: null,
      seatState: 'active',
      joinedAt: 0,
    },
    now: 0,
  };
  return blackjackRules.applyIntent(before, intent, ctx);
}
const natural = act(
  state(
    { 0: player(['AS', 'KS']), 1: player(['10D', '9C']) },
    { turnSeatIndex: 1 },
  ),
  { type: 'stand' },
);
assert.equal(natural.seats['0'].chips, 237.5);
assert.equal(readBlackjackState(natural).seats['0'].chips, 237.5);
const push = act(state({ 0: player(['10S', '7H'], 20, 180) }), {
  type: 'stand',
});
assert.deepEqual(push.seats['0'].results, ['push']);
assert.equal(push.seats['0'].chips, 200);
const surrendered = act(state({ 0: player(['10S', '6C']) }), {
  type: 'surrender',
});
assert.equal(surrendered.seats['0'].chips, 187.5);
assert.equal(surrendered.seats['0'].results[0], 'surrender');
const insurance = act(
  state(
    { 0: player(['10S', '9C']) },
    { step: 'insurance', dealer: ['AH', 'KD'] },
  ),
  { type: 'insurance', take: true },
);
assert.equal(insurance.phase, 'finished');
assert.equal(insurance.seats['0'].chips, 200);
const uninsured = act(
  state(
    { 0: player(['10S', '9C']) },
    { step: 'insurance', dealer: ['AH', 'KD'] },
  ),
  { type: 'insurance', take: false },
);
assert.equal(uninsured.seats['0'].chips, 175);
for (const dealer of [
  ['AH', 'KD'],
  ['AH', '8D'],
]) {
  const evenMoney = act(
    state({ 0: player(['AS', 'KS']) }, { step: 'insurance', dealer }),
    { type: 'even_money' },
  );
  assert.equal(evenMoney.seats['0'].chips, 225);
}
assert.throws(() =>
  act(
    state(
      { 0: player(['10S', '9C']) },
      { step: 'insurance', dealer: ['AH', '8D'] },
    ),
    { type: 'surrender' },
  ),
);
const split = act(state({ 0: player(['10S', 'JH'], 25, 1000) }), {
  type: 'split',
});
assert.equal(split.seats['0'].hands.length, 2);
const splitPair = state({
  0: {
    ...player(['8S', '8H'], 10, 1000),
    hands: [
      { cards: ['8S', '8H'], bet: 10, done: false },
      { cards: ['8D', '8C'], bet: 10, done: false },
    ],
  },
});
const third = act(splitPair, { type: 'split' });
assert.equal(third.seats['0'].hands.length, 3);
assert.throws(() => act(third, { type: 'surrender' }));
const fourHands = state({
  0: {
    ...player(['8S', '8H'], 10, 1000),
    hands: Array.from({ length: 4 }, () => ({
      cards: ['8S', '8H'],
      bet: 10,
      done: false,
    })),
  },
});
assert.throws(() => act(fourHands, { type: 'split' }));
const aces = act(state({ 0: player(['AS', 'AH'], 10, 190) }), {
  type: 'split',
});
assert.equal(aces.phase, 'finished');
assert.ok(aces.seats['0'].hands.every((hand) => hand.cards.length === 2));
const soft = act(
  state({ 0: player(['10S', '8H']) }, { dealer: ['AH', '6C'] }),
  { type: 'stand' },
);
assert.equal(soft.dealer.length, 2);
assert.equal(soft.seats['0'].results[0], 'win');
console.log(
  'Blackjack casino: exact payouts, insurance, even money, surrender, split limits and soft 17 passed',
);

const peeked = act(
  {
    ...state({
      0: { chips: 200, bet: 0, hands: [], handIndex: 0, results: [] },
    }),
    step: 'bet',
    deck: ['9S', '10H', '8C', 'AH'],
    dealer: [],
  },
  { type: 'bet', amount: 25 },
);
assert.equal(peeked.phase, 'finished');
assert.equal(peeked.seats['0'].chips, 175);
const fourth = act(
  state({
    0: {
      ...player(['8S', '8H'], 10, 1000),
      hands: Array.from({ length: 3 }, () => ({
        cards: ['8S', '8H'],
        bet: 10,
        done: false,
      })),
    },
  }),
  { type: 'split' },
);
assert.equal(fourth.seats['0'].hands.length, 4);
const split21 = act(
  state({
    0: {
      chips: 150,
      bet: 25,
      hands: [
        { cards: ['AS', 'KH'], bet: 25, done: true },
        { cards: ['10S', '7H'], bet: 25, done: false },
      ],
      handIndex: 1,
      results: [],
    },
  }),
  { type: 'stand' },
);
assert.equal(split21.seats['0'].results[0], 'win');
assert.equal(split21.seats['0'].chips, 225);
