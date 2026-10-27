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
  pokerHoleFaceUp,
  pokerRaiseTo,
  type PokerState,
} from '../../src/shared/games/poker';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { chipsImage } from './boot-scene';
import {
  BUTTON as GIVE_UP,
  BUTTON_DOWN as GIVE_UP_DOWN,
  DIM,
  GOLD,
  STROKE,
  STROKE_HOT,
  canvasText,
  panelRect,
} from './canvas-ui';
import {
  isFrontHandCard,
  localHandHitBoxes,
  type CardHitBox,
} from './card-hit';
import { HandHover, placeCardLift, startHandHoverClock } from './hand-hover';
import type { CardAtlas } from './card-atlas';
import { ChipAtlas, type ChipDenomination } from './chip-atlas';
import type { GameDriver, InputEvent, RenderContext } from './game-driver';
import {
  BET_BUTTON,
  CALL_BUTTON,
  CARD_DRAW,
  CHECK_BUTTON,
  DISCARD_PROMPT,
  DROPPED_LABEL,
  DROPPED_SCALE,
  FOLD_BUTTON,
  POT_X,
  POT_Y,
  RAISE_BUTTON,
  BANNER_Y,
  BOARD_SLOTS,
  bannerX,
  boardFlip,
  boardPositions,
  droppedPositions,
  faceForPokerCard,
  finishedLine,
  holePositions,
  seatNote,
} from './poker-layout';
import {
  OPPONENT_FAN_CARD,
  OPPONENT_FAN_SCALE,
  TURN_LINE,
  fanGapLine,
  isGiveUpControl,
  seatPlateWidth,
} from './table-presentation';

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
const FOLDED_CARD = 0.4;
const DROPPED_CARD = 0.55;
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

interface BoardSlot {
  actor: ex.Actor;
  cardId: string | null;
  faceUp: boolean;
  /** Elapsed flip time. Null when the card is resting. */
  flipMs: number | null;
  showingFace: boolean;
}

interface CardRecord {
  actor: ex.Actor;
  faceUp: boolean;
  /** True for a card in the local player's own hole cards. */
  personal: boolean;
  /** Opponent hole cards stay on the rail fan, even at showdown. */
  fan: boolean;
  home: { x: number; y: number };
  restZ: number;
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
  fan: boolean,
): ex.Sprite {
  const sprite = faceSprite(atlas, cardId, faceUp);
  if (fan) {
    sprite.scale = ex.vec(OPPONENT_FAN_SCALE, OPPONENT_FAN_SCALE);
  }
  return sprite;
}

