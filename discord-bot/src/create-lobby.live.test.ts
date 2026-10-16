import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionType } from 'discord-interactions';
import { connectLobby, createDiscordLobby } from './lobby-client.ts';
import { createApp } from './server.ts';

const CHANNEL = '323456789012345678';
const live = process.env.CARDROOM_LIVE === '1';

test(
  'one /interactions create mints the code, stores the channel, and returns that join URL',
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
      const knownIds = new Set(
        [...connection.db.lobby.iter()].map((lobby) => lobby.id),
      );
      const keyPair = nacl.sign.keyPair();
      const app = createApp({
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        createLobby: (channelId) =>
          createDiscordLobby(connection, channelId, publicUrl, {
            onCreateLobby: (args) => {
              calls.push(`createLobby:${JSON.stringify(args)}`);
            },
            onSetChannel: (args) => {
              calls.push(
                `setLobbyDiscordChannel:${args.lobbyCode}:${args.discordChannelId}`,
              );
            },
          }),
        lobbyStatus: () => ({
          code: '',
          found: false,
          live: false,
          tables: 0,
          players: 0,
        }),
      });
      server = createServer(app);
      await new Promise<void>((resolve) => {
        server?.listen(0, '127.0.0.1', () => {
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('test server has no port');
      }
      const body = JSON.stringify({
        type: InteractionType.APPLICATION_COMMAND,
        channel_id: CHANNEL,
        data: { name: 'cardhouse', options: [{ name: 'create', type: 1 }] },
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
      const content = payload.data?.content ?? '';
      const parsed = /^Lobby ([A-Z0-9]+)\n(\S+)$/.exec(content);
      const code = parsed?.[1] ?? '';
      const joinUrl = parsed?.[2] ?? '';
      const created = [...connection.db.lobby.iter()].filter(
        (lobby) => !knownIds.has(lobby.id),
      );

      const evidence = {
        discordReply: payload,
        codeFromReply: code,
        joinUrlFromReply: joinUrl,
        calls,
        lobby: created.map((lobby) => ({
          id: lobby.id,
          code: lobby.code,
          discordChannelId: lobby.discordChannelId,
        })),
      };
      console.log(JSON.stringify(evidence, null, 2));

      assert.equal(response.status, 200);
      assert.equal(payload.type, 4);
      assert.ok(parsed, `reply did not contain a code and URL: ${content}`);
      assert.equal(created.length, 1);
      assert.equal(created[0]?.code, code);
      assert.equal(created[0]?.discordChannelId, CHANNEL);
      assert.equal(joinUrl, `${publicUrl}/${code}`);
      assert.deepEqual(calls, [
        'createLobby:{}',
        `setLobbyDiscordChannel:${code}:${CHANNEL}`,
      ]);
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
