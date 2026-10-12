import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { lookupDefaultPlayerName } from './discord-user.ts';
import { createApp } from './server.ts';

const USER_ID = '80351110224678912';
const TOKEN = 'test-token-not-a-real-secret';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('an empty token does not call Discord or invent a name', async () => {
  let called = false;
  const result = await lookupDefaultPlayerName(USER_ID, '  ', () => {
    called = true;
    return Promise.resolve(
      jsonResponse(200, { id: USER_ID, username: 'nelly' }),
    );
  });
  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    status: 401,
    discordUserId: USER_ID,
    name: null,
  });
});

test('a 401 from Discord returns no user and no name', async () => {
  const calls: string[] = [];
  const result = await lookupDefaultPlayerName(USER_ID, TOKEN, (url, init) => {
    calls.push(String(url));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), `Bot ${TOKEN}`);
    return Promise.resolve(
      jsonResponse(401, {
        id: USER_ID,
        username: 'invented',
        global_name: 'Invented',
        message: '401: Unauthorized',
        code: 0,
      }),
    );
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    ok: false,
    status: 401,
    discordUserId: USER_ID,
    name: null,
  });
});

test('a Discord user becomes the default player name', async () => {
  const result = await lookupDefaultPlayerName(USER_ID, TOKEN, () =>
    Promise.resolve(
      jsonResponse(200, {
        id: USER_ID,
        username: 'nelly',
        global_name: 'Nelly',
      }),
    ),
  );
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    discordUserId: USER_ID,
    name: 'Nelly',
  });
});

test('a user payload for a different id is not used', async () => {
  const result = await lookupDefaultPlayerName(USER_ID, TOKEN, () =>
    Promise.resolve(
      jsonResponse(200, {
        id: '111111111111111111',
        username: 'other',
        global_name: 'Other',
      }),
    ),
  );
  assert.equal(result.ok, false);
  assert.equal(result.name, null);
});

test('the name route reports a 401 without a player name', async () => {
  const app = createApp({
    publicKey: '00'.repeat(32),
    createLobby: () => Promise.reject(new Error('unused')),
    lookupPlayerName: (discordUserId) =>
      Promise.resolve({
        ok: false,
        status: 401,
        discordUserId,
        name: null,
      }),
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
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/default-player-name?discord_user_id=${USER_ID}`,
    );
    const body = (await response.json()) as {
      name: string | null;
      status: number;
      discordUserId: string;
    };
    assert.equal(response.status, 401);
    assert.deepEqual(body, {
      discordUserId: USER_ID,
      name: null,
      status: 401,
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});
