import type { CardFace } from './card-atlas';
import { rankOfPokerCard, type PokerState } from '../../src/shared/games/poker';
import { handPositions, opponentBackPositions } from './bluff-layout';

export const BOARD_Y = 188;
export const BOARD_STEP = 70;
export const POT_X = 480;
export const POT_Y = 272;
export const CARD_DRAW = 64;

export const FOLD_BUTTON = { x: 612, y: 448, w: 64, h: 28 } as const;
export const CHECK_BUTTON = { x: 682, y: 448, w: 72, h: 28 } as const;
export const CALL_BUTTON = { x: 760, y: 448, w: 64, h: 28 } as const;
export const BET_BUTTON = { x: 830, y: 448, w: 56, h: 28 } as const;
export const RAISE_BUTTON = { x: 892, y: 448, w: 60, h: 28 } as const;

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
