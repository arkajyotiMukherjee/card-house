import { anchorTableActor, tableGutter } from './table-viewport';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  GO_FISH_GAME_TYPE,
  rankOfCard,
  type GoFishState,
} from '../../src/shared/games/go-fish';
import { CARD_DRAW, faceForCard } from './bluff-layout';
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
  orderedGoFishHand,
  goFishTargetBoxes,
  goFishStockPosition,
} from './go-fish-classic-layout';
import { GoFishTableUi } from './go-fish-table-ui';
const PILE_X = 480;
const PILE_Y = 350;
import type { CardAtlas } from './card-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
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
import { legalCard, askSeat } from './go-fish-layout';

const [ASK_BUTTON, BOOKS_BUTTON] = classicControlBoxes(2);
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

/** Go Fish keeps private ranks in the personal band and public books in a bounded collection view. */
export class GoFishDriver implements GameDriver<GoFishState> {
  readonly name = 'Go Fish';
  readonly gameType = GO_FISH_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private readonly tableUi = new GoFishTableUi();
  private askControl: ControlFace | null = null;
  private booksControl: ControlFace | null = null;
  private targetControls = new Map<number, ControlFace>();
  private selectedRank: string | null = null;
  private selectedTarget: number | null = null;
  private booksOpen = false;
  private stockActors: ex.Actor[] = [];
  private stockKey = '';
  private prevHandControl: ControlFace | null = null;
  private nextHandControl: ControlFace | null = null;
  private handPage = 0;
  private handPageCount = 1;
  private handLayoutKey = '';
  private visibleHand: string[] = [];
  private buttons: ex.Actor[] = [];
  private flashes: ex.Actor[] = [];
  private hover: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private buttonsReady = false;
  private state: GoFishState | null = null;
  private ctx: RenderContext | null = null;

