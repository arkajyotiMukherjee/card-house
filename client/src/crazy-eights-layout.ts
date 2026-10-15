import { BUTTON_HEIGHT } from './button-style';
import {
  CARD_DRAW,
  CHALLENGE_BUTTON,
  HAND_Y,
  PILE_X,
  PILE_Y,
  PLAY_BUTTON,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
  pilePositions,
} from './bluff-layout';
import {
  CRAZY_EIGHTS_SUIT_NAMES,
  cardIsPlayable,
  rankOfCard,
  seatMustPass,
  type CrazyEightsState,
  type CrazyEightsSuit,
} from '../../src/shared/games/crazy-eights';

export {
  CARD_DRAW,
  HAND_Y,
  PILE_X,
  PILE_Y,
  PLAY_BUTTON,
  cardLift,
  faceForCard,
  handPositions,
  opponentBackPositions,
  pilePositions,
};

/** Draw sits in the same action slot Bluff uses for Challenge. */
export const DRAW_BUTTON = CHALLENGE_BUTTON;

export const SUIT_BUTTON_Y = 412;
export const SUIT_BUTTON_W = 64;
export const SUIT_BUTTON_H = BUTTON_HEIGHT;

export const SUIT_BUTTONS = [
  { suit: 'S', label: 'Spade', x: 688 },
  { suit: 'H', label: 'Heart', x: 756 },
  { suit: 'D', label: 'Diam', x: 824 },
  { suit: 'C', label: 'Club', x: 892 },
] as const satisfies readonly {
  suit: CrazyEightsSuit;
  label: string;
  x: number;
}[];

export const STOCK_X = PILE_X - 96;
export const STOCK_Y = PILE_Y;

const STOCK_SHOWN = 3;

/** Off-canvas row for the suit buttons while no eight is selected. */
export const SUIT_BUTTONS_HIDDEN_Y = -200;

export function stockPositions(count: number): { x: number; y: number }[] {
  const shown = Math.min(count, STOCK_SHOWN);
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    positions.push({ x: STOCK_X + index * 2, y: STOCK_Y });
  }
  return positions;
}

export function legalCard(
  state: CrazyEightsState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (state.phase !== 'play' || seatIndex === null) {
    return false;
  }
  if (state.turnSeatIndex !== seatIndex) {
    return false;
  }
  const hand = state.hands[String(seatIndex)];
  if (!hand?.includes(cardId)) {
    return false;
  }
  return cardIsPlayable(state, cardId);
}

/** The Draw button sends a pass when that is the only legal move. */
export function passInsteadOfDraw(
  state: CrazyEightsState,
  seatIndex: number | null,
): boolean {
  if (seatIndex === null || state.turnSeatIndex !== seatIndex) {
    return false;
  }
  return seatMustPass(state, seatIndex);
}

/** Discards fanned face up. The stock sits to the left, so keep the fan short. */
export const DISCARD_SHOWN = 3;

export function discardPositions(count: number): { x: number; y: number }[] {
  return pilePositions(Math.min(count, DISCARD_SHOWN));
}

/**
 * The badge over the discard. A wild eight says so and names the suit chosen
 * for it. `suit` is null while a starter eight has no suit, so any card plays.
 */
export function suitBadge(state: CrazyEightsState): {
  text: string;
  suit: CrazyEightsSuit | null;
} {
  if (state.currentSuit === null) {
    return { text: 'Wild 8: any suit', suit: null };
  }
  const name = CRAZY_EIGHTS_SUIT_NAMES[state.currentSuit];
  return {
    text: topIsWildEight(state) ? `Wild 8: ${name}` : `Suit: ${name}`,
    suit: state.currentSuit,
  };
}

/** The top discard is an eight, so the named suit can differ from the card. */
export function topIsWildEight(state: CrazyEightsState): boolean {
  const top = state.discardPile.at(-1);
  return top !== undefined && rankOfCard(top) === '8';
}

/**
 * End-of-game line from the subscribed state.
 * The seat index is the rules winner, and the score is that seat's award.
 */
export function finishedLine(
  state: CrazyEightsState,
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
  const score = state.scores[String(seatIndex)] ?? 0;
  if (name.length > 0) {
    return `Winner seat ${seatIndex} ${name} ${score}`;
  }
  return `Winner seat ${seatIndex} ${score}`;
}
