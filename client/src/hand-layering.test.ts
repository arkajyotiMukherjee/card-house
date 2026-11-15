// @vitest-environment happy-dom
import * as ex from 'excalibur';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandHover, inspectionPose, placeCardLift } from './hand-hover';
import { BluffDriver } from './bluff-driver';
import { PresidentDriver } from './president-driver';
import { GoFishDriver } from './go-fish-driver';
import { CrazyEightsDriver } from './crazy-eights-driver';
import { RummyDriver } from './rummy-driver';
import { HeartsDriver } from './hearts-driver';
import { SpadesDriver } from './spades-driver';
import { PokerDriver } from './poker-driver';
import { BlackjackDriver } from './blackjack-driver';
import { holePositions } from './poker-layout';
import { isMobileDevice } from './mobile-shell';
import { tableGutter } from './table-viewport';

beforeEach(() => {
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
});
afterEach(() => vi.unstubAllGlobals());

function card(): ex.Actor {
  const actor = new ex.Actor({ width: 64, height: 64 });
  actor.graphics.use(
    new ex.Rectangle({ width: 64, height: 64, color: ex.Color.White }),
  );
  return actor;
}

describe('hand inspection layering', () => {
  it('clears stale overlapping hover and reacquires on move without another enter', () => {
    const hover = new HandHover();
    hover.enter('3H', 100);
    hover.step(['3H', '4C'], [100, 152], 2000);
    hover.enter('4C', 152);
    hover.leave('3H');
    expect(hover.isFocused('4C')).toBe(true);
    hover.step(['3H', '4C'], [100, 152], 1);
    hover.leave('4C');
    expect(hover.isFocused('4C')).toBe(false);
    hover.step(['3H', '4C'], [100, 152], 2000);
    expect(hover.current('3H')).toBe(0);
    expect(hover.current('4C')).toBe(0);
    hover.move(100);
    hover.step(['3H', '4C'], [100, 152], 1);
    expect(hover.isFocused('3H')).toBe(true);
    hover.clear();
  });

  it('puts the newly focused card above a selected card before easing catches up', () => {
    const selected = card(),
      hovered = card();
    placeCardLift(selected, 100, 484, 12, 20, true, true);
    placeCardLift(hovered, 152, 484, 13, 0.1, false, true, true);
    expect(hovered.z).toBeGreaterThan(selected.z);
    expect(selected.pos.y).toBe(484);
    expect(hovered.pos.y).toBe(484);
  });

  it('keeps selected cards at resting size and later cards in front', () => {
    const left = card(),
      right = card();
    placeCardLift(left, 100, 484, 12, 0, true, true);
    placeCardLift(right, 152, 484, 13, 0, true, true);
    expect(right.z).toBeGreaterThan(left.z);
    expect(left.graphics.current?.scale.x).toBe(
      inspectionPose(0, false, true, true).scale,
    );
    expect(right.graphics.current?.scale.x).toBe(
      left.graphics.current?.scale.x,
    );
    expect(right.graphics.offset.y).toBe(left.graphics.offset.y);
  });

  it('does not let selection height break a tie between neighbouring inspection lifts', () => {
    const left = card(),
      right = card();
    placeCardLift(left, 100, 484, 12, 10, true, true);
    placeCardLift(right, 152, 484, 13, 10, false, true);
    expect(right.z).toBeGreaterThan(left.z);
    placeCardLift(left, 100, 484, 12, 10, true, true, true);
    expect(left.z).toBeGreaterThan(right.z);
  });

  it('moves focus immediately while the old card is still visually higher, then clears on release', () => {
    const hover = new HandHover();
    hover.enter('3H', 100);
    hover.step(['3H', '4C'], [100, 152], 2000);
    hover.move(152);
    hover.step(['3H', '4C'], [100, 152], 1);
    expect(hover.current('3H')).toBeGreaterThan(hover.current('4C'));
    expect(hover.isFocused('3H')).toBe(false);
    expect(hover.isFocused('4C')).toBe(true);
    hover.move(126);
    hover.step(['3H', '4C'], [100, 152], 1);
    expect(hover.isFocused('4C')).toBe(true);
    hover.release();
    expect(hover.isFocused('4C')).toBe(false);
    hover.step(['3H', '4C'], [100, 152], 2000);
    expect(hover.current('3H')).toBe(0);
    expect(hover.current('4C')).toBe(0);
  });
});

