import type { BluffState } from '../../src/shared/games/bluff';
import { BLUFF_RANKS } from '../../src/shared/games/bluff';
import { classicBackSlots } from './classic-card-layout';
export {
  HAND_PREV,
  HAND_NEXT,
  handPageSize,
  handPositions,
  classicControlBoxes as bluffControlBoxes,
} from './classic-card-layout';
import type { DriverSeat } from './game-driver';

export const BLUFF_PLAY_BUTTON = { x: 752, y: 442, w: 88, h: 40 };
export const BLUFF_PASS_BUTTON = { x: 848, y: 442, w: 88, h: 40 };
export const BLUFF_CHALLENGE_BUTTON = { x: 752, y: 490, w: 184, h: 40 };
export const PILE_X = 480;
export const PILE_Y = 322;

export function pilePositions(count: number): { x: number; y: number }[] {
  const shown = Math.min(8, count);
  return Array.from({ length: shown }, (_, index) => ({
    x: PILE_X + (index - (shown - 1) / 2) * 20,
    y: PILE_Y,
  }));
}
export function rankCallButtons(): {
  rank: (typeof BLUFF_RANKS)[number];
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  return BLUFF_RANKS.map((rank, index) => ({
    rank,
    x: 260 + (index % 7) * 64,
    y: 274 + Math.floor(index / 7) * 54,
    w: 56,
    h: 44,
  }));
}
/** Bluff keeps its state adapter; shared geometry has no game-rule dependency. */
export function bluffBackSlots(
  seats: readonly DriverSeat[],
  state: BluffState,
): ReturnType<typeof classicBackSlots> {
  return classicBackSlots(seats, state.hands);
}
