import * as ex from 'excalibur';
import {
  BLUFF_GAME_TYPE,
  BLUFF_RANKS,
  isJoker,
  type BluffRank,
  type BluffState,
} from '../../src/shared/games/bluff';
import {
  BLUFF_CHALLENGE_BUTTON,
  BLUFF_PASS_BUTTON,
  BLUFF_PLAY_BUTTON,
  BLUFF_TURN_LABEL,
  CARD_DRAW,
  HOVER_LIFT,
  PILE_NOTICE_Y,
  PILE_X,
  PILE_Y,
  PROMPT_Y,
  canChallenge,
  canPass,
  canPlay,
  cardLift,
  faceForCard,
  finishedLine,
  handPositions,
  leadRankHint,
  legalCard,
  pileFaceUp,
  pileNotice,
  pilePositions,
  rankButtonColors,
  rankCallButtons,
  rankHintPos,
  selectedPlayCards,
  showRankPicker,
  tablePrompt,
  turnLine,
} from './bluff-layout';
import {
  OPPONENT_FAN_CARD,
  OPPONENT_FAN_SCALE,
  opponentCountAnchor,
  seatFan,
} from './table-presentation';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
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
  CHALLENGE_MOVE_MS,
  challengeFrame,
  challengePickup,
  pileAnchors,
  type PileAnchor,
} from './bluff-challenge';
import { HandHover, placeCardLift, startHandHoverClock } from './hand-hover';
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
  if (isJoker(cardId)) {
    return atlas.joker(cardId === 'JR' ? 'red' : 'black');
  }
  const face = faceForCard(cardId);
  if (!face) {
    return atlas.back();
  }
  return atlas.sprite(face);
}

/**
 * Bluff table: your hand along the bottom, other hands as backs,
 * and the discard pile in the center. A challenge holds the pile in the
 * center under a line such as "Ada challenged you", then moves those
 * cards into the hand, lifts them, and lets them settle.
 */
export class BluffDriver implements GameDriver<BluffState> {
  readonly name = 'Bluff';
  readonly gameType = BLUFF_GAME_TYPE;

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
  private buttonsReady = false;
  private claimRank: BluffRank = 'A';
  private claimTouched = false;
  private ranksOpen = false;
  private playControl: ControlFace | null = null;
  private passControl: ControlFace | null = null;
  private challengeControl: ControlFace | null = null;
  private hintActor: ex.Actor | null = null;
  private rankActors: {
    rank: BluffRank;
    actor: ex.Actor;
    face: ex.Rectangle;
    caption: ex.Actor;
    text: ex.Text;
  }[] = [];
  private state: BluffState | null = null;
  private ctx: RenderContext | null = null;
  private arrival: {
    cards: string[];
    seat: number;
    local: boolean;
    line: string;
    elapsed: number;
    anchors: Map<string, PileAnchor>;
  } | null = null;
  private arrivalRaised = new Set<string>();

  render(state: BluffState, ctx: RenderContext): void {
    this.noteArrival(state, ctx);
    this.state = state;
    this.ctx = ctx;
    this.ensureHoverClock(ctx);
    if (!this.buttonsReady) {
      this.playControl = this.addButton(ctx, BLUFF_PLAY_BUTTON, 'Play', 'play');
      this.challengeControl = this.addButton(
        ctx,
        BLUFF_CHALLENGE_BUTTON,
        'Challenge',
        'challenge',
      );
      this.passControl = this.addButton(ctx, BLUFF_PASS_BUTTON, 'Pass', 'pass');
      for (const box of rankCallButtons()) {
        const made = this.addButton(ctx, box, box.rank, `rank:${box.rank}`);
        this.rankActors.push({
          rank: box.rank,
          actor: made.actor,
          face: made.face,
          caption: made.caption,
          text: made.text,
        });
      }
      this.buttonsReady = true;
    }
    this.syncCalls(state, ctx);
    this.syncLabels(state, ctx);
    if (state.phase === 'lobby') {
      this.clearTableCards();
      return;
    }
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
  }

  handleInput(event: InputEvent, state: BluffState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (state.phase !== 'play') {
      return;
    }
    if (ctx.inputBlocked() && event.type !== 'pointerleave') {
      return;
    }
    if (event.target === 'play' && event.type === 'pointerup') {
      if (state.requiredRank === null && !this.claimTouched) {
        return;
      }
      this.sendPlay(state, ctx);
      return;
    }
    if (event.target === 'pass' && event.type === 'pointerup') {
      ctx.sendIntent({ type: 'pass' });
      return;
    }
    if (event.target === 'challenge' && event.type === 'pointerup') {
      ctx.sendIntent({ type: 'challenge' });
      return;
    }
    if (event.type === 'pointerup' && event.target.startsWith('rank:')) {
      this.chooseRank(event.target.slice('rank:'.length), state);
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
      const previous = [...this.selected];
      if (this.selected.has(event.target)) {
        this.selected.delete(event.target);
      } else {
        this.selected.add(event.target);
      }
      for (const cardId of new Set([...previous, event.target])) {
        this.applyLift(cardId, state, ctx);
      }
    }
  }

