import {
  CRAZY_EIGHTS_SUIT_NAMES,
  type CrazyEightsState,
  type CrazyEightsSuit,
} from '../../src/shared/games/crazy-eights';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import {
  CRAZY_EIGHTS_STOCK,
  CRAZY_EIGHTS_DISCARD,
} from './crazy-eights-classic-layout';
import { suitBadge } from './crazy-eights-layout';
export interface CrazyEightsPresentation {
  selected: string | null;
  suit: CrazyEightsSuit | null;
  naming: boolean;
  page: number;
  pages: number;
}
export class CrazyEightsTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: CrazyEightsState,
    ctx: RenderContext,
    view: CrazyEightsPresentation,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx)),
      finished = state.phase === 'finished';
    ui.header(ctx.tableName?.trim() || 'Crazy Eights');
    ui.personalBand();
    for (const box of classicSeats(ctx.seats)) {
      const count = state.hands[String(box.seat.seatIndex)]?.length ?? 0,
        active = state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'crazy-eights-player-name',
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        `${count} ${count === 1 ? 'card' : 'cards'}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'crazy-eights-card-count',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        finished && state.winnerSeatIndex === box.seat.seatIndex
          ? 'Winner'
          : active
            ? 'To play'
            : '',
        16,
        active ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
      );
    }
    ui.surface({ x: 248, y: 212, w: 464, h: 64 }, 'crazy-eights-state-surface');
    ui.text(
      { x: 256, y: 216, w: 448, h: 28 },
      view.naming
        ? view.suit
          ? `Next suit · ${CRAZY_EIGHTS_SUIT_NAMES[view.suit]}`
          : 'Choose the next suit'
        : suitBadge(state).text,
      24,
      CLASSIC.cream,
      undefined,
      true,
      'crazy-eights-public-state',
    );
    ui.text(
      { x: 256, y: 248, w: 448, h: 24 },
      view.naming
        ? 'Name a suit, then play your eight'
        : finished
          ? 'Hand complete'
          : 'Match the suit or rank · Eights are wild',
      18,
      CLASSIC.secondary,
      undefined,
      false,
      'crazy-eights-state-detail',
    );
    if (!view.naming) {
      for (const [position, label] of [
        [
          CRAZY_EIGHTS_STOCK,
          state.stock.length === 0 && state.discardPile.length > 1
            ? 'Stock 0 · Refill'
            : `Stock ${state.stock.length}`,
        ],
        [CRAZY_EIGHTS_DISCARD, 'Top discard'],
      ] as const) {
        ui.surface(
          { x: position.x - 72, y: 386, w: 144, h: 26 },
          `crazy-eights-${label.startsWith('Stock') ? 'stock' : 'discard'}-caption-surface`,
        );
        ui.text(
          { x: position.x - 72, y: 386, w: 144, h: 26 },
          label,
          18,
          CLASSIC.quiet,
          undefined,
          false,
          label.startsWith('Stock')
            ? 'crazy-eights-stock-count'
            : 'crazy-eights-discard-caption',
        );
      }
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
      'crazy-eights-player-name',
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
        : view.pages > 1
          ? `Page ${view.page + 1}/${view.pages}`
          : '',
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      const winner =
          ctx.seats.find((seat) => seat.seatIndex === state.winnerSeatIndex)
            ?.name ?? 'Hand complete',
        score = state.scores[String(state.winnerSeatIndex)] ?? 0;
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        `Winner · ${score} points`,
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
        'crazy-eights-result',
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
