import * as ex from 'excalibur';
import {
  RUMMY_GAME_TYPE,
  deadwoodPoints,
  type RummyState,
} from '../../src/shared/games/rummy';
import {
  CARD_DRAW,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
  selectedPlayCards,
} from './bluff-layout';
import { pixelFont } from './boot-scene';
import type { CardAtlas } from './card-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
  DISCARD_BUTTON,
  DISCARD_X,
  DRAW_DISCARD_BUTTON,
  DRAW_STOCK_BUTTON,
  MELD_BUTTON,
  STOCK_X,
  STOCK_Y,
  discardPositions,
  finishedLine,
  legalCard,
  meldOrigin,
  meldPositions,
  stockPosition,
} from './rummy-layout';
import { LOGICAL_WIDTH } from './sheets';

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

type RummyButton = 'draw-stock' | 'draw-discard' | 'meld' | 'discard';

interface CardRole {
  kind: 'hand' | 'discard' | 'meld';
  meldIndex: number;
}

interface CardRecord {
  actor: ex.Actor;
  restX: number;
  restY: number;
  faceUp: boolean;
  moving: boolean;
  placed: boolean;
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
 * Rummy table: your hand along the bottom, other hands as backs,
 * melds beside each seat, and the stock and discard pile in the center.
 */
export class RummyDriver implements GameDriver<RummyState> {
  readonly name = 'Rummy';
  readonly gameType = RUMMY_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private roles = new Map<string, CardRole>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private labels: ex.Actor[] = [];
  private buttons: ex.Actor[] = [];
  private flashes: ex.Actor[] = [];
  private stockActor: ex.Actor | null = null;
  private selected = new Set<string>();
  private hover: string | null = null;
  private buttonsReady = false;
  private state: RummyState | null = null;
  private ctx: RenderContext | null = null;

  render(state: RummyState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (!this.buttonsReady) {
      this.addButton(ctx, DRAW_STOCK_BUTTON, 'Stock', 'draw-stock');
      this.addButton(ctx, DRAW_DISCARD_BUTTON, 'Take', 'draw-discard');
      this.addButton(ctx, MELD_BUTTON, 'Meld', 'meld');
      this.addButton(ctx, DISCARD_BUTTON, 'Discard', 'discard');
      this.buttonsReady = true;
    }
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
    this.syncStock(state, ctx);
  }

  handleInput(event: InputEvent, state: RummyState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (event.target === 'draw-stock' && event.type === 'pointerup') {
      ctx.sendIntent({ type: 'draw', source: 'stock' });
      return;
    }
    if (event.target === 'draw-discard' && event.type === 'pointerup') {
      ctx.sendIntent({ type: 'draw', source: 'discard' });
      return;
    }
    if (event.target === 'meld' && event.type === 'pointerup') {
      this.sendMeld(state, ctx);
      return;
    }
    if (event.target === 'discard' && event.type === 'pointerup') {
      this.sendDiscard(state, ctx);
      return;
    }
    if (event.target.startsWith('meld:') && event.type === 'pointerup') {
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
      if (this.selected.has(event.target)) {
        this.selected.delete(event.target);
      } else {
        this.selected.add(event.target);
      }
      this.applyLift(event.target, state, ctx);
    }
  }

