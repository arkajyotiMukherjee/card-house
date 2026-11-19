import * as ex from 'excalibur';
import type { FieldLabel, LogicalBox } from './html-field';

/** Large display lettering only; smaller table text stays proportional. */
export const retroFont = new ex.FontSource(
  '/assets/press-start-2p.ttf',
  'Press Start 2P',
);
export const RETRO_DISPLAY_MIN_SIZE = 24;

/** Locally hosted SIL-OFL block lettering; card sprites retain nearest-neighbor filtering. */
const UI_FONT_FAMILY = 'Chakra Petch';
export const tableFont = new ex.FontSource(
  '/assets/chakra-petch-semibold.ttf',
  UI_FONT_FAMILY,
);

export function uiText(text: string, size: number, color: ex.Color): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: tableFont.toFont({
      family: UI_FONT_FAMILY,
      size,
      color,
      quality: 2,
      filtering: ex.ImageFiltering.Blended,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

export function uiSingleLine(
  text: string,
  size: number,
  color: ex.Color,
  width: number,
): ex.Text {
  const label = uiText(text, size, color);
  return label.width <= width
    ? label
    : uiText(text, Math.floor((size * width) / label.width), color);
}

export function uiCaption(
  text: string,
  width: number,
  height: number,
  size: number,
): { x: number; y: number } {
  const graphic = uiText(text, size, ex.Color.White);
  return {
    x: Math.round((width - graphic.width) / 2),
    y: Math.round((height - graphic.height) / 2),
  };
}

let measurement: CanvasRenderingContext2D | null = null;

export function uiFieldLabel(
  box: LogicalBox,
  size: number,
  padding: number,
): FieldLabel {
  return {
    size,
    x: box.x + padding,
    y: box.y + Math.round((box.h - size) / 2),
    measure: (value) => {
      measurement ??= document.createElement('canvas').getContext('2d');
      if (!measurement) return value.length * size * 0.6;
      measurement.font = `${size}px "${UI_FONT_FAMILY}"`;
      return measurement.measureText(value).width;
    },
  };
}
