import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSpeakingReporter,
  SPEAKING_DEBOUNCE_MS,
  speakingSignal,
  watchedVoiceChannels,
  type SpeakingSignal,
} from './speaking.ts';
import {
  applyVoiceControlFrame,
  createSpeakingGateway,
  probeSpeakingGateway,
  readDiscoveryDatagram,
  voiceStatePayload,
} from './speaking-gateway.ts';

const USER = '111111111111111111';
const OTHER = '222222222222222222';
const CHANNEL = '523456789012345678';
const LOBBY_CHANNEL = '423456789012345678';
const GUILD = '223456789012345678';

test('a speaking signal keeps only the user, the channel, and the boolean', () => {
  const signal = speakingSignal({
    discordUserId: ` ${USER} `,
    discordVoiceChannelId: CHANNEL,
    isSpeaking: true,
  });
  assert.deepEqual(Object.keys(signal).sort(), [
    'discordUserId',
    'discordVoiceChannelId',
    'isSpeaking',
  ]);
  assert.equal(signal.discordUserId, USER);
  assert.equal(JSON.stringify(signal).includes('audio'), false);
  assert.ok(SPEAKING_DEBOUNCE_MS < 500);
});

test('rapid speaking toggles send the latest boolean once', async () => {
  const sent: SpeakingSignal[] = [];
  const waits: number[] = [];
  const reporter = createSpeakingReporter(
    async (signal) => {
      sent.push(signal);
    },
    {
      debounceMs: 30,
      onSend: (_signal, waitedMs) => {
        waits.push(waitedMs);
      },
    },
  );
  reporter.note({
    discordUserId: USER,
    discordVoiceChannelId: CHANNEL,
    isSpeaking: true,
  });
  reporter.note({
    discordUserId: USER,
    discordVoiceChannelId: CHANNEL,
    isSpeaking: false,
  });
  reporter.note({
    discordUserId: USER,
    discordVoiceChannelId: CHANNEL,
    isSpeaking: true,
  });
  await delay(80);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.isSpeaking, true);
  assert.equal(sent[0]?.discordUserId, USER);
  assert.ok((waits[0] ?? 999) < 500);
});

test('voice control frames do not forward audio fields', () => {
  const state = { ssrcToUser: new Map<number, string>() };
  const mapped = applyVoiceControlFrame(
    CHANNEL,
    JSON.stringify({
      op: 12,
      d: { user_id: OTHER, audio_ssrc: 9, audio: 'opus-payload' },
    }),
    state,
  );
  assert.equal(mapped, undefined);
  const signal = applyVoiceControlFrame(
    CHANNEL,
    JSON.stringify({
      op: 5,
      d: { speaking: 0, ssrc: 9, delay: 0, packet: 'rtp-audio' },
    }),
    state,
  );
  assert.deepEqual(signal, {
    discordUserId: OTHER,
    discordVoiceChannelId: CHANNEL,
    isSpeaking: false,
  });
  assert.equal(JSON.stringify(signal).includes('rtp'), false);
  assert.equal(JSON.stringify(signal).includes('opus'), false);
});

test('discovery reads an address and drops other datagrams', () => {
  const audio = Buffer.from('opus-audio-payload-not-a-discovery-packet');
  assert.equal(readDiscoveryDatagram(audio), undefined);
  const packet = Buffer.alloc(74);
  packet.writeUInt16BE(2, 0);
  packet.write('203.0.113.8', 8);
  packet.writeUInt16BE(12345, 72);
  assert.deepEqual(readDiscoveryDatagram(packet), {
    address: '203.0.113.8',
    port: 12345,
  });
});

test('a voice join is deafened and muted', () => {
  const payload = voiceStatePayload(GUILD, CHANNEL);
  assert.equal(payload.d.self_deaf, true);
  assert.equal(payload.d.self_mute, true);
  assert.equal(payload.d.channel_id, CHANNEL);
  assert.equal(JSON.stringify(payload).includes('audio'), false);
});

test('an unauthorized gateway does not open a socket', () => {
  let opened = 0;
  const gateway = createSpeakingGateway(
    'not-a-real-token',
    { status: 401, url: '' },
    () => {
      opened += 1;
      throw new Error('socket opened');
    },
  );
  const session = gateway.listen(
    () => [],
    () => {},
  );
  session.sync();
  session.stop();
  assert.equal(opened, 0);
});

test('a gateway probe redacts the token', async () => {
  const secret = 'super-secret-token-value';
  const probe = await probeSpeakingGateway(secret, async () => ({
    status: 401,
    text: async () => `unauthorized ${secret}`,
  }));
  assert.equal(probe.status, 401);
  assert.equal(probe.url, '');
  assert.equal(JSON.stringify(probe).includes(secret), false);
});

test('watched channels include lobby and table voice', () => {
  const channels = watchedVoiceChannels({
    db: {
      lobby: {
        iter: () => [
          {
            id: 'lobby_1',
            discordGuildId: GUILD,
            discordLobbyVoiceChannelId: LOBBY_CHANNEL,
          },
        ],
      },
      gameTable: {
        iter: () => [{ lobbyId: 'lobby_1', discordVoiceChannelId: CHANNEL }],
      },
    },
  });
  assert.deepEqual(channels, [
    { guildId: GUILD, channelId: LOBBY_CHANNEL },
    { guildId: GUILD, channelId: CHANNEL },
  ]);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
