import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { handleInteraction } from './interactions.ts';
import type { CreatedLobby } from './lobby-client.ts';
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

test('a create interaction replies with the code and join URL', async () => {
  const channels: string[] = [];
  const reply = await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      channel_id: CHANNEL,
      data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
    },
    {
      createLobby: (channelId) => {
        channels.push(channelId);
        return Promise.resolve(createdLobby());
      },
    },
  );
  assert.equal(reply.type, InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
  assert.equal(channels[0], CHANNEL);
  assert.match(reply.data?.content ?? '', /H7KP/);
  assert.match(reply.data?.content ?? '', /http:\/\/127\.0\.0\.1:5173\/H7KP/);
});

test('ping replies with pong', async () => {
  const reply = await handleInteraction(
    { type: InteractionType.PING },
    { createLobby: () => Promise.resolve(createdLobby()) },
  );
  assert.deepEqual(reply, { type: InteractionResponseType.PONG });
});

test('the interactions endpoint checks the Discord signature', async () => {
  const keyPair = nacl.sign.keyPair();
  const publicKey = Buffer.from(keyPair.publicKey).toString('hex');
  const app = createApp({
    publicKey,
    createLobby: () => Promise.resolve(createdLobby()),
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
