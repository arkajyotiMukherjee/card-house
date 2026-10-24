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
const LABEL_GAP = 6;
const FAN_HALF = OPPONENT_FAN_CARD / 2;

export interface SeatBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FanSlot {
  x: number;
  y: number;
  rotation: number;
}

/** Width of the seat name plate `GameScene` draws for this name. */
export function seatPlateWidth(name: string): number {
  return Math.max(48, name.length * 8 + 16);
}

/**
 * Where that seat's cards may sit. Left, right, and top each get a wide
 * short box on their own side, clear of the local hand and the center prompt.
 */
export function opponentFanBox(seatX: number, seatY: number): SeatBox {
  const right = seatX >= TABLE_CENTER.x;
  if (seatY < 180 && seatX > 400 && seatX < 560) {
    return { x: 330, y: 76, w: 300, h: 82 };
  }
  if (seatY < 180 && right) {
    return { x: 700, y: 96, w: 210, h: 88 };
  }
  if (seatY < 180) {
    return { x: 50, y: 96, w: 210, h: 88 };
  }
  if (seatY > 400 && right) {
    return { x: 760, y: 336, w: 170, h: 76 };
  }
  if (seatY > 400) {
    return { x: 30, y: 336, w: 170, h: 76 };
  }
  if (right) {
    return { x: 640, y: 200, w: 190, h: 100 };
  }
  return { x: 130, y: 200, w: 190, h: 100 };
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

interface FanFit {
  pivotX: number;
  pivotY: number;
  radius: number;
  halfAngle: number;
}

function fanUnion(
  pivotX: number,
  pivotY: number,
  radius: number,
  halfAngle: number,
): CardRect {
  const samples = 8;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let step = 0; step <= samples; step += 1) {
    const angle = -halfAngle + (step / samples) * halfAngle * 2;
    const rect = fanCardRect({
      x: pivotX + radius * Math.sin(angle),
      y: pivotY - radius * Math.cos(angle),
      rotation: angle,
    });
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * One circle under the cards. The radius stays near the card bottoms, and
 * the arc is kept wider than it is tall.
 */
function fitOpponentFan(box: SeatBox): FanFit {
  const pivotX = box.x + box.w / 2;
  let best: (FanFit & { spread: number }) | null = null;
  for (let step = 0; step <= 32; step += 1) {
    const halfAngle = 0.34 + (step / 32) * 0.5;
    const sin = Math.sin(halfAngle);
    const cos = Math.cos(halfAngle);
    const ext = FAN_HALF * (Math.abs(cos) + Math.abs(sin));
    const side = box.w / 2 - 2;
    const rSide = (side - ext) / sin;
    const rNear = FAN_HALF + (OPPONENT_FAN_CARD * 0.75 + FAN_HALF * sin) / cos;
    const rMin = FAN_HALF * (1 + Math.tan(halfAngle));
    if (!(rSide >= rMin)) {
      continue;
    }
    const rMax = Math.min(rSide, rNear);
    const tries = 6;
    for (let tryIndex = 0; tryIndex < tries; tryIndex += 1) {
      const radius = rMax - ((rMax - rMin) * tryIndex) / tries;
      const union = fanUnion(0, 0, radius, halfAngle);
      if (union.w > box.w - 2 || union.h > box.h - 2) {
        continue;
      }
      if (union.w <= union.h) {
        continue;
      }
      const gap = -union.y - union.h;
      if (gap < -2 || gap > OPPONENT_FAN_CARD) {
        continue;
      }
      const pivotY = box.y + box.h - 2 - (union.y + union.h);
      const top = pivotY + union.y;
      if (top < box.y + 1) {
        continue;
      }
      if (!best || union.w > best.spread) {
        best = { pivotX, pivotY, radius, halfAngle, spread: union.w };
      }
      break;
    }
  }
  if (!best) {
    return {
      pivotX,
      pivotY: box.y + box.h / 2 + FAN_HALF,
      radius: FAN_HALF,
      halfAngle: 0,
    };
  }
  return best;
}

function fanSlots(fit: FanFit, count: number): FanSlot[] {
  if (count <= 0) {
    return [];
  }
  const slots: FanSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle =
      count === 1
        ? 0
        : -fit.halfAngle + (index / (count - 1)) * fit.halfAngle * 2;
    slots.push({
      x: Math.round(fit.pivotX + fit.radius * Math.sin(angle)),
      y: Math.round(fit.pivotY - fit.radius * Math.cos(angle)),
      rotation: angle,
    });
  }
  return slots;
}

/**
 * Card backs around one pivot at the bottom of the fan.
 * Every card in the hand is placed. They overlap from left to right,
 * and the arc spreads sideways more than it stacks.
 */
export function bluffSeatFan(
  seatX: number,
  seatY: number,
  count: number,
): FanSlot[] {
  return fanSlots(fitOpponentFan(opponentFanBox(seatX, seatY)), count);
}

/** Top-left of the name plate, just above every card in the fan. */
export function opponentNameAnchor(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  const fit = fitOpponentFan(opponentFanBox(seatX, seatY));
  const arc = fanUnion(fit.pivotX, fit.pivotY, fit.radius, fit.halfAngle);
  const width = seatPlateWidth(name);
  let x = Math.round(arc.x + arc.w / 2 - width / 2);
  let y = Math.round(arc.y - LABEL_GAP - PLATE_HEIGHT);
  if (y < 46) {
    y = 46;
  }
  if (x < 4) {
    x = 4;
  }
  if (x + width > LOGICAL_WIDTH - 4) {
    x = LOGICAL_WIDTH - 4 - width;
  }
  return { x, y };
}

/** Top-left of the `xN` count, beside the name and outside the cards. */
export function opponentCountAnchor(
  seatX: number,
  seatY: number,
  count: number,
  name: string,
): { x: number; y: number } {
  const plate = opponentNameAnchor(seatX, seatY, name);
  const width = seatPlateWidth(name);
  const labelW = `x${count}`.length * 8;
  const y = plate.y + Math.floor((PLATE_HEIGHT - 8) / 2);
  let x = plate.x - 4 - labelW;
  if (x < 4) {
    x = plate.x + width + 4;
  }
  return { x, y };
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
