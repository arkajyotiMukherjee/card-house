import {
  CRAZY_EIGHTS_RANKS,
  CRAZY_EIGHTS_SUITS,
  CRAZY_EIGHTS_SUIT_NAMES,
  rankOfCard,
  type CrazyEightsSuit,
} from '../../src/shared/games/crazy-eights';

export const CRAZY_EIGHTS_PUBLIC_SCALE = 1.4;
export const CRAZY_EIGHTS_STOCK = { x: 356, y: 338 };
export const CRAZY_EIGHTS_DISCARD = { x: 548, y: 338 };
export const CRAZY_EIGHTS_ACTION = { x: 752, y: 462, w: 184, h: 44 };

export function orderedCrazyEightsHand(hand: readonly string[]): string[] {
  return [...hand].sort(
    (a, b) =>
      CRAZY_EIGHTS_RANKS.indexOf(rankOfCard(a)!) -
        CRAZY_EIGHTS_RANKS.indexOf(rankOfCard(b)!) || a.localeCompare(b),
  );
}
export function crazyEightsSuitBoxes(): {
  suit: CrazyEightsSuit;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  return CRAZY_EIGHTS_SUITS.map((suit, index) => ({
    suit,
    label: CRAZY_EIGHTS_SUIT_NAMES[suit],
    x: 264 + (index % 2) * 224,
    y: 300 + Math.floor(index / 2) * 56,
    w: 208,
    h: 44,
  }));
}
