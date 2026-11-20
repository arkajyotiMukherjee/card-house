import { gameAudio } from './game-audio';
import { anchorTableActor, tableGutter } from './table-viewport';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import { RUMMY_GAME_TYPE, type RummyState } from '../../src/shared/games/rummy';
import { CARD_DRAW, faceForCard, selectedPlayCards } from './bluff-layout';
import { OPPONENT_FAN_CARD } from './table-presentation';
import { BUTTON_PRESS_SHIFT } from './button-style';
import { uiText, uiCaption } from './ui-text';
import { CLASSIC, classicSeats } from './classic-table-design';
import {
  HAND_PREV,
  HAND_NEXT,
  handPageSize,
  handPositions,
  classicBackSlots,
  classicControlBoxes,
} from './classic-card-layout';
import {
  orderedRummyHand,
  RUMMY_STOCK,
  RUMMY_DISCARD,
  RUMMY_PUBLIC_SCALE,
  rummyMeldPage,
  rummyMeldPositions,
} from './rummy-classic-layout';
import { RummyTableUi } from './rummy-table-ui';
import type { CardAtlas } from './card-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
  cardHitBox,
  frontCardAt,
  isFrontHandCard,
  localHandHitBoxes,
  type CardHitBox,
} from './card-hit';
import {
  HandHover,
  canInspectPointer,
  placeCardLift,
  resetCardLift,
  startHandHoverClock,
} from './hand-hover';
import { legalCard } from './rummy-layout';
const STOCK_X = RUMMY_STOCK.x;
const STOCK_Y = RUMMY_STOCK.y;
const GOLD = ex.Color.fromHex(CLASSIC.cream);
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex(CLASSIC.softBorder);
const STROKE_HOT = ex.Color.fromHex(CLASSIC.gold);
const FLASH_FILL = ex.Color.fromRGB(232, 60, 48, 0.8);
const FLASH_STROKE = ex.Color.fromHex('#ff3b2f');

const TRAVEL_MS = 420;
const FLASH_ON_MS = 130;
const FLASH_OFF_MS = 80;
const FLASH_BLINKS = 3;

interface CardRole {
  kind: 'hand' | 'discard' | 'meld';
  meldIndex: number;
}

interface ControlFace {
  actor: ex.Actor;
  face: ex.Rectangle;
  caption: ex.Actor;
  text: ex.Text;
  setLabel?: (label: string) => void;
  place?: (box: { x: number; y: number; w: number; h: number }) => void;
}

interface CardRecord {
  actor: ex.Actor;
  restX: number;
  restY: number;
  faceUp: boolean;
  /** True for a card still in the local player's own hand. */
  personal: boolean;
  moving: boolean;
  placed: boolean;
  restZ: number;
}

/** A red box that blinks a few times over a control, then removes itself. */
class FlashActor extends ex.Actor {
  private elapsed = 0;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    private readonly onDone: () => void,
  ) {
    super({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      width,
      height,
      z: 40,
    });
    const rect = new ex.Rectangle({
      width,
      height,
      color: FLASH_FILL,
      strokeColor: FLASH_STROKE,
      lineWidth: 4,
      smoothing: false,
    });
    rect.origin = ex.vec(0, 0);
    this.graphics.use(rect);
  }

  onPreUpdate(_engine: ex.Engine, elapsedMs: number): void {
    this.elapsed += elapsedMs;
    const cycle = FLASH_ON_MS + FLASH_OFF_MS;
    if (this.elapsed >= cycle * FLASH_BLINKS) {
      this.onDone();
      this.kill();
      return;
    }
    this.graphics.isVisible = this.elapsed % cycle < FLASH_ON_MS;
  }
}

function panelRect(
  width: number,
  height: number,
  fill: ex.Color,
  stroke: ex.Color,
): ex.Rectangle {
  const rect = new ex.Rectangle({
    width,
    height,
    color: fill,
    strokeColor: stroke,
    lineWidth: 2,
    smoothing: false,
  });
  rect.origin = ex.vec(0, 0);
  return rect;
}