interface LayerDriver {
  cards: Map<
    string,
    {
      actor: ex.Actor;
      personal: boolean;
      restX: number;
      restY: number;
      restZ: number;
      moving: boolean;
    }
  >;
  selected: Set<string> | string | null;
  handHover: HandHover;
  applyLift(id: string, state: unknown, ctx: unknown): void;
}

for (const Driver of [
  BluffDriver,
  PresidentDriver,
  GoFishDriver,
  CrazyEightsDriver,
  RummyDriver,
  HeartsDriver,
  SpadesDriver,
]) {
  it(`${Driver.name} forwards pointer focus to the shared front layer while waiting`, () => {
    const driver = new Driver() as unknown as LayerDriver;
    for (const [i, id] of ['3H', '4C'].entries())
      driver.cards.set(id, {
        actor: card(),
        personal: true,
        restX: 100 + i * 52,
        restY: 484,
        restZ: 12 + i,
        moving: false,
      });
    const state = {
      phase: 'play',
      turnSeatIndex: 1,
      hands: { '0': ['3H', '4C'] },
    };
    const ctx = { meSeatIndex: 0, inputBlocked: () => false };
    driver.handHover.enter('3H', 100);
    driver.handHover.step(['3H', '4C'], [100, 152], 2000);
    driver.handHover.move(152);
    driver.handHover.step(['3H', '4C'], [100, 152], 1);
    for (const id of ['3H', '4C']) driver.applyLift(id, state, ctx);
    expect(driver.cards.get('4C')!.actor.z).toBeGreaterThan(
      driver.cards.get('3H')!.actor.z,
    );
    driver.handHover.clear();
  });
}

for (const Driver of [BluffDriver, PresidentDriver]) {
  it(`${Driver.name} does not permanently magnify selected cards`, () => {
    const driver = new Driver() as unknown as LayerDriver;
    driver.selected = new Set(['3H', '4C']);
    const state = {
      phase: 'play',
      turnSeatIndex: 0,
      passed: [],
      hands: { '0': ['3H', '4C'] },
    };
    const ctx = { meSeatIndex: 0, inputBlocked: () => false };
    for (const [i, id] of ['3H', '4C'].entries()) {
      driver.cards.set(id, {
        actor: card(),
        personal: true,
        restX: 100 + i * 52,
        restY: 484,
        restZ: 12 + i,
        moving: false,
      });
      driver.applyLift(id, state, ctx);
      expect(driver.cards.get(id)!.actor.graphics.current?.scale.x).toBe(
        inspectionPose(0, false, true, true).scale,
      );
    }
    expect(driver.cards.get('4C')!.actor.z).toBeGreaterThan(
      driver.cards.get('3H')!.actor.z,
    );
  });
}

for (const Driver of [PokerDriver, BlackjackDriver]) {
  it(`${Driver.name} forwards focus from its animation clock`, () => {
    const driver = new Driver() as unknown as LayerDriver & {
      state: unknown;
      ctx: unknown;
      layoutKey: string;
      easeHand(ms: number): void;
      ease(ms: number): void;
      refreshDropMarks(): void;
    };
    const slots =
      Driver === PokerDriver
        ? holePositions(true, 0, 0, 2)
        : [
            { x: 100, y: 484 },
            { x: 152, y: 484 },
          ];
    driver.state = { phase: 'play', seats: { '0': { hole: ['3H', '4C'] } } };
    driver.ctx = { meSeatIndex: 0, inputBlocked: () => false };
    driver.layoutKey = `${isMobileDevice()}:${tableGutter()}`;
    // Drop-tag graphics are independent of inspection order.
    driver.refreshDropMarks = () => {};
    for (const [i, id] of ['3H', '4C'].entries()) {
      const slot = slots[i];
      driver.cards.set(id, {
        actor: card(),
        personal: true,
        restX: slot.x,
        restY: slot.y,
        restZ: 12 + i,
        z: 12 + i,
        home: slot,
        moving: false,
      } as never);
    }
    driver.handHover.enter('3H', slots[0].x);
    driver.handHover.step(
      ['3H', '4C'],
      slots.map((s) => s.x),
      2000,
    );
    driver.handHover.move(slots[1].x);
    (Driver === PokerDriver ? driver.easeHand : driver.ease).call(driver, 1);
    expect(driver.cards.get('4C')!.actor.z).toBeGreaterThan(
      driver.cards.get('3H')!.actor.z,
    );
    driver.handHover.clear();
  });
}
