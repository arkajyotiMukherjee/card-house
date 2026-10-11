import type { CardFace } from './card-atlas';
import {
  rankOfBlackjackCard,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { handPositions } from './bluff-layout';

export const DEALER_X = 480;
export const DEALER_Y = 200;
export const CARD_DRAW = 64;
/** Round result banner. It sits between the dealer row and the seats. */
export const BANNER_Y = 248;

const DEALER_STEP = 36;
const SEAT_HAND_DROP = 56;
const SEAT_HAND_STEP = 22;
const SPLIT_HAND_STEP = 12;
const SPLIT_SEAT_OFFSET = 56;
const SPLIT_SELF_OFFSET = 170;
const SPLIT_SELF_STEP = 36;
const PLATE_MIN_WIDTH = 48;
const CHIP_GAP = 22;

export const HIT_BUTTON = { x: 700, y: 448, w: 56, h: 28 } as const;
export const STAND_BUTTON = { x: 762, y: 448, w: 64, h: 28 } as const;
export const DOUBLE_BUTTON = { x: 832, y: 448, w: 64, h: 28 } as const;
export const SPLIT_BUTTON = { x: 902, y: 448, w: 52, h: 28 } as const;

export const BET_10_BUTTON = { x: 748, y: 448, w: 64, h: 28 } as const;
export const BET_25_BUTTON = { x: 818, y: 448, w: 64, h: 28 } as const;
export const BET_50_BUTTON = { x: 888, y: 448, w: 64, h: 28 } as const;

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
 * Your cards use the shared bottom-hand row. Other seats keep a row just under
 * their name plate, clear of the dealer row. A split sets the two hands apart.
 */
export function playerCardSlots(
  self: boolean,
  seatX: number,
  seatY: number,
  handCount: number,
  handIndex: number,
  cardCount: number,
): { x: number; y: number }[] {
  const split = handCount > 1;
  const sign = handIndex === 0 ? -1 : 1;
  if (self) {
    if (!split) {
      return handPositions(cardCount);
    }
    const slots = handPositions(1);
    return row(
      DEALER_X + sign * SPLIT_SELF_OFFSET,
      slots[0]?.y ?? seatY + 52,
      cardCount,
      SPLIT_SELF_STEP,
    );
  }
  if (!split) {
    return row(seatX, seatY + SEAT_HAND_DROP, cardCount, SEAT_HAND_STEP);
  }
  return row(
    seatX + sign * SPLIT_SEAT_OFFSET,
    seatY + SEAT_HAND_DROP,
    cardCount,
    SPLIT_HAND_STEP,
  );
}

/** Stake chips, just right of the seat name plate. */
export function betAnchor(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  return {
    x: Math.round(seatX + plateWidth(name) / 2 + CHIP_GAP),
    y: seatY + 2,
  };
}

/** Totals and result, written just left of the seat name plate. */
export function totalLabelPosition(
  seatX: number,
  seatY: number,
  name: string,
  text: string,
): { x: number; y: number } {
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
