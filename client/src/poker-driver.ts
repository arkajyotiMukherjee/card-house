import * as ex from 'excalibur';
import {
  POKER_GAME_TYPE,
  POKER_VARIATION_LABELS,
  pokerBetTo,
  pokerCallAmount,
  pokerCanCall,
  pokerCanCheck,
  pokerCanDiscard,
  pokerCanFold,
  pokerRaiseTo,
  type PokerState,
} from '../../src/shared/games/poker';
import { chipsImage } from './boot-scene';
import {
  DIM,
  GOLD,
  STROKE,
  STROKE_HOT,
  canvasText,
  panelRect,
} from './canvas-ui';
import type { CardAtlas } from './card-atlas';
import { ChipAtlas, type ChipDenomination } from './chip-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
  BET_BUTTON,
  CALL_BUTTON,
  CARD_DRAW,
  CHECK_BUTTON,
  FOLD_BUTTON,
  POT_X,
  POT_Y,
  RAISE_BUTTON,
  boardPositions,
  faceForPokerCard,
  finishedLine,
  holePositions,
} from './poker-layout';

const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const FLASH_FILL = ex.Color.fromRGB(232, 60, 48, 0.8);
const FLASH_STROKE = ex.Color.fromHex('#ff3b2f');

const FLASH_ON_MS = 130;
const FLASH_OFF_MS = 80;
const FLASH_BLINKS = 3;
const CHIP_SCALE = 2;
const CHIP_STACK_STEP = 4;
const CHIP_STACK_MAX = 4;
const DIMMED = 0.45;
const CHIP_DENOMINATIONS = [100, 25, 10, 5, 1] as const;

const chips = new ChipAtlas(chipsImage);

const ACTION_BUTTONS = [
  { target: 'fold', label: 'Fold', box: FOLD_BUTTON },
  { target: 'check', label: 'Check', box: CHECK_BUTTON },
  { target: 'call', label: 'Call', box: CALL_BUTTON },
  { target: 'bet', label: 'Bet', box: BET_BUTTON },
  { target: 'raise', label: 'Raise', box: RAISE_BUTTON },
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
  faceUp: boolean;
}

interface ButtonRecord {
  actor: ex.Actor;
  box: { x: number; y: number; w: number; h: number };
  target: string;
  face: ex.Rectangle;
  caption: ex.Actor;
}

function cardSprite(
  atlas: CardAtlas,
  cardId: string,
  faceUp: boolean,
): ex.Sprite {
  if (!faceUp) {
    return atlas.back();
  }
  const face = faceForPokerCard(cardId);
  if (!face) {
    return atlas.back();
  }
  return atlas.sprite(face);
}

function chipStack(amount: number): ChipDenomination[] {
  const stack: ChipDenomination[] = [];
  let left = amount;
  for (const value of CHIP_DENOMINATIONS) {
    while (left >= value && stack.length < CHIP_STACK_MAX) {
      stack.push(value);
      left -= value;
    }
  }
  return stack;
}

function actionEnabled(
  state: PokerState,
  seatIndex: number | null,
  target: string,
): boolean {
  if (seatIndex === null) {
    return false;
  }
  if (target === 'fold') {
    return pokerCanFold(state, seatIndex);
  }
  if (target === 'check') {
    return pokerCanCheck(state, seatIndex);
  }
  if (target === 'call') {
    return pokerCanCall(state, seatIndex);
  }
  if (target === 'bet') {
    return pokerBetTo(state, seatIndex) !== null;
  }
  if (target === 'raise') {
    return pokerRaiseTo(state, seatIndex) !== null;
  }
  return false;
}

/**
 * Poker table on the shared seat layout.
 * Your hole cards are face up, other hole cards are backs until showdown,
 * the board and pot sit in the center, and the action buttons sit at the bottom.
 */
