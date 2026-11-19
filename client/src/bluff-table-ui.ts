import type { BluffState, BluffRank } from '../../src/shared/games/bluff';
import { BLUFF_RANK_NAMES } from '../../src/shared/games/bluff';
import { canPlay, rankWord } from './bluff-layout';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
export interface BluffPresentation {
  selected: number;
  page: number;
  pages: number;
  claim: BluffRank | null;
  announcement: string;
  arrival: string | null;
}
export class BluffTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(state: BluffState, ctx: RenderContext, view: BluffPresentation): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx));
    const choosing =
      canPlay(state, ctx.meSeatIndex) &&
      state.requiredRank === null &&
      !view.arrival;
    const finished = state.phase === 'finished';
    ui.header(ctx.tableName?.trim() || 'Bluff');
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
        'bluff-player-name',
        box.seat.seatIndex,
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        `${count} ${count === 1 ? 'card' : 'cards'}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'bluff-card-count',
      );
      const note =
        finished && state.winnerSeatIndex === box.seat.seatIndex
          ? 'Winner'
          : state.passed.includes(box.seat.seatIndex)
            ? 'Passed'
            : active
              ? 'To play'
              : state.lastPlay?.seat === box.seat.seatIndex
                ? 'Last play'
                : '';
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        note,
        16,
        active ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
      );
    }
    if (choosing) {
      ui.surface({ x: 248, y: 228, w: 464, h: 154 }, 'bluff-rank-surface');
      ui.text(
        { x: 256, y: 232, w: 448, h: 30 },
        view.claim
          ? `Declare ${BLUFF_RANK_NAMES[view.claim]} · select cards`
          : 'Choose the rank to declare',
        22,
        CLASSIC.accent,
        undefined,
        true,
      );
    } else {
      ui.surface({ x: 248, y: 212, w: 464, h: 64 }, 'bluff-claim-surface');
      const hasDetail = state.lastPlay !== null && !view.arrival;
      ui.text(
        { x: 256, y: 216, w: 448, h: hasDetail ? 28 : 56 },
        view.arrival ??
          (state.requiredRank
            ? `Called rank · ${rankWord(state.requiredRank, 2)}`
            : 'Flush'),
        24,
        CLASSIC.cream,
        undefined,
        true,
        'bluff-public-state',
      );
      const last = state.lastPlay,
        name = ctx.seats.find((seat) => seat.seatIndex === last?.seat)?.name;
      if (last && !view.arrival)
        ui.text(
          { x: 264, y: 248, w: 432, h: 24 },
          `${name ?? 'Player'} · ${last.cards.length} ${last.cards.length === 1 ? 'card' : 'cards'} played`,
          18,
          CLASSIC.secondary,
          undefined,
          false,
          'bluff-claim',
        );
      ui.text(
        { x: 308, y: 354, w: 344, h: 30 },
        `${state.discardPile.length} ${state.discardPile.length === 1 ? 'card' : 'cards'} in pile`,
        20,
        CLASSIC.quiet,
      );
    }
    const me = ctx.seats.find((seat) => seat.self),
      count = me ? (state.hands[String(me.seatIndex)]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'bluff-player-name',
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
      me
        ? view.pages > 1
          ? `Page ${view.page + 1}/${view.pages}`
          : ''
        : 'Spectating',
      14,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        'Winner',
        16,
        CLASSIC.secondary,
        'right',
      );
      const winner =
        ctx.seats.find((seat) => seat.seatIndex === state.winnerSeatIndex)
          ?.name ?? 'Game complete';
      ui.text(
        { x: 752, y: 462, w: 184, h: 40 },
        winner,
        22,
        CLASSIC.accent,
        'right',
        true,
        'bluff-result',
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
