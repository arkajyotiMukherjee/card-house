import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  CRAZY_EIGHTS_GAME_TYPE,
  handHasPlay,
  isCrazyEightsSuit,
  rankOfCard,
  type CrazyEightsState,
  type CrazyEightsSuit,
} from '../../src/shared/games/crazy-eights';
import {
  CARD_DRAW,
  DRAW_BUTTON,
  PILE_X,
  PILE_Y,
  PLAY_BUTTON,
  SUIT_BUTTONS_HIDDEN_Y,
  SUIT_BUTTON_H,
  SUIT_BUTTON_W,
  SUIT_BUTTON_Y,
  SUIT_BUTTONS,
  cardLift,
  faceForCard,
  finishedLine,
  handPositions,
  legalCard,
  passInsteadOfDraw,
  discardPositions,
  stockPositions,
  suitBadge,
} from './crazy-eights-layout';
import {
  OPPONENT_FAN_CARD,
  TURN_LINE,
  opponentCountAnchor,
  seatFan,
} from './table-presentation';
import {
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import { canvasText, panelRect } from './canvas-ui';
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
import { LOGICAL_WIDTH } from './sheets';

const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const RED = ex.Color.fromHex('#ff8a7a');
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
 * Crazy Eights table: your hand along the bottom, other hands as backs,
 * the stock to the left of center, and the discard pile face up.
 * A wild eight shows the suit that was named for it.
 */
export class CrazyEightsDriver implements GameDriver<CrazyEightsState> {
  readonly name = 'Crazy Eights';
  readonly gameType = CRAZY_EIGHTS_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private stockBacks = new Map<string, ex.Actor>();
  private stockTargets = new Map<string, string>();
  private labels: ex.Actor[] = [];
  private buttons: ex.Actor[] = [];
  private actionButtons = new Map<string, ex.Actor>();
  private flashes: ex.Actor[] = [];
  private suitFaces = new Map<CrazyEightsSuit, ex.Rectangle>();
  private suitActors = new Map<CrazyEightsSuit, ex.Actor>();
  private selected = new Set<string>();
  private hover: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private namedSuit: CrazyEightsSuit | null = null;
  private buttonsReady = false;
  private drawText: ex.Text | null = null;
  private state: CrazyEightsState | null = null;
  private ctx: RenderContext | null = null;

  render(state: CrazyEightsState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    if (!this.buttonsReady) {
      this.addButton(ctx, PLAY_BUTTON, 'Play', 'play');
      this.drawText = this.addButton(ctx, DRAW_BUTTON, 'Draw', 'draw');
      for (const spec of SUIT_BUTTONS) {
        this.addButton(
          ctx,
          {
            x: spec.x,
            y: SUIT_BUTTON_Y,
            w: SUIT_BUTTON_W,
            h: SUIT_BUTTON_H,
          },
          spec.label,
          `suit:${spec.suit}`,
        );
      }
      this.buttonsReady = true;
    }
    const acting =
      state.phase === 'play' &&
      ctx.meSeatIndex !== null &&
      state.turnSeatIndex === ctx.meSeatIndex;
    const hasMatch = acting && handHasPlay(state, ctx.meSeatIndex!);
    for (const [target, actor] of this.actionButtons) {
      const visible = acting && (target === 'play' ? hasMatch : !hasMatch);
      actor.graphics.isVisible = visible;
      actor.pointer.useColliderShape = visible;
      actor.pointer.useGraphicsBounds = visible;
      for (const child of actor.children) {
        if (child instanceof ex.Actor) child.graphics.isVisible = visible;
      }
    }
    this.paintDrawLabel(state, ctx);
    this.paintSuitButtons();
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
    this.syncStock(state, ctx);
    this.paintSuitButtons();
  }

  handleInput(
    event: InputEvent,
    state: CrazyEightsState,
    ctx: RenderContext,
  ): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    const action =
      event.target === 'play' ||
      event.target === 'draw' ||
      event.target.startsWith('suit:');
    if (
      action &&
      (ctx.meSeatIndex === null || state.turnSeatIndex !== ctx.meSeatIndex)
    )
      return;
    if (event.target === 'play' && event.type === 'pointerup') {
      this.sendPlay(state, ctx);
      return;
    }
    if (event.target === 'draw' && event.type === 'pointerup') {
      if (ctx.meSeatIndex === null || handHasPlay(state, ctx.meSeatIndex)) {
        return;
      }
      if (passInsteadOfDraw(state, ctx.meSeatIndex)) {
        ctx.sendIntent({ type: 'pass' });
        return;
      }
      ctx.sendIntent({ type: 'draw' });
      return;
    }
    if (event.target.startsWith('suit:') && event.type === 'pointerup') {
      this.chooseSuit(event.target.slice(5));
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
      const previous = this.onlySelected();
      if (this.selected.has(event.target)) {
        this.selected.delete(event.target);
      } else {
        this.selected.clear();
        this.selected.add(event.target);
      }
      if (this.onlySelected() !== previous) {
        this.namedSuit = null;
        this.paintSuitButtons();
      }
      this.applyLift(event.target, state, ctx);
    }
  }

  /**
   * The module said no. Flash Play and the lifted card, Draw, or the suit
   * row when an eight was played without a suit.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const record =
      typeof intent === 'object' && intent !== null
        ? (intent as { type?: unknown; card?: unknown; suit?: unknown })
        : null;
    const type = record?.type;
    if (type === 'draw' || type === 'pass') {
      this.flashBox(
        ctx,
        DRAW_BUTTON.x,
        DRAW_BUTTON.y,
        DRAW_BUTTON.w,
        DRAW_BUTTON.h,
      );
      return;
    }
    if (type !== 'play') {
      return;
    }
    this.flashBox(
      ctx,
      PLAY_BUTTON.x,
      PLAY_BUTTON.y,
      PLAY_BUTTON.w,
      PLAY_BUTTON.h,
    );
    for (const cardId of this.selected) {
      const recordCard = this.cards.get(cardId);
      if (!recordCard) {
        continue;
      }
      const half = CARD_DRAW / 2;
      this.flashBox(
        ctx,
        recordCard.actor.pos.x - half,
        recordCard.actor.pos.y - half,
        CARD_DRAW,
        CARD_DRAW,
      );
    }
    const card = typeof record?.card === 'string' ? record.card : '';
    if (rankOfCard(card) === '8' && !isCrazyEightsSuit(record?.suit)) {
      for (const spec of SUIT_BUTTONS) {
        this.flashBox(ctx, spec.x, SUIT_BUTTON_Y, SUIT_BUTTON_W, SUIT_BUTTON_H);
      }
    }
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
    this.actionButtons.clear();
    this.suitFaces.clear();
    this.suitActors.clear();
    this.buttonsReady = false;
    this.drawText = null;
    this.selected.clear();
    this.hover = null;
    this.namedSuit = null;
    this.stopHoverClock();
    this.state = null;
    this.ctx = null;
  }

  private sendPlay(state: CrazyEightsState, ctx: RenderContext): void {
    const card = this.onlySelected();
    if (!card || !legalCard(state, ctx.meSeatIndex, card)) {
      return;
    }
    if (rankOfCard(card) === '8') {
      if (this.namedSuit) {
        ctx.sendIntent({ type: 'play', card, suit: this.namedSuit });
      }
      return;
    }
    ctx.sendIntent({ type: 'play', card });
  }

  private chooseSuit(raw: string): void {
    if (!isCrazyEightsSuit(raw)) {
      return;
    }
    const card = this.onlySelected();
    if (!card || rankOfCard(card) !== '8') {
      return;
    }
    this.namedSuit = raw;
    this.paintSuitButtons();
  }

  private onlySelected(): string | null {
    if (this.selected.size !== 1) {
      return null;
    }
    for (const card of this.selected) {
      return card;
    }
    return null;
  }

  private paintDrawLabel(state: CrazyEightsState, ctx: RenderContext): void {
    if (!this.drawText) {
      return;
    }
    this.drawText.text = passInsteadOfDraw(state, ctx.meSeatIndex)
      ? 'Pass'
      : 'Draw';
  }

  private paintSuitButtons(): void {
    const eight = this.onlySelected();
    const naming =
      eight !== null &&
      rankOfCard(eight) === '8' &&
      this.state?.phase === 'play' &&
      this.ctx?.meSeatIndex !== null &&
      this.state?.turnSeatIndex === this.ctx?.meSeatIndex;
    for (const spec of SUIT_BUTTONS) {
      const actor = this.suitActors.get(spec.suit);
      if (actor) {
        actor.pos.y = naming ? SUIT_BUTTON_Y : SUIT_BUTTONS_HIDDEN_Y;
      }
      const face = this.suitFaces.get(spec.suit);
      if (!face) {
        continue;
      }
      const chosen = naming && this.namedSuit === spec.suit;
      face.color = chosen ? BUTTON_DOWN : BUTTON;
      face.strokeColor = chosen ? STROKE_HOT : STROKE;
    }
  }

  private syncLabels(state: CrazyEightsState, ctx: RenderContext): void {
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
      return;
    }
    const mine =
      ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
    this.labels.push(this.suitBadgeActor(ctx, state));
    this.labels.push(
      this.textActor(
        ctx,
        TURN_LINE.x,
        TURN_LINE.y,
        mine ? 'Your turn' : 'Wait',
        GOLD,
      ),
    );
    if (state.stock.length > 0) {
      this.labels.push(
        this.textActor(
          ctx,
          STOCK_LABEL_X,
          STOCK_LABEL_Y,
          `x${state.stock.length}`,
          DIM,
        ),
      );
    }
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const countAt = opponentCountAnchor(seat.x, seat.y, count, seat.name);
      const countLabel = this.textActor(
        ctx,
        countAt.x,
        countAt.y,
        `x${count}`,
        DIM,
      );
      countLabel.z = 80;
      this.labels.push(countLabel);
    }
  }

  private syncCards(state: CrazyEightsState, ctx: RenderContext): void {
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
    const pileSlots = discardPositions(state.discardPile.length);
    const pileStart = state.discardPile.length - pileSlots.length;
    for (let index = 0; index < pileSlots.length; index += 1) {
      const cardId = state.discardPile[pileStart + index];
      const slot = pileSlots[index];
      if (!cardId || !slot) {
        continue;
      }
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: 0,
        z: 5 + index,
        personal: false,
      });
    }
    for (const cardId of [...this.selected]) {
      if (!hand.includes(cardId)) {
        this.selected.delete(cardId);
        this.namedSuit = null;
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
    state: CrazyEightsState | null,
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

  private syncBacks(state: CrazyEightsState, ctx: RenderContext): void {
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
    this.placeBacks(this.backs, this.backTargets, desired, ctx);
  }

  private syncStock(state: CrazyEightsState, ctx: RenderContext): void {
    const desired = new Map<string, { x: number; y: number; z: number }>();
    const slots = stockPositions(state.stock.length);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      if (!slot) {
        continue;
      }
      desired.set(`stock:${index}`, { x: slot.x, y: slot.y, z: 3 + index });
    }
    this.placeBacks(this.stockBacks, this.stockTargets, desired, ctx);
  }

  private placeBacks(
    backs: Map<string, ex.Actor>,
    targets: Map<string, string>,
    desired: ReadonlyMap<
      string,
      { x: number; y: number; z: number; rotation?: number; scale?: number }
    >,
    ctx: RenderContext,
  ): void {
    for (const [key, actor] of backs) {
      if (!desired.has(key)) {
        actor.kill();
        backs.delete(key);
        targets.delete(key);
      }
    }
    for (const [key, place] of desired) {
      const fan = place.rotation !== undefined;
      const target = fan
        ? `${place.x}:${place.y}:${place.rotation}:${place.scale ?? 1}`
        : `${place.x}:${place.y}`;
      let actor = backs.get(key);
      if (!actor) {
        const size = fan ? OPPONENT_FAN_CARD : CARD_DRAW;
        actor = new ex.Actor({
          pos: ex.vec(PILE_X, PILE_Y),
          anchor: ex.vec(0.5, 0.5),
          width: size,
          height: size,
          z: place.z,
          rotation: place.rotation ?? 0,
        });
        if (fan) {
          actor.scale = ex.vec(place.scale ?? 1, place.scale ?? 1);
        }
        const back = ctx.cards.back();
        actor.graphics.use(back);
        ctx.scene.add(actor);
        backs.set(key, actor);
        targets.set(key, target);
        actor.actions.moveTo({
          pos: ex.vec(place.x, place.y),
          duration: TRAVEL_MS,
          easing: ex.EasingFunctions.EaseOutCubic,
        });
        continue;
      }
      actor.z = place.z;
      if (fan) {
        actor.rotation = place.rotation ?? 0;
        actor.scale = ex.vec(place.scale ?? 1, place.scale ?? 1);
      }
      if (targets.get(key) === target) {
        continue;
      }
      targets.set(key, target);
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
    for (const actor of this.stockBacks.values()) {
      actor.kill();
    }
    this.stockBacks.clear();
    this.stockTargets.clear();
    this.selected.clear();
    this.hover = null;
    this.namedSuit = null;
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

  private suitBadgeActor(
    ctx: RenderContext,
    state: CrazyEightsState,
  ): ex.Actor {
    const badge = suitBadge(state);
    const width = badge.text.length * 8 + 16;
    const red = badge.suit === 'H' || badge.suit === 'D';
    const actor = new ex.Actor({
      pos: ex.vec(Math.floor(PILE_X - width / 2), BADGE_Y),
      anchor: ex.vec(0, 0),
      width,
      height: 24,
      z: 14,
    });
    actor.graphics.use(panelRect(width, 24, BUTTON, STROKE));
    const caption = new ex.Actor({
      pos: ex.vec(8, 8),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(badge.text, 8, red ? RED : GOLD));
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
  ): ex.Text {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    if (target.startsWith('suit:')) {
      const suit = target.slice(5);
      if (isCrazyEightsSuit(suit)) {
        this.suitFaces.set(suit, face);
        this.suitActors.set(suit, actor);
      }
    }
    const size = buttonFontSize(label, box.w, box.h);
    const rest = buttonCaptionPos(label, box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    const text = canvasText(label, size, GOLD);
    caption.graphics.use(text);
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
        this.paintSuitButtons();
        if (!target.startsWith('suit:')) {
          face.strokeColor = STROKE;
          face.color = BUTTON;
        }
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
    if (!target.startsWith('suit:')) this.actionButtons.set(target, actor);
    return text;
  }
}

const BADGE_Y = 196;
const STOCK_LABEL_X = 360;
const STOCK_LABEL_Y = 220;
