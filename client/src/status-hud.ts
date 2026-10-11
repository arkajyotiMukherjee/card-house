import {
  BLUFF_RANKS,
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

export const STATUS_HUD = { x: 668, y: 16, w: 240, h: 52 } as const;

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
 * place of `requiredRank` in the Ace-to-King run. Bluff stores no other counter.
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
  const rankIndex = BLUFF_RANKS.indexOf(state.requiredRank);
  const round =
    state.phase === 'lobby'
      ? '-'
      : `${rankIndex + 1}/${BLUFF_RANKS.length} (${state.requiredRank})`;
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
    round: `Books: ${books}`,
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
      round = `Score ${score}`;
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

