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
} from './bluff-layout';
import { LOGICAL_WIDTH } from './sheets';
import {
  actionBox,
  fanCardRect,
  fanEdge,
  rectsOverlap,
  seatFan,
} from './table-presentation';

export {
  CARD_DRAW,
  HAND_Y,
  TABLE_CENTER,
  cardLift,
  faceForCard,
  handPositions,
};

export const PASS_BUTTON = actionBox(0);
export const PLAY_BUTTON = actionBox(1);

/** Only expose the action this seat can currently submit. */
export function heartsAction(
  state: HeartsState,
  seat: number | null,
): 'pass' | 'play' | null {
  if (seat === null || !state.hands[String(seat)]) return null;
  if (state.phase === 'pass' && state.passes[String(seat)] === undefined)
    return 'pass';
  if (state.phase === 'play' && state.turnSeatIndex === seat) return 'play';
  return null;
}

/** Explain the suit restriction that otherwise makes an invalid tap look ignored. */
export function playHint(state: HeartsState, seat: number | null): string {
  if (heartsAction(state, seat) !== 'play' || seat === null) return 'Wait';
  const hand = state.hands[String(seat)] ?? [];
  const legal = hand.filter((card) => canPlayCard(state, seat, card));
  if (legal.length === 1 && legal[0] === '2C') return 'Play 2C';
  const suit = state.currentTrick[0]?.card.slice(-1);
  const suits: Record<string, string> = {
    C: 'clubs',
    D: 'diamonds',
    H: 'hearts',
    S: 'spades',
  };
  if (suit && hand.some((card) => card.endsWith(suit)))
    return `Follow ${suits[suit]}`;
  if (
    legal.length > 0 &&
    hand.some(isPointCard) &&
    legal.every((card) => !isPointCard(card))
  )
    return 'No point cards';
  if (!suit && !state.heartsBroken && hand.some((card) => !card.endsWith('H')))
    return 'Lead non-heart';
  return 'Your play';
}

const PENALTY_STEP = 18;
const PENALTY_LANE = 66;
const PENALTY_SIDE_GAP = 84;
const PENALTY_EDGE = 32;
const BACKS_FULL_HAND = 13;
const TRICK_PULL = 0.46;

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

function cardBox(x: number, y: number): CardRect {
  return {
    x: x - CARD_DRAW / 2,
    y: y - CARD_DRAW / 2,
    w: CARD_DRAW,
    h: CARD_DRAW,
  };
}

interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function missesFan(seatX: number, seatY: number, rect: CardRect): boolean {
  if (fanEdge(seatX, seatY) === 'bottom') {
    return true;
  }
  const fan = seatFan(seatX, seatY, BACKS_FULL_HAND, 'Seat');
  return fan.every((card) => !rectsOverlap(rect, fanCardRect(card)));
}

/**
 * A played card, in from the seat toward the middle of the table.
 * It sits past that seat's rail fan, so a played card never lands on
 * the hand it came from. The local seat uses a shorter pull.
 */
export function trickPosition(
  seatX: number,
  seatY: number,
): { x: number; y: number } {
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const local = fanEdge(seatX, seatY) === 'bottom';
  let dist = Math.round(len * (local ? 0.42 : TRICK_PULL));
  if (!local) {
    for (let step = dist; step <= len * 0.7; step += 4) {
      const x = Math.round(seatX + (dx / len) * step);
      const y = Math.round(seatY + (dy / len) * step);
      if (missesFan(seatX, seatY, cardBox(x, y))) {
        dist = step;
        break;
      }
    }
  }
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
  const beside = laneY < PENALTY_EDGE;
  const half = ((Math.max(count, 1) - 1) * PENALTY_STEP) / 2;
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  for (let step = 0; step <= 220; step += 10) {
    const shiftX = (dx / len) * step;
    const shiftY = (dy / len) * step;
    const row: { x: number; y: number }[] = [];
    if (!beside) {
      const limit = LOGICAL_WIDTH - PENALTY_EDGE - half;
      const origin =
        Math.min(Math.max(seatX + shiftX, PENALTY_EDGE + half), limit) - half;
      const y = laneY + shiftY;
      for (let index = 0; index < count; index += 1) {
        row.push({
          x: Math.round(origin + index * PENALTY_STEP),
          y: Math.round(y),
        });
      }
    } else {
      for (let index = 0; index < count; index += 1) {
        row.push({
          x: Math.round(
            seatX - PENALTY_SIDE_GAP - index * PENALTY_STEP + shiftX,
          ),
          y: Math.round(seatY + 10 + shiftY),
        });
      }
    }
    const onScreen = row.every(
      (slot) =>
        slot.x - CARD_DRAW / 2 >= 0 &&
        slot.x + CARD_DRAW / 2 <= LOGICAL_WIDTH &&
        slot.y - CARD_DRAW / 2 >= 0 &&
        slot.y + CARD_DRAW / 2 <= 540,
    );
    const clear =
      onScreen &&
      row.every((slot) => missesFan(seatX, seatY, cardBox(slot.x, slot.y)));
    if (clear) {
      return row;
    }
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
