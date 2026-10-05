import * as ex from 'excalibur';
import { CHIP_WIDTH, type PixelRect } from './sheets';

/**
 * Left-to-right colors on `chips-no-outline.png` (192×44).
 * Each column is one chip. The art does not print a number.
 */
export const CHIP_COLORS = [
  'green',
  'red',
  'blue',
  'yellow',
  'black',
  'white',
] as const;

export type ChipColor = (typeof CHIP_COLORS)[number];

/**
 * Usual table value for that color. Yellow is the 1,000 chip;
 * this sheet has no purple 500.
 */
export const CHIP_VALUES = {
  white: 1,
  red: 5,
  blue: 10,
  green: 25,
  black: 100,
  yellow: 1000,
} as const satisfies Record<ChipColor, number>;

export type ChipValue = (typeof CHIP_VALUES)[ChipColor];

/** A color key or its table value. */
export type ChipDenomination = ChipColor | ChipValue;

const VALUE_COLOR = {
  1: 'white',
  5: 'red',
  10: 'blue',
  25: 'green',
  100: 'black',
  1000: 'yellow',
} as const satisfies Record<ChipValue, ChipColor>;

/** Top-down face, measured inside each 32×44 column. */
const FACE = { x: 8, y: 3, width: 16, height: 16 } as const;

/**
 * Shorter chip and the edge strip drawn under the face.
 * That is the only stack art on this sheet.
 */
const STACK = { x: 8, y: 24, width: 16, height: 17 } as const;

function columnIndex(denomination: ChipDenomination): number {
  const color =
    typeof denomination === 'number' ? VALUE_COLOR[denomination] : denomination;
  const index = CHIP_COLORS.indexOf(color);
  if (index < 0) {
    throw new Error(`Unknown chip denomination: ${String(denomination)}`);
  }
  return index;
}

export function chipRegion(
  denomination: ChipDenomination,
  part: 'face' | 'stack' = 'face',
): PixelRect {
  const local = part === 'face' ? FACE : STACK;
  return {
    x: columnIndex(denomination) * CHIP_WIDTH + local.x,
    y: local.y,
    width: local.width,
    height: local.height,
  };
}

export class ChipAtlas {
  constructor(private readonly image: ex.ImageSource) {}

  sprite(denomination: ChipDenomination): ex.Sprite {
    return this.image.toSprite({ sourceView: chipRegion(denomination) });
  }

  stackSprite(denomination: ChipDenomination): ex.Sprite {
    return this.image.toSprite({
      sourceView: chipRegion(denomination, 'stack'),
    });
  }
}
