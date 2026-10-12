import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { handleInteraction, type InteractionDeps } from './interactions.ts';
import type { CreatedLobby } from './lobby-client.ts';
import type { LobbyStatusReport } from './lobby-status.ts';
import { createApp } from './server.ts';

const CHANNEL = '123456789012345678';

function createdLobby(): CreatedLobby {
  return {
    code: 'H7KP',
    joinUrl: 'http://127.0.0.1:5173/H7KP',
    discordChannelId: CHANNEL,
    reducer: 'create_lobby',
  };
}

function liveReport(code: string): LobbyStatusReport {
  return { code, found: true, live: true, tables: 0, players: 0 };
}

function deps(partial: Partial<InteractionDeps> = {}): InteractionDeps {
  return {
    createLobby: () => Promise.resolve(createdLobby()),
    lobbyStatus: () => ({
      code: 'NONE',
      found: false,
      live: false,
      tables: 0,
      players: 0,
    }),
    ...partial,
  };
}

test('a create interaction replies with the code and join URL', async () => {
  const channels: string[] = [];
  const reply = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      channel_id: CHANNEL,
      data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
    },
    deps({
      createLobby: (channelId) => {
        channels.push(channelId);
        return Promise.resolve(createdLobby());
      },
    }),
  );
  assert.equal(reply.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(channels[0], CHANNEL);
  assert.match(reply.data?.content ?? '', /H7KP/);
  assert.match(reply.data?.content ?? '', /http:\/\/127\.0\.0\.1:5173\/H7KP/);
});

test('ping replies with pong', async () => {
  const reply = await handleInteraction({ type: InteractionType.PING }, deps());
  assert.deepEqual(reply, { type: InteractionResponseType.PONG });
});

test('the interactions endpoint checks the Discord signature', async () => {
  const keyPair = nacl.sign.keyPair();
  const publicKey = Buffer.from(keyPair.publicKey).toString('hex');
  const app = createApp({
    publicKey,
    createLobby: () => Promise.resolve(createdLobby()),
    lobbyStatus: () => liveReport('H7KP'),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server has no port');
  }
  const url = `http://127.0.0.1:${address.port}/interactions`;
  const body = JSON.stringify({
    type: InteractionType.APPLICATION_COMMAND,
    channel_id: CHANNEL,
    data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(
    nacl.sign.detached(Buffer.from(timestamp + body), keyPair.secretKey),
  ).toString('hex');

  const rejected = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': '00'.repeat(64),
      'X-Signature-Timestamp': timestamp,
    },
    body,
  });
  const accepted = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': timestamp,
    },
    body,
  });
  const payload = (await accepted.json()) as { data?: { content?: string } };
  server.close();

  assert.equal(rejected.status, 401);
  assert.equal(accepted.status, 200);
  assert.match(payload.data?.content ?? '', /H7KP/);
  assert.match(payload.data?.content ?? '', /http:\/\/127\.0\.0\.1:5173\/H7KP/);
});

test('status names a live lobby from the room code', async () => {
  const lookedUp: string[] = [];
  let created = 0;
  const reply = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      channel_id: CHANNEL,
      data: {
        name: 'cardroom',
        options: [
          {
            name: 'status',
            type: 1,
            options: [{ name: 'roomcode', type: 3, value: 'h7kp' }],
          },
        ],
      },
    },
    deps({
      createLobby: () => {
        created += 1;
        return Promise.resolve(createdLobby());
      },
      lobbyStatus: (roomCode) => {
        lookedUp.push(roomCode);
        return liveReport('H7KP');
      },
    }),
  );
  assert.equal(created, 0);
  assert.deepEqual(lookedUp, ['h7kp']);
  assert.equal(reply.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(reply.data?.content, 'Lobby H7KP is live\n0 tables, 0 players');
});

test('status says the room was not found for a missing code', async () => {
  const reply = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      data: {
        name: 'cardroom',
        options: [
          {
            name: 'status',
            type: 1,
            options: [{ name: 'roomcode', type: 3, value: 'NOPE' }],
          },
        ],
      },
    },
    deps({
      lobbyStatus: () => ({
        code: 'NOPE',
        found: false,
        live: false,
        tables: 0,
        players: 0,
      }),
    }),
  );
  assert.equal(reply.data?.content, 'Room NOPE was not found');
});

test('status asks for a room code when the option is empty', async () => {
  const reply = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      data: {
        name: 'cardroom',
        options: [{ name: 'status', type: 1, options: [] }],
      },
    },
    deps(),
  );
  assert.equal(reply.data?.content, 'Room code is required');
  assert.equal(reply.data?.flags, 1 << 6);
});
