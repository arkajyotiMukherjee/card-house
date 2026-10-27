import { describe, expect, it } from 'vitest';
import {
  QUEEN_OF_SPADES,
  type HeartsState,
} from '../../src/shared/games/hearts';
import { HAND_Y, TABLE_CENTER } from './bluff-layout';
import {
  CARD_DRAW,
  PASS_BUTTON,
  PLAY_BUTTON,
  cardLift,
  faceForCard,
  finishedLine,
  legalCard,
  penaltyPositions,
  pointCards,
  trickPosition,
} from './hearts-layout';
import {
  belowFelt,
  fanCardRect,
  insideCluster,
  rectsOverlap,
  seatFan,
} from './table-presentation';

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

  it('keeps a played card off the fan of the seat it came from', () => {
    for (const seat of [
      { x: 780, y: 310 },
      { x: 700, y: 128 },
      { x: 480, y: 72 },
    ]) {
      const slot = trickPosition(seat.x, seat.y);
      const trick = {
        x: slot.x - CARD_DRAW / 2,
        y: slot.y - CARD_DRAW / 2,
        w: CARD_DRAW,
        h: CARD_DRAW,
      };
      const fan = seatFan(seat.x, seat.y, 13, 'Seat');
      expect(fan.length).toBeGreaterThan(0);
      expect(fan.every((card) => card.rotation !== 0)).toBe(true);
      for (const card of fan) {
        expect(rectsOverlap(trick, fanCardRect(card))).toBe(false);
      }
    }
  });

  it('keeps played cards from different seats from covering each other', () => {
    const slots = [
      trickPosition(780, 310),
      trickPosition(700, 128),
      trickPosition(480, 72),
      trickPosition(480, 456),
    ];
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        const apart = Math.max(
          Math.abs((slots[a]?.x ?? 0) - (slots[b]?.x ?? 0)),
          Math.abs((slots[a]?.y ?? 0) - (slots[b]?.y ?? 0)),
        );
        expect(apart).toBeGreaterThanOrEqual(CARD_DRAW);
      }
    }
  });

  it('keeps an opponent penalty row off their backs and on screen', () => {
    for (const seat of [
      { x: 780, y: 310 },
      { x: 700, y: 128 },
      { x: 480, y: 72 },
    ]) {
      const row = penaltyPositions(14, seat.x, seat.y, false);
      const backs = seatFan(seat.x, seat.y, 13, 'Seat');
      expect(row).toHaveLength(14);
      for (const slot of row) {
        expect(slot.x - CARD_DRAW / 2).toBeGreaterThanOrEqual(0);
        expect(slot.x + CARD_DRAW / 2).toBeLessThanOrEqual(960);
        expect(slot.y - CARD_DRAW / 2).toBeGreaterThanOrEqual(0);
        expect(slot.y + CARD_DRAW / 2).toBeLessThanOrEqual(540);
        const penalty = {
          x: slot.x - CARD_DRAW / 2,
          y: slot.y - CARD_DRAW / 2,
          w: CARD_DRAW,
          h: CARD_DRAW,
        };
        for (const back of backs) {
          expect(rectsOverlap(penalty, fanCardRect(back))).toBe(false);
        }
      }
    }
  });

  it('keeps hearts and the queen of spades from a taken trick', () => {
    expect(pointCards(['2C', 'KH', QUEEN_OF_SPADES, 'AD'])).toEqual([
      'KH',
      QUEEN_OF_SPADES,
    ]);
    expect(pointCards([QUEEN_OF_SPADES, '2C', 'KH', '3H'])).toEqual([
      'KH',
      '3H',
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

  it('keeps Pass and Play in the cluster', () => {
    for (const button of [PASS_BUTTON, PLAY_BUTTON]) {
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
    }
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
