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
const diamondsPath = fileURLToPath(
  new URL('../public/assets/cards-diamonds.png', import.meta.url),
);
const jokersPath = fileURLToPath(
  new URL('../public/assets/jokers.png', import.meta.url),
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

    const suited = new CardAtlas(
      new ex.ImageSource('/assets/cards-hearts.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
      new ex.ImageSource('/assets/card-back-01.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
      {
        diamonds: new ex.ImageSource('/assets/cards-diamonds.png', {
          filtering: ex.ImageFiltering.Pixel,
        }),
      },
    );
    const diamondAce = suited.sprite({ rank: 'A', suit: 'diamonds' });
    expect(diamondAce.sourceView).toEqual(cellRect(ACE_HEART));
    const diamonds = PNG.sync.read(readFileSync(diamondsPath));
    const heartBytes = cellBytes(png, ACE_HEART.col, ACE_HEART.row);
    const diamondBytes = cellBytes(diamonds, ACE_HEART.col, ACE_HEART.row);
    expect(diamondBytes.equals(heartBytes)).toBe(false);
    expect(() => suited.sprite({ rank: 'A', suit: 'clubs' })).toThrow(/clubs/);

    const queen = atlas.sprite({ rank: 'Q', suit: 'hearts' });
    const king = atlas.sprite({ rank: 'K', suit: 'hearts' });
    expect(queen.sourceView).toEqual({ x: 192, y: 128, width: 64, height: 64 });
    expect(king.sourceView).toEqual({ x: 0, y: 192, width: 64, height: 64 });
    expect(queen.sourceView).not.toEqual(king.sourceView);
    const queenBytes = cellBytes(png, 3, 2);
    const kingBytes = cellBytes(png, 0, 3);
    expect(queenBytes.equals(kingBytes)).toBe(false);

    const jokerSheet = new ex.ImageSource('/assets/jokers.png', {
      filtering: ex.ImageFiltering.Pixel,
    });
    const withJokers = new CardAtlas(
      new ex.ImageSource('/assets/cards-hearts.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
      new ex.ImageSource('/assets/card-back-01.png', {
        filtering: ex.ImageFiltering.Pixel,
      }),
      {},
      jokerSheet,
    );
    expect(withJokers.joker('red').sourceView).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
    expect(withJokers.joker('black').sourceView).toEqual({
      x: 64,
      y: 0,
      width: 64,
      height: 64,
    });
    const jokers = PNG.sync.read(readFileSync(jokersPath));
    expect(jokers.width).toBe(128);
    expect(jokers.height).toBe(64);
    const redBytes = cellBytes(jokers, 0, 0);
    const blackBytes = cellBytes(jokers, 1, 0);
    expect(redBytes.equals(queenBytes)).toBe(false);
    expect(blackBytes.equals(queenBytes)).toBe(false);
    expect(redBytes.equals(blackBytes)).toBe(false);
  });
});
