import { BUTTON_HEIGHT } from './button-style';
import type { CardFace } from './card-atlas';
import { rankOfPokerCard, type PokerState } from '../../src/shared/games/poker';
import { handPositions, opponentBackPositions } from './bluff-layout';

export const BOARD_Y = 188;
export const BOARD_STEP = 70;
export const POT_X = 480;
export const POT_Y = 272;
export const CARD_DRAW = 64;
export const DROPPED_SCALE = 0.75;
export const DROPPED_Y = 516;
export const DROPPED_LABEL = { x: 772, y: 482 } as const;
const DROPPED_X = [800, 852] as const;
export const DISCARD_PROMPT = { x: 16, y: 452 } as const;
export const BANNER_Y = 312;

export const FOLD_BUTTON = { x: 612, y: 448, w: 64, h: BUTTON_HEIGHT } as const;
export const CHECK_BUTTON = {
  x: 682,
  y: 448,
  w: 72,
  h: BUTTON_HEIGHT,
} as const;
export const CALL_BUTTON = { x: 760, y: 448, w: 64, h: BUTTON_HEIGHT } as const;
export const BET_BUTTON = { x: 830, y: 448, w: 56, h: BUTTON_HEIGHT } as const;
export const RAISE_BUTTON = {
  x: 892,
  y: 448,
  w: 60,
  h: BUTTON_HEIGHT,
} as const;

/** Community cards in a row across the middle of the shared table. */
export function boardPositions(count: number): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }
  const span = (count - 1) * BOARD_STEP;
  const origin = 480 - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: Math.round(origin + index * BOARD_STEP), y: BOARD_Y });
  }
  return positions;
}

/** Your hole cards use the shared bottom-hand row. Other seats fan card backs inward. */
export function holePositions(
  self: boolean,
  seatX: number,
  seatY: number,
  count: number,
): { x: number; y: number }[] {
  if (self) {
    return handPositions(count);
  }
  return opponentBackPositions(seatX, seatY, count);
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
 * A fold names the only remaining seat. Showdown names every seat paid a pot.
 */
export function finishedLine(
  state: PokerState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  if (state.winnerSeatIndexes.length === 0) {
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

/** Chip count sits right of the shared seat plate so it never covers a hand. */
export function seatLabelOrigin(
  seatX: number,
  seatY: number,
  name: string,
): { x: number; y: number } {
  const width = Math.max(48, name.length * 8 + 16);
  return { x: seatX + width / 2 + 6, y: seatY + 6 };
}

/** Second line under the chip count: folded, all-in, street bet, or showdown hand. */
export function seatNote(state: PokerState, seatIndex: number): string | null {
  const row = state.seats[String(seatIndex)];
  if (!row) {
    return null;
  }
  if (row.folded) {
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
export function bannerX(text: string): number {
  return Math.max(280, Math.round(480 - (text.length * 8) / 2));
}
