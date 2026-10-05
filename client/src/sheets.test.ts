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
  NUMBER_HEART,
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
