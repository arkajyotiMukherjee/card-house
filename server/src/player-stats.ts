/**
 * Hands played and games won for one clientId.
 * A finished hand counts for every seat that was in it.
 * A game win counts for the winning seat or seats.
 * One-hand games award both on the same transition.
 */

export interface SeatStatCredit {
  seatIndex: number;
  handsPlayed: number;
  gamesWon: number;
}

export interface ClientStatTotals {
  handsPlayed: number;
  gamesWon: number;
}

const SINGLE_HAND_GAMES = new Set([
  'bluff',
  'president',
  'go_fish',
  'crazy_eights',
  'rummy',
]);

export function addSeatCredit(
  current: ClientStatTotals | undefined,
  credit: SeatStatCredit,
): ClientStatTotals {
  return {
    handsPlayed: (current?.handsPlayed ?? 0) + credit.handsPlayed,
    gamesWon: (current?.gamesWon ?? 0) + credit.gamesWon,
  };
}

/**
 * Seat credits for one accepted intent.
 * Games with no hand (dummy, stub) return none.
 */
export function seatStatCredits(
  gameType: string,
  before: unknown,
  after: unknown,
): SeatStatCredit[] {
  if (SINGLE_HAND_GAMES.has(gameType)) {
    return finishedHand(before, after, 'hands', 'winnerSeatIndex');
  }
  if (gameType === 'blackjack' || gameType === 'poker') {
    return finishedHand(before, after, 'seats', 'winnerSeatIndexes');
  }
  if (gameType === 'hearts') {
    return heartsCredits(before, after);
  }
  if (gameType === 'spades') {
    return spadesCredits(before, after);
  }
  return [];
}

function heartsCredits(before: unknown, after: unknown): SeatStatCredit[] {
  const finished = finishedHand(before, after, 'hands', 'winnerSeatIndex');
  if (finished.length > 0) {
    return finished;
  }
  return advancedHand(before, after, 'hands', 'handIndex');
}

function spadesCredits(before: unknown, after: unknown): SeatStatCredit[] {
  const prev = asRecord(before);
  const next = asRecord(after);
  if (!prev || !next) {
    return [];
  }
  if (phaseOf(prev) !== 'finished' && phaseOf(next) === 'finished') {
    const seats = keyedSeats(prev, 'hands');
    return creditsFor(seats, spadesWinners(next, seats));
  }
  return advancedHand(before, after, 'hands', 'handNumber');
}

function finishedHand(
  before: unknown,
  after: unknown,
  handsKey: string,
  winnerKey: string,
): SeatStatCredit[] {
  const prev = asRecord(before);
  const next = asRecord(after);
  if (!prev || !next) {
    return [];
  }
  if (phaseOf(prev) === 'finished' || phaseOf(next) !== 'finished') {
    return [];
  }
  return creditsFor(keyedSeats(prev, handsKey), winnerSeats(next, winnerKey));
}

function advancedHand(
  before: unknown,
  after: unknown,
  handsKey: string,
  markerKey: string,
): SeatStatCredit[] {
  const prev = asRecord(before);
  const next = asRecord(after);
  if (!prev || !next) {
    return [];
  }
  if (phaseOf(next) === 'finished' || phaseOf(prev) === 'finished') {
    return [];
  }
  const previous = countField(prev, markerKey);
  const following = countField(next, markerKey);
  if (previous === null || following === null || previous === following) {
    return [];
  }
  return creditsFor(keyedSeats(prev, handsKey), []);
}

function creditsFor(
  participants: readonly number[],
  winners: readonly number[],
): SeatStatCredit[] {
  const played = new Set(participants);
  const won = new Set(winners);
  const seats = [...played, ...won].filter(
    (seat, index, all) => all.indexOf(seat) === index,
  );
  seats.sort((a, b) => a - b);
  const credits: SeatStatCredit[] = [];
  for (const seatIndex of seats) {
    credits.push({
      seatIndex,
      handsPlayed: played.has(seatIndex) ? 1 : 0,
      gamesWon: won.has(seatIndex) ? 1 : 0,
    });
  }
  return credits;
}

/**
 * Even seats are north-south, matching `teamOf` in `src/shared/games/spades.ts`.
 */
function spadesWinners(
  state: Record<string, unknown>,
  seats: readonly number[],
): number[] {
  const team = state.winnerTeam;
  if (team !== 'ns' && team !== 'ew') {
    return [];
  }
  const parity = team === 'ns' ? 0 : 1;
  const winners: number[] = [];
  for (const seat of seats) {
    if (seat % 2 === parity) {
      winners.push(seat);
    }
  }
  return winners;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function phaseOf(state: Record<string, unknown>): string | null {
  return typeof state.phase === 'string' ? state.phase : null;
}

function isSeat(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function countField(
  state: Record<string, unknown>,
  key: string,
): number | null {
  const value = state[key];
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  return null;
}

function keyedSeats(state: Record<string, unknown>, key: string): number[] {
  const value = state[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  const seats: number[] = [];
  for (const name of Object.keys(value)) {
    if (!/^\d+$/.test(name)) {
      continue;
    }
    const seat = Number(name);
    if (isSeat(seat)) {
      seats.push(seat);
    }
  }
  seats.sort((a, b) => a - b);
  return seats;
}

function winnerSeats(state: Record<string, unknown>, key: string): number[] {
  const value = state[key];
  if (isSeat(value)) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const seats: number[] = [];
  for (const seat of value) {
    if (isSeat(seat)) {
      seats.push(seat);
    }
  }
  return seats;
}
