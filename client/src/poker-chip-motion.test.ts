import { describe, it, expect } from 'vitest';
import { chipTransfers } from './poker-chip-motion';
import { sliderStake, stakeContribution, betChipStacks } from './poker-layout';
import type { PokerState } from '../../src/shared/games/poker';
function state(): PokerState {
  return {
    phase: 'play',
    handNumber: 1,
    order: [0, 1],
    pot: 40,
    winnerSeatIndexes: [],
    seats: {
      '0': { chips: 80, committed: 20 },
      '1': { chips: 80, committed: 20 },
    },
  } as unknown as PokerState;
}
describe('poker chip presentation', () => {
  it('snaps slider values to legal increments and reaches the exact cap', () => {
    expect(sliderStake(-1, 40, 135, 20)).toBe(40);
    expect(sliderStake(0.5, 40, 135, 20)).toBe(80);
    expect(sliderStake(1, 40, 135, 20)).toBe(135);
    expect(sliderStake(1, 40, 40, 20)).toBe(40);
  });
  it('shows only the additional chips and includes every preview denomination', () => {
    const table = state();
    Object.assign(table.seats['0'], { chips: 395, streetBet: 5 });
    expect(stakeContribution(table, 0, 400)).toBe(395);
    expect(stakeContribution(table, 0, 20)).toBe(15);
    Object.assign(table.seats['0'], { chips: 390, streetBet: 10 });
    expect(stakeContribution(table, 0, 400)).toBe(390);
    Object.assign(table.seats['0'], { chips: 395, streetBet: 0 });
    expect(stakeContribution(table, 0, 395)).toBe(395);
    for (const amount of [0, 15, 60, 390, 395, 999, 10000]) {
      const stacks = betChipStacks(amount);
      expect(
        stacks.reduce((sum, chip) => sum + chip.value * chip.count, 0),
      ).toBe(amount);
    }
    expect(betChipStacks(395)).toEqual([
      { value: 100, count: 3 },
      { value: 25, count: 3 },
      { value: 10, count: 2 },
    ]);
  });
  it('does not animate initial subscriptions, duplicate states, or a new deal', () => {
    const first = state();
    expect(chipTransfers(null, first)).toEqual([]);
    expect(chipTransfers(first, structuredClone(first))).toEqual([]);
    expect(chipTransfers(first, { ...first, handNumber: 2 })).toEqual([]);
  });
  it('moves only the accepted committed increment into the pot', () => {
    const before = state(),
      after = structuredClone(before);
    after.seats['1'].chips -= 20;
    after.seats['1'].committed += 20;
    expect(chipTransfers(before, after)).toEqual([
      { seat: 1, amount: 20, payout: false },
    ]);
  });
  it('includes a final caller’s chips in the payout and never replays settlement', () => {
    const before = state(),
      after = structuredClone(before);
    after.phase = 'finished';
    after.pot = 60;
    after.winnerSeatIndexes = [1];
    after.seats['1'].committed = 40;
    after.seats['1'].chips = 120;
    expect(chipTransfers(before, after)).toEqual([
      { seat: 1, amount: 20, payout: false },
      { seat: 1, amount: 60, payout: true },
    ]);
    expect(chipTransfers(after, structuredClone(after))).toEqual([]);
  });
});

it('animates independent contested pot awards without counting an uncalled return', () => {
  const before = {
    ...state(),
    order: [0, 1, 2],
    pot: 354,
    seats: {
      '0': { chips: 0, committed: 51 },
      '1': { chips: 0, committed: 101 },
      '2': { chips: 0, committed: 201 },
    },
  } as unknown as PokerState;
  const after = {
    ...before,
    phase: 'finished',
    end: 'showdown',
    pot: 254,
    dealerSeatIndex: 0,
    winnerSeatIndexes: [0, 1, 2],
    seats: {
      '0': { chips: 51, committed: 51 },
      '1': { chips: 102, committed: 101 },
      '2': { chips: 201, committed: 101 },
    },
    pots: [
      { amount: 154, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ],
    hands: {
      '0': { score: [8, 14] },
      '1': { score: [8, 14] },
      '2': { score: [8, 14] },
    },
  } as unknown as PokerState;
  expect(chipTransfers(before, after)).toEqual([
    { seat: 0, amount: 51, payout: true },
    { seat: 1, amount: 102, payout: true },
    { seat: 2, amount: 101, payout: true },
  ]);
});
