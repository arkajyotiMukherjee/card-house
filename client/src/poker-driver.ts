import { bindButtonPress } from './button-press';
import * as ex from 'excalibur';
import {
  POKER_GAME_TYPE,
  POKER_VARIATION_LABELS,
  pokerAdvanceKind,
  pokerBetRange,
  pokerBlindMark,
  pokerCallAmount,
  pokerCanCall,
  pokerCanCheck,
  pokerCanDiscard,
  pokerCanFold,
  pokerHoleFaceUp,
  pokerRaiseRange,
  type PokerStakeRange,
  type PokerState,
} from '../../src/shared/games/poker';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
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
import {
  HandHover,
  canInspectPointer,
  placeCardLift,
  startHandHoverClock,
} from './hand-hover';
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
  STAKE_AMOUNT,
  STAKE_CANCEL,
  STAKE_CONFIRM,
  STAKE_DOWN,
  STAKE_MAX,
  STAKE_UP,
  BANNER_Y,
  BOARD_SLOTS,
  COUNTDOWN_Y,
  POT_CHIP_SCALE,
  bannerX,
  nextHandCountdown,
  blindChipLine,
  boardFlip,
  boardPositions,
  droppedPositions,
  faceForPokerCard,
  finishedLine,
  holePositions,
  frontStakeControl,
  moveStake,
  seatNote,
  stakeStep,
  type StakeHitBox,
} from './poker-layout';
import {
  OPPONENT_FAN_CARD,
  TURN_LINE,
  fanGapLine,
  isGiveUpControl,
} from './table-presentation';

const LABEL_SIZE = FOLD_BUTTON.h >= 60 ? 12 : 8;

const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const FLASH_FILL = ex.Color.fromRGB(232, 60, 48, 0.8);
const FLASH_STROKE = ex.Color.fromHex('#ff3b2f');

const FLASH_ON_MS = 130;
const FLASH_OFF_MS = 80;
const FLASH_BLINKS = 3;
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
  label: string;
  rest: { x: number; y: number };
}

interface AmountRecord {
  actor: ex.Actor;
  value: ex.Actor;
  range: ex.Actor;
  valueText: string;
  rangeText: string;
}

function cardSprite(
  atlas: CardAtlas,
  cardId: string,
  faceUp: boolean,
  _fan: boolean,
): ex.Sprite {
  return faceSprite(atlas, cardId, faceUp);
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
    return pokerBetRange(state, seatIndex) !== null;
  }
  if (target === 'raise') {
    return pokerRaiseRange(state, seatIndex) !== null;
  }
  return false;
}

function stakeRange(
  state: PokerState,
  seatIndex: number,
  kind: 'bet' | 'raise',
): PokerStakeRange | null {
  if (kind === 'bet') {
    return pokerBetRange(state, seatIndex);
  }
  return pokerRaiseRange(state, seatIndex);
}

/**
 * Poker table on the shared seat layout.
 * Your hole cards are face up. Other hole cards stay down unless that seat
 * reached showdown. Five community cards sit face down and flip in place.
 * The pot sits in the center and the community cards sit below it.
 * A finished hand stays up for 10 seconds, with the winner line, the
 * showdown hole cards, and a countdown, then the next hand deals.
 */
export class PokerDriver implements GameDriver<PokerState> {
  readonly name = 'Poker';
  readonly gameType = POKER_GAME_TYPE;

