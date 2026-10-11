import {
  canPassCard,
  canPlayCard,
  isPointCard,
  passDirection,
  type HeartsState,
} from '../../src/shared/games/hearts';
import {
  CARD_DRAW,
  HAND_LEFT,
  HAND_Y,
  TABLE_CENTER,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
} from './bluff-layout';

export {
  CARD_DRAW,
  HAND_Y,
  TABLE_CENTER,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
};

export const PASS_BUTTON = { x: 748, y: 448, w: 96, h: 28 } as const;
export const PLAY_BUTTON = { x: 852, y: 448, w: 96, h: 28 } as const;

const PENALTY_STEP = 18;

/** Hearts and the queen of spades, in the order they were taken. */
export function pointCards(cards: readonly string[]): string[] {
  const points: string[] = [];
  for (const card of cards) {
    if (isPointCard(card)) {
      points.push(card);
    }
  }
  return points;
}

/** A played card, in from the seat toward the middle of the table. */
export function trickPosition(
  seatX: number,
  seatY: number,
): { x: number; y: number } {
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const dist = Math.round(len * 0.62);
  return {
    x: Math.round(seatX + (dx / len) * dist),
    y: Math.round(seatY + (dy / len) * dist),
  };
}

/** Taken hearts and the queen, beside a seat and above your own hand. */
export function penaltyPositions(
  count: number,
  seatX: number,
  seatY: number,
  self: boolean,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const y = self ? HAND_Y - 78 : seatY + 22;
  const origin = self
    ? HAND_LEFT + CARD_DRAW / 2
    : seatX - ((Math.max(count, 1) - 1) * PENALTY_STEP) / 2;
  for (let index = 0; index < count; index += 1) {
    positions.push({
      x: Math.round(origin + index * PENALTY_STEP),
      y,
    });
  }
  return positions;
}

export function legalCard(
  state: HeartsState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (seatIndex === null) {
    return false;
  }
  if (state.phase === 'pass') {
    return canPassCard(state, seatIndex, cardId);
  }
  return canPlayCard(state, seatIndex, cardId);
}

export function selectedCards(
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

export function passLabel(state: HeartsState): string {
  const direction = passDirection(state.handIndex);
  if (direction === 'left') {
    return 'Pass left';
  }
  if (direction === 'right') {
    return 'Pass right';
  }
  if (direction === 'across') {
    return 'Pass across';
  }
  return 'Hold';
}

/**
 * End-of-game line from the subscribed state.
 * The seat index is the rules winner, and the name is that seated player.
 */
export function finishedLine(
  state: HeartsState,
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
