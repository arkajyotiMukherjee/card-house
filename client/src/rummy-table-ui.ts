import type { RummyState } from '../../src/shared/games/rummy';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import {
  RUMMY_STOCK,
  RUMMY_DISCARD,
  rummyMeldPage,
  ownRummyDeadwood,
  rummyScoreRows,
} from './rummy-classic-layout';
export interface RummyPresentation {
  page: number;
  pages: number;
  selected: number;
  meldOpen: boolean;
  meldIndex: number;
  meldPage: number;
  announcement: string;
  input: (target: string) => void;
}
export class RummyTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(state: RummyState, ctx: RenderContext, view: RummyPresentation): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx)),
      finished = state.phase === 'finished';
    ui.header(ctx.tableName?.trim() || 'Rummy');
    ui.personalBand();
    for (const box of classicSeats(ctx.seats)) {
      const id = String(box.seat.seatIndex),
        count = state.hands[id]?.length ?? 0,
        melds = state.melds.filter((m) => m.seat === box.seat.seatIndex).length,
        active = !finished && state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'rummy-player-name',
        box.seat.seatIndex,
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        finished
          ? `${state.scores[id] ?? 0} deadwood`
          : `${count} ${count === 1 ? 'card' : 'cards'}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'rummy-card-count',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        `${melds} ${melds === 1 ? 'meld' : 'melds'}${active ? ' · To play' : ''}`,
        16,
        active ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
      );
    }
    if (view.meldOpen) {
      const meld = rummyMeldPage(state, view.meldIndex, view.meldPage),
        owner =
          ctx.seats.find((s) => s.seatIndex === state.melds[meld.index]?.seat)
            ?.name ?? 'Player';
      ui.surface({ x: 244, y: 212, w: 472, h: 208 }, 'rummy-meld-surface');
      ui.text(
        { x: 302, y: 216, w: 356, h: 30 },
        state.melds.length
          ? `Meld ${meld.index + 1} of ${state.melds.length}`
          : 'No melds yet',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'rummy-public-state',
      );
      if (state.melds.length) {
        ui.text(
          { x: 302, y: 250, w: 356, h: 24 },
          owner,
          17,
          CLASSIC.secondary,
          undefined,
          false,
          'rummy-meld-owner-player-name',
        );
        if (state.melds.length > 1) {
          ui.button({ x: 252, y: 244, w: 40, h: 40 }, '‹', () =>
            view.input('meld-prev'),
          );
          ui.button({ x: 668, y: 244, w: 40, h: 40 }, '›', () =>
            view.input('meld-next'),
          );
        }
        if (meld.pages > 1) {
          ui.button({ x: 252, y: 310, w: 40, h: 40 }, '‹', () =>
            view.input('meld-cards-prev'),
          );
          ui.button({ x: 668, y: 310, w: 40, h: 40 }, '›', () =>
            view.input('meld-cards-next'),
          );
        }
        ui.text(
          { x: 292, y: 382, w: 376, h: 30 },
          `${meld.total} cards${meld.pages > 1 ? ` · Page ${meld.page + 1}/${meld.pages}` : ''}`,
          18,
          CLASSIC.quiet,
        );
      } else
        ui.text(
          { x: 260, y: 286, w: 440, h: 80 },
          'Public sets and runs appear here',
          20,
          CLASSIC.secondary,
        );
    } else if (finished) {
      ui.surface({ x: 244, y: 212, w: 472, h: 208 }, 'rummy-results-surface');
      ui.text(
        { x: 252, y: 216, w: 360, h: 32 },
        'Final deadwood',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'rummy-public-state',
      );
      ui.button({ x: 624, y: 216, w: 84, h: 32 }, 'Melds', () =>
        view.input('melds'),
      );
      for (const [index, row] of rummyScoreRows(state, ctx.seats).entries()) {
        const x = 252 + Math.floor(index / 3) * 232,
          y = 254 + (index % 3) * 54;
        ui.text(
          { x, y, w: 176, h: 24 },
          row.seat.name,
          17,
          row.winner ? CLASSIC.accent : CLASSIC.secondary,
          undefined,
          false,
          'rummy-score-player-name',
        );
        ui.text(
          { x: x + 180, y, w: 40, h: 24 },
          String(row.score),
          22,
          row.winner ? CLASSIC.accent : CLASSIC.cream,
          undefined,
          true,
          'rummy-final-score',
        );
        ui.text(
          { x, y: y + 25, w: 220, h: 22 },
          row.winner
            ? 'Winner'
            : `${state.hands[String(row.seat.seatIndex)]?.length ?? 0} cards remaining`,
          16,
          CLASSIC.quiet,
        );
      }
    } else {
      ui.surface({ x: 248, y: 212, w: 464, h: 80 }, 'rummy-state-surface');
      ui.text(
        { x: 256, y: 216, w: 448, h: 28 },
        state.drawn ? 'Meld or discard' : 'Draw one card',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'rummy-public-state',
      );
      const active =
        ctx.seats.find((s) => s.seatIndex === state.turnSeatIndex)?.name ??
        'Player';
      ui.text(
        { x: 256, y: 248, w: 448, h: 40 },
        view.announcement || `${active}'s turn`,
        18,
        CLASSIC.secondary,
        undefined,
        false,
        'rummy-action-detail',
      );
      for (const [spot, text] of [
        [RUMMY_STOCK, `Stock ${state.stock.length}`],
        [RUMMY_DISCARD, 'Discard'],
      ] as const) {
        ui.surface(
          { x: spot.x - 66, y: 396, w: 132, h: 26 },
          `rummy-${text.startsWith('Stock') ? 'stock' : 'discard'}-label-surface`,
        );
        ui.text(
          { x: spot.x - 66, y: 396, w: 132, h: 26 },
          text,
          18,
          CLASSIC.secondary,
        );
      }
      if (!state.stock.length)
        ui.text(
          { x: RUMMY_STOCK.x - 64, y: 324, w: 128, h: 52 },
          'Empty',
          20,
          CLASSIC.quiet,
        );
      if (!state.discardPile.length)
        ui.text(
          { x: RUMMY_DISCARD.x - 64, y: 324, w: 128, h: 52 },
          'Empty',
          20,
          CLASSIC.quiet,
        );
    }
    const me = ctx.seats.find((s) => s.self),
      count = me ? (state.hands[String(me.seatIndex)]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'rummy-player-name',
      ctx.meSeatIndex ?? undefined,
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      me ? `${ownRummyDeadwood(state, me.seatIndex)} deadwood` : '',
      28,
      CLASSIC.cream,
      'left',
      true,
      'rummy-own-score',
    );
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      me
        ? `${count} cards${view.pages > 1 ? ` · ${view.page + 1}/${view.pages}` : ''}`
        : 'Spectating',
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished && !view.meldOpen) {
      const winner =
        ctx.seats.find((s) => s.seatIndex === state.winnerSeatIndex)?.name ??
        'Game complete';
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        'Winner',
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
        'rummy-result',
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
