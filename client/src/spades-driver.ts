import * as ex from 'excalibur';
import {
  SPADES_GAME_TYPE,
  type SpadesState,
} from '../../src/shared/games/spades';
import {
  CARD_DRAW,
  PILE_X,
  PILE_Y,
  PLAY_BUTTON,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
} from './bluff-layout';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { chipAtlas, pixelFont } from './boot-scene';
import type { CardAtlas } from './card-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import { LOGICAL_WIDTH } from './sheets';
import {
  BID_PROMPT,
  PARTNERSHIP_BOARD,
  bidButtonBox,
  bidButtonLabel,
  finishedLine,
  legalCard,
  partnershipBoard,
  seatBidText,
  seatTeam,
  trickPosition,
  wonTrickPosition,
} from './spades-layout';

const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const NS_TEXT = ex.Color.fromHex('#b8e994');
const EW_TEXT = ex.Color.fromHex('#9ccbff');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const FLASH_FILL = ex.Color.fromRGB(232, 60, 48, 0.8);
const FLASH_STROKE = ex.Color.fromHex('#ff3b2f');

const TRAVEL_MS = 420;
const WON_HOLD_MS = 900;
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
  /** A finished trick: sweep it off the felt a moment after it lands. */
  sweep: boolean;
}

interface CardPlace {
  x: number;
  y: number;
  faceUp: boolean;
  delay: number;
  z: number;
  sweep?: boolean;
  personal: boolean;
}

interface BidButton {
  tricks: number;
  actor: ex.Actor;
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
 * Spades table: your hand along the bottom, other hands as backs,
 * partnership bids beside the felt, and the trick in the center.
 */
export class SpadesDriver implements GameDriver<SpadesState> {
  readonly name = 'Spades';
  readonly gameType = SPADES_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private backs = new Map<string, ex.Actor>();
  private backTargets = new Map<string, string>();
  private labels: ex.Actor[] = [];
  private bidButtons: BidButton[] = [];
  private playButton: ex.Actor | null = null;
  private chips: ex.Actor[] = [];
  private flashes: ex.Actor[] = [];
  private selected: string | null = null;
  private hover: string | null = null;
  private buttonsReady = false;
  private wonKey: string | null = null;
  private sweptKey: string | null = null;
  private state: SpadesState | null = null;
  private ctx: RenderContext | null = null;

