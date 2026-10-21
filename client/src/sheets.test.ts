import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  ACE_HEART,
  BLANK_HEART,
  CARD_SIZE,
  HEARTS_COLUMNS,
  HEARTS_ROWS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NUMBER_HEART,
  cellRect,
  coverViewport,
  fitViewport,
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

describe('cover viewport', () => {
  it('covers a wide window on both edges', () => {
    const covered = coverViewport(1600, 700);
    expect(covered.width).toBeGreaterThanOrEqual(1600);
    expect(covered.height).toBeGreaterThanOrEqual(700);
    expect(covered.width / LOGICAL_WIDTH).toBeCloseTo(
      covered.height / LOGICAL_HEIGHT,
      5,
    );
  });

  it('covers a tall window without side bars', () => {
    const covered = coverViewport(800, 900);
    expect(covered.width).toBeGreaterThanOrEqual(800);
    expect(covered.height).toBeGreaterThanOrEqual(900);
  });

  it('matches a 16:9 window', () => {
    expect(coverViewport(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });
});

describe('hearts sheet', () => {
  const png = PNG.sync.read(readFileSync(sheetPath));

  it('slices into 64×64 cells', () => {
    expect(CARD_SIZE).toBe(64);
    expect(png.width).toBe(HEARTS_COLUMNS * CARD_SIZE);
    expect(png.height).toBe(HEARTS_ROWS * CARD_SIZE);
    expect(png.width % CARD_SIZE).toBe(0);
    expect(png.height % CARD_SIZE).toBe(0);
    const ace = cellRect(ACE_HEART);
    expect(ace).toEqual({ x: 64, y: 0, width: 64, height: 64 });
  });

  it('uses the Ace cell rather than the blank cell', () => {
    expect(sameCell(ACE_HEART, BLANK_HEART)).toBe(false);
    const blank = cellBytes(png, BLANK_HEART.col, BLANK_HEART.row);
    const ace = cellBytes(png, ACE_HEART.col, ACE_HEART.row);
    const number = cellBytes(png, NUMBER_HEART.col, NUMBER_HEART.row);
    expect(ace.equals(blank)).toBe(false);
    expect(number.equals(blank)).toBe(false);
    expect(number.equals(ace)).toBe(false);
    expect(ace.some((byte) => byte !== 0)).toBe(true);
  });
});

describe('fit viewport', () => {
  it('keeps the whole frame on a short phone where cover would crop it', () => {
    const covered = coverViewport(844, 390);
    expect(covered.height).toBeGreaterThan(390);
    const fitted = fitViewport(844, 390);
    expect(fitted.height).toBeLessThanOrEqual(390);
    expect(fitted.width).toBeLessThanOrEqual(844);
    expect(fitted.width / fitted.height).toBeCloseTo(
      LOGICAL_WIDTH / LOGICAL_HEIGHT,
      1,
    );
    expect(fitted.top).toBe(0);
    expect(fitted.left).toBe(Math.floor((844 - fitted.width) / 2));
  });

  it('stays inside the safe-area insets', () => {
    const insets = { top: 0, right: 47, bottom: 21, left: 47 };
    const fitted = fitViewport(844, 390, insets);
    expect(fitted.left).toBeGreaterThanOrEqual(insets.left);
    expect(fitted.left + fitted.width).toBeLessThanOrEqual(844 - insets.right);
    expect(fitted.top).toBeGreaterThanOrEqual(insets.top);
    expect(fitted.top + fitted.height).toBeLessThanOrEqual(390 - insets.bottom);
  });

  it('letterboxes the long edge of a tall area', () => {
    const fitted = fitViewport(400, 900);
    expect(fitted.width).toBe(400);
    expect(fitted.top).toBeGreaterThan(0);
  });

  it('falls back to the logical size for an empty area', () => {
    expect(fitViewport(0, 0)).toEqual({
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      left: 0,
      top: 0,
    });
  });
});
