import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import {
  HAND_Y,
  PILE_X,
  PILE_Y,
  cardLift,
  faceForCard,
  handPositions,
  legalCard,
  opponentBackPositions,
  pileFaceUp,
  pilePositions,
  selectedPlayCards,
} from './bluff-layout';

function playState(turnSeatIndex: number | null): BluffState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD', 'QC'] },
    discardPile: [],
    requiredRank: 'A',
    turnSeatIndex,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

describe('bluff layout', () => {
  it('puts your hand along the bottom and the pile in the center', () => {
    const hand = handPositions(26);
    expect(hand).toHaveLength(26);
    expect(hand.every((slot) => slot.y === HAND_Y)).toBe(true);
    expect(hand[0]?.x).toBeLessThan(hand[1]?.x ?? 0);
    expect(hand[0]?.x).toBeGreaterThan(16);
    expect(hand[25]?.x).toBeLessThan(736);
    const pile = pilePositions(1);
    expect(pile).toEqual([{ x: PILE_X, y: PILE_Y }]);
  });

  it('keeps other hands off the bottom row', () => {
    const backs = opponentBackPositions(780, 310, 26);
    expect(backs.length).toBeGreaterThan(0);
    expect(backs.every((slot) => slot.y < HAND_Y - 40)).toBe(true);
    expect(backs.every((slot) => slot.x > 600)).toBe(true);
  });

  it('lifts a card only when it is legal to play', () => {
    const state = playState(0);
    expect(legalCard(state, 0, 'AS')).toBe(true);
    expect(legalCard(state, 0, 'KD')).toBe(false);
    expect(legalCard(playState(1), 0, 'AS')).toBe(false);
    expect(legalCard({ ...state, phase: 'lobby' }, 0, 'AS')).toBe(false);
    expect(
      cardLift({ legal: true, hovered: true, selected: false }),
    ).toBeGreaterThan(0);
    expect(cardLift({ legal: false, hovered: true, selected: true })).toBe(0);
  });

  it('builds a one-card play from the selection, in hand order', () => {
    expect(selectedPlayCards(['AS', '10H', 'KD'], new Set(['10H']))).toEqual([
      '10H',
    ]);
    expect(faceForCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(faceForCard('nope')).toBeNull();
  });

  it('shows your last play face up on the pile', () => {
    const state: BluffState = {
      ...playState(1),
      discardPile: ['AS'],
      lastPlay: { seat: 0, cards: ['AS'], claimRank: 'A' },
    };
    expect(pileFaceUp(state, 'AS', 0)).toBe(true);
    expect(pileFaceUp(state, 'AS', 1)).toBe(false);
  });
});