  render(state: SpadesState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (!this.buttonsReady) {
      this.addPlayButton(ctx);
      for (let tricks = 0; tricks <= 13; tricks += 1) {
        this.addBidButton(ctx, tricks);
      }
      this.buttonsReady = true;
    }
    this.placeControls(state);
    this.syncLabels(state, ctx);
    this.syncChips(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
  }

  handleInput(event: InputEvent, state: SpadesState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (event.target.startsWith('bid:') && event.type === 'pointerup') {
      if (state.stage !== 'bid') {
        return;
      }
      const tricks = Number(event.target.slice(4));
      if (!Number.isSafeInteger(tricks)) {
        return;
      }
      ctx.sendIntent({ type: 'bid', tricks });
      return;
    }
    if (event.target === 'play' && event.type === 'pointerup') {
      if (state.stage !== 'trick') {
        return;
      }
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
      const previous = this.selected;
      this.selected = this.selected === event.target ? null : event.target;
      if (previous !== null && previous !== event.target) {
        this.applyLift(previous, state, ctx);
      }
      this.applyLift(event.target, state, ctx);
    }
  }

  /**
   * The module said no. Flash the bid or Play control, and the lifted card,
   * so the click does not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    if (type === 'bid') {
      const tricks =
        typeof intent === 'object' &&
        intent !== null &&
        'tricks' in intent &&
        typeof intent.tricks === 'number'
          ? intent.tricks
          : null;
      const button = this.bidButtons.find((row) => row.tricks === tricks);
      if (!button) {
        return;
      }
      const box = bidButtonBox(button.tricks);
      this.flashBox(ctx, box.x, box.y, box.w, box.h);
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
    if (!this.selected) {
      return;
    }
    const record = this.cards.get(this.selected);
    if (!record) {
      return;
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
    for (const button of this.bidButtons) {
      button.actor.kill();
    }
    this.bidButtons = [];
    this.playButton?.kill();
    this.playButton = null;
    for (const chip of this.chips) {
      chip.kill();
    }
    this.chips = [];
    this.buttonsReady = false;
    this.wonKey = null;
    this.sweptKey = null;
    this.selected = null;
    this.hover = null;
    this.state = null;
    this.ctx = null;
  }

  private sendPlay(state: SpadesState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    const card =
      this.selected !== null && hand.includes(this.selected)
        ? this.selected
        : '';
    ctx.sendIntent({ type: 'play', card });
  }

  private placeControls(state: SpadesState): void {
    const bidding = state.phase === 'play' && state.stage === 'bid';
    const playing = state.phase === 'play' && state.stage === 'trick';
    for (const button of this.bidButtons) {
      const box = bidButtonBox(button.tricks);
      button.actor.pos = bidding ? ex.vec(box.x, box.y) : ex.vec(box.x, -300);
    }
    if (this.playButton) {
      this.playButton.pos = playing
        ? ex.vec(PLAY_BUTTON.x, PLAY_BUTTON.y)
        : ex.vec(PLAY_BUTTON.x, -300);
    }
  }

  private syncLabels(state: SpadesState, ctx: RenderContext): void {
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    if (state.phase === 'lobby') {
      return;
    }
    if (state.phase === 'finished') {
      const line = finishedLine(state) ?? 'Finished';
      this.labels.push(this.banner(ctx, line));
    }
    const board = partnershipBoard(state, ctx.meSeatIndex);
    const lines: { text: string; color: ex.Color }[] = [
      { text: board.trump, color: DIM },
      { text: board.nsHead, color: NS_TEXT },
      { text: board.nsBid, color: GOLD },
      { text: board.nsScore, color: GOLD },
      { text: board.ewHead, color: EW_TEXT },
      { text: board.ewBid, color: GOLD },
      { text: board.ewScore, color: GOLD },
    ];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const row = PARTNERSHIP_BOARD.rows[index];
      if (!line || row === undefined || !line.text) {
        continue;
      }
      this.labels.push(
        this.textActor(
          ctx,
          PARTNERSHIP_BOARD.x,
          PARTNERSHIP_BOARD.y + row,
          line.text,
          line.color,
        ),
      );
    }
    if (state.phase === 'play') {
      const mine =
        ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
      if (state.stage === 'bid') {
        const turn = mine ? 'Your bid' : 'Wait';
        this.labels.push(
          this.textActor(ctx, BID_PROMPT.x, BID_PROMPT.y, turn, GOLD),
        );
      } else {
        const turn = mine ? 'Your play' : 'Wait';
        this.labels.push(this.textActor(ctx, 748, 428, turn, GOLD));
      }
    }
    for (const seat of ctx.seats) {
      const text = seatBidText(state, seat.seatIndex);
      if (text.length === 0) {
        continue;
      }
      const plateWidth = Math.max(48, seat.name.length * 8 + 16);
      const color = seatTeam(seat.seatIndex) === 'ns' ? NS_TEXT : EW_TEXT;
      this.labels.push(
        this.textActor(
          ctx,
          seat.x + plateWidth / 2 + 6,
          seat.y + 6,
          text,
          color,
        ),
      );
    }
  }

  private syncChips(state: SpadesState, ctx: RenderContext): void {
    if (state.phase === 'lobby') {
      for (const chip of this.chips) {
        chip.kill();
      }
      this.chips = [];
      return;
    }
    if (this.chips.length > 0) {
      return;
    }
    this.chips.push(
      this.chipActor(
        ctx,
        'green',
        PARTNERSHIP_BOARD.chipX,
        PARTNERSHIP_BOARD.y + PARTNERSHIP_BOARD.chipRows[0],
      ),
    );
    this.chips.push(
      this.chipActor(
        ctx,
        'blue',
        PARTNERSHIP_BOARD.chipX,
        PARTNERSHIP_BOARD.y + PARTNERSHIP_BOARD.chipRows[1],
      ),
    );
  }

  private chipActor(
    ctx: RenderContext,
    color: 'green' | 'blue',
    x: number,
    y: number,
  ): ex.Actor {
    const sprite = chipAtlas.sprite(color);
    sprite.scale = ex.vec(2, 2);
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      width: 32,
      height: 32,
      z: 3,
    });
    actor.graphics.use(sprite);
    ctx.scene.add(actor);
    return actor;
  }

  private syncCards(state: SpadesState, ctx: RenderContext): void {
    const desired = new Map<string, CardPlace>();
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
    const trick = state.trick.length > 0 ? state.trick : [];
    for (let index = 0; index < trick.length; index += 1) {
      const played = trick[index];
      if (!played) {
        continue;
      }
      const seat = ctx.seats.find((row) => row.seatIndex === played.seat);
      const slot = trickPosition(seat?.x ?? PILE_X, seat?.y ?? PILE_Y);
      desired.set(played.card, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: 0,
        z: 20 + index,
        personal: false,
      });
    }
    const won = state.trick.length === 0 ? state.lastTrick : null;
    this.wonKey = won
      ? `${state.handNumber}:${won.cards.map((row) => row.card).join(',')}`
      : null;
    if (won && this.wonKey !== this.sweptKey) {
      const seat = ctx.seats.find((row) => row.seatIndex === won.winner);
      for (let index = 0; index < won.cards.length; index += 1) {
        const played = won.cards[index];
        if (!played) {
          continue;
        }
        const slot = wonTrickPosition(
          seat?.x ?? PILE_X,
          seat?.y ?? PILE_Y,
          index,
        );
        desired.set(played.card, {
          x: slot.x,
          y: slot.y,
          faceUp: true,
          delay: 0,
          z: 18 + index,
          sweep: true,
          personal: false,
        });
      }
    }
    if (this.selected !== null && !hand.includes(this.selected)) {
      this.selected = null;
    }
    for (const [cardId, record] of this.cards) {
      if (!desired.has(cardId)) {
        record.actor.kill();
        this.cards.delete(cardId);
        if (this.selected === cardId) {
          this.selected = null;
        }
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx);
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
      actor.graphics.use(cardSprite(atlas, cardId, place.faceUp));
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
        personal: place.personal,
        moving: false,
        placed: false,
        sweep: false,
      };
      this.cards.set(cardId, record);
    }
    record.sweep = place.sweep === true;
    record.actor.z = this.lifted(cardId) ? 30 : place.z;
    if (record.faceUp !== place.faceUp || record.personal !== place.personal) {
      record.faceUp = place.faceUp;
      record.personal = place.personal;
      record.actor.graphics.use(cardSprite(atlas, cardId, place.faceUp));
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
        if (record.sweep) {
          this.sweepCard(cardId, record);
        }
      });
  }

  private sweepCard(cardId: string, record: CardRecord): void {
    const key = this.wonKey;
    record.actor.actions.delay(WON_HOLD_MS).callMethod(() => {
      record.actor.kill();
      if (this.cards.get(cardId) === record) {
        this.cards.delete(cardId);
      }
      this.sweptKey = key;
    });
  }

  private applyLift(
    cardId: string,
    state: SpadesState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    const lift = cardLift({
      legal: legalCard(state, ctx.meSeatIndex, cardId),
      hovered: this.hover === cardId,
      selected: this.selected === cardId,
    });
    record.actor.pos = ex.vec(record.restX, record.restY - lift);
    if (lift > 0) {
      record.actor.z = 30;
    }
  }

  private lifted(cardId: string): boolean {
    return this.hover === cardId || this.selected === cardId;
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

  private syncBacks(state: SpadesState, ctx: RenderContext): void {
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
          pos: ex.vec(PILE_X, PILE_Y),
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
    this.selected = null;
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

  private addPlayButton(ctx: RenderContext): void {
    const box = PLAY_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, -300),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const rest = buttonCaptionPos('Play', box.w, box.h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Play', BUTTON_FONT_SIZE, GOLD));
    actor.addChild(caption);
    this.bindButton(actor, face, caption, rest, 'play');
    ctx.scene.add(actor);
    this.playButton = actor;
  }

  private addBidButton(ctx: RenderContext, tricks: number): void {
    const box = bidButtonBox(tricks);
    const actor = new ex.Actor({
      pos: ex.vec(box.x, -300),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const label = bidButtonLabel(tricks);
    const rest = buttonCaptionPos(label, box.w, box.h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(label, BUTTON_FONT_SIZE, GOLD));
    actor.addChild(caption);
    this.bindButton(actor, face, caption, rest, `bid:${tricks}`);
    ctx.scene.add(actor);
    this.bidButtons.push({ tricks, actor });
  }

  private bindButton(
    actor: ex.Actor,
    face: ex.Rectangle,
    caption: ex.Actor,
    rest: { x: number; y: number },
    target: string,
  ): void {
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
      const state = this.state;
      const current = this.ctx;
      if (!state || !current) {
        return;
      }
      this.handleInput({ type: 'pointerup', target }, state, current);
    });
  }
}
