import { paidGameWinners } from './game-prizes.ts';
import assert from './test-assert.ts';
import {
  coinUnits,
  coinSetting,
  formatCoins,
  splitPool,
  tableEconomy,
} from '../../src/shared/economy.ts';
assert.equal(coinUnits(37.5), 75n);
assert.equal(formatCoins(-20_001n), '-10,000.5');
for (const invalid of [0, -1, 1.5, NaN, Infinity, 1_000_000_001])
  assert.throws(() => coinSetting(invalid, 20));
assert.throws(() => coinUnits(1.25));
assert.throws(() => tableEconomy('poker', { smallBlind: 100, bigBlind: 20 }));
assert.throws(() => tableEconomy('blackjack', { minBet: 100, maxBet: 20 }));
assert.throws(() => tableEconomy('poker', { minBuyIn: 1000, maxBuyIn: 100 }));
assert.equal(tableEconomy('poker', { bigBlind: 100 }).minBuyIn, 2000);
assert.deepEqual(
  [...splitPool(101n, [3, 1, 1])],
  [
    [1, 51n],
    [3, 50n],
  ],
);
assert.deepEqual(
  paidGameWinners(
    'spades',
    { phase: 'finished', winnerTeam: 'ew' },
    [0, 1, 2, 3],
  ),
  [1, 3],
);
assert.deepEqual(
  paidGameWinners(
    'go_fish',
    {
      phase: 'finished',
      books: { 0: ['A', 'K'], 1: ['J', 'Q'] },
      winnerSeatIndex: null,
    },
    [0, 1],
  ),
  [0, 1],
);
assert.deepEqual(
  paidGameWinners(
    'hearts',
    {
      phase: 'finished',
      scores: { 0: 20, 1: 20, 2: 100, 3: 40 },
      winnerSeatIndex: 0,
    },
    [0, 1, 2, 3],
  ),
  [0, 1],
);
assert.deepEqual(
  paidGameWinners('bluff', { phase: 'play', winnerSeatIndex: 0 }, [0, 1]),
  [],
);
assert.deepEqual(
  paidGameWinners(
    'crazy_eights',
    { phase: 'finished', hands: { 0: ['2S'], 1: ['2H'] }, winnerSeatIndex: 0 },
    [0, 1],
  ),
  [0, 1],
);
console.log(
  'Economy: exact money, limits, conservation, tied prizes and team prizes passed',
);
