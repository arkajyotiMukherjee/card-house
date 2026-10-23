import { describe, expect, it } from 'vitest';
import { findSoloSeat, hasOwnMembership } from './solo-room';

const lobby = {
  id: 'lobby-new',
  code: 'ABCD',
  solo: true,
  createdAtMicros: 20n,
};

describe('findSoloSeat', () => {
  it('opens the newest solo table for this person', () => {
    expect(
      findSoloSeat(
        'me',
        [
          {
            id: 'lobby-old',
            code: 'OLD1',
            solo: true,
            createdAtMicros: 10n,
          },
          lobby,
          {
            id: 'lobby-shared',
            code: 'SHAR',
            solo: false,
            createdAtMicros: 99n,
          },
        ],
        [
          {
            id: 'member-me',
            lobbyId: 'lobby-new',
            clientId: 'me',
            isBot: false,
          },
          {
            id: 'member-bot',
            lobbyId: 'lobby-new',
            clientId: 'bot:table:1',
            isBot: true,
          },
          {
            id: 'member-old',
            lobbyId: 'lobby-old',
            clientId: 'me',
            isBot: false,
          },
        ],
        [
          { id: 'table-old', lobbyId: 'lobby-new', createdAtMicros: 1n },
          { id: 'table-new', lobbyId: 'lobby-new', createdAtMicros: 2n },
          { id: 'table-shared', lobbyId: 'lobby-shared', createdAtMicros: 9n },
        ],
      ),
    ).toEqual({
      lobbyId: 'lobby-new',
      code: 'ABCD',
      tableId: 'table-new',
      lobbyMemberId: 'member-me',
    });
  });

  it('ignores a solo room this client only occupies as a bot', () => {
    expect(
      findSoloSeat(
        'me',
        [lobby],
        [
          {
            id: 'member-bot',
            lobbyId: 'lobby-new',
            clientId: 'me',
            isBot: true,
          },
        ],
        [{ id: 'table-new', lobbyId: 'lobby-new', createdAtMicros: 2n }],
      ),
    ).toBeUndefined();
  });
});

describe('hasOwnMembership', () => {
  it('is gone when only bot rows remain', () => {
    expect(hasOwnMembership([{ clientId: 'me', isBot: true }], 'me')).toBe(
      false,
    );
    expect(hasOwnMembership([{ clientId: 'me', isBot: false }], 'me')).toBe(
      true,
    );
  });
});
