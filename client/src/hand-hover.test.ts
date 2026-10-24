import { describe, expect, it } from 'vitest';
import { HOVER_LIFT } from './bluff-layout';
import { HandHover, easeHoverLift, handHoverLifts } from './hand-hover';

const HAND = [0, 100, 200, 300, 400];

describe('hand hover lift', () => {
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
