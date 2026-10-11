import * as ex from 'excalibur';
import {
  BLACKJACK_BET_AMOUNTS,
  BLACKJACK_GAME_TYPE,
  blackjackStake,
  blackjackTotal,
  type BlackjackResult,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import {
  BET_10_BUTTON,
  BET_25_BUTTON,
  BET_50_BUTTON,
  CARD_DRAW,
  DEALER_X,
  DEALER_Y,
  DOUBLE_BUTTON,
  HIT_BUTTON,
  SPLIT_BUTTON,
  STAND_BUTTON,
  betAnchor,
  dealerPositions,
  faceForBlackjackCard,
  finishedLine,
  playerCardSlots,
} from './blackjack-layout';
import { chipsImage, pixelFont } from './boot-scene';
import type { CardAtlas } from './card-atlas';
import { ChipAtlas, type ChipDenomination } from './chip-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
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
const CHIP_SCALE = 2;

const chips = new ChipAtlas(chipsImage);

const BET_BUTTONS = [
  { amount: BLACKJACK_BET_AMOUNTS[0], box: BET_10_BUTTON },
  { amount: BLACKJACK_BET_AMOUNTS[1], box: BET_25_BUTTON },
  { amount: BLACKJACK_BET_AMOUNTS[2], box: BET_50_BUTTON },
] as const;

const ACT_BUTTONS = [
  { target: 'hit', label: 'Hit', box: HIT_BUTTON },
  { target: 'stand', label: 'Stand', box: STAND_BUTTON },
  { target: 'double', label: 'Double', box: DOUBLE_BUTTON },
  { target: 'split', label: 'Split', box: SPLIT_BUTTON },
] as const;

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

interface ButtonRecord {
  actor: ex.Actor;
  box: { x: number; y: number; w: number; h: number };
  group: 'bet' | 'act';
  target: string;
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
  const face = faceForBlackjackCard(cardId);
  if (!face) {
    return atlas.back();
  }
  return atlas.sprite(face);
}

function chipDenomination(amount: number): ChipDenomination {
  if (amount >= 100) {
    return 100;
  }
  if (amount >= 25) {
    return 25;
  }
  if (amount >= 10) {
    return 10;
  }
  if (amount >= 5) {
    return 5;
  }
  return 1;
}

function resultLabel(results: readonly BlackjackResult[]): string {
  if (results.some((result) => result === 'blackjack')) {
    return 'BJ';
  }
  if (results.some((result) => result === 'win')) {
    return 'Win';
  }
  if (results.length > 0 && results.every((result) => result === 'lose')) {
    return 'Lose';
  }
  if (results.length > 0 && results.every((result) => result === 'push')) {
    return 'Push';
  }
  return '';
}

/**
 * Blackjack table: the dealer hand at the top, your hand along the bottom,
 * other hands face up, and a chip for each stake.
 */
export class BlackjackDriver implements GameDriver<BlackjackState> {
  readonly name = 'Blackjack';
  readonly gameType = BLACKJACK_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private chipActors = new Map<string, ex.Actor>();
  private chipLabels = new Map<string, ex.Text>();
  private labels: ex.Actor[] = [];
  private buttons: ButtonRecord[] = [];
  private flashes: ex.Actor[] = [];
  private buttonsReady = false;
  private state: BlackjackState | null = null;
  private ctx: RenderContext | null = null;

  render(state: BlackjackState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (!this.buttonsReady) {
      this.addButtons(ctx);
      this.buttonsReady = true;
    }
    this.placeButtons(state);
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBets(state, ctx);
  }

  handleInput(
    event: InputEvent,
    state: BlackjackState,
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
    if (event.type !== 'pointerup') {
      return;
    }
    if (state.turnSeatIndex !== ctx.meSeatIndex) {
      return;
    }
    if (state.step === 'bet' && event.target.startsWith('bet:')) {
      const amount = Number(event.target.slice(4));
      ctx.sendIntent({ type: 'bet', amount });
      return;
    }
    if (
      state.step === 'act' &&
      (event.target === 'hit' ||
        event.target === 'stand' ||
        event.target === 'double' ||
        event.target === 'split')
    ) {
      ctx.sendIntent({ type: event.target });
    }
  }

  /**
   * The module said no. Flash the button that sent the intent so the click
   * does not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    const amount =
      typeof intent === 'object' &&
      intent !== null &&
      'amount' in intent &&
      typeof intent.amount === 'number'
        ? intent.amount
        : null;
    const target = type === 'bet' && amount !== null ? `bet:${amount}` : type;
    const button = this.buttons.find((item) => item.target === target);
    if (!button || typeof target !== 'string') {
      return;
    }
    this.flashBox(ctx, button.box.x, button.box.y, button.box.w, button.box.h);
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
    for (const button of this.buttons) {
      button.actor.kill();
    }
    this.buttons = [];
    this.buttonsReady = false;
    this.state = null;
    this.ctx = null;
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

  private syncLabels(state: BlackjackState, ctx: RenderContext): void {
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
      const turn =
        state.step === 'bet'
          ? mine
            ? 'Your bet'
            : 'Wait'
          : mine
            ? 'Your turn'
            : 'Wait';
      this.labels.push(this.textActor(ctx, 700, 428, turn, GOLD));
    }
    const dealerText = state.holeHidden
      ? 'Dealer'
      : `Dealer ${blackjackTotal(state.dealer)}`;
    this.labels.push(this.textActor(ctx, 430, 132, dealerText, GOLD));
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const outcome = resultLabel(row.results);
      if (outcome.length > 0) {
        this.labels.push(
          this.textActor(
            ctx,
            seat.self ? 24 : seat.x - 16,
            seat.self ? 480 : seat.y + 24,
            outcome,
            GOLD,
          ),
        );
        continue;
      }
      const hand = row.hands[row.handIndex] ?? row.hands[0];
      if (!hand) {
        continue;
      }
      this.labels.push(
        this.textActor(
          ctx,
          seat.self ? 24 : seat.x - 16,
          seat.self ? 480 : seat.y + 24,
          String(blackjackTotal(hand.cards)),
          DIM,
        ),
      );
    }
  }

  private syncCards(state: BlackjackState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; faceUp: boolean; delay: number; z: number }
    >();
    const dealerSlots = dealerPositions(state.dealer.length);
    for (let index = 0; index < state.dealer.length; index += 1) {
      const cardId = state.dealer[index];
      const slot = dealerSlots[index];
      if (!cardId || !slot) {
        continue;
      }
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: !(state.holeHidden && index === 1),
        delay: index * 16,
        z: 8 + index,
      });
    }
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      for (let handIndex = 0; handIndex < row.hands.length; handIndex += 1) {
        const hand = row.hands[handIndex];
        if (!hand) {
          continue;
        }
        const slots = playerCardSlots(
          seat.self,
          seat.x,
          seat.y,
          row.hands.length,
          handIndex,
          hand.cards.length,
        );
        for (let index = 0; index < hand.cards.length; index += 1) {
          const cardId = hand.cards[index];
          const slot = slots[index];
          if (!cardId || !slot) {
            continue;
          }
          desired.set(cardId, {
            x: slot.x,
            y: slot.y,
            faceUp: true,
            delay: index * 16,
            z: (seat.self ? 12 : 6) + index,
          });
        }
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

  private placeCard(
    cardId: string,
    place: { x: number; y: number; faceUp: boolean; delay: number; z: number },
    ctx: RenderContext,
  ): void {
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        pos: ex.vec(DEALER_X, DEALER_Y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: place.z,
      });
      actor.graphics.use(cardSprite(ctx.cards, cardId, place.faceUp));
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
    record.actor.z = place.z;
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
      this.travel(record, place.x, place.y, fromDeal ? place.delay : 0);
    }
  }

  private travel(
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
        record.actor.pos = ex.vec(record.restX, record.restY);
      });
  }

  private syncBets(state: BlackjackState, ctx: RenderContext): void {
    const desired = new Map<string, { x: number; y: number; amount: number }>();
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const amount = blackjackStake(row);
      if (amount <= 0) {
        continue;
      }
      const anchor = betAnchor(seat.x, seat.y, seat.self);
      desired.set(String(seat.seatIndex), {
        x: anchor.x,
        y: anchor.y,
        amount,
      });
    }
    for (const [key, actor] of this.chipActors) {
      if (!desired.has(key)) {
        actor.kill();
        this.chipActors.delete(key);
        this.chipLabels.delete(key);
      }
    }
    for (const [key, place] of desired) {
      let actor = this.chipActors.get(key);
      let label = this.chipLabels.get(key);
      if (!actor || !label) {
        actor = new ex.Actor({
          pos: ex.vec(place.x, place.y),
          anchor: ex.vec(0.5, 0.5),
          z: 15,
          scale: ex.vec(CHIP_SCALE, CHIP_SCALE),
        });
        label = canvasText(String(place.amount), 8, GOLD);
        const caption = new ex.Actor({
          pos: ex.vec(14, -4),
          anchor: ex.vec(0, 0),
          scale: ex.vec(1 / CHIP_SCALE, 1 / CHIP_SCALE),
        });
        caption.graphics.use(label);
        actor.addChild(caption);
        ctx.scene.add(actor);
        this.chipActors.set(key, actor);
        this.chipLabels.set(key, label);
      }
      actor.pos = ex.vec(place.x, place.y);
      actor.graphics.use(chips.sprite(chipDenomination(place.amount)));
      label.text = String(place.amount);
    }
  }

  private clearTableCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.cards.clear();
    for (const actor of this.chipActors.values()) {
      actor.kill();
    }
    this.chipActors.clear();
    this.chipLabels.clear();
  }

  private placeButtons(state: BlackjackState): void {
    const betting = state.phase === 'play' && state.step === 'bet';
    const acting = state.phase === 'play' && state.step === 'act';
    for (const button of this.buttons) {
      const show =
        (betting && button.group === 'bet') ||
        (acting && button.group === 'act');
      button.actor.pos = show
        ? ex.vec(button.box.x, button.box.y)
        : ex.vec(button.box.x, -200);
    }
  }

  private addButtons(ctx: RenderContext): void {
    for (const bet of BET_BUTTONS) {
      this.addButton(
        ctx,
        bet.box,
        `Bet ${bet.amount}`,
        `bet:${bet.amount}`,
        'bet',
      );
    }
    for (const action of ACT_BUTTONS) {
      this.addButton(ctx, action.box, action.label, action.target, 'act');
    }
  }

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target: string,
    group: 'bet' | 'act',
  ): void {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, -200),
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
    this.buttons.push({ actor, box, group, target });
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
}
