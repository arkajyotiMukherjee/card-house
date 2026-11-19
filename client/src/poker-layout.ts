import type { CardFace } from './card-atlas';
import {
  POKER_HAND_PAUSE_MS,
  rankOfPokerCard,
  type PokerState,
} from '../../src/shared/games/poker';
import { CHIP_HEIGHT } from './sheets';
import type { ChipValue } from './chip-atlas';
import { inspectionPose } from './hand-hover';

export const BOARD_SCALE = 1.65;
import {
  FELT_BOTTOM,
  fanGapLine,
  opponentNameAnchor,
  seatFan,
  revealedHandSlots,
  seatPlateWidth,
} from './table-presentation';

export const BOARD_STEP = 88;
export const BOARD_SLOTS = 5;
/** Half the card closes, then the face opens. Short enough to finish before the next street. */
export const BOARD_FLIP_MS = 280;
export const POT_X = 480;
export const POT_Y = 256;
/** Pot chips are drawn at this scale. The stack grows upward from `POT_Y`. */
export const POT_CHIP_SCALE = 1.25;
/** Shared face artwork and stacking rhythm for the pot and betting preview. */
export const POKER_CHIP_FACE_SCALE = 1.6;
export const POKER_CHIP_LAYER_GAP = 4;
/** Bottom of the lowest pot chip. The board sits in the band under this. */
export const POT_CHIP_BOTTOM = POT_Y + (CHIP_HEIGHT * POT_CHIP_SCALE) / 2;
export const CARD_DRAW = 64;
/** Results and countdowns belong in the personal bar, below the public cards. */
export const BANNER_Y = 440;
export const COUNTDOWN_Y = 478;
/** Community cards, below the pot. The top of the table is the opponent fans. */
export const BOARD_Y = 350;
export const DROPPED_SCALE = 0.75;
export const DROPPED_Y = FELT_BOTTOM + 28;
export const DROPPED_LABEL = { x: 16, y: FELT_BOTTOM + 8 } as const;
const DROPPED_X = [48, 108] as const;
export const DISCARD_PROMPT = { x: 16, y: FELT_BOTTOM } as const;

export const POKER_USER_Y = 436;
export type PokerPersonalMode =
  'waiting' | 'acting' | 'discard' | 'stake' | 'result' | 'watching';

/** The same bottom-bar state governs both its content and visible betting controls. */
export function pokerPersonalMode(
  state: PokerState,
  seat: number | null,
  staking = false,
): PokerPersonalMode {
  if (state.phase === 'finished') return 'result';
  if (seat === null) return 'watching';
  const row = state.seats[String(seat)];
  if (
    state.phase !== 'play' ||
    state.turnSeatIndex !== seat ||
    !row ||
    row.folded
  )
    return 'waiting';
  // All-in Oklahoma players must still make their mandatory discards.
  if (state.step === 'discard') return 'discard';
  if (row.allIn) return 'waiting';
  return staking ? 'stake' : 'acting';
}
/** All personal controls share the bottom band; opponent panels end above it. */
export function pokerActionBox(index: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: 568 + index * 74,
    y: 478,
    w: 68,
    h: 42,
  };
}
export const FOLD_BUTTON = pokerActionBox(0);
export const CHECK_BUTTON = pokerActionBox(1);
export const CALL_BUTTON = pokerActionBox(2);
export const BET_BUTTON = pokerActionBox(3);
export const RAISE_BUTTON = pokerActionBox(4);

/** Amount stepper that replaces the action buttons while a bet or raise is open. */
export const STAKE_DOWN = { x: 568, y: 478, w: 64, h: 42 };
export const STAKE_UP = { x: 638, y: 478, w: 64, h: 42 };
export const STAKE_AMOUNT = { x: 568, y: 478, w: 120, h: 50 };
export const STAKE_MAX = { x: 708, y: 478, w: 76, h: 42 };
export const STAKE_CONFIRM = { x: 868, y: 478, w: 68, h: 42 };
export const STAKE_CANCEL = { x: 790, y: 478, w: 72, h: 42 };
export const STAKE_SLIDER = { x: 568, y: 438, w: 368, h: 36 };

/** The server uses street totals; the composer shows chips leaving the remaining stack now. */
export function stakeContribution(
  state: PokerState,
  seatIndex: number,
  total: number,
): number {
  const seat = state.seats[String(seatIndex)];
  return seat ? Math.min(seat.chips, Math.max(0, total - seat.streetBet)) : 0;
}

