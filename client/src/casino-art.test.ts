import { expect, it } from 'vitest';
import {
  AVATAR_FIELDS,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  type CasinoAvatar,
} from '../../src/shared/casino-avatar';
import { avatarSprite, type Direction } from './casino-art';

function pixels(
  look: CasinoAvatar,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
  progress = 1,
): Uint32Array {
  const buffer = new Uint32Array(16 * 24);
  const renderer = {
    fillStyle: '',
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      const rgb = parseInt(this.fillStyle.slice(1), 16) + 1;
      for (let row = y; row < y + h; row += 1) {
        for (let column = x; column < x + w; column += 1) {
          expect(column).toBeGreaterThanOrEqual(0);
          expect(column).toBeLessThan(16);
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(24);
          buffer[row * 16 + column] = rgb;
        }
      }
    },
  };
  avatarSprite(
    renderer as unknown as CanvasRenderingContext2D,
    0,
    0,
    1,
    look,
    direction,
    frame,
    seated,
    progress,
  );
  return buffer;
}

it('draws a distinct image for every choice in the saved avatar fields', () => {
  for (const field of AVATAR_FIELDS) {
    const variants = AVATAR_OPTIONS[field].map((_, index) =>
      JSON.stringify(pixels({ ...DEFAULT_AVATAR, [field]: index })),
    );
    expect(new Set(variants).size, field).toBe(variants.length);
  }
});

it('keeps the chosen look while changing the stride and lowering into a seat', () => {
  const look = { ...DEFAULT_AVATAR, color: 1, pantsColor: 3, hair: 3 };
  for (const direction of ['down', 'up', 'right'] as const) {
    const idle = pixels(look, direction);
    const seated = pixels(look, direction, 0, true);
    expect(pixels(look, direction, 1)).not.toEqual(pixels(look, direction, 3));
    expect(pixels(look, direction, 0, true, 0)).toEqual(idle);
    expect(pixels(look, direction, 0, true, 0.5)).not.toEqual(seated);
    expect(seated).not.toEqual(idle);
    expect(pixels(look, direction, 3, true)).toEqual(seated);
    expect(seated).not.toEqual(pixels(DEFAULT_AVATAR, direction, 0, true));
  }
});
