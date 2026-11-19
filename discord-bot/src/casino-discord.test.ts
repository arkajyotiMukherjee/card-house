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
const publicUrl = 'https://cardhouse.example.test/';

function returnResult(response: Response, result: string, flow?: string): void {
  assert.equal(response.status, 303);
  const destination = new URL(publicUrl);
  destination.searchParams.set('discordLink', result);
  if (flow) destination.searchParams.set('discordLinkFlow', flow);
  assert.equal(response.headers.get('location'), destination.toString());
}

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
  const flow = 'f'.repeat(32);
  let ready = false;
  let tokenRejected = false;
  let operatorRequired = false;
  attachCasinoLink(app, {
    applicationId: guild,
    publicUrl,
    secret: 'fixture-secret',
    redirectUri: 'http://localhost/casino/discord/callback',
    isReady: () => ready,
    complete: async (id, userId) => {
      if (operatorRequired) throw new Error('Casino operator required');
      verified.push([id, userId]);
    },
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith('/oauth2/token')) {
        assert.ok(new URLSearchParams(String(init?.body)).get('code_verifier'));
        return tokenRejected
          ? new Response('', { status: 401 })
          : Response.json({ access_token: 'fixture-token' });
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
    const startUrl = `${base}/casino/discord/link?challenge=${challenge}&flow=${flow}`;
    const redirect = 'manual' as const;
    returnResult(await fetch(startUrl, { redirect }), 'unavailable', flow);
    assert.equal(calls.length, 0);
    ready = true;
    assert.deepEqual(await (await status()).json(), { available: true });
    async function begin() {
      const start = await fetch(startUrl, { redirect });
      assert.equal(start.status, 302);
      const oauth = new URL(start.headers.get('location')!);
      assert.equal(oauth.searchParams.get('scope'), 'identify');
      assert.equal(oauth.searchParams.get('code_challenge_method'), 'S256');
      const callback = `${base}/casino/discord/callback?state=${oauth.searchParams.get('state')}`;
      const headers = {
        Cookie: start.headers.get('set-cookie')!.split(';')[0],
      };
      return { callback, headers };
    }
    const { callback, headers } = await begin();
    returnResult(
      await fetch(`${callback}&code=fixture&returnTo=https://other.test`, {
        redirect,
      }),
      'expired',
    );
    assert.equal(calls.length, 0);
    const linked = await fetch(`${callback}&code=fixture`, {
      headers,
      redirect,
    });
    returnResult(linked, 'linked', flow);
    assert.equal(linked.headers.get('referrer-policy'), 'no-referrer');
    assert.deepEqual(verified, [[challenge, user]]);
    returnResult(
      await fetch(`${callback}&code=fixture`, { headers, redirect }),
      'expired',
    );
    assert.equal(calls.length, 2);

    const cancelled = await begin();
    returnResult(
      await fetch(`${cancelled.callback}&error=access_denied`, {
        headers: cancelled.headers,
        redirect,
      }),
      'cancelled',
      flow,
    );
    assert.equal(calls.length, 2);

    tokenRejected = true;
    const rejected = await begin();
    returnResult(
      await fetch(`${rejected.callback}&code=fixture`, {
        headers: rejected.headers,
        redirect,
      }),
      'discord-error',
      flow,
    );
    assert.equal(calls.length, 3);

    tokenRejected = false;
    operatorRequired = true;
    const forbidden = await begin();
    returnResult(
      await fetch(`${forbidden.callback}&code=fixture`, {
        headers: forbidden.headers,
        redirect,
      }),
      'operator-required',
      flow,
    );
    assert.deepEqual(verified, [[challenge, user]]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('an unconfigured OAuth server responds with an availability status and a clear error', async () => {
  const app = express();
  attachCasinoLink(app, {
    applicationId: guild,
    publicUrl,
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
      const response = await fetch(`${base}/casino/discord/${path}`, {
        redirect: 'manual',
      });
      returnResult(response, 'unavailable');
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
