import { describe, expect, it } from 'vitest';
import { clientStatsQuery, statsCaption, statsForClient } from './client-stats';

describe('client stats', () => {
  it('names hands played and games won', () => {
    expect(statsCaption({ handsPlayed: 1, gamesWon: 1 })).toBe(
      'Hands 1  Wins 1',
    );
  });

  it('reads the row for this clientId and leaves another client at zero', () => {
    const rows = [{ clientId: 'alpha', handsPlayed: 4, gamesWon: 2 }];
    expect(statsForClient(rows, 'alpha')).toEqual({
      handsPlayed: 4,
      gamesWon: 2,
    });
    expect(statsForClient(rows, 'beta')).toEqual({
      handsPlayed: 0,
      gamesWon: 0,
    });
  });

  it('subscribes only to this clientId', () => {
    expect(clientStatsQuery("a'b")).toBe(
      `SELECT * FROM "ClientStats" WHERE "clientId" = 'a''b'`,
    );
  });
});
