import {
  PRESIDENT_RANKS,
  type PresidentState,
} from '../../src/shared/games/president';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import {
  presidentRequirement,
  presidentSeatStatus,
} from './president-classic-layout';

export class PresidentTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: PresidentState,
    ctx: RenderContext,
    page: number,
    pages: number,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx));
    const finished = state.phase === 'finished';
    ui.header(ctx.tableName?.trim() || 'President');
    ui.personalBand();
    for (const box of classicSeats(ctx.seats)) {
      const count = state.hands[String(box.seat.seatIndex)]?.length ?? 0;
      const active = state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'president-player-name',
        box.seat.seatIndex,
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        `${count} ${count === 1 ? 'card' : 'cards'}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'president-card-count',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        presidentSeatStatus(state, box.seat.seatIndex),
        16,
        active ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
      );
    }
    if (finished) {
      ui.surface(
        { x: 244, y: 212, w: 472, h: 208 },
        'president-finish-surface',
      );
      ui.text(
        { x: 252, y: 216, w: 456, h: 32 },
        'Finish order',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'president-public-state',
      );
      for (const [index, entry] of state.rankOrder.entries()) {
        const x = 252 + Math.floor(index / 3) * 232,
          y = 254 + (index % 3) * 54;
        const name =
          ctx.seats.find((seat) => seat.seatIndex === entry.seat)?.name ??
          'Player';
        ui.text(
          { x, y, w: 224, h: 24 },
          `${index + 1}. ${name}`,
          17,
          entry.seat === state.winnerSeatIndex
            ? CLASSIC.accent
            : CLASSIC.secondary,
          undefined,
          false,
          'president-finish-name',
        );
        ui.text(
          { x, y: y + 25, w: 224, h: 24 },
          `${entry.title} · ${entry.score} pts`,
          18,
          CLASSIC.cream,
          undefined,
          true,
        );
      }
    } else {
      ui.surface(
        { x: 248, y: 212, w: 464, h: 64 },
        'president-combination-surface',
      );
      ui.text(
        { x: 256, y: 216, w: 448, h: 28 },
        presidentRequirement(state),
        24,
        CLASSIC.cream,
        undefined,
        true,
        'president-public-state',
      );
      const last = state.currentRank !== null ? state.lastPlay : null;
      const name =
        ctx.seats.find((seat) => seat.seatIndex === last?.seat)?.name ??
        'Player';
      ui.text(
        { x: 264, y: 248, w: 432, h: 24 },
        last
          ? `${name} · ${last.cards.length} ${last.cards.length === 1 ? 'card' : 'cards'} played`
          : 'Play 1–4 cards of one rank',
        18,
        CLASSIC.secondary,
        undefined,
        false,
        'president-last-play',
      );
      // A quiet guide keeps the unusual low 3 / high 2 order visible without a second prompt.
      ui.surface(
        { x: 248, y: 390, w: 464, h: 30 },
        'president-strength-surface',
      );
      ui.text({ x: 252, y: 394, w: 66, h: 22 }, 'Low →', 16, CLASSIC.quiet);
      PRESIDENT_RANKS.forEach((rank, index) =>
        ui.text(
          { x: 320 + index * 29, y: 394, w: 28, h: 22 },
          rank,
          18,
          rank === state.currentRank ? CLASSIC.accent : CLASSIC.secondary,
        ),
      );
    }
    const me = ctx.seats.find((seat) => seat.self);
    const count = me ? (state.hands[String(me.seatIndex)]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'president-player-name',
      ctx.meSeatIndex ?? undefined,
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      me ? `${count} ${count === 1 ? 'card' : 'cards'}` : '',
      28,
      CLASSIC.cream,
      'left',
      true,
    );
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      !me
        ? 'Spectating'
        : pages > 1
          ? `Page ${page + 1}/${pages}`
          : presidentSeatStatus(state, me.seatIndex),
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      const winner =
        ctx.seats.find((seat) => seat.seatIndex === state.winnerSeatIndex)
          ?.name ?? 'Game complete';
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        'President',
        16,
        CLASSIC.secondary,
        'right',
      );
      ui.text(
        { x: 752, y: 462, w: 184, h: 40 },
        winner,
        22,
        CLASSIC.accent,
        'right',
        true,
        'president-result',
      );
      ui.text(
        { x: 752, y: 506, w: 184, h: 24 },
        ctx.finishedMessage === 'Entry fees refunded'
          ? ctx.finishedMessage
          : ctx.prizePool
            ? `${ctx.prizePool.toLocaleString()} chips awarded`
            : 'Game complete',
        16,
        CLASSIC.secondary,
        'right',
      );
    }
  }
}
