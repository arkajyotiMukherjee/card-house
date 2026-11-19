import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import {
  attachCasinoLink,
  casinoDiscordMessages,
  watchCasinoVoiceMoves,
} from './casino-discord.ts';
import type { DiscordHttpError, DiscordRequest } from './discord-http.ts';

const guild = '194246372135987200';
const channel = '194246372135987201';
const user = '194246372135987202';
const message = '194246372135987203';

test('voice-channel message frames skip DMs, bots, and webhook posts', () => {
  const frame = {
    guild_id: guild,
    channel_id: channel,
    id: message,
    author: { id: user, username: 'ada' },
    content: 'Hello',
  };
  assert.deepEqual(casinoDiscordMessages('MESSAGE_CREATE', frame), [
    {
      channelId: channel,
      messageId: message,
      discordUserId: user,
      author: 'ada',
      body: 'Hello',
      deleted: false,
    },
  ]);
  assert.deepEqual(
    casinoDiscordMessages('MESSAGE_CREATE', {
      ...frame,
      author: { id: user, bot: true },
    }),
    [],
  );
  assert.deepEqual(
    casinoDiscordMessages('MESSAGE_CREATE', { ...frame, guild_id: undefined }),
    [],
  );
  assert.deepEqual(
    casinoDiscordMessages('MESSAGE_CREATE', { ...frame, webhook_id: user }),
    [],
  );
  assert.deepEqual(
    casinoDiscordMessages('MESSAGE_UPDATE', { ...frame, content: undefined }),
    [],
  );
  assert.equal(
    casinoDiscordMessages('MESSAGE_DELETE_BULK', {
      ...frame,
      ids: [message, 'malformed'],
    }).length,
    1,
  );
  assert.equal(
    casinoDiscordMessages('MESSAGE_DELETE', frame)[0]?.deleted,
    true,
  );
});

test('OAuth challenge consumes only a cookie-bound callback and uses the verified Discord identity', async () => {
  const app = express();
  const calls: string[] = [];
  const verified: string[][] = [];
  const challenge = 'a'.repeat(64);
  let ready = false;
  attachCasinoLink(app, {
    applicationId: guild,
    secret: 'fixture-secret',
    redirectUri: 'http://localhost/casino/discord/callback',
    isReady: () => ready,
    complete: async (id, userId) => {
      verified.push([id, userId]);
    },
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith('/oauth2/token')) {
        assert.ok(new URLSearchParams(String(init?.body)).get('code_verifier'));
        return Response.json({ access_token: 'fixture-token' });
      }
      assert.deepEqual(init?.headers, {
        Authorization: 'Bearer fixture-token',
      });
      return Response.json({ id: user });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const status = () => fetch(`${base}/casino/discord/status`);
    const waiting = await status();
    assert.equal(waiting.headers.get('access-control-allow-origin'), '*');
    assert.equal(waiting.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await waiting.json(), { available: false });
    const unavailable = await fetch(
      `${base}/casino/discord/link?challenge=${challenge}`,
    );
    assert.equal(unavailable.status, 503);
    assert.match(await unavailable.text(), /temporarily unavailable/);
    assert.equal(calls.length, 0);
    ready = true;
    assert.deepEqual(await (await status()).json(), { available: true });
    const start = await fetch(
      `${base}/casino/discord/link?challenge=${challenge}`,
      { redirect: 'manual' },
    );
    assert.equal(start.status, 302);
    const oauth = new URL(start.headers.get('location')!);
    const cookies = start.headers.get('set-cookie')?.split(';') ?? [];
    assert.equal(oauth.searchParams.get('scope'), 'identify');
    assert.equal(oauth.searchParams.get('code_challenge_method'), 'S256');
    const callback = `${base}/casino/discord/callback?code=fixture&state=${oauth.searchParams.get('state')}`;
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(calls.length, 0);
    const headers = { Cookie: cookies[0] };
    assert.equal((await fetch(callback, { headers })).status, 200);
    assert.deepEqual(verified, [[challenge, user]]);
    assert.equal((await fetch(callback, { headers })).status, 400);
    assert.equal(calls.length, 2);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('an unconfigured OAuth server responds with an availability status and a clear error', async () => {
  const app = express();
  attachCasinoLink(app, {
    applicationId: guild,
    secret: '',
    redirectUri: 'invalid',
    complete: async () => {
      assert.fail('OAuth is disabled');
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.deepEqual(
      await (await fetch(`${base}/casino/discord/status`)).json(),
      { available: false },
    );
    for (const path of ['link', 'callback']) {
      const response = await fetch(`${base}/casino/discord/${path}`);
      assert.equal(response.status, 503);
      assert.match(await response.text(), /temporarily unavailable/);
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('voice moves follow gateway-confirmed room and table changes and report Discord denials', async () => {
  const table = '194246372135987204';
  let rows = [
    {
      guildId: guild,
      discordUserId: user,
      sourceChannelId: channel,
      targetChannelId: table,
    },
  ];
  const requests: DiscordRequest[] = [];
  const errors: unknown[] = [];
  let status = 204;
  const moves = watchCasinoVoiceMoves(
    {
      iter: () => rows[Symbol.iterator](),
      onInsert() {},
      onDelete() {},
    },
    {
      async request(request) {
        requests.push(request);
        return { status, body: null, headers: {} };
      },
    },
    (error) => errors.push(error),
  );
  moves.refresh();
  assert.equal(requests.length, 0);
  moves.record(guild, user, channel);
  moves.refresh();
  moves.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, [
    {
      method: 'PATCH',
      path: `/guilds/${guild}/members/${user}`,
      body: { channel_id: table },
    },
  ]);
  moves.record(guild, user, table);
  rows = [
    {
      guildId: guild,
      discordUserId: user,
      sourceChannelId: table,
      targetChannelId: channel,
    },
  ];
  moves.reset();
  moves.refresh();
  assert.equal(requests.length, 1);
  moves.record(guild, user, table);
  status = 403;
  moves.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  moves.refresh();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.body, { channel_id: channel });
  assert.deepEqual(
    errors.map((error) => (error as DiscordHttpError).status),
    [403],
  );
});
