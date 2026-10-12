import * as ex from 'excalibur';
import {
  BUBBLE_RECTS,
  BUBBLE_SIZE,
  GLOW_PAD,
  glowRects,
  type PixelRect,
  type SpeakingFader,
} from './speaking';

function pixelCanvas(
  width: number,
  height: number,
  rects: readonly PixelRect[],
): ex.Canvas {
  const canvas = new ex.Canvas({
    width,
    height,
    cache: true,
    smoothing: false,
    filtering: ex.ImageFiltering.Pixel,
    draw: (ctx) => {
      for (const rect of rects) {
        ctx.globalAlpha = rect.alpha;
        ctx.fillStyle = rect.color;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      ctx.globalAlpha = 1;
    },
  });
  canvas.origin = ex.vec(0, 0);
  return canvas;
}

function fadingActor(
  graphic: ex.Graphic,
  pos: ex.Vector,
  z: number,
  fader: SpeakingFader,
  key: string,
  isSpeaking: () => boolean,
): ex.Actor {
  const actor = new ex.Actor({ pos, anchor: ex.vec(0, 0), z });
  actor.graphics.use(graphic);
  actor.graphics.opacity = fader.level(key);
  actor.pointer.useColliderShape = false;
  actor.pointer.useGraphicsBounds = false;
  actor.on('postupdate', (event) => {
    actor.graphics.opacity = fader.step(key, isSpeaking(), event.elapsed);
  });
  return actor;
}

/**
 * Speech bubble with three dots. Its top-left sits at `pos`. It is invisible
 * until `isSpeaking()` is true, and fades over `SPEAKING_FADE_MS`.
 */
export function speechBubble(
  pos: ex.Vector,
  z: number,
  scale: number,
  fader: SpeakingFader,
  key: string,
  isSpeaking: () => boolean,
): ex.Actor {
  const graphic = pixelCanvas(BUBBLE_SIZE.w, BUBBLE_SIZE.h, BUBBLE_RECTS);
  graphic.scale = ex.vec(scale, scale);
  return fadingActor(graphic, pos, z, fader, key, isSpeaking);
}

/**
 * Glow around a `w`×`h` plate. `pos` is the plate's top-left, so the glow
 * extends `GLOW_PAD` past it on every side.
 */
export function seatGlow(
  pos: ex.Vector,
  w: number,
  h: number,
  z: number,
  fader: SpeakingFader,
  key: string,
  isSpeaking: () => boolean,
): ex.Actor {
  const graphic = pixelCanvas(
    w + GLOW_PAD * 2,
    h + GLOW_PAD * 2,
    glowRects(w, h),
  );
  return fadingActor(
    graphic,
    ex.vec(pos.x - GLOW_PAD, pos.y - GLOW_PAD),
    z,
    fader,
    key,
    isSpeaking,
  );
}
