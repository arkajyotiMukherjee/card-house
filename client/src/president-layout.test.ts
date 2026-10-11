import { describe, expect, it } from 'vitest';
import type { PresidentState } from '../../src/shared/games/president';
import { PILE_X, PILE_Y, pilePositions } from './bluff-layout';
import {
  finishedLine,
  legalCard,
  rankOrderLines,
  requirementLine,
} from './president-layout';

const seats = [
  { seatIndex: 0, name: 'Ada' },
  { seatIndex: 1, name: 'Bea' },
  { seatIndex: 2, name: 'Cal' },
];

function playState(patch: Partial<PresidentState> = {}): PresidentState {
  return {
    phase: 'play',
    hands: { '0': ['3C', 'KH'], '1': ['4S'], '2': ['5H'] },
    playPile: [],
    currentRank: null,
    currentCount: 0,
    passes: 0,
    turnSeatIndex: 0,
    lastPlay: null,
    openingLead: true,
    finishOrder: [],
    rankOrder: [],
    winnerSeatIndex: null,
    ...patch,
  };
}

describe('president layout', () => {
  it('draws the play pile in the center of the shared table', () => {
    expect(pilePositions(1)).toEqual([{ x: PILE_X, y: PILE_Y }]);
    expect(pilePositions(3)).toHaveLength(3);
  });

  it('lifts a card only on your turn', () => {
    const state = playState();
    expect(legalCard(state, 0, '3C')).toBe(true);
    expect(legalCard(state, 0, '4S')).toBe(false);
    expect(legalCard(playState({ turnSeatIndex: 1 }), 0, '3C')).toBe(false);
    expect(legalCard(playState({ phase: 'finished' }), 0, '3C')).toBe(false);
  });

  it('names the lead and the rank the next play must beat', () => {
    expect(requirementLine(playState())).toBe('Lead 3C');
    expect(
      requirementLine(
        playState({
          openingLead: false,
          currentRank: 'K',
          currentCount: 2,
        }),
      ),
    ).toBe('Beat 2 K');
  });

  it('lists seats that are out, then the finished rank order', () => {
    expect(rankOrderLines(playState({ finishOrder: [0] }), seats)).toEqual([
      'Out',
      '1 Ada',
    ]);
    const finished = playState({
      phase: 'finished',
      finishOrder: [0, 1, 2],
      winnerSeatIndex: 0,
      rankOrder: [
        { seat: 0, title: 'President', score: 3 },
        { seat: 1, title: 'Neutral', score: 2 },
        { seat: 2, title: 'Scum', score: 1 },
      ],
    });
    expect(rankOrderLines(finished, seats)).toEqual([
      'President Ada 3',
      'Neutral Bea 2',
      'Scum Cal 1',
    ]);
    expect(finishedLine(finished, seats)).toBe('President Ada');
    expect(finishedLine(playState(), seats)).toBeNull();
  });
});
