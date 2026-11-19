import { ClassicTableUi } from './classic-table-ui';
import * as ex from 'excalibur';
import {
  POKER_VARIATION_LABELS,
  pokerBlindMark,
  pokerCallAmount,
  pokerHoleFaceUp,
  type PokerState,
} from '../../src/shared/games/poker';
import { chipAtlas } from './boot-scene';
import { bindButtonPress } from './button-press';
import { handCardScale } from './card-sizing';
import {
  CLASSIC,
  classicFrame,
  classicHeader,
  classicSeats,
  classicText,
} from './classic-table-design';
import type { RenderContext } from './game-driver';
import { isMobileDevice } from './mobile-shell';
import {
  faceForPokerCard,
  pokerPersonalMode,
  potChipStacks,
  POKER_CHIP_FACE_SCALE,
  POKER_CHIP_LAYER_GAP,
} from './poker-layout';
import { anchorTableActor, tableGutter } from './table-viewport';
import { uiText } from './ui-text';
import { hasPokerPotLayers } from './poker-pots';
import { PokerPotsUi } from './poker-pots-ui';
import { pokerPotWinners } from '../../src/shared/games/poker';

export const POKER_CENTER = { x: 244, y: 222, w: 472, h: 200 } as const;
export const pokerSeatPanels = classicSeats;

export function pokerPanelCopy(
  state: PokerState,
  seat: number | null,
  seats: readonly { seatIndex: number; name: string }[],
  announcement = '',
): { title: string; detail: string; highlight: boolean } {
  const mode = pokerPersonalMode(state, seat);
  const mine = seat === null ? undefined : state.seats[String(seat)];
  const turnName = seats.find(
    (player) => player.seatIndex === state.turnSeatIndex,
  )?.name;
  if (mode === 'result') {
    const winners = state.winnerSeatIndexes;
    const ownWin = seat !== null && winners.includes(seat);
    const winner =
      seats.find((player) => player.seatIndex === winners[0])?.name ?? 'Player';
    const rank =
      state.end === 'fold'
        ? 'Uncalled hand'
        : (state.hands[String(winners[0])]?.name ?? 'Hand complete');
    return {
      title:
        winners.length > 1
          ? state.pots.length > 1 &&
            state.pots.some(
              (pot) => pokerPotWinners(state, pot).length !== winners.length,
            )
            ? 'Different pot winners'
            : `Split pot · ${winners.length} winners`
          : ownWin
            ? 'You win'
            : `${winner} wins`,
      detail: rank.charAt(0).toUpperCase() + rank.slice(1),
      highlight: ownWin,
    };
  }
  if (mode === 'acting')
    return {
      title:
        pokerCallAmount(state, seat!) > 0
          ? `Your turn · Call ${pokerCallAmount(state, seat!)}`
          : 'Your turn · Check or bet',
      detail: '',
      highlight: true,
    };
  if (mode === 'discard')
    return {
      title: 'Discard 1 card',
      detail: 'Tap a card · Hold to inspect',
      highlight: true,
    };
  return {
    title: mine?.folded
      ? 'You folded'
      : mine?.allIn
        ? 'You’re all-in'
        : turnName
          ? state.step === 'discard'
            ? `${turnName} is discarding`
            : `${turnName}’s turn`
          : 'Dealing cards',
    detail:
      mine?.folded || mine?.allIn
        ? `${turnName ? (state.step === 'discard' ? `${turnName} is discarding` : `${turnName}’s turn`) : 'Dealing community cards'}${announcement ? `\n${announcement}` : ''}`
        : announcement ||
          `${state.smallBlind}/${state.bigBlind} blinds · ${state.limit === 'pot-limit' ? 'Pot-limit' : 'No-limit'}`,
    highlight: false,
  };
}

/** A result never exposes a folded hand or an uncalled winner's private cards. */
export function showdownSeats(state: PokerState): number[] {
  if (state.phase !== 'finished' || state.end !== 'showdown') return [];
  const eligible = state.order.filter((index) => pokerHoleFaceUp(state, index));
  return [
    ...eligible.filter((index) => state.winnerSeatIndexes.includes(index)),
    ...eligible.filter((index) => !state.winnerSeatIndexes.includes(index)),
  ];
}

