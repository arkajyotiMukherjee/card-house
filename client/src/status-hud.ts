import {
  BLUFF_RANKS,
  type BluffPhase,
  type BluffState,
} from '../../src/shared/games/bluff';
import type { RummyPhase, RummyState } from '../../src/shared/games/rummy';

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
