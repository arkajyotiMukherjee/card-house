import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  leaderboardContent,
  readLeaderboard,
  attachLeaderboardWatch,
} from './leaderboard.ts';
import { handleInteraction } from './interactions.ts';
import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import type { DiscordRequest, DiscordApi } from './discord-http.ts';

const wallets = [
  { id: 'a', name: 'Ada', available: 100n, committed: 200n, profit: 21n },
  { id: 'b', name: '@everyone Bob', available: 200n, profit: 21n },
  { id: 'c', name: 'Casey', available: 500n, profit: -42n },
];
test('rank by profit, split tied ranks, count committed coins, suppress mentions and paginate', () => {
  const content = leaderboardContent('ABCD', wallets);
  assert.match(content, /1\. Ada — \+10\.5 net · 150 total/);
  assert.match(content, /1\. everyone Bob/);
  assert.match(content, /3\. Casey — -21 net/);
  assert.ok(!content.includes('@everyone'));
  const many = Array.from({ length: 21 }, (_, index) => ({
    id: String(index),
    name: 'Player ' + index,
    available: 100n,
    profit: BigInt(100 - index),
  }));
  assert.match(leaderboardContent('ABCD', many, 3), /21\. Player 20/);
  assert.match(leaderboardContent('ABCD', many, 3), /Page 3\/3/);
});

function fixture() {
  const rooms = [
    {
      id: 'room',
      code: 'ABCD',
      discordChannelId: '12345678901234567',
      status: { tag: 'Open' },
    },
  ];
  const settlements = [
    { id: 'hand1', lobbyId: 'room', createdAt: { microsSinceUnixEpoch: 1n } },
  ];
  let delivered:
    { lobbyId: string; messageId: string; revision: string } | undefined;
  const hooks = new Set<() => void>();
  const requests: DiscordRequest[] = [];
  let failure = 0;
  let rejectRecord = false;
  let remote: unknown[] = [];
  const connection = {
    db: {
      lobby: {
        iter: () => rooms,
        id: { find: (id: string) => rooms.find((row) => row.id === id) },
      },
      roomWallet: {
        iter: () => wallets.map((row) => ({ ...row, lobbyId: 'room' })),
      },
      tableFunding: { iter: () => [] },
      gameSettlement: {
        iter: () => settlements,
        onInsert: (fn: () => void) => hooks.add(fn),
        removeOnInsert: (fn: () => void) => hooks.delete(fn),
      },
      discordLeaderboard: { lobbyId: { find: () => delivered } },
    },
    reducers: {
      recordDiscordLeaderboard: async (row: typeof delivered) => {
        if (rejectRecord) throw Error('restart before recording');
        delivered = row;
      },
    },
  } as unknown as DbConnection;
  const api: DiscordApi = {
    async request(req) {
      requests.push(req);
      if (failure) return { status: failure, body: {}, headers: {} };
      if (req.method === 'GET')
        return { status: 200, body: remote, headers: {} };
      if (req.method === 'POST') {
        remote = [
          {
            id: '99999999999999999',
            author: { bot: true },
            embeds: [{ footer: { text: 'Card House room room' } }],
          },
        ];
        return { status: 200, body: { id: '99999999999999999' }, headers: {} };
      }
      return { status: 200, body: {}, headers: {} };
    },
  };
  return {
    connection,
    api,
    requests,
    rooms,
    settlements,
    hooks,
    delivered: () => delivered,
    failure: (status: number) => {
      failure = status;
    },
    rejectRecord: (value: boolean) => {
      rejectRecord = value;
    },
  };
}
async function flush() {
  for (let index = 0; index < 8; index += 1)
    await new Promise((resolve) => setImmediate(resolve));
}

test('refresh one durable message, coalesce hands, recover restarts and retry rate limits', async () => {
  const state = fixture();
  let stop = attachLeaderboardWatch(state.connection, state.api);
  await flush();
  assert.equal(state.requests.filter((row) => row.method === 'POST').length, 1);
  assert.equal(state.delivered()?.revision, 'hand1');
  const posted = state.requests.find((row) => row.method === 'POST')!.body as {
    enforce_nonce: boolean;
    allowed_mentions: { parse: unknown[] };
  };
  assert.equal(posted.enforce_nonce, true);
  assert.deepEqual(posted.allowed_mentions.parse, []);
  state.settlements.push({
    id: 'hand2',
    lobbyId: 'room',
    createdAt: { microsSinceUnixEpoch: 2n },
  });
  state.failure(429);
  for (const fn of state.hooks) fn();
  await flush();
  assert.equal(state.delivered()?.revision, 'hand1');
  state.failure(0);
  for (const fn of state.hooks) fn();
  await flush();
  assert.equal(state.delivered()?.revision, 'hand2');
  assert.equal(state.requests.filter((row) => row.method === 'POST').length, 1);
  stop();
  const beforeRestart = state.requests.length;
  stop = attachLeaderboardWatch(state.connection, state.api);
  await flush();
  assert.equal(state.requests.length, beforeRestart);
  stop();
});

test('recover an accepted POST when the process stopped before recording its id', async () => {
  const state = fixture();
  state.rejectRecord(true);
  let stop = attachLeaderboardWatch(state.connection, state.api);
  await flush();
  stop();
  assert.equal(state.delivered(), undefined);
  state.rejectRecord(false);
  stop = attachLeaderboardWatch(state.connection, state.api);
  await flush();
  stop();
  assert.equal(state.requests.filter((row) => row.method === 'POST').length, 1);
  assert.equal(state.delivered()?.messageId, '99999999999999999');
  assert.ok(state.requests.some((row) => row.method === 'PATCH'));
});

test('leaderboard commands use the linked channel and forward code/page', async () => {
  const state = fixture();
  assert.match(
    readLeaderboard(state.connection, '12345678901234567'),
    /Room ABCD/,
  );
  assert.throws(() => readLeaderboard(state.connection, 'other', 'ABCD'));
  let received: unknown;
  const reply = await handleInteraction(
    {
      type: 2,
      channel_id: '12345678901234567',
      data: {
        name: 'cardhouse',
        options: [
          {
            name: 'leaderboard',
            options: [
              { name: 'roomcode', value: 'ABCD' },
              { name: 'page', value: 2 },
            ],
          },
        ],
      },
    },
    {
      createLobby: async () => {
        throw Error('unused');
      },
      lobbyStatus: () => {
        throw Error('unused');
      },
      closeRoom: () => {
        throw Error('unused');
      },
      leaderboard: (channel, code, page) => {
        received = [channel, code, page];
        return 'Rankings';
      },
    },
  );
  assert.deepEqual(received, ['12345678901234567', 'ABCD', 2]);
  assert.equal(reply.data?.content, 'Rankings');
});
