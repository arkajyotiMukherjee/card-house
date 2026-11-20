import { describe, expect, it } from 'vitest';
import {
  actionSounds,
  settlementSound,
  unfundedResultSound,
} from './table-sfx';

describe('table sound cues', () => {
  it('uses the confirmed public action and what it did', () => {
    expect(actionSounds('bluff', { kind: 'challenge' }, 'challenge')).toEqual([
      'flip',
      'gather',
    ]);
    expect(actionSounds('spades', { kind: 'trick' }, 'play')).toEqual([
      'slide',
      'gather',
    ]);
    expect(
      actionSounds(
        'blackjack',
        { kind: 'insurance', take: false },
        'insurance',
      ),
    ).toEqual([]);
    expect(actionSounds('blackjack', { kind: 'double' }, 'double')).toEqual([
      'chip_tap',
      'deal',
    ]);
    expect(actionSounds('rummy', { kind: 'draw' }, 'draw')).toEqual(['deal']);
  });

  it('uses the local wallet profit and a public payout for spectators', () => {
    const summary = JSON.stringify([
      { walletId: 'alice', profit: '60' },
      { walletId: 'bob', profit: '-60' },
      { walletId: 'casey', profit: '0' },
    ]);
    expect(settlementSound(summary, 'alice')).toBe('win');
    expect(settlementSound(summary, 'bob')).toBe('loss');
    expect(settlementSound(summary, 'casey')).toBe('confirm');
    expect(settlementSound(summary, 'spectator')).toBe('chip_stack');
    expect(settlementSound('null', 'alice')).toBeUndefined();
  });

  it('counts the committed wager when scoring an unfunded push', () => {
    const before = { seats: { 0: { chips: 160, hands: [{ bet: 40 }] } } };
    const after = { seats: { 0: { chips: 200, results: ['push'] } } };
    expect(unfundedResultSound('blackjack', before, after, 0)).toBe('confirm');
  });
});
