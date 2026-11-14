import { handPoints } from '../../src/shared/games/crazy-eights.ts';

export function paidGameWinners(
  gameType: string,
  state: unknown,
  participants: readonly number[],
): number[] {
  if (typeof state !== 'object' || state === null) return [];
  const record = state as Record<string, unknown>;
  if (record.phase !== 'finished') return [];
  if (gameType === 'spades') {
    const parity =
      record.winnerTeam === 'ns' ? 0 : record.winnerTeam === 'ew' ? 1 : -1;
    return participants.filter((seat) => seat % 2 === parity);
  }
  if (
    gameType === 'go_fish' &&
    record.books &&
    typeof record.books === 'object'
  ) {
    const books = record.books as Record<string, unknown[]>;
    const best = Math.max(
      ...participants.map((seat) => books[String(seat)]?.length ?? 0),
    );
    return participants.filter(
      (seat) => (books[String(seat)]?.length ?? 0) === best,
    );
  }
  if (
    gameType === 'crazy_eights' &&
    record.hands &&
    typeof record.hands === 'object'
  ) {
    const hands = record.hands as Record<string, string[]>;
    const best = Math.min(
      ...participants.map((seat) => handPoints(hands[String(seat)] ?? [])),
    );
    return participants.filter(
      (seat) => handPoints(hands[String(seat)] ?? []) === best,
    );
  }
  if (
    (gameType === 'hearts' || gameType === 'rummy') &&
    record.scores &&
    typeof record.scores === 'object'
  ) {
    const scores = record.scores as Record<string, number>;
    const best = Math.min(
      ...participants.map((seat) => scores[String(seat)] ?? Infinity),
    );
    return participants.filter((seat) => scores[String(seat)] === best);
  }
  const candidates = Array.isArray(record.winnerSeatIndexes)
    ? record.winnerSeatIndexes
    : [record.winnerSeatIndex];
  return participants.filter((seat) => candidates.includes(seat));
}