export class PokerDriver implements GameDriver<PokerState> {
  readonly name = 'Poker';
  readonly gameType = POKER_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private chipActors: ex.Actor[] = [];
  private labels: ex.Actor[] = [];
  private buttons: ButtonRecord[] = [];
  private flashes: ex.Actor[] = [];
  private buttonsReady = false;
  private state: PokerState | null = null;
  private ctx: RenderContext | null = null;

  render(state: PokerState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (!this.buttonsReady) {
      this.addButtons(ctx);
      this.buttonsReady = true;
    }
    this.placeButtons(state, ctx);
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearCards();
      this.clearChips();
      return;
    }
    this.syncCards(state, ctx);
    this.syncPot(state, ctx);
  }

  handleInput(event: InputEvent, state: PokerState, ctx: RenderContext): void {
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
    if (ctx.meSeatIndex === null || state.turnSeatIndex !== ctx.meSeatIndex) {
      return;
    }
    const seatIndex = ctx.meSeatIndex;
    if (event.target === 'fold' && pokerCanFold(state, seatIndex)) {
      ctx.sendIntent({ type: 'fold' });
      return;
    }
    if (event.target === 'check' && pokerCanCheck(state, seatIndex)) {
      ctx.sendIntent({ type: 'check' });
      return;
    }
    if (event.target === 'call' && pokerCanCall(state, seatIndex)) {
      ctx.sendIntent({ type: 'call' });
      return;
    }
    if (event.target === 'bet') {
      const amount = pokerBetTo(state, seatIndex);
      if (amount !== null) {
        ctx.sendIntent({ type: 'bet', amount });
      }
      return;
    }
    if (event.target === 'raise') {
      const amount = pokerRaiseTo(state, seatIndex);
      if (amount !== null) {
        ctx.sendIntent({ type: 'raise', amount });
      }
      return;
    }
    if (state.step === 'discard' && pokerCanDiscard(state, seatIndex)) {
      const hole = state.seats[String(seatIndex)]?.hole ?? [];
      if (hole.includes(event.target)) {
        ctx.sendIntent({ type: 'discard', card: event.target });
      }
    }
  }

  /** The module said no. Flash the button that sent the intent. */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    if (typeof type !== 'string') {
      return;
    }
    const button = this.buttons.find((item) => item.target === type);
    if (!button) {
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
    this.clearCards();
    this.clearChips();
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

  private addButtons(ctx: RenderContext): void {
    for (const spec of ACTION_BUTTONS) {
      const face = panelRect(spec.box.w, spec.box.h, BUTTON, STROKE);
      const actor = new ex.Actor({
        pos: ex.vec(spec.box.x, spec.box.y),
        anchor: ex.vec(0, 0),
        width: spec.box.w,
        height: spec.box.h,
        z: 20,
      });
      actor.graphics.use(face);
      const caption = new ex.Actor({
        pos: ex.vec(8, 10),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(canvasText(spec.label, 8, GOLD));
      actor.addChild(caption);
      const target = spec.target;
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
        const current = this.state;
        const context = this.ctx;
        if (!current || !context) {
          return;
        }
        this.handleInput({ type: 'pointerup', target }, current, context);
      });
      ctx.scene.add(actor);
      this.buttons.push({ actor, box: spec.box, target, face, caption });
    }
  }

  private placeButtons(state: PokerState, ctx: RenderContext): void {
    const show = state.phase === 'play';
    for (const button of this.buttons) {
      button.actor.graphics.isVisible = show;
      const enabled =
        show && actionEnabled(state, ctx.meSeatIndex, button.target);
      button.actor.graphics.opacity = enabled ? 1 : DIMMED;
    }
  }

  private syncLabels(state: PokerState, ctx: RenderContext): void {
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    if (state.phase === 'lobby') {
      return;
    }
    const variation = POKER_VARIATION_LABELS[state.variation];
    this.labels.push(this.textActor(ctx, 16, 56, variation, GOLD));
    if (state.phase === 'finished') {
      const line = finishedLine(state, ctx.seats) ?? 'Finished';
      this.labels.push(this.textActor(ctx, 300, 248, line, GOLD));
    } else {
      const mine =
        ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
      let hint = mine ? 'Your turn' : 'Wait';
      if (mine && state.step === 'discard') {
        hint = 'Discard';
      } else if (
        mine &&
        ctx.meSeatIndex !== null &&
        pokerCanCall(state, ctx.meSeatIndex)
      ) {
        hint = `Call ${pokerCallAmount(state, ctx.meSeatIndex)}`;
      }
      this.labels.push(this.textActor(ctx, 612, 428, hint, GOLD));
    }
    this.labels.push(
      this.textActor(ctx, POT_X - 32, POT_Y - 28, `Pot ${state.pot}`, GOLD),
    );
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const marker = state.dealerSeatIndex === seat.seatIndex ? ' D' : '';
      const text = `${row.chips}${marker}`;
      this.labels.push(
        this.textActor(ctx, seat.x - 16, seat.y + 18, text, DIM),
      );
    }
  }

  private syncCards(state: PokerState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; faceUp: boolean; z: number }
    >();
    const board = boardPositions(state.board.length);
    for (let index = 0; index < state.board.length; index += 1) {
      const cardId = state.board[index];
      const slot = board[index];
      if (!cardId || !slot) {
        continue;
      }
      desired.set(cardId, { x: slot.x, y: slot.y, faceUp: true, z: 8 + index });
    }
    const reveal = state.phase === 'finished' && state.end === 'showdown';
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const slots = holePositions(seat.self, seat.x, seat.y, row.hole.length);
      for (let index = 0; index < row.hole.length; index += 1) {
        const cardId = row.hole[index];
        const slot = slots[index];
        if (!cardId || !slot) {
          continue;
        }
        desired.set(cardId, {
          x: slot.x,
          y: slot.y,
          faceUp: seat.self || reveal,
          z: (seat.self ? 14 : 6) + index,
        });
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
    place: { x: number; y: number; faceUp: boolean; z: number },
    ctx: RenderContext,
  ): void {
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_DRAW,
        height: CARD_DRAW,
        z: place.z,
      });
      actor.graphics.use(cardSprite(ctx.cards, cardId, place.faceUp));
      actor.on('pointerup', () => {
        const current = this.state;
        const context = this.ctx;
        if (!current || !context) {
          return;
        }
        this.handleInput(
          { type: 'pointerup', target: cardId },
          current,
          context,
        );
      });
      ctx.scene.add(actor);
      record = { actor, faceUp: place.faceUp };
      this.cards.set(cardId, record);
    }
    record.actor.z = place.z;
    record.actor.pos = ex.vec(place.x, place.y);
    if (record.faceUp !== place.faceUp) {
      record.faceUp = place.faceUp;
      record.actor.graphics.use(cardSprite(ctx.cards, cardId, place.faceUp));
    }
  }

  private syncPot(state: PokerState, ctx: RenderContext): void {
    this.clearChips();
    const stack = chipStack(state.pot);
    for (let index = 0; index < stack.length; index += 1) {
      const value = stack[index];
      if (value === undefined) {
        continue;
      }
      const sprite = chips.sprite(value);
      sprite.scale = ex.vec(CHIP_SCALE, CHIP_SCALE);
      const actor = new ex.Actor({
        pos: ex.vec(POT_X - 20 + index * 18, POT_Y - index * CHIP_STACK_STEP),
        anchor: ex.vec(0.5, 0.5),
        z: 4 + index,
      });
      actor.graphics.use(sprite);
      ctx.scene.add(actor);
      this.chipActors.push(actor);
    }
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
      z: 16,
    });
    actor.graphics.use(canvasText(text, 8, color));
    ctx.scene.add(actor);
    return actor;
  }

  private clearCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.cards.clear();
  }

  private clearChips(): void {
    for (const actor of this.chipActors) {
      actor.kill();
    }
    this.chipActors = [];
  }
}
