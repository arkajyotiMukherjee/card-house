import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DiscordHttpError,
  discordRestApi,
  probeDiscordBot,
  type DiscordFetchResponse,
} from './discord-http.ts';
import { voiceChannelClient } from './voice-channels.ts';

const TOKEN = 'secret-token';

function headers(values: Record<string, string>): {
  get(name: string): string | null;
} {
  const map = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name: string): string | null {
      return map.get(name.toLowerCase()) ?? null;
    },
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headerValues: Record<string, string> = {},
): DiscordFetchResponse {
  return {
    status,
    headers: headers(headerValues),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

test('a short 429 is retried once', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  let clock = 1_000;
  const api = discordRestApi({
    token: TOKEN,
    maxWaitMs: 1_000,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    fetchImpl: () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          jsonResponse(429, { retry_after: 0.05, global: false }),
        );
      }
      return Promise.resolve(jsonResponse(200, { ok: true }));
    },
  });
  const response = await api.request({ method: 'GET', path: '/users/@me' });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [50]);
});

test('a long 429 fails without waiting it out', async () => {
  const sleeps: number[] = [];
  const api = discordRestApi({
    token: TOKEN,
    maxWaitMs: 1_000,
    now: () => 1_000,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    fetchImpl: () =>
      Promise.resolve(jsonResponse(429, { retry_after: 30, global: true })),
  });
  await assert.rejects(
    () => api.request({ method: 'POST', path: '/guilds/1/channels' }),
    (error: unknown) => {
      assert.ok(error instanceof DiscordHttpError);
      assert.equal(error.status, 429);
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    },
  );
  assert.deepEqual(sleeps, []);
});

test('an exhausted bucket waits until reset', async () => {
  const sleeps: number[] = [];
  let clock = 5_000;
  const seen: string[] = [];
  const api = discordRestApi({
    token: TOKEN,
    maxWaitMs: 1_000,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    fetchImpl: (_url, init) => {
      seen.push(init.method);
      assert.equal(init.headers.Authorization, `Bot ${TOKEN}`);
      if (seen.length === 1) {
        return Promise.resolve(
          jsonResponse(
            200,
            { ok: true },
            {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset-after': '0.25',
            },
          ),
        );
      }
      return Promise.resolve(
        jsonResponse(
          200,
          { ok: true },
          { 'x-ratelimit-remaining': '1', 'x-ratelimit-reset-after': '1' },
        ),
      );
    },
  });
  await api.request({ method: 'GET', path: '/users/@me' });
  await api.request({ method: 'GET', path: '/users/@me' });
  assert.deepEqual(sleeps, [250]);
  assert.equal(seen.length, 2);
});

test('401 from Discord does not invent a channel id', async () => {
  const api = discordRestApi({
    token: TOKEN,
    fetchImpl: () =>
      Promise.resolve(jsonResponse(401, { message: '401: Unauthorized' })),
  });
  const voice = voiceChannelClient(api);
  await assert.rejects(
    () => voice.createVoiceChannel('223456789012345678', 'room-ab3d-voice'),
    (error: unknown) => {
      assert.ok(error instanceof DiscordHttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, 'Discord request failed (401)');
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    },
  );
});

test('probe keeps the token out of the recorded body', async () => {
  const probe = await probeDiscordBot(TOKEN, () =>
    Promise.resolve(jsonResponse(401, { message: `bad ${TOKEN}`, code: 0 })),
  );
  assert.equal(probe.status, 401);
  assert.equal(probe.body.includes(TOKEN), false);
  assert.match(probe.body, /\[redacted\]/);
});