/** Exact denomination counts for a betting preview; rendering may bound the stack height. */
export function betChipStacks(
  amount: number,
): { value: ChipValue; count: number }[] {
  let remaining = Math.max(0, Math.floor(amount));
  return ([1000, 100, 25, 10, 5, 1] as const).flatMap((value) => {
    const count = Math.floor(remaining / value);
    remaining %= value;
    return count ? [{ value, count }] : [];
  });
}
export function sliderStake(
  fraction: number,
  min: number,
  max: number,
  step: number,
): number {
  if (fraction >= 1) return max;
  return Math.max(
    min,
    Math.min(
      max,
      min +
        Math.round((Math.max(0, fraction) * (max - min)) / Math.max(1, step)) *
          Math.max(1, step),
    ),
  );
}

export interface StakeHitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The stake control under `point`.
 *
 * `boxes` is draw order, later last. The right and bottom edges are open,
 * so a shared edge belongs to the later box only. An overlap belongs to
 * that same later box. A miss is null.
 */
export function frontStakeControl(
  boxes: readonly StakeHitBox[],
  point: { x: number; y: number },
): string | null {
  let front: string | null = null;
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (!box) {
      continue;
    }
    if (
      point.x >= box.x &&
      point.x < box.x + box.w &&
      point.y >= box.y &&
      point.y < box.y + box.h
    ) {
      front = box.id;
    }
  }
  return front;
}

/** Chip step for the amount control. Raises move by the current min-raise. */
export function stakeStep(state: PokerState, kind: 'bet' | 'raise'): number {
  const raw = kind === 'raise' ? state.minRaise : state.bigBlind;
  return raw > 0 ? raw : 1;
}

/** Move a stake and keep it inside the legal range. The ends are reachable. */
export function moveStake(
  amount: number,
  delta: number,
  min: number,
  max: number,
): number {
  const next = amount + delta;
  if (next > max) {
    return max;
  }
  if (next < min) {
    return min;
  }
  return next;
}

/**
 * Chip line in the fan gap, with SB or BB on that same line beside the name.
 * A blind mark shares the row with the stack so it stays off the cards.
 */
export function blindChipLine(
  self: boolean,
  seatX: number,
  seatY: number,
  name: string,
  chips: string,
  mark: 'SB' | 'BB' | null,
  fontSize = 8,
): {
  mark: { x: number; y: number } | null;
  chips: { x: number; y: number };
} {
  if (self) {
    const base = { x: 16, y: 518 };
    if (!mark) {
      return { mark: null, chips: base };
    }
    return {
      mark: base,
      chips: { x: base.x + mark.length * fontSize + 8, y: base.y },
    };
  }
  const chipsAt = fanGapLine(seatX, seatY, name, chips, 0, fontSize);
  if (!mark) {
    return { mark: null, chips: chipsAt };
  }
  const plate = opponentNameAnchor(seatX, seatY, name);
  const text = `${mark} ${chips}`;
  const start = Math.round(
    plate.x + (seatPlateWidth(name) - text.length * fontSize) / 2,
  );
  return {
    mark: { x: start, y: chipsAt.y },
    chips: { x: start + (mark.length + 1) * fontSize, y: chipsAt.y },
  };
}

/**
 * Scale of a community card while it flips.
 * The face swaps at the edge-on frame. `done` is the face resting open.
 */
export function boardFlip(elapsedMs: number): {
  scaleX: number;
  face: boolean;
  done: boolean;
} {
  const t = Math.max(0, elapsedMs) / BOARD_FLIP_MS;
  if (t >= 1) {
    return { scaleX: 1, face: true, done: true };
  }
  if (t < 0.5) {
    return { scaleX: 1 - t * 2, face: false, done: false };
  }
  return { scaleX: (t - 0.5) * 2, face: true, done: false };
}

/**
 * Countdown while a finished hand stays up.
 * `Next hand in 10` at the start, then one less each second, down to 1.
 * The line is gone once the pause has elapsed and the next hand deals.
 */
export function nextHandCountdown(elapsedMs: number): string | null {
  const remain = POKER_HAND_PAUSE_MS - Math.max(0, elapsedMs);
  if (remain <= 0) {
    return null;
  }
  const seconds = Math.ceil(remain / 1000);
  return `Next hand in ${seconds}`;
}

/** Community cards in a row under the pot, across the middle of the table. */
export function boardPositions(
  count: number,
  sidePots = false,
): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }
  const span = (count - 1) * BOARD_STEP;
  const origin = 480 - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({
      x: Math.round(origin + index * BOARD_STEP),
      y: BOARD_Y + (sidePots ? 12 : 0),
    });
  }
  return positions;
}

