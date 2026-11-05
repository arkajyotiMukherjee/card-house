import { describe, expect, it } from 'vitest';
import type { RummyState } from '../../src/shared/games/rummy';
import { CARD_DRAW, HAND_Y } from './bluff-layout';
import { seatAnchorsFor } from './game-scene';
import {
  belowFelt,
  fanCardRect,
  insideCluster,
  seatFan,
} from './table-presentation';
import {
  DISCARD_BUTTON,
  DISCARD_X,
  DISCARD_Y,
  DRAW_DISCARD_BUTTON,
  DRAW_STOCK_BUTTON,
  HINT_X,
  HINT_Y,
  MELD_BUTTON,
  STOCK_X,
  discardPositions,
  finishedLine,
  legalCard,
  meldLayout,
  stockPosition,
} from './rummy-layout';

function playState(turnSeatIndex: number | null): RummyState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD'] },
    stock: ['2C'],
    discardPile: ['3D'],
    melds: [],
    turnSeatIndex,
    drawn: false,
    scores: {},
    winnerSeatIndex: null,
  };
}

describe('rummy layout', () => {
  it('puts the discard pile and the stock in the center', () => {
    expect(discardPositions(1)).toEqual([{ x: DISCARD_X, y: DISCARD_Y }]);
    const pile = discardPositions(3);
    expect(pile[0]?.x).toBeLessThan(pile[1]?.x ?? 0);
    expect(pile.every((slot) => slot.y === DISCARD_Y)).toBe(true);
    expect(stockPosition().x).toBe(STOCK_X);
    expect(stockPosition().x).toBeGreaterThan(DISCARD_X);
  });

  describe.each([
    { label: 'first meld', melds: [4], strict: true },
    { label: 'two melds', melds: [4, 3], strict: false },
  ])('$label', ({ melds, strict }) => {
    it('stays on the canvas and clear of the rest of the table', () => {
      interface Box {
        name: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }
      const card = (name: string, x: number, y: number): Box => ({
        name,
        x: x - CARD_DRAW / 2,
        y: y - CARD_DRAW / 2,
        w: CARD_DRAW,
        h: CARD_DRAW,
      });
      const overlaps = (a: Box, b: Box): boolean =>
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h;
      const seats = seatAnchorsFor(6);
      const fixed: Box[] = [
        { name: 'hud', x: 668, y: 16, w: 240, h: 52 },
        { name: 'hint', x: HINT_X, y: HINT_Y, w: 120, h: 22 },
        { name: 'handStrip', x: 16, y: HAND_Y - CARD_DRAW / 2, w: 720, h: 64 },
        card('stock', stockPosition().x, stockPosition().y),
      ];
      for (const [name, button] of [
        ['draw', DRAW_STOCK_BUTTON],
        ['take', DRAW_DISCARD_BUTTON],
        ['meld', MELD_BUTTON],
        ['discard', DISCARD_BUTTON],
      ] as const) {
        fixed.push({ name, ...button });
      }
      discardPositions(5).forEach((slot, index) => {
        fixed.push(card(`discard${index}`, slot.x, slot.y));
      });
      seats.forEach((seat, index) => {
        fixed.push({
          name: `plate${index}`,
          x: seat.x - 30,
          y: seat.y,
          w: 60,
          h: 20,
        });
        if (index > 0) {
          seatFan(seat.x, seat.y, 7, 'Seat').forEach((slot, back) => {
            const rect = fanCardRect(slot);
            fixed.push({
              name: `back${index}.${back}`,
              x: rect.x,
              y: rect.y,
              w: rect.w,
              h: rect.h,
            });
          });
        }
      });
      const problems: string[] = [];
      const placed: Box[][] = [];
      seats.forEach((seat, index) => {
        const layout = meldLayout(seat.x, seat.y, index === 0, melds);
        const boxes: Box[] = [];
        layout.forEach((slots, meld) => {
          slots.forEach((slot, cardIndex) => {
            boxes.push(
              card(`seat${index}.m${meld}.c${cardIndex}`, slot.x, slot.y),
            );
          });
        });
        placed.push(boxes);
        for (const box of boxes) {
          if (
            box.x < 0 ||
            box.y < 0 ||
            box.x + box.w > 960 ||
            box.y + box.h > 540
          ) {
            problems.push(`${box.name} leaves the canvas`);
          }
          for (const other of fixed) {
            const ownPlate = other.name === `plate${index}`;
            const soft = !strict && other.name.startsWith('back');
            if (!ownPlate && !soft && overlaps(box, other)) {
              problems.push(`${box.name} covers ${other.name}`);
            }
            if (ownPlate && overlaps(box, other)) {
              problems.push(`${box.name} covers its own seat plate`);
            }
          }
        }
      });
      placed.forEach((boxes, a) => {
        placed.slice(a + 1).forEach((others) => {
          for (const box of boxes) {
            for (const other of others) {
              if (overlaps(box, other)) {
                problems.push(`${box.name} covers ${other.name}`);
              }
            }
          }
        });
      });
      expect(problems).toEqual([]);
    });
  });

  it('stacks overlapping meld rows so the nearest row is drawn on top', () => {
    const mine = meldLayout(480, 456, true, [3, 3, 3, 3, 3]);
    expect(mine[0]?.[0]?.y).toBeLessThan(HAND_Y - CARD_DRAW);
    const rows = mine.map((slots) => slots[0]);
    const bottom = rows.reduce((a, b) => ((a?.y ?? 0) > (b?.y ?? 0) ? a : b));
    for (const slot of rows) {
      expect(bottom?.z ?? 0).toBeGreaterThanOrEqual(slot?.z ?? 0);
    }
    const first = meldLayout(780, 310, false, [4])[0];
    expect(first).toHaveLength(4);
    expect(first?.[0]?.x).toBeLessThan(first?.[1]?.x ?? 0);
    expect(first?.[0]?.z).toBeLessThan(first?.[1]?.z ?? 0);
  });

  it('keeps draw, meld, and discard in the cluster', () => {
    for (const button of [
      DRAW_STOCK_BUTTON,
      DRAW_DISCARD_BUTTON,
      MELD_BUTTON,
      DISCARD_BUTTON,
    ]) {
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
    }
  });

  it('lifts a card only when it is in your hand on your turn', () => {
    const state = playState(0);
    expect(legalCard(state, 0, 'AS')).toBe(true);
    expect(legalCard(state, 0, 'KD')).toBe(false);
    expect(legalCard(playState(1), 0, 'AS')).toBe(false);
    expect(legalCard({ ...state, phase: 'lobby' }, 0, 'AS')).toBe(false);
  });

  it('names the subscribed winner seat when the rules finish', () => {
    const state = playState(null);
    state.phase = 'finished';
    state.winnerSeatIndex = 0;
    expect(finishedLine(state, [{ seatIndex: 0, name: 'Ada' }])).toBe(
      'Ada wins',
    );
    expect(finishedLine({ ...state, phase: 'play' }, [])).toBeNull();
  });
});
