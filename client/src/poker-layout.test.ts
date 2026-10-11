import { describe, expect, it } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { HAND_Y } from './bluff-layout';
import {
  BOARD_Y,
  bannerX,
  boardPositions,
  droppedPositions,
  faceForPokerCard,
  finishedLine,
  holePositions,
  seatLabelOrigin,
  seatNote,
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

  it('keeps the chip label right of the seat plate and the banner clear of side seats', () => {
    const label = seatLabelOrigin(480, 456, 'Ada');
    expect(label).toEqual({ x: 510, y: 462 });
    expect(label.x).toBeGreaterThan(
      (holePositions(true, 480, 456, 4).at(-1)?.x ?? 0) + 32,
    );
    expect(bannerX('Winner seat 0 Ada')).toBeGreaterThanOrEqual(280);
    expect(bannerX('x'.repeat(200))).toBe(280);
  });

  it('puts dropped cards beside the hand, below the action buttons', () => {
    const slots = droppedPositions(3);
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.y > 476)).toBe(true);
    expect(slots[0]?.x).toBeGreaterThan(736);
  });

  it('notes folds, bets, all-ins, and showdown hands', () => {
    const base = finished([0]);
    const row = {
      chips: 100,
      hole: ['AS', 'KD'],
      streetBet: 0,
      committed: 20,
      folded: false,
      allIn: false,
      acted: true,
      mustDiscard: false,
    };
    const play: PokerState = {
      ...base,
      phase: 'play',
      end: null,
      seats: {
        '0': { ...row, streetBet: 40 },
        '1': { ...row, folded: true },
        '2': { ...row, allIn: true },
        '3': row,
      },
    };
    expect(seatNote(play, 0)).toBe('Bet 40');
    expect(seatNote(play, 1)).toBe('Fold');
    expect(seatNote(play, 2)).toBe('All-in');
    expect(seatNote(play, 3)).toBeNull();
    const showdown: PokerState = {
      ...base,
      seats: play.seats,
      hands: { '0': { cards: [], name: 'Flush', score: [5] } },
    };
    expect(seatNote(showdown, 0)).toBe('Flush');
    expect(seatNote(showdown, 1)).toBe('Fold');
  });
});
