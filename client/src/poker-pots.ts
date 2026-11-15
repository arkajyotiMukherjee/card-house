import {
  pokerPotBreakdown,
  pokerPotWinners,
  type PokerState,
} from '../../src/shared/games/poker';

export interface PokerPotEntry {
  key: string;
  title: string;
  amount: number;
  eligible: number[];
  winners: number[];
  pending: boolean;
}
export function pokerPotEntries(state: PokerState): PokerPotEntry[] {
  const breakdown = pokerPotBreakdown(state);
  const pots = state.phase === 'finished' ? state.pots : breakdown.pots;
  const result = pots.map((pot, index) => ({
    key: `pot-${index}`,
    title: index === 0 ? 'Main pot' : `Side pot ${index}`,
    amount: pot.amount,
    eligible: pot.eligible,
    winners: state.phase === 'finished' ? pokerPotWinners(state, pot) : [],
    pending: false,
  }));
  const allIn = Object.values(state.seats).some(
    (seat) => seat.allIn && !seat.folded,
  );
  if (state.phase !== 'finished' && allIn && breakdown.unmatched) {
    const canMatch = state.order.some(
      (index) =>
        index !== breakdown.unmatched!.seat &&
        !state.seats[String(index)].folded &&
        !state.seats[String(index)].allIn &&
        state.seats[String(index)].chips > 0,
    );
    result.push({
      key: 'unmatched',
      title: canMatch ? 'Awaiting calls' : 'Uncalled',
      amount: breakdown.unmatched.amount,
      eligible: [breakdown.unmatched.seat],
      winners: [],
      pending: true,
    });
  }
  return result;
}
export function hasPokerPotLayers(state: PokerState): boolean {
  return pokerPotEntries(state).length > 1;
}
/** Keep the main pot visible; browse bounded side-pot groups at the same readable size. */
export function pokerPotPage(
  entries: readonly PokerPotEntry[],
  page: number,
): {
  shown: PokerPotEntry[];
  pages: number;
  page: number;
  columns: number;
} {
  const columns = entries.some((entry) => entry.amount > 9999) ? 2 : 3;
  const sideSlots = columns - 1;
  const pages = Math.max(1, Math.ceil((entries.length - 1) / sideSlots));
  const current = Math.min(Math.max(0, page), pages - 1);
  return {
    shown: entries.length
      ? [
          entries[0],
          ...entries.slice(
            1 + current * sideSlots,
            1 + (current + 1) * sideSlots,
          ),
        ]
      : [],
    pages,
    page: current,
    columns,
  };
}
