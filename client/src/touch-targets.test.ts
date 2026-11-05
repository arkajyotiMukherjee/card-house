import * as ex from 'excalibur';
import { describe, expect, it } from 'vitest';
import { BUTTON_HEIGHT } from './button-style';
import { CHAT_PANEL } from './lobby';
import {
  TOUCH_TARGET,
  hasPointerHandler,
  logicalTouchTarget,
  touchBoxes,
  type TouchBox,
} from './touch-targets';

function overlaps(a: TouchBox, b: TouchBox): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

describe('touch boxes', () => {
  it('preserves 44 screen pixels after scaling and recalculates for rotation', () => {
    expect(logicalTouchTarget(960, 540)).toBe(44);
    expect(logicalTouchTarget(480, 270)).toBe(88);
    const phoneScale = 390 / 540;
    expect(logicalTouchTarget(960 * phoneScale, 390) * phoneScale).toBeCloseTo(
      44,
    );
    expect(logicalTouchTarget(0, 0)).toBe(44);
  });
  it('grows a 28px button to 44px around the same center', () => {
    const [box] = touchBoxes([{ x: 748, y: 448, w: 96, h: BUTTON_HEIGHT }]);
    expect(box).toEqual({ x: 748, y: 440, w: 96, h: TOUCH_TARGET });
  });

  it('grows a narrow button in width too', () => {
    const [box] = touchBoxes([{ x: 420, y: 220, w: 40, h: BUTTON_HEIGHT }]);
    expect(box?.w).toBe(TOUCH_TARGET);
    expect(box?.x).toBe(418);
  });

  it('leaves a box that is already large', () => {
    const big = { x: 10, y: 10, w: 64, h: 64 };
    expect(touchBoxes([big])).toEqual([big]);
  });

  it('splits the gap between stacked buttons instead of overlapping', () => {
    const a = { x: 16, y: 152, w: 128, h: 28 };
    const b = { x: 16, y: 186, w: 128, h: 28 };
    const [ga, gb] = touchBoxes([a, b]);
    if (!ga || !gb) {
      throw new Error('missing boxes');
    }
    expect(overlaps(ga, gb)).toBe(false);
    expect(ga.y + ga.h).toBe(183);
    expect(gb.y).toBe(183);
    expect(ga.y + ga.h).toBeGreaterThanOrEqual(a.y + a.h);
    expect(gb.y).toBeLessThanOrEqual(b.y);
  });

  it('keeps a full 44px when neighbours leave room', () => {
    const [ga, gb] = touchBoxes([
      { x: 204, y: 220, w: 72, h: 28 },
      { x: 204, y: 268, w: 72, h: 28 },
    ]);
    expect(ga?.h).toBe(TOUCH_TARGET);
    expect(gb?.h).toBe(TOUCH_TARGET);
  });

  it('splits side-by-side buttons on the horizontal gap', () => {
    const [left, right] = touchBoxes([
      { x: 420, y: 220, w: 40, h: 28 },
      { x: 468, y: 220, w: 40, h: 28 },
    ]);
    if (!left || !right) {
      throw new Error('missing boxes');
    }
    expect(overlaps(left, right)).toBe(false);
    expect(left.w).toBe(TOUCH_TARGET);
  });

  it('never loses a button face', () => {
    const faces = [
      { x: 700, y: 448, w: 56, h: 28 },
      { x: 764, y: 448, w: 56, h: 28 },
      { x: 700, y: 480, w: 56, h: 28 },
    ];
    const grown = touchBoxes(faces);
    grown.forEach((hit, index) => {
      const face = faces[index];
      if (!face) {
        return;
      }
      expect(hit.x).toBeLessThanOrEqual(face.x);
      expect(hit.y).toBeLessThanOrEqual(face.y);
      expect(hit.x + hit.w).toBeGreaterThanOrEqual(face.x + face.w);
      expect(hit.y + hit.h).toBeGreaterThanOrEqual(face.y + face.h);
    });
    for (let i = 0; i < grown.length; i += 1) {
      for (let j = i + 1; j < grown.length; j += 1) {
        const a = grown[i];
        const b = grown[j];
        if (a && b) {
          expect(overlaps(a, b)).toBe(false);
        }
      }
    }
  });

  it('keeps the lobby chat field and Send apart', () => {
    const [field, send] = touchBoxes([CHAT_PANEL.field, CHAT_PANEL.send]);
    if (!field || !send) {
      throw new Error('missing boxes');
    }
    expect(overlaps(field, send)).toBe(false);
    expect(field.h).toBe(TOUCH_TARGET);
  });
});

describe('pointer handler detection', () => {
  it('sees a pointerup or pointerdown listener and nothing else', () => {
    const plain = new ex.Actor({ width: 10, height: 10 });
    expect(hasPointerHandler(plain)).toBe(false);
    plain.on('pointerenter', () => {});
    expect(hasPointerHandler(plain)).toBe(false);
    plain.on('pointerup', () => {});
    expect(hasPointerHandler(plain)).toBe(true);
    const down = new ex.Actor({ width: 10, height: 10 });
    down.on('pointerdown', () => {});
    expect(hasPointerHandler(down)).toBe(true);
  });
});
