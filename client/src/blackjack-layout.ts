import type { CardFace } from './card-atlas';
import {
  rankOfBlackjackCard,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { handPositions } from './bluff-layout';
import { actionBox, fanEdge, fanGapLine, seatFan } from './table-presentation';

export const DEALER_X = 480;
export const DEALER_Y = 200;
export const CARD_DRAW = 64;
/** Round result banner. It sits between the dealer row and the seats. */
export const BANNER_Y = 248;

const DEALER_STEP = 36;
const SPLIT_SELF_OFFSET = 170;
const SPLIT_SELF_STEP = 36;
/** How far a split hand slides along the rail so the two fans stay apart. */
const SPLIT_ALONG = 120;
const PLATE_MIN_WIDTH = 48;
const CHIP_GAP = 22;

export const HIT_BUTTON = actionBox(0);
export const STAND_BUTTON = actionBox(1);
export const DOUBLE_BUTTON = actionBox(2);
export const SPLIT_BUTTON = actionBox(3);

export const BET_10_BUTTON = actionBox(0);
export const BET_25_BUTTON = actionBox(1);
export const BET_50_BUTTON = actionBox(2);

function row(
  centerX: number,
  y: number,
  count: number,
  step: number,
): { x: number; y: number }[] {
  const origin = centerX - ((count - 1) * step) / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: Math.round(origin + index * step), y });
  }
  return positions;
}

/** Dealer cards in a row at the top of the felt. The second card is the hole card. */
export function dealerPositions(count: number): { x: number; y: number }[] {
  return row(DEALER_X, DEALER_Y, Math.max(count, 0), DEALER_STEP);
}

/** Where the dealer total is written: right of the last dealer card. */
export function dealerLabelPosition(count: number): { x: number; y: number } {
  const last = dealerPositions(Math.max(count, 1)).at(-1);
  return { x: (last?.x ?? DEALER_X) + CARD_DRAW / 2 + 12, y: DEALER_Y - 4 };
}

/** Width of the seat name plate `GameScene` draws for this name. */
export function plateWidth(name: string): number {
  return Math.max(PLATE_MIN_WIDTH, name.length * 8 + 16);
}

/**
 * Your cards use the shared bottom-hand row. Other seats fan on the rail,
 * faces up, clear of the dealer row. A split sets the two hands apart.
 */
export function playerCardSlots(
  self: boolean,
  seatX: number,
  seatY: number,
  handCount: number,
  handIndex: number,
  cardCount: number,
  name = 'Seat',
): { x: number; y: number; rotation: number; scale: number }[] {
  const split = handCount > 1;
  const sign =
    handCount > 2
      ? (handIndex - (handCount - 1) / 2) * 0.7
      : handIndex === 0
        ? -1
        : 1;
  if (self) {
    if (!split) {
      return handPositions(cardCount).map((slot) => ({
        ...slot,
        rotation: 0,
        scale: 1,
      }));
    }
    const slots = handPositions(1);
    return row(
      handCount > 2
        ? DEALER_X - 210 + handIndex * (420 / (handCount - 1))
        : DEALER_X + sign * SPLIT_SELF_OFFSET,
      slots[0]?.y ?? seatY + 52,
      cardCount,
      handCount > 2
        ? Math.min(24, 100 / Math.max(1, cardCount - 1))
        : SPLIT_SELF_STEP,
    ).map((slot) => ({ ...slot, rotation: 0, scale: 1 }));
  }
  const edge = fanEdge(seatX, seatY);
  const along =
    split && (edge === 'top' || edge === 'bottom') ? sign * SPLIT_ALONG : 0;
  const slots = seatFan(seatX + along, seatY, cardCount, name);
  if (!split || edge === 'top' || edge === 'bottom') {
    return slots;
  }
  const inward = edge === 'right' ? -1 : 1;
  const shift = handIndex === 0 ? 0 : 72;
  return slots.map((slot) => ({
    ...slot,
    x: slot.x + inward * shift,
  }));
}

/** Stake chips. Opponents keep them in the fan gap. Yours sit beside the plate. */
export function betAnchor(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  if (fanEdge(seatX, seatY) !== 'bottom') {
    return fanGapLine(seatX, seatY, name, `${name}`, 0);
  }
  return {
    x: Math.round(seatX + plateWidth(name) / 2 + CHIP_GAP),
    y: seatY + 2,
  };
}

/** Totals sit in the fan gap for an opponent, and left of your own plate. */
export function totalLabelPosition(
  seatX: number,
  seatY: number,
  name: string,
  text: string,
): { x: number; y: number } {
  if (fanEdge(seatX, seatY) !== 'bottom') {
    return fanGapLine(seatX, seatY, name, text, 1);
  }
  return {
    x: Math.round(seatX - plateWidth(name) / 2 - 8 - text.length * 8),
    y: seatY + 6,
  };
}

export function faceForBlackjackCard(cardId: string): CardFace | null {
  const rank = rankOfBlackjackCard(cardId);
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

function roundResults(state: BlackjackState): string[] {
  const results: string[] = [];
  for (const seat of Object.values(state.seats)) {
    for (const result of seat.results) {
      results.push(result);
    }
  }
  return results;
}

/**
 * End-of-round line from the subscribed state.
 * A seat in `winnerSeatIndexes` beat the dealer.
 * Push is a tie. Every hand lost is the dealer's round.
 */
export function finishedLine(
  state: BlackjackState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  if (state.winnerSeatIndexes.length === 0) {
    const results = roundResults(state);
    if (results.some((result) => result === 'push')) {
      return 'Push';
    }
    if (results.length > 0 && results.every((result) => result === 'lose')) {
      return 'Dealer';
    }
    return null;
  }
  const parts: string[] = [];
  for (const seatIndex of state.winnerSeatIndexes) {
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    parts.push(
      name.length > 0 ? `seat ${seatIndex} ${name}` : `seat ${seatIndex}`,
    );
  }
  const label = state.winnerSeatIndexes.length === 1 ? 'Winner' : 'Winners';
  return `${label} ${parts.join(', ')}`;
}
