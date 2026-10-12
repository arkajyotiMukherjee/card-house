import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionType } from 'discord-interactions';
import { connectLobby, createDiscordLobby } from './lobby-client.ts';
import { readLobbyStatus } from './lobby-status.ts';
import { createApp } from './server.ts';

const CHANNEL = '423456789012345678';
const BOGUS_CODE = 'NOPE';
const live = process.env.CARDROOM_LIVE === '1';

test(
  'one /interactions status names the lobby createLobby just minted, and a bogus code is not found',
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
        lobbyStatus: (roomCode) => readLobbyStatus(connection, roomCode),
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
      const url = `http://127.0.0.1:${address.port}/interactions`;

      const created = await postInteraction(url, keyPair.secretKey, {
        type: InteractionType.APPLICATION_COMMAND,
        channel_id: CHANNEL,
        data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
      });
      const createdContent = created.payload.data?.content ?? '';
      const parsed = /^Lobby ([A-Z0-9]+)\n(\S+)$/.exec(createdContent);
      const code = parsed?.[1] ?? '';

      const status = await postInteraction(url, keyPair.secretKey, {
        type: InteractionType.APPLICATION_COMMAND,
        channel_id: CHANNEL,
        data: {
          name: 'cardroom',
          options: [
            {
              name: 'status',
              type: 1,
              options: [{ name: 'roomcode', type: 3, value: code }],
            },
          ],
        },
      });
      const missing = await postInteraction(url, keyPair.secretKey, {
        type: InteractionType.APPLICATION_COMMAND,
        channel_id: CHANNEL,
        data: {
          name: 'cardroom',
          options: [
            {
              name: 'status',
              type: 1,
              options: [{ name: 'roomcode', type: 3, value: BOGUS_CODE }],
            },
          ],
        },
      });

      const lobby = [...connection.db.lobby.iter()].find(
        (row) => row.code === code && !knownIds.has(row.id),
      );
      const evidence = {
        createReply: created.payload,
        statusReply: status.payload,
        missingReply: missing.payload,
        codeFromCreate: code,
        calls,
        lobby: lobby
          ? {
              id: lobby.id,
              code: lobby.code,
              status: lobby.status,
              discordChannelId: lobby.discordChannelId,
            }
          : null,
      };
      console.log(JSON.stringify(evidence, null, 2));

      assert.equal(created.response.status, 200);
      assert.ok(parsed, `create reply had no code: ${createdContent}`);
      assert.equal(status.response.status, 200);
      assert.equal(status.payload.type, 4);
      assert.equal(
        status.payload.data?.content,
        `Lobby ${code} is live\n0 tables, 0 players`,
      );
      assert.equal(lobby?.code, code);
      assert.equal(missing.response.status, 200);
      assert.equal(
        missing.payload.data?.content,
        `Room ${BOGUS_CODE} was not found`,
      );
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

interface SignedPayload {
  type: number;
  data?: { content?: string };
}

async function postInteraction(
  url: string,
  secretKey: Uint8Array,
  interaction: unknown,
): Promise<{ response: Response; payload: SignedPayload }> {
  const body = JSON.stringify(interaction);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(
    nacl.sign.detached(Buffer.from(timestamp + body), secretKey),
  ).toString('hex');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': timestamp,
    },
    body,
  });
  const payload = (await response.json()) as SignedPayload;
  return { response, payload };
}
