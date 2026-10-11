import { describe, expect, it } from 'vitest';
import type { GoFishState } from '../../src/shared/games/go-fish';
import { HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import {
  BOOK_Y,
  STOCK_X,
  askButtonBox,
  askSeat,
  bookSlots,
  finishedLine,
  legalCard,
  opponentBookOrigin,
  selfBookOrigin,
  stockPosition,
} from './go-fish-layout';

function playState(turnSeatIndex: number | null): GoFishState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    stock: ['2C'],
    books: { '0': [], '1': [] },
    turnSeatIndex,
    winnerSeatIndex: null,
    lastAsk: null,
  };
}

describe('go fish layout', () => {
  it('puts the stock left of center and your books above the hand', () => {
    expect(stockPosition()).toEqual({ x: STOCK_X, y: PILE_Y });
    expect(STOCK_X).toBeLessThan(PILE_X);
    const origin = selfBookOrigin();
    expect(origin.y).toBe(BOOK_Y);
    expect(origin.y).toBeLessThan(HAND_Y - 40);
    const books = bookSlots(origin.x, origin.y, 3);
    expect(books).toHaveLength(3);
    expect(books[0]?.x).toBeLessThan(books[1]?.x ?? 0);
    expect(books.every((slot) => slot.y === BOOK_Y)).toBe(true);
  });

  it('keeps other books and ask buttons off the bottom hand', () => {
    const origin = opponentBookOrigin(780, 310);
    const books = bookSlots(origin.x, origin.y, 2);
    expect(books.every((slot) => slot.y < HAND_Y - 40)).toBe(true);
    const ask = askButtonBox(780, 310);
    expect(ask.y + ask.h).toBeLessThan(HAND_Y - 40);
    expect(askSeat('ask:1')).toBe(1);
    expect(askSeat('AS')).toBeNull();
  });

  it('lifts a card only on your turn when it is in your hand', () => {
    const state = playState(0);
    expect(legalCard(state, 0, 'AS')).toBe(true);
    expect(legalCard(state, 0, 'KD')).toBe(false);
    expect(legalCard(playState(1), 0, 'AS')).toBe(false);
    expect(legalCard({ ...state, phase: 'lobby' }, 0, 'AS')).toBe(false);
  });

  it('names the winner and a tie from the subscribed state', () => {
    const seats = [{ seatIndex: 0, name: 'Ada' }];
    expect(
      finishedLine(
        { ...playState(null), phase: 'finished', winnerSeatIndex: 0 },
        seats,
      ),
    ).toBe('Winner seat 0 Ada');
    expect(
      finishedLine(
        { ...playState(null), phase: 'finished', winnerSeatIndex: null },
        seats,
      ),
    ).toBe('Tie');
    expect(finishedLine(playState(0), seats)).toBeNull();
  });
});
