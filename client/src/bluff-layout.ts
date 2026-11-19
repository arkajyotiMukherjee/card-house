import type { CardFace } from './card-atlas';
import {
  BLUFF_RANK_NAMES,
  BLUFF_RANKS,
  canFlushBluff,
  rankOfCard,
  type BluffRank,
  type BluffState,
} from '../../src/shared/games/bluff';
import { BUTTON_HEIGHT } from './button-style';
import { isMobileDevice } from './mobile-shell';

const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();
import {
  PICKER_LEFT,
  PICKER_RIGHT,
  PICKER_Y,
  TURN_LINE,
  actionBox,
} from './table-presentation';

export const HAND_LEFT = 16;
export const HAND_RIGHT = 736;
export const HAND_Y = 508;
export const CARD_DRAW = 64;
export const HOVER_LIFT = 20;
export const PILE_X = 480;
export const PILE_Y = 268;
/** Below top fans/nameplates; above the pile and all hand-card layers. */
export const WINNER_BANNER_Y = 190;
export const WINNER_BANNER_Z = 90;

export { TABLE_CENTER } from './table-presentation';

/** Play, Pass, and Challenge share the lower-right cluster. */
export const BLUFF_PLAY_BUTTON = actionBox(0);
export const BLUFF_PASS_BUTTON = actionBox(1);
export const BLUFF_CHALLENGE_BUTTON = actionBox(2);
export const BLUFF_TURN_LABEL = TURN_LINE;
export const BLUFF_RANK_HINT = 'Select a rank';
// The top opponent's card count occupies y=168 on both input layouts.
export const PROMPT_Y = 184;
export const PILE_NOTICE_Y = PILE_Y - CARD_DRAW / 2 - 28;

/** Unchosen rank buttons stay green. The chosen rank is filled gold. */
export const RANK_FILL = '#1b5c38';
export const RANK_FILL_CHOSEN = '#f4e4b3';
export const RANK_INK = '#f4e4b3';
export const RANK_INK_CHOSEN = '#1b5c38';

export function rankButtonColors(chosen: boolean): {
  fill: string;
  ink: string;
} {
  if (chosen) {
    return { fill: RANK_FILL_CHOSEN, ink: RANK_INK_CHOSEN };
  }
  return { fill: RANK_FILL, ink: RANK_INK };
}

export function rankHintPos(): { x: number; y: number } {
  if (PHONE_LAYOUT) return { x: 240, y: 200 };
  const width = BLUFF_RANK_HINT.length * 8;
  return {
    x: PICKER_RIGHT - width,
    y: PICKER_Y + Math.floor((BUTTON_HEIGHT - 8) / 2),
  };
}

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
  if (PHONE_LAYOUT) {
    return BLUFF_RANKS.map((rank, index) => ({
      rank,
      x: 240 + (index % 7) * 70,
      y: 222 + Math.floor(index / 7) * 70,
      w: 64,
      h: 64,
    }));
  }
  const span =
    BLUFF_RANKS.length * RANK_BUTTON_W +
    (BLUFF_RANKS.length - 1) * RANK_BUTTON_GAP;
  const band = PICKER_RIGHT - PICKER_LEFT;
  const start = PICKER_LEFT + Math.floor((band - span) / 2);
  return BLUFF_RANKS.map((rank, index) => ({
    rank,
    x: start + index * (RANK_BUTTON_W + RANK_BUTTON_GAP),
    y: PICKER_Y,
    w: RANK_BUTTON_W,
    h: BUTTON_HEIGHT,
  }));
}

/** Plural of a rank name. Six is the only name that takes "es". */
export function rankWord(rank: BluffRank, count: number): string {
  const name = BLUFF_RANK_NAMES[rank];
  if (count === 1) {
    return name;
  }
  if (name === 'Six') {
    return 'Sixes';
  }
  return `${name}s`;
}

/**
 * The center prompt names the called rank and does not fix a count.
 * `Call a rank` is only for the lead. Everyone else still sees the rank
 * once it has been called.
 */
export function tablePrompt(
  state: BluffState,
  seatIndex: number | null,
): string | null {
  if (state.phase !== 'play') {
    return null;
  }
  if (state.requiredRank === null) {
    if (seatIndex !== null && seatIndex === state.turnSeatIndex) {
      return 'Call a rank';
    }
    return null;
  }
  return `Play ${rankWord(state.requiredRank, 2)}`;
}

