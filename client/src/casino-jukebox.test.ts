import { expect, it } from 'vitest';
import {
  floorDirectionPath,
  floorPath,
  floorRows,
  floorServiceAt,
  JUKEBOX,
  RECEPTION,
  SPAWN,
  walkable,
} from '../../src/shared/casino-floor';
import { CasinoJukebox } from './casino-jukebox';
import { CASINO_RECORDS } from './game-music';

it('shows services at their approach tiles and leaves the aisle clear', () => {
  expect(floorServiceAt(RECEPTION)).toBe('reception');
  expect(floorServiceAt({ x: RECEPTION.x - 2, y: RECEPTION.y })).toBe(
    'reception',
  );
  expect(
    floorServiceAt({ x: RECEPTION.x, y: RECEPTION.y + 1 }),
  ).toBeUndefined();
  expect(floorServiceAt(JUKEBOX)).toBe('jukebox');
  expect(floorServiceAt(SPAWN)).toBeUndefined();
});

it('offers jukebox controls within two tiles from every walkable side', () => {
  for (const point of [
    { x: 1, y: 11 },
    { x: 5, y: 11 },
    { x: 2, y: 8 },
    { x: 2, y: 14 },
    { x: 4, y: 13 },
  ]) {
    expect(floorServiceAt(point)).toBe('jukebox');
  }
  for (const point of [
    { x: 0, y: 11 },
    { x: 6, y: 11 },
    { x: 2, y: 7 },
    { x: 2, y: 15 },
    { x: 5, y: 14 },
    { x: 2, y: 12 },
  ]) {
    expect(floorServiceAt(point)).toBeUndefined();
  }
});

it('blocks walking through the cabinet and lets old positions walk out', () => {
  const rows = floorRows(0);
  const slots = new Set<number>();
  const rear = { x: 2, y: 9 };
  for (const x of [2, 3]) {
    for (const y of [10, 11, 12]) {
      const point = { x, y };
      expect(walkable(point, rows)).toBe(false);
      expect(floorPath(rear, point, rows)).toEqual([]);
      expect(floorPath(point, JUKEBOX, rows).at(-1)).toEqual(JUKEBOX);
    }
  }
  expect(floorDirectionPath(rear, { x: 0, y: 1 }, rows, slots)).toEqual([]);
  expect(
    floorDirectionPath({ x: 2, y: 11 }, { x: -1, y: 0 }, rows, slots),
  ).toEqual([{ x: 1, y: 11 }]);
  const path = floorPath(rear, JUKEBOX, rows);
  expect(path.at(-1)).toEqual(JUKEBOX);
  expect(path.every((point) => walkable(point, rows))).toBe(true);
});

it('slides records from the chosen side and respects reduced motion', () => {
  const deck = new CasinoJukebox();
  deck.step(1, 1000);
  expect(deck.slides(1120, false)).toEqual([
    { index: 0, offset: -0.5 },
    { index: 1, offset: 0.5 },
  ]);
  deck.step(-1, 1300);
  expect(deck.slides(1420, false)).toEqual([
    { index: 1, offset: 0.5 },
    { index: 0, offset: -0.5 },
  ]);
  expect(deck.slides(1420, true)).toEqual([{ index: 0, offset: 0 }]);
});

it('wraps the catalog and keeps each player’s playback state independent', () => {
  const first = new CasinoJukebox();
  const second = new CasinoJukebox();
  first.playing = false;
  first.step(-1, 1000);
  expect(first.index).toBe(CASINO_RECORDS.length - 1);
  expect(first.playing).toBe(false);
  expect(second.index).toBe(0);
  expect(second.playing).toBe(true);
  first.step(1, 1300);
  expect(first.index).toBe(0);
});
