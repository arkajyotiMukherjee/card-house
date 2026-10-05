import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  ACE_HEART,
  BLANK_HEART,
  CARD_SIZE,
  cellRect,
  sameCell,
} from './sheets';

const sheetPath = fileURLToPath(
  new URL('../public/assets/cards-hearts.png', import.meta.url),
);

function cellBytes(png: PNG, col: number, row: number): Buffer {
  const out = Buffer.alloc(CARD_SIZE * CARD_SIZE * 4);
  for (let y = 0; y < CARD_SIZE; y += 1) {
    const src = ((row * CARD_SIZE + y) * png.width + col * CARD_SIZE) * 4;
    png.data.copy(out, y * CARD_SIZE * 4, src, src + CARD_SIZE * 4);
  }
  return out;
}

describe('CardAtlas', () => {
  const png = PNG.sync.read(readFileSync(sheetPath));

  it('returns the Ace of hearts from the Ace cell, not the blank cell', async () => {
    const browser = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
      document?: Document;
      Image?: typeof Image;
    };
    browser.window ??= {
      devicePixelRatio: 1,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => undefined,
      requestIdleCallback: () => 0,
      cancelIdleCallback: () => undefined,
      AudioContext: class AudioContext {},
    } as unknown as Window & typeof globalThis;
    browser.document ??= {
      createElement: () => ({ getContext: () => null }),
    } as unknown as Document;
    browser.Image ??= class Image {
      src = '';
      naturalWidth = 0;
      naturalHeight = 0;
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute(): void {}
      getAttribute(): null {
        return null;
      }
      addEventListener(): void {}
      removeEventListener(): void {}
    } as unknown as typeof Image;

    const { CardAtlas } = await import('./card-atlas');
    const ex = await import('excalibur');
    const atlas = new CardAtlas(
      new ex.ImageSource('/assets/cards-hearts.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
      new ex.ImageSource('/assets/card-back-01.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
    );

    const ace = atlas.sprite({ rank: 'A', suit: 'hearts' });
    const aceCell = {
      col: ace.sourceView.x / CARD_SIZE,
      row: ace.sourceView.y / CARD_SIZE,
    };

    expect(ace.sourceView).toEqual(cellRect(ACE_HEART));
    expect(ace.sourceView).toEqual({ x: 64, y: 0, width: 64, height: 64 });
    expect(ace.width).toBe(64);
    expect(ace.height).toBe(64);
    expect(sameCell(aceCell, BLANK_HEART)).toBe(false);
    expect(sameCell(aceCell, ACE_HEART)).toBe(true);

    const blank = cellBytes(png, BLANK_HEART.col, BLANK_HEART.row);
    const aceBytes = cellBytes(png, aceCell.col, aceCell.row);
    expect(aceBytes.equals(blank)).toBe(false);
    expect(aceBytes.some((byte) => byte !== 0)).toBe(true);

    const back = atlas.back();
    expect(back).toBeInstanceOf(ex.Sprite);
    expect(back.sourceView).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });
});
