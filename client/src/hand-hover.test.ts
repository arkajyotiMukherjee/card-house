// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ex from 'excalibur';
import { HOVER_LIFT } from './bluff-layout';
import {
  HandHover,
  CardTouchGesture,
  easeHoverLift,
  handHoverLifts,
  inspectionPose,
  placeCardLift,
  resetCardLift,
  canInspectPointer,
} from './hand-hover';

const HAND = [0, 100, 200, 300, 400];
afterEach(() => vi.unstubAllGlobals());

describe('card touch intent', () => {
  it('ignores synthetic touch enter after release while retaining mouse hover', () => {
    const pointers = { isDown: (id: number) => id === 2 };
    expect(
      canInspectPointer(
        { pointerType: ex.PointerType.Touch, pointerId: 1 },
        pointers,
      ),
    ).toBe(false);
    expect(
      canInspectPointer(
        { pointerType: ex.PointerType.Touch, pointerId: 2 },
        pointers,
      ),
    ).toBe(true);
    expect(
      canInspectPointer(
        { pointerType: ex.PointerType.Mouse, pointerId: 1 },
        pointers,
      ),
    ).toBe(true);
  });
  const pointer = (
    x: number,
    time: number,
    pointerType = ex.PointerType.Touch,
  ) => ({
    pointerId: 1,
    pointerType,
    pagePos: ex.vec(x, 100),
    nativeEvent: { timeStamp: time } as Event,
  });
  it('releases outside the hand using the native pointer id and invalidates cancelled taps', () => {
    const hover = new HandHover();
    const start = {
      ...pointer(100, 0),
      nativeEvent: new PointerEvent('pointerdown', { pointerId: 7 }),
    };
    for (const ending of ['pointerup', 'pointercancel', 'blur']) {
      hover.touch.start(start);
      hover.enter('AS', 100);
      hover.step(['AS'], [100], 1000);
      expect(hover.current('AS')).toBeGreaterThan(0);
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8 }));
      hover.step(['AS'], [100], 1000);
      expect(hover.current('AS')).toBeGreaterThan(0);
      window.dispatchEvent(
        ending === 'blur'
          ? new Event('blur')
          : new PointerEvent(ending, { pointerId: 7 }),
      );
      hover.step(['AS'], [100], 2000);
      expect(hover.current('AS')).toBe(0);
      if (ending !== 'pointerup')
        expect(hover.touch.isTap(pointer(100, 100))).toBe(false);
    }
    hover.clear();
  });

  it('focuses one card during touch scrubbing and keeps the mouse dock curve', () => {
    const hover = new HandHover();
    hover.touch.start(pointer(100, 0));
    hover.enter('b', 100);
    hover.step(['a', 'b', 'c'], [80, 100, 120], 2000);
    expect(['a', 'b', 'c'].map((id) => hover.current(id))).toEqual([
      0,
      HOVER_LIFT,
      0,
    ]);
    hover.move(120);
    hover.step(['a', 'b', 'c'], [80, 100, 120], 2000);
    expect(['a', 'b', 'c'].map((id) => hover.current(id))).toEqual([
      0,
      0,
      HOVER_LIFT,
    ]);
    hover.clear();
    hover.enter('b', 100);
    hover.step(['a', 'b', 'c'], [80, 100, 120], 2000);
    expect(hover.current('a')).toBeGreaterThan(0);
    expect(hover.current('c')).toBeGreaterThan(0);
    hover.clear();
  });

  it('selects a short tap but not a hold, slide, return drag, or cancellation', () => {
    const gesture = new CardTouchGesture();
    gesture.start(pointer(20, 0));
    expect(gesture.isTap(pointer(23, 100))).toBe(true);
    expect(gesture.isTap(pointer(23, 400))).toBe(false);
    gesture.start(pointer(20, 500));
    gesture.move(pointer(40, 550));
    expect(gesture.isTap(pointer(20, 600))).toBe(false);
    gesture.start(pointer(20, 700));
    expect(gesture.isTap(pointer(45, 750))).toBe(false);
    gesture.cancel();
    expect(gesture.isTap(pointer(20, 800))).toBe(false);
    expect(gesture.isTap(pointer(20, 800, ex.PointerType.Mouse))).toBe(true);
  });
});

