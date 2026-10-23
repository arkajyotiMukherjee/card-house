/** Two is low and the ace is high. `10` stays one rank. */
const LOW_RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;

export function seatIndexes(record: object): number[] {
  const seats: number[] = [];
  for (const key of Object.keys(record)) {
    if (!/^\d+$/.test(key)) {
      continue;
    }
    seats.push(Number(key));
  }
  seats.sort((a, b) => a - b);
  return seats;
}

export function rankValue(card: string): number {
  const rank = card.slice(0, -1);
  const index = LOW_RANKS.indexOf(rank as (typeof LOW_RANKS)[number]);
  return index < 0 ? LOW_RANKS.length : index;
}

/** Lower rank first. Equal ranks use the card id, so `2C` beats `2D`. */
export function byLowestCard(left: string, right: string): number {
  const delta = rankValue(left) - rankValue(right);
  if (delta !== 0) {
    return delta;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function lowestCard(cards: readonly string[]): string {
  const first = cards[0];
  if (first === undefined) {
    throw new Error('No card');
  }
  let best = first;
  for (let index = 1; index < cards.length; index += 1) {
    const card = cards[index];
    if (card !== undefined && byLowestCard(card, best) < 0) {
      best = card;
    }
  }
  return best;
}

/** The seat whose turn it is, then every other seat that still owes a choice. */
export function turnThen(
  turnSeatIndex: number | null,
  pending: readonly number[],
): number[] {
  if (turnSeatIndex !== null && pending.includes(turnSeatIndex)) {
    return [turnSeatIndex, ...pending.filter((seat) => seat !== turnSeatIndex)];
  }
  return pending.slice();
}
