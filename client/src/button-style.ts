/**
 * One pixel button face for Card House.
 * Press Start 2P is one em per glyph. Captions sit in the center of that box.
 * Antialiasing stays off: callers draw with `quality: 1` and pixel filtering.
 */

/** Body size for a standard button. Large menu labels pass their own size. */
export const BUTTON_FONT_SIZE = 8;

/** Taller touch controls can carry larger type, constrained by their caption. */
export function buttonFontSize(
  label: string,
  width: number,
  height: number,
  preferred = height < 44 ? BUTTON_FONT_SIZE : height < 60 ? 12 : 16,
): number {
  return Math.max(
    BUTTON_FONT_SIZE,
    Math.min(preferred, Math.floor((width - 16) / Math.max(1, label.length))),
  );
}

/**
 * Face height for menu chrome, lobby, create-table, chat, leave, and overlays.
 * A control keeps another height only when it is a different kind of target:
 * the tall main-menu stack, a square icon, the seat Ask chip, or phone controls.
 */
export const BUTTON_HEIGHT = 28;

/** The label drops one pixel while the button is held. */
export const BUTTON_PRESS_SHIFT = 1;

/**
 * Excalibur's font bitmap includes 2px of padding, so the em is drawn
 * that far from the actor. The caption actor sits back by this much and
 * the ink lands in the center of the face.
 */
export const BUTTON_CAPTION_RASTER = 2;

export interface CaptionPos {
  x: number;
  y: number;
}

/**
 * Top-left of the label so the em box is centered in the button face.
 * Width is `label.length * size` because Press Start 2P's advance is one em.
 */
export function buttonCaptionPos(
  label: string,
  width: number,
  height: number,
  size = BUTTON_FONT_SIZE,
): CaptionPos {
  return {
    x: Math.round((width - label.length * size) / 2) - BUTTON_CAPTION_RASTER,
    y: Math.round((height - size) / 2) - BUTTON_CAPTION_RASTER,
  };
}
