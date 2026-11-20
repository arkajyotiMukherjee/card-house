import { gameAudio } from './game-audio';
import { anchorTableActor } from './table-viewport';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  BLUFF_GAME_TYPE,
  BLUFF_RANKS,
  canFlushBluff,
  isJoker,
  type BluffRank,
  type BluffState,
} from '../../src/shared/games/bluff';
import {
  CARD_DRAW,
  HOVER_LIFT,
  canChallenge,
  canPass,
  canPlay,
  faceForCard,
  orderedBluffHand,
  legalCard,
  pileFaceUp,
  rankButtonColors,
  selectedPlayCards,
  showRankPicker,
} from './bluff-layout';
import {
  BLUFF_CHALLENGE_BUTTON,
  BLUFF_PASS_BUTTON,
  BLUFF_PLAY_BUTTON,
  HAND_NEXT,
  HAND_PREV,
  handPageSize,
  bluffControlBoxes,
  PILE_X,
  PILE_Y,
  handPositions,
  pilePositions,
  rankCallButtons,
  bluffBackSlots,
} from './bluff-classic-layout';
import { BluffTableUi } from './bluff-table-ui';
import { classicSeats } from './classic-table-design';
import { uiText, uiCaption } from './ui-text';

import { OPPONENT_FAN_CARD } from './table-presentation';
import { BUTTON_PRESS_SHIFT } from './button-style';
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
import {
  HandHover,
  canInspectPointer,
  placeCardLift,
  resetCardLift,
  startHandHoverClock,
} from './hand-hover';
import { tableGutter } from './table-viewport';

