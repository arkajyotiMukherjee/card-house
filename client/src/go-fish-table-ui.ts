import type { GoFishState } from '../../src/shared/games/go-fish';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import {
  goFishBookRows,
  goFishRankWord,
  goFishStockPosition,
} from './go-fish-classic-layout';
export interface GoFishPresentation {
  rank: string | null;
  target: number | null;
  page: number;
  pages: number;
  booksOpen: boolean;
  books: () => void;
  closeBooks: () => void;
}
export class GoFishTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: GoFishState,
    ctx: RenderContext,
    view: GoFishPresentation,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx)),
      finished = state.phase === 'finished';
    const mine =
      ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
    const choosing = mine && view.rank !== null && !finished && !view.booksOpen;
    ui.header(ctx.tableName?.trim() || 'Go Fish');
    ui.personalBand();
    for (const box of classicSeats(ctx.seats)) {
      const id = String(box.seat.seatIndex),
        count = state.hands[id]?.length ?? 0,
        books = state.books[id]?.length ?? 0;
      const active = state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'go-fish-player-name',
        box.seat.seatIndex,
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        `${count} ${count === 1 ? 'card' : 'cards'}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'go-fish-card-count',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: active ? 96 : box.w, h: 22 },
        `${books} ${books === 1 ? 'book' : 'books'}`,
        22,
        CLASSIC.cream,
        box.edge,
        true,
        'go-fish-book-count',
      );
      if (active)
        ui.text(
          { x: box.x + 96, y: box.y + 40, w: 72, h: 22 },
          'To ask',
          16,
          CLASSIC.accent,
          box.edge,
        );
    }
    if (finished || view.booksOpen) {
      ui.surface({ x: 244, y: 212, w: 472, h: 208 }, 'go-fish-books-surface');
      ui.text(
        { x: 252, y: 216, w: finished ? 456 : 344, h: 32 },
        finished ? 'Final books' : 'Book collection',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'go-fish-public-state',
      );
      if (!finished)
        ui.button({ x: 652, y: 216, w: 56, h: 32 }, 'Close', view.closeBooks);
      for (const [index, row] of goFishBookRows(state, ctx.seats).entries()) {
        const x = 252 + Math.floor(index / 3) * 232,
          y = 254 + (index % 3) * 54;
        ui.text(
          { x, y, w: 176, h: 24 },
          `${finished ? `${row.place}. ` : ''}${row.seat.name}`,
          17,
          finished && row.place === 1 ? CLASSIC.accent : CLASSIC.secondary,
          undefined,
          false,
          'go-fish-books-player-name',
        );
        ui.text(
          { x: x + 184, y: y - 2, w: 40, h: 28 },
          String(row.count),
          24,
          CLASSIC.cream,
          undefined,
          true,
          'go-fish-books-score',
        );
        if (!row.ranks.length)
          ui.text(
            { x, y: y + 25, w: 224, h: 22 },
            'No books yet',
            16,
            CLASSIC.quiet,
          );
        else
          for (const [rankIndex, rank] of row.ranks.entries()) {
            const left = x + (224 - row.ranks.length * 17) / 2 + rankIndex * 17;
            ui.text(
              { x: left, y: y + 25, w: 17, h: 22 },
              rank,
              16,
              CLASSIC.cream,
              undefined,
              true,
              'go-fish-book-rank',
            );
          }
      }
    } else {
      ui.surface({ x: 248, y: 212, w: 464, h: 80 }, 'go-fish-ask-surface');
      const last = state.lastAsk,
        from =
          ctx.seats.find((seat) => seat.seatIndex === last?.from)?.name ??
          'Player',
        to =
          ctx.seats.find((seat) => seat.seatIndex === last?.to)?.name ??
          'Player';
      const active =
        ctx.seats.find((seat) => seat.seatIndex === state.turnSeatIndex)
          ?.name ?? 'Player';
      const heading = choosing
        ? `Ask for ${goFishRankWord(view.rank!)}`
        : last
          ? last.given
            ? `${last.given} ${goFishRankWord(last.rank, last.given)} received`
            : 'Go Fish'
          : mine
            ? 'Choose a held rank'
            : `${active} to ask`;
      const detail = choosing
        ? view.target === null
          ? 'Choose a player'
          : 'Confirm your ask'
        : last
          ? last.given
            ? `${from} ← ${to}`
            : `${from} asked ${to} for ${goFishRankWord(last.rank)}`
          : mine
            ? 'Tap a card, then choose who to ask'
            : 'Collect four of one rank to make a book';
      ui.text(
        { x: 256, y: 216, w: 448, h: 28 },
        heading,
        24,
        CLASSIC.cream,
        undefined,
        true,
        'go-fish-public-state',
      );
      ui.text(
        { x: 256, y: 248, w: 448, h: 40 },
        detail,
        18,
        CLASSIC.secondary,
        undefined,
        false,
        'go-fish-ask-detail',
      );
      const stock = goFishStockPosition(choosing);
      ui.surface(
        { x: stock.x - 64, y: 382, w: 128, h: 30 },
        'go-fish-stock-count-surface',
      );
      ui.text(
        { x: stock.x - 64, y: 386, w: 128, h: 24 },
        `Stock ${state.stock.length}`,
        18,
        CLASSIC.quiet,
        undefined,
        false,
        'go-fish-stock-count',
      );
    }
    const me = ctx.seats.find((seat) => seat.self),
      count = me ? (state.hands[String(me.seatIndex)]?.length ?? 0) : 0,
      books = me ? (state.books[String(me.seatIndex)]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'go-fish-player-name',
      ctx.meSeatIndex ?? undefined,
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      me ? `${books} ${books === 1 ? 'book' : 'books'}` : '',
      28,
      CLASSIC.cream,
      'left',
      true,
    );
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      me
        ? `${count} ${count === 1 ? 'card' : 'cards'}${view.pages > 1 ? ` · ${view.page + 1}/${view.pages}` : ''}`
        : 'Spectating',
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      const leaders = goFishBookRows(state, ctx.seats).filter(
        (row) => row.place === 1,
      );
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        leaders.length > 1 ? 'Tied winners' : 'Winner',
        16,
        CLASSIC.secondary,
        'right',
      );
      ui.text(
        { x: 752, y: 462, w: 184, h: 40 },
        leaders.length > 1
          ? `${leaders.length} tied winners`
          : (leaders[0]?.seat.name ?? 'Game complete'),
        22,
        CLASSIC.accent,
        'right',
        true,
        'go-fish-result',
      );
      ui.text(
        { x: 752, y: 506, w: 184, h: 24 },
        ctx.finishedMessage === 'Entry fees refunded'
          ? ctx.finishedMessage
          : ctx.prizePool
            ? `${ctx.prizePool.toLocaleString()} chips ${leaders.length > 1 ? 'shared' : 'awarded'}`
            : 'Game complete',
        16,
        CLASSIC.secondary,
        'right',
      );
    }
  }
}
