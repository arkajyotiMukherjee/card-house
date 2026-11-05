import { describe, expect, it } from 'vitest';
import { BluffDriver } from './bluff-driver';
import { PresidentDriver } from './president-driver';
import { GoFishDriver } from './go-fish-driver';
import { CrazyEightsDriver } from './crazy-eights-driver';
import { RummyDriver } from './rummy-driver';
import { HeartsDriver } from './hearts-driver';
import { SpadesDriver } from './spades-driver';
import { PokerDriver } from './poker-driver';
import { BlackjackDriver } from './blackjack-driver';
import type { HandHover } from './hand-hover';

// Exercise the pointer-to-inspection path without constructing the renderer.
// These minimal snapshots intentionally have another player's turn.
interface InspectionDriver {
  state: unknown;
  ctx: unknown;
  cards: Map<string, { personal: boolean }>;
  handHover: HandHover;
  followHand?: (id: string, x: number, entered: boolean) => void;
  followHole?: (id: string, x: number, entered: boolean) => void;
  inspectCard?: (id: string, x: number, entered: boolean) => void;
}

describe('own-hand inspection while waiting', () => {
  for (const Driver of [
    BluffDriver,
    PresidentDriver,
    GoFishDriver,
    CrazyEightsDriver,
    RummyDriver,
    HeartsDriver,
    SpadesDriver,
    PokerDriver,
    BlackjackDriver,
  ]) {
    it(`${Driver.name} inspects only the player's own cards, independently of turn`, () => {
      const driver = new Driver() as unknown as InspectionDriver;
      driver.state = {
        phase: 'play',
        turnSeatIndex: 1,
        hands: { '0': ['AS'], '1': ['KH'] },
        seats: { '0': { hole: ['AS'] }, '1': { hole: ['KH'] } },
      };
      driver.cards.set('AS', { personal: true });
      driver.cards.set('KH', { personal: false });
      let blocked = false;
      driver.ctx = { meSeatIndex: 0, inputBlocked: () => blocked };
      const follow = (id: string) =>
        (driver.followHand ?? driver.followHole ?? driver.inspectCard)!.call(
          driver,
          id,
          100,
          true,
        );
      follow('AS');
      driver.handHover.step(['AS'], [100], 1000);
      expect(driver.handHover.current('AS')).toBeGreaterThan(0);
      driver.handHover.clear();
      follow('KH');
      driver.handHover.step(['KH'], [100], 1000);
      expect(driver.handHover.current('KH')).toBe(0);
      blocked = true;
      follow('AS');
      driver.handHover.step(['AS'], [100], 1000);
      expect(driver.handHover.current('AS')).toBe(0);
    });
  }
});