  /**
   * The module said no. Flash the button that sent the intent, and the
   * lifted cards for a meld, layoff, or discard.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type = intentType(intent);
    const source = intentSource(intent);
    const box =
      type === 'draw' && source === 'stock'
        ? DRAW_STOCK_BUTTON
        : type === 'draw' && source === 'discard'
          ? DRAW_DISCARD_BUTTON
          : type === 'meld' || type === 'layoff'
            ? MELD_BUTTON
            : type === 'discard'
              ? DISCARD_BUTTON
              : null;
    if (!box) {
      return;
    }
    this.flashBox(ctx, box.x, box.y, box.w, box.h);
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
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    for (const actor of this.buttons) {
      actor.kill();
    }
    this.buttons = [];
    this.buttonsReady = false;
    this.selected.clear();
    this.hover = null;
    this.state = null;
    this.ctx = null;
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
    } else {
      const mine =
        ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
      const hint = state.drawn ? 'Meld or discard' : 'Draw one card';
      this.labels.push(
        this.textActor(ctx, 16, 368, mine ? hint : 'Wait', GOLD),
      );
    }
    if (state.discardPile.length > 0) {
      this.labels.push(this.textActor(ctx, DISCARD_X - 16, 200, 'Pile', DIM));
    }
    if (state.stock.length > 0) {
      this.labels.push(
        this.textActor(ctx, STOCK_X - 8, 200, `x${state.stock.length}`, DIM),
      );
    }
    const hand =
      ctx.meSeatIndex === null
        ? []
        : (state.hands[String(ctx.meSeatIndex)] ?? []);
    if (state.phase === 'play' && ctx.meSeatIndex !== null) {
      this.labels.push(
        this.textActor(ctx, 16, 472, `Pts ${deadwoodPoints(hand)}`, DIM),
      );
    }
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      this.labels.push(
        this.textActor(ctx, seat.x - 16, seat.y - 16, `x${count}`, DIM),
      );
      if (state.phase === 'finished') {
        const score = state.scores[String(seat.seatIndex)];
        if (score !== undefined) {
          this.labels.push(
            this.textActor(ctx, seat.x - 16, seat.y + 24, `p${score}`, GOLD),
          );
        }
      }
    }
  }

  private syncCards(state: RummyState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; faceUp: boolean; delay: number; z: number }
    >();
    this.roles.clear();
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
      this.roles.set(cardId, { kind: 'hand', meldIndex: 0 });
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: index * 16,
        z: 20 + index,
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
      this.roles.set(cardId, { kind: 'discard', meldIndex: 0 });
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: 0,
        z: 10 + index,
      });
    }
    const perSeat = new Map<number, number>();
    for (let meldIndex = 0; meldIndex < state.melds.length; meldIndex += 1) {
      const meld = state.melds[meldIndex];
      if (!meld) {
        continue;
      }
      const local = perSeat.get(meld.seat) ?? 0;
      perSeat.set(meld.seat, local + 1);
      const seat = ctx.seats.find((row) => row.seatIndex === meld.seat);
      const self = seat?.self ?? meld.seat === ctx.meSeatIndex;
      const origin = meldOrigin(seat?.x ?? 480, seat?.y ?? 456, self, local);
      const slots = meldPositions(origin.x, origin.y, meld.cards.length);
      const start = meld.cards.length - slots.length;
      for (let index = 0; index < slots.length; index += 1) {
        const cardId = meld.cards[start + index];
        const slot = slots[index];
        if (!cardId || !slot) {
          continue;
        }
        this.roles.set(cardId, { kind: 'meld', meldIndex });
        desired.set(cardId, {
          x: slot.x,
          y: slot.y,
          faceUp: true,
          delay: 0,
          z: 6 + index,
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
        this.selected.delete(cardId);
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx);
    }
  }

  private placeCard(
    cardId: string,
    place: { x: number; y: number; faceUp: boolean; delay: number; z: number },
    ctx: RenderContext,
  ): void {
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        pos: ex.vec(STOCK_X, STOCK_Y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: place.z,
      });
      actor.graphics.use(cardSprite(ctx.cards, cardId, place.faceUp));
      actor.on('pointerenter', () => {
        this.onCard('pointerenter', cardId);
      });
      actor.on('pointerleave', () => {
        this.onCard('pointerleave', cardId);
      });
      actor.on('pointerup', () => {
        this.onCardPress(cardId);
      });
      ctx.scene.add(actor);
      record = {
        actor,
        restX: place.x,
        restY: place.y,
        faceUp: place.faceUp,
        moving: false,
        placed: false,
      };
      this.cards.set(cardId, record);
    }
    record.actor.z = this.lifted(cardId) ? 30 : place.z;
    if (record.faceUp !== place.faceUp) {
      record.faceUp = place.faceUp;
      record.actor.graphics.use(cardSprite(ctx.cards, cardId, place.faceUp));
    }
    const moved = record.restX !== place.x || record.restY !== place.y;
    record.restX = place.x;
    record.restY = place.y;
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
    const lift = cardLift({
      legal: legalCard(state, ctx.meSeatIndex, cardId),
      hovered: this.hover === cardId,
      selected: this.selected.has(cardId),
    });
    record.actor.pos = ex.vec(record.restX, record.restY - lift);
    if (lift > 0) {
      record.actor.z = 30;
    }
  }

  private lifted(cardId: string): boolean {
    return this.hover === cardId || this.selected.has(cardId);
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
    const desired = new Map<string, { x: number; y: number; z: number }>();
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const slots = opponentBackPositions(seat.x, seat.y, count);
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        if (!slot) {
          continue;
        }
        desired.set(`${seat.seatIndex}:${index}`, {
          x: slot.x,
          y: slot.y,
          z: 4 + index,
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
      const target = `${place.x}:${place.y}`;
      let actor = this.backs.get(key);
      if (!actor) {
        actor = new ex.Actor({
          pos: ex.vec(STOCK_X, STOCK_Y),
          anchor: ex.vec(0.5, 0.5),
          width: CARD_DRAW,
          height: CARD_DRAW,
          z: place.z,
        });
        actor.graphics.use(ctx.cards.back());
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

  private syncStock(state: RummyState, ctx: RenderContext): void {
    if (state.stock.length === 0) {
      this.stockActor?.kill();
      this.stockActor = null;
      return;
    }
    const place = stockPosition();
    if (!this.stockActor) {
      const actor = new ex.Actor({
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: 4,
      });
      actor.graphics.use(ctx.cards.back());
      actor.on('pointerup', () => {
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
  }

  private banner(ctx: RenderContext, text: string): ex.Actor {
    const width = text.length * 8 + 16;
    const actor = new ex.Actor({
      pos: ex.vec(Math.floor((LOGICAL_WIDTH - width) / 2), 112),
      anchor: ex.vec(0, 0),
      width,
      height: 24,
      z: 16,
    });
    actor.graphics.use(panelRect(width, 24, BUTTON, STROKE));
    const caption = new ex.Actor({
      pos: ex.vec(8, 8),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(text, 8, GOLD));
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
    target: RummyButton,
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
    const caption = new ex.Actor({
      pos: ex.vec(8, 10),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(label, 8, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(8, 11);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(8, 10);
      const state = this.state;
      const current = this.ctx;
      if (!state || !current) {
        return;
      }
      this.handleInput({ type: 'pointerup', target }, state, current);
    });
    ctx.scene.add(actor);
    this.buttons.push(actor);
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
