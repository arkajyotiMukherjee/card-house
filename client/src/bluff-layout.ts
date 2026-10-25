import type { CardFace } from './card-atlas';
import {
  BLUFF_RANK_NAMES,
  BLUFF_RANKS,
  rankOfCard,
  type BluffRank,
  type BluffState,
} from '../../src/shared/games/bluff';
import { BUTTON_HEIGHT } from './button-style';
import { LOGICAL_WIDTH } from './sheets';

export const HAND_LEFT = 16;
export const HAND_RIGHT = 736;
export const HAND_Y = 508;
export const CARD_DRAW = 64;
export const HOVER_LIFT = 20;
export const PILE_X = 480;
export const PILE_Y = 268;
export const TABLE_CENTER = { x: 480, y: 270 } as const;

export const PLAY_BUTTON = { x: 748, y: 448, w: 96, h: BUTTON_HEIGHT } as const;
export const CHALLENGE_BUTTON = {
  x: 852,
  y: 448,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;
export const PASS_BUTTON = {
  x: 852,
  y: 412,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;

/** Bluff's own cluster, low in the corner and clear of the hand. */
export const BLUFF_PLAY_BUTTON = {
  x: 856,
  y: 468,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;
export const BLUFF_PASS_BUTTON = {
  x: 856,
  y: 436,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;
export const BLUFF_CHALLENGE_BUTTON = {
  x: 856,
  y: 500,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;
export const BLUFF_TURN_LABEL = { x: 856, y: 412 } as const;
export const BLUFF_RANK_HINT = 'Select a rank';
export const PROMPT_Y = 164;
export const PILE_NOTICE_Y = PILE_Y - CARD_DRAW / 2 - 28;

/** Unchosen rank buttons stay green. The chosen rank is filled gold. */
export const RANK_FILL = '#1b5c38';
export const RANK_FILL_CHOSEN = '#f4e4b3';
export const RANK_INK = '#f4e4b3';
export const RANK_INK_CHOSEN = '#1b5c38';

export function rankButtonColors(chosen: boolean): {
  fill: string;
  ink: string;
} {
  if (chosen) {
    return { fill: RANK_FILL_CHOSEN, ink: RANK_INK_CHOSEN };
  }
  return { fill: RANK_FILL, ink: RANK_INK };
}

export function rankHintPos(): { x: number; y: number } {
  const width = BLUFF_RANK_HINT.length * 8;
  return {
    x: BLUFF_PLAY_BUTTON.x - width - 8,
    y: BLUFF_PLAY_BUTTON.y + Math.floor((BUTTON_HEIGHT - 8) / 2),
  };
}

const RANK_BUTTON_W = 32;
const RANK_BUTTON_GAP = 4;

/** One button per rank, used when the lead calls the rank for the round. */
export function rankCallButtons(): {
  rank: BluffRank;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  const span =
    BLUFF_RANKS.length * RANK_BUTTON_W +
    (BLUFF_RANKS.length - 1) * RANK_BUTTON_GAP;
  const start = Math.floor((LOGICAL_WIDTH - span) / 2);
  return BLUFF_RANKS.map((rank, index) => ({
    rank,
    x: start + index * (RANK_BUTTON_W + RANK_BUTTON_GAP),
    y: 368,
    w: RANK_BUTTON_W,
    h: BUTTON_HEIGHT,
  }));
}

/** Plural of a rank name. Six is the only name that takes "es". */
export function rankWord(rank: BluffRank, count: number): string {
  const name = BLUFF_RANK_NAMES[rank];
  if (count === 1) {
    return name;
  }
  if (name === 'Six') {
    return 'Sixes';
  }
  return `${name}s`;
}

/**
 * The center prompt names the called rank and does not fix a count.
 * `Call a rank` is only for the lead. Everyone else still sees the rank
 * once it has been called.
 */
export function tablePrompt(
  state: BluffState,
  seatIndex: number | null,
): string | null {
  if (state.phase !== 'play') {
    return null;
  }
  if (state.requiredRank === null) {
    if (seatIndex !== null && seatIndex === state.turnSeatIndex) {
      return 'Call a rank';
    }
    return null;
  }
  return `Play ${rankWord(state.requiredRank, 2)}`;
}

/** Side label. Only the seat that must act reads `Your turn`. */
export function turnLine(
  state: BluffState,
  seatIndex: number | null,
): 'Your turn' | 'Wait' {
  if (
    state.phase === 'play' &&
    seatIndex !== null &&
    state.turnSeatIndex === seatIndex
  ) {
    return 'Your turn';
  }
  return 'Wait';
}

const NOTICE_NAME_LIMIT = 16;

function noticeName(name: string, seatIndex: number): string {
  if (name.length === 0) {
    return `Seat ${seatIndex}`;
  }
  if (name.length <= NOTICE_NAME_LIMIT) {
    return name;
  }
  return name.slice(0, NOTICE_NAME_LIMIT);
}

/**
 * The claim above the pile: who played, how many, and the called rank.
 * The faces under that claim stay hidden.
 */
export function pileNotice(
  state: BluffState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'play' || state.lastPlay === null) {
    return null;
  }
  const last = state.lastPlay;
  const seat = seats.find((row) => row.seatIndex === last.seat);
  const name = noticeName(seat?.name ?? '', last.seat);
  const count = last.cards.length;
  return `${name} played ${count} ${rankWord(last.claimRank, count)}`;
}

const PILE_SHOWN = 8;
const PILE_STEP = 20;
const BACKS_SHOWN = 4;

export function handPositions(count: number): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }
  const width = HAND_RIGHT - HAND_LEFT;
  const step =
    count === 1
      ? 0
      : Math.min(CARD_DRAW, Math.floor((width - CARD_DRAW) / (count - 1)));
  const span = CARD_DRAW + step * (count - 1);
  const start = HAND_LEFT + Math.floor((width - span) / 2) + CARD_DRAW / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: start + index * step, y: HAND_Y });
  }
  return positions;
}

