import { readGoFishEventNote } from '../../src/shared/games/go-fish';
import { readHeartsEventNote } from '../../src/shared/games/hearts';
import { readPokerEventNote } from '../../src/shared/games/poker';
import type { SfxCue } from './sfx-cues';

export interface AudibleTableState {
  phase?: string;
  step?: string;
  stage?: string;
  end?: string;
  turnSeatIndex?: number | null;
  handNumber?: number;
  handIndex?: number;
  board?: string[];
  dealer?: string[];
  holeHidden?: boolean;
  seats?: Record<
    string,
    {
      chips?: number;
      bet?: number;
      committed?: number;
      hands?: { bet: number }[];
      insurance?: number;
      results?: string[];
    }
  >;
  books?: Record<string, unknown[]>;
  winnerSeatIndex?: number | null;
  winnerSeatIndexes?: number[];
  winnerTeam?: 'ns' | 'ew' | null;
}

export function readAudibleState(json: string): AudibleTableState | undefined {
  try {
    return JSON.parse(json) ?? undefined;
  } catch {
    return undefined;
  }
}

export function actionSounds(
  game: string,
  note: unknown,
  type: string,
): readonly SfxCue[] {
  if (game === 'go_fish') {
    const ask = readGoFishEventNote(note);
    if (ask?.given) return ['slide'];
    if (ask?.drawn) return ['deal'];
    return [];
  }
  if (game === 'hearts' && readHeartsEventNote(note)?.kind === 'moon')
    return ['gather'];
  const hearts = game === 'hearts' && readHeartsEventNote(note);
  if (hearts && hearts.kind === 'play' && hearts.trickWinner !== null)
    return ['slide', 'gather'];
  if (game === 'poker') {
    const poker = readPokerEventNote(note);
    if (poker?.kind === 'finished') {
      if (type === 'fold') return ['slide'];
    }
  }
  const kind = (note as { kind?: string } | null)?.kind ?? type;
  switch (kind) {
    case 'challenge':
      return ['flip', 'gather'];
    case 'draw':
    case 'hit':
      return ['deal'];
    case 'play':
    case 'pass':
    case 'fold':
    case 'discard':
    case 'surrender':
      return ['slide'];
    case 'trick':
      return ['slide', 'gather'];
    case 'flush':
    case 'meld':
    case 'layoff':
      return ['gather'];
    case 'split':
    case 'double':
      return ['chip_tap', 'deal'];
    case 'insurance':
      return (note as { take?: boolean } | null)?.take ? ['chip_tap'] : [];
    case 'even_money':
    case 'bet':
    case 'raise':
    case 'call':
      return ['chip_tap'];
    default:
      return [];
  }
}

export type ResultCue = 'win' | 'loss' | 'confirm';

function resultCue(profit: number): ResultCue {
  return profit > 0 ? 'win' : profit < 0 ? 'loss' : 'confirm';
}

export function settlementSound(
  summaryJson: string,
  memberId: string,
): ResultCue | 'chip_stack' | undefined {
  try {
    const summary = JSON.parse(summaryJson) as {
      walletId: string;
      profit: string;
    }[];
    const own = summary.find((row) => row.walletId === memberId);
    if (!own) return summary.length ? 'chip_stack' : undefined;
    const profit = Number(own.profit);
    if (Number.isFinite(profit)) return resultCue(profit);
  } catch {
    // Old or malformed rows may have no settlement details.
  }
}

export function unfundedResultSound(
  game: string,
  before: AudibleTableState,
  after: AudibleTableState,
  seat: number | undefined,
): ResultCue | undefined {
  if (seat === undefined) return;
  if (game === 'blackjack' || game === 'poker') {
    const previous = before.seats?.[seat];
    const own = after.seats?.[seat];
    if (previous?.chips === undefined || own?.chips === undefined) return;
    if (game === 'blackjack' && !own.results?.length) return;
    const wager = previous.hands?.length
      ? previous.hands.reduce((sum, hand) => sum + hand.bet, 0)
      : (previous.bet ?? 0);
    const committed = previous.committed ?? wager + (previous.insurance ?? 0);
    return resultCue(own.chips - previous.chips - committed);
  }
  if (game === 'spades') {
    if (!after.winnerTeam) return 'confirm';
    return seat % 2 === (after.winnerTeam === 'ns' ? 0 : 1) ? 'win' : 'loss';
  }
  const winners =
    after.winnerSeatIndexes ??
    (after.winnerSeatIndex == null ? [] : [after.winnerSeatIndex]);
  if (!winners.length) return 'confirm';
  if (!winners.includes(seat)) return 'loss';
  return winners.length > 1 ? 'confirm' : 'win';
}
