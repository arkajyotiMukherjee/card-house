import {
  BLUFF_RANKS,
  type BluffPhase,
  type BluffState,
} from '../../src/shared/games/bluff';
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