function cardSprite(
  atlas: CardAtlas,
  cardId: string,
  faceUp: boolean,
): ex.Sprite {
  if (!faceUp) {
    return atlas.back();
  }
  const face = faceForCard(cardId);
  if (!face) {
    return atlas.back();
  }
  return atlas.sprite(face);
}

/**
 * Rummy table: your hand along the bottom, other hands as backs,
 * public melds in a bounded readable browser, and stock/discard in the center.
 */
export class RummyDriver implements GameDriver<RummyState> {
  readonly name = 'Rummy';
  readonly gameType = RUMMY_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private roles = new Map<string, CardRole>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private readonly tableUi = new RummyTableUi();
  private controls = new Map<string, ControlFace>();
  private handPage = 0;
  private handPageCount = 1;
  private handLayoutKey = '';
  private visibleHand: string[] = [];
  private prevHandControl: ControlFace | null = null;
  private nextHandControl: ControlFace | null = null;
  private meldOpen = false;
  private meldIndex = 0;
  private meldPage = 0;
  private announcement = '';
  private buttons: ex.Actor[] = [];
  private flashes: ex.Actor[] = [];
  private stockActor: ex.Actor | null = null;
  private selected = new Set<string>();
  private hover: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private buttonsReady = false;
  private state: RummyState | null = null;
  private ctx: RenderContext | null = null;