  render(state: GoFishState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    if (!this.buttonsReady) {
      this.askControl = this.addButton(ctx, ASK_BUTTON, 'Ask', 'ask');
      this.booksControl = this.addButton(ctx, BOOKS_BUTTON, 'Books', 'books');
      this.prevHandControl = this.addButton(ctx, HAND_PREV, '<', 'hand-prev');
      this.nextHandControl = this.addButton(ctx, HAND_NEXT, '>', 'hand-next');
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

  /** lastAsk/books already own the public message; event strips must not repeat them. */
  setAnnouncement(_text: string): void {}

  handleInput(event: InputEvent, state: GoFishState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (
      event.type === 'pointerup' &&
      (event.target === 'hand-prev' || event.target === 'hand-next')
    ) {
      if (ctx.inputBlocked() || this.handPageCount < 2) return;
      const direction = event.target === 'hand-prev' ? -1 : 1;
      this.handPage =
        (this.handPage + direction + this.handPageCount) % this.handPageCount;
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncLabels(state, ctx);
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') return;
    if (
      event.type === 'pointerup' &&
      (event.target === 'books' || event.target === 'books-close')
    ) {
      this.booksOpen = event.target === 'books';
      this.handHover.clear();
      this.syncStock(state, ctx);
      this.syncLabels(state, ctx);
      return;
    }
    if (this.booksOpen) return;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (ctx.meSeatIndex === null || state.turnSeatIndex !== ctx.meSeatIndex) {
      return;
    }
    if (event.target.startsWith('target:') && event.type === 'pointerup') {
      const target = Number(event.target.slice(7));
      if (
        ctx.seats.some((seat) => !seat.self && seat.seatIndex === target) &&
        state.hands[String(target)]?.length
      )
        this.selectedTarget = target;
      this.syncLabels(state, ctx);
      return;
    }
    const askedSeat =
      event.target === 'ask' ? this.selectedTarget : askSeat(event.target);
    if (askedSeat !== null && event.type === 'pointerup') {
      if (
        this.selectedRank === null ||
        !ctx.seats.some((seat) => !seat.self && seat.seatIndex === askedSeat)
      )
        return;
      ctx.sendIntent({
        type: 'ask',
        targetSeat: askedSeat,
        rank: this.selectedRank,
      });
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
      const rank = rankOfCard(event.target);
      if (!rank) return;
      this.selectedRank = this.selectedRank === rank ? null : rank;
      this.syncStock(state, ctx);
      this.applyLift(event.target, state, ctx);
      this.syncLabels(state, ctx);
    }
  }

  /**
   * The module said no. Flash Ask and the selected rank so the click does
   * not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    if (type !== 'ask') return;
    const actor = this.askControl?.actor;
    if (actor)
      this.flashBox(ctx, actor.pos.x, actor.pos.y, actor.width, actor.height);
    for (const [cardId, record] of this.cards) {
      if (rankOfCard(cardId) !== this.selectedRank) continue;
      this.flashBox(
        ctx,
        record.actor.pos.x - CARD_DRAW / 2,
        record.actor.pos.y - CARD_DRAW / 2,
        CARD_DRAW,
        CARD_DRAW,
      );
    }
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
    this.buttonsReady = false;
    this.askControl =
      this.booksControl =
      this.prevHandControl =
      this.nextHandControl =
        null;
    this.handPage = 0;
    this.handPageCount = 1;
    this.handLayoutKey = '';
    this.visibleHand = [];
    this.selectedRank = null;
    this.selectedTarget = null;
    this.booksOpen = false;
    this.targetControls.clear();
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

  private syncLabels(state: GoFishState, ctx: RenderContext): void {
    if (!this.buttonsReady) return;
    const acting =
      state.phase === 'play' &&
      ctx.meSeatIndex !== null &&
      state.turnSeatIndex === ctx.meSeatIndex;
    const choosing = acting && this.selectedRank !== null && !this.booksOpen;
    const showAsk = acting && !this.booksOpen;
    const showBooks = state.phase === 'play' && !this.booksOpen;
    this.setShown(this.askControl, showAsk);
    this.setShown(this.booksControl, showBooks);
    this.askControl?.place?.(
      (showBooks ? classicControlBoxes(2) : classicControlBoxes(1))[0],
    );
    this.booksControl?.place?.(
      showAsk ? classicControlBoxes(2)[1] : classicControlBoxes(1)[0],
    );
    if (this.askControl) {
      const enabled =
        showAsk && this.selectedRank !== null && this.selectedTarget !== null;
      this.askControl.actor.graphics.opacity = enabled ? 1 : 0.45;
      this.askControl.caption.graphics.opacity = enabled ? 1 : 0.45;
      this.askControl.actor.pointer.useColliderShape = enabled;
      this.askControl.actor.pointer.useGraphicsBounds = enabled;
    }
    for (const box of goFishTargetBoxes(ctx.seats)) {
      let control = this.targetControls.get(box.seat.seatIndex);
      if (!control) {
        control = this.addButton(
          ctx,
          box,
          box.seat.name,
          `target:${box.seat.seatIndex}`,
        );
        this.targetControls.set(box.seat.seatIndex, control);
      }
      const enabled =
        choosing && (state.hands[String(box.seat.seatIndex)]?.length ?? 0) > 0;
      this.setShown(control, enabled);
      control.face.color = ex.Color.fromHex(
        this.selectedTarget === box.seat.seatIndex ? CLASSIC.active : '#1b5c38',
      );
      control.face.strokeColor =
        this.selectedTarget === box.seat.seatIndex ? STROKE_HOT : STROKE;
      control.text.color =
        this.selectedTarget === box.seat.seatIndex ? STROKE_HOT : GOLD;
    }
    this.tableUi.render(state, ctx, {
      rank: this.selectedRank,
      target: this.selectedTarget,
      page: this.handPage,
      pages: this.handPageCount,
      booksOpen: this.booksOpen,
      books: () =>
        this.handleInput({ type: 'pointerup', target: 'books' }, state, ctx),
      closeBooks: () =>
        this.handleInput(
          { type: 'pointerup', target: 'books-close' },
          state,
          ctx,
        ),
    });
  }

  private syncCards(
    state: GoFishState,
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
    const hand =
      ctx.meSeatIndex === null
        ? []
        : orderedGoFishHand(state.hands[String(ctx.meSeatIndex)] ?? []);
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
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: index * 16,
        z: 12 + index,
        personal: true,
      });
    }
    if (
      this.selectedRank !== null &&
      !hand.some((card) => rankOfCard(card) === this.selectedRank)
    )
      this.selectedRank = null;
    if (
      this.selectedTarget !== null &&
      !state.hands[String(this.selectedTarget)]?.length
    )
      this.selectedTarget = null;
    for (const [cardId, record] of this.cards) {
      if (!desired.has(cardId)) {
        record.actor.kill();
        this.cards.delete(cardId);
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx, pageChanged && place.personal);
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
        name: `go-fish-card-${cardId}`,
        pos: ex.vec(PILE_X, PILE_Y),
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
        if (
          !isFrontHandCard(
            cardId,
            event.worldPos.x,
            event.worldPos.y,
            this.handBoxes(),
          )
        ) {
          return;
        }
        this.onCard('pointerup', cardId);
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
    record.actor.pointer.useColliderShape = place.personal;
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
    state: GoFishState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    const legal = legalCard(state, ctx.meSeatIndex, cardId);
    const hover =
      record.personal && !this.booksOpen && !ctx.inputBlocked()
        ? this.handHover.current(cardId)
        : 0;
    placeCardLift(
      record.actor,
      record.restX,
      record.restY,
      record.restZ,
      hover,
      !this.booksOpen && legal && rankOfCard(cardId) === this.selectedRank,
      record.personal,
      this.handHover.isFocused(cardId),
    );
  }

  private followHand(cardId: string, pointerX: number, entered: boolean): void {
    const state = this.state;
    const ctx = this.ctx;
    const record = this.cards.get(cardId);
    if (
      !record?.personal ||
      this.booksOpen ||
      !state ||
      !ctx ||
      ctx.inputBlocked() ||
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

  private syncBacks(state: GoFishState, ctx: RenderContext): void {
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
          name: `go-fish-back-${key}`,
          pos: ex.vec(PILE_X, PILE_Y),
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

  private syncStock(state: GoFishState, ctx: RenderContext): void {
    if (!this.buttonsReady) return;
    const choosing =
      state.phase === 'play' &&
      ctx.meSeatIndex !== null &&
      state.turnSeatIndex === ctx.meSeatIndex &&
      this.selectedRank !== null &&
      !this.booksOpen;
    const spot = goFishStockPosition(choosing),
      shown =
        state.phase === 'play' && !this.booksOpen
          ? Math.min(3, state.stock.length)
          : 0;
    const key = `${shown}:${spot.x}:${spot.y}`;
    if (key === this.stockKey) return;
    for (const actor of this.stockActors) actor.kill();
    this.stockActors = [];
    this.stockKey = key;
    for (let index = 0; index < shown; index++) {
      const actor = new ex.Actor({
        name: 'go-fish-stock',
        pos: ex.vec(spot.x + index * 3, spot.y - index * 2),
        anchor: ex.vec(0.5, 0.5),
        z: 6 + index,
      });
      const sprite = ctx.cards.back();
      sprite.scale = ex.vec(1.1, 1.1);
      actor.graphics.use(sprite);
      actor.pointer.useColliderShape = false;
      actor.pointer.useGraphicsBounds = false;
      ctx.scene.add(actor);
      this.stockActors.push(actor);
    }
  }

  private clearTableCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.cards.clear();
    for (const actor of this.backs.values()) {
      actor.kill();
    }
    this.backs.clear();
    this.backTargets.clear();
    this.selectedRank = null;
    this.selectedTarget = null;
    this.hover = null;
    for (const actor of this.stockActors) actor.kill();
    this.stockActors = [];
    this.stockKey = '';
    this.handHover.clear();
  }

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target: string,
  ): ControlFace {
    let currentBox = { ...box };
    const actor = new ex.Actor({
      name: `go-fish-control-${target}`,
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
