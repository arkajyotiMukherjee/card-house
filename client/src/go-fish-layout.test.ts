import { describe, expect, it } from 'vitest';
import type { GoFishState } from '../../src/shared/games/go-fish';
import { HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import {
  BOOK_ART_W,
  BOOK_STEP,
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
import {
  fanCardRect,
  opponentNameAnchor,
  rectsOverlap,
  seatFan,
  seatPlateWidth,
} from './table-presentation';

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

  it('keeps other books and ask chips off the bottom hand', () => {
    const origin = opponentBookOrigin(780, 310, 2, 'Bea');
    const books = bookSlots(origin.x, origin.y, 2);
    expect(books.every((slot) => slot.y < HAND_Y - 40)).toBe(true);
    const ask = askButtonBox(780, 310, 'Bea');
    expect(ask.y + ask.h).toBeLessThan(HAND_Y - 40);
    expect(askSeat('ask:1')).toBe(1);
    expect(askSeat('AS')).toBeNull();
  });

  it('puts books inward of the fan label and the ask chip in the gap', () => {
    for (const seat of [
      { x: 780, y: 310, name: 'Bea' },
      { x: 180, y: 310, name: 'Bea' },
      { x: 480, y: 72, name: 'Bea' },
    ]) {
      const label = opponentNameAnchor(seat.x, seat.y, seat.name);
      const plate = {
        x: label.x,
        y: label.y,
        w: seatPlateWidth(seat.name),
        h: 20,
      };
      const origin = opponentBookOrigin(seat.x, seat.y, 3, seat.name);
      const books = bookSlots(origin.x, origin.y, 3);
      const fan = seatFan(seat.x, seat.y, 7, seat.name);
      const ask = askButtonBox(seat.x, seat.y, seat.name);
      expect(rectsOverlap(ask, plate)).toBe(false);
      for (const slot of books) {
        const book = {
          x: slot.x - BOOK_ART_W / 2,
          y: slot.y - 16,
          w: BOOK_ART_W,
          h: 32,
        };
        expect(rectsOverlap(book, plate)).toBe(false);
        for (const card of fan) {
          expect(rectsOverlap(book, fanCardRect(card))).toBe(false);
        }
      }
      for (const card of fan) {
        expect(rectsOverlap(ask, fanCardRect(card))).toBe(false);
      }
      expect(ask.y).toBeGreaterThan(label.y);
    }
    expect(BOOK_STEP).toBeGreaterThan(0);
  });

  it('keeps a long row of books on the screen', () => {
    const origin = opponentBookOrigin(780, 310, 13, 'Bea');
    const last = bookSlots(origin.x, origin.y, 13).at(-1);
    expect((last?.x ?? 0) + BOOK_ART_W / 2).toBeLessThanOrEqual(960);
    expect(
      (bookSlots(origin.x, origin.y, 13)[0]?.x ?? 0) - BOOK_ART_W / 2,
    ).toBeGreaterThanOrEqual(0);
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
