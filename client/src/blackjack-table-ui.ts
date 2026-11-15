import {
  blackjackStake,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { CLASSIC } from './classic-table-design';
import { ClassicTableUi, type ClassicBox } from './classic-table-ui';
import type { RenderContext } from './game-driver';
import {
  blackjackActionBoxes,
  blackjackFooterSeat,
  blackjackHandCaption,
  blackjackRailSeats,
  blackjackShownDealer,
} from './blackjack-classic-layout';
export interface BlackjackControl {
  target: string;
  label: string;
  enabled?: boolean;
}
export interface BlackjackPresentation {
  footerHand: number;
  footerPage: number;
  footerPages: number;
  dealerPage: number;
  dealerPages: number;
  focusSeat: number | null;
  focusHand: number;
  focusPage: number;
  focusPages: number;
  controls: BlackjackControl[];
  act: (target: string) => void;
}
export class BlackjackTableUi {
  private ui?: ClassicTableUi;
  clear(): void {
    this.ui?.clear();
    this.ui = undefined;
  }
  render(
    state: BlackjackState,
    ctx: RenderContext,
    view: BlackjackPresentation,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const ui = (this.ui = new ClassicTableUi(ctx));
    ui.header(
      ctx.tableName?.trim() || 'Blackjack',
      `${state.minBet ?? 10}–${state.maxBet ?? 50} chips\nBlackjack pays 3:2`,
    );
    ui.personalBand();
    const button = (
      box: ClassicBox,
      label: string,
      target: string,
      edge?: 'left' | 'right',
    ): void =>
      ui.button(
        box,
        label,
        () => view.act(target),
        edge,
        target === 'surrender',
      );
    ui.text(
      { x: 264, y: 64, w: 432, h: 26 },
      blackjackShownDealer(state),
      22,
      CLASSIC.cream,
      undefined,
      true,
      'blackjack-dealer-total',
    );
    if (view.dealerPages > 1) {
      button({ x: 228, y: 112, w: 36, h: 40 }, '‹', 'dealer-prev');
      button({ x: 696, y: 112, w: 36, h: 40 }, '›', 'dealer-next');
    }
    for (const box of blackjackRailSeats(ctx.seats)) {
      const row = state.seats[String(box.seat.seatIndex)];
      if (!row) continue;
      const active = state.turnSeatIndex === box.seat.seatIndex;
      ui.text(
        { x: box.x, y: box.y, w: 168, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        false,
        'blackjack-player-name',
      );
      ui.text(
        { x: box.x, y: box.y + 22, w: 168, h: 30 },
        `${row.chips.toLocaleString('en-US')} chips`,
        24,
        CLASSIC.cream,
        box.edge,
        true,
        'blackjack-player-stack',
      );
      ui.text(
        { x: box.x, y: box.y + 54, w: 168, h: 24 },
        row.hands.length
          ? `Bet ${blackjackStake(row).toLocaleString('en-US')} · ${row.hands.length} ${row.hands.length === 1 ? 'hand' : 'hands'}`
          : 'Awaiting wager',
        16,
        CLASSIC.quiet,
        box.edge,
      );
      button(
        { x: box.x + 28, y: box.y + 80, w: 112, h: 30 },
        row.hands.length ? 'View hands' : 'View',
        `view:${box.seat.seatIndex}`,
        box.edge,
      );
    }
    const focus = ctx.seats.find((seat) => seat.seatIndex === view.focusSeat),
      row = focus ? state.seats[String(focus.seatIndex)] : undefined;
    const hand = row?.hands[view.focusHand];
    if (hand && focus) {
      ui.surface({ x: 244, y: 208, w: 472, h: 78 }, 'blackjack-focus-surface');
      ui.text(
        { x: 252, y: 212, w: 456, h: 28 },
        focus.name,
        22,
        CLASSIC.cream,
        undefined,
        true,
        'blackjack-focus-player-name',
      );
      ui.text(
        { x: 296, y: 244, w: 368, h: 30 },
        `Hand ${view.focusHand + 1}/${row!.hands.length} · ${blackjackHandCaption(hand, row!.results[view.focusHand])}`,
        18,
        CLASSIC.secondary,
        undefined,
        false,
        'blackjack-focus-total',
      );
      if (row!.hands.length > 1) {
        button({ x: 244, y: 244, w: 40, h: 36 }, '‹', 'focus-hand-prev');
        button({ x: 676, y: 244, w: 40, h: 36 }, '›', 'focus-hand-next');
      }
      if (view.focusPages > 1) {
        button({ x: 244, y: 318, w: 40, h: 40 }, '‹', 'focus-card-prev');
        button({ x: 676, y: 318, w: 40, h: 40 }, '›', 'focus-card-next');
        ui.text(
          { x: 340, y: 376, w: 280, h: 22 },
          `Cards · Page ${view.focusPage + 1}/${view.focusPages}`,
          16,
          CLASSIC.quiet,
        );
      }
    } else {
      ui.surface({ x: 264, y: 240, w: 432, h: 96 }, 'blackjack-house-surface');
      ui.text(
        { x: 272, y: 244, w: 416, h: 36 },
        state.phase === 'finished'
          ? 'Round complete'
          : state.step === 'bet'
            ? state.turnSeatIndex === ctx.meSeatIndex
              ? 'Place your wager'
              : 'Collecting wagers'
            : state.step === 'insurance'
              ? 'Dealer shows an Ace'
              : 'Play against the house',
        24,
        CLASSIC.cream,
        undefined,
        true,
      );
      ui.text(
        { x: 280, y: 282, w: 400, h: 42 },
        'Dealer stands on soft 17',
        18,
        CLASSIC.secondary,
      );
    }
    const footer = blackjackFooterSeat(ctx.seats),
      own = footer ? state.seats[String(footer.seatIndex)] : undefined;
    ui.text(
      { x: 24, y: 446, w: 176, h: 22 },
      footer?.name ?? 'Watching',
      17,
      CLASSIC.secondary,
      'left',
      false,
      'blackjack-player-name',
    );
    ui.text(
      { x: 24, y: 470, w: 176, h: 32 },
      own ? `${own.chips.toLocaleString('en-US')} chips` : 'Spectating',
      28,
      CLASSIC.cream,
      'left',
      true,
    );
    ui.text(
      { x: 16, y: 508, w: 192, h: 20 },
      own
        ? `${ctx.meSeatIndex === null ? 'Spectating · ' : ''}Bet ${blackjackStake(own).toLocaleString('en-US')}${own.insurance ? ` · Ins ${own.insurance}` : own.evenMoney ? ' · Even money' : ''}`
        : 'Public player hands',
      16,
      CLASSIC.quiet,
      'left',
    );
    const ownHand = own?.hands[view.footerHand];
    if (ownHand) {
      ui.surface(
        { x: 220, y: 400, w: 436, h: 32 },
        'blackjack-local-total-surface',
      );
      ui.text(
        {
          x: own!.hands.length > 1 ? 260 : 224,
          y: 402,
          w: own!.hands.length > 1 ? 356 : 428,
          h: 28,
        },
        `Hand ${view.footerHand + 1}/${own!.hands.length} · ${blackjackHandCaption(ownHand, own!.results[view.footerHand])}`,
        18,
        CLASSIC.cream,
        undefined,
        false,
        'blackjack-local-total',
      );
      if (own!.hands.length > 1) {
        button({ x: 220, y: 400, w: 32, h: 32 }, '‹', 'footer-hand-prev');
        button({ x: 624, y: 400, w: 32, h: 32 }, '›', 'footer-hand-next');
      }
    }
    if (view.footerPages > 1) {
      button({ x: 220, y: 464, w: 28, h: 44 }, '‹', 'footer-card-prev');
      button({ x: 628, y: 464, w: 28, h: 44 }, '›', 'footer-card-next');
    }
    const boxes = blackjackActionBoxes(view.controls.length);
    for (const [index, control] of view.controls.entries())
      button(boxes[index], control.label, control.target, 'right');
    if (!view.controls.length) {
      const me =
        ctx.meSeatIndex === null
          ? undefined
          : state.seats[String(ctx.meSeatIndex)];
      const active = ctx.seats.find(
        (seat) => seat.seatIndex === state.turnSeatIndex,
      )?.name;
      const finished = state.phase === 'finished';
      ui.text(
        { x: 676, y: finished ? 440 : 446, w: 260, h: finished ? 26 : 36 },
        finished
          ? me?.results[view.footerHand]
            ? `Hand ${view.footerHand + 1} · ${me.results[view.footerHand][0].toUpperCase() + me.results[view.footerHand].slice(1)}`
            : 'Round complete'
          : ctx.meSeatIndex === null
            ? 'Spectating'
            : `${active ?? 'Dealer'}’s turn`,
        22,
        CLASSIC.accent,
        'right',
        true,
        'blackjack-personal-status',
      );
      if (finished) {
        const remaining =
          ctx.houseGame?.nextHandAt === undefined
            ? undefined
            : Math.max(
                0,
                Math.ceil((ctx.houseGame.nextHandAt - Date.now()) / 1000),
              );
        ui.text(
          { x: 676, y: 466, w: 260, h: 22 },
          remaining === undefined
            ? 'Reviewing the round'
            : `Next round in ${remaining}s`,
          16,
          CLASSIC.secondary,
          'right',
          false,
          'blackjack-next-round',
        );
        if (ctx.houseGame?.topUp)
          button(
            { x: 740, y: 490, w: 132, h: 40 },
            'Top up',
            'top-up',
            'right',
          );
      }
    }
  }
}
