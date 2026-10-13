import * as ex from 'excalibur';
import {
  GO_FISH_GAME_TYPE,
  rankOfCard,
  type GoFishState,
} from '../../src/shared/games/go-fish';
import {
  CARD_DRAW,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
} from './bluff-layout';
import { canvasText, panelRect } from './canvas-ui';
import type { CardAtlas } from './card-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
  STOCK_LABEL_DY,
  askButtonBox,
  askSeat,
  bookSlots,
  finishedLine,
  legalCard,
  opponentBackAnchor,
  opponentBookOrigin,
  plateWidth,
  selfBookOrigin,
  stockPosition,
} from './go-fish-layout';
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
const BOOK_SCALE = 0.5;
const BOOK_ART_HALF = 12;
const BOOK_LABEL_DY = 34;
const BOOK_CAPTION_DY = 16;
const LAST_ASK_Y = 236;
const STOCK_SHOWN = 3;

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
  moving: boolean;
  placed: boolean;
}

interface BookRecord {
  actor: ex.Actor;
  caption: ex.Actor;
  cardId: string;
  rank: string;
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
 * Go Fish table: your hand along the bottom, other hands as backs,
 * the stock left of center, and books beside each seat.
 */
export class GoFishDriver implements GameDriver<GoFishState> {
  readonly name = 'Go Fish';
  readonly gameType = GO_FISH_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private books = new Map<string, BookRecord>();
  private stockActors: ex.Actor[] = [];
  private stockKey = '';
  private labels: ex.Actor[] = [];
  private buttons: ex.Actor[] = [];
  private askKey = '';
  private askBoxes = new Map<
    number,
    { x: number; y: number; w: number; h: number }
  >();
  private flashes: ex.Actor[] = [];
  private selectedRank: string | null = null;
  private hover: string | null = null;
  private state: GoFishState | null = null;
  private ctx: RenderContext | null = null;

  render(state: GoFishState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.syncAskButtons(ctx);
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
    this.syncStock(state, ctx);
    this.syncBooks(state, ctx);
  }

