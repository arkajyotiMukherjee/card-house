import type { Actor, Scene } from 'excalibur';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

export const TABLE_VIEWPORT_MAX_WIDTH = 1440;
export const TABLE_BACKDROP_LEFT =
  (LOGICAL_WIDTH - TABLE_VIEWPORT_MAX_WIDTH) / 2;

/** Keep the table centered while letting chrome use a wide phone's side gutters. */
export function tableViewportWidth(width: number, height: number): number {
  return height > 0
    ? Math.max(
        LOGICAL_WIDTH,
        Math.min(
          TABLE_VIEWPORT_MAX_WIDTH,
          Math.floor((width / height) * LOGICAL_HEIGHT),
        ),
      )
    : LOGICAL_WIDTH;
}

const anchors = new WeakMap<Actor, { x: number; edge: 'left' | 'right' }>();
let gutter = 0;

export function anchorTableActor(
  actor: Actor,
  edge: 'left' | 'right',
  x = actor.pos.x,
): void {
  anchors.set(actor, { x, edge });
  actor.pos.x = x + (edge === 'left' ? -gutter : gutter);
}

export function tableGutter(): number {
  return gutter;
}

export function placeTableAnchors(scene: Scene, width: number): void {
  gutter = (width - LOGICAL_WIDTH) / 2;
  for (const actor of scene.actors) {
    const anchor = anchors.get(actor);
    if (anchor)
      actor.pos.x = anchor.x + (anchor.edge === 'left' ? -gutter : gutter);
  }
}

/** The original 960px frame within the wider canvas, for HTML field projection. */
export function centeredFrameRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): { left: number; top: number; width: number; height: number } {
  const scale = rect.width / (LOGICAL_WIDTH + gutter * 2);
  return {
    left: rect.left + gutter * scale,
    top: rect.top,
    width: LOGICAL_WIDTH * scale,
    height: rect.height,
  };
}