  /**
   * The module said no. Flash the Play button and the lifted cards, or the
   * Challenge button, so the click does not look ignored.
   */
  intentRejected(intent: unknown, ctx: RenderContext): void {
    const type =
      typeof intent === 'object' && intent !== null && 'type' in intent
        ? intent.type
        : null;
    if (type === 'pass') {
      this.flashBox(
        ctx,
        BLUFF_PASS_BUTTON.x,
        BLUFF_PASS_BUTTON.y,
        BLUFF_PASS_BUTTON.w,
        BLUFF_PASS_BUTTON.h,
      );
      return;
    }
    if (type === 'challenge') {
      this.flashBox(
        ctx,
        BLUFF_CHALLENGE_BUTTON.x,
        BLUFF_CHALLENGE_BUTTON.y,
        BLUFF_CHALLENGE_BUTTON.w,
        BLUFF_CHALLENGE_BUTTON.h,
      );
      return;
    }
    if (type !== 'play') {
      return;
    }
    this.flashBox(
      ctx,
      BLUFF_PLAY_BUTTON.x,
      BLUFF_PLAY_BUTTON.y,
      BLUFF_PLAY_BUTTON.w,
      BLUFF_PLAY_BUTTON.h,
    );
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
    this.buttonsReady = false;
    this.playControl = null;
    this.passControl = null;
    this.challengeControl = null;
    this.hintActor?.kill();
    this.hintActor = null;
    this.rankActors = [];
    this.claimRank = 'A';
    this.claimTouched = false;
    this.selected.clear();
    this.hover = null;
    this.arrival = null;
    this.arrivalRaised.clear();
    this.stopHoverClock();
    this.state = null;
    this.ctx = null;
  }

  private sendPlay(state: BluffState, ctx: RenderContext): void {
    if (ctx.meSeatIndex === null) {
      return;
    }
    const hand = state.hands[String(ctx.meSeatIndex)] ?? [];
    const cards = selectedPlayCards(hand, this.selected);
    if (state.requiredRank === null) {
      ctx.sendIntent({ type: 'play', cards, claimRank: this.claimRank });
      return;
    }
    ctx.sendIntent({ type: 'play', cards });
  }

  private chooseRank(rank: string, state: BluffState): void {
    if (
      state.requiredRank !== null ||
      !(BLUFF_RANKS as readonly string[]).includes(rank)
    ) {
      return;
    }
    this.claimRank = rank as BluffRank;
    this.claimTouched = true;
    this.paintRanks(true);
    this.hintActor?.kill();
    this.hintActor = null;
  }

