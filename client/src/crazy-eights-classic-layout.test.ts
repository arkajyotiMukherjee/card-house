import { describe, expect, it } from 'vitest';
import {
  crazyEightsSuitBoxes,
  orderedCrazyEightsHand,
  CRAZY_EIGHTS_STOCK,
  CRAZY_EIGHTS_DISCARD,
  CRAZY_EIGHTS_PUBLIC_SCALE,
  CRAZY_EIGHTS_ACTION,
} from './crazy-eights-classic-layout';
import { rectsOverlap } from './table-presentation';

describe('classic Crazy Eights composition', () => {
  it('keeps four wild-eight choices clear of public text, each other and the private hand', () => {
    const boxes = crazyEightsSuitBoxes();
    expect(new Set(boxes.map((box) => box.suit)).size).toBe(4);
    for (const [index, box] of boxes.entries()) {
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(292);
      expect(box.y + box.h).toBeLessThan(436);
      expect(rectsOverlap(box, CRAZY_EIGHTS_ACTION)).toBe(false);
      for (const other of boxes.slice(index + 1))
        expect(rectsOverlap(box, other)).toBe(false);
    }
  });
  it('leaves readable stock/discard faces separate and clear of state/caption surfaces', () => {
    for (const point of [CRAZY_EIGHTS_STOCK, CRAZY_EIGHTS_DISCARD]) {
      expect(point.y - 28 * CRAZY_EIGHTS_PUBLIC_SCALE).toBeGreaterThanOrEqual(
        292,
      );
      expect(point.y + 28 * CRAZY_EIGHTS_PUBLIC_SCALE).toBeLessThan(386);
    }
    expect(CRAZY_EIGHTS_DISCARD.x - CRAZY_EIGHTS_STOCK.x).toBeGreaterThan(
      80 * CRAZY_EIGHTS_PUBLIC_SCALE,
    );
  });
  it('groups a growing hand by stable rank without changing server order', () => {
    const hand = ['KH', '8S', 'AC', '8D', '10S', '2C'];
    expect(orderedCrazyEightsHand(hand)).toEqual([
      'AC',
      '2C',
      '8D',
      '8S',
      '10S',
      'KH',
    ]);
    expect(hand).toEqual(['KH', '8S', 'AC', '8D', '10S', '2C']);
  });
});
