import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionType } from 'discord-interactions';
import { connectLobby, createDiscordLobby } from './lobby-client.ts';
import { createApp } from './server.ts';

const CHANNEL = '123456789012345678';
const live = process.env.CARDROOM_LIVE === '1';

test(
  'create_lobby mints the code and the lobby stores the Discord channel',
  { skip: live ? false : 'set CARDROOM_LIVE=1 to call the published module' },
  async () => {
    const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
    const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
    const publicUrl =
      process.env.CARDROOM_PUBLIC_URL ?? 'http://127.0.0.1:5173';
    const connection = await connectLobby(host, database);
    let server: Server | undefined;
    try {
      const calls: string[] = [];
      const created = await createDiscordLobby(connection, CHANNEL, publicUrl, {
        onCreateLobby: (args) => {
          calls.push(`createLobby:${JSON.stringify(args)}`);
        },
        onSetChannel: (args) => {
          calls.push(
            `setLobbyDiscordChannel:${args.lobbyCode}:${args.discordChannelId}`,
          );
        },
      });
      const row = [...connection.db.lobby.iter()].find(
        (lobby) => lobby.code === created.code,
      );

      const keyPair = nacl.sign.keyPair();
      const app = createApp({
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        createLobby: (channelId) =>
          createDiscordLobby(connection, channelId, publicUrl),
      });
      server = createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('test server has no port');
      }
      const body = JSON.stringify({
        type: InteractionType.APPLICATION_COMMAND,
        channel_id: '223456789012345678',
        data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = Buffer.from(
        nacl.sign.detached(Buffer.from(timestamp + body), keyPair.secretKey),
      ).toString('hex');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/interactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-Ed25519': signature,
            'X-Signature-Timestamp': timestamp,
          },
          body,
        },
      );
      const payload = (await response.json()) as {
        type: number;
        data?: { content?: string };
      };

      const evidence = {
        reducer: created.reducer,
        calls,
        lobby: row
          ? {
              id: row.id,
              code: row.code,
              discordChannelId: row.discordChannelId,
              status: row.status,
            }
          : null,
        discordReply: payload,
      };
      console.log(JSON.stringify(evidence, null, 2));

      assert.equal(created.reducer, 'create_lobby');
      assert.equal(calls[0], 'createLobby:{}');
      assert.match(
        calls[1] ?? '',
        new RegExp(`^setLobbyDiscordChannel:${created.code}:${CHANNEL}$`),
      );
      assert.equal(row?.discordChannelId, CHANNEL);
      assert.equal(row?.code, created.code);
      assert.match(created.joinUrl, new RegExp(`/${created.code}$`));
      assert.equal(response.status, 200);
      assert.match(payload.data?.content ?? '', /Lobby /);
      assert.match(payload.data?.content ?? '', /https?:\/\/\S+/);
    } finally {
      connection.disconnect();
      if (server?.listening) {
        await new Promise<void>((resolve) => {
          server?.close(() => {
            resolve();
          });
        });
      }
    }
  },
);
