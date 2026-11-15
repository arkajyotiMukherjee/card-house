import { describe, expect, it } from 'vitest';
import {
  clampLeaderboardOffset,
  leaderboardRows,
  leaderboardScrollThumb,
} from './leaderboard';

describe('room leaderboard', () => {
  it('reserves crowns for one positive-profit leader, independent of grants', () => {
    const players = [
      { id: 'a', profit: 0n, available: 10000n },
      { id: 'b', profit: 0n, available: 20000n },
    ];
    expect(
      leaderboardRows(players).map((row) => [row.rank, row.crowned]),
    ).toEqual([
      [1, false],
      [1, false],
    ]);
    const played = [
      { ...players[0], profit: 40n },
      { ...players[1], profit: -40n },
    ];
    expect(leaderboardRows(played).map((row) => row.crowned)).toEqual([
      true,
      false,
    ]);
    expect(
      leaderboardRows(played.map((row) => ({ ...row, profit: 40n }))).some(
        (row) => row.crowned,
      ),
    ).toBe(false);
    expect(
      leaderboardRows([
        { id: 'a', profit: 0n },
        { id: 'b', profit: -40n },
      ]).some((row) => row.crowned),
    ).toBe(false);
    expect(leaderboardRows(played.reverse())[0].id).toBe('a');
  });
  it('keeps tied ranks and clamps scrolling when players leave or the viewport changes', () => {
    expect(
      leaderboardRows([
        { id: 'z', profit: -2n },
        { id: 'b', profit: 2n },
        { id: 'a', profit: 2n },
      ]).map((row) => [row.id, row.rank]),
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['z', 3],
    ]);
    expect(clampLeaderboardOffset(99, 12, 4)).toBe(8);
    expect(clampLeaderboardOffset(-1, 12, 5)).toBe(0);
    expect(clampLeaderboardOffset(8, 3, 4)).toBe(0);
    const first = leaderboardScrollThumb(0, 12, 4, 280),
      last = leaderboardScrollThumb(8, 12, 4, 280);
    expect(first.y).toBe(0);
    expect(last.y + last.h).toBe(280);
    expect(leaderboardScrollThumb(4, 3, 5, 280)).toEqual({ y: 0, h: 280 });
  });
});
