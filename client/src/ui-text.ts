import * as ex from 'excalibur';

/** Locally hosted SIL-OFL block lettering; card sprites retain nearest-neighbor filtering. */
export const tableFont = new ex.FontSource(
  '/assets/chakra-petch-semibold.ttf',
  'Chakra Petch',
);

export function uiText(text: string, size: number, color: ex.Color): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: tableFont.toFont({
      family: 'Chakra Petch',
      size,
      color,
      quality: 2,
      filtering: ex.ImageFiltering.Blended,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
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
