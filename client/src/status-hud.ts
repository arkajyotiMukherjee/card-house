import {
  BLUFF_RANKS,
  type BluffPhase,
  type BluffState,
} from '../../src/shared/games/bluff';
import {
  CRAZY_EIGHTS_SUIT_NAMES,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights';

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
