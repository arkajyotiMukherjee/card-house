import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDiscordLobby,
  type LobbyConnection,
  type LobbySnapshot,
} from './lobby-client.ts';

const CHANNEL = '123456789012345678';

test('createLobby mints the code and the channel is stored on that lobby', async () => {
  const calls: string[] = [];
  const rows: LobbySnapshot[] = [
    { id: 'lobby_abc_1', code: 'OLD1', discordChannelId: '' },
  ];
  const connection: LobbyConnection = {
    identity: { toHexString: () => 'abc' },
    reducers: {
      createLobby: (args) => {
        calls.push(`createLobby:${JSON.stringify(args)}`);
        rows.push({
          id: 'lobby_abc_99',
          code: 'AB3D',
          discordChannelId: '',
        });
        return Promise.resolve();
      },
      setLobbyDiscordChannel: (args) => {
        calls.push(
          `setLobbyDiscordChannel:${args.lobbyCode}:${args.discordChannelId}`,
        );
        const row = rows.find((lobby) => lobby.code === args.lobbyCode);
        if (!row) {
          return Promise.reject(new Error('missing lobby'));
        }
        row.discordChannelId = args.discordChannelId;
        return Promise.resolve();
      },
    },
    db: {
      lobby: {
        iter: () => rows,
      },
    },
  };

  const created = await createDiscordLobby(
    connection,
    CHANNEL,
    'http://127.0.0.1:5173',
  );

  assert.equal(created.reducer, 'create_lobby');
  assert.equal(created.code, 'AB3D');
  assert.equal(created.joinUrl, 'http://127.0.0.1:5173/AB3D');
  assert.equal(created.discordChannelId, CHANNEL);
  assert.deepEqual(calls, [
    'createLobby:{}',
    `setLobbyDiscordChannel:AB3D:${CHANNEL}`,
  ]);
});

test('rejects a channel id that is not a Discord snowflake', async () => {
  const connection: LobbyConnection = {
    identity: { toHexString: () => 'abc' },
    reducers: {
      createLobby: () => Promise.resolve(),
      setLobbyDiscordChannel: () => Promise.resolve(),
    },
    db: { lobby: { iter: () => [] } },
  };
  await assert.rejects(
    () =>
      createDiscordLobby(connection, 'not-a-channel', 'http://127.0.0.1:5173'),
    /Discord channel id is invalid/,
  );
});
