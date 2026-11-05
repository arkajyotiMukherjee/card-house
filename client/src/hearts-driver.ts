import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  HEARTS_GAME_TYPE,
  type HeartsState,
} from '../../src/shared/games/hearts';
import { PILE_X, PILE_Y } from './bluff-layout';
import {
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import { pixelFont } from './boot-scene';
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
import {
  CARD_DRAW,
  PASS_BUTTON,
  PLAY_BUTTON,
  heartsAction,
  playHint,
  cardLift,
  faceForCard,
  finishedLine,
  handPositions,
  legalCard,
  passLabel,
  penaltyPositions,
  pointCards,
  selectedCards,
  trickPosition,
} from './hearts-layout';
import { LOGICAL_WIDTH } from './sheets';
import {
  OPPONENT_FAN_CARD,
  TURN_LINE,
  fanGapLine,
  seatFan,
} from './table-presentation';

const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
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

interface CardPlace {
  x: number;
  y: number;
  faceUp: boolean;
  delay: number;
  z: number;
  personal: boolean;
}

function canvasText(text: string, size: number, color: ex.Color): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: pixelFont.toFont({
      family: '"Press Start 2P"',
      size,
      color,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
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
 * Hearts table: your hand along the bottom, other hands as backs,
 * the current trick toward the center, and taken hearts plus the
 * queen of spades beside each seat.
 */
export class HeartsDriver implements GameDriver<HeartsState> {
  readonly name = 'Hearts';
  readonly gameType = HEARTS_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private labels: ex.Actor[] = [];
  private buttons: ex.Actor[] = [];
  private flashes: ex.Actor[] = [];
  private selected = new Set<string>();
  private hover: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private buttonAction: 'pass' | 'play' | null = null;
  private state: HeartsState | null = null;
  private ctx: RenderContext | null = null;

  render(state: HeartsState, ctx: RenderContext): void {
    if (
      this.state?.tableId !== state.tableId ||
      this.state?.handIndex !== state.handIndex
    ) {
      this.selected.clear();
      this.hover = null;
      this.handHover.clear();
    }
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    const action = heartsAction(state, ctx.meSeatIndex);
    if (action !== this.buttonAction) {
      for (const button of this.buttons) button.kill();
      this.buttons = [];
      this.buttonAction = action;
      if (action === 'pass') this.addButton(ctx, PASS_BUTTON, 'Pass', action);
      if (action === 'play') this.addButton(ctx, PLAY_BUTTON, 'Play', action);
    }
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
  }

  handleInput(event: InputEvent, state: HeartsState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play' && state.phase !== 'pass') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (event.target === 'pass' && event.type === 'pointerup') {
      if (heartsAction(state, ctx.meSeatIndex) !== 'pass') return;
      this.sendPass(state, ctx);
      return;
    }
    if (event.target === 'play' && event.type === 'pointerup') {
      if (heartsAction(state, ctx.meSeatIndex) !== 'play') return;
      this.sendPlay(state, ctx);
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
      this.toggle(state, event.target);
      this.applyLift(event.target, state, ctx);
    }
  }

  /**
   * The module said no. Flash the button that sent the intent and the
   * lifted cards, so the click does not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    const box =
      type === 'pass' ? PASS_BUTTON : type === 'play' ? PLAY_BUTTON : null;
    if (!box) {
      return;
    }
    this.flashBox(ctx, box.x, box.y, box.w, box.h);
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
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    for (const actor of this.buttons) {
      actor.kill();
    }
    this.buttons = [];
    this.buttonAction = null;
    this.selected.clear();
    this.hover = null;
    this.stopHoverClock();
    this.state = null;
    this.ctx = null;
  }

  private toggle(state: HeartsState, cardId: string): void {
    if (state.phase === 'play') {
      if (this.selected.has(cardId) && this.selected.size === 1) {
        this.selected.delete(cardId);
        return;
      }
      this.selected.clear();
      this.selected.add(cardId);
      return;
    }
    if (this.selected.has(cardId)) {
      this.selected.delete(cardId);
      return;
    }
    this.selected.add(cardId);
  }

  private sendPass(state: HeartsState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    ctx.sendIntent({
      type: 'pass',
      cards: selectedCards(hand, this.selected),
    });
  }

  private sendPlay(state: HeartsState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    const cards = selectedCards(hand, this.selected);
    ctx.sendIntent({ type: 'play', card: cards[0] ?? '' });
  }

  private syncLabels(state: HeartsState, ctx: RenderContext): void {
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    if (state.phase === 'lobby') {
      return;
    }
    if (state.phase === 'finished') {
      const line = finishedLine(state, ctx.seats) ?? 'Finished';
      this.labels.push(this.banner(ctx, line));
    } else if (state.phase === 'pass') {
      const passed =
        ctx.meSeatIndex !== null &&
        state.passes[String(ctx.meSeatIndex)] !== undefined;
      this.labels.push(
        this.textActor(
          ctx,
          TURN_LINE.x,
          TURN_LINE.y,
          passed ? 'Passed' : 'Pass 3',
          GOLD,
        ),
      );
      this.labels.push(this.textActor(ctx, 430, 196, passLabel(state), GOLD));
    } else {
      this.labels.push(
        this.textActor(
          ctx,
          TURN_LINE.x,
          TURN_LINE.y,
          playHint(state, ctx.meSeatIndex),
          GOLD,
        ),
      );
      if (state.heartsBroken) {
        this.labels.push(this.textActor(ctx, 216, 196, 'Hearts broken', GOLD));
      }
    }
    for (const seat of ctx.seats) {
      const text = `${state.scores[String(seat.seatIndex)] ?? 0} pts`;
      const at = seat.self
        ? {
            x: Math.round(seat.x - (text.length * 8) / 2),
            y: seat.y - 16,
          }
        : fanGapLine(seat.x, seat.y, seat.name, text, 0);
      const label = this.textActor(ctx, at.x, at.y, text, DIM);
      if (!seat.self) {
        label.z = 80;
      }
      this.labels.push(label);
    }
  }

  private syncCards(state: HeartsState, ctx: RenderContext): void {
    const desired = new Map<string, CardPlace>();
    this.placePenalties(state, ctx, desired);
    this.placeTrick(state, ctx, desired);
    const hand =
      ctx.meSeatIndex === null
        ? []
        : (state.hands[String(ctx.meSeatIndex)] ?? []);
    const handSlots = handPositions(hand.length);
    for (let index = 0; index < hand.length; index += 1) {
      const cardId = hand[index];
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
      state.phase === 'pass' &&
      ctx.meSeatIndex !== null &&
      state.passes[String(ctx.meSeatIndex)]
    ) {
      this.selected.clear();
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
        this.selected.delete(cardId);
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx);
    }
  }

  private placePenalties(
    state: HeartsState,
    ctx: RenderContext,
    desired: Map<string, CardPlace>,
  ): void {
    for (const seat of ctx.seats) {
      const taken = pointCards(state.tricksTaken[String(seat.seatIndex)] ?? []);
      const slots = penaltyPositions(taken.length, seat.x, seat.y, seat.self);
      for (let index = 0; index < taken.length; index += 1) {
        const cardId = taken[index];
        const slot = slots[index];
        if (!cardId || !slot) {
          continue;
        }
        desired.set(cardId, {
          x: slot.x,
          y: slot.y,
          faceUp: true,
          delay: 0,
          z: 3 + index,
          personal: false,
        });
      }
    }
  }

  private placeTrick(
    state: HeartsState,
    ctx: RenderContext,
    desired: Map<string, CardPlace>,
  ): void {
    for (let index = 0; index < state.currentTrick.length; index += 1) {
      const play = state.currentTrick[index];
      if (!play) {
        continue;
      }
      const seat = ctx.seats.find((row) => row.seatIndex === play.seat);
      const slot = trickPosition(seat?.x ?? PILE_X, seat?.y ?? PILE_Y);
      desired.set(play.card, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: 0,
        z: 8 + index,
        personal: false,
      });
    }
  }

  private placeCard(
    cardId: string,
    place: CardPlace,
    ctx: RenderContext,
  ): void {
    const atlas = place.personal ? ctx.myCards : ctx.cards;
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
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
    const moved = record.restX !== place.x || record.restY !== place.y;
    record.restX = place.x;
    record.restY = place.y;
    record.restZ = place.z;
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
    state: HeartsState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    const legal = legalCard(state, ctx.meSeatIndex, cardId);
    const held = cardLift({
      legal,
      hovered: false,
      selected: this.selected.has(cardId),
    });
    const hover =
      record.personal && !ctx.inputBlocked() && held === 0
        ? this.handHover.current(cardId)
        : 0;
    placeCardLift(
      record.actor,
      record.restX,
      record.restY,
      record.restZ,
      held > 0 ? held : hover,
      legal && this.selected.has(cardId),
      record.personal,
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
    const hand =
      ctx.meSeatIndex === null
        ? []
        : (state.hands[String(ctx.meSeatIndex)] ?? []);
    const slots = handPositions(hand.length);
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
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    return localHandHitBoxes(hand, this.cards, CARD_DRAW);
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

  private syncBacks(state: HeartsState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; z: number; rotation: number; scale: number }
    >();
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const slots = seatFan(seat.x, seat.y, count, seat.name);
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        if (!slot) {
          continue;
        }
        desired.set(`${seat.seatIndex}:${index}`, {
          x: slot.x,
          y: slot.y,
          z: 4 + index,
          rotation: slot.rotation,
          scale: slot.scale,
        });
      }
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
      if (!actor) {
        actor = new ex.Actor({
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
        ctx.scene.add(actor);
        this.backs.set(key, actor);
        this.backTargets.set(key, target);
        actor.actions.moveTo({
          pos: ex.vec(place.x, place.y),
          duration: TRAVEL_MS,
          easing: ex.EasingFunctions.EaseOutCubic,
        });
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
      actor.actions.moveTo({
        pos: ex.vec(place.x, place.y),
        duration: TRAVEL_MS,
        easing: ex.EasingFunctions.EaseOutCubic,
      });
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
    this.selected.clear();
    this.hover = null;
    this.handHover.clear();
  }

  private banner(ctx: RenderContext, text: string): ex.Actor {
    const size = isMobileDevice()
      ? Math.max(8, Math.min(16, Math.floor(700 / Math.max(1, text.length))))
      : 8;
    const width = text.length * size + 16;
    const actor = new ex.Actor({
      pos: ex.vec(Math.floor((LOGICAL_WIDTH - width) / 2), 112),
      anchor: ex.vec(0, 0),
      width,
      height: size + 16,
      z: 16,
    });
    actor.graphics.use(panelRect(width, size + 16, BUTTON, STROKE));
    const caption = new ex.Actor({
      pos: ex.vec(8, 8),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(text, size, GOLD));
    actor.addChild(caption);
    ctx.scene.add(actor);
    return actor;
  }

  private textActor(
    ctx: RenderContext,
    x: number,
    y: number,
    text: string,
    color: ex.Color,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      z: 14,
    });
    actor.graphics.use(canvasText(text, 8, color));
    ctx.scene.add(actor);
    return actor;
  }

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target: 'pass' | 'play',
  ): void {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const size = buttonFontSize(label, box.w, box.h);
    const rest = buttonCaptionPos(label, box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(label, size, GOLD));
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
        face.strokeColor = STROKE;
        face.color = BUTTON;
        caption.pos = ex.vec(rest.x, rest.y);
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
    ctx.scene.add(actor);
    this.buttons.push(actor);
  }
}
