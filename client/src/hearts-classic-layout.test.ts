import { describe, expect, it } from 'vitest';
import type { HeartsState } from '../../src/shared/games/hearts';
import { classicSeats } from './classic-table-design';
import { handPageSize, handPositions } from './classic-card-layout';
import {
  HEARTS_PUBLIC_SCALE,
  heartsHandPoints,
  heartsMoonShooter,
  heartsPassTarget,
  heartsPenaltySummary,
  heartsScoreRows,
  heartsSeatOrder,
  heartsTrickPosition,
  orderedHeartsHand,
} from './hearts-classic-layout';
const seats = Array.from({ length: 4 }, (_, seatIndex) => ({
  seatIndex,
  name: 'Alexandra Montgomery',
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
describe('classic Hearts composition', () => {
  it('keeps clockwise pass directions attached to the correct visual neighbors for every viewer', () => {
    for (let viewer = 0; viewer < 4; viewer++) {
      const players = seats.map((seat) => ({
        ...seat,
        self: seat.seatIndex === viewer,
      }));
      const rail = classicSeats(heartsSeatOrder(players));
      expect(rail.find((s) => s.edge === 'left')?.seat.seatIndex).toBe(
        (viewer + 1) % 4,
      );
      expect(rail.find((s) => !s.edge)?.seat.seatIndex).toBe((viewer + 2) % 4);
      expect(rail.find((s) => s.edge === 'right')?.seat.seatIndex).toBe(
        (viewer + 3) % 4,
      );
      for (const [handIndex, offset] of [
        [0, 1],
        [1, 3],
        [2, 2],
      ])
        expect(
          heartsPassTarget({ handIndex } as HeartsState, players, viewer)
            ?.seatIndex,
        ).toBe((viewer + offset) % 4);
      expect(
        heartsPassTarget({ handIndex: 3 } as HeartsState, players, viewer),
      ).toBeUndefined();
    }
  });
  it('separates all public card faces and owner labels from the claim, rail and private band', () => {
    const positions = Array.from({ length: 4 }, (_, i) =>
      heartsTrickPosition(i),
    );
    for (const [i, p] of positions.entries()) {
      expect(p.y - 28 * HEARTS_PUBLIC_SCALE - 276).toBeGreaterThanOrEqual(16);
      expect(p.y + 28 * HEARTS_PUBLIC_SCALE).toBeLessThan(374);
      expect(p.x - 20 * HEARTS_PUBLIC_SCALE).toBeGreaterThan(244);
      expect(p.x + 20 * HEARTS_PUBLIC_SCALE).toBeLessThan(716);
      if (i)
        expect(p.x - positions[i - 1].x).toBeGreaterThan(
          40 * HEARTS_PUBLIC_SCALE,
        );
    }
  });
  it('preserves suit/rank ordering for a thirteen-card hand without changing the authoritative cards', () => {
    const hand = ['AH', '2C', 'KC', 'QS', '3D'];
    expect(orderedHeartsHand(hand)).toEqual(['2C', 'KC', '3D', 'QS', 'AH']);
    expect(hand).toEqual(['AH', '2C', 'KC', 'QS', '3D']);
    for (const mobile of [false, true]) {
      const capacity = handPageSize(13, mobile, 0);
      expect(capacity).toBeLessThan(13);
      const slots = handPositions(capacity, mobile);
      expect(slots.length).toBe(capacity);
    }
  });
  it('ranks tied lowest scores together, with public hand penalties independent of total scores', () => {
    const state = {
      scores: { '0': 12, '1': 12, '2': 26, '3': 100 },
      tricksTaken: { '0': ['AH', 'QS', '2C'], '1': [], '2': [], '3': [] },
    } as unknown as HeartsState;
    expect(
      heartsScoreRows(state, seats).map((r) => [r.place, r.score, r.points]),
    ).toEqual([
      [1, 12, 14],
      [1, 12, 0],
      [3, 26, 0],
      [4, 100, 0],
    ]);
    expect(heartsHandPoints(['AH', '2H', 'QS', 'AS'])).toBe(15);
    expect(heartsPenaltySummary(['AH', '2H', 'QS'])).toBe('2 hearts + Q♠');
  });
});

it('identifies the moon shooter from public score changes without inspecting hands', () => {
  const before = {
    scores: { '0': 10, '1': 20, '2': 30, '3': 40 },
  } as unknown as HeartsState;
  const after = {
    scores: { '0': 36, '1': 20, '2': 56, '3': 66 },
  } as unknown as HeartsState;
  expect(heartsMoonShooter(before, after)).toBe(1);
  expect(
    heartsMoonShooter(before, {
      scores: { '0': 16, '1': 25, '2': 40, '3': 45 },
    } as unknown as HeartsState),
  ).toBeNull();
});
