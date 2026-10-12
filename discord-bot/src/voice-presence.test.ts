import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectVoiceGateway, type GatewaySocket } from './voice-gateway.ts';
import {
  recordVoiceState,
  syncGuildVoice,
  type PresenceSnapshot,
  type VoiceStateEvent,
} from './voice-presence.ts';

const GUILD = '223456789012345678';
const LOBBY_VOICE = '423456789012345678';
const TABLE_VOICE = '523456789012345678';
const OTHER_VOICE = '623456789012345678';
const ADA = '723456789012345678';
const BEA = '823456789012345678';

function fixture(): {
  snapshot: PresenceSnapshot;
  calls: Array<{ discordUserId: string; discordVoiceChannelId: string }>;
  presence: Array<{ discordUserId: string; lobbyId: string }>;
} {
  const calls: Array<{
    discordUserId: string;
    discordVoiceChannelId: string;
  }> = [];
  const presence: Array<{ discordUserId: string; lobbyId: string }> = [];
  const snapshot: PresenceSnapshot = {
    reducers: {
      updateVoicePresence: (args) => {
        calls.push(args);
        return Promise.resolve();
      },
    },
    db: {
      lobby: {
        iter: () => [
          {
            id: 'lobby_1',
            discordGuildId: GUILD,
            discordLobbyVoiceChannelId: LOBBY_VOICE,
          },
        ],
      },
      gameTable: { iter: () => [{ discordVoiceChannelId: TABLE_VOICE }] },
      voicePresence: { iter: () => presence },
    },
  };
  return { snapshot, calls, presence };
}

test('a user joining the table voice channel is recorded with ids only', async () => {
  const { snapshot, calls } = fixture();
  await recordVoiceState(snapshot, { userId: ADA, channelId: TABLE_VOICE });
  assert.deepEqual(calls, [
    { discordUserId: ADA, discordVoiceChannelId: TABLE_VOICE },
  ]);
});

test('leaving voice sends an empty channel only for a user with a headset', async () => {
  const { snapshot, calls, presence } = fixture();
  await recordVoiceState(snapshot, { userId: ADA, channelId: null });
  assert.deepEqual(calls, []);
  presence.push({ discordUserId: ADA, lobbyId: 'lobby_1' });
  await recordVoiceState(snapshot, { userId: ADA, channelId: null });
  assert.deepEqual(calls, [{ discordUserId: ADA, discordVoiceChannelId: '' }]);
});

test('a channel the module does not store is ignored', async () => {
  const { snapshot, calls } = fixture();
  await recordVoiceState(snapshot, { userId: ADA, channelId: OTHER_VOICE });
  assert.deepEqual(calls, []);
});

test('a guild snapshot records members and clears a user who is gone', async () => {
  const { snapshot, calls, presence } = fixture();
  presence.push({ discordUserId: BEA, lobbyId: 'lobby_1' });
  await syncGuildVoice(snapshot, GUILD, [
    { userId: ADA, channelId: LOBBY_VOICE },
  ]);
  assert.deepEqual(calls, [
    { discordUserId: ADA, discordVoiceChannelId: LOBBY_VOICE },
    { discordUserId: BEA, discordVoiceChannelId: '' },
  ]);
});

function fakeSocket(): GatewaySocket & {
  sent: unknown[];
  deliver(frame: unknown): void;
  closed: boolean;
} {
  const socket = {
    sent: [] as unknown[],
    closed: false,
    onopen: null,
    onmessage: null as GatewaySocket['onmessage'],
    onclose: null,
    onerror: null,
    send(data: string) {
      socket.sent.push(JSON.parse(data));
    },
    close() {
      socket.closed = true;
    },
    deliver(frame: unknown) {
      socket.onmessage?.({ data: JSON.stringify(frame) });
    },
  };
  return socket;
}

test('the gateway identifies for voice states and passes ids through', () => {
  const socket = fakeSocket();
  const guilds: Array<{ guildId: string; states: VoiceStateEvent[] }> = [];
  const updates: VoiceStateEvent[] = [];
  const stop = connectVoiceGateway({
    token: 'test-token',
    openSocket: () => socket,
    handlers: {
      onGuildVoice: (guildId, states) => guilds.push({ guildId, states }),
      onVoiceState: (_guildId, state) => updates.push(state),
    },
  });
  socket.deliver({ op: 10, d: { heartbeat_interval: 60_000 } });
  const identify = socket.sent[0] as {
    op: number;
    d: { intents: number };
  };
  assert.equal(identify.op, 2);
  assert.equal(identify.d.intents, (1 << 0) | (1 << 7));

  socket.deliver({
    op: 0,
    t: 'GUILD_CREATE',
    s: 1,
    d: {
      id: GUILD,
      voice_states: [
        { user_id: ADA, channel_id: TABLE_VOICE, self_mute: true },
      ],
    },
  });
  socket.deliver({
    op: 0,
    t: 'VOICE_STATE_UPDATE',
    s: 2,
    d: { guild_id: GUILD, user_id: ADA, channel_id: null },
  });
  stop();
  assert.deepEqual(guilds, [
    {
      guildId: GUILD,
      states: [{ userId: ADA, channelId: TABLE_VOICE }],
    },
  ]);
  assert.deepEqual(updates, [{ userId: ADA, channelId: null }]);
  assert.equal(socket.closed, true);
});