  render(state: RummyState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    if (!this.buttonsReady) {
      const box = classicControlBoxes(1)[0];
      for (const [target, label] of [
        ['draw-stock', 'Stock'],
        ['draw-discard', 'Take'],
        ['meld', 'Meld'],
        ['discard', 'Discard'],
        ['melds', 'Melds'],
        ['layoff', 'Lay off'],
        ['back', 'Back'],
      ])
        this.controls.set(target, this.addButton(ctx, box, label, target));
      this.prevHandControl = this.addButton(ctx, HAND_PREV, '‹', 'hand-prev');
      this.nextHandControl = this.addButton(ctx, HAND_NEXT, '›', 'hand-next');
      anchorTableActor(this.prevHandControl.actor, 'left', HAND_PREV.x);
      this.buttonsReady = true;
    }
    if (state.phase === 'lobby') {
      this.clearTableCards();
      this.syncLabels(state, ctx);
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
    this.syncStock(state, ctx);
    this.syncLabels(state, ctx);
  }
  setAnnouncement(text: string): void {
    this.announcement = text;
    if (this.state && this.ctx) this.syncLabels(this.state, this.ctx);
  }

  handleInput(event: InputEvent, state: RummyState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (ctx.inputBlocked() && event.type !== 'pointerleave') return;
    if (
      event.type === 'pointerup' &&
      (event.target === 'hand-prev' || event.target === 'hand-next')
    ) {
      if (this.handPageCount < 2) return;
      this.handPage =
        (this.handPage +
          (event.target === 'hand-prev' ? -1 : 1) +
          this.handPageCount) %
        this.handPageCount;
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncLabels(state, ctx);
      return;
    }
    if (
      event.type === 'pointerup' &&
      [
        'melds',
        'back',
        'meld-prev',
        'meld-next',
        'meld-cards-prev',
        'meld-cards-next',
      ].includes(event.target)
    ) {
      if (event.target === 'melds') this.meldOpen = true;
      else if (event.target === 'back') this.meldOpen = false;
      else if (event.target === 'meld-prev' || event.target === 'meld-next') {
        this.meldIndex =
          (this.meldIndex +
            (event.target === 'meld-prev' ? -1 : 1) +
            state.melds.length) %
          Math.max(1, state.melds.length);
        this.meldPage = 0;
      } else {
        const pages = rummyMeldPage(state, this.meldIndex, this.meldPage).pages;
        this.meldPage =
          (this.meldPage +
            (event.target === 'meld-cards-prev' ? -1 : 1) +
            pages) %
          pages;
      }
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncStock(state, ctx);
      this.syncLabels(state, ctx);
      return;
    }
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (ctx.meSeatIndex === null || state.turnSeatIndex !== ctx.meSeatIndex) {
      return;
    }
    if (event.target === 'draw-stock' && event.type === 'pointerup') {
      if (state.drawn) return;
      ctx.sendIntent({ type: 'draw', source: 'stock' });
      return;
    }
    if (event.target === 'draw-discard' && event.type === 'pointerup') {
      if (state.drawn) return;
      ctx.sendIntent({ type: 'draw', source: 'discard' });
      return;
    }
    if (event.target === 'meld' && event.type === 'pointerup') {
      if (!state.drawn) return;
      this.sendMeld(state, ctx);
      return;
    }
    if (event.target === 'discard' && event.type === 'pointerup') {
      if (!state.drawn) return;
      this.sendDiscard(state, ctx);
      return;
    }
    if (event.target === 'layoff' && event.type === 'pointerup') {
      if (state.drawn) this.sendLayoff(state, ctx, this.meldIndex);
      return;
    }
    if (event.target.startsWith('meld:') && event.type === 'pointerup') {
      if (!state.drawn) return;
      this.sendLayoff(state, ctx, Number(event.target.slice(5)));
      return;
    }
    if (!legalCard(state, ctx.meSeatIndex, event.target)) {
      return;
    }
    if (event.type === 'pointerenter') {
      this.hover = event.target;
      this.applyLift(event.target, state, ctx);
      return;
    }
    if (event.type === 'pointerleave') {
      if (this.hover === event.target) {
        this.hover = null;
      }
      this.applyLift(event.target, state, ctx);
      return;
    }
    if (event.type === 'pointerup') {
      gameAudio.play('lift');
      if (this.selected.has(event.target)) {
        this.selected.delete(event.target);
      } else {
        this.selected.add(event.target);
      }
      this.applyLift(event.target, state, ctx);
      this.syncLabels(state, ctx);
    }
  }

  /**
   * The module said no. Flash the button that sent the intent, and the
   * lifted cards for a meld, layoff, or discard.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type = intentType(intent);
    const source = intentSource(intent);
    const target =
      type === 'draw'
        ? source === 'stock'
          ? 'draw-stock'
          : 'draw-discard'
        : type === 'meld'
          ? 'meld'
          : type === 'layoff'
            ? 'layoff'
            : 'discard';
    const control = this.controls.get(target)?.actor;
    if (control)
      this.flashBox(
        ctx,
        control.pos.x,
        control.pos.y,
        control.width,
        control.height,
      );
    if (type !== 'meld' && type !== 'layoff' && type !== 'discard') {
      return;
    }
    for (const cardId of this.selected) {
      const record = this.cards.get(cardId);
      if (!record) {
        continue;
      }
      const half = CARD_DRAW / 2;
      this.flashBox(
        ctx,
        record.actor.pos.x - half,
        record.actor.pos.y - half,
        CARD_DRAW,
        CARD_DRAW,
      );
    }
  }

  destroy(ctx: RenderContext): void {
    void ctx;
    for (const actor of this.flashes) {
      actor.kill();
    }
    this.flashes = [];
    this.clearTableCards();
    this.tableUi.clear();
    for (const actor of this.buttons) {
      actor.kill();
    }
    this.buttons = [];
    this.controls.clear();
    this.buttonsReady = false;
    this.handPage = 0;
    this.handPageCount = 1;
    this.visibleHand = [];
    this.handLayoutKey = '';
    this.meldOpen = false;
    this.meldIndex = 0;
    this.meldPage = 0;
    this.announcement = '';
    this.prevHandControl = this.nextHandControl = null;
    this.selected.clear();
    this.hover = null;
    this.stopHoverClock();
    this.state = null;
    this.ctx = null;
  }

  private setShown(control: ControlFace | null, shown: boolean): void {
    if (!control) {
      return;
    }
    control.actor.graphics.isVisible = shown;
    control.caption.graphics.isVisible = shown;
    control.actor.pointer.useColliderShape = shown;
    control.actor.pointer.useGraphicsBounds = shown;
  }

  private sendMeld(state: RummyState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    ctx.sendIntent({
      type: 'meld',
      cards: selectedPlayCards(hand, this.selected),
    });
  }

  private sendDiscard(state: RummyState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    const cards = selectedPlayCards(hand, this.selected);
    ctx.sendIntent({
      type: 'discard',
      card: cards.length === 1 ? cards[0] : '',
    });
  }

  private sendLayoff(
    state: RummyState,
    ctx: RenderContext,
    meldIndex: number,
  ): void {
    if (ctx.meSeatIndex === null || !Number.isSafeInteger(meldIndex)) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    ctx.sendIntent({
      type: 'layoff',
      meldIndex,
      cards: selectedPlayCards(hand, this.selected),
    });
  }

  private syncLabels(state: RummyState, ctx: RenderContext): void {
    if (!this.buttonsReady) return;
    for (const control of this.controls.values()) this.setShown(control, false);
    const acting =
      state.phase === 'play' &&
      ctx.meSeatIndex !== null &&
      state.turnSeatIndex === ctx.meSeatIndex;
    const targets =
      state.phase === 'lobby'
        ? []
        : this.meldOpen
          ? acting && state.drawn && state.melds.length
            ? ['back', 'layoff']
            : ['back']
          : state.phase === 'finished'
            ? []
            : acting
              ? state.drawn
                ? ['meld', 'discard', 'melds']
                : ['draw-stock', 'draw-discard', 'melds']
              : ['melds'];
    const boxes = classicControlBoxes(targets.length);
    targets.forEach((target, index) => {
      const control = this.controls.get(target)!;
      this.setShown(control, true);
      control.place?.(boxes[index]);
      const enabled =
        target === 'draw-stock'
          ? state.stock.length > 0
          : target === 'draw-discard'
            ? state.discardPile.length > 0
            : target === 'meld'
              ? this.selected.size >= 3
              : target === 'discard'
                ? this.selected.size === 1
                : target === 'layoff'
                  ? this.selected.size > 0
                  : true;
      control.actor.graphics.opacity = control.caption.graphics.opacity =
        enabled ? 1 : 0.45;
      control.actor.pointer.useColliderShape =
        control.actor.pointer.useGraphicsBounds = enabled;
      if (target === 'meld')
        control.setLabel?.(
          this.selected.size ? `Meld ${this.selected.size}` : 'Meld',
        );
      if (target === 'layoff')
        control.setLabel?.(`Lay off ${this.selected.size}`);
    });
    this.tableUi.render(state, ctx, {
      page: this.handPage,
      pages: this.handPageCount,
      selected: this.selected.size,
      meldOpen: this.meldOpen,
      meldIndex: this.meldIndex,
      meldPage: this.meldPage,
      announcement: this.announcement,
      input: (target) =>
        this.handleInput({ type: 'pointerup', target }, state, ctx),
    });
  }

  private syncCards(
    state: RummyState,
    ctx: RenderContext,
    pageChanged = false,
  ): void {
    const desired = new Map<
      string,
      {
        x: number;
        y: number;
        faceUp: boolean;
        delay: number;
        z: number;
        personal: boolean;
      }
    >();
    this.roles.clear();
    const hand =
      ctx.meSeatIndex === null
        ? []
        : orderedRummyHand(state.hands[String(ctx.meSeatIndex)] ?? []);
    this.handLayoutKey = `${isMobileDevice()}:${tableGutter()}`;
    const pageSize = handPageSize(hand.length, isMobileDevice(), tableGutter());
    this.handPageCount = this.nextHandControl
      ? Math.max(1, Math.ceil(hand.length / pageSize))
      : 1;
    this.handPage = Math.min(this.handPage, this.handPageCount - 1);
    const paged = this.handPageCount > 1;
    this.visibleHand = paged
      ? hand.slice(this.handPage * pageSize, (this.handPage + 1) * pageSize)
      : hand;
    this.setShown(this.prevHandControl, paged);
    this.setShown(this.nextHandControl, paged);
    const handSlots = handPositions(this.visibleHand.length, isMobileDevice());
    for (let index = 0; index < this.visibleHand.length; index += 1) {
      const cardId = this.visibleHand[index];
      const slot = handSlots[index];
      if (!cardId || !slot) {
        continue;
      }
      this.roles.set(cardId, { kind: 'hand', meldIndex: 0 });
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: index * 16,
        z: 20 + index,
        personal: true,
      });
    }
    if (this.meldOpen) {
      const page = rummyMeldPage(state, this.meldIndex, this.meldPage);
      this.meldIndex = page.index;
      this.meldPage = page.page;
      const slots = rummyMeldPositions(page.cards.length);
      page.cards.forEach((id, index) => {
        this.roles.set(id, { kind: 'meld', meldIndex: page.index });
        desired.set(id, {
          ...slots[index],
          faceUp: true,
          delay: 0,
          z: 8 + index,
          personal: false,
        });
      });
    } else if (state.phase !== 'finished') {
      const card = state.discardPile.at(-1);
      if (card) {
        this.roles.set(card, { kind: 'discard', meldIndex: 0 });
        desired.set(card, {
          ...RUMMY_DISCARD,
          faceUp: true,
          delay: 0,
          z: 8,
          personal: false,
        });
      }
    }
    for (const cardId of [...this.selected]) {
      if (!hand.includes(cardId)) {
        this.selected.delete(cardId);
      }
    }
    for (const [cardId, record] of this.cards) {
      if (!desired.has(cardId)) {
        record.actor.kill();
        this.cards.delete(cardId);
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx, pageChanged);
    }
  }

  private placeCard(
    cardId: string,
    place: {
      x: number;
      y: number;
      faceUp: boolean;
      delay: number;
      z: number;
      personal: boolean;
    },
    ctx: RenderContext,
    instant: boolean,
  ): void {
    const atlas = place.personal ? ctx.myCards : ctx.cards;
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        name: `rummy-card-${cardId}`,
        pos: ex.vec(STOCK_X, STOCK_Y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: place.z,
      });
      actor.pointer.useGraphicsBounds = false;
      actor.graphics.use(cardSprite(atlas, cardId, place.faceUp));
      actor.on('pointerenter', (event) => {
        if (!canInspectPointer(event, ctx.scene.engine.input.pointers)) return;
        this.followHand(cardId, event.worldPos.x, true);
        this.onCard('pointerenter', cardId);
      });
      actor.on('pointermove', (event) => {
        if (!canInspectPointer(event, ctx.scene.engine.input.pointers)) return;
        this.handHover.touch.move(event);
        this.followHand(cardId, event.worldPos.x, false);
      });
      actor.on('pointerdown', (event) => {
        this.handHover.touch.start(event);
        this.followHand(cardId, event.worldPos.x, true);
      });
      actor.on('pointercancel', () => {
        this.handHover.touch.cancel();
        this.handHover.release();
      });
      actor.on('pointerleave', () => {
        this.handHover.leave(cardId);
        this.onCard('pointerleave', cardId);
      });
      actor.on('pointerup', (event) => {
        if (event.pointerType === ex.PointerType.Touch) {
          this.handHover.release();
          if (!this.handHover.touch.isTap(event)) return;
        }
        this.cardPressAt(cardId, event.worldPos.x, event.worldPos.y);
      });
      ctx.scene.add(actor);
      record = {
        actor,
        restX: place.x,
        restY: place.y,
        faceUp: place.faceUp,
        personal: place.personal,
        moving: false,
        placed: false,
        restZ: place.z,
      };
      this.cards.set(cardId, record);
    }
    if (record.faceUp !== place.faceUp || record.personal !== place.personal) {
      record.faceUp = place.faceUp;
      record.personal = place.personal;
      record.actor.graphics.use(cardSprite(atlas, cardId, place.faceUp));
    }
    record.actor.scale = ex.vec(
      place.personal ? 1 : RUMMY_PUBLIC_SCALE,
      place.personal ? 1 : RUMMY_PUBLIC_SCALE,
    );
    // Public collections use the explicit Lay off action. Their larger colliders
    // must not cover the collection paging controls beside the cards.
    record.actor.pointer.useColliderShape =
      place.personal || this.roles.get(cardId)?.kind === 'discard';
    const moved = record.restX !== place.x || record.restY !== place.y;
    record.restX = place.x;
    record.restY = place.y;
    record.restZ = place.z;
    if (instant) {
      record.actor.actions.clearActions();
      record.moving = false;
      record.placed = true;
      this.applyLift(cardId, this.state, ctx);
      return;
    }
    if (!record.placed || moved) {
      const fromDeal = !record.placed;
      record.placed = true;
      this.travel(cardId, record, place.x, place.y, fromDeal ? place.delay : 0);
      return;
    }
    this.applyLift(cardId, this.state, ctx);
  }

  private travel(
    cardId: string,
    record: CardRecord,
    x: number,
    y: number,
    delay: number,
  ): void {
    record.moving = true;
    resetCardLift(record.actor);
    record.actor.z = record.restZ;
    record.actor.actions.clearActions();
    const motion = record.actor.actions;
    if (delay > 0) {
      motion.delay(delay);
    }
    motion
      .moveTo({
        pos: ex.vec(x, y),
        duration: TRAVEL_MS,
        easing: ex.EasingFunctions.EaseOutCubic,
      })
      .callMethod(() => {
        record.moving = false;
        this.applyLift(cardId, this.state, this.ctx);
      });
  }

  private applyLift(
    cardId: string,
    state: RummyState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    if (!record.personal) {
      resetCardLift(record.actor);
      record.actor.pos = ex.vec(record.restX, record.restY);
      record.actor.z = record.restZ;
      return;
    }
    const legal = legalCard(state, ctx.meSeatIndex, cardId);
    const hover =
      !ctx.inputBlocked() && !this.meldOpen
        ? this.handHover.current(cardId)
        : 0;
    placeCardLift(
      record.actor,
      record.restX,
      record.restY,
      record.restZ,
      hover,
      legal && !this.meldOpen && this.selected.has(cardId),
      true,
      this.handHover.isFocused(cardId),
    );
  }

  private followHand(cardId: string, pointerX: number, entered: boolean): void {
    const state = this.state;
    const ctx = this.ctx;
    const record = this.cards.get(cardId);
    if (
      !record?.personal ||
      !state ||
      !ctx ||
      ctx.inputBlocked() ||
      this.meldOpen ||
      ctx.meSeatIndex === null ||
      !state.hands[String(ctx.meSeatIndex)]?.includes(cardId)
    ) {
      this.handHover.leave(cardId);
      return;
    }
    if (entered) {
      this.handHover.enter(cardId, pointerX);
      return;
    }
    this.handHover.move(pointerX);
  }

  private ensureHoverClock(ctx: RenderContext): void {
    if (this.hoverClock) {
      return;
    }
    this.hoverClock = startHandHoverClock(ctx.scene, (elapsedMs) => {
      this.easeHand(elapsedMs);
    });
  }

  private stopHoverClock(): void {
    this.hoverClock?.kill();
    this.hoverClock = null;
    this.handHover.clear();
  }

  private easeHand(elapsedMs: number): void {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx) {
      return;
    }
    if (this.handLayoutKey !== `${isMobileDevice()}:${tableGutter()}`) {
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncLabels(state, ctx);
    }
    const hand = this.visibleHand;
    const slots = this.visibleHandSlots();
    const centers: number[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      centers.push(slots[index]?.x ?? 0);
    }
    this.handHover.step(hand, centers, elapsedMs);
    for (let index = 0; index < hand.length; index += 1) {
      const cardId = hand[index];
      if (!cardId) {
        continue;
      }
      this.applyLift(cardId, state, ctx);
    }
  }

  private handBoxes(): CardHitBox[] {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx || ctx.meSeatIndex === null) {
      return [];
    }
    return localHandHitBoxes(this.visibleHand, this.cards, CARD_DRAW);
  }

  private visibleHandSlots(): { x: number; y: number }[] {
    return handPositions(this.visibleHand.length, isMobileDevice());
  }

  private onCard(
    type: 'pointerenter' | 'pointerleave' | 'pointerup',
    cardId: string,
  ): void {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx) {
      return;
    }
    this.handleInput({ type, target: cardId }, state, ctx);
  }

  private cardPressAt(cardId: string, x: number, y: number): void {
    const role = this.roles.get(cardId);
    if (role?.kind === 'hand') {
      if (!isFrontHandCard(cardId, x, y, this.handBoxes())) return;
    } else {
      // Excalibur dispatches to every overlapping collider. A meld is a fan:
      // only its front card may submit the layoff for this pointer release.
      const tableCards = [...this.cards.entries()]
        .filter(
          ([id, record]) =>
            this.roles.get(id)?.kind !== 'hand' &&
            record.faceUp &&
            !record.moving,
        )
        .sort((a, b) => a[1].actor.z - b[1].actor.z)
        .map(([id, record]) =>
          cardHitBox(
            id,
            record.actor.pos.x,
            record.actor.pos.y,
            CARD_DRAW,
            CARD_DRAW,
            0,
          ),
        );
      if (frontCardAt(tableCards, { x, y }) !== cardId) return;
    }
    this.onCardPress(cardId);
  }

  private onCardPress(cardId: string): void {
    const role = this.roles.get(cardId);
    if (role?.kind === 'meld') {
      this.onTarget('pointerup', `meld:${role.meldIndex}`);
      return;
    }
    if (role?.kind === 'discard' && this.state?.discardPile.at(-1) === cardId) {
      this.onTarget('pointerup', 'draw-discard');
      return;
    }
    this.onCard('pointerup', cardId);
  }

  private onTarget(type: 'pointerup', target: string): void {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx) {
      return;
    }
    this.handleInput({ type, target }, state, ctx);
  }

  private syncBacks(state: RummyState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; z: number; rotation: number; scale: number }
    >();
    for (const slot of classicBackSlots(ctx.seats, state.hands)) {
      const { key, ...place } = slot;
      const box = classicSeats(ctx.seats).find((row) =>
        key.startsWith(`${row.seat.seatIndex}:`),
      );
      place.x +=
        box?.edge === 'left'
          ? -tableGutter()
          : box?.edge === 'right'
            ? tableGutter()
            : 0;
      desired.set(key, place);
    }
    for (const [key, actor] of this.backs) {
      if (!desired.has(key)) {
        actor.kill();
        this.backs.delete(key);
        this.backTargets.delete(key);
      }
    }
    for (const [key, place] of desired) {
      const target = `${place.x}:${place.y}:${place.rotation}:${place.scale}`;
      let actor = this.backs.get(key);
      const edge = classicSeats(ctx.seats).find((box) =>
        key.startsWith(`${box.seat.seatIndex}:`),
      )?.edge;
      const baseX =
        place.x +
        (edge === 'left'
          ? tableGutter()
          : edge === 'right'
            ? -tableGutter()
            : 0);
      const dock = (): void => {
        if (actor && edge) anchorTableActor(actor, edge, baseX);
      };
      if (!actor) {
        actor = new ex.Actor({
          name: `rummy-back-${key}`,
          pos: ex.vec(STOCK_X, STOCK_Y),
          anchor: ex.vec(0.5, 0.5),
          width: OPPONENT_FAN_CARD,
          height: OPPONENT_FAN_CARD,
          z: place.z,
          rotation: place.rotation,
        });
        actor.scale = ex.vec(place.scale, place.scale);
        const back = ctx.cards.back();
        actor.graphics.use(back);
        actor.pointer.useGraphicsBounds = false;
        actor.pointer.useColliderShape = false;
        ctx.scene.add(actor);
        this.backs.set(key, actor);
        this.backTargets.set(key, target);
        actor.actions
          .moveTo({
            pos: ex.vec(place.x, place.y),
            duration: TRAVEL_MS,
            easing: ex.EasingFunctions.EaseOutCubic,
          })
          .callMethod(dock);
        continue;
      }
      actor.z = place.z;
      actor.rotation = place.rotation;
      actor.scale = ex.vec(place.scale, place.scale);
      if (this.backTargets.get(key) === target) {
        continue;
      }
      this.backTargets.set(key, target);
      actor.actions.clearActions();
      actor.actions
        .moveTo({
          pos: ex.vec(place.x, place.y),
          duration: TRAVEL_MS,
          easing: ex.EasingFunctions.EaseOutCubic,
        })
        .callMethod(dock);
    }
  }

  private syncStock(state: RummyState, ctx: RenderContext): void {
    if (state.stock.length === 0 || this.meldOpen || state.phase !== 'play') {
      this.stockActor?.kill();
      this.stockActor = null;
      return;
    }
    const place = RUMMY_STOCK;
    if (!this.stockActor) {
      const actor = new ex.Actor({
        name: 'rummy-stock',
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: 4,
      });
      actor.graphics.use(ctx.cards.back());
      actor.scale = ex.vec(RUMMY_PUBLIC_SCALE, RUMMY_PUBLIC_SCALE);
      bindButtonPress(actor, undefined, undefined, () => {
        this.onTarget('pointerup', 'draw-stock');
      });
      ctx.scene.add(actor);
      this.stockActor = actor;
      return;
    }
    this.stockActor.z = 4;
    this.stockActor.pos = ex.vec(place.x, place.y);
  }

  private clearTableCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.cards.clear();
    this.roles.clear();
    for (const actor of this.backs.values()) {
      actor.kill();
    }
    this.backs.clear();
    this.backTargets.clear();
    this.stockActor?.kill();
    this.stockActor = null;
    this.selected.clear();
    this.hover = null;
    this.handHover.clear();
  }

  private flashBox(
    ctx: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const actor = new FlashActor(x, y, width, height, () => {
      this.flashes = this.flashes.filter((item) => item !== actor);
    });
    ctx.scene.add(actor);
    this.flashes.push(actor);
  }

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target: string,
  ): ControlFace {
    let currentBox = { ...box };
    const actor = new ex.Actor({
      name: `rummy-control-${target}`,
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    let size = target.startsWith('target:') ? 17 : 18;
    while (uiText(label, size, GOLD).width > box.w - 12 && size > 16) size--;
    if (uiText(label, size, GOLD).width > box.w - 12) {
      let short = label;
      while (
        uiText(short + '…', size, GOLD).width > box.w - 12 &&
        short.length > 1
      )
        short = short.slice(0, -1);
      label = short + '…';
    }
    const rest = uiCaption(label, currentBox.w, currentBox.h, size);
    const text = uiText(label, size, GOLD);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(text);
    caption.pointer.useGraphicsBounds = false;
    caption.pointer.useColliderShape = false;
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        caption.pos = ex.vec(rest.x, rest.y);
        face.strokeColor = STROKE;
        face.color = BUTTON;
      },
      () => {
        const state = this.state;
        const current = this.ctx;
        if (!state || !current) {
          return;
        }
        this.handleInput({ type: 'pointerup', target }, state, current);
      },
    );
    if (box.x >= 600 && box.y >= 400) anchorTableActor(actor, 'right', box.x);
    ctx.scene.add(actor);
    this.buttons.push(actor);
    return {
      actor,
      face,
      caption,
      text,
      place: (nextBox) => {
        currentBox = { ...nextBox };
        face.width = nextBox.w;
        face.height = nextBox.h;
        actor.collider.useBoxCollider(nextBox.w, nextBox.h, ex.vec(0, 0));
        actor.pos.y = nextBox.y;
        anchorTableActor(actor, 'right', nextBox.x);
        const next = uiCaption(text.text, nextBox.w, nextBox.h, size);
        rest.x = next.x;
        rest.y = next.y;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      setLabel: (nextLabel) => {
        text.text = nextLabel;
        const nextSize = 18;
        text.font = uiText(nextLabel, nextSize, GOLD).font;
        const next = uiCaption(nextLabel, currentBox.w, currentBox.h, nextSize);
        rest.x = next.x;
        rest.y = next.y;
        caption.pos = ex.vec(rest.x, rest.y);
      },
    };
  }
}

function intentType(intent: unknown): string | null {
  if (typeof intent !== 'object' || intent === null || !('type' in intent)) {
    return null;
  }
  return typeof intent.type === 'string' ? intent.type : null;
}

function intentSource(intent: unknown): string | null {
  if (typeof intent !== 'object' || intent === null || !('source' in intent)) {
    return null;
  }
  return typeof intent.source === 'string' ? intent.source : null;
}
