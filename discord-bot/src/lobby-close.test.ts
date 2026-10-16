import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeEmptyRoom,
  closeReplyContent,
  type CloseRoomConnection,
  type CloseRoomReport,
} from './lobby-close.ts';

function connection(rows: {
  lobby: Array<{ id: string; code: string; status: { tag: string } }>;
  members?: Array<{ lobbyId: string }>;
  tables?: Array<{ id: string; lobbyId: string }>;
  seats?: Array<{ tableId: string }>;
  onClose?: (code: string) => void;
}): CloseRoomConnection {
  return {
    db: {
      lobby: { iter: () => rows.lobby },
      lobbyMember: { iter: () => rows.members ?? [] },
      gameTable: { iter: () => rows.tables ?? [] },
      gameSeat: { iter: () => rows.seats ?? [] },
    },
    reducers: {
      closeLobby: ({ lobbyCode }) => {
        rows.onClose?.(lobbyCode);
        return Promise.resolve();
      },
    },
  };
}

const openLobby = {
  id: 'lobby-a',
  code: 'AB3D',
  status: { tag: 'open' },
};

test('an empty room closes', async () => {
  const closed: string[] = [];
  const report = await closeEmptyRoom(
    connection({
      lobby: [openLobby],
      tables: [{ id: 'table-a', lobbyId: 'lobby-a' }],
      onClose: (code) => {
        closed.push(code);
      },
    }),
    'ab3d',
  );
  assert.deepEqual(closed, ['AB3D']);
  assert.equal(report.closed, true);
  assert.equal(closeReplyContent(report), 'Lobby AB3D is closed');
});

test('a lobby player blocks close', async () => {
  const closed: string[] = [];
  const report = await closeEmptyRoom(
    connection({
      lobby: [openLobby],
      members: [{ lobbyId: 'lobby-a' }],
      onClose: (code) => {
        closed.push(code);
      },
    }),
    'AB3D',
  );
  assert.deepEqual(closed, []);
  assert.equal(report.closed, false);
  assert.equal(report.lobbyPlayers, 1);
  assert.equal(closeReplyContent(report), 'Lobby AB3D still has 1 player');
});

test('a seated player in this room blocks close', async () => {
  const report = await closeEmptyRoom(
    connection({
      lobby: [
        openLobby,
        { id: 'lobby-b', code: 'ZZ99', status: { tag: 'open' } },
      ],
      tables: [
        { id: 'table-a', lobbyId: 'lobby-a' },
        { id: 'table-b', lobbyId: 'lobby-b' },
      ],
      seats: [{ tableId: 'table-a' }, { tableId: 'table-b' }],
    }),
    'AB3D',
  );
  assert.equal(report.closed, false);
  assert.equal(report.tablePlayers, 1);
  assert.equal(
    closeReplyContent({ ...report, lobbyPlayers: 0 }),
    'Lobby AB3D still has players at a table',
  );
});

test('players in another room do not block close', async () => {
  const closed: string[] = [];
  const report = await closeEmptyRoom(
    connection({
      lobby: [
        openLobby,
        { id: 'lobby-b', code: 'ZZ99', status: { tag: 'open' } },
      ],
      members: [{ lobbyId: 'lobby-b' }],
      tables: [{ id: 'table-b', lobbyId: 'lobby-b' }],
      seats: [{ tableId: 'table-b' }],
      onClose: (code) => {
        closed.push(code);
      },
    }),
    'AB3D',
  );
  assert.deepEqual(closed, ['AB3D']);
  assert.equal(report.lobbyPlayers, 0);
  assert.equal(report.tablePlayers, 0);
});

test('a missing code does not close a room', async () => {
  const report = await closeEmptyRoom(
    connection({ lobby: [openLobby] }),
    'NOPE',
  );
  const expected: CloseRoomReport = {
    code: 'NOPE',
    found: false,
    alreadyClosed: false,
    lobbyPlayers: 0,
    tablePlayers: 0,
    closed: false,
  };
  assert.deepEqual(report, expected);
  assert.equal(closeReplyContent(report), 'Room NOPE was not found');
});

test('an already closed room is not closed again', async () => {
  const closed: string[] = [];
  const report = await closeEmptyRoom(
    connection({
      lobby: [{ ...openLobby, status: { tag: 'closed' } }],
      onClose: (code) => {
        closed.push(code);
      },
    }),
    'AB3D',
  );
  assert.deepEqual(closed, []);
  assert.equal(closeReplyContent(report), 'Lobby AB3D is already closed');
});
