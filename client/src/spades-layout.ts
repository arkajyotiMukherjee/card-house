import type { SpadesState, SpadesTeam } from '../../src/shared/games/spades';
import { TABLE_CENTER } from './bluff-layout';
import { BUTTON_HEIGHT } from './button-style';
import { isMobileDevice } from './mobile-shell';

const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();
import { TURN_LINE, actionBox } from './table-presentation';

/** Play sits in the shared cluster. Bids use the green band while it is hidden. */
export const PLAY_BUTTON = actionBox(0);

/** Keep both scores between the top hand and the center of the table. */
export function partnershipLinePosition(index: number): {
  x: number;
  y: number;
  size: number;
} {
  if (index === 0) return { x: 400, y: 376, size: 12 };
  const team = index < 4 ? 0 : 1;
  return { x: 240 + team * 312, y: 154 + ((index - 1) % 3) * 20, size: 12 };
}

export const BID_PROMPT = TURN_LINE;

const BID_W = 32;
const BID_H = BUTTON_HEIGHT;
const BID_GAP = 4;
const BIDS_PER_GROUP = 7;
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

/** Score change from the hand just completed, retained while the next bids. */
export function handResultLine(
  before: SpadesState | null,
  after: SpadesState,
): string | null {
  if (
    !before ||
    before.tableId !== after.tableId ||
    after.handNumber !== before.handNumber + 1
  ) {
    return null;
  }
  const delta = (value: number) => (value >= 0 ? `+${value}` : String(value));
  return `Hand ${before.handNumber}: NS ${delta(after.scores.ns - before.scores.ns)} / EW ${delta(after.scores.ew - before.scores.ew)}`;
}

/** Bids stay on the felt while the trick area is empty. */
export function bidButtonBox(tricks: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (PHONE_LAYOUT) {
    return {
      x: 240 + (tricks % 7) * 70,
      y: 222 + Math.floor(tricks / 7) * 70,
      w: 64,
      h: 64,
    };
  }
  const span = BIDS_PER_GROUP * 2 * (BID_W + BID_GAP) - BID_GAP;
  return {
    x: TABLE_CENTER.x - span / 2 + tricks * (BID_W + BID_GAP),
    y: 266,
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