const GOLD = ex.Color.fromHex('#f4e4b3');
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
  setLabel?: (label: string) => void;
  place?: (box: { x: number; y: number; w: number; h: number }) => void;
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
  private readonly tableUi = new BluffTableUi();
  private announcement = '';
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
  private flushControl: ControlFace | null = null;
  private challengeControl: ControlFace | null = null;
  private handPage = 0;
  private handPageCount = 1;
  private handLayoutKey = '';
  private visibleHand: string[] = [];
  private prevHandControl: ControlFace | null = null;
  private nextHandControl: ControlFace | null = null;
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
      this.flushControl = this.addButton(
        ctx,
        BLUFF_PASS_BUTTON,
        'Flush',
        'flush',
      );
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
      {
        this.prevHandControl = this.addButton(ctx, HAND_PREV, '<', 'hand-prev');
        this.nextHandControl = this.addButton(
          ctx,
          HAND_NEXT,
          '1/1 >',
          'hand-next',
        );
        anchorTableActor(this.prevHandControl.actor, 'left', HAND_PREV.x);
      }
      this.buttonsReady = true;
    }
    if (state.phase === 'lobby') {
      this.clearTableCards();
      this.syncCalls(state, ctx);
      return;
    }
    this.syncCards(state, ctx);
    this.syncCalls(state, ctx);
    this.syncBacks(state, ctx);
    this.syncLabels(state, ctx);
  }

  handleInput(event: InputEvent, state: BluffState, ctx: RenderContext): void {
    this.state = state;
    this.ctx = ctx;
    if (
      event.type === 'pointerup' &&
      (event.target === 'hand-prev' || event.target === 'hand-next')
    ) {
      if (ctx.inputBlocked() || this.handPageCount < 2) return;
      const direction = event.target === 'hand-prev' ? -1 : 1;
      this.handPage =
        (this.handPage + direction + this.handPageCount) % this.handPageCount;
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncLabels(state, ctx);
      return;
    }
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
    if (event.target === 'flush' && event.type === 'pointerup') {
      if (canFlushBluff(state, ctx.meSeatIndex))
        ctx.sendIntent({ type: 'flush' });
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
      gameAudio.play('lift');
      if (this.selected.has(event.target)) {
        this.selected.delete(event.target);
      } else {
        this.selected.add(event.target);
      }
      this.playControl?.setLabel?.(
        this.selected.size > 0 ? `Play ${this.selected.size}` : 'Play',
      );
      this.syncCalls(state, ctx);
      this.syncLabels(state, ctx);
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
    this.tableUi.clear();
    this.announcement = '';
    for (const actor of this.buttons) {
      actor.kill();
    }
    this.buttons = [];
    this.buttonsReady = false;
    this.playControl = null;
    this.passControl = null;
    this.flushControl = null;
    this.challengeControl = null;
    this.prevHandControl = null;
    this.nextHandControl = null;
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
    if (this.ctx) {
      this.syncCalls(state, this.ctx);
      this.syncLabels(state, this.ctx);
    }
  }

  private syncCalls(state: BluffState, ctx: RenderContext): void {
    const seat = ctx.meSeatIndex;
    const calling = showRankPicker(state, seat) && !this.arrival;
    if (!calling) {
      this.claimTouched = false;
    }
    this.playControl?.setLabel?.(
      this.selected.size > 0 ? `Play ${this.selected.size}` : 'Play',
    );
    const choices = [
      [this.playControl, canPlay(state, seat)],
      [this.passControl, canPass(state, seat)],
      [this.flushControl, canFlushBluff(state, seat)],
      [this.challengeControl, canChallenge(state, seat)],
    ] as const;
    const controls: ControlFace[] = [];
    for (const [control, shown] of choices) {
      this.setShown(control, shown);
      if (control && shown) controls.push(control);
    }
    const boxes = bluffControlBoxes(controls.length);
    controls.forEach((control, index) => control.place?.(boxes[index]));
    this.paintRanks(calling);
    const enabled =
      canPlay(state, seat) &&
      this.selected.size > 0 &&
      (!calling || this.claimTouched) &&
      !this.arrival;
    if (this.playControl) {
      this.playControl.actor.graphics.opacity = enabled ? 1 : 0.45;
      this.playControl.caption.graphics.opacity = enabled ? 1 : 0.45;
      this.playControl.actor.pointer.useColliderShape = enabled;
      this.playControl.actor.pointer.useGraphicsBounds = enabled;
    }
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

  setAnnouncement(text: string): void {
    this.announcement = text;
    if (this.state && this.ctx) this.syncLabels(this.state, this.ctx);
  }

  private syncLabels(state: BluffState, ctx: RenderContext): void {
    if (!this.buttonsReady) return;
    this.tableUi.render(state, ctx, {
      selected: this.selected.size,
      page: this.handPage,
      pages: this.handPageCount,
      claim: this.claimTouched ? this.claimRank : null,
      announcement: this.announcement,
      arrival: this.arrival?.line ?? null,
    });
  }

  private syncCards(
    state: BluffState,
    ctx: RenderContext,
    pageChanged = false,
  ): void {
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
        : orderedBluffHand(state.hands[String(ctx.meSeatIndex)] ?? []);
    const hand =
      holding && this.arrival?.local
        ? owned.filter((cardId) => !holding.has(cardId))
        : owned;
    this.handLayoutKey = `${isMobileDevice()}:${tableGutter()}`;
    const pageSize = handPageSize(hand.length, isMobileDevice(), tableGutter());
    this.handPageCount = this.nextHandControl
      ? Math.max(1, Math.ceil(hand.length / pageSize))
      : 1;
    this.handPage = Math.min(this.handPage, this.handPageCount - 1);
    const paged = this.handPageCount > 1;
    const first = this.handPage * pageSize;
    this.visibleHand = paged ? hand.slice(first, first + pageSize) : hand;
    this.setShown(this.prevHandControl, paged);
    this.setShown(this.nextHandControl, paged);
    if (paged) this.nextHandControl?.setLabel?.('>');
    const handSlots = this.visibleHandSlots();
    for (let index = 0; index < this.visibleHand.length; index += 1) {
      const cardId = this.visibleHand[index];
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
      const box = classicSeats(ctx.seats).find(
        (row) => row.seat.seatIndex === this.arrival?.seat,
      );
      for (const cardId of this.arrival.cards) {
        desired.set(cardId, {
          x: box
            ? box.x +
              box.w / 2 +
              (box.edge === 'left'
                ? -tableGutter()
                : box.edge === 'right'
                  ? tableGutter()
                  : 0)
            : PILE_X,
          y: box ? box.y - 54 : PILE_Y,
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
      }
    }
    for (const [cardId, place] of desired) {
      this.placeCard(cardId, place, ctx, pageChanged && place.personal);
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
    instant: boolean,
  ): void {
    const atlas = place.personal ? ctx.myCards : ctx.cards;
    let record = this.cards.get(cardId);
    if (!record) {
      const actor = new ex.Actor({
        name: `bluff-card-${cardId}`,
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
    if (instant) {
      record.actor.actions.clearActions();
      record.placed = true;
      record.moving = false;
    } else if (!record.placed || moved) {
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
    const held = this.arrivalRaised.has(cardId) ? HOVER_LIFT : 0;
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
      hover > 0 && this.handHover.isFocused(cardId),
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
    this.syncCalls(state, ctx);
  }

  private easeHand(elapsedMs: number): void {
    this.advanceArrival(elapsedMs);
    const state = this.state;
    const ctx = this.ctx;
    if (!state || !ctx) {
      return;
    }
    if (this.handLayoutKey !== `${isMobileDevice()}:${tableGutter()}`) {
      this.handHover.clear();
      this.syncCards(state, ctx, true);
      this.syncLabels(state, ctx);
    }
    const hand = this.visibleHand;
    const slots = this.visibleHandSlots();
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
    return localHandHitBoxes(this.visibleHand, this.cards, CARD_DRAW);
  }

  private visibleHandSlots(): { x: number; y: number }[] {
    return handPositions(this.visibleHand.length, isMobileDevice());
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

  private syncBacks(state: BluffState, ctx: RenderContext): void {
    const desired = new Map<
      string,
      { x: number; y: number; z: number; rotation: number; scale: number }
    >();
    for (const slot of bluffBackSlots(ctx.seats, state)) {
      const { key, ...place } = slot;
      const box = classicSeats(ctx.seats).find((row) =>
        key.startsWith(`${row.seat.seatIndex}:`),
      );
      place.x +=
        box?.edge === 'left'
          ? -tableGutter()
          : box?.edge === 'right'
            ? tableGutter()
            : 0;
      desired.set(key, place);
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
      const edge = classicSeats(ctx.seats).find((box) =>
        key.startsWith(`${box.seat.seatIndex}:`),
      )?.edge;
      const baseX =
        place.x +
        (edge === 'left'
          ? tableGutter()
          : edge === 'right'
            ? -tableGutter()
            : 0);
      const dock = (): void => {
        if (actor && edge) anchorTableActor(actor, edge, baseX);
      };
      if (!actor) {
        actor = new ex.Actor({
          name: `bluff-back-${key}`,
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
        actor.pointer.useGraphicsBounds = false;
        actor.pointer.useColliderShape = false;
        ctx.scene.add(actor);
        this.backs.set(key, actor);
        this.backTargets.set(key, target);
        actor.actions
          .moveTo({
            pos: ex.vec(place.x, place.y),
            duration: TRAVEL_MS,
            easing: ex.EasingFunctions.EaseOutCubic,
          })
          .callMethod(dock);
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
      actor.actions
        .moveTo({
          pos: ex.vec(place.x, place.y),
          duration: TRAVEL_MS,
          easing: ex.EasingFunctions.EaseOutCubic,
        })
        .callMethod(dock);
    }
  }

  private clearTableCards(): void {
    for (const record of this.cards.values()) {
      record.actor.kill();
    }
    this.visibleHand = [];
    this.handPage = 0;
    this.handPageCount = 1;
    this.setShown(this.prevHandControl, false);
    this.setShown(this.nextHandControl, false);
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

  private addButton(
    ctx: RenderContext,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    target:
      | 'play'
      | 'challenge'
      | 'pass'
      | 'flush'
      | 'hand-prev'
      | 'hand-next'
      | `rank:${BluffRank}`,
  ): ControlFace {
    let currentBox = { ...box };
    const actor = new ex.Actor({
      name: `bluff-control-${target}`,
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 24,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const size = target.startsWith('rank:') ? 22 : 18;
    const rest = uiCaption(label, currentBox.w, currentBox.h, size);
    const text = uiText(label, size, GOLD);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(text);
    caption.pointer.useGraphicsBounds = false;
    caption.pointer.useColliderShape = false;
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    const rank = target.startsWith('rank:')
      ? target.slice('rank:'.length)
      : null;
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        caption.pos = ex.vec(rest.x, rest.y);
        if (rank !== null) {
          this.paintRanks(this.ranksOpen);
          return;
        }
        face.strokeColor = STROKE;
        face.color = BUTTON;
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
    if (box.x >= 600 && box.y >= 400) anchorTableActor(actor, 'right', box.x);
    ctx.scene.add(actor);
    this.buttons.push(actor);
    return {
      actor,
      face,
      caption,
      text,
      place: (nextBox) => {
        currentBox = { ...nextBox };
        face.width = nextBox.w;
        face.height = nextBox.h;
        actor.collider.useBoxCollider(nextBox.w, nextBox.h, ex.vec(0, 0));
        actor.pos.y = nextBox.y;
        anchorTableActor(actor, 'right', nextBox.x);
        const next = uiCaption(text.text, nextBox.w, nextBox.h, size);
        rest.x = next.x;
        rest.y = next.y;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      setLabel: (nextLabel) => {
        text.text = nextLabel;
        const nextSize = target.startsWith('rank:') ? 22 : 18;
        text.font = uiText(nextLabel, nextSize, GOLD).font;
        const next = uiCaption(nextLabel, currentBox.w, currentBox.h, nextSize);
        rest.x = next.x;
        rest.y = next.y;
        caption.pos = ex.vec(rest.x, rest.y);
      },
    };
  }
}
