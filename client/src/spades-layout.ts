import type { SpadesState, SpadesTeam } from '../../src/shared/games/spades';
import { TABLE_CENTER } from './bluff-layout';
import { LOGICAL_WIDTH } from './sheets';

/**
 * Left of the felt. Each team gets a header row, a bid row and a score row,
 * with a chip beside the header and bid rows. `rows` are y offsets from `y`.
 */
export const PARTNERSHIP_BOARD = {
  x: 52,
  y: 146,
  chipX: 14,
  rows: [0, 20, 34, 48, 76, 90, 104],
  chipRows: [18, 74],
} as const;

export const BID_PROMPT = { x: 228, y: 396 } as const;

const BID_W = 32;
const BID_H = 28;
const BID_GAP = 36;
const BID_Y = 416;
const TRICK_PULL = 0.32;
const WON_PULL = 0.62;

export interface PartnershipBoard {
  trump: string;
  nsHead: string;
  nsBid: string;
  nsScore: string;
  ewHead: string;
  ewBid: string;
  ewScore: string;
}

/** The label drawn on the bid button for `tricks`. A bid of 0 is nil. */
export function bidButtonLabel(tricks: number): string {
  return tricks === 0 ? 'Nil' : String(tricks);
}

/** Which partnership a seat plays for. Seats 0 and 2 are NS, 1 and 3 are EW. */
export function seatTeam(seatIndex: number): SpadesTeam {
  return seatIndex % 2 === 0 ? 'ns' : 'ew';
}

export function bidButtonBox(tricks: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const span = 14 * BID_GAP;
  const start = Math.floor((LOGICAL_WIDTH - span) / 2);
  return {
    x: start + tricks * BID_GAP,
    y: BID_Y,
    w: BID_W,
    h: BID_H,
  };
}

/** A card in the current trick, pulled from the center toward that seat. */
export function trickPosition(
  seatX: number,
  seatY: number,
): { x: number; y: number } {
  return {
    x: Math.round(TABLE_CENTER.x + (seatX - TABLE_CENTER.x) * TRICK_PULL),
    y: Math.round(TABLE_CENTER.y + (seatY - TABLE_CENTER.y) * TRICK_PULL),
  };
}

/** A finished trick, fanned a little toward the seat that won it. */
export function wonTrickPosition(
  seatX: number,
  seatY: number,
  index: number,
): { x: number; y: number } {
  const originX = Math.round(
    TABLE_CENTER.x + (seatX - TABLE_CENTER.x) * WON_PULL,
  );
  const originY = Math.round(
    TABLE_CENTER.y + (seatY - TABLE_CENTER.y) * WON_PULL,
  );
  return { x: originX + index * 12, y: originY };
}

function teamSeats(state: SpadesState, team: SpadesTeam): number[] {
  const parity = team === 'ns' ? 0 : 1;
  const seats: number[] = [];
  for (const key of Object.keys(state.hands)) {
    const seat = Number(key);
    if (seat % 2 === parity) {
      seats.push(seat);
    }
  }
  seats.sort((a, b) => a - b);
  return seats;
}

function bidText(state: SpadesState, seats: readonly number[]): string {
  if (seats.length === 0) {
    return '-';
  }
  let known = 0;
  let missing = false;
  for (const seat of seats) {
    const bid = state.bids[String(seat)];
    if (typeof bid !== 'number') {
      missing = true;
    } else {
      known += bid;
    }
  }
  if (missing) {
    return known > 0 ? `${known}+` : '-';
  }
  return String(known);
}

function trickText(state: SpadesState, seats: readonly number[]): number {
  let total = 0;
  for (const seat of seats) {
    total += state.tricks[String(seat)] ?? 0;
  }
  return total;
}

function teamLines(
  team: SpadesTeam,
  state: SpadesState,
  meSeat: number | null,
): { head: string; bid: string; score: string } {
  const seats = teamSeats(state, team);
  const score = team === 'ns' ? state.scores.ns : state.scores.ew;
  const bags = team === 'ns' ? state.bags.ns : state.bags.ew;
  const mine = meSeat !== null && seatTeam(meSeat) === team;
  const label = team === 'ns' ? 'NS' : 'EW';
  return {
    head: mine ? `${label} (you)` : label,
    bid: `bid ${bidText(state, seats)} won ${trickText(state, seats)}`,
    score: `${score} bags ${bags}`,
  };
}

/**
 * Partnership bids, tricks taken, and the running score.
 * `meSeat` marks the viewer's own partnership.
 */
export function partnershipBoard(
  state: SpadesState,
  meSeat: number | null = null,
): PartnershipBoard {
  const ns = teamLines('ns', state, meSeat);
  const ew = teamLines('ew', state, meSeat);
  const trump =
    state.phase === 'lobby'
      ? ''
      : state.spadesBroken
        ? 'Spades broken'
        : 'Spades held';
  return {
    trump,
    nsHead: ns.head,
    nsBid: ns.bid,
    nsScore: ns.score,
    ewHead: ew.head,
    ewBid: ew.bid,
    ewScore: ew.score,
  };
}

/** One seat's own bid and tricks taken, drawn beside its name plate. */
export function seatBidText(state: SpadesState, seatIndex: number): string {
  const key = String(seatIndex);
  const bid = state.bids[key];
  const tricks = state.tricks[key] ?? 0;
  if (typeof bid !== 'number') {
    const bidding =
      state.phase === 'play' && state.stage === 'bid' && key in state.hands;
    return bidding && state.turnSeatIndex === seatIndex ? 'Bidding' : '';
  }
  const name = bid === 0 ? 'Nil' : `Bid ${bid}`;
  return `${name} took ${tricks}`;
}

export function legalCard(
  state: SpadesState,
  seatIndex: number | null,
  cardId: string,
): boolean {
  if (state.phase !== 'play' || state.stage !== 'trick' || seatIndex === null) {
    return false;
  }
  if (state.turnSeatIndex !== seatIndex) {
    return false;
  }
  const hand = state.hands[String(seatIndex)];
  return hand?.includes(cardId) ?? false;
}

/**
 * End-of-game line from the subscribed state.
 * The winner is a partnership, and the numbers are that hand's final scores.
 */
export function finishedLine(state: SpadesState): string | null {
  if (state.phase !== 'finished') {
    return null;
  }
  if (state.winnerTeam === 'ns') {
    return `NS wins ${state.scores.ns} to ${state.scores.ew}`;
  }
  if (state.winnerTeam === 'ew') {
    return `EW wins ${state.scores.ew} to ${state.scores.ns}`;
  }
  return 'Finished';
}