  handleInput(event: InputEvent, state: GoFishState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    const targetSeat = askSeat(event.target);
    if (targetSeat !== null && event.type === 'pointerup') {
      ctx.sendIntent({
        type: 'ask',
        targetSeat,
        rank: this.selectedRank ?? '',
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
      if (!rank) {
        return;
      }
      this.selectedRank = this.selectedRank === rank ? null : rank;
      this.refreshLifts(state, ctx);
    }
  }

  /**
   * The module said no. Flash the Ask button and the lifted rank
   * so the click does not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    if (typeof intent !== 'object' || intent === null || !('type' in intent)) {
      return;
    }
    if (intent.type !== 'ask') {
      return;
    }
    const targetSeat =
      'targetSeat' in intent && typeof intent.targetSeat === 'number'
        ? intent.targetSeat
        : null;
    if (targetSeat !== null) {
      const box = this.askBoxes.get(targetSeat);
      if (box) {
        this.flashBox(ctx, box.x, box.y, box.w, box.h);
      }
    }
    for (const [cardId, record] of this.cards) {
      if (!this.rankSelected(cardId)) {
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
    this.askKey = '';
    this.askBoxes.clear();
    this.selectedRank = null;
    this.hover = null;
    this.state = null;
    this.ctx = null;
  }

  private syncLabels(state: GoFishState, ctx: RenderContext): void {
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
    this.labels.push(
      this.textActor(ctx, 748, 428, mine ? 'Your turn' : 'Wait', GOLD),
    );
    const stock = stockPosition();
    const stockLine = `Stock ${state.stock.length}`;
    this.labels.push(
      this.textActor(
        ctx,
        stock.x - stockLine.length * 4,
        stock.y + STOCK_LABEL_DY,
        stockLine,
        GOLD,
      ),
    );
    if (state.lastAsk) {
      const ask = state.lastAsk;
      const line =
        ask.given > 0
          ? `Got ${ask.given} ${ask.rank}`
          : ask.drawn
            ? 'Go fish'
            : `No ${ask.rank}`;
      this.labels.push(
        this.textActor(ctx, 480 - line.length * 4, LAST_ASK_Y, line, DIM),
      );
    }
    for (const seat of ctx.seats) {
      const booked = state.books[String(seat.seatIndex)]?.length ?? 0;
      if (seat.self) {
        if (booked > 0) {
          const origin = selfBookOrigin();
          this.labels.push(
            this.textActor(
              ctx,
              origin.x - BOOK_ART_HALF,
              origin.y - BOOK_LABEL_DY,
              `Books ${booked}`,
              GOLD,
            ),
          );
        }
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const line = booked > 0 ? `x${count} Books ${booked}` : `x${count}`;
      this.labels.push(
        this.textActor(ctx, seat.x - line.length * 4, seat.y - 16, line, DIM),
      );
    }
  }

  private syncCards(state: GoFishState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; faceUp: boolean; delay: number; z: number }
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
      });
    }
    if (this.selectedRank !== null) {
      const still = hand.some((card) => rankOfCard(card) === this.selectedRank);
      if (!still) {
        this.selectedRank = null;
      }
    }
    for (const [cardId, record] of this.cards) {
      if (!desired.has(cardId)) {
        record.actor.kill();
        this.cards.delete(cardId);
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx);
    }
  }

  /** `syncCards` only ever places the local player's own hand here. */
  private placeCard(
    cardId: string,
    place: { x: number; y: number; faceUp: boolean; delay: number; z: number },
    ctx: RenderContext,
  ): void {
    const spawn = stockPosition();
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        pos: ex.vec(spawn.x, spawn.y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: place.z,
      });
      actor.graphics.use(cardSprite(ctx.myCards, cardId, place.faceUp));
      actor.on('pointerenter', () => {
        this.onCard('pointerenter', cardId);
      });
      actor.on('pointerleave', () => {
        this.onCard('pointerleave', cardId);
      });
      actor.on('pointerup', () => {
        this.onCard('pointerup', cardId);
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
      record.actor.graphics.use(cardSprite(ctx.myCards, cardId, place.faceUp));
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
    state: GoFishState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    const lift = cardLift({
      legal: legalCard(state, ctx.meSeatIndex, cardId),
      hovered: this.hover === cardId,
      selected: this.rankSelected(cardId),
    });
    record.actor.pos = ex.vec(record.restX, record.restY - lift);
    if (lift > 0) {
      record.actor.z = 30;
    }
  }

  private refreshLifts(state: GoFishState, ctx: RenderContext): void {
    for (const cardId of this.cards.keys()) {
      this.applyLift(cardId, state, ctx);
    }
  }

  private lifted(cardId: string): boolean {
    return this.hover === cardId || this.rankSelected(cardId);
  }

  private rankSelected(cardId: string): boolean {
    return (
      this.selectedRank !== null && rankOfCard(cardId) === this.selectedRank
    );
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
    const desired = new Map<string, { x: number; y: number; z: number }>();
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      const count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const anchor = opponentBackAnchor(seat.x, seat.y);
      const slots = opponentBackPositions(anchor.x, anchor.y, count);
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
    const spawn = stockPosition();
    for (const [key, place] of desired) {
      const target = `${place.x}:${place.y}`;
      let actor = this.backs.get(key);
      if (!actor) {
        actor = new ex.Actor({
          pos: ex.vec(spawn.x, spawn.y),
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

  private syncStock(state: GoFishState, ctx: RenderContext): void {
    const shown = Math.min(state.stock.length, STOCK_SHOWN);
    const key = `${shown}`;
    if (key === this.stockKey) {
      return;
    }
    for (const actor of this.stockActors) {
      actor.kill();
    }
    this.stockActors = [];
    this.stockKey = key;
    const spot = stockPosition();
    for (let index = 0; index < shown; index += 1) {
      const actor = new ex.Actor({
        pos: ex.vec(spot.x + index * 3, spot.y - index * 2),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: 3 + index,
      });
      actor.graphics.use(ctx.cards.back());
      ctx.scene.add(actor);
      this.stockActors.push(actor);
    }
  }

  private syncBooks(state: GoFishState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; cardId: string; rank: string }
    >();
    for (const seat of ctx.seats) {
      const list = state.books[String(seat.seatIndex)] ?? [];
      const origin = seat.self
        ? selfBookOrigin()
        : opponentBookOrigin(
            seat.x,
            seat.y,
            list.length,
            plateWidth(seat.name),
          );
      const slots = bookSlots(origin.x, origin.y, list.length);
      for (let index = 0; index < list.length; index += 1) {
        const book = list[index];
        const slot = slots[index];
        const cardId = book?.cards[0];
        if (!book || !slot || !cardId) {
          continue;
        }
        desired.set(`${seat.seatIndex}:${index}`, {
          x: slot.x,
          y: slot.y,
          cardId,
          rank: book.rank,
        });
      }
    }
    for (const [key, record] of this.books) {
      if (!desired.has(key)) {
        record.actor.kill();
        record.caption.kill();
        this.books.delete(key);
      }
    }
    for (const [key, place] of desired) {
      let record = this.books.get(key);
      if (!record) {
        const actor = new ex.Actor({
          pos: ex.vec(place.x, place.y),
          anchor: ex.vec(0.5, 0.5),
          width: CARD_DRAW * BOOK_SCALE,
          height: CARD_DRAW * BOOK_SCALE,
          z: 6,
        });
        const caption = new ex.Actor({
          pos: ex.vec(place.x, place.y),
          anchor: ex.vec(0, 0),
          z: 7,
        });
        ctx.scene.add(actor);
        ctx.scene.add(caption);
        record = { actor, caption, cardId: '', rank: '' };
        this.books.set(key, record);
      }
      record.actor.pos = ex.vec(place.x, place.y);
      record.caption.pos = ex.vec(
        place.x - place.rank.length * 4,
        place.y + BOOK_CAPTION_DY,
      );
      if (record.cardId !== place.cardId) {
        record.cardId = place.cardId;
        const sprite = cardSprite(ctx.cards, place.cardId, true);
        sprite.scale = ex.vec(BOOK_SCALE, BOOK_SCALE);
        record.actor.graphics.use(sprite);
      }
      if (record.rank !== place.rank) {
        record.rank = place.rank;
        record.caption.graphics.use(canvasText(place.rank, 8, GOLD));
      }
    }
  }

  private syncAskButtons(ctx: RenderContext): void {
    const others = ctx.seats.filter((seat) => !seat.self);
    const key = others
      .map((seat) => `${seat.seatIndex}:${seat.x}:${seat.y}`)
      .join('|');
    if (key === this.askKey) {
      return;
    }
    for (const actor of this.buttons) {
      actor.kill();
    }
    this.buttons = [];
    this.askBoxes.clear();
    this.askKey = key;
    for (const seat of others) {
      const box = askButtonBox(seat.x, seat.y);
      this.askBoxes.set(seat.seatIndex, box);
      this.addButton(ctx, box, 'Ask', `ask:${seat.seatIndex}`);
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
    for (const record of this.books.values()) {
      record.actor.kill();
      record.caption.kill();
    }
    this.books.clear();
    for (const actor of this.stockActors) {
      actor.kill();
    }
    this.stockActors = [];
    this.stockKey = '';
    this.selectedRank = null;
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

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target: string,
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
      pos: ex.vec(8, 7),
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
      caption.pos = ex.vec(8, 8);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(8, 7);
      const currentState = this.state;
      const current = this.ctx;
      if (!currentState || !current) {
        return;
      }
      this.handleInput({ type: 'pointerup', target }, currentState, current);
    });
    ctx.scene.add(actor);
    this.buttons.push(actor);
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
}