/** Your hole cards use the shared bottom-hand row. Other seats use the rail fan. */
export function holePositions(
  self: boolean,
  seatX: number,
  seatY: number,
  count: number,
  name = 'Seat',
  revealed = false,
  mobile = false,
): { x: number; y: number; rotation: number; scale: number }[] {
  if (self) {
    return Array.from({ length: count }, (_, index) => ({
      x: 372 + (index - (count - 1) / 2) * 68,
      // Cancel the shared resting inspection lift, keeping the visible hand
      // at the personal band's center on both desktop and touch devices.
      y: 484 + inspectionPose(0, mobile, false, true).lift,
      rotation: 0,
      scale: 1,
    }));
  }
  return revealed
    ? revealedHandSlots(seatX, seatY, count)
    : seatFan(seatX, seatY, count, name);
}

/** Spread denominations into short horizontal piles; bound very large illustrations. */
export function potChipStacks(
  amount: number,
): { value: ChipValue; count: number }[] {
  const groups = betChipStacks(amount).map((stack) => ({ ...stack, piles: 1 }));
  let piles = groups.length;
  while (piles < 9) {
    const next = groups
      .filter((group) => group.count > group.piles * 4)
      .sort((a, b) => b.count / b.piles - a.count / a.piles)[0];
    if (!next) break;
    next.piles++;
    piles++;
  }
  return groups.flatMap((group) => {
    const visible = Math.min(group.count, group.piles * 4);
    const base = Math.floor(visible / group.piles);
    const extra = visible % group.piles;
    return Array.from({ length: group.piles }, (_, index) => ({
      value: group.value,
      count: base + (index < extra ? 1 : 0),
    }));
  });
}

export function faceForPokerCard(cardId: string): CardFace | null {
  const rank = rankOfPokerCard(cardId);
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
 * End-of-hand line from the subscribed state.
 * One winner reads `Winner is Ada`. A split reads `Winners are Ada and Bea`.
 */
export function finishedLine(
  state: PokerState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished' || state.winnerSeatIndexes.length === 0) {
    return null;
  }
  const names: string[] = [];
  for (const seatIndex of state.winnerSeatIndexes) {
    const name = seats.find((row) => row.seatIndex === seatIndex)?.name ?? '';
    if (name.length > 0) {
      names.push(name);
    }
  }
  if (names.length === 0) {
    return state.winnerSeatIndexes.length === 1 ? 'Winner' : 'Winners';
  }
  if (names.length === 1) {
    return `Winner is ${names[0]}`;
  }
  const last = names[names.length - 1] ?? '';
  return `Winners are ${names.slice(0, -1).join(', ')} and ${last}`;
}

/** Second line in the fan gap: folded, all-in, street bet, or showdown hand. */
export function seatNote(state: PokerState, seatIndex: number): string | null {
  const row = state.seats[String(seatIndex)];
  if (!row) {
    return null;
  }
  if (row.folded) {
    if (state.phase === 'play' && row.chips <= 0 && row.hole.length === 0) {
      return 'Out';
    }
    return 'Fold';
  }
  const hand = state.hands[String(seatIndex)];
  if (state.phase === 'finished' && state.end === 'showdown' && hand) {
    return hand.name;
  }
  if (row.allIn) {
    return 'All-in';
  }
  if (state.phase === 'play' && row.streetBet > 0) {
    return `Bet ${row.streetBet}`;
  }
  return null;
}

/** Cards you dropped sit small and dimmed beside your hand. */
export function droppedPositions(count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < Math.min(count, DROPPED_X.length); index += 1) {
    const x = DROPPED_X[index];
    if (x !== undefined) {
      positions.push({ x, y: DROPPED_Y });
    }
  }
  return positions;
}

/** Banner start x, centered under the pot and kept clear of side seats. */
export function bannerX(text: string, fontSize = 8): number {
  return Math.max(280, Math.round(480 - (text.length * fontSize) / 2));
}

/** A solid badge separates the amount from felt decoration and the chip artwork. */
export function potBadge(
  amount: number,
  mobile = false,
): { x: number; y: number; w: number; h: number; label: string; size: number } {
  const label = `Pot ${amount.toLocaleString('en-US')}`;
  const size = Math.min(mobile ? 14 : 12, Math.floor(216 / label.length));
  const w = label.length * size + 24;
  return { x: POT_X - 84 - w, y: POT_Y - 18, w, h: 36, label, size };
}
