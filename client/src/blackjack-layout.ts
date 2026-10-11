import type { CardFace } from './card-atlas';
import {
  rankOfBlackjackCard,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { HAND_Y, TABLE_CENTER, handPositions } from './bluff-layout';

export const DEALER_X = 480;
export const DEALER_Y = 176;
export const CARD_DRAW = 64;

export const HIT_BUTTON = { x: 700, y: 448, w: 56, h: 28 } as const;
export const STAND_BUTTON = { x: 762, y: 448, w: 64, h: 28 } as const;
export const DOUBLE_BUTTON = { x: 832, y: 448, w: 64, h: 28 } as const;
export const SPLIT_BUTTON = { x: 902, y: 448, w: 52, h: 28 } as const;

export const BET_10_BUTTON = { x: 748, y: 448, w: 64, h: 28 } as const;
export const BET_25_BUTTON = { x: 818, y: 448, w: 64, h: 28 } as const;
export const BET_50_BUTTON = { x: 888, y: 448, w: 64, h: 28 } as const;

/** Dealer cards centered above the felt. The second card is the hole card. */
export function dealerPositions(count: number): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }
  const step = 36;
  const span = (count - 1) * step;
  const origin = DEALER_X - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: Math.round(origin + index * step), y: DEALER_Y });
  }
  return positions;
}

/** Cards fanned from a seat toward the middle of the table. */
export function seatHandPositions(
  seatX: number,
  seatY: number,
  count: number,
): { x: number; y: number }[] {
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const dist = 56 + index * 18;
    positions.push({
      x: Math.round(seatX + (dx / len) * dist),
      y: Math.round(seatY + (dy / len) * dist),
    });
  }
  return positions;
}

/**
 * Your cards use the shared bottom-hand row. Other seats fan toward center.
 * A split shifts the two hands apart.
 */
export function playerCardSlots(
  self: boolean,
  seatX: number,
  seatY: number,
  handCount: number,
  handIndex: number,
  cardCount: number,
): { x: number; y: number }[] {
  const shift = handCount <= 1 ? 0 : handIndex === 0 ? -140 : 140;
  if (self) {
    return handPositions(cardCount).map((slot) => ({
      x: slot.x + (handCount <= 1 ? 0 : shift),
      y: slot.y,
    }));
  }
  const side = handCount <= 1 ? 0 : handIndex === 0 ? -16 : 16;
  return seatHandPositions(seatX, seatY, cardCount).map((slot) => ({
    x: slot.x + side,
    y: slot.y,
  }));
}

/** Chip stack for the stake, beside your name or in front of another seat. */
export function betAnchor(
  seatX: number,
  seatY: number,
  self: boolean,
): { x: number; y: number } {
  if (self) {
    return { x: 400, y: HAND_Y - 52 };
  }
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: Math.round(seatX + (dx / len) * 36),
    y: Math.round(seatY + (dy / len) * 36 + 18),
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

/**
 * End-of-round line from the subscribed state.
 * A seat in `winnerSeatIndexes` beat the dealer. An empty list is a push.
 */
export function finishedLine(
  state: BlackjackState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  if (state.winnerSeatIndexes.length === 0) {
    return 'Push';
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
