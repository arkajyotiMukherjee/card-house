import * as ex from 'excalibur';
import { CARD_DRAW, HOVER_LIFT } from './bluff-layout';

/** How fast the drawn lift chases the curve. A short move is not a full pop. */
export const HOVER_EASE_MS = 110;

const LIFT_Z = 30;
const WINDOW = 3;

/**
 * Target lift for each card, in the same order as `centers`.
 *
 * The pointer raises at most three cards: the three whose centers are
 * closest to `pointerX`. An end card has only one neighbor, so the card
 * two away is far enough that its lift is rest. Lift falls from `maxLift`
 * at a card's center to rest at two gaps away, so the card under the
 * pointer is highest, its neighbors match when the pointer is centered,
 * and the two cards beside a midpoint are equal and above the outer one.
 * A null pointer leaves the whole hand at rest.
 */
export function handHoverLifts(
  centers: readonly number[],
  pointerX: number | null,
  maxLift = HOVER_LIFT,
): number[] {
  const lifts = centers.map(() => 0);
  if (pointerX === null || centers.length === 0 || maxLift <= 0) {
    return lifts;
  }
  const spacing = handSpacing(centers);
  const reach = spacing * 2;
  const ranked: { index: number; distance: number }[] = [];
  for (let index = 0; index < centers.length; index += 1) {
    ranked.push({
      index,
      distance: Math.abs((centers[index] ?? 0) - pointerX),
    });
  }
  ranked.sort((a, b) => a.distance - b.distance || a.index - b.index);
  const count = Math.min(WINDOW, ranked.length);
  for (let index = 0; index < count; index += 1) {
    const row = ranked[index];
    if (!row || reach <= 0) {
      continue;
    }
    const falloff = 1 - row.distance / reach;
    if (falloff > 0) {
      lifts[row.index] = maxLift * falloff;
    }
  }
  return lifts;
}

/** Average gap between card centers. One card uses the card width. */
function handSpacing(centers: readonly number[]): number {
  if (centers.length < 2) {
    return CARD_DRAW;
  }
  let sum = 0;
  let gaps = 0;
  for (let index = 1; index < centers.length; index += 1) {
    const gap = (centers[index] ?? 0) - (centers[index - 1] ?? 0);
    if (gap > 0) {
      sum += gap;
      gaps += 1;
    }
  }
  if (gaps === 0) {
    return CARD_DRAW;
  }
  return sum / gaps;
}

/**
 * Move `drawn` toward `target`. A short `elapsedMs` covers only part of
 * the gap, so the card does not pop when the pointer crosses a neighbor.
 */
export function easeHoverLift(
  drawn: number,
  target: number,
  elapsedMs: number,
): number {
  if (!(elapsedMs > 0)) {
    return drawn;
  }
  const blend = 1 - Math.exp(-elapsedMs / HOVER_EASE_MS);
  const next = drawn + (target - drawn) * blend;
  if (Math.abs(target - next) < 0.05) {
    return target;
  }
  return next;
}

/** Pointer x over the hand, and the eased lift of each card. */
export class HandHover {
  private pointerX: number | null = null;
  private readonly over = new Set<string>();
  private readonly drawn = new Map<string, number>();

  enter(cardId: string, pointerX: number): void {
    this.over.add(cardId);
    this.pointerX = pointerX;
  }

  move(pointerX: number): void {
    if (this.over.size === 0) {
      return;
    }
    this.pointerX = pointerX;
  }

  leave(cardId: string): void {
    this.over.delete(cardId);
    if (this.over.size === 0) {
      this.pointerX = null;
    }
  }

  clear(): void {
    this.over.clear();
    this.pointerX = null;
    this.drawn.clear();
  }

  current(cardId: string): number {
    return this.drawn.get(cardId) ?? 0;
  }

  /**
   * Ease every id toward `handHoverLifts`. Ids that left the hand drop out.
   * `centers` lines up with `ids`.
   */
  step(
    ids: readonly string[],
    centers: readonly number[],
    elapsedMs: number,
    maxLift = HOVER_LIFT,
  ): void {
    const targets = handHoverLifts(centers, this.pointerX, maxLift);
    const live = new Set<string>();
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) {
        continue;
      }
      live.add(id);
      const next = easeHoverLift(
        this.drawn.get(id) ?? 0,
        targets[index] ?? 0,
        elapsedMs,
      );
      if (next === 0) {
        this.drawn.delete(id);
      } else {
        this.drawn.set(id, next);
      }
    }
    for (const id of this.drawn.keys()) {
      if (!live.has(id)) {
        this.drawn.delete(id);
      }
    }
  }
}

/**
 * Draw `lift` pixels above the rest position. The actor stays put, so the
 * collider (the hit target) stays on the card. Graphics bounds are off so
 * the raised art does not grow that hit box. Lifted cards stack just above
 * the hand, tallest on top.
 */
export function placeCardLift(
  actor: ex.Actor,
  restX: number,
  restY: number,
  restZ: number,
  lift: number,
): void {
  actor.pointer.useGraphicsBounds = false;
  actor.pos = ex.vec(restX, restY);
  const pixels = Math.round(lift);
  if (pixels > 0) {
    actor.graphics.offset = ex.vec(0, -pixels);
    actor.z = LIFT_Z + pixels / 100;
    return;
  }
  actor.graphics.offset = ex.vec(0, 0);
  actor.z = restZ;
}

class HoverClock extends ex.Actor {
  constructor(private readonly onTick: (elapsedMs: number) => void) {
    super({
      pos: ex.vec(0, 0),
      width: 0,
      height: 0,
      z: -1000,
    });
    this.pointer.useColliderShape = false;
    this.pointer.useGraphicsBounds = false;
  }

  onPreUpdate(_engine: ex.Engine, elapsedMs: number): void {
    this.onTick(elapsedMs);
  }
}

/** Tick the hand ease every frame. The actor has no hit box. */
export function startHandHoverClock(
  scene: ex.Scene,
  onTick: (elapsedMs: number) => void,
): ex.Actor {
  const clock = new HoverClock(onTick);
  scene.add(clock);
  return clock;
}
