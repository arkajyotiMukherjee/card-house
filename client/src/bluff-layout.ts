import type { CardFace } from './card-atlas';
import {
  BLUFF_RANK_NAMES,
  BLUFF_RANKS,
  rankOfCard,
  type BluffRank,
  type BluffState,
} from '../../src/shared/games/bluff';
import { BUTTON_HEIGHT } from './button-style';
import { LOGICAL_WIDTH } from './sheets';

export const HAND_LEFT = 16;
export const HAND_RIGHT = 736;
export const HAND_Y = 508;
export const CARD_DRAW = 64;
export const HOVER_LIFT = 20;
export const PILE_X = 480;
export const PILE_Y = 268;
export const TABLE_CENTER = { x: 480, y: 270 } as const;

export const PLAY_BUTTON = { x: 748, y: 448, w: 96, h: BUTTON_HEIGHT } as const;
export const CHALLENGE_BUTTON = {
  x: 852,
  y: 448,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;
export const PASS_BUTTON = {
  x: 852,
  y: 412,
  w: 96,
  h: BUTTON_HEIGHT,
} as const;

const RANK_BUTTON_W = 32;
const RANK_BUTTON_GAP = 4;

/** One button per rank, used when the lead calls the rank for the round. */
export function rankCallButtons(): {
  rank: BluffRank;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  const span =
    BLUFF_RANKS.length * RANK_BUTTON_W +
    (BLUFF_RANKS.length - 1) * RANK_BUTTON_GAP;
  const start = Math.floor((LOGICAL_WIDTH - span) / 2);
  return BLUFF_RANKS.map((rank, index) => ({
    rank,
    x: start + index * (RANK_BUTTON_W + RANK_BUTTON_GAP),
    y: 368,
    w: RANK_BUTTON_W,
    h: BUTTON_HEIGHT,
  }));
}

/** The center prompt. A called four reads as the rank, and the count is one. */
export function tablePrompt(state: BluffState): string {
  if (state.requiredRank === null) {
    return 'Call a rank';
  }
  return `Play one ${BLUFF_RANK_NAMES[state.requiredRank]}`;
}

export function lastCallLine(state: BluffState): string | null {
  if (state.lastPlay === null) {
    return null;
  }
  return `Last ${BLUFF_RANK_NAMES[state.lastPlay.claimRank]}`;
}

const PILE_SHOWN = 8;
const PILE_STEP = 20;
const BACKS_SHOWN = 4;

export function handPositions(count: number): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }
  const width = HAND_RIGHT - HAND_LEFT;
  const step =
    count === 1
      ? 0
      : Math.min(CARD_DRAW, Math.floor((width - CARD_DRAW) / (count - 1)));
  const span = CARD_DRAW + step * (count - 1);
  const start = HAND_LEFT + Math.floor((width - span) / 2) + CARD_DRAW / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: start + index * step, y: HAND_Y });
  }
  return positions;
}

export function pilePositions(count: number): { x: number; y: number }[] {
  const shown = Math.min(count, PILE_SHOWN);
  if (shown <= 0) {
    return [];
  }
  const step = PILE_STEP;
  const span = (shown - 1) * step;
  const origin = PILE_X - span / 2;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    positions.push({ x: Math.round(origin + index * step), y: PILE_Y });
  }
  return positions;
}

/** Card backs fanned from a seat toward the middle of the table. */
export function opponentBackPositions(
  seatX: number,
  seatY: number,
  count: number,
): { x: number; y: number }[] {
  const shown = Math.min(count, BACKS_SHOWN);
  const dx = TABLE_CENTER.x - seatX;
  const dy = TABLE_CENTER.y - seatY;
  const len = Math.hypot(dx, dy) || 1;
  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < shown; index += 1) {
    const dist = 48 + index * 14;
    positions.push({
      x: Math.round(seatX + (dx / len) * dist),
      y: Math.round(seatY + (dy / len) * dist),
    });
  }
  return positions;
}

export function legalCard(
  state: BluffState,
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
  return hand?.includes(cardId) ?? false;
}

export function cardLift(options: {
  legal: boolean;
  hovered: boolean;
  selected: boolean;
}): number {
  if (!options.legal) {
    return 0;
  }
  if (options.selected || options.hovered) {
    return HOVER_LIFT;
  }
  return 0;
}

export function selectedPlayCards(
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

export function faceForCard(cardId: string): CardFace | null {
  const rank = rankOfCard(cardId);
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
 * End-of-game line from the subscribed state.
 * The seat index is the rules winner, and the name is that seated player.
 */
export function finishedLine(
  state: BluffState,
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

/** True when this pile card is one the local seat just played. */
export function pileFaceUp(
  state: BluffState,
  cardId: string,
  seatIndex: number | null,
): boolean {
  if (seatIndex === null || state.lastPlay === null) {
    return false;
  }
  if (state.lastPlay.seat !== seatIndex) {
    return false;
  }
  return state.lastPlay.cards.includes(cardId);
}
