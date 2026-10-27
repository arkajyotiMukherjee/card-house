import { describe, expect, it } from 'vitest';
import { BUTTON_HEIGHT } from './button-style';
import { seatAnchorsFor } from './game-scene';
import {
  ACTION_CLUSTER,
  FELT_BOTTOM,
  PICKER_RIGHT,
  PICKER_Y,
  TURN_LINE,
  actionBox,
  belowFelt,
  coversCluster,
  fanCardRect,
  fanEdge,
  fanGapLine,
  insideCluster,
  isGiveUpControl,
  opponentCountAnchor,
  opponentNameAnchor,
  seatFan,
  seatPlateWidth,
} from './table-presentation';

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

describe('table presentation', () => {
  it('keeps seating with you at the bottom and the fourth player at the top', () => {
    const seats = seatAnchorsFor(4);
    expect(seats.map((seat) => fanEdge(seat.x, seat.y))).toEqual([
      'bottom',
      'right',
      'left',
      'top',
    ]);
  });

  it('rotates every opponent fan and leaves the name in the gap', () => {
    const names = ['Ada', 'A very long seat name'];
    for (const seat of seatAnchorsFor(4).slice(1)) {
      for (const name of names) {
        for (const count of [1, 4, 13, 17]) {
          const slots = seatFan(seat.x, seat.y, count, name);
          expect(slots).toHaveLength(count);
          expect(slots.some((slot) => slot.rotation !== 0)).toBe(true);
          const nameAt = opponentNameAnchor(seat.x, seat.y, name);
          const countAt = opponentCountAnchor(seat.x, seat.y, count, name);
          const nameRect = {
            x: nameAt.x,
            y: nameAt.y,
            w: seatPlateWidth(name),
            h: 20,
          };
          const countRect = {
            x: countAt.x,
            y: countAt.y,
            w: `x${count}`.length * 8,
            h: 8,
          };
          const chips = fanGapLine(seat.x, seat.y, name, 'Bet 40', 1);
          const chipRect = {
            x: chips.x,
            y: chips.y,
            w: 'Bet 40'.length * 8,
            h: 8,
          };
          for (const slot of slots) {
            const rect = fanCardRect(slot);
            expect(overlaps(nameRect, rect)).toBe(false);
            expect(overlaps(countRect, rect)).toBe(false);
            expect(overlaps(chipRect, rect)).toBe(false);
          }
        }
      }
    }
  });

  it('keeps the right fan clear of the action cluster', () => {
    const right = seatAnchorsFor(4)[1];
    expect(right).toBeDefined();
    if (!right) {
      return;
    }
    for (let count = 1; count <= 20; count += 1) {
      for (const slot of seatFan(
        right.x,
        right.y,
        count,
        'A very long seat name',
      )) {
        expect(coversCluster(slot)).toBe(false);
      }
    }
  });

  it('puts every action box below the felt, inside the cluster', () => {
    for (let index = 0; index < 5; index += 1) {
      const box = actionBox(index);
      expect(belowFelt(box)).toBe(true);
      expect(insideCluster(box)).toBe(true);
      expect(box.h).toBe(BUTTON_HEIGHT);
      expect(box.y + box.h).toBeLessThanOrEqual(540);
    }
    expect(actionBox(1).y).toBe(actionBox(0).y);
    expect(actionBox(1).x).toBeGreaterThan(actionBox(0).x);
    expect(actionBox(2).y).toBeGreaterThan(actionBox(0).y);
    expect(TURN_LINE.y).toBeLessThan(ACTION_CLUSTER.y);
    expect(TURN_LINE.x).toBe(ACTION_CLUSTER.x);
    expect(PICKER_Y).toBe(FELT_BOTTOM);
    expect(PICKER_RIGHT).toBeLessThan(ACTION_CLUSTER.x);
    expect(isGiveUpControl('Fold')).toBe(true);
    expect(isGiveUpControl('Pass')).toBe(false);
    expect(isGiveUpControl('Check')).toBe(false);
  });
});
