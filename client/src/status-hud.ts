import {
  BLUFF_RANK_NAMES,
  type BluffPhase,
  type BluffState,
} from '../../src/shared/games/bluff';
import {
  CRAZY_EIGHTS_SUIT_NAMES,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights';
import type { GoFishPhase, GoFishState } from '../../src/shared/games/go-fish';
import type { PresidentState } from '../../src/shared/games/president';
import type { RummyPhase, RummyState } from '../../src/shared/games/rummy';
import type { BlackjackState } from '../../src/shared/games/blackjack';
import type { SpadesState } from '../../src/shared/games/spades';
import {
  passDirection,
  type HeartsPhase,
  type HeartsState,
} from '../../src/shared/games/hearts';
import {
  POKER_VARIATION_LABELS,
  type PokerState,
} from '../../src/shared/games/poker';

import { isMobileDevice } from './mobile-shell';
const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();
export const STATUS_HUD = {
  x: PHONE_LAYOUT ? 632 : 652,
  y: 16,
  w: PHONE_LAYOUT ? 260 : 240,
  h: PHONE_LAYOUT ? 44 : 52,
} as const;
export const STATUS_FONT_SIZE = PHONE_LAYOUT ? 10 : 8;
export const STATUS_LINE_HEIGHT = 12;

const NAME_MAX = 14;

const PHASE_LABELS = {
  lobby: 'Waiting',
  play: 'Play',
  finished: 'Finished',
} as const satisfies Record<BluffPhase, string>;

export interface StatusHudLines {
  turn: string;
  phase: string;
  round: string;
}

function shortName(name: string): string {
  if (name.length <= NAME_MAX) {
    return name;
  }
  return name.slice(0, NAME_MAX);
}

/**
 * Status lines from the subscribed Bluff `stateJson`.
 * `turnSeatIndex` names the player, `phase` is the label, and the round is the
 * rank the lead called. `Call` means the lead has not called yet.
 */
export function bluffStatusHud(
  state: BluffState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  let round = '-';
  if (state.phase !== 'lobby') {
    round =
      state.requiredRank === null
        ? 'Call'
        : BLUFF_RANK_NAMES[state.requiredRank];
  }
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${PHASE_LABELS[state.phase]}`,
    round: `Round: ${round}`,
  };
}

/**
 * Status lines from the subscribed President `stateJson`.
 * The round is the trick to beat, or President's title once the hand ends.
 */
export function presidentStatusHud(
  state: PresidentState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  let round = '-';
  if (state.phase === 'finished') {
    round = state.rankOrder[0]?.title ?? 'Done';
  } else if (state.phase === 'play') {
    if (state.currentCount > 0 && state.currentRank !== null) {
      round = `${state.currentCount}x${state.currentRank}`;
    } else {
      round = 'Lead';
    }
  }
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${PHASE_LABELS[state.phase]}`,
    round: `Round: ${round}`,
  };
}

const GO_FISH_PHASE_LABELS = {
  lobby: 'Waiting',
  play: 'Play',
  finished: 'Finished',
} as const satisfies Record<GoFishPhase, string>;

/**
 * Status lines from the subscribed Go Fish `stateJson`.
 * The third line is the book count, in the same HUD slot Bluff uses for the round.
 */
export function goFishStatusHud(
  state: GoFishState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  let books = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    books = String(state.books[String(state.turnSeatIndex)]?.length ?? 0);
  } else if (state.phase === 'finished') {
    books =
      state.winnerSeatIndex === null
        ? 'tie'
        : String(state.books[String(state.winnerSeatIndex)]?.length ?? 0);
  }
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${GO_FISH_PHASE_LABELS[state.phase]}`,
    round: `${state.phase === 'finished' && state.winnerSeatIndex !== null ? 'Winning books' : 'Books'}: ${books}`,
  };
}

/**
 * The same three HUD lines for Crazy Eights.
 * The third line is the suit in play, or the winner's score when the hand ends.
 */
export function crazyEightsStatusHud(
  state: CrazyEightsState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  const phase =
    state.phase === 'lobby'
      ? 'Waiting'
      : state.phase === 'play'
        ? 'Play'
        : 'Finished';
  let round = 'Suit: -';
  if (state.phase === 'play') {
    round =
      state.currentSuit === null
        ? 'Suit: pick'
        : `Suit: ${CRAZY_EIGHTS_SUIT_NAMES[state.currentSuit]}`;
  }
  if (state.phase === 'finished' && state.winnerSeatIndex !== null) {
    const score = state.scores[String(state.winnerSeatIndex)] ?? 0;
    round = `Score: ${score}`;
  }
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${phase}`,
    round,
  };
}