/** Side label. Only the seat that must act reads `Your turn`. */
export function turnLine(
  state: BluffState,
  seatIndex: number | null,
): 'Your turn' | 'Wait' {
  if (
    state.phase === 'play' &&
    seatIndex !== null &&
    state.turnSeatIndex === seatIndex
  ) {
    return 'Your turn';
  }
  return 'Wait';
}

const NOTICE_NAME_LIMIT = 16;

function noticeName(name: string, seatIndex: number): string {
  if (name.length === 0) {
    return `Seat ${seatIndex}`;
  }
  if (name.length <= NOTICE_NAME_LIMIT) {
    return name;
  }
  return name.slice(0, NOTICE_NAME_LIMIT);
}

/**
 * The claim above the pile: who played, how many, and the called rank.
 * The faces under that claim stay hidden.
 */
export function pileNotice(
  state: BluffState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'play' || state.lastPlay === null) {
    return null;
  }
  const last = state.lastPlay;
  const seat = seats.find((row) => row.seatIndex === last.seat);
  const name = noticeName(seat?.name ?? '', last.seat);
  const count = last.cards.length;
  return `${name} played ${count} ${rankWord(last.claimRank, count)}`;
}

const PILE_SHOWN = 8;
const PILE_STEP = 20;

export const HAND_PAGE_SIZE = 8;
export const HAND_PREV = { x: 12, y: 464, w: 76, h: 64 };
export const HAND_NEXT = { x: 668, y: 464, w: 76, h: 64 };

export function pagedHandPositions(count: number): { x: number; y: number }[] {
  const spacing = 64;
  const center = (HAND_LEFT + HAND_RIGHT) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: center + (index - (count - 1) / 2) * spacing,
    y: HAND_Y,
  }));
}

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

export function legalCard(
  state: BluffState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (!canPlay(state, seatIndex) || seatIndex === null) {
    return false;
  }
  const hand = state.hands[String(seatIndex)];
  return hand?.includes(cardId) ?? false;
}

function seatedHere(
  state: BluffState,
  seatIndex: number | null,
): seatIndex is number {
  return seatIndex !== null && String(seatIndex) in state.hands;
}

/** Your turn during play. The lead still sees Play before a rank is chosen. */
export function canPlay(state: BluffState, seatIndex: number | null): boolean {
  return (
    state.phase === 'play' &&
    seatedHere(state, seatIndex) &&
    state.turnSeatIndex === seatIndex &&
    !state.passed.includes(seatIndex)
  );
}

/** Pass is legal only after a rank has been called, and only on your turn. */
export function canPass(state: BluffState, seatIndex: number | null): boolean {
  return (
    canPlay(state, seatIndex) &&
    state.requiredRank !== null &&
    !canFlushBluff(state, seatIndex)
  );
}

/** A challenge judges someone else's latest play. */
export function canChallenge(
  state: BluffState,
  seatIndex: number | null,
): boolean {
  return (
    state.phase === 'play' &&
    seatedHere(state, seatIndex) &&
    state.lastPlay !== null &&
    state.lastPlay.seat !== seatIndex &&
    !canFlushBluff(state, state.turnSeatIndex)
  );
}

/** The rank picker is only for the lead, before any rank is called. */
export function showRankPicker(
  state: BluffState,
  seatIndex: number | null,
): boolean {
  return canPlay(state, seatIndex) && state.requiredRank === null;
}

/** Short line beside Play until the lead clicks a rank. */
export function leadRankHint(
  state: BluffState,
  seatIndex: number | null,
  rankChosen: boolean,
): string | null {
  if (!showRankPicker(state, seatIndex) || rankChosen) {
    return null;
  }
  return BLUFF_RANK_HINT;
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
    return `Winner is ${name}`;
  }
  return 'Winner';
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

/** Keep matching ranks together so a crowded hand can be scanned predictably. */
export function orderedBluffHand(cards: readonly string[]): string[] {
  const rankIndex = (card: string): number => {
    const rank = rankOfCard(card);
    return rank === null ? BLUFF_RANKS.length : BLUFF_RANKS.indexOf(rank);
  };
  return [...cards].sort(
    (a, b) => rankIndex(a) - rankIndex(b) || a.localeCompare(b),
  );
}