function faceSprite(
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
 * Your hole cards are face up. Other hole cards stay down unless that seat
 * reached showdown. Five community cards sit face down and flip in place.
 * The board and pot sit in the center, and the action buttons sit at the bottom.
 */
export class PokerDriver implements GameDriver<PokerState> {
  readonly name = 'Poker';
  readonly gameType = POKER_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private board: BoardSlot[] = [];
  private chipActors: ex.Actor[] = [];
  private labels: ex.Actor[] = [];
  private buttons: ButtonRecord[] = [];
  private flashes: ex.Actor[] = [];
  private dropped: string[] = [];
  private droppedActors = new Map<string, ex.Actor>();
  private droppedLabel: ex.Actor | null = null;
  private lastHole: string[] = [];
  private droppable = new Set<string>();
  private hovered: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private dropMarkKey = '';
  private dropMarks: ex.Actor[] = [];
  private buttonsReady = false;
  private state: PokerState | null = null;
  private ctx: RenderContext | null = null;

  render(state: PokerState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    if (!this.buttonsReady) {
      this.addButtons(ctx);
      this.buttonsReady = true;
    }
    this.placeButtons(state, ctx);
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearCards();
      this.clearDropped();
      this.clearChips();
      return;
    }
    this.syncCards(state, ctx);
    this.syncDropped(ctx);
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
    this.clearDropped();
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
    this.stopHoverClock();
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
      const giveUp = isGiveUpControl(spec.label);
      const fill = giveUp ? GIVE_UP : BUTTON;
      const down = giveUp ? GIVE_UP_DOWN : BUTTON_DOWN;
      const face = panelRect(spec.box.w, spec.box.h, fill, STROKE);
      const actor = new ex.Actor({
        pos: ex.vec(spec.box.x, spec.box.y),
        anchor: ex.vec(0, 0),
        width: spec.box.w,
        height: spec.box.h,
        z: 20,
      });
      actor.graphics.use(face);
      const rest = buttonCaptionPos(spec.label, spec.box.w, spec.box.h);
      const caption = new ex.Actor({
        pos: ex.vec(rest.x, rest.y),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(canvasText(spec.label, BUTTON_FONT_SIZE, GOLD));
      actor.addChild(caption);
      const target = spec.target;
      actor.on('pointerenter', () => {
        face.strokeColor = STROKE_HOT;
      });
      actor.on('pointerleave', () => {
        face.strokeColor = STROKE;
        face.color = fill;
        caption.pos = ex.vec(rest.x, rest.y);
      });
      actor.on('pointerdown', () => {
        face.color = down;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      });
      actor.on('pointerup', () => {
        face.color = fill;
        caption.pos = ex.vec(rest.x, rest.y);
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
      const line = finishedLine(state, ctx.seats) ?? 'Hand over';
      this.labels.push(
        this.textActor(ctx, bannerX(line), BANNER_Y, line, GOLD),
      );
    } else {
      const mine =
        ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
      let hint = mine ? 'Your turn' : 'Wait';
      if (mine && state.step === 'discard') {
        hint = 'Drop one';
        this.labels.push(
          this.textActor(
            ctx,
            DISCARD_PROMPT.x,
            DISCARD_PROMPT.y,
            'Click a card to drop it',
            FLASH_STROKE,
          ),
        );
      } else if (
        mine &&
        ctx.meSeatIndex !== null &&
        pokerCanCall(state, ctx.meSeatIndex)
      ) {
        hint = `Call ${pokerCallAmount(state, ctx.meSeatIndex)}`;
      }
      this.labels.push(
        this.textActor(ctx, TURN_LINE.x, TURN_LINE.y, hint, GOLD),
      );
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
      const chips = `${row.chips}${marker}`;
      const note = seatNote(state, seat.seatIndex);
      const origin = seat.self
        ? {
            x: seat.x + seatPlateWidth(seat.name) / 2 + 6,
            y: seat.y + 6,
          }
        : fanGapLine(seat.x, seat.y, seat.name, chips, 0);
      const chipLabel = this.textActor(ctx, origin.x, origin.y, chips, DIM);
      if (!seat.self) {
        chipLabel.z = 80;
      }
      this.labels.push(chipLabel);
      if (note) {
        const noteAt = seat.self
          ? { x: origin.x, y: origin.y + 12 }
          : fanGapLine(seat.x, seat.y, seat.name, note, 1);
        const noteLabel = this.textActor(ctx, noteAt.x, noteAt.y, note, GOLD);
        if (!seat.self) {
          noteLabel.z = 80;
        }
        this.labels.push(noteLabel);
      }
    }
  }

  private syncCards(state: PokerState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      {
        x: number;
        y: number;
        faceUp: boolean;
        z: number;
        opacity: number;
        personal: boolean;
        rotation: number;
        fan: boolean;
      }
    >();
    this.syncBoard(state, ctx);
    const mine =
      ctx.meSeatIndex !== null && state.turnSeatIndex === ctx.meSeatIndex;
    const canDrop =
      mine &&
      state.phase === 'play' &&
      state.step === 'discard' &&
      ctx.meSeatIndex !== null &&
      pokerCanDiscard(state, ctx.meSeatIndex);
    this.droppable = new Set();
    this.trackDrops(state, ctx);
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const slots = holePositions(
        seat.self,
        seat.x,
        seat.y,
        row.hole.length,
        seat.name,
      );
      for (let index = 0; index < row.hole.length; index += 1) {
        const cardId = row.hole[index];
        const slot = slots[index];
        if (!cardId || !slot) {
          continue;
        }
        const droppable = canDrop && seat.self;
        if (droppable) {
          this.droppable.add(cardId);
        }
        desired.set(cardId, {
          x: slot.x,
          y: slot.y,
          faceUp: seat.self || pokerHoleFaceUp(state, seat.seatIndex),
          z: (seat.self ? 14 : 6) + index,
          opacity: row.folded ? FOLDED_CARD : 1,
          personal: seat.self,
          rotation: slot.rotation,
          fan: !seat.self,
        });
      }
    }
    for (const [cardId, record] of this.cards) {
      if (desired.has(cardId)) {
        continue;
      }
      this.cards.delete(cardId);
      if (this.dropped.includes(cardId)) {
        this.droppedActors.set(cardId, record.actor);
      } else {
        record.actor.kill();
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx);
    }
    if (this.hovered !== null && !this.droppable.has(this.hovered)) {
      this.hovered = null;
    }
    this.refreshDropMarks(ctx);
  }

  /** The module removes a dropped card from state, so remember your own drops. */
  private trackDrops(state: PokerState, ctx: RenderContext): void {
    if (state.board.length === 0) {
      this.dropped = [];
      this.lastHole = [];
      return;
    }
    const row =
      ctx.meSeatIndex === null
        ? undefined
        : state.seats[String(ctx.meSeatIndex)];
    if (!row || state.variation !== 'oklahoma') {
      return;
    }
    if (this.lastHole.length > row.hole.length) {
      for (const cardId of this.lastHole) {
        if (!row.hole.includes(cardId) && !this.dropped.includes(cardId)) {
          this.dropped.push(cardId);
        }
      }
    }
    this.lastHole = [...row.hole];
  }

  private syncDropped(ctx: RenderContext): void {
    for (const [cardId, actor] of this.droppedActors) {
      if (!this.dropped.includes(cardId)) {
        actor.kill();
        this.droppedActors.delete(cardId);
      }
    }
    const slots = droppedPositions(this.dropped.length);
    for (let index = 0; index < this.dropped.length; index += 1) {
      const cardId = this.dropped[index];
      const slot = slots[index];
      const actor = cardId ? this.droppedActors.get(cardId) : undefined;
      if (!cardId || !slot || !actor) {
        continue;
      }
      actor.pos = ex.vec(slot.x, slot.y);
      actor.scale = ex.vec(DROPPED_SCALE, DROPPED_SCALE);
      actor.graphics.opacity = DROPPED_CARD;
      actor.z = 14 + index;
    }
    const show = this.droppedActors.size > 0;
    if (show && !this.droppedLabel) {
      const label = new ex.Actor({
        pos: ex.vec(DROPPED_LABEL.x, DROPPED_LABEL.y),
        anchor: ex.vec(0, 0),
        z: 16,
      });
      label.graphics.use(canvasText('Dropped', 8, DIM));
      ctx.scene.add(label);
      this.droppedLabel = label;
    } else if (!show && this.droppedLabel) {
      this.droppedLabel.kill();
      this.droppedLabel = null;
    }
  }

  private placeCard(
    cardId: string,
    place: {
      x: number;
      y: number;
      faceUp: boolean;
      z: number;
      opacity: number;
      personal: boolean;
      rotation: number;
      fan: boolean;
    },
    ctx: RenderContext,
  ): void {
    const atlas = place.personal ? ctx.myCards : ctx.cards;
    const size = place.fan ? OPPONENT_FAN_CARD : CARD_DRAW;
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0.5, 0.5),
        width: size,
        height: size,
        rotation: place.rotation,
        z: place.z,
      });
      actor.pointer.useGraphicsBounds = false;
      actor.graphics.use(cardSprite(atlas, cardId, place.faceUp, place.fan));
      actor.on('pointerenter', (event) => {
        this.followHole(cardId, event.worldPos.x, true);
      });
      actor.on('pointermove', (event) => {
        this.followHole(cardId, event.worldPos.x, false);
      });
      actor.on('pointerleave', () => {
        this.handHover.leave(cardId);
        if (this.hovered !== cardId) {
          return;
        }
        this.hovered = null;
      });
      actor.on('pointerup', (event) => {
        const current = this.state;
        const context = this.ctx;
        if (!current || !context) {
          return;
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
        this.handleInput(
          { type: 'pointerup', target: cardId },
          current,
          context,
        );
      });
      ctx.scene.add(actor);
      record = {
        actor,
        faceUp: place.faceUp,
        personal: place.personal,
        fan: place.fan,
        home: place,
        restZ: place.z,
      };
      this.cards.set(cardId, record);
    }
    record.home = { x: place.x, y: place.y };
    record.restZ = place.z;
    record.actor.graphics.opacity = place.opacity;
    record.actor.scale = ex.vec(1, 1);
    record.actor.rotation = place.rotation;
    const lift = this.droppable.has(cardId)
      ? this.handHover.current(cardId)
      : 0;
    placeCardLift(record.actor, place.x, place.y, place.z, lift);
    if (
      record.faceUp !== place.faceUp ||
      record.personal !== place.personal ||
      record.fan !== place.fan
    ) {
      record.faceUp = place.faceUp;
      record.personal = place.personal;
      record.fan = place.fan;
      record.actor.graphics.use(
        cardSprite(atlas, cardId, place.faceUp, place.fan),
      );
    }
  }

  private liftedY(cardId: string, y: number): number {
    const lift = this.droppable.has(cardId)
      ? this.handHover.current(cardId)
      : 0;
    return y - Math.round(lift);
  }

  private handBoxes(): CardHitBox[] {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx || ctx.meSeatIndex === null) {
      return [];
    }
    const hole = state.seats[String(ctx.meSeatIndex)]?.hole ?? [];
    return localHandHitBoxes(hole, this.cards, CARD_DRAW);
  }

  private followHole(cardId: string, pointerX: number, entered: boolean): void {
    if (!this.droppable.has(cardId)) {
      this.handHover.leave(cardId);
      return;
    }
    if (entered) {
      this.hovered = cardId;
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
      this.easeBoard(elapsedMs);
    });
  }

  private stopHoverClock(): void {
    this.hoverClock?.kill();
    this.hoverClock = null;
    this.handHover.clear();
    this.dropMarkKey = '';
  }

  private easeHand(elapsedMs: number): void {
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx || ctx.meSeatIndex === null) {
      return;
    }
    const hole = state.seats[String(ctx.meSeatIndex)]?.hole ?? [];
    const slots = holePositions(true, 0, 0, hole.length);
    const ids: string[] = [];
    const centers: number[] = [];
    for (let index = 0; index < hole.length; index += 1) {
      const cardId = hole[index];
      const slot = slots[index];
      if (!cardId || !slot || !this.droppable.has(cardId)) {
        continue;
      }
      ids.push(cardId);
      centers.push(slot.x);
    }
    this.handHover.step(ids, centers, elapsedMs);
    for (let index = 0; index < hole.length; index += 1) {
      const cardId = hole[index];
      const record = cardId ? this.cards.get(cardId) : undefined;
      if (!cardId || !record) {
        continue;
      }
      const lift = this.droppable.has(cardId)
        ? this.handHover.current(cardId)
        : 0;
      placeCardLift(
        record.actor,
        record.home.x,
        record.home.y,
        record.restZ,
        lift,
      );
    }
    const pixels = this.hovered
      ? Math.round(this.handHover.current(this.hovered))
      : 0;
    const key = `${this.hovered ?? ''}:${pixels}`;
    if (key === this.dropMarkKey) {
      return;
    }
    this.dropMarkKey = key;
    this.refreshDropMarks(ctx);
  }

  /** A red outline and "Drop" tag on the hole card the click would discard. */
  private refreshDropMarks(ctx: RenderContext): void {
    for (const actor of this.dropMarks) {
      actor.kill();
    }
    this.dropMarks = [];
    const record = this.hovered ? this.cards.get(this.hovered) : undefined;
    if (!record) {
      return;
    }
    const x = record.home.x;
    const y = this.liftedY(this.hovered ?? '', record.home.y);
    const outline = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0.5, 0.5),
      z: 30,
    });
    const frame = new ex.Rectangle({
      width: CARD_DRAW,
      height: CARD_DRAW,
      color: ex.Color.Transparent,
      strokeColor: FLASH_STROKE,
      lineWidth: 3,
      smoothing: false,
    });
    outline.graphics.use(frame);
    outline.pointer.useColliderShape = false;
    outline.pointer.useGraphicsBounds = false;
    const tag = new ex.Actor({
      pos: ex.vec(x - 16, y - CARD_DRAW / 2 - 14),
      anchor: ex.vec(0, 0),
      z: 30,
    });
    tag.graphics.use(canvasText('Drop', 8, FLASH_STROKE));
    tag.pointer.useColliderShape = false;
    tag.pointer.useGraphicsBounds = false;
    ctx.scene.add(outline);
    ctx.scene.add(tag);
    this.dropMarks.push(outline, tag);
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

  /** Five backs stay in the flop, turn, and river slots, then flip in place. */
  private syncBoard(state: PokerState, ctx: RenderContext): void {
    const slots = boardPositions(BOARD_SLOTS);
    for (let index = 0; index < slots.length; index += 1) {
      const place = slots[index];
      const cardId = state.board[index] ?? null;
      if (!place) {
        continue;
      }
      let slot = this.board[index];
      if (!slot) {
        const actor = new ex.Actor({
          pos: ex.vec(place.x, place.y),
          anchor: ex.vec(0.5, 0.5),
          width: CARD_DRAW,
          height: CARD_DRAW,
          z: 8 + index,
        });
        const faceUp = cardId !== null;
        actor.graphics.use(cardSprite(ctx.cards, cardId ?? '', faceUp, false));
        ctx.scene.add(actor);
        slot = {
          actor,
          cardId,
          faceUp,
          flipMs: null,
          showingFace: faceUp,
        };
        this.board[index] = slot;
        continue;
      }
      slot.actor.pos = ex.vec(place.x, place.y);
      slot.actor.z = 8 + index;
      if (cardId === null) {
        slot.flipMs = null;
        slot.faceUp = false;
        slot.cardId = null;
        slot.showingFace = false;
        slot.actor.scale = ex.vec(1, 1);
        slot.actor.graphics.use(ctx.cards.back());
        continue;
      }
      if (slot.cardId === cardId) {
        continue;
      }
      if (slot.faceUp || slot.showingFace) {
        slot.cardId = cardId;
        slot.faceUp = true;
        slot.showingFace = true;
        slot.flipMs = null;
        slot.actor.scale = ex.vec(1, 1);
        slot.actor.graphics.use(cardSprite(ctx.cards, cardId, true, false));
        continue;
      }
      slot.cardId = cardId;
      slot.flipMs = 0;
      slot.faceUp = false;
      slot.showingFace = false;
      slot.actor.scale = ex.vec(1, 1);
      slot.actor.graphics.use(ctx.cards.back());
    }
  }

  private easeBoard(elapsedMs: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    for (const slot of this.board) {
      if (!slot || slot.flipMs === null || slot.cardId === null) {
        continue;
      }
      slot.flipMs += elapsedMs;
      const frame = boardFlip(slot.flipMs);
      if (frame.face && !slot.showingFace) {
        slot.actor.graphics.use(cardSprite(ctx.cards, slot.cardId, true, false));
        slot.showingFace = true;
      }
      slot.actor.scale = ex.vec(frame.scaleX, 1);
      if (frame.done) {
        slot.flipMs = null;
        slot.faceUp = true;
        slot.actor.scale = ex.vec(1, 1);
      }
    }
  }

  private clearCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.cards.clear();
    for (const slot of this.board) {
      slot?.actor.kill();
    }
    this.board = [];
    this.hovered = null;
    this.droppable = new Set();
    this.handHover.clear();
    this.dropMarkKey = '';
    for (const actor of this.dropMarks) {
      actor.kill();
    }
    this.dropMarks = [];
  }

  private clearDropped(): void {
    for (const actor of this.droppedActors.values()) {
      actor.kill();
    }
    this.droppedActors.clear();
    this.dropped = [];
    this.lastHole = [];
    this.droppedLabel?.kill();
    this.droppedLabel = null;
  }

  private clearChips(): void {
    for (const actor of this.chipActors) {
      actor.kill();
    }
    this.chipActors = [];
  }
}