const RUMMY_PHASE_LABELS = {
  lobby: 'Waiting',
  play: 'Play',
  finished: 'Finished',
} as const satisfies Record<RummyPhase, string>;

/**
 * Status lines from the subscribed Rummy `stateJson`.
 * The round line is the stock count, or the winner's deadwood once the hand ends.
 */
export function rummyStatusHud(
  state: RummyState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  let round = '-';
  if (state.phase === 'play') {
    round = `Stock ${state.stock.length}`;
  } else if (state.phase === 'finished') {
    const winner = state.winnerSeatIndex;
    const score = winner === null ? undefined : state.scores[String(winner)];
    if (score !== undefined) {
      round = `Deadwood ${score}`;
    }
  }
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${RUMMY_PHASE_LABELS[state.phase]}`,
    round: `Round: ${round}`,
  };
}

/**
 * Status lines from the subscribed Blackjack `stateJson`.
 * The same three HUD slots: whose bet or turn, the phase, and the round step.
 */
export function blackjackStatusHud(
  state: BlackjackState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  const phase =
    state.phase === 'lobby'
      ? 'Waiting'
      : state.phase === 'finished'
        ? 'Finished'
        : state.step === 'bet'
          ? 'Betting'
          : 'Play';
  const round =
    state.phase === 'lobby'
      ? '-'
      : state.phase === 'finished'
        ? 'Done'
        : state.step === 'bet'
          ? 'Bets'
          : 'Hand';
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${phase}`,
    round: `Round: ${round}`,
  };
}

/**
 * The same three HUD lines for Spades.
 * Turn is the seated name, phase is Bid, Play, or Finished, and the hand
 * number is the Spades hand. Partnership bids stay on the table.
 */
export function spadesStatusHud(
  state: SpadesState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  let phase = 'Waiting';
  if (state.phase === 'finished') {
    phase = 'Finished';
  } else if (state.phase === 'play' && state.stage === 'bid') {
    phase = 'Bid';
  } else if (state.phase === 'play') {
    phase = 'Play';
  }
  const round =
    state.phase === 'lobby' || state.handNumber < 1
      ? '-'
      : String(state.handNumber);
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${phase}`,
    round: `Hand: ${round}`,
  };
}

const HEARTS_PHASE_LABELS = {
  lobby: 'Waiting',
  pass: 'Passing',
  play: 'Play',
  finished: 'Finished',
} as const satisfies Record<HeartsPhase, string>;

const PASS_ROUND = {
  left: 'Left',
  right: 'Right',
  across: 'Across',
  hold: 'Hold',
} as const;

/**
 * Status lines from the subscribed Hearts `stateJson`.
 * The same three HUD rows: who acts, the phase, and the hand or pass direction.
 */
export function heartsStatusHud(
  state: HeartsState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'pass') {
    turn = 'Passing';
  } else if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : `Seat ${seatIndex}`;
  }
  const round =
    state.phase === 'lobby'
      ? '-'
      : state.phase === 'pass'
        ? PASS_ROUND[passDirection(state.handIndex)]
        : `Hand ${state.handIndex + 1}`;
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${HEARTS_PHASE_LABELS[state.phase]}`,
    round: `Round: ${round}`,
  };
}

const POKER_STREET_LABELS = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
} as const;

/**
 * Status lines from the subscribed Poker `stateJson`.
 * The same three HUD rows: who acts, the street, and the variation.
 */
export function pokerStatusHud(
  state: PokerState,
  seats: readonly { seatIndex: number; name: string }[],
): StatusHudLines {
  let turn = '-';
  if (state.phase === 'play' && state.turnSeatIndex !== null) {
    const seatIndex = state.turnSeatIndex;
    const seat = seats.find((row) => row.seatIndex === seatIndex);
    const name = seat?.name ?? '';
    turn = name.length > 0 ? shortName(name) : 'Player';
  }
  let phase = 'Waiting';
  if (state.phase === 'finished') {
    phase = state.end === 'showdown' ? 'Showdown' : 'Hand';
  } else if (state.phase === 'play' && state.step === 'discard') {
    phase = 'Discard';
  } else if (state.phase === 'play') {
    phase = POKER_STREET_LABELS[state.street];
  }
  const round =
    state.phase === 'lobby' ? '-' : POKER_VARIATION_LABELS[state.variation];
  return {
    turn: `Turn: ${turn}`,
    phase: `Phase: ${phase}`,
    round: `Round: ${round}`,
  };
}
