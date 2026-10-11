import type { PresidentState } from '../../src/shared/games/president';

/** Bottom-right actions, same boxes as the shared table controls. */
export const PLAY_BUTTON = { x: 748, y: 448, w: 96, h: 28 } as const;
export const PASS_BUTTON = { x: 852, y: 448, w: 96, h: 28 } as const;

/** Rank order sits under Leave Table, clear of the hand and the status HUD. */
export const RANK_X = 16;
export const RANK_Y = 56;
export const RANK_STEP = 14;

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
    return name;
  }
  return `Seat ${seatIndex}`;
}

/** Finished titles and scores, or the seats that have already gone out. */
export function rankOrderLines(
  state: PresidentState,
  seats: readonly { seatIndex: number; name: string }[],
): string[] {
  if (state.phase === 'finished') {
    return state.rankOrder.map((entry) => {
      return `${entry.title} ${seatName(seats, entry.seat)} ${entry.score}`;
    });
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
