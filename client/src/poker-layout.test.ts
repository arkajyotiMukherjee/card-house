import { describe, expect, it } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { HAND_Y } from './bluff-layout';
import {
  BOARD_Y,
  boardPositions,
  faceForPokerCard,
  finishedLine,
  holePositions,
} from './poker-layout';

function finished(winners: number[]): PokerState {
  return {
    phase: 'finished',
    variation: 'holdem',
    street: 'river',
    step: 'bet',
    deck: [],
    board: ['AS', 'KS', 'QS', 'JS', '10S'],
    seats: {},
    order: [0, 1],
    dealerSeatIndex: 0,
    turnSeatIndex: null,
    currentBet: 0,
    minRaise: 20,
    pot: 40,
    pots: [],
    winnerSeatIndexes: winners,
    hands: {},
    end: 'showdown',
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
  };
}

describe('poker layout', () => {
  it('puts the board in the center and your hole cards on the shared hand row', () => {
    const board = boardPositions(5);
    expect(board).toHaveLength(5);
    expect(board.every((slot) => slot.y === BOARD_Y)).toBe(true);
    expect(board[0]?.x).toBeLessThan(board[2]?.x ?? 0);
    expect(board[2]?.x).toBe(480);
    const mine = holePositions(true, 480, 456, 2);
    expect(mine).toHaveLength(2);
    expect(mine.every((slot) => slot.y === HAND_Y)).toBe(true);
    const theirs = holePositions(false, 180, 310, 4);
    expect(theirs.length).toBeGreaterThan(0);
  });

  it('maps a card id onto the shared suit sheet', () => {
    expect(faceForPokerCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForPokerCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(faceForPokerCard('nope')).toBeNull();
  });

  it('names the subscribed winners', () => {
    const seats = [
      { seatIndex: 0, name: 'Ada' },
      { seatIndex: 1, name: 'Bea' },
    ];
    expect(finishedLine(finished([0]), seats)).toBe('Winner seat 0 Ada');
    expect(finishedLine(finished([0, 1]), seats)).toBe(
      'Winners seat 0 Ada, seat 1 Bea',
    );
    expect(finishedLine({ ...finished([]), phase: 'play' }, seats)).toBeNull();
  });
});