export class PokerTableUi {
  private actors: ex.Actor[] = [];
  private readonly potsUi = new PokerPotsUi();
  get isPotDetailsOpen(): boolean {
    return this.potsUi.isOpen;
  }
  private selectedHand = -1;
  private handNumber = -1;
  reviewSeat: number | undefined;

  clear(reset = false): void {
    this.potsUi.clear(reset);
    for (const actor of this.actors) actor.kill();
    this.actors = [];
    if (reset) {
      this.selectedHand = -1;
      this.handNumber = -1;
      this.reviewSeat = undefined;
    }
  }

  render(
    state: PokerState,
    ctx: RenderContext,
    announcement: string,
    _rerender: () => void,
    staking = false,
  ): void {
    this.clear();
    if (state.phase === 'lobby') return;
    const add = (actor: ex.Actor): ex.Actor => {
      ctx.scene.add(actor);
      this.actors.push(actor);
      return actor;
    };
    const label = (
      box: { x: number; y: number; w: number; h: number },
      text: string,
      size = 18,
      color: string = CLASSIC.cream,
      edge?: 'left' | 'right',
      name = 'poker-ui-label',
      body = false,
      seatIndex?: number,
    ): ex.Text => {
      if (seatIndex !== undefined) {
        const player = new ClassicTableUi(ctx);
        const actor = player.text(
          box,
          text,
          size,
          color,
          edge,
          false,
          name,
          seatIndex,
        );
        this.actors.push(actor);
        return actor.graphics.current as ex.Text;
      }
      const textGraphic = (size: number): ex.Text =>
        body
          ? uiText(text, size, ex.Color.fromHex(color))
          : classicText(text, size, color);
      let graphic = textGraphic(size);
      while (graphic.width > box.w && size > 16) graphic = textGraphic(--size);
      if (name === 'poker-panel-detail') {
        graphic.maxWidth = box.w;
        graphic.text = text;
      }
      const actor = new ex.Actor({
        name,
        pos: ex.vec(box.x, box.y),
        anchor: ex.vec(0, 0),
        width: box.w,
        height: box.h,
        z: 25,
      });
      actor.graphics.use(graphic);
      let previousText: string | undefined;
      const center = (): void => {
        if (previousText === graphic.text) return;
        previousText = graphic.text;
        actor.graphics.offset = ex.vec(
          (box.w - graphic.width) / 2,
          (box.h - graphic.height) / 2,
        );
      };
      center();
      actor.on('postupdate', center);
      actor.pointer.useGraphicsBounds = false;
      actor.pointer.useColliderShape = false;
      if (edge) anchorTableActor(actor, edge);
      add(actor);
      return graphic;
    };
    const frame = (
      x: number,
      y: number,
      w: number,
      h: number,
      hot = false,
      edge?: 'left' | 'right',
      fill: string = CLASSIC.felt,
      border: string | null = CLASSIC.gold,
    ): ex.Actor => {
      const actor = new ex.Actor({
        pos: ex.vec(x, y),
        anchor: ex.vec(0, 0),
        width: w,
        height: h,
        z: 22,
      });
      actor.graphics.use(classicFrame(w, h, fill, hot, border));
      if (edge) anchorTableActor(actor, edge);
      return add(actor);
    };
    const button = (
      box: { x: number; y: number; w: number; h: number },
      caption: string,
      action: () => void,
      edge?: 'left' | 'right',
      fill?: string,
    ): void => {
      const actor = frame(
        box.x,
        box.y,
        box.w,
        box.h,
        false,
        edge,
        fill,
        fill === CLASSIC.danger ? CLASSIC.gold : CLASSIC.softBorder,
      );
      const text = uiText(caption, 17, ex.Color.fromHex(CLASSIC.cream));
      const child = new ex.Actor({
        pos: ex.vec((box.w - text.width) / 2, (box.h - text.height) / 2),
        anchor: ex.vec(0, 0),
      });
      child.graphics.use(text);
      actor.addChild(child);
      actor.collider.useBoxCollider(box.w, box.h, ex.vec(0, 0));
      bindButtonPress(actor, undefined, undefined, () => {
        if (!ctx.inputBlocked()) action();
      });
    };
    const band = frame(8, 436, 944, 96, false, undefined, '#103c27', null);
    band.graphics.use(
      new ex.Canvas({
        width: 944,
        height: 96,
        draw: (g) => {
          g.fillStyle = '#103c27';
          g.fillRect(0, 0, 944, 96);
          g.strokeStyle = '#3b7150';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(0, 0.5);
          g.lineTo(944, 0.5);
          g.stroke();
        },
      }),
    );
    band.name = 'poker-personal-band';
    band.z = 5;
    {
      const fit = (): void => {
        band.pos.x = 8 - tableGutter();
        band.graphics.current!.scale.x = (944 + 2 * tableGutter()) / 944;
      };
      band.on('postupdate', fit);
      fit();
    }
    const header = classicHeader(isMobileDevice());
    if (ctx.navigation) {
      button(
        header.leave,
        'Leave Table',
        ctx.navigation.leave,
        'left',
        CLASSIC.danger,
      );
      if (ctx.navigation.chatAvailable)
        button(header.chat, 'Chat', ctx.navigation.chat, 'left');
      button(header.help, '?', ctx.navigation.help, 'right');
    }
    const phase =
      state.phase === 'finished'
        ? state.end === 'showdown'
          ? 'Showdown'
          : 'Hand complete'
        : state.step === 'discard'
          ? `${state.street} · Discard`
          : state.street;
    label(
      { x: 312, y: 16, w: 336, h: 40 },
      `${POKER_VARIATION_LABELS[state.variation]} · ${phase[0].toUpperCase()}${phase.slice(1)}`,
      20,
    );
    label(
      { x: 670, y: 16, w: 210, h: 40 },
      `${state.limit === 'no-limit' ? 'No-limit' : 'Pot-limit'} · ${ctx.seats.length} players\nHand ${state.handNumber}`,
      14,
      CLASSIC.quiet,
      'right',
      'poker-table-meta',
      true,
    );

    const finished = state.phase === 'finished';
    const eligible = showdownSeats(state).filter((seat) =>
      state.winnerSeatIndexes.includes(seat),
    );
    if (this.handNumber !== state.handNumber) {
      this.handNumber = state.handNumber;
      this.selectedHand = -1;
    }
    if (!eligible.includes(this.selectedHand))
      this.selectedHand =
        (state.pots[0]
          ? pokerPotWinners(state, state.pots[0])[0]
          : undefined) ??
        eligible[0] ??
        -1;
    this.reviewSeat = this.selectedHand < 0 ? undefined : this.selectedHand;
    for (const box of classicSeats(ctx.seats)) {
      const index = box.seat.seatIndex,
        row = state.seats[String(index)];
      if (!row) continue;
      const active = state.phase === 'play' && state.turnSeatIndex === index;
      const winner =
        state.phase === 'finished' && state.winnerSeatIndexes.includes(index);
      if (finished) {
        if (winner) {
          label(
            { x: box.x, y: box.edge ? box.y : 76, w: box.w, h: 24 },
            box.seat.name,
            17,
            CLASSIC.accent,
            box.edge,
            'poker-player-name',
            true,
            box.seat.seatIndex,
          );
          label(
            { x: box.x, y: box.edge ? box.y + 24 : 100, w: box.w, h: 28 },
            `${row.chips.toLocaleString()} chips`,
            22,
            CLASSIC.cream,
            box.edge,
            'poker-player-stack',
          );
        }
        continue;
      }
      label(
        { x: box.x + 4, y: box.y, w: box.w - 8, h: 22 },
        box.seat.name,
        17,
        active ? CLASSIC.accent : CLASSIC.secondary,
        box.edge,
        'poker-player-name',
        true,
        box.seat.seatIndex,
      );
      const blind =
        pokerBlindMark(state, index) ??
        (state.dealerSeatIndex === index ? 'D' : '');
      label(
        { x: box.x, y: box.y + 22, w: box.w, h: 28 },
        state.phase === 'play' && row.allIn
          ? `All-in ${row.committed}`
          : `${row.chips.toLocaleString()} chips`,
        22,
        winner
          ? CLASSIC.accent
          : row.folded
            ? CLASSIC.secondary
            : CLASSIC.cream,
        box.edge,
        'poker-player-stack',
      );
      const note = row.folded
        ? 'Folded'
        : state.phase === 'finished'
          ? (state.hands[String(index)]?.name ?? '')
          : row.mustDiscard
            ? 'Discarding'
            : row.allIn
              ? 'All-in'
              : row.streetBet > 0
                ? `Bet ${row.streetBet}`
                : active
                  ? 'To act'
                  : '';
      label(
        { x: box.x, y: box.y + 52, w: box.w, h: 20 },
        [
          blind,
          state.phase === 'finished' &&
          state.winnerSeatIndexes.length > 1 &&
          winner
            ? `Won · ${note}`
            : note,
        ]
          .filter(Boolean)
          .join(' · '),
        16,
        state.phase === 'play' && (row.allIn || active)
          ? CLASSIC.accent
          : CLASSIC.quiet,
        box.edge,
        'poker-seat-status',
        true,
      );
      const faceUp = pokerHoleFaceUp(state, index);
      if (row.folded) continue;
      const scale = faceUp
        ? row.hole.length <= 2
          ? handCardScale(isMobileDevice())
          : 1
        : 0.9;
      const step = faceUp ? (row.hole.length <= 2 ? 58 : 32) : 15;
      for (const [cardIndex, cardId] of row.hole.entries()) {
        const face = faceForPokerCard(cardId);
        if (!face) continue;
        const x =
          box.x + box.w / 2 + (cardIndex - (row.hole.length - 1) / 2) * step;
        const y = box.y - (faceUp ? 46 : 34);
        const card = new ex.Actor({
          name: faceUp ? 'showdown-card' : 'opponent-card-back',
          pos: ex.vec(x, y),
          anchor: ex.vec(0.5, 0.5),
          z: 12 + cardIndex,
        });
        card.addTag(`seat-${index}`);
        card.graphics.use(faceUp ? ctx.cards.sprite(face) : ctx.cards.back());
        card.scale = ex.vec(scale, scale);
        if (!faceUp)
          card.rotation = (cardIndex - (row.hole.length - 1) / 2) * 0.06;
        card.pointer.useGraphicsBounds = false;
        card.pointer.useColliderShape = false;
        if (box.edge) anchorTableActor(card, box.edge);
        add(card);
      }
    }
    if (finished) {
      const winner = this.selectedHand;
      const row = state.seats[String(winner)];
      const owner =
        ctx.seats.find((seat) => seat.seatIndex === winner)?.name ?? '';
      label(
        { x: 244, y: 130, w: 472, h: 32 },
        row
          ? `${eligible.length > 1 ? owner : 'Winning hand'} · ${state.hands[String(winner)]?.name ?? ''}`
          : 'Uncalled hand · Private cards stay hidden',
        20,
        CLASSIC.cream,
        undefined,
        'winner-focus-caption',
      );
      if (row)
        for (const [index, id] of row.hole.entries()) {
          const face = faceForPokerCard(id);
          if (!face) continue;
          const card = new ex.Actor({
            name: 'winner-focus-card',
            pos: ex.vec(480 + (index - (row.hole.length - 1) / 2) * 90, 218),
            z: 15,
          });
          card.graphics.use(ctx.cards.sprite(face));
          card.scale = ex.vec(1.8, 1.8);
          card.addTag(`seat-${winner}`);
          card.pointer.useGraphicsBounds = false;
          card.pointer.useColliderShape = false;
          add(card);
        }
      if (eligible.length > 1)
        button({ x: 688, y: 192, w: 72, h: 38 }, 'Next', () => {
          this.selectedHand =
            eligible[(eligible.indexOf(winner) + 1) % eligible.length];
          _rerender();
        });
    } else if (!hasPokerPotLayers(state)) {
      const pot = CLASSIC.pot;
      frame(
        pot.x,
        pot.y,
        pot.w,
        pot.h,
        false,
        undefined,
        CLASSIC.felt,
        null,
      ).name = 'poker-pot-badge';
      label(
        { x: pot.x + 8, y: pot.y + 6, w: pot.w - 16, h: 20 },
        'POT · CHIPS',
        14,
        CLASSIC.quiet,
        undefined,
        'poker-pot-caption',
        true,
      );
      label(
        { x: pot.x + 8, y: pot.y + 25, w: pot.w - 16, h: 40 },
        state.pot.toLocaleString(),
        32,
        CLASSIC.cream,
        undefined,
        'poker-pot-label',
      );
      const stacks = potChipStacks(state.pot);
      const pile = CLASSIC.potChips;
      const tallest = Math.max(0, ...stacks.map((stack) => stack.count - 1));
      const step = Math.min(38, (pile.w - 32) / Math.max(1, stacks.length - 1));
      for (const [index, stack] of stacks.entries()) {
        for (let layer = 0; layer < stack.count; layer += 1) {
          const chip = new ex.Actor({
            name: 'pot-chip',
            pos: ex.vec(
              pile.x + pile.w / 2 + (index - (stacks.length - 1) / 2) * step,
              pile.y +
                pile.h / 2 +
                (tallest * POKER_CHIP_LAYER_GAP) / 2 -
                layer * POKER_CHIP_LAYER_GAP,
            ),
            z: 10 + layer,
          });
          chip.graphics.use(chipAtlas.sprite(stack.value));
          chip.scale = ex.vec(POKER_CHIP_FACE_SCALE, POKER_CHIP_FACE_SCALE);
          chip.pointer.useGraphicsBounds = false;
          chip.pointer.useColliderShape = false;
          add(chip);
        }
      }
    }
    this.potsUi.render(state, ctx, _rerender, (seat) => {
      this.selectedHand = seat;
    });
    const self = ctx.seats.find((seat) => seat.self);
    if (self) {
      const row = state.seats[String(self.seatIndex)];
      label(
        { x: 28, y: 447, w: 168, h: 22 },
        self.name,
        17,
        CLASSIC.secondary,
        'left',
        'poker-player-name',
        true,
        self.seatIndex,
      );
      const blind =
        pokerBlindMark(state, self.seatIndex) ??
        (state.dealerSeatIndex === self.seatIndex ? 'D' : '');
      label(
        { x: 24, y: 470, w: 176, h: 36 },
        `${row?.chips.toLocaleString() ?? '0'} chips`,
        28,
        CLASSIC.cream,
        'left',
        'poker-player-stack',
      );
      label(
        { x: 24, y: 506, w: 176, h: 18 },
        blind === 'SB'
          ? 'Small blind'
          : blind === 'BB'
            ? 'Big blind'
            : blind
              ? 'Dealer'
              : '',
        14,
        CLASSIC.quiet,
        'left',
        'poker-personal-role',
        true,
      );
    } else {
      label(
        { x: 24, y: 452, w: 176, h: 64 },
        'Spectating',
        17,
        CLASSIC.secondary,
        'left',
        'poker-spectator',
        true,
      );
    }
    if (staking) return;
    const seat = self?.seatIndex ?? null;
    const mode = pokerPersonalMode(state, seat);
    const copy = pokerPanelCopy(state, seat, ctx.seats, announcement);
    label(
      { x: 568, y: mode === 'acting' ? 440 : 444, w: 368, h: 30 },
      copy.title,
      mode === 'result' ? 24 : 20,
      copy.highlight ? CLASSIC.accent : CLASSIC.cream,
      'right',
      'poker-panel-heading',
      mode !== 'result',
    );
    if (mode === 'acting') return;
    const canTopUp = mode === 'result' && ctx.cashGame?.topUp;
    const detail = label(
      { x: 568, y: 480, w: canTopUp ? 188 : 368, h: 40 },
      copy.detail,
      16,
      CLASSIC.secondary,
      'right',
      'poker-panel-detail',
      true,
    );
    if (mode === 'result') {
      const update = (): void => {
        const next = ctx.cashGame?.closed
          ? 'Session ended'
          : ctx.cashGame?.nextHandAt === undefined
            ? 'Waiting for top-up'
            : `Next hand in ${Math.max(1, Math.ceil((ctx.cashGame.nextHandAt - Date.now()) / 1000))}s`;
        detail.text = `${copy.detail}${canTopUp ? '\n' : ' · '}${next}`;
      };
      const clock = add(new ex.Actor());
      clock.on('postupdate', update);
      update();
    }
    if (canTopUp)
      button({ x: 772, y: 482, w: 164, h: 38 }, 'Top up', canTopUp, 'right');
  }
}
