import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import {
  CHALLENGE_LIFT_MS,
  CHALLENGE_MESSAGE_MS,
  CHALLENGE_MOVE_MS,
  challengeFrame,
  challengePickup,
} from './bluff-challenge';

function play(overrides: Partial<BluffState> = {}): BluffState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['2C'] },
    discardPile: ['KD', 'QH', 'JS'],
    requiredRank: 'A',
    passed: [],
    playCounts: {},
    turnCounts: {},
    turnSeatIndex: 1,
    lastPlay: { seat: 0, cards: ['JS'], claimRank: 'A' },
    winnerSeatIndex: null,
    ...overrides,
  };
}

const names = (seat: number): string => (seat === 1 ? 'Ada' : 'Bea');

describe('challenge loss', () => {
  it('shows the line, then adds the cards, then lets them settle', () => {
    const before = play();
    const after = play({
      hands: { '0': ['AS', '10H', 'KD', 'QH', 'JS'], '1': ['2C'] },
      discardPile: [],
      requiredRank: null,
      lastPlay: null,
      turnSeatIndex: 1,
    });
    const pickup = challengePickup(before, after, 0, names);
    expect(pickup?.line).toBe('Ada challenged you');
    expect(pickup?.cards).toEqual(['KD', 'QH', 'JS']);
    expect(pickup?.seat).toBe(0);

    const message = challengeFrame(0);
    expect(message.phase).toBe('message');
    expect(message.cardsInHand).toBe(false);
    expect(message.lifted).toBe(false);

    const added = challengeFrame(CHALLENGE_MESSAGE_MS);
    expect(added.phase).toBe('added');
    expect(added.cardsInHand).toBe(true);
    expect(added.lifted).toBe(true);

    const settled = challengeFrame(
      CHALLENGE_MESSAGE_MS + CHALLENGE_MOVE_MS + CHALLENGE_LIFT_MS,
    );
    expect(settled.phase).toBe('settled');
    expect(settled.cardsInHand).toBe(true);
    expect(settled.lifted).toBe(false);
  });

  it('names the other seat when this player wins the challenge', () => {
    const before = play({
      hands: { '0': ['AS'], '1': ['2C'] },
      discardPile: ['KD'],
      turnSeatIndex: 0,
      lastPlay: { seat: 1, cards: ['KD'], claimRank: 'A' },
    });
    const after = play({
      hands: { '0': ['AS'], '1': ['2C', 'KD'] },
      discardPile: [],
      requiredRank: null,
      lastPlay: null,
      turnSeatIndex: 0,
    });
    const pickup = challengePickup(before, after, 0, names);
    expect(pickup?.line).toBe('You challenged Ada');
    expect(pickup?.seat).toBe(1);
    expect(pickup?.cards).toEqual(['KD']);
  });
});
