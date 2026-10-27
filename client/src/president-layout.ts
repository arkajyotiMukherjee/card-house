import {
  PRESIDENT_RANKS,
  type PresidentRank,
  type PresidentState,
} from '../../src/shared/games/president';
import { actionBox } from './table-presentation';

/** Play and Pass in the shared cluster. */
export const PLAY_BUTTON = actionBox(0);
export const PASS_BUTTON = actionBox(1);

/** Finish order sits under Leave Table, clear of the hand and the status HUD. */
export const RANK_X = 16;
export const RANK_Y = 56;
export const RANK_STEP = 14;

/** Press Start 2P at 8px is 8px per column. */
const GLYPH = 8;

/**
 * Longest finish-order line. 22 columns end at x 192, left of the seat plate
 * at the upper-left anchor.
 */
const RANK_LINE_MAX = 22;
const NAME_MAX = 10;

/** Card strength strip under the play pile, low to high. */
export const STRENGTH_Y = 312;
export const STRENGTH_CAPTION_Y = 326;

export interface StrengthSlot {
  rank: PresidentRank;
  x: number;
  /** True for the rank the next play must beat. */
  current: boolean;
}

/**
 * Where each rank of the strength strip is drawn, centered on `centerX`.
 * Ranks are one space apart, and `10` is two glyphs wide.
 */
export function strengthSlots(
  centerX: number,
  currentRank: PresidentRank | null,
): StrengthSlot[] {
  let columns = PRESIDENT_RANKS.length - 1;
  for (const rank of PRESIDENT_RANKS) {
    columns += rank.length;
  }
  const slots: StrengthSlot[] = [];
  let x = Math.round(centerX - (columns * GLYPH) / 2);
  for (const rank of PRESIDENT_RANKS) {
    slots.push({ rank, x, current: rank === currentRank });
    x += (rank.length + 1) * GLYPH;
  }
  return slots;
}

export function legalCard(
  state: PresidentState,
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

export function requirementLine(state: PresidentState): string {
  if (state.phase !== 'play') {
    return '';
  }
  if (
    state.openingLead &&
    (state.currentCount === 0 || state.currentRank === null)
  ) {
    return 'Lead 3C';
  }
  if (state.currentCount === 0 || state.currentRank === null) {
    return 'Your lead';
  }
  return `Beat ${state.currentCount} ${state.currentRank}`;
}

function seatName(
  seats: readonly { seatIndex: number; name: string }[],
  seatIndex: number,
): string {
  const seat = seats.find((row) => row.seatIndex === seatIndex);
  const name = seat?.name ?? '';
  if (name.length > 0) {
    return name.slice(0, NAME_MAX);
  }
  return `Seat ${seatIndex}`;
}

/** Finished titles and scores, or the seats that have already gone out. */
export function rankOrderLines(
  state: PresidentState,
  seats: readonly { seatIndex: number; name: string }[],
): string[] {
  if (state.phase === 'finished') {
    const lines = ['Final'];
    for (const entry of state.rankOrder) {
      lines.push(
        `${entry.title} ${seatName(seats, entry.seat)} ${entry.score}`.slice(
          0,
          RANK_LINE_MAX,
        ),
      );
    }
    return lines;
  }
  if (state.finishOrder.length === 0) {
    return [];
  }
  const lines = ['Out'];
  for (let index = 0; index < state.finishOrder.length; index += 1) {
    const seatIndex = state.finishOrder[index];
    if (seatIndex === undefined) {
      continue;
    }
    lines.push(`${index + 1} ${seatName(seats, seatIndex)}`);
  }
  return lines;
}

/**
 * End-of-game line from the subscribed rank order.
 * The first entry is President.
 */
export function finishedLine(
  state: PresidentState,
  seats: readonly { seatIndex: number; name: string }[],
): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  const top = state.rankOrder[0];
  if (!top) {
    return 'Finished';
  }
  const name = seats.find((row) => row.seatIndex === top.seat)?.name ?? '';
  if (name.length > 0) {
    return `${top.title} ${name}`;
  }
  return `${top.title} seat ${top.seat}`;
}
