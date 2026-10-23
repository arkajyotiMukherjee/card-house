import * as ex from 'excalibur';
import { pixelFont } from './boot-scene';
import { CARET_GOLD, FIELD_CARET_WIDTH } from './html-field';

export const FELT = ex.Color.fromHex('#145c38');
export const GOLD = ex.Color.fromHex('#f4e4b3');
export const SELF = ex.Color.fromHex('#fff6d0');
export const DIM = ex.Color.fromHex('#d7c08a');
export const PLATE = ex.Color.fromHex('#0b2418');
export const BUTTON = ex.Color.fromHex('#6e2a24');
export const BUTTON_DOWN = ex.Color.fromHex('#3f1614');
export const STROKE = ex.Color.fromHex('#e6c27a');
export const STROKE_HOT = ex.Color.fromHex('#fff6d0');
export const DANGER = ex.Color.fromHex('#e85d4c');

export function canvasText(
  text: string,
  size: number,
  color: ex.Color,
): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: pixelFont.toFont({
      family: '"Press Start 2P"',
      size,
      color,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

/** Gold block caret. Smoothing stays off so the pixels stay square. */
export function makeFieldCaret(height: number, z: number): ex.Actor {
  const block = new ex.Rectangle({
    width: FIELD_CARET_WIDTH,
    height,
    color: ex.Color.fromHex(CARET_GOLD),
    lineWidth: 0,
    smoothing: false,
  });
  block.origin = ex.vec(0, 0);
  const actor = new ex.Actor({
    anchor: ex.vec(0, 0),
    z,
  });
  actor.graphics.use(block);
  actor.graphics.opacity = 0;
  return actor;
}

export function showFieldCaret(
  actor: ex.Actor,
  show: boolean,
  x: number,
  y: number,
): void {
  actor.pos = ex.vec(x, y);
  actor.graphics.opacity = show ? 1 : 0;
}

export function panelRect(
  width: number,
  height: number,
  fill: ex.Color,
  stroke: ex.Color,
): ex.Rectangle {
  const rect = new ex.Rectangle({
    width,
    height,
    color: fill,
    strokeColor: stroke,
    lineWidth: 2,
    smoothing: false,
  });
  rect.origin = ex.vec(0, 0);
  return rect;
}
