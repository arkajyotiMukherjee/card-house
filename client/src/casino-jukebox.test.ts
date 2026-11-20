import { expect, it } from 'vitest';
import {
  floorServiceAt,
  JUKEBOX,
  RECEPTION,
  SPAWN,
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
