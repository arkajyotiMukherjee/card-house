import type { SpadesState } from '../../src/shared/games/spades';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import { seatTeam } from './spades-layout';
import {
  spadesRailSeats,
  spadesTeamTotals,
  spadesPublicCards,
  spadesTrickPositions,
} from './spades-classic-layout';
export class SpadesTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: SpadesState,
    ctx: RenderContext,
    view: {
      page: number;
      pages: number;
      scoresOpen: boolean;
      handResult: string | null;
      close: () => void;
    },
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx)),
      finished = state.phase === 'finished';
    const me = ctx.seats.find((seat) => seat.self),
      mine =
        ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
    ui.header(ctx.tableName?.trim() || 'Spades');
    ui.personalBand();
    for (const box of classicSeats(spadesRailSeats(ctx.seats))) {
      const index = box.seat.seatIndex,
        bid = state.bids[String(index)],
        tricks = state.tricks[String(index)] ?? 0;
      const active = index === state.turnSeatIndex,
        partner = me && seatTeam(me.seatIndex) === seatTeam(index);
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'spades-player-name',
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        bid == null
          ? 'Not bid'
          : bid === 0
            ? tricks > 0
              ? 'Nil failed'
              : 'Nil'
            : `Bid ${bid}`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'spades-seat-bid',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        `${tricks} ${tricks === 1 ? 'trick' : 'tricks'}${partner ? ' · Partner' : ` · ${seatTeam(index).toUpperCase()}`}`,
        16,
        partner ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
      );
    }
    if (view.scoresOpen || finished) {
      ui.surface({ x: 244, y: 212, w: 472, h: 208 }, 'spades-score-surface');
      ui.text(
        { x: 252, y: 216, w: finished ? 456 : 344, h: 30 },
        finished
          ? 'Final scores'
          : `Partnership scores · Hand ${state.handNumber}`,
        24,
        CLASSIC.cream,
        undefined,
        true,
        'spades-public-state',
      );
      if (!finished)
        ui.button({ x: 642, y: 216, w: 66, h: 32 }, 'Close', view.close);
      for (const [index, team] of (['ns', 'ew'] as const).entries()) {
        const x = 252 + index * 232,
          total = spadesTeamTotals(state, team);
        const own = !!me && seatTeam(me.seatIndex) === team,
          winner = finished && state.winnerTeam === team;
        ui.text(
          { x, y: 254, w: 224, h: 26 },
          `${team.toUpperCase()}${winner ? ' · Winners' : own ? ' · Your team' : ''}`,
          20,
          winner || own ? CLASSIC.accent : CLASSIC.secondary,
          undefined,
          true,
        );
        ui.text(
          { x, y: 282, w: 224, h: 34 },
          `${state.scores[team]} points`,
          28,
          CLASSIC.cream,
          undefined,
          true,
          'spades-team-score',
        );
        ui.text(
          { x, y: 318, w: 224, h: 24 },
          `Bid ${total.bid}${total.pending ? '+' : ''} · Took ${total.tricks} · Bags ${state.bags[team]}`,
          16,
          CLASSIC.secondary,
        );
        ctx.seats
          .filter((seat) => seatTeam(seat.seatIndex) === team)
          .forEach((seat, row) =>
            ui.text(
              { x, y: 346 + row * 26, w: 224, h: 24 },
              seat.name,
              17,
              CLASSIC.secondary,
              undefined,
              false,
              'spades-team-player-name',
            ),
          );
      }
      if (view.handResult && !finished)
        ui.text(
          { x: 252, y: 400, w: 456, h: 18 },
          view.handResult,
          16,
          CLASSIC.quiet,
        );
    } else {
      ui.surface(
        { x: 244, y: 212, w: 472, h: state.stage === 'bid' ? 80 : 48 },
        'spades-team-summary',
      );
      for (const [index, team] of (['ns', 'ew'] as const).entries()) {
        const total = spadesTeamTotals(state, team),
          own = !!me && seatTeam(me.seatIndex) === team;
        ui.text(
          { x: 250 + index * 234, y: 214, w: 226, h: 24 },
          `${team.toUpperCase()}${own ? ' · Your team' : ''} · ${state.scores[team]} points`,
          20,
          own ? CLASSIC.accent : CLASSIC.cream,
          undefined,
          true,
        );
        ui.text(
          { x: 250 + index * 234, y: 238, w: 226, h: 20 },
          `Bid ${total.bid}${total.pending ? '+' : ''} · Took ${total.tricks} · Bags ${state.bags[team]}`,
          16,
          CLASSIC.quiet,
        );
      }
      if (state.stage === 'bid') {
        ui.text(
          { x: 252, y: 264, w: 456, h: 28 },
          mine
            ? 'Choose your bid'
            : `${ctx.seats.find((seat) => seat.seatIndex === state.turnSeatIndex)?.name ?? 'Player'} is bidding`,
          22,
          CLASSIC.cream,
          undefined,
          true,
          'spades-public-state',
        );
        if (!mine) {
          ui.text(
            { x: 252, y: 316, w: 456, h: 36 },
            'Count the tricks you expect to take',
            20,
            CLASSIC.secondary,
          );
          ui.text(
            { x: 252, y: 356, w: 456, h: 30 },
            view.handResult ?? 'Nil: take no tricks',
            18,
            CLASSIC.quiet,
          );
        }
      } else {
        const publicCards = spadesPublicCards(state),
          positions = spadesTrickPositions(publicCards.length),
          last = !state.trick.length && state.lastTrick;
        if (!publicCards.length)
          ui.text(
            { x: 252, y: 300, w: 456, h: 36 },
            mine ? 'Choose a card to lead' : 'Waiting for the lead',
            24,
            CLASSIC.cream,
            undefined,
            true,
            'spades-public-state',
          );
        for (const [index, played] of publicCards.entries()) {
          const pos = positions[index],
            name =
              ctx.seats.find((seat) => seat.seatIndex === played.seat)?.name ??
              'Player';
          ui.text(
            { x: pos.x - 54, y: 374, w: 108, h: 24 },
            name,
            16,
            played.seat === state.lastTrick?.winner && last
              ? CLASSIC.accent
              : CLASSIC.secondary,
            undefined,
            false,
            'spades-trick-player-name',
          );
        }
        const suit = state.trick[0]?.card.slice(-1),
          names: Record<string, string> = {
            C: 'Clubs',
            D: 'Diamonds',
            H: 'Hearts',
            S: 'Spades',
          };
        ui.surface({ x: 244, y: 402, w: 472, h: 26 }, 'spades-trump-surface');
        ui.text(
          { x: 250, y: 403, w: 460, h: 24 },
          last
            ? `${ctx.seats.find((seat) => seat.seatIndex === last.winner)?.name ?? 'Player'} won the last trick`
            : `${suit ? `Led ${names[suit]} · ` : ''}${state.spadesBroken ? 'Spades broken' : 'Spades held'}`,
          18,
          CLASSIC.secondary,
          undefined,
          false,
          'spades-trump-state',
        );
      }
    }
    const bid = me ? state.bids[String(me.seatIndex)] : null,
      took = me ? (state.tricks[String(me.seatIndex)] ?? 0) : 0,
      count = me ? (state.hands[String(me.seatIndex)]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'spades-player-name',
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      me
        ? bid == null
          ? `${count} cards`
          : bid === 0
            ? took > 0
              ? 'Nil failed'
              : 'Nil'
            : `Bid ${bid}`
        : '',
      28,
      CLASSIC.cream,
      'left',
      true,
    );
    const pageLabel = view.pages > 1 ? ` · ${view.page + 1}/${view.pages}` : '';
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      !me
        ? 'Spectating'
        : state.stage === 'bid' && bid == null
          ? view.pages > 1
            ? `Page ${view.page + 1}/${view.pages}`
            : ''
          : state.stage === 'bid'
            ? `${count} cards${pageLabel}`
            : `${took} ${took === 1 ? 'trick' : 'tricks'} · ${count} cards${pageLabel}`,
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      const team = state.winnerTeam;
      ui.text(
        { x: 752, y: 440, w: 184, h: 20 },
        'Winning partnership',
        16,
        CLASSIC.secondary,
        'right',
      );
      ui.text(
        { x: 752, y: 462, w: 184, h: 40 },
        team ? `${team.toUpperCase()} wins` : 'Game complete',
        24,
        CLASSIC.accent,
        'right',
        true,
        'spades-result',
      );
      ui.text(
        { x: 752, y: 506, w: 184, h: 24 },
        ctx.finishedMessage === 'Entry fees refunded'
          ? ctx.finishedMessage
          : ctx.prizePool
            ? `${ctx.prizePool.toLocaleString()} chips shared`
            : 'Game complete',
        16,
        CLASSIC.secondary,
        'right',
      );
    }
  }
}
