import { describe, expect, it } from 'vitest';
import { BLUFF_RANKS, type BluffState } from '../../src/shared/games/bluff';
import {
  bluffBackSlots,
  handPageSize,
  bluffControlBoxes,
  PILE_Y,
  handPositions,
  rankCallButtons,
  BLUFF_PLAY_BUTTON,
  BLUFF_CHALLENGE_BUTTON,
  BLUFF_PASS_BUTTON,
  HAND_NEXT,
  HAND_PREV,
  pilePositions,
} from './bluff-classic-layout';
import { classicSeats } from './classic-table-design';
import { inspectionPose } from './hand-hover';
import { handCardScale } from './card-sizing';
import { rectsOverlap } from './table-presentation';
const seats = Array.from({ length: 6 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Johnson',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Bluff composition', () => {
  it('uses extra width for cards without shrinking them or overlapping navigation and controls', () => {
    for (const mobile of [false, true])
      for (const gutter of [0, 104, 240]) {
        expect(handPageSize(9, mobile, gutter)).toBeGreaterThanOrEqual(9);
        for (const count of [9, 25, 54]) {
          const capacity = handPageSize(count, mobile, gutter),
            visible = Math.min(count, capacity);
          const hand = handPositions(visible, mobile),
            lift = inspectionPose(0, mobile, false, true).lift,
            scale = handCardScale(mobile);
          const paged = count > capacity;
          for (const card of hand) {
            expect(card.y - lift).toBe(484);
            expect(card.x - 20 * scale).toBeGreaterThan(
              (paged ? HAND_PREV.x + HAND_PREV.w : 200) - gutter,
            );
            expect(card.x + 20 * scale).toBeLessThan(
              (paged ? HAND_NEXT.x : 752) + gutter,
            );
          }
        }
        expect(handPageSize(54, mobile, gutter)).toBeLessThan(54);
      }
  });
  it('keeps one, two and three legal actions in a compact right-hand column', () => {
    for (const count of [1, 2, 3]) {
      const boxes = bluffControlBoxes(count);
      expect(boxes).toHaveLength(count);
      for (const [index, box] of boxes.entries()) {
        expect(box.x).toBeGreaterThanOrEqual(752);
        expect(box.x + box.w).toBeLessThanOrEqual(936);
        expect(box.y + box.h).toBeLessThanOrEqual(532);
        expect(box.h).toBeGreaterThanOrEqual(40);
        for (const other of boxes.slice(index + 1))
          expect(rectsOverlap(box, other)).toBe(false);
      }
    }
    expect(PILE_Y - 27 - 276).toBeGreaterThanOrEqual(16);
  });
  it('keeps all rank choices separate, reachable, and outside the hand and action controls', () => {
    const choices = rankCallButtons();
    expect(choices.map((choice) => choice.rank)).toEqual(BLUFF_RANKS);
    for (const [index, box] of choices.entries()) {
      expect(box.h).toBeGreaterThanOrEqual(44);
      for (const other of [
        ...choices.slice(index + 1),
        BLUFF_PLAY_BUTTON,
        BLUFF_PASS_BUTTON,
        BLUFF_CHALLENGE_BUTTON,
      ])
        expect(rectsOverlap(box, other)).toBe(false);
      expect(box.y + box.h).toBeLessThan(436);
    }
  });
  it('caps opponent backs independently of a growing private hand, including spectators', () => {
    const state = {
      hands: Object.fromEntries(
        seats.map((seat) => [
          String(seat.seatIndex),
          Array(54).fill('private'),
        ]),
      ),
    } as unknown as BluffState;
    for (const spectator of [false, true]) {
      const people = seats.map((seat) => ({
        ...seat,
        self: !spectator && seat.self,
      }));
      const backs = bluffBackSlots(people, state);
      expect(backs).toHaveLength((spectator ? 6 : 5) * 4);
      for (const box of classicSeats(people)) {
        const cards = backs.filter((card) =>
          card.key.startsWith(`${box.seat.seatIndex}:`),
        );
        expect(cards).toHaveLength(4);
        expect(Math.max(...cards.map((card) => card.y + 28))).toBeLessThan(
          box.y - 14,
        );
      }
    }
    expect(pilePositions(54)).toHaveLength(8);
  });
});
