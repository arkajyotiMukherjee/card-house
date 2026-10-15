export const CARD_SIZE = 64;

export interface GridCell {
  col: number;
  row: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Light hearts sheet: 320×256, five columns by four rows. */
export const HEARTS_COLUMNS = 5;
export const HEARTS_ROWS = 4;

/**
 * Visual order is blank, Ace, 2–10, jack, queen, king, then jokers.
 * Column 0 row 0 is the blank card. The Ace is the next cell.
 */
export const BLANK_HEART: GridCell = { col: 0, row: 0 };
export const ACE_HEART: GridCell = { col: 1, row: 0 };
/** Five of hearts, the first number card on the second row. */
export const NUMBER_HEART: GridCell = { col: 0, row: 1 };

/** CardBack01.png is 192×128, three columns by two rows. Use the first cell. */
export const CARD_BACK_COLUMNS = 3;
export const CARD_BACK_ROWS = 2;
export const CARD_BACK: GridCell = { col: 0, row: 0 };

/** Chips_NoOutline.png is a 192×44 strip of six 32×44 chips. */
export const CHIP_WIDTH = 32;
export const CHIP_HEIGHT = 44;
export const CHIP_INDEX = 0;

export const TABLE_WIDTH = 129;
export const TABLE_HEIGHT = 80;
export const TABLE_SCALE = 5;

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export function cellRect(cell: GridCell, size = CARD_SIZE): PixelRect {
  return {
    x: cell.col * size,
    y: cell.row * size,
    width: size,
    height: size,
  };
}

export function sameCell(a: GridCell, b: GridCell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function chipRect(index = CHIP_INDEX): PixelRect {
  return {
    x: index * CHIP_WIDTH,
    y: 0,
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
  };
}

export function integerScale(
  viewportWidth: number,
  viewportHeight: number,
  logicalWidth = LOGICAL_WIDTH,
  logicalHeight = LOGICAL_HEIGHT,
): number {
  const scaleX = Math.floor(viewportWidth / logicalWidth);
  const scaleY = Math.floor(viewportHeight / logicalHeight);
  return Math.max(1, Math.min(scaleX, scaleY));
}

/**
 * CSS size of the 960×540 canvas so it covers the window. One axis matches
 * the viewport and the other is larger, so the page has no empty bars.
 * `Math.ceil` avoids a fractional undershoot that would show a hairline.
 */
export function coverViewport(
  viewportWidth: number,
  viewportHeight: number,
  logicalWidth = LOGICAL_WIDTH,
  logicalHeight = LOGICAL_HEIGHT,
): { width: number; height: number } {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return { width: logicalWidth, height: logicalHeight };
  }
  const scale = Math.max(
    viewportWidth / logicalWidth,
    viewportHeight / logicalHeight,
  );
  return {
    width: Math.ceil(logicalWidth * scale),
    height: Math.ceil(logicalHeight * scale),
  };
}