  private cards = new Map<string, CardRecord>();
  private board: BoardSlot[] = [];
  private chipActors: ex.Actor[] = [];
  private labels: ex.Actor[] = [];
  private buttons: ButtonRecord[] = [];
  private stakeButtons: ButtonRecord[] = [];
  private amount: AmountRecord | null = null;
  private stake: { kind: 'bet' | 'raise'; amount: number } | null = null;
  private flashes: ex.Actor[] = [];
  private dropped: string[] = [];
  private droppedActors = new Map<string, ex.Actor>();
  private droppedLabel: ex.Actor | null = null;
  private lastHole: string[] = [];
  private hovered: string | null = null;
  private readonly handHover = new HandHover();
  private hoverClock: ex.Actor | null = null;
  private countdown: ex.Actor | null = null;
  private countdownText = '';
  /** Hand number the pause clock belongs to. `-1` while no hand is waiting. */
  private pauseHand = -1;
  private pauseElapsed = 0;
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
      this.addStakeControls(ctx);
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
      this.stake = null;
      return;
    }
    const seatIndex = ctx.meSeatIndex;
    if (this.stake) {
      this.handleStake(event.target, state, seatIndex, ctx);
      return;
    }
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
    if (event.target === 'bet' || event.target === 'raise') {
      const range = stakeRange(state, seatIndex, event.target);
      if (range) {
        this.stake = { kind: event.target, amount: range.min };
        this.placeButtons(state, ctx);
      }
      return;
    }
    if (pokerCanDiscard(state, seatIndex)) {
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
    for (const button of this.stakeButtons) {
      button.actor.kill();
    }
    this.stakeButtons = [];
    this.amount?.actor.kill();
    this.amount = null;
    this.countdown?.kill();
    this.countdown = null;
    this.countdownText = '';
    this.pauseHand = -1;
    this.pauseElapsed = 0;
    this.stake = null;
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

  private makeButton(
    ctx: RenderContext,
    spec: {
      target: string;
      label: string;
      box: { x: number; y: number; w: number; h: number };
    },
    giveUp: boolean,
  ): ButtonRecord {
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
    const size = buttonFontSize(spec.label, spec.box.w, spec.box.h);
    const rest = buttonCaptionPos(spec.label, spec.box.w, spec.box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(spec.label, size, GOLD));
    actor.addChild(caption);
    const record: ButtonRecord = {
      actor,
      box: spec.box,
      target: spec.target,
      face,
      caption,
      label: spec.label,
      rest,
    };
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = down;
        caption.pos = ex.vec(record.rest.x, record.rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.strokeColor = STROKE;
        face.color = fill;
        caption.pos = ex.vec(record.rest.x, record.rest.y);
      },
      (event) => {
        const current = this.state;
        const context = this.ctx;
        if (!current || !context) {
          return;
        }
        if (
          !this.ownsStakeClick(spec.target, event.worldPos.x, event.worldPos.y)
        ) {
          return;
        }
        this.handleInput(
          { type: 'pointerup', target: spec.target },
          current,
          context,
        );
      },
    );
    ctx.scene.add(actor);
    return record;
  }

  private setCaption(record: ButtonRecord, label: string): void {
    if (record.label === label) {
      return;
    }
    record.label = label;
    const size = buttonFontSize(label, record.box.w, record.box.h);
    record.rest = buttonCaptionPos(label, record.box.w, record.box.h, size);
    record.caption.graphics.use(canvasText(label, size, GOLD));
    record.caption.pos = ex.vec(record.rest.x, record.rest.y);
  }

  private showControl(
    record: ButtonRecord,
    show: boolean,
    enabled: boolean,
  ): void {
    record.actor.graphics.isVisible = show;
    record.caption.graphics.isVisible = show;
    record.actor.graphics.opacity = enabled ? 1 : DIMMED;
    if (show) {
      // The actor anchor is the top-left. Excalibur's default collider
      // anchor is the center, which lays this face over the button beside it.
      record.actor.collider.useBoxCollider(
        record.box.w,
        record.box.h,
        ex.vec(0, 0),
      );
    } else {
      record.actor.collider.clear();
    }
  }

  private addButtons(ctx: RenderContext): void {
    for (const spec of ACTION_BUTTONS) {
      this.buttons.push(
        this.makeButton(ctx, spec, isGiveUpControl(spec.label)),
      );
    }
  }

  private addStakeControls(ctx: RenderContext): void {
    const specs = [
      { target: 'stake-down', label: '-', box: STAKE_DOWN },
      { target: 'stake-up', label: '+', box: STAKE_UP },
      { target: 'stake-max', label: 'All-in', box: STAKE_MAX },
      { target: 'stake-confirm', label: 'Bet', box: STAKE_CONFIRM },
      { target: 'stake-cancel', label: 'Cancel', box: STAKE_CANCEL },
    ];
    for (const spec of specs) {
      const record = this.makeButton(ctx, spec, false);
      record.actor.z = 22;
      this.stakeButtons.push(record);
    }
    const value = new ex.Actor({
      pos: ex.vec(0, 2),
      anchor: ex.vec(0, 0),
    });
    const range = new ex.Actor({
      pos: ex.vec(0, 14),
      anchor: ex.vec(0, 0),
    });
    value.graphics.use(canvasText('0', BUTTON_FONT_SIZE, GOLD));
    range.graphics.use(canvasText('0 to 0', BUTTON_FONT_SIZE, DIM));
    const actor = new ex.Actor({
      pos: ex.vec(STAKE_AMOUNT.x, STAKE_AMOUNT.y),
      anchor: ex.vec(0, 0),
      width: STAKE_AMOUNT.w,
      height: STAKE_AMOUNT.h,
      z: 22,
    });
    const face = panelRect(STAKE_AMOUNT.w, STAKE_AMOUNT.h, BUTTON, STROKE);
    actor.graphics.use(face);
    actor.addChild(value);
    actor.addChild(range);
    actor.collider.clear();
    ctx.scene.add(actor);
    this.amount = { actor, value, range, valueText: '', rangeText: '' };
  }

  private handleStake(
    target: string,
    state: PokerState,
    seatIndex: number,
    ctx: RenderContext,
  ): void {
    const open = this.stake;
    if (!open) {
      return;
    }
    const range = stakeRange(state, seatIndex, open.kind);
    if (!range) {
      this.stake = null;
      this.placeButtons(state, ctx);
      return;
    }
    if (target === 'stake-cancel') {
      this.stake = null;
      this.placeButtons(state, ctx);
      return;
    }
    if (target === 'stake-down') {
      open.amount = moveStake(
        open.amount,
        -stakeStep(state, open.kind),
        range.min,
        range.max,
      );
      this.placeButtons(state, ctx);
      return;
    }
    if (target === 'stake-up') {
      open.amount = moveStake(
        open.amount,
        stakeStep(state, open.kind),
        range.min,
        range.max,
      );
      this.placeButtons(state, ctx);
      return;
    }
    if (target === 'stake-max') {
      open.amount = range.max;
      this.placeButtons(state, ctx);
      return;
    }
    if (target === 'stake-confirm') {
      const amount = moveStake(open.amount, 0, range.min, range.max);
      const kind = open.kind;
      this.stake = null;
      this.placeButtons(state, ctx);
      ctx.sendIntent({ type: kind, amount });
    }
  }

  private placeButtons(state: PokerState, ctx: RenderContext): void {
    this.syncStake(state, ctx);
    const staking = this.stake !== null && state.phase === 'play';
    const showActions = state.phase === 'play' && !staking;
    for (const button of this.buttons) {
      this.showControl(
        button,
        showActions,
        showActions && actionEnabled(state, ctx.meSeatIndex, button.target),
      );
    }
    const seat = ctx.meSeatIndex;
    const range =
      staking && this.stake && seat !== null
        ? stakeRange(state, seat, this.stake.kind)
        : null;
    for (const button of this.stakeButtons) {
      const label = this.stakeCaption(button.target, state, range);
      this.setCaption(button, label);
      const enabled = this.stakeEnabled(button.target, range);
      this.showControl(button, staking, enabled);
    }
    this.placeAmount(staking, range);
  }

  private syncStake(state: PokerState, ctx: RenderContext): void {
    if (!this.stake) {
      return;
    }
    const seat = ctx.meSeatIndex;
    if (
      seat === null ||
      state.phase !== 'play' ||
      state.turnSeatIndex !== seat
    ) {
      this.stake = null;
      return;
    }
    const range = stakeRange(state, seat, this.stake.kind);
    if (!range) {
      this.stake = null;
      return;
    }
    this.stake.amount = moveStake(this.stake.amount, 0, range.min, range.max);
  }

  private stakeCaption(
    target: string,
    state: PokerState,
    range: PokerStakeRange | null,
  ): string {
    const kind = this.stake?.kind ?? 'bet';
    const step = stakeStep(state, kind);
    if (target === 'stake-down') {
      return `-${step}`;
    }
    if (target === 'stake-up') {
      return `+${step}`;
    }
    if (target === 'stake-max') {
      return 'All-in';
    }
    if (target === 'stake-confirm') {
      return kind === 'raise' ? 'Raise' : 'Bet';
    }
    if (target === 'stake-cancel') {
      return 'Cancel';
    }
    if (range) {
      return String(range.min);
    }
    return '';
  }

  /**
   * True when this pointer should run `target`.
   * A point on a stake face runs only that face. A point in the touch
   * margin, off every face, keeps the actor Excalibur already hit.
   */
  private ownsStakeClick(target: string, x: number, y: number): boolean {
    if (!target.startsWith('stake-')) {
      return true;
    }
    const boxes: StakeHitBox[] = [];
    for (const button of this.stakeButtons) {
      boxes.push({
        id: button.target,
        x: button.box.x,
        y: button.box.y,
        w: button.box.w,
        h: button.box.h,
      });
    }
    const front = frontStakeControl(boxes, { x, y });
    return front === null || front === target;
  }

  private stakeEnabled(target: string, range: PokerStakeRange | null): boolean {
    if (!this.stake || !range) {
      return false;
    }
    if (target === 'stake-down') {
      return this.stake.amount > range.min;
    }
    if (target === 'stake-up' || target === 'stake-max') {
      return this.stake.amount < range.max;
    }
    return true;
  }

  private placeAmount(show: boolean, range: PokerStakeRange | null): void {
    const box = this.amount;
    if (!box) {
      return;
    }
    box.actor.graphics.isVisible = show;
    box.value.graphics.isVisible = show;
    box.range.graphics.isVisible = show;
    if (!show || !this.stake || !range) {
      return;
    }
    const valueText = String(this.stake.amount);
    const touch = STAKE_AMOUNT.h >= 60;
    const rangeText = touch
      ? `${range.min}–${range.max}`
      : `${range.min} to ${range.max}`;
    if (box.valueText !== valueText) {
      box.valueText = valueText;
      const size = buttonFontSize(valueText, STAKE_AMOUNT.w, STAKE_AMOUNT.h);
      box.value.graphics.use(canvasText(valueText, size, GOLD));
      const pos = buttonCaptionPos(
        valueText,
        STAKE_AMOUNT.w,
        STAKE_AMOUNT.h,
        size,
      );
      box.value.pos = ex.vec(pos.x, touch ? 8 : 1);
    }
    if (box.rangeText !== rangeText) {
      box.rangeText = rangeText;
      const size = buttonFontSize(rangeText, STAKE_AMOUNT.w, STAKE_AMOUNT.h);
      box.range.graphics.use(canvasText(rangeText, size, DIM));
      const pos = buttonCaptionPos(
        rangeText,
        STAKE_AMOUNT.w,
        STAKE_AMOUNT.h,
        size,
      );
      box.range.pos = ex.vec(pos.x, touch ? 36 : 14);
    }
  }

  private syncLabels(state: PokerState, ctx: RenderContext): void {
    for (const actor of this.labels) {
      actor.kill();
    }
    this.labels = [];
    if (state.phase === 'lobby') {
      this.clearCountdown();
      return;
    }
    const variation = POKER_VARIATION_LABELS[state.variation];
    this.labels.push(this.textActor(ctx, 16, 56, variation, GOLD));
    if (state.phase === 'finished') {
      const line = finishedLine(state, ctx.seats) ?? 'Hand over';
      this.labels.push(
        this.textActor(ctx, bannerX(line, LABEL_SIZE), BANNER_Y, line, GOLD),
      );
      this.syncCountdown(state, ctx);
    } else {
      this.clearCountdown();
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
    const potLabel = `Pot ${state.pot}`;
    this.labels.push(
      this.textActor(
        ctx,
        POT_X - 72 - potLabel.length * LABEL_SIZE,
        POT_Y - LABEL_SIZE / 2,
        potLabel,
        GOLD,
      ),
    );
    for (const seat of ctx.seats) {
      const row = state.seats[String(seat.seatIndex)];
      if (!row) {
        continue;
      }
      const blind = pokerBlindMark(state, seat.seatIndex);
      const dealer =
        state.dealerSeatIndex === seat.seatIndex && blind === null ? ' D' : '';
      const chips = `${row.chips}${dealer}`;
      const note = seatNote(state, seat.seatIndex);
      const line = blindChipLine(
        seat.self,
        seat.x,
        seat.y,
        seat.name,
        chips,
        blind,
        LABEL_SIZE,
      );
      if (blind && line.mark) {
        const blindLabel = this.textActor(
          ctx,
          line.mark.x,
          line.mark.y,
          blind,
          GOLD,
        );
        if (!seat.self) {
          blindLabel.z = 80;
        }
        this.labels.push(blindLabel);
      }
      const chipLabel = this.textActor(
        ctx,
        line.chips.x,
        line.chips.y,
        chips,
        DIM,
      );
      if (!seat.self) {
        chipLabel.z = 80;
      }
      this.labels.push(chipLabel);
      if (note) {
        const noteAt = seat.self
          ? { x: line.chips.x, y: line.chips.y + LABEL_SIZE + 4 }
          : fanGapLine(seat.x, seat.y, seat.name, note, 1, LABEL_SIZE);
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
        scale: number;
      }
    >();
    this.syncBoard(state, ctx);
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
        desired.set(cardId, {
          x: slot.x,
          y: slot.y,
          faceUp: seat.self || pokerHoleFaceUp(state, seat.seatIndex),
          z: (seat.self ? 14 : 6) + index,
          opacity: row.folded ? FOLDED_CARD : 1,
          personal: seat.self,
          rotation: slot.rotation,
          fan: !seat.self,
          scale: slot.scale,
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
    if (this.hovered !== null && !this.canInspectHole(this.hovered)) {
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
      scale: number;
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
        if (!canInspectPointer(event, ctx.scene.engine.input.pointers)) return;
        this.followHole(cardId, event.worldPos.x, true);
      });
      actor.on('pointermove', (event) => {
        if (!canInspectPointer(event, ctx.scene.engine.input.pointers)) return;
        this.handHover.touch.move(event);
        this.followHole(cardId, event.worldPos.x, false);
      });
      actor.on('pointerdown', (event) => {
        this.handHover.touch.start(event);
        this.followHole(cardId, event.worldPos.x, true);
      });
      actor.on('pointercancel', () => {
        this.handHover.touch.cancel();
        this.handHover.release();
      });
      actor.on('pointerleave', () => {
        this.handHover.leave(cardId);
        if (this.hovered !== cardId) {
          return;
        }
        this.hovered = null;
      });
      actor.on('pointerup', (event) => {
        if (event.pointerType === ex.PointerType.Touch) {
          this.handHover.release();
          if (!this.handHover.touch.isTap(event)) return;
        }
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
    record.actor.scale = ex.vec(place.scale, place.scale);
    record.actor.rotation = place.rotation;
    const lift = this.canInspectHole(cardId)
      ? this.handHover.current(cardId)
      : 0;
    placeCardLift(
      record.actor,
      place.x,
      place.y,
      place.z,
      lift,
      false,
      place.personal,
    );
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
    const lift = this.canInspectHole(cardId)
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

  private canInspectHole(cardId: string): boolean {
    const ctx = this.ctx;
    return (
      !!ctx &&
      !ctx.inputBlocked() &&
      ctx.meSeatIndex !== null &&
      this.state?.seats[String(ctx.meSeatIndex)]?.hole.includes(cardId) === true
    );
  }

  private followHole(cardId: string, pointerX: number, entered: boolean): void {
    if (!this.canInspectHole(cardId)) {
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

  /**
   * The finished hand stays up for the pause. The winner line is drawn
   * with the other labels, and this clock counts the seconds until the deal.
   */
  private syncCountdown(state: PokerState, ctx: RenderContext): void {
    const seats = ctx.seats.map((seat) => seat.seatIndex);
    if (pokerAdvanceKind(state, seats) !== 'hand') {
      this.clearCountdown();
      return;
    }
    if (this.pauseHand !== state.handNumber) {
      this.pauseHand = state.handNumber;
      this.pauseElapsed = 0;
    }
    const line = nextHandCountdown(this.pauseElapsed) ?? 'Next hand in 1';
    this.paintCountdown(ctx, line);
  }

  private tickPause(elapsedMs: number): void {
    const state = this.state;
    const ctx = this.ctx;
    if (this.pauseHand < 0 || !state || !ctx || state.phase !== 'finished') {
      return;
    }
    this.pauseElapsed += elapsedMs;
    const line = nextHandCountdown(this.pauseElapsed);
    this.paintCountdown(ctx, line ?? 'Next hand in 1');
  }

  private paintCountdown(ctx: RenderContext, text: string): void {
    if (text.length === 0) {
      this.clearCountdown();
      return;
    }
    if (text === this.countdownText && this.countdown) {
      return;
    }
    this.countdownText = text;
    if (!this.countdown) {
      this.countdown = this.textActor(
        ctx,
        bannerX(text, LABEL_SIZE),
        COUNTDOWN_Y,
        text,
        GOLD,
      );
      return;
    }
    this.countdown.graphics.isVisible = true;
    this.countdown.pos = ex.vec(bannerX(text, LABEL_SIZE), COUNTDOWN_Y);
    this.countdown.graphics.use(canvasText(text, LABEL_SIZE, GOLD));
  }

  private clearCountdown(): void {
    this.pauseHand = -1;
    this.pauseElapsed = 0;
    this.countdownText = '';
    if (this.countdown) {
      this.countdown.graphics.isVisible = false;
    }
  }

  private ensureHoverClock(ctx: RenderContext): void {
    if (this.hoverClock) {
      return;
    }
    this.hoverClock = startHandHoverClock(ctx.scene, (elapsedMs) => {
      this.easeHand(elapsedMs);
      this.easeBoard(elapsedMs);
      this.tickPause(elapsedMs);
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
      if (!cardId || !slot) {
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
      const lift = this.canInspectHole(cardId)
        ? this.handHover.current(cardId)
        : 0;
      placeCardLift(
        record.actor,
        record.home.x,
        record.home.y,
        record.restZ,
        lift,
        false,
        record.personal,
      );
    }
    this.refreshDropMarks(ctx);
  }

  /** A red outline and "Drop" tag on the hole card the click would discard. */
  private refreshDropMarks(ctx: RenderContext): void {
    const cardId = this.hovered;
    const state = this.state;
    const seatIndex = ctx.meSeatIndex;
    const record =
      cardId !== null &&
      state &&
      seatIndex !== null &&
      pokerCanDiscard(state, seatIndex) &&
      this.canInspectHole(cardId)
        ? this.cards.get(cardId)
        : undefined;
    const x = record?.home.x ?? 0;
    const y =
      record && cardId !== null ? this.liftedY(cardId, record.home.y) : 0;
    const key = record ? `${cardId}:${x}:${y}` : '';
    if (key === this.dropMarkKey) return;
    this.dropMarkKey = key;
    for (const actor of this.dropMarks) {
      actor.kill();
    }
    this.dropMarks = [];
    if (!record) return;

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
      sprite.scale = ex.vec(POT_CHIP_SCALE, POT_CHIP_SCALE);
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
    actor.graphics.use(canvasText(text, LABEL_SIZE, color));
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
        slot.actor.graphics.use(
          cardSprite(ctx.cards, slot.cardId, true, false),
        );
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
