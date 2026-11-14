import { readPokerState } from '../../src/shared/games/poker.ts';

/** A cash-game hand can finish even though the table remains open for another hand. */
export function pokerHandFinished(state: unknown): boolean {
  try {
    return readPokerState(state).phase === 'finished';
  } catch {
    return false;
  }
}

/** Fewer than two funded players means there can be no next hand. */
export function pokerSessionFinished(state: unknown): boolean {
  try {
    const poker = readPokerState(state);
    return (
      poker.phase === 'finished' &&
      poker.order.filter(
        (index) => (poker.seats[String(index)]?.chips ?? 0) > 0,
      ).length < 2
    );
  } catch {
    return false;
  }
}
