import { describe, expect, it } from 'vitest';
import {
  QUEEN_OF_SPADES,
  type HeartsState,
} from '../../src/shared/games/hearts';
import { HAND_Y, TABLE_CENTER } from './bluff-layout';
import {
  cardLift,
  faceForCard,
  finishedLine,
  legalCard,
  penaltyPositions,
  pointCards,
  trickPosition,
} from './hearts-layout';

function playState(): HeartsState {
  return {
    phase: 'play',
    hands: {
      '0': ['2C', 'AH'],
      '1': ['3C'],
      '2': ['4D'],
      '3': ['5D'],
    },
    tricksTaken: { '0': [], '1': ['KH', QUEEN_OF_SPADES], '2': [], '3': [] },
    currentTrick: [],
    scores: { '0': 0, '1': 14, '2': 0, '3': 0 },
    handIndex: 0,
    passes: {},
    heartsBroken: true,
    turnSeatIndex: 0,
    winnerSeatIndex: null,
    tableId: 'table-hearts',
  };
}

describe('hearts layout', () => {
  it('places a trick between the seat and the center', () => {
    const slot = trickPosition(480, 456);
    expect(slot.y).toBeLessThan(456);
    expect(slot.y).toBeGreaterThan(TABLE_CENTER.y);
    expect(slot.x).toBe(TABLE_CENTER.x);
  });

  it('keeps taken hearts and the queen above your hand', () => {
    const row = penaltyPositions(2, 480, 456, true);
    expect(row).toHaveLength(2);
    expect(row.every((slot) => slot.y < HAND_Y - 40)).toBe(true);
    expect(row[0]?.x).toBeLessThan(row[1]?.x ?? 0);
  });

  it('keeps hearts and the queen of spades from a taken trick', () => {
    expect(pointCards(['2C', 'KH', QUEEN_OF_SPADES, 'AD'])).toEqual([
      'KH',
      QUEEN_OF_SPADES,
    ]);
    expect(faceForCard('KH')).toEqual({ rank: 'K', suit: 'hearts' });
    expect(faceForCard(QUEEN_OF_SPADES)).toEqual({ rank: 'Q', suit: 'spades' });
  });

  it('lifts a card only when that seat can play it', () => {
    const state = playState();
    expect(legalCard(state, 0, '2C')).toBe(true);
    expect(legalCard(state, 0, 'AH')).toBe(false);
    expect(legalCard(state, 1, '3C')).toBe(false);
    expect(
      cardLift({ legal: true, hovered: true, selected: false }),
    ).toBeGreaterThan(0);
    expect(cardLift({ legal: false, hovered: true, selected: true })).toBe(0);
  });

  it('names the subscribed winner seat when the rules finish', () => {
    const seats = [
      { seatIndex: 0, name: 'Ada' },
      { seatIndex: 1, name: 'Bea' },
    ];
    expect(finishedLine(playState(), seats)).toBeNull();
    expect(
      finishedLine(
        { ...playState(), phase: 'finished', winnerSeatIndex: 1 },
        seats,
      ),
    ).toBe('Winner seat 1 Bea');
  });
});