export function pilePositions(count: number): { x: number; y: number }[] {
  const shown = Math.min(count, PILE_SHOWN);
  if (shown <= 0) {
    return [];
  }
  const step = PILE_STEP;
  const span = (shown - 1) * step;
  const origin = PILE_X - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    positions.push({ x: Math.round(origin + index * step), y: PILE_Y });
  }
  return positions;
}

/**
 * Opponent backs are a little smaller than the local hand so a full fan
 * still fits above the prompt and beside the action buttons.
 */
export const OPPONENT_FAN_CARD = 48;
export const OPPONENT_FAN_SCALE = OPPONENT_FAN_CARD / CARD_DRAW;

const PLATE_HEIGHT = 20;
const FAN_HALF = OPPONENT_FAN_CARD / 2;
/** How far a card center sits in from the point on the table edge. */
const FAN_BOTTOM_INSET = 0.92;
const LABEL_BLOCK_H = 32;
const FAN_CARD_REACH = FAN_HALF * 1.25;

export interface FanSlot {
  x: number;
  y: number;
  rotation: number;
}

/** Which table edge that seat sits on. The fan's bottom lies along it. */
export type FanEdge = 'left' | 'right' | 'top' | 'bottom';

export function fanEdge(seatX: number, seatY: number): FanEdge {
  const dx = seatX - TABLE_CENTER.x;
  const dy = seatY - TABLE_CENTER.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

/** Width of the seat name plate `GameScene` draws for this name. */
export function seatPlateWidth(name: string): number {
  return Math.max(48, name.length * 8 + 16);
}

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounds of one rotated fan card. */
export function fanCardRect(slot: FanSlot): CardRect {
  const c = Math.abs(Math.cos(slot.rotation));
  const s = Math.abs(Math.sin(slot.rotation));
  const hw = FAN_HALF * (c + s);
  const hh = FAN_HALF * (s + c);
  return {
    x: slot.x - hw,
    y: slot.y - hh,
    w: hw * 2,
    h: hh * 2,
  };
}

interface FanFrame {
  edge: FanEdge;
  edgeX: number;
  edgeY: number;
  /** The label is wide along this edge, so the gap is horizontal. */
  horizontal: boolean;
  outwardX: number;
  outwardY: number;
  inwardX: number;
  inwardY: number;
  /** How far card bottoms may travel from the seat, along the edge. */
  room: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fanFrame(seatX: number, seatY: number): FanFrame {
  const edge = fanEdge(seatX, seatY);
  if (edge === 'left') {
    return {
      edge,
      edgeX: 10,
      edgeY: clamp(seatY, 168, 392),
      horizontal: false,
      outwardX: -1,
      outwardY: 0,
      inwardX: 1,
      inwardY: 0,
      room: 156,
    };
  }
  if (edge === 'right') {
    return {
      edge,
      edgeX: LOGICAL_WIDTH - 10,
      edgeY: clamp(seatY, 168, 392),
      horizontal: false,
      outwardX: 1,
      outwardY: 0,
      inwardX: -1,
      inwardY: 0,
      room: 156,
    };
  }
  if (edge === 'top') {
    return {
      edge,
      edgeX: clamp(seatX, 280, 680),
      edgeY: 78,
      horizontal: true,
      outwardX: 0,
      outwardY: -1,
      inwardX: 0,
      inwardY: 1,
      room: 210,
    };
  }
  return {
    edge,
    edgeX: clamp(seatX, 200, 760),
    edgeY: 392,
    horizontal: true,
    outwardX: 0,
    outwardY: 1,
    inwardX: 0,
    inwardY: -1,
    room: 130,
  };
}

export interface FanLabel {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Name plate over the count. Both sit in the middle of the fan. */
export function fanLabelBox(name: string): { w: number; h: number } {
  return { w: seatPlateWidth(name), h: LABEL_BLOCK_H };
}

function labelOrigin(frame: FanFrame, name: string): FanLabel {
  const box = fanLabelBox(name);
  const x = frame.edgeX + frame.inwardX * FAN_HALF - box.w / 2;
  const y = frame.edgeY + frame.inwardY * FAN_HALF - box.h / 2;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: box.w,
    h: box.h,
  };
}

/** Center of the card's outer edge. It lies on the seat's table edge. */
export function fanCardBottom(slot: FanSlot): { x: number; y: number } {
  return {
    x: slot.x + Math.sin(slot.rotation) * FAN_HALF * FAN_BOTTOM_INSET,
    y: slot.y + Math.cos(slot.rotation) * FAN_HALF * FAN_BOTTOM_INSET,
  };
}

function bottomDirection(
  frame: FanFrame,
  tilt: number,
): { x: number; y: number } {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  if (frame.horizontal) {
    return { x: frame.outwardX * c + s, y: frame.outwardY * c };
  }
  return { x: frame.outwardX * c, y: frame.outwardY * c + s };
}

function wingStep(cards: number, inner: number, room: number): number {
  if (cards <= 1) {
    return 0;
  }
  const fit = (room - FAN_HALF - inner) / (cards - 1);
  return Math.max(6, Math.min(12, fit));
}

function wingSlots(
  frame: FanFrame,
  cards: number,
  sign: -1 | 1,
  inner: number,
  step: number,
): FanSlot[] {
  const slots: FanSlot[] = [];
  for (let index = 0; index < cards; index += 1) {
    const t = cards === 1 ? 0 : index / (cards - 1);
    const along = sign * (inner + index * step);
    const tilt = sign * (0.08 + t * 0.72);
    const dir = bottomDirection(frame, tilt);
    const reach = FAN_HALF * FAN_BOTTOM_INSET;
    const bottomX = frame.horizontal ? frame.edgeX + along : frame.edgeX;
    const bottomY = frame.horizontal ? frame.edgeY : frame.edgeY + along;
    slots.push({
      x: Math.round(bottomX - dir.x * reach),
      y: Math.round(bottomY - dir.y * reach),
      rotation: Math.atan2(dir.x, dir.y),
    });
  }
  return slots;
}

/**
 * Card backs with their bottoms on that seat's table edge.
 * Left fans grow inward from the left, right from the right, and top
 * from the top. The middle of the fan is left open for the name.
 */
export function bluffSeatFan(
  seatX: number,
  seatY: number,
  count: number,
  name = 'Seat',
): FanSlot[] {
  if (count <= 0) {
    return [];
  }
  const frame = fanFrame(seatX, seatY);
  const box = fanLabelBox(name);
  const labelHalf = frame.horizontal ? box.w / 2 : box.h / 2;
  const inner = labelHalf + FAN_CARD_REACH + 4;
  const upper = Math.ceil(count / 2);
  const lower = count - upper;
  const step = wingStep(Math.max(upper, lower), inner, frame.room);
  return [
    ...wingSlots(frame, upper, -1, inner, step),
    ...wingSlots(frame, lower, 1, inner, step),
  ];
}

/** Top-left of the name plate, centered on the fan. */
export function opponentNameAnchor(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  const label = labelOrigin(fanFrame(seatX, seatY), name);
  return { x: label.x, y: label.y };
}

/** Top-left of the `xN` count, under the name and still in the fan center. */
export function opponentCountAnchor(
  seatX: number,
  seatY: number,
  count: number,
  name: string,
): { x: number; y: number } {
  const label = labelOrigin(fanFrame(seatX, seatY), name);
  const labelW = `x${count}`.length * 8;
  return {
    x: Math.round(label.x + (label.w - labelW) / 2),
    y: label.y + PLATE_HEIGHT + 4,
  };
}

/** Card backs fanned from a seat toward the middle of the table. */
export function opponentBackPositions(
  seatX: number,
  seatY: number,
  count: number,
): { x: number; y: number }[] {
  const shown = Math.min(count, BACKS_SHOWN);
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    const dist = 48 + index * 14;
    positions.push({
      x: Math.round(seatX + (dx / len) * dist),
      y: Math.round(seatY + (dy / len) * dist),
    });
  }
  return positions;
}

export function legalCard(
  state: BluffState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (!canPlay(state, seatIndex) || seatIndex === null) {
    return false;
  }
  const hand = state.hands[String(seatIndex)];
  return hand?.includes(cardId) ?? false;
}

function seatedHere(
  state: BluffState,
  seatIndex: number | null,
): seatIndex is number {
  return seatIndex !== null && String(seatIndex) in state.hands;
}

/** Your turn during play. The lead still sees Play before a rank is chosen. */
export function canPlay(state: BluffState, seatIndex: number | null): boolean {
  return (
    state.phase === 'play' &&
    seatedHere(state, seatIndex) &&
    state.turnSeatIndex === seatIndex &&
    !state.passed.includes(seatIndex)
  );
}

/** Pass is legal only after a rank has been called, and only on your turn. */
export function canPass(state: BluffState, seatIndex: number | null): boolean {
  return canPlay(state, seatIndex) && state.requiredRank !== null;
}

/** A challenge judges someone else's latest play. */
export function canChallenge(
  state: BluffState,
  seatIndex: number | null,
): boolean {
  return (
    state.phase === 'play' &&
    seatedHere(state, seatIndex) &&
    state.lastPlay !== null &&
    state.lastPlay.seat !== seatIndex
  );
}

/** The rank picker is only for the lead, before any rank is called. */
export function showRankPicker(
  state: BluffState,
  seatIndex: number | null,
): boolean {
  return canPlay(state, seatIndex) && state.requiredRank === null;
}

/** Short line beside Play until the lead clicks a rank. */
export function leadRankHint(
  state: BluffState,
  seatIndex: number | null,
  rankChosen: boolean,
): string | null {
  if (!showRankPicker(state, seatIndex) || rankChosen) {
    return null;
  }
  return BLUFF_RANK_HINT;
}

export function cardLift(options: {
  legal: boolean;
  hovered: boolean;
  selected: boolean;
}): number {
  if (!options.legal) {
    return 0;
  }
  if (options.selected || options.hovered) {
    return HOVER_LIFT;
  }
  return 0;
}

export function selectedPlayCards(
  hand: readonly string[],
  selected: ReadonlySet<string>,
): string[] {
  const cards: string[] = [];
  for (const card of hand) {
    if (selected.has(card)) {
      cards.push(card);
    }
  }
  return cards;
}

export function faceForCard(cardId: string): CardFace | null {
  const rank = rankOfCard(cardId);
  const suitLetter = cardId.slice(-1);
  const suit =
    suitLetter === 'H'
      ? 'hearts'
      : suitLetter === 'D'
        ? 'diamonds'
        : suitLetter === 'C'
          ? 'clubs'
          : suitLetter === 'S'
            ? 'spades'
            : null;
  if (!rank || !suit) {
    return null;
  }
  return { rank, suit };
}

/**
 * End-of-game line from the subscribed state.
 * The seat index is the rules winner, and the name is that seated player.
 */
export function finishedLine(
  state: BluffState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  const seatIndex = state.winnerSeatIndex;
  if (seatIndex === null) {
    return 'Finished';
  }
  const seat = seats.find((row) => row.seatIndex === seatIndex);
  const name = seat?.name ?? '';
  if (name.length > 0) {
    return `Winner seat ${seatIndex} ${name}`;
  }
  return `Winner seat ${seatIndex}`;
}

/** True when this pile card is one the local seat just played. */
export function pileFaceUp(
  state: BluffState,
  cardId: string,
  seatIndex: number | null,
): boolean {
  if (seatIndex === null || state.lastPlay === null) {
    return false;
  }
  if (state.lastPlay.seat !== seatIndex) {
    return false;
  }
  return state.lastPlay.cards.includes(cardId);
}
