import * as ex from 'excalibur';
import { CARD_DRAW, HOVER_LIFT } from './bluff-layout';
import { isMobileDevice } from './mobile-shell';

/** How fast the drawn lift chases the curve. A short move is not a full pop. */
export const HOVER_EASE_MS = 110;

type CardPointer = Pick<
  ex.PointerEvent,
  'pointerType' | 'pointerId' | 'pagePos' | 'nativeEvent'
>;

/** Excalibur may emit enter after up in the same frame. Touch has no hover. */
export function canInspectPointer(
  event: Pick<CardPointer, 'pointerType' | 'pointerId'>,
  pointers: { isDown(id: number): boolean },
): boolean {
  return (
    event.pointerType !== ex.PointerType.Touch ||
    pointers.isDown(event.pointerId)
  );
}

/** A short tap selects; sliding or holding is inspection only. */
export class CardTouchGesture {
  private startPoint: {
    x: number;
    y: number;
    time: number;
    id: number;
  } | null = null;
  private dragged = false;
  private detach: (() => void) | undefined;

  constructor(private readonly onEnd: () => void = () => {}) {}

  get active(): boolean {
    return this.detach !== undefined;
  }

  start(event: CardPointer): void {
    if (event.pointerType !== ex.PointerType.Touch) return;
    this.detach?.();
    // End inspection even when the finger lifts outside a card or the app loses focus.
    // Keep the gesture data until Excalibur dispatches up so tap selection still works.
    const finish = (): void => {
      this.detach?.();
      this.onEnd();
    };
    const nativeId =
      (event.nativeEvent as PointerEvent).pointerId ?? event.pointerId;
    const endPointer = (native: PointerEvent): void => {
      if (native.pointerId !== nativeId) return;
      if (native.type === 'pointercancel') this.startPoint = null;
      finish();
    };
    const abandon = (): void => {
      this.startPoint = null;
      finish();
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('blur', abandon);
    this.detach = () => {
      window.removeEventListener('pointerup', endPointer);
      window.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('blur', abandon);
      this.detach = undefined;
    };
    this.startPoint = {
      x: event.pagePos.x,
      y: event.pagePos.y,
      time: event.nativeEvent.timeStamp,
      id: event.pointerId,
    };
    this.dragged = false;
  }

  move(event: CardPointer): void {
    const start = this.startPoint;
    if (
      start &&
      event.pointerId === start.id &&
      Math.hypot(event.pagePos.x - start.x, event.pagePos.y - start.y) > 10
    )
      this.dragged = true;
  }

  isTap(event: CardPointer): boolean {
    if (event.pointerType !== ex.PointerType.Touch) return true;
    this.move(event);
    const start = this.startPoint;
    return (
      !!start &&
      event.pointerId === start.id &&
      !this.dragged &&
      event.nativeEvent.timeStamp - start.time < 350
    );
  }

  cancel(): void {
    this.detach?.();
    this.startPoint = null;
  }
}

const LIFT_Z = 30;
const WINDOW = 3;

/** Extra space above the finger and a smooth magnification curve on phones. */
export function inspectionPose(
  lift: number,
  mobile: boolean,
  selected = false,
  personal = false,
): {
  lift: number;
  scale: number;
} {
  const amount = Math.max(0, lift);
  return {
    lift: mobile
      ? amount * 2.4 + (selected ? 12 : 0) + (personal ? 12 : 0)
      : amount + (selected ? 12 : 0),
    scale: mobile
      ? (personal ? 1.25 : 1) + Math.min(1, amount / HOVER_LIFT) * 0.65
      : 1,
  };
}

const graphicScales = new WeakMap<ex.Graphic, ex.Vector>();
const enlargedColliders = new WeakMap<ex.Actor, boolean>();

/** Remove inspection artwork before a card travels to a pile or another seat. */
export function resetCardLift(actor: ex.Actor): void {
  actor.graphics.offset = ex.vec(0, 0);
  const graphic = actor.graphics.current;
  const base = graphic && graphicScales.get(graphic);
  if (graphic && base) graphic.scale = base.clone();
}

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
  private readonly motionPreference =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  readonly touch = new CardTouchGesture(() => this.release());
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
    this.touch.cancel();
    this.release();
    this.drawn.clear();
  }

  /** A lifted finger ends inspection; the next frames ease back to rest. */
  release(): void {
    this.over.clear();
    this.pointerX = null;
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
    if (this.touch.active && this.pointerX !== null) {
      // A finger inspects one card; mouse hover retains the neighboring dock curve.
      let nearest = -1;
      let distance = Infinity;
      centers.forEach((center, index) => {
        const gap = Math.abs(center - this.pointerX!);
        if (gap < distance) {
          nearest = index;
          distance = gap;
        }
      });
      targets.fill(0);
      if (nearest >= 0) targets[nearest] = maxLift;
    }
    const live = new Set<string>();
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) {
        continue;
      }
      live.add(id);
      const next = this.motionPreference?.matches
        ? (targets[index] ?? 0)
        : easeHoverLift(
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
  selected = false,
  personal = false,
): void {
  actor.pointer.useGraphicsBounds = false;
  actor.pos = ex.vec(restX, restY);
  const mobile = typeof window !== 'undefined' && isMobileDevice();
  const enlarged = mobile && personal;
  if (enlargedColliders.get(actor) !== enlarged) {
    const resting = inspectionPose(0, mobile, false, personal);
    actor.collider.useBoxCollider(
      CARD_DRAW * resting.scale,
      CARD_DRAW * resting.scale,
      ex.vec(0.5, 0.5),
      ex.vec(0, -resting.lift),
    );
    enlargedColliders.set(actor, enlarged);
  }
  const pose = inspectionPose(lift, mobile, selected, personal);
  const graphic = actor.graphics.current;
  if (graphic) {
    let base = graphicScales.get(graphic);
    if (!base) {
      base = graphic.scale.clone();
      graphicScales.set(graphic, base);
    }
    graphic.scale = ex.vec(base.x * pose.scale, base.y * pose.scale);
  }
  const pixels = Math.round(pose.lift);
  if (pixels > 0) {
    // Excalibur multiplies a graphics offset by the graphic's own scale.
    // Keep the lift in actor coordinates even when the card is enlarged.
    actor.graphics.offset = ex.vec(0, -pixels / (graphic?.scale.y || 1));
    actor.z = lift > 0 ? LIFT_Z + pixels / 100 : restZ;
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
