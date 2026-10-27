import { describe, expect, it } from 'vitest';
import {
  clearTableSession,
  clientStatsQuery,
  countsForTableSession,
  statsCaption,
  statsCaptionFor,
  statsForClient,
  type StatStorage,
} from './client-stats';

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

  it('shows this table on the HUD and keeps lifetime totals off the table', () => {
    const storage = memoryStorage();
    const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const rows = [{ clientId, handsPlayed: 10, gamesWon: 4 }];
    const lifetime = statsForClient(rows, clientId);
    expect(
      countsForTableSession(clientId, 'table_a', lifetime, storage),
    ).toEqual({ handsPlayed: 0, gamesWon: 0 });

    const afterHand = { handsPlayed: 12, gamesWon: 5 };
    const session = countsForTableSession(
      clientId,
      'table_a',
      afterHand,
      storage,
    );
    expect(session).toEqual({ handsPlayed: 2, gamesWon: 1 });
    expect(statsCaptionFor('table', afterHand, session)).toBe(
      'Hands 2  Wins 1',
    );
    expect(statsCaptionFor('menu', afterHand, session)).toBe(
      'Hands 12  Wins 5',
    );
    expect(statsCaptionFor('lobby', afterHand, session)).toBe(
      'Hands 12  Wins 5',
    );
    expect(statsForClient([{ clientId, ...afterHand }], clientId)).toEqual(
      afterHand,
    );
  });

  it('resets the table line when the player leaves or opens another table', () => {
    const storage = memoryStorage();
    const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const lifetime = { handsPlayed: 12, gamesWon: 5 };
    countsForTableSession(
      clientId,
      'table_a',
      { handsPlayed: 10, gamesWon: 4 },
      storage,
    );
    clearTableSession(storage);
    expect(
      countsForTableSession(clientId, 'table_a', lifetime, storage),
    ).toEqual({ handsPlayed: 0, gamesWon: 0 });
    expect(
      countsForTableSession(clientId, 'table_b', lifetime, storage),
    ).toEqual({ handsPlayed: 0, gamesWon: 0 });
    expect(
      countsForTableSession(
        clientId,
        'table_b',
        { handsPlayed: 13, gamesWon: 5 },
        storage,
      ),
    ).toEqual({ handsPlayed: 1, gamesWon: 0 });
    expect(
      statsForClient([{ clientId, handsPlayed: 13, gamesWon: 5 }], clientId),
    ).toEqual({
      handsPlayed: 13,
      gamesWon: 5,
    });
  });
});

function memoryStorage(): StatStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}
