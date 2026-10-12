import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readLobbyStatus,
  statusReplyContent,
  type LobbyStatusConnection,
  type LobbyStatusReport,
  type LobbyStatusRow,
} from './lobby-status.ts';

function connection(rows: {
  lobby: LobbyStatusRow[];
  members?: Array<{ lobbyId: string }>;
  tables?: Array<{ lobbyId: string }>;
}): LobbyStatusConnection {
  return {
    db: {
      lobby: { iter: () => rows.lobby },
      lobbyMember: { iter: () => rows.members ?? [] },
      gameTable: { iter: () => rows.tables ?? [] },
    },
  };
}

test('an open lobby is live and counts only that room', () => {
  const report = readLobbyStatus(
    connection({
      lobby: [
        { id: 'lobby-a', code: 'AB3D', status: { tag: 'open' } },
        { id: 'lobby-b', code: 'ZZ99', status: { tag: 'open' } },
      ],
      members: [
        { lobbyId: 'lobby-a' },
        { lobbyId: 'lobby-a' },
        { lobbyId: 'lobby-b' },
      ],
      tables: [{ lobbyId: 'lobby-a' }, { lobbyId: 'lobby-b' }],
    }),
    'ab3d',
  );
  assert.deepEqual(report, {
    code: 'AB3D',
    found: true,
    live: true,
    tables: 1,
    players: 2,
  });
  assert.equal(
    statusReplyContent(report),
    'Lobby AB3D is live\n1 table, 2 players',
  );
});

test('a closed lobby is found and is not live', () => {
  const report = readLobbyStatus(
    connection({
      lobby: [{ id: 'lobby-a', code: 'AB3D', status: { tag: 'closed' } }],
    }),
    'AB3D',
  );
  assert.equal(report.found, true);
  assert.equal(report.live, false);
  assert.equal(
    statusReplyContent(report),
    'Lobby AB3D is closed\n0 tables, 0 players',
  );
});

test('a missing code says the room was not found', () => {
  const report = readLobbyStatus(
    connection({
      lobby: [{ id: 'lobby-a', code: 'AB3D', status: { tag: 'open' } }],
    }),
    'NOPE',
  );
  const expected: LobbyStatusReport = {
    code: 'NOPE',
    found: false,
    live: false,
    tables: 0,
    players: 0,
  };
  assert.deepEqual(report, expected);
  assert.equal(statusReplyContent(report), 'Room NOPE was not found');
});

test('a blank code does not match a lobby', () => {
  const report = readLobbyStatus(
    connection({
      lobby: [{ id: 'lobby-a', code: 'AB3D', status: { tag: 'Open' } }],
    }),
    '   ',
  );
  assert.equal(report.found, false);
  assert.equal(statusReplyContent(report), 'Room code is required');
});
