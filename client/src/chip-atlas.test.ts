import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ex from 'excalibur';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { CHIP_HEIGHT, CHIP_WIDTH, type PixelRect } from './sheets';
import { CHIP_COLORS, ChipAtlas, chipRegion } from './chip-atlas';

const sheetPath = fileURLToPath(
  new URL('../public/assets/chips-no-outline.png', import.meta.url),
);

function regionBytes(png: PNG, rect: PixelRect): Buffer {
  const out = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const src = ((rect.y + y) * png.width + rect.x) * 4;
    png.data.copy(out, y * rect.width * 4, src, src + rect.width * 4);
  }
  return out;
}

describe('ChipAtlas', () => {
  const png = PNG.sync.read(readFileSync(sheetPath));
  const atlas = new ChipAtlas(
    new ex.ImageSource('/assets/chips-no-outline.png', {
      filtering: ex.ImageFiltering.Pixel,
    }),
  );

  it('returns two denominations from different regions of the sheet', () => {
    const green = atlas.sprite(25);
    const red = atlas.sprite('red');

    expect(green.sourceView).toEqual(chipRegion(25));
    expect(red.sourceView).toEqual(chipRegion('red'));
    expect(green.sourceView.x).not.toBe(red.sourceView.x);
    expect(
      regionBytes(png, green.sourceView).equals(
        regionBytes(png, red.sourceView),
      ),
    ).toBe(false);
    expect(regionBytes(png, green.sourceView).some((byte) => byte !== 0)).toBe(
      true,
    );
    expect(regionBytes(png, red.sourceView).some((byte) => byte !== 0)).toBe(
      true,
    );
  });

  it('gives every color its own column and a stack under the face', () => {
    const faces = CHIP_COLORS.map((color) => atlas.sprite(color).sourceView);
    const xs = faces.map((face) => face.x);
    expect(new Set(xs).size).toBe(CHIP_COLORS.length);

    for (const color of CHIP_COLORS) {
      const face = atlas.sprite(color).sourceView;
      const stack = atlas.stackSprite(color).sourceView;
      expect(face.y).not.toBe(stack.y);
      expect(face.x).toBe(stack.x);
      expect(face.x + face.width).toBeLessThanOrEqual(
        (CHIP_COLORS.indexOf(color) + 1) * CHIP_WIDTH,
      );
      expect(stack.y + stack.height).toBeLessThanOrEqual(CHIP_HEIGHT);
      expect(regionBytes(png, face).equals(regionBytes(png, stack))).toBe(
        false,
      );
    }
  });
});
