import { expect, it } from 'vitest';
import { HeartsDriver } from './hearts-driver';
import { SpadesDriver } from './spades-driver';
import type { HandHover } from './hand-hover';
import type { RenderContext } from './game-driver';

for (const Driver of [HeartsDriver, SpadesDriver]) {
  it(`${Driver.name} clears a reused card's selection only on a new hand`, () => {
    const driver = new Driver();
    // Keep the render transition real, replacing only graphics construction.
    for (const method of [
      'ensureHoverClock',
      'addButton',
      'addPlayButton',
      'addBidButton',
      'placeControls',
      'syncLabels',
      'syncChips',
      'syncCards',
      'syncBacks',
    ])
      Object.assign(driver, { [method]: () => {} });
    const internal = driver as unknown as {
      selected: Set<string> | string | null;
      hover: string | null;
      handHover: HandHover;
    };
    const before = {
      phase: 'play',
      stage: 'bid',
      turnSeatIndex: 0,
      tableId: 'test',
      handIndex: 0,
      handNumber: 1,
      hands: { '0': ['AS'] },
      passes: {},
      scores: { ns: 0, ew: 0 },
    } as unknown as Parameters<HeartsDriver['render']>[0] &
      Parameters<SpadesDriver['render']>[0];
    const ctx = { meSeatIndex: 0 } as RenderContext;
    driver.render(before, ctx);
    internal.selected = Driver === HeartsDriver ? new Set(['AS']) : 'AS';
    internal.hover = 'AS';
    internal.handHover.enter('AS', 100);
    internal.handHover.step(['AS'], [100], 1000);
    driver.render({ ...before }, ctx);
    expect(
      internal.selected instanceof Set
        ? internal.selected.has('AS')
        : internal.selected === 'AS',
    ).toBe(true);
    driver.render({ ...before, handIndex: 1, handNumber: 2 }, ctx);
    expect(
      internal.selected instanceof Set
        ? internal.selected.size
        : internal.selected,
    ).toBe(Driver === HeartsDriver ? 0 : null);
    expect(internal.hover).toBeNull();
    expect(internal.handHover.current('AS')).toBe(0);
  });
}
