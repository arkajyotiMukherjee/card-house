import {
  canPassCard,
  canPlayCard,
  isPointCard,
  passDirection,
  QUEEN_OF_SPADES,
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
import { LOGICAL_WIDTH } from './sheets';

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
const PENALTY_LANE = 66;
const PENALTY_SIDE_GAP = 84;
const PENALTY_EDGE = 32;
const TRICK_REACH = 0.78;
const BACKS_FULL_HAND = 13;

/**
 * Hearts in the order they were taken, then the queen of spades last.
 * Last is the top of the fan, so the queen is never half hidden.
 */
export function pointCards(cards: readonly string[]): string[] {
  const points: string[] = [];
  let queen = false;
  for (const card of cards) {
    if (card === QUEEN_OF_SPADES) {
      queen = true;
    } else if (isPointCard(card)) {
      points.push(card);
    }
  }
  if (queen) {
    points.push(QUEEN_OF_SPADES);
  }
  return points;
}

/**
 * A played card, in from the seat toward the middle of the table.
 * It sits past the fanned card backs of that seat, so a played card
 * never lands on the hand it came from.
 */
export function trickPosition(
  seatX: number,
  seatY: number,
): { x: number; y: number } {
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const lastBack = opponentBackPositions(seatX, seatY, BACKS_FULL_HAND).at(-1);
  const backsReach = lastBack
    ? Math.hypot(lastBack.x - seatX, lastBack.y - seatY)
    : 0;
  const along = Math.max(Math.abs(dx), Math.abs(dy)) / len;
  const clear = backsReach + CARD_DRAW / along;
  const dist = Math.round(Math.min(clear, len * TRICK_REACH));
  return {
    x: Math.round(seatX + (dx / len) * dist),
    y: Math.round(seatY + (dy / len) * dist),
  };
}

/**
 * Taken hearts and the queen. Your own sit above your hand. An opponent's
 * sit in a row on the side of the name plate away from the center, where
 * neither their card backs nor the trick are. A seat too close to the top
 * edge for that row gets it beside the plate instead.
 */
export function penaltyPositions(
  count: number,
  seatX: number,
  seatY: number,
  self: boolean,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  if (self) {
    const y = HAND_Y - 78;
    for (let index = 0; index < count; index += 1) {
      positions.push({
        x: HAND_LEFT + CARD_DRAW / 2 + index * PENALTY_STEP,
        y,
      });
    }
    return positions;
  }
  const centerIsBelow = TABLE_CENTER.y > seatY;
  const laneY = seatY + (centerIsBelow ? -PENALTY_LANE : PENALTY_LANE);
  if (laneY >= PENALTY_EDGE) {
    const half = ((Math.max(count, 1) - 1) * PENALTY_STEP) / 2;
    const limit = LOGICAL_WIDTH - PENALTY_EDGE - half;
    const origin = Math.min(Math.max(seatX, PENALTY_EDGE + half), limit) - half;
    for (let index = 0; index < count; index += 1) {
      positions.push({
        x: Math.round(origin + index * PENALTY_STEP),
        y: laneY,
      });
    }
    return positions;
  }
  for (let index = 0; index < count; index += 1) {
    positions.push({
      x: Math.round(seatX - PENALTY_SIDE_GAP - index * PENALTY_STEP),
      y: seatY + 10,
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