describe('hand hover lift', () => {
  it('keeps inspection usable without easing when reduced motion is requested', () => {
    let reduced = true;
    const query = vi.spyOn(window, 'matchMedia').mockReturnValue({
      get matches() {
        return reduced;
      },
    } as MediaQueryList);
    const hover = new HandHover();
    hover.enter('AS', 100);
    hover.step(['AS'], [100], 1);
    expect(hover.current('AS')).toBe(HOVER_LIFT);
    hover.release();
    hover.step(['AS'], [100], 1);
    expect(hover.current('AS')).toBe(0);
    reduced = false;
    hover.enter('AS', 100);
    hover.step(['AS'], [100], 1);
    expect(hover.current('AS')).toBeGreaterThan(0);
    expect(hover.current('AS')).toBeLessThan(HOVER_LIFT);
    query.mockRestore();
  });
  it('marks selection without moving its collider and clears the mark on deselection', () => {
    // Exercise real Excalibur actors; raster drawing itself is browser-tested.
    const context = {
      clearRect() {},
      save() {},
      restore() {},
      scale() {},
      translate() {},
      setLineDash() {},
      getLineDash: () => [],
      fillRect() {},
      strokeRect() {},
    };
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => context, setAttribute() {} }),
    });
    const actor = new ex.Actor({ width: 64, height: 64 });
    actor.graphics.use(
      new ex.Rectangle({ width: 64, height: 64, color: ex.Color.White }),
    );
    placeCardLift(actor, 200, 500, 10, 20, true);
    expect(actor.pos.x).toBe(200);
    expect(actor.pos.y).toBe(500);
    expect(actor.children).toHaveLength(0);
    expect(actor.graphics.offset.y).toBeCloseTo(-60 / 1.65);
    resetCardLift(actor);
    expect(actor.graphics.offset.y).toBe(0);
    expect(actor.graphics.current?.scale.y).toBe(1);
    expect(actor.pos.y).toBe(500);
    placeCardLift(actor, 200, 500, 10, 0, true);
    expect(actor.graphics.offset.y).toBe(-12);
    placeCardLift(actor, 200, 500, 10, 0, false);
    expect(actor.graphics.offset.y).toBe(0);
    expect(inspectionPose(20, true, true).lift).toBeGreaterThan(
      inspectionPose(20, true).lift,
    );
  });
  it('shares phone magnification and lift with desktop while preserving resting cards', () => {
    expect(inspectionPose(0, true)).toEqual({ lift: 0, scale: 1 });
    expect(inspectionPose(20, false)).toEqual(inspectionPose(20, true));
    expect(inspectionPose(20, true)).toEqual({ lift: 48, scale: 1.65 });
    expect(inspectionPose(10, true)).toEqual({ lift: 24, scale: 1.325 });
    expect(inspectionPose(20, false, false, true)).toEqual(
      inspectionPose(20, true, false, true),
    );
    const resting = inspectionPose(0, true, false, true);
    expect(resting.scale).toBe(1.35);
    expect(508 - resting.lift + 32 * resting.scale).toBeLessThanOrEqual(540);
    expect(inspectionPose(20, true, false, true).scale).toBe(1.9);
    expect(inspectionPose(0, false, false, true)).toEqual({
      lift: 4,
      scale: 1.1,
    });
  });
  it('eases inspection back to rest after a finger is released', () => {
    const hover = new HandHover();
    hover.enter('a', 100);
    hover.step(['a'], [100], 1000);
    const lifted = hover.current('a');
    expect(lifted).toBeGreaterThan(0);
    hover.release();
    expect(hover.current('a')).toBe(lifted);
    hover.step(['a'], [100], 16);
    expect(hover.current('a')).toBeLessThan(lifted);
    hover.step(['a'], [100], 10000);
    expect(hover.current('a')).toBe(0);
  });
  it('lifts the card under the pointer highest and its neighbors equally', () => {
    const lifts = handHoverLifts(HAND, 200, HOVER_LIFT);
    expect(lifts[2]).toBe(HOVER_LIFT);
    expect(lifts[1]).toBe(lifts[3]);
    expect(lifts[1]).toBeGreaterThan(0);
    expect(lifts[1]).toBeLessThan(lifts[2] ?? 0);
    expect(lifts[1]).toBe(HOVER_LIFT / 2);
  });

  it('keeps the two middle cards equal and highest halfway between centers', () => {
    const lifts = handHoverLifts(HAND, 250, HOVER_LIFT);
    expect(lifts[2]).toBe(lifts[3]);
    expect(lifts[2]).toBeGreaterThan(lifts[1] ?? 0);
    expect(lifts[2]).toBeGreaterThan(lifts[4] ?? 0);
    expect(lifts[2]).toBeLessThan(HOVER_LIFT);
    const outers = [lifts[1] ?? 0, lifts[4] ?? 0];
    const raised = outers.filter((lift) => lift > 0);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toBeLessThan(lifts[2] ?? 0);
    expect(lifts.filter((lift) => lift > 0)).toHaveLength(3);
  });

  it('keeps cards outside the three-card window at rest', () => {
    const lifts = handHoverLifts(HAND, 200, HOVER_LIFT);
    expect(lifts[0]).toBe(0);
    expect(lifts[4]).toBe(0);
    expect(lifts.filter((lift) => lift > 0).length).toBeLessThanOrEqual(3);
    expect(handHoverLifts(HAND, null, HOVER_LIFT)).toEqual([0, 0, 0, 0, 0]);
  });

  it('lifts an end card and only its one neighbor', () => {
    const left = handHoverLifts(HAND, 0, HOVER_LIFT);
    expect(left[0]).toBe(HOVER_LIFT);
    expect(left[1]).toBeGreaterThan(0);
    expect(left[1]).toBeLessThan(left[0] ?? 0);
    expect(left[2]).toBe(0);
    expect(left[3]).toBe(0);
    expect(left[4]).toBe(0);

    const right = handHoverLifts(HAND, 400, HOVER_LIFT);
    expect(right[4]).toBe(HOVER_LIFT);
    expect(right[3]).toBe(left[1]);
    expect(right[3]).toBeGreaterThan(0);
    expect(right[3]).toBeLessThan(right[4] ?? 0);
    expect(right[2]).toBe(0);
    expect(right[1]).toBe(0);
    expect(right[0]).toBe(0);
  });

  it('eases the drawn height toward the target', () => {
    const rising = easeHoverLift(0, HOVER_LIFT, 16);
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(HOVER_LIFT);
    expect(easeHoverLift(rising, HOVER_LIFT, 10_000)).toBe(HOVER_LIFT);
    const falling = easeHoverLift(HOVER_LIFT, 0, 16);
    expect(falling).toBeLessThan(HOVER_LIFT);
    expect(falling).toBeGreaterThan(0);
    expect(easeHoverLift(HOVER_LIFT, 0, 0)).toBe(HOVER_LIFT);
  });

  it('eases the hand and leaves cards outside the window down', () => {
    const hover = new HandHover();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    hover.enter('c', 200);
    hover.step(ids, HAND, 16);
    expect(hover.current('c')).toBeGreaterThan(hover.current('b'));
    expect(hover.current('b')).toBe(hover.current('d'));
    expect(hover.current('b')).toBeGreaterThan(0);
    expect(hover.current('a')).toBe(0);
    expect(hover.current('e')).toBe(0);
    hover.step(ids, HAND, 10_000);
    expect(hover.current('c')).toBe(HOVER_LIFT);
    expect(hover.current('b')).toBe(HOVER_LIFT / 2);
    hover.leave('c');
    hover.step(ids, HAND, 10_000);
    expect(hover.current('c')).toBe(0);
    expect(hover.current('b')).toBe(0);
  });
});
