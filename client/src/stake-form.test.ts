import { expect, it } from 'vitest';
import { stakeFieldUpdates, validateStakeForm } from './stake-form';
it('raises a suggested buy-in only when the minimum moves past it', () => {
  expect(
    stakeFieldUpdates('minBuyIn', { minBuyIn: '1100', buyIn: '400' }),
  ).toEqual({ buyIn: '1100' });
  expect(
    stakeFieldUpdates('minBuyIn', { minBuyIn: '1100', buyIn: '1500' }),
  ).toEqual({});
  expect(
    stakeFieldUpdates('minBuyIn', { minBuyIn: '400', buyIn: '1100' }),
  ).toEqual({});
  expect(
    stakeFieldUpdates('buyIn', { minBuyIn: '1100', buyIn: '400' }),
  ).toEqual({});
  expect(stakeFieldUpdates('minBuyIn', { minBuyIn: '', buyIn: '400' })).toEqual(
    {},
  );
});
it('rejects a later manual under-buy-in with a specific, readable message', () => {
  const values = {
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 1100,
    maxBuyIn: 2000,
    buyIn: 400,
  };
  expect(() => validateStakeForm('poker', values)).toThrow(
    'Your buy-in must be at least 1,100 chips.',
  );
  expect(() =>
    validateStakeForm('poker', { ...values, buyIn: 1100 }),
  ).not.toThrow();
  expect(() => validateStakeForm('poker', { ...values, buyIn: 2100 })).toThrow(
    'must not exceed',
  );
  expect(() =>
    validateStakeForm('blackjack', { ...values, maxBuyIn: 1000 }),
  ).toThrow('Maximum buy-in must be at least');
});
