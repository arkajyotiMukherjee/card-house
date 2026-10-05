// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as ex from 'excalibur';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { TABLE_HEIGHT, TABLE_WIDTH } from './sheets';
import { TableAtlas, type TableStyle } from './table-atlas';

// happy-dom replaces URL, so fileURLToPath cannot resolve these assets.
function assetPath(publicPath: string): string {
  const cwd = process.cwd();
  const root = basename(cwd) === 'client' ? cwd : join(cwd, 'client');
  return join(root, 'public', publicPath.replace(/^\//, ''));
}

function spritePixels(sprite: ex.Sprite): Buffer {
  const png = PNG.sync.read(readFileSync(assetPath(sprite.image.path)));
  expect(png.width).toBe(TABLE_WIDTH);
  expect(png.height).toBe(TABLE_HEIGHT);
  return png.data;
}

describe('TableAtlas', () => {
  const atlas = new TableAtlas();

  it('returns distinct sprites for green, purple, and red', () => {
    const styles: TableStyle[] = ['green', 'purple', 'red'];
    const sprites = styles.map((style) => atlas.sprite(style));
    const paths = [
      '/assets/table-green.png',
      '/assets/table-purple.png',
      '/assets/table-red.png',
    ];

    expect(sprites).toHaveLength(3);
    sprites.forEach((sprite, index) => {
      expect(sprite).toBeInstanceOf(ex.Sprite);
      expect(sprite.image.path).toBe(paths[index]);
      expect(sprite.sourceView).toEqual({
        x: 0,
        y: 0,
        width: TABLE_WIDTH,
        height: TABLE_HEIGHT,
      });
      expect(sprite.width).toBe(TABLE_WIDTH);
      expect(sprite.height).toBe(TABLE_HEIGHT);
    });

    const pixels = sprites.map((sprite) => spritePixels(sprite));
    const [green, purple, red] = pixels;
    if (!green || !purple || !red) {
      throw new Error('expected a pixel buffer for each table');
    }
    expect(green.equals(purple)).toBe(false);
    expect(green.equals(red)).toBe(false);
    expect(purple.equals(red)).toBe(false);
    expect(green.some((byte) => byte !== 0)).toBe(true);
    expect(purple.some((byte) => byte !== 0)).toBe(true);
    expect(red.some((byte) => byte !== 0)).toBe(true);
  });
});
