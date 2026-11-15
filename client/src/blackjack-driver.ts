import * as ex from 'excalibur';
import {
  BLACKJACK_GAME_TYPE,
  blackjackRules,
  type BlackjackIntent,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { faceForBlackjackCard } from './blackjack-layout';
import {
  blackjackCardPageSize,
  blackjackFooterSeat,
  blackjackLocalPositions,
  blackjackPublicPositions,
  blackjackRailSeats,
} from './blackjack-classic-layout';
import { BlackjackTableUi, type BlackjackControl } from './blackjack-table-ui';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import type { CardAtlas } from './card-atlas';
import {
  HandHover,
  canInspectPointer,
  inspectionPose,
  placeCardLift,
  resetCardLift,
  startHandHoverClock,
} from './hand-hover';
import { isMobileDevice } from './mobile-shell';
import { anchorTableActor, tableGutter } from './table-viewport';

interface CardRecord {
  actor: ex.Actor;
  restX: number;
  restY: number;
  personal: boolean;
  scale: number;
  moving: boolean;
  faceUp: boolean;
  z: number;
}
interface CardPlace {
  id: string;
  card: string;
  x: number;
  y: number;
  scale: number;
  personal: boolean;
  faceUp: boolean;
  edge?: 'left' | 'right';
  z: number;
}
const HAND_ACTIONS = ['hit', 'stand', 'double', 'split', 'surrender'] as const;
/** House cards stay distinct from the player rail; one hand is focused at a time. */
export class BlackjackDriver implements GameDriver<BlackjackState> {
  readonly name = 'Blackjack';
  readonly gameType = BLACKJACK_GAME_TYPE;
  private readonly tableUi = new BlackjackTableUi();
  private cards = new Map<string, CardRecord>();
  private state: BlackjackState | null = null;
  private ctx: RenderContext | null = null;
  private ready = false;
  private controls: BlackjackControl[] = [];
  private footerHand = 0;
  private footerPage = 0;
  private footerPages = 1;
  private dealerPage = 0;
  private dealerPages = 1;
  private focusSeat: number | null = null;
  private focusHand = 0;
  private focusPage = 0;
  private focusPages = 1;
  private signature = '';
  private focusSignature = '';
  private layoutKey = '';
  private clockSecond = -1;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private flashes = new Set<ex.Actor>();

  render(state: BlackjackState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.ready = true;
    this.hoverClock ??= startHandHoverClock(ctx.scene, (ms) => this.ease(ms));
    const footer = blackjackFooterSeat(ctx.seats),
      row = footer ? state.seats[String(footer.seatIndex)] : undefined;
    const signature = `${state.phase}:${state.step}:${state.turnSeatIndex}:${row?.handIndex ?? 0}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.footerHand = Math.min(
        row?.handIndex ?? 0,
        Math.max(0, (row?.hands.length ?? 1) - 1),
      );
      this.footerPage = 0;
      this.handHover.clear();
    }
    this.footerHand = Math.min(
      this.footerHand,
      Math.max(0, (row?.hands.length ?? 1) - 1),
    );
    const opponents = ctx.seats.filter((seat) => !seat.self);
    if (!opponents.some((seat) => seat.seatIndex === this.focusSeat))
      this.focusSeat = opponents[0]?.seatIndex ?? null;
    const focusSignature = `${state.phase}:${state.step}:${state.turnSeatIndex}:${state.turnSeatIndex === null ? '' : state.seats[String(state.turnSeatIndex)]?.handIndex}`;
    if (focusSignature !== this.focusSignature) {
      this.focusSignature = focusSignature;
      if (
        state.step === 'act' &&
        state.turnSeatIndex !== null &&
        state.turnSeatIndex !== ctx.meSeatIndex
      ) {
        this.focusSeat = state.turnSeatIndex;
        this.focusHand = state.seats[String(this.focusSeat)]?.handIndex ?? 0;
        this.focusPage = 0;
      }
    }
    if (state.phase === 'lobby') {
      this.clearCards();
      this.tableUi.clear();
      return;
    }
    this.syncCards(state, ctx);
    this.controls = this.actionControls(state, ctx);
    this.tableUi.render(state, ctx, {
      footerHand: this.footerHand,
      footerPage: this.footerPage,
      footerPages: this.footerPages,
      dealerPage: this.dealerPage,
      dealerPages: this.dealerPages,
      focusSeat: this.focusSeat,
      focusHand: this.focusHand,
      focusPage: this.focusPage,
      focusPages: this.focusPages,
      controls: this.controls,
      act: (target) =>
        this.handleInput({ type: 'pointerup', target }, this.state!, this.ctx!),
    });
  }
  setAnnouncement(_text: string): void {}
  handleInput(
    event: InputEvent,
    state: BlackjackState,
    ctx: RenderContext,
  ): void {
    this.state = state;
    this.ctx = ctx;
    if (ctx.inputBlocked() && event.type !== 'pointerleave') return;
    if (event.type !== 'pointerup') return;
    const footer = blackjackFooterSeat(ctx.seats),
      row = footer ? state.seats[String(footer.seatIndex)] : undefined;
    const cycle = (value: number, count: number, direction: number): number =>
      (value + direction + Math.max(1, count)) % Math.max(1, count);
    const delta = event.target.endsWith('prev') ? -1 : 1;
    if (event.target === 'dealer-prev' || event.target === 'dealer-next') {
      this.dealerPage = cycle(this.dealerPage, this.dealerPages, delta);
      this.refresh();
      return;
    }
    if (
      event.target === 'footer-hand-prev' ||
      event.target === 'footer-hand-next'
    ) {
      this.footerHand = cycle(this.footerHand, row?.hands.length ?? 1, delta);
      this.footerPage = 0;
      this.handHover.clear();
      this.refresh();
      return;
    }
    if (
      event.target === 'footer-card-prev' ||
      event.target === 'footer-card-next'
    ) {
      this.footerPage = cycle(this.footerPage, this.footerPages, delta);
      this.handHover.clear();
      this.refresh();
      return;
    }
    if (
      event.target === 'focus-hand-prev' ||
      event.target === 'focus-hand-next'
    ) {
      this.focusHand = cycle(
        this.focusHand,
        state.seats[String(this.focusSeat)]?.hands.length ?? 1,
        delta,
      );
      this.focusPage = 0;
      this.refresh();
      return;
    }
    if (
      event.target === 'focus-card-prev' ||
      event.target === 'focus-card-next'
    ) {
      this.focusPage = cycle(this.focusPage, this.focusPages, delta);
      this.refresh();
      return;
    }
    if (event.target.startsWith('view:')) {
      const seat = Number(event.target.slice(5));
      if (
        ctx.seats.some((person) => !person.self && person.seatIndex === seat)
      ) {
        this.focusSeat = seat;
        this.focusHand = state.seats[String(seat)]?.handIndex ?? 0;
        this.focusPage = 0;
        this.refresh();
      }
      return;
    }
    if (event.target === 'active-hand') {
      this.footerHand = row?.handIndex ?? 0;
      this.footerPage = 0;
      this.refresh();
      return;
    }
    if (event.target === 'top-up') {
      ctx.houseGame?.topUp?.();
      return;
    }
    if (
      state.phase !== 'play' ||
      ctx.meSeatIndex === null ||
      state.turnSeatIndex !== ctx.meSeatIndex
    )
      return;
    // Direct input still forwards to the module. Presentation only offers supported actions.
    if (state.step === 'insurance') {
      if (event.target === 'insurance:yes' || event.target === 'insurance:no')
        ctx.sendIntent({
          type: 'insurance',
          take: event.target === 'insurance:yes',
        });
      else if (event.target === 'even_money')
        ctx.sendIntent({ type: 'even_money' });
      return;
    }
    if (state.step === 'bet' && event.target.startsWith('bet:')) {
      ctx.sendIntent({ type: 'bet', amount: Number(event.target.slice(4)) });
      return;
    }
    if (
      state.step === 'act' &&
      HAND_ACTIONS.includes(event.target as (typeof HAND_ACTIONS)[number])
    )
      ctx.sendIntent({ type: event.target });
  }
  intentRejected(_intent: unknown, ctx: RenderContext): void {
    const face = new ex.Actor({
      name: 'blackjack-rejected-action',
      pos: ex.vec(676, 442),
      anchor: ex.vec(0, 0),
      width: 260,
      height: 88,
      z: 60,
    });
    const graphic = new ex.Rectangle({
      width: 260,
      height: 88,
      color: ex.Color.fromRGB(232, 60, 48, 0.3),
    });
    graphic.origin = ex.vec(0, 0);
    face.graphics.use(graphic);
    face.pointer.useColliderShape = false;
    face.pointer.useGraphicsBounds = false;
    anchorTableActor(face, 'right', 676);
    ctx.scene.add(face);
    this.flashes.add(face);
    face.actions.fade(0, 650).callMethod(() => {
      face.kill();
      this.flashes.delete(face);
    });
  }
  destroy(_ctx: RenderContext): void {
    this.tableUi.clear();
    this.clearCards();
    this.hoverClock?.kill();
    this.hoverClock = null;
    this.handHover.clear();
    for (const actor of this.flashes) actor.kill();
    this.flashes.clear();
    this.ready = false;
    this.state = null;
    this.ctx = null;
    this.footerHand = 0;
    this.footerPage = 0;
    this.footerPages = 1;
    this.focusSeat = null;
    this.focusHand = 0;
    this.focusPage = 0;
    this.focusPages = 1;
    this.dealerPage = 0;
    this.dealerPages = 1;
    this.signature = '';
    this.focusSignature = '';
    this.layoutKey = '';
  }
  private refresh(): void {
    if (this.ready && this.state && this.ctx) this.render(this.state, this.ctx);
  }
  private legal(
    state: BlackjackState,
    ctx: RenderContext,
    intent: BlackjackIntent,
  ): boolean {
    if (ctx.meSeatIndex === null) return false;
    try {
      blackjackRules.applyIntent(state, intent, {
        seat: {
          id: '',
          tableId: '',
          lobbyMemberId: '',
          seatIndex: ctx.meSeatIndex,
          chips: null,
          joinedAt: 0,
          seatState: 'active',
        },
        now: 0,
      });
      return true;
    } catch {
      return false;
    }
  }
  private actionControls(
    state: BlackjackState,
    ctx: RenderContext,
  ): BlackjackControl[] {
    if (
      state.phase !== 'play' ||
      ctx.meSeatIndex === null ||
      state.turnSeatIndex !== ctx.meSeatIndex
    )
      return [];
    const row = state.seats[String(ctx.meSeatIndex)];
    if (state.step === 'act' && this.footerHand !== row.handIndex)
      return [
        { target: 'active-hand', label: `Play hand ${row.handIndex + 1}` },
      ];
    if (state.step === 'bet') {
      const min = state.minBet ?? 10,
        max = state.maxBet ?? 50;
      return [...new Set([min, Math.max(min, Math.min(25, max)), max])]
        .filter((amount) => this.legal(state, ctx, { type: 'bet', amount }))
        .map((amount) => ({
          target: `bet:${amount}`,
          label: `Bet ${amount.toLocaleString('en-US')}`,
        }));
    }
    if (state.step === 'insurance')
      return [
        {
          target: 'insurance:yes',
          label: 'Insurance',
          intent: { type: 'insurance', take: true } as BlackjackIntent,
        },
        {
          target: 'insurance:no',
          label: 'No thanks',
          intent: { type: 'insurance', take: false } as BlackjackIntent,
        },
        {
          target: 'even_money',
          label: 'Even money',
          intent: { type: 'even_money' } as BlackjackIntent,
        },
      ].filter((entry) => this.legal(state, ctx, entry.intent));
    return HAND_ACTIONS.filter((type) => this.legal(state, ctx, { type })).map(
      (type) => ({
        target: type,
        label: type[0].toUpperCase() + type.slice(1),
      }),
    );
  }
  private syncCards(state: BlackjackState, ctx: RenderContext): void {
    const places: CardPlace[] = [];
    this.layoutKey = `${isMobileDevice()}:${tableGutter()}`;
    this.dealerPages = Math.max(1, Math.ceil(state.dealer.length / 6));
    this.dealerPage = Math.min(this.dealerPage, this.dealerPages - 1);
    const dealer = state.dealer.slice(
        this.dealerPage * 6,
        this.dealerPage * 6 + 6,
      ),
      dealerSlots = blackjackPublicPositions(dealer.length, 134);
    dealer.forEach((card, index) => {
      const actual = this.dealerPage * 6 + index;
      places.push({
        id: `dealer:${actual}:${card}`,
        card,
        ...dealerSlots[index],
        scale: 1.15,
        faceUp: !(state.holeHidden && actual === 1),
        personal: false,
        z: 8 + index,
      });
    });
    for (const box of blackjackRailSeats(ctx.seats)) {
      const row = state.seats[String(box.seat.seatIndex)],
        hand =
          row?.hands[
            Math.min(row.handIndex, Math.max(0, row.hands.length - 1))
          ];
      const shown = hand?.cards.slice(0, 4) ?? [];
      shown.forEach((card, index) =>
        places.push({
          id: `rail:${box.seat.seatIndex}:${index}:${card}`,
          card,
          x: box.x + 84 + (index - (shown.length - 1) / 2) * 23,
          y: box.y - 32,
          scale: 0.9,
          personal: false,
          faceUp: true,
          edge: box.edge,
          z: 8 + index,
        }),
      );
    }
    const focus = state.seats[String(this.focusSeat)];
    this.focusHand = Math.min(
      this.focusHand,
      Math.max(0, (focus?.hands.length ?? 1) - 1),
    );
    const publicHand = focus?.hands[this.focusHand];
    this.focusPages = Math.max(
      1,
      Math.ceil((publicHand?.cards.length ?? 0) / 6),
    );
    this.focusPage = Math.min(this.focusPage, this.focusPages - 1);
    const publicCards =
        publicHand?.cards.slice(this.focusPage * 6, this.focusPage * 6 + 6) ??
        [],
      publicSlots = blackjackPublicPositions(publicCards.length);
    publicCards.forEach((card, index) =>
      places.push({
        id: `focus:${this.focusSeat}:${this.focusHand}:${index}:${card}`,
        card,
        ...publicSlots[index],
        scale: 1.25,
        personal: false,
        faceUp: true,
        z: 12 + index,
      }),
    );
    const footer = blackjackFooterSeat(ctx.seats),
      row = footer ? state.seats[String(footer.seatIndex)] : undefined;
    const hand = row?.hands[this.footerHand]?.cards ?? [],
      mobile = isMobileDevice();
    const unpaged = blackjackCardPageSize(mobile),
      capacity =
        hand.length > unpaged ? blackjackCardPageSize(mobile, true) : unpaged;
    this.footerPages = Math.max(1, Math.ceil(hand.length / capacity));
    this.footerPage = Math.min(this.footerPage, this.footerPages - 1);
    const visible = hand.slice(
        this.footerPage * capacity,
        this.footerPage * capacity + capacity,
      ),
      slots = blackjackLocalPositions(visible.length, mobile);
    visible.forEach((card, index) =>
      places.push({
        id: `footer:${footer!.seatIndex}:${this.footerHand}:${this.footerPage * capacity + index}:${card}`,
        card,
        x: slots[index].x,
        y:
          slots[index].y +
          (footer?.self ? inspectionPose(0, mobile, false, true).lift : 0),
        scale: footer?.self ? 1 : mobile ? 1.35 : 1.1,
        personal: footer?.self ?? false,
        faceUp: true,
        z: 14 + index,
      }),
    );
    const desired = new Set(places.map((place) => place.id));
    for (const [id, record] of this.cards)
      if (!desired.has(id)) {
        record.actor.kill();
        this.cards.delete(id);
      }
    for (const place of places) this.placeCard(place, ctx);
  }
  private sprite(atlas: CardAtlas, card: string, faceUp: boolean): ex.Sprite {
    const face = faceForBlackjackCard(card);
    return faceUp && face ? atlas.sprite(face) : atlas.back();
  }
  private placeCard(place: CardPlace, ctx: RenderContext): void {
    const atlas = place.personal ? ctx.myCards : ctx.cards;
    let record = this.cards.get(place.id);
    if (!record) {
      const actor = new ex.Actor({
        name: `blackjack-card-${place.id}`,
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0.5, 0.5),
        width: 64,
        height: 64,
        z: place.z,
      });
      actor.graphics.use(this.sprite(atlas, place.card, place.faceUp));
      actor.graphics.opacity = 0;
      actor.actions.fade(1, 180);
      actor.pointer.useGraphicsBounds = false;
      actor.pointer.useColliderShape = place.personal;
      actor.on('pointerenter', (event) => {
        if (
          place.personal &&
          canInspectPointer(event, ctx.scene.engine.input.pointers) &&
          !this.ctx?.inputBlocked()
        )
          this.inspectCard(place.id, event.worldPos.x);
      });
      actor.on('pointerdown', (event) => {
        if (place.personal && !this.ctx?.inputBlocked())
          this.inspectCard(place.id, event.worldPos.x);
      });
      actor.on('pointermove', (event) => {
        if (
          place.personal &&
          canInspectPointer(event, ctx.scene.engine.input.pointers) &&
          !this.ctx?.inputBlocked()
        )
          this.handHover.move(event.worldPos.x);
      });
      actor.on('pointerleave', () => this.handHover.leave(place.id));
      actor.on('pointercancel', () => this.handHover.release());
      actor.on('pointerup', (event) => {
        if (event.pointerType === ex.PointerType.Touch)
          this.handHover.release();
      });
      ctx.scene.add(actor);
      record = {
        actor,
        restX: place.x,
        restY: place.y,
        personal: place.personal,
        scale: place.scale,
        moving: false,
        faceUp: place.faceUp,
        z: place.z,
      };
      this.cards.set(place.id, record);
    }
    if (record.faceUp !== place.faceUp) {
      record.faceUp = place.faceUp;
      record.actor.graphics.use(this.sprite(atlas, place.card, place.faceUp));
    }
    record.restX = place.x;
    record.restY = place.y;
    record.z = place.z;
    record.scale = place.scale;
    record.actor.z = place.z;
    if (place.edge) anchorTableActor(record.actor, place.edge, place.x);
    else record.actor.pos = ex.vec(place.x, place.y);
    if (place.personal) {
      record.actor.scale = ex.vec(1, 1);
      placeCardLift(
        record.actor,
        place.x,
        place.y,
        place.z,
        this.handHover.current(place.id),
        false,
        true,
        this.handHover.isFocused(place.id),
      );
    } else {
      resetCardLift(record.actor);
      record.actor.scale = ex.vec(place.scale, place.scale);
    }
  }
  /** Inspection is available while waiting, but only for the local player's own hand. */
  private inspectCard(cardId: string, x: number): void {
    if (this.cards.get(cardId)?.personal && !this.ctx?.inputBlocked())
      this.handHover.enter(cardId, x);
  }

  private ease(ms: number): void {
    if (!this.state || !this.ctx) return;
    const second = Math.floor(Date.now() / 1000);
    if (this.state.phase === 'finished' && second !== this.clockSecond) {
      this.clockSecond = second;
      this.refresh();
    }
    if (this.layoutKey !== `${isMobileDevice()}:${tableGutter()}`) {
      this.handHover.clear();
      this.refresh();
    }
    const hand = [...this.cards]
      .filter(([, record]) => record.personal)
      .sort((a, b) => a[1].restX - b[1].restX);
    if (this.ctx.inputBlocked()) this.handHover.release();
    this.handHover.step(
      hand.map(([id]) => id),
      hand.map(([, record]) => record.restX),
      ms,
    );
    for (const [id, record] of hand)
      placeCardLift(
        record.actor,
        record.restX,
        record.restY,
        record.z,
        this.handHover.current(id),
        false,
        true,
        this.handHover.isFocused(id),
      );
  }
  private clearCards(): void {
    for (const record of this.cards.values()) record.actor.kill();
    this.cards.clear();
  }
}
