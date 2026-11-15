import * as ex from 'excalibur';
import { pokerPotAwards, type PokerState } from '../../src/shared/games/poker';
import type { RenderContext } from './game-driver';
import { chipAtlas } from './boot-scene';
import { classicSeats } from './classic-table-design';
import { tableGutter } from './table-viewport';

export interface ChipTransfer {
  seat: number;
  amount: number;
  payout: boolean;
}
/** Only accepted state changes produce movement; re-rendering or reconnecting does not. */
export function chipTransfers(
  before: PokerState | null,
  after: PokerState,
): ChipTransfer[] {
  if (!before || before.handNumber !== after.handNumber) return [];
  const bets: ChipTransfer[] = after.order
    .map((seat) => ({
      seat,
      amount:
        after.seats[String(seat)].committed -
        (before.seats[String(seat)]?.committed ?? 0),
      payout: false,
    }))
    .filter((move) => move.amount > 0);
  if (before.phase !== 'finished' && after.phase === 'finished') {
    const exact = after.pots?.length ? pokerPotAwards(after) : null;
    const awards: ChipTransfer[] = after.winnerSeatIndexes
      .map((seat) => ({
        seat,
        amount:
          exact?.get(seat) ??
          Math.min(
            after.pot,
            Math.max(
              0,
              after.seats[String(seat)].chips -
                (before.seats[String(seat)]?.chips ?? 0) +
                Math.max(
                  0,
                  after.seats[String(seat)].committed -
                    (before.seats[String(seat)]?.committed ?? 0),
                ),
            ),
          ),
        payout: true,
      }))
      .filter((move) => move.amount > 0);
    return [...bets, ...awards];
  }
  return after.phase === 'play' ? bets : [];
}
export class PokerChipMotion {
  private last: PokerState | null = null;
  private actors = new Set<ex.Actor>();
  update(state: PokerState, ctx: RenderContext): void {
    const moves = chipTransfers(this.last, state);
    this.last = structuredClone(state);
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    for (const move of moves) {
      const panel = classicSeats(ctx.seats).find(
        (panel) => panel.seat.seatIndex === move.seat,
      );
      const self = ctx.meSeatIndex === move.seat;
      const seat = self
        ? move.payout
          ? ex.vec(112 - tableGutter(), 488)
          : ex.vec(732 + tableGutter(), 500)
        : panel
          ? ex.vec(
              panel.x +
                panel.w / 2 +
                (panel.edge === 'left'
                  ? -tableGutter()
                  : panel.edge === 'right'
                    ? tableGutter()
                    : 0),
              move.payout && !panel.edge ? 92 : panel.y + 30,
            )
          : ex.vec(480, 120);
      const pot = ex.vec(572, 262);
      const from = move.payout ? pot : seat,
        to = move.payout ? seat : pot;
      const count = Math.min(8, Math.max(2, Math.ceil(move.amount / 20)));
      for (let index = 0; index < count; index += 1) {
        const actor = new ex.Actor({
          name: move.payout ? 'chip-payout-flight' : 'chip-bet-flight',
          pos: from.clone(),
          z: 65 + index,
        });
        actor.graphics.use(chipAtlas.sprite(move.amount >= 100 ? 25 : 5));
        actor.scale = ex.vec(1.6, 1.6);
        actor.pointer.useGraphicsBounds = false;
        actor.pointer.useColliderShape = false;
        this.actors.add(actor);
        ctx.scene.add(actor);
        let elapsed =
          -index * 35 -
          (move.payout && moves.some((other) => !other.payout) ? 600 : 0);
        actor.on('postupdate', (event) => {
          elapsed += event.elapsed;
          const t = Math.max(0, Math.min(1, elapsed / 600));
          const p = 1 - (1 - t) ** 3;
          actor.pos = ex.vec(
            from.x + (to.x - from.x) * p + ((index % 3) - 1) * 5,
            from.y +
              (to.y - from.y) * p -
              Math.sin(Math.PI * t) * 24 -
              index * 2,
          );
          if (t === 1) {
            actor.kill();
            this.actors.delete(actor);
          }
        });
      }
    }
  }
  clear(): void {
    for (const actor of this.actors) actor.kill();
    this.actors.clear();
    this.last = null;
  }
}