  private syncCalls(state: BluffState, ctx: RenderContext): void {
    const seat = ctx.meSeatIndex;
    const calling = showRankPicker(state, seat);
    if (!calling) {
      this.claimTouched = false;
    }
    this.setShown(this.playControl, canPlay(state, seat));
    this.setShown(this.passControl, canPass(state, seat));
    this.setShown(this.challengeControl, canChallenge(state, seat));
    this.paintRanks(calling);
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

  private paintRanks(visible: boolean): void {
    this.ranksOpen = visible;
    for (const row of this.rankActors) {
      row.actor.graphics.isVisible = visible;
      row.caption.graphics.isVisible = visible;
      row.actor.pointer.useColliderShape = visible;
      row.actor.pointer.useGraphicsBounds = visible;
      const chosen =
        visible && this.claimTouched && row.rank === this.claimRank;
      const colors = rankButtonColors(chosen);
      row.face.color = ex.Color.fromHex(colors.fill);
      row.face.strokeColor = chosen ? STROKE_HOT : STROKE;
      row.text.color = ex.Color.fromHex(colors.ink);
    }
  }

  private syncLabels(state: BluffState, ctx: RenderContext): void {
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
    const turn = turnLine(state, ctx.meSeatIndex);
    this.labels.push(
      this.textActor(ctx, BLUFF_TURN_LABEL.x, BLUFF_TURN_LABEL.y, turn, GOLD),
    );
    const prompt = tablePrompt(state, ctx.meSeatIndex);
    if (prompt !== null) {
      this.labels.push(this.centeredLine(ctx, PROMPT_Y, prompt, GOLD));
    }
    this.syncHint(state, ctx);
    const notice = pileNotice(state, ctx.seats);
    if (notice) {
      this.labels.push(this.banner(ctx, notice, PILE_NOTICE_Y));
    }
    const arrival = this.arrival;
    if (arrival && challengeFrame(arrival.elapsed).phase !== 'settled') {
      this.labels.push(this.banner(ctx, arrival.line, PILE_NOTICE_Y));
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

  private syncCards(state: BluffState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      {
        x: number;
        y: number;
        faceUp: boolean;
        delay: number;
        z: number;
        personal: boolean;
        duration?: number;
      }
    >();
    const frame = this.arrival ? challengeFrame(this.arrival.elapsed) : null;
    const holding =
      this.arrival && frame && !frame.cardsInHand
        ? new Set(this.arrival.cards)
        : null;
    this.arrivalRaised = new Set(
      frame?.lifted && this.arrival?.local ? this.arrival.cards : [],
    );
    const owned =
      ctx.meSeatIndex === null
        ? []
        : (state.hands[String(ctx.meSeatIndex)] ?? []);
    const hand =
      holding && this.arrival?.local
        ? owned.filter((cardId) => !holding.has(cardId))
        : owned;
    const handSlots = handPositions(hand.length);
    for (let index = 0; index < hand.length; index += 1) {
      const cardId = hand[index];
      const slot = handSlots[index];
      if (!cardId || !slot) {
        continue;
      }
      const arriving =
        frame?.cardsInHand && this.arrival?.local
          ? this.arrival.cards.includes(cardId)
          : false;
      desired.set(cardId, {
        x: slot.x,
        y: slot.y,
        faceUp: true,
        delay: arriving ? 0 : index * 16,
        z: 12 + index,
        personal: true,
        duration: arriving ? CHALLENGE_MOVE_MS : undefined,
      });
    }
    const pileSlots = pilePositions(state.discardPile.length);
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
        faceUp: pileFaceUp(state, cardId, ctx.meSeatIndex),
        delay: 0,
        z: 5 + index,
        personal: false,
      });
    }
    if (holding && this.arrival) {
      for (const cardId of this.arrival.cards) {
        const at = this.arrival.anchors.get(cardId);
        desired.set(cardId, {
          x: at?.x ?? PILE_X,
          y: at?.y ?? PILE_Y,
          faceUp: at?.faceUp ?? false,
          delay: 0,
          z: 8,
          personal: false,
        });
      }
    } else if (this.arrival && frame?.cardsInHand && !this.arrival.local) {
      const seat = ctx.seats.find(
        (row) => row.seatIndex === this.arrival?.seat,
      );
      for (const cardId of this.arrival.cards) {
        desired.set(cardId, {
          x: seat?.x ?? PILE_X,
          y: seat?.y ?? PILE_Y,
          faceUp: false,
          delay: 0,
          z: 6,
          personal: false,
          duration: CHALLENGE_MOVE_MS,
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
    place: {
      x: number;
      y: number;
      faceUp: boolean;
      delay: number;
      z: number;
      personal: boolean;
      duration?: number;
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
        this.followHand(cardId, event.worldPos.x, true);
        this.onCard('pointerenter', cardId);
      });
      actor.on('pointermove', (event) => {
        this.followHand(cardId, event.worldPos.x, false);
      });
      actor.on('pointerleave', () => {
        this.handHover.leave(cardId);
        this.onCard('pointerleave', cardId);
      });
      actor.on('pointerup', (event) => {
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
      this.travel(
        cardId,
        record,
        place.x,
        place.y,
        fromDeal ? place.delay : 0,
        place.duration ?? TRAVEL_MS,
      );
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
    duration: number,
  ): void {
    record.moving = true;
    record.actor.graphics.offset = ex.vec(0, 0);
    record.actor.z = record.restZ;
    record.actor.actions.clearActions();
    const motion = record.actor.actions;
    if (delay > 0) {
      motion.delay(delay);
    }
    motion
      .moveTo({
        pos: ex.vec(x, y),
        duration,
        easing: ex.EasingFunctions.EaseOutCubic,
      })
      .callMethod(() => {
        record.moving = false;
        this.applyLift(cardId, this.state, this.ctx);
      });
  }

  private applyLift(
    cardId: string,
    state: BluffState | null,
    ctx: RenderContext | null,
  ): void {
    const record = this.cards.get(cardId);
    if (!record || record.moving || !state || !ctx) {
      return;
    }
    const legal = legalCard(state, ctx.meSeatIndex, cardId);
    const held = Math.max(
      cardLift({
        legal,
        hovered: false,
        selected: this.selected.has(cardId),
      }),
      this.arrivalRaised.has(cardId) ? HOVER_LIFT : 0,
    );
    const hover =
      record.personal && legal && held === 0
        ? this.handHover.current(cardId)
        : 0;
    placeCardLift(
      record.actor,
      record.restX,
      record.restY,
      record.restZ,
      held > 0 ? held : hover,
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
      !legalCard(state, ctx.meSeatIndex, cardId)
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

  private noteArrival(state: BluffState, ctx: RenderContext): void {
    const previous = this.state;
    if (!previous || JSON.stringify(previous) === JSON.stringify(state)) {
      return;
    }
    const beat = challengePickup(
      previous,
      state,
      ctx.meSeatIndex,
      (seatIndex) =>
        ctx.seats.find((seat) => seat.seatIndex === seatIndex)?.name ?? '',
    );
    if (beat) {
      this.arrival = {
        cards: beat.cards,
        seat: beat.seat,
        local: ctx.meSeatIndex === beat.seat,
        line: beat.line,
        elapsed: 0,
        anchors: pileAnchors(previous, ctx.meSeatIndex),
      };
      return;
    }
    if (this.arrival) {
      this.arrival = null;
      this.arrivalRaised.clear();
    }
  }

  private advanceArrival(elapsedMs: number): void {
    const arrival = this.arrival;
    const state = this.state;
    const ctx = this.ctx;
    if (!arrival || !state || !ctx) {
      return;
    }
    const before = challengeFrame(arrival.elapsed).phase;
    arrival.elapsed += elapsedMs;
    const after = challengeFrame(arrival.elapsed).phase;
    if (before === after) {
      return;
    }
    if (after === 'settled') {
      this.arrival = null;
      this.arrivalRaised.clear();
    }
    this.syncLabels(state, ctx);
    this.syncCards(state, ctx);
    this.syncBacks(state, ctx);
  }

  private easeHand(elapsedMs: number): void {
    this.advanceArrival(elapsedMs);
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

  private syncHint(state: BluffState, ctx: RenderContext): void {
    this.hintActor?.kill();
    this.hintActor = null;
    const hint = leadRankHint(state, ctx.meSeatIndex, this.claimTouched);
    if (!hint) {
      return;
    }
    const pos = rankHintPos();
    this.hintActor = this.textActor(ctx, pos.x, pos.y, hint, GOLD);
  }

  private syncBacks(state: BluffState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; z: number; rotation: number }
    >();
    for (const seat of ctx.seats) {
      if (seat.self) {
        continue;
      }
      let count = state.hands[String(seat.seatIndex)]?.length ?? 0;
      const arrival = this.arrival;
      if (
        arrival &&
        !arrival.local &&
        arrival.seat === seat.seatIndex &&
        !challengeFrame(arrival.elapsed).cardsInHand
      ) {
        count = Math.max(0, count - arrival.cards.length);
      }
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
      const target = `${place.x}:${place.y}:${place.rotation}`;
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
        const back = ctx.cards.back();
        back.scale = ex.vec(OPPONENT_FAN_SCALE, OPPONENT_FAN_SCALE);
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

  private banner(ctx: RenderContext, text: string, y = 112): ex.Actor {
    const width = text.length * 8 + 16;
    const actor = new ex.Actor({
      pos: ex.vec(Math.floor((LOGICAL_WIDTH - width) / 2), y),
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

  private centeredLine(
    ctx: RenderContext,
    y: number,
    text: string,
    color: ex.Color,
  ): ex.Actor {
    const width = text.length * 8;
    return this.textActor(ctx, Math.round(PILE_X - width / 2), y, text, color);
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
    target: 'play' | 'challenge' | 'pass' | `rank:${BluffRank}`,
  ): ControlFace {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const rest = buttonCaptionPos(label, box.w, box.h);
    const text = canvasText(label, BUTTON_FONT_SIZE, GOLD);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(text);
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    const rank = target.startsWith('rank:')
      ? target.slice('rank:'.length)
      : null;
    actor.on('pointerleave', () => {
      caption.pos = ex.vec(rest.x, rest.y);
      if (rank !== null) {
        this.paintRanks(this.ranksOpen);
        return;
      }
      face.strokeColor = STROKE;
      face.color = BUTTON;
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      caption.pos = ex.vec(rest.x, rest.y);
      if (rank !== null) {
        this.paintRanks(this.ranksOpen);
      } else {
        face.color = BUTTON;
      }
      const state = this.state;
      const current = this.ctx;
      if (!state || !current) {
        return;
      }
      this.handleInput({ type: 'pointerup', target }, state, current);
    });
    ctx.scene.add(actor);
    this.buttons.push(actor);
    return { actor, face, caption, text };
  }
}
