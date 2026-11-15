import { passDirection, type HeartsState } from '../../src/shared/games/hearts';
import { CLASSIC, classicSeats } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import { heartsAction, playHint } from './hearts-layout';
import {
  heartsPenaltySummary,
  heartsScoreRows,
  heartsHandPoints,
  heartsSeatOrder,
  heartsPassTarget,
} from './hearts-classic-layout';
export interface HeartsPresentation {
  selected: number;
  page: number;
  pages: number;
  scoresOpen: boolean;
  notice: string;
  closeScores: () => void;
}
export class HeartsTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: HeartsState,
    ctx: RenderContext,
    view: HeartsPresentation,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx)),
      finished = state.phase === 'finished',
      action = heartsAction(state, ctx.meSeatIndex);
    ui.header(ctx.tableName?.trim() || 'Hearts');
    ui.personalBand();
    for (const box of classicSeats(heartsSeatOrder(ctx.seats))) {
      const id = String(box.seat.seatIndex),
        count = state.hands[id]?.length ?? 0,
        pts = heartsHandPoints(state.tricksTaken[id] ?? []);
      const active =
        state.phase === 'play' && state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y - 14, w: box.w, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'hearts-player-name',
      );
      ui.text(
        { x: box.x, y: box.y + 8, w: box.w, h: 30 },
        `${state.scores[id] ?? 0} total`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'hearts-running-score',
      );
      ui.text(
        { x: box.x, y: box.y + 40, w: box.w, h: 22 },
        state.phase === 'pass' && state.passes[id]
          ? 'Pass ready'
          : `${count} cards · ${pts} hand`,
        16,
        active ? CLASSIC.accent : CLASSIC.quiet,
        box.edge,
        false,
        'hearts-hand-score',
      );
    }
    if (finished || view.scoresOpen) {
      ui.surface({ x: 244, y: 212, w: 472, h: 208 }, 'hearts-scores-surface');
      ui.text(
        { x: 252, y: 216, w: finished ? 456 : 344, h: 32 },
        finished ? 'Final scores · lowest wins' : 'Scores · lowest wins',
        24,
        CLASSIC.cream,
        undefined,
        true,
        'hearts-public-state',
      );
      if (!finished)
        ui.button({ x: 652, y: 216, w: 56, h: 32 }, 'Close', view.closeScores);
      const rows = heartsScoreRows(state, ctx.seats);
      for (const [index, row] of rows.entries()) {
        const y = 252 + index * 34;
        ui.text(
          { x: 252, y, w: 244, h: 24 },
          `${row.place}. ${row.seat.name}`,
          17,
          finished && row.place === 1 ? CLASSIC.accent : CLASSIC.secondary,
          undefined,
          false,
          'hearts-score-player-name',
        );
        ui.text(
          { x: 500, y, w: 66, h: 26 },
          String(row.score),
          22,
          CLASSIC.cream,
          undefined,
          true,
          'hearts-score-total',
        );
        ui.text(
          { x: 570, y, w: 138, h: 24 },
          heartsPenaltySummary(
            state.tricksTaken[String(row.seat.seatIndex)] ?? [],
          ),
          16,
          CLASSIC.quiet,
          undefined,
          false,
          'hearts-penalties',
        );
      }
      ui.text(
        { x: 252, y: 392, w: 456, h: 24 },
        view.notice || 'Each heart = 1 · Q♠ = 13',
        16,
        CLASSIC.quiet,
      );
    } else {
      ui.surface(
        { x: 248, y: 212, w: 464, h: state.phase === 'pass' ? 80 : 64 },
        'hearts-trick-surface',
      );
      const submitted =
        ctx.meSeatIndex !== null &&
        state.passes[String(ctx.meSeatIndex)] !== undefined;
      const active =
        ctx.seats.find((seat) => seat.seatIndex === state.turnSeatIndex)
          ?.name ?? 'Player';
      const target = heartsPassTarget(state, ctx.seats, ctx.meSeatIndex);
      const heading =
        state.phase === 'pass'
          ? `Pass 3 ${passDirection(state.handIndex)}`
          : state.currentTrick.length === 0 && view.notice
            ? view.notice
            : action === 'play'
              ? playHint(state, ctx.meSeatIndex)
              : `${active} to play`;
      const suit = state.currentTrick[0]?.card.slice(-1),
        suits: Record<string, string> = {
          C: 'Clubs',
          D: 'Diamonds',
          H: 'Hearts',
          S: 'Spades',
        };
      const detail =
        state.phase === 'pass'
          ? submitted
            ? `Pass submitted${target ? ` to ${target.name}` : ''} · waiting for others`
            : `${target ? `To ${target.name} · ` : ''}${view.notice.includes('moon') ? view.notice : 'Select three cards'}`
          : `Hand ${state.handIndex + 1} · ${suit ? `Led ${suits[suit]} · ` : action === 'play' && view.notice ? `${playHint(state, ctx.meSeatIndex)} · ` : ''}${state.heartsBroken ? 'Hearts broken' : 'Hearts unbroken'}`;
      ui.text(
        { x: 256, y: 216, w: 448, h: 28 },
        heading,
        24,
        CLASSIC.cream,
        undefined,
        true,
        'hearts-public-state',
      );
      ui.text(
        { x: 256, y: 248, w: 448, h: state.phase === 'pass' ? 40 : 24 },
        detail,
        18,
        CLASSIC.secondary,
        undefined,
        false,
        'hearts-public-detail',
      );
      for (const [index, play] of state.currentTrick.entries()) {
        const name =
          ctx.seats.find((seat) => seat.seatIndex === play.seat)?.name ??
          'Player';
        ui.text(
          { x: 244 + index * 120, y: 374, w: 112, h: 26 },
          name,
          16,
          index === 0 ? CLASSIC.accent : CLASSIC.secondary,
          undefined,
          false,
          'hearts-trick-player-name',
        );
      }
    }
    const me = ctx.seats.find((seat) => seat.self),
      id = String(me?.seatIndex),
      count = me ? (state.hands[id]?.length ?? 0) : 0;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      me?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'hearts-player-name',
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      me ? `${state.scores[id] ?? 0} points` : '',
      28,
      CLASSIC.cream,
      'left',
      true,
    );
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      me
        ? `${count} cards · ${heartsHandPoints(state.tricksTaken[id] ?? [])} hand${view.pages > 1 ? ` · ${view.page + 1}/${view.pages}` : ''}`
        : 'Spectating',
      16,
      CLASSIC.quiet,
      'left',
    );
    if (finished) {
      const leaders = heartsScoreRows(state, ctx.seats).filter(
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
        'hearts-result',
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
