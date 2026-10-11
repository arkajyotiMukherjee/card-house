import { describe, expect, it } from 'vitest';
import { IDLE_BOB_PIXELS, IDLE_CARDS, idleCardPose } from './lobby-ambience';

describe('idle cards', () => {
  it('keeps the cards between the two side panels', () => {
    for (const card of IDLE_CARDS) {
      expect(card.x).toBeGreaterThan(190);
      expect(card.x).toBeLessThan(700 + 1);
    }
  });

  it('moves over time by whole pixels within a small range', () => {
    const card = IDLE_CARDS[0]!;
    const ys = new Set<number>();
    for (let ms = 0; ms < 6400; ms += 100) {
      const pose = idleCardPose(card, ms);
      expect(Number.isInteger(pose.y)).toBe(true);
      expect(Math.abs(pose.y - card.y)).toBeLessThanOrEqual(IDLE_BOB_PIXELS);
      expect(Math.abs(pose.rotation - card.tilt)).toBeLessThan(0.06);
      ys.add(pose.y);
    }
    expect(ys.size).toBeGreaterThan(3);
  });
});
