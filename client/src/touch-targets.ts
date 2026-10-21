import * as ex from 'excalibur';
import { isMobileDevice } from './mobile-shell';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

/**
 * Pixel buttons are 28px tall. A fingertip needs about 44px. On a coarse
 * pointer, each small control that listens for pointer events gets a larger
 * hit box centered on its face. The face, the caption, and the pixel font do
 * not change; only the area that answers a touch grows.
 *
 * Two neighbours never share a hit box. Where growing would overlap, the gap
 * between their faces is split in half, so a tight stack gets less than 44px
 * rather than firing two buttons from one tap.
 */

export const TOUCH_TARGET = 44;

export interface TouchBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: TouchBox, b: TouchBox): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

function growTo(box: TouchBox, min: number): TouchBox {
  const w = Math.max(box.w, min);
  const h = Math.max(box.h, min);
  return {
    x: box.x - (w - box.w) / 2,
    y: box.y - (h - box.h) / 2,
    w,
    h,
  };
}

function clipVertical(upper: TouchBox, lower: TouchBox, mid: number): void {
  upper.h = Math.min(upper.y + upper.h, mid) - upper.y;
  const bottom = lower.y + lower.h;
  lower.y = Math.max(lower.y, mid);
  lower.h = bottom - lower.y;
}

function clipHorizontal(left: TouchBox, right: TouchBox, mid: number): void {
  left.w = Math.min(left.x + left.w, mid) - left.x;
  const edge = right.x + right.w;
  right.x = Math.max(right.x, mid);
  right.w = edge - right.x;
}

/**
 * Grows every box to at least `min` on each side, centered, then trims
 * overlaps so the result still contains each original and no two overlap.
 */
export function touchBoxes(
  boxes: readonly TouchBox[],
  min = TOUCH_TARGET,
): TouchBox[] {
  const grown = boxes.map((box) => growTo(box, min));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const ga = grown[i];
      const gb = grown[j];
      if (!a || !b || !ga || !gb) {
        continue;
      }
      if (intersects(a, b) || !intersects(ga, gb)) {
        continue;
      }
      const vGap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      const hGap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const vertical = hGap < 0 || (vGap >= 0 && vGap <= hGap);
      if (vertical) {
        const [upper, lower, ua, la] =
          a.y <= b.y ? [ga, gb, a, b] : [gb, ga, b, a];
        clipVertical(upper, lower, (ua.y + ua.h + la.y) / 2);
      } else {
        const [left, right, la, ra] =
          a.x <= b.x ? [ga, gb, a, b] : [gb, ga, b, a];
        clipHorizontal(left, right, (la.x + la.w + ra.x) / 2);
      }
    }
  }
  return grown;
}

const POINTER_EVENTS = ['pointerup', 'pointerdown'] as const;

/**
 * True once something listens for a tap on this actor. Excalibur keeps no
 * public count, so this reads the emitter's listener table (exact-pinned
 * `excalibur`; `touch-targets.test.ts` fails if that shape changes).
 */
export function hasPointerHandler(actor: ex.Actor): boolean {
  const table = (
    actor.events as unknown as {
      _listeners?: Record<string, unknown[] | undefined>;
    }
  )._listeners;
  if (!table) {
    return false;
  }
  return POINTER_EVENTS.some((name) => (table[name]?.length ?? 0) > 0);
}

interface Tracked {
  actor: ex.Actor;
  face: TouchBox;
  anchor: ex.Vector;
}

const faces = new WeakMap<ex.Actor, { w: number; h: number }>();

function onScreen(box: TouchBox): boolean {
  return (
    box.x + box.w > 0 &&
    box.y + box.h > 0 &&
    box.x < LOGICAL_WIDTH &&
    box.y < LOGICAL_HEIGHT
  );
}

function collect(scene: ex.Scene): Tracked[] {
  const found: Tracked[] = [];
  for (const actor of scene.actors) {
    if (actor.isKilled() || !actor.graphics.isVisible) {
      continue;
    }
    if (!hasPointerHandler(actor)) {
      continue;
    }
    let size = faces.get(actor);
    if (!size) {
      size = { w: actor.width, h: actor.height };
      faces.set(actor, size);
    }
    if (size.w <= 0 || size.h <= 0) {
      continue;
    }
    if (size.w >= TOUCH_TARGET && size.h >= TOUCH_TARGET) {
      continue;
    }
    const pos = actor.globalPos;
    const face = {
      x: pos.x - actor.anchor.x * size.w,
      y: pos.y - actor.anchor.y * size.h,
      w: size.w,
      h: size.h,
    };
    if (!onScreen(face)) {
      continue;
    }
    found.push({ actor, face, anchor: actor.anchor });
  }
  return found;
}

function signature(tracked: readonly Tracked[]): string {
  return tracked
    .map(
      ({ actor, face }) =>
        `${actor.id}:${face.x}:${face.y}:${face.w}:${face.h}`,
    )
    .join(',');
}

function apply(tracked: readonly Tracked[]): void {
  const hits = touchBoxes(tracked.map((entry) => entry.face));
  tracked.forEach((entry, index) => {
    const hit = hits[index];
    if (!hit) {
      return;
    }
    const { face, actor, anchor } = entry;
    const offset = ex.vec(
      hit.x - face.x - anchor.x * face.w,
      hit.y - face.y - anchor.y * face.h,
    );
    actor.collider.useBoxCollider(hit.w, hit.h, ex.vec(0, 0), offset);
  });
}

/**
 * Keeps small pointer controls at a thumb-sized hit box on the current scene.
 * Does nothing on a desktop window. Cheap when nothing moved: it compares one
 * signature string per frame.
 */
export function installTouchTargets(
  engine: ex.Engine,
  coarse: () => boolean = isMobileDevice,
): void {
  let last = '';
  let lastScene: ex.Scene | undefined;
  engine.on('preupdate', () => {
    if (!coarse()) {
      return;
    }
    const scene = engine.currentScene;
    const tracked = collect(scene);
    const next = signature(tracked);
    if (next === last && scene === lastScene) {
      return;
    }
    last = next;
    lastScene = scene;
    apply(tracked);
  });
}
