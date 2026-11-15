import {
  PRESIDENT_RANKS,
  presidentRankOf,
  type PresidentState,
} from '../../src/shared/games/president';

export const PRESIDENT_PUBLIC_SCALE = 1.4;
export const PRESIDENT_PILE = { x: 480, y: 334 };

/** Stable low-to-high ordering keeps pairs together across hand pages. */
export function orderedPresidentHand(hand: readonly string[]): string[] {
  return [...hand].sort((a, b) => {
    const rankA = presidentRankOf(a),
      rankB = presidentRankOf(b);
    const strength =
      (rankA ? PRESIDENT_RANKS.indexOf(rankA) : -1) -
      (rankB ? PRESIDENT_RANKS.indexOf(rankB) : -1);
    return strength || a.localeCompare(b);
  });
}

/** Only the latest combination is the target, not the entire trick history. */
export function presidentPublicCards(state: PresidentState): string[] {
  return state.phase === 'play' && state.currentRank !== null
    ? (state.lastPlay?.cards ?? [])
    : [];
}

export function presidentPublicPositions(
  count: number,
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    x: PRESIDENT_PILE.x + (index - (count - 1) / 2) * 72,
    y: PRESIDENT_PILE.y,
  }));
}

export function presidentRequirement(state: PresidentState): string {
  if (state.openingLead) return 'Opening lead · include 3♣';
  if (state.currentRank === null) return 'New lead';
  const kind =
    ['', 'single', 'pair', 'triple', 'four of a kind'][state.currentCount] ??
    'combination';
  return `Beat a ${kind} · ${state.currentRank}`;
}

export function presidentSeatStatus(
  state: PresidentState,
  seat: number,
): string {
  const rank = state.rankOrder.find((entry) => entry.seat === seat);
  if (rank) return rank.title;
  const place = state.finishOrder.indexOf(seat);
  if (place >= 0)
    return `${['1st', '2nd', '3rd'][place] ?? `${place + 1}th`} out`;
  return state.turnSeatIndex === seat ? 'To play' : '';
}
