import { createSocket, type Socket } from 'node:dgram';
import type { SpeakingSignal, WatchedVoiceChannel } from './speaking.ts';

const API = 'https://discord.com/api/v10';
const VOICE_INTENTS = (1 << 0) | (1 << 7);

export interface GatewayProbe {
  status: number;
  url: string;
}

export interface GatewayFetchResponse {
  status: number;
  text(): Promise<string>;
}

export interface GatewayFetch {
  (
    url: string,
    init: { method: string; headers: Record<string, string> },
  ): Promise<GatewayFetchResponse>;
}

export interface SpeakingGateway {
  listen(
    channels: () => readonly WatchedVoiceChannel[],
    onSpeaking: (signal: SpeakingSignal) => void,
  ): { stop(): void; sync(): void };
}

interface GatewaySocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  addEventListener(
    type: 'close',
    listener: (event: { code: number }) => void,
  ): void;
  addEventListener(type: 'error', listener: () => void): void;
}

interface VoiceControlState {
  ssrcToUser: Map<number, string>;
}

export function voiceStatePayload(
  guildId: string,
  channelId: string | null,
): {
  op: 4;
  d: {
    guild_id: string;
    channel_id: string | null;
    self_mute: true;
    self_deaf: true;
  };
} {
  return {
    op: 4,
    d: {
      guild_id: guildId,
      channel_id: channelId,
      self_mute: true,
      self_deaf: true,
    },
  };
}

export async function probeSpeakingGateway(
  token: string,
  fetchImpl?: GatewayFetch,
): Promise<GatewayProbe> {
  const secret = token.trim();
  if (secret.length === 0) {
    throw new Error('Discord bot token is unset');
  }
  let response: { status: number; text(): Promise<string> };
  try {
    response = await (fetchImpl ?? fetch)(`${API}/gateway/bot`, {
      method: 'GET',
      headers: { Authorization: `Bot ${secret}` },
    });
  } catch {
    throw new Error('Discord speaking gateway request failed');
  }
  const raw = await response.text();
  const body = raw.split(secret).join('[redacted]');
  let url = '';
  if (response.status === 200) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed.url === 'string') {
        url = parsed.url.startsWith('wss://') ? parsed.url : '';
      }
    } catch {
      url = '';
    }
  }
  return { status: response.status, url };
}

export function applyVoiceControlFrame(
  channelId: string,
  text: string,
  state: VoiceControlState,
): SpeakingSignal | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.d) ||
    typeof parsed.op !== 'number'
  ) {
    return undefined;
  }
  const data = parsed.d;
  if (parsed.op === 12) {
    const userId = stringField(data, 'user_id');
    const ssrc = numberField(data, 'audio_ssrc');
    if (userId && ssrc !== undefined) {
      state.ssrcToUser.set(ssrc, userId);
    }
    return undefined;
  }
  if (parsed.op === 13) {
    const userId = stringField(data, 'user_id');
    if (userId) {
      for (const [ssrc, id] of state.ssrcToUser) {
        if (id === userId) {
          state.ssrcToUser.delete(ssrc);
        }
      }
    }
    return undefined;
  }
  if (parsed.op !== 5) {
    return undefined;
  }
  const speaking = numberField(data, 'speaking');
  if (speaking === undefined) {
    return undefined;
  }
  let userId = stringField(data, 'user_id');
  if (!userId) {
    const ssrc = numberField(data, 'ssrc');
    if (ssrc !== undefined) {
      userId = state.ssrcToUser.get(ssrc);
    }
  }
  if (!userId || !/^\d{17,20}$/.test(userId)) {
    return undefined;
  }
  if (!/^\d{17,20}$/.test(channelId)) {
    return undefined;
  }
  return {
    discordUserId: userId,
    discordVoiceChannelId: channelId,
    isSpeaking: (speaking & 1) !== 0,
  };
}

/**
 * IP discovery is 74 bytes. Anything else is not a control packet.
 * Callers drop later datagrams without reading them.
 */
export function readDiscoveryDatagram(
  msg: Uint8Array,
): { address: string; port: number } | undefined {
  if (msg.length !== 74) {
    return undefined;
  }
  const type = ((msg[0] ?? 0) << 8) | (msg[1] ?? 0);
  if (type !== 2) {
    return undefined;
  }
  let address = '';
  for (let i = 8; i < 72; i += 1) {
    const byte = msg[i] ?? 0;
    if (byte === 0) {
      break;
    }
    if (byte < 32 || byte > 126) {
      return undefined;
    }
    address += String.fromCharCode(byte);
  }
  const port = ((msg[72] ?? 0) << 8) | (msg[73] ?? 0);
  if (address.length === 0 || port === 0) {
    return undefined;
  }
  return { address, port };
}

export function createSpeakingGateway(
  token: string,
  probe: GatewayProbe,
  openSocket: (url: string) => GatewaySocket = openGlobalSocket,
): SpeakingGateway {
  return {
    listen(channels, onSpeaking) {
      if (probe.status !== 200 || !probe.url.startsWith('wss://')) {
        return {
          stop(): void {},
          sync(): void {},
        };
      }
      return startGateway(token, probe.url, openSocket, channels, onSpeaking);
    },
  };
}

function startGateway(
  token: string,
  gatewayUrl: string,
  openSocket: (url: string) => GatewaySocket,
  channels: () => readonly WatchedVoiceChannel[],
  onSpeaking: (signal: SpeakingSignal) => void,
): { stop(): void; sync(): void } {
  let stopped = false;
  let sequence: number | null = null;
  let botUserId = '';
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const voiceSockets: GatewaySocket[] = [];
  const udpSockets: Socket[] = [];
  const connected = new Map<string, string>();
  let sessionId = '';
  let voiceToken = '';
  let voiceEndpoint = '';
  let voiceGuildId = '';
  let joinedChannelId = '';
  let voiceOpen = false;

  const gateway = openSocket(
    `${gatewayUrl.replace(/\/$/, '')}/?v=10&encoding=json`,
  );

  function sendGateway(payload: unknown): void {
    if (stopped) {
      return;
    }
    gateway.send(JSON.stringify(payload));
  }

  function sync(): void {
    if (stopped || botUserId.length === 0) {
      return;
    }
    const wanted = channels();
    const byGuild = new Map<string, string[]>();
    for (const item of wanted) {
      const list = byGuild.get(item.guildId) ?? [];
      list.push(item.channelId);
      byGuild.set(item.guildId, list);
    }
    for (const [guildId, channelIds] of byGuild) {
      const current = connected.get(guildId);
      if (current && channelIds.includes(current)) {
        continue;
      }
      const next = channelIds[0];
      if (!next) {
        continue;
      }
      sendGateway(voiceStatePayload(guildId, next));
    }
    for (const guildId of [...connected.keys()]) {
      if (!byGuild.has(guildId)) {
        sendGateway(voiceStatePayload(guildId, null));
        connected.delete(guildId);
      }
    }
  }

  gateway.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(parsed) || typeof parsed.op !== 'number') {
      return;
    }
    if (typeof parsed.s === 'number') {
      sequence = parsed.s;
    }
    if (parsed.op === 10 && isRecord(parsed.d)) {
      const interval = numberField(parsed.d, 'heartbeat_interval') ?? 41250;
      sendGateway({ op: 1, d: sequence });
      heartbeat = setInterval(() => {
        sendGateway({ op: 1, d: sequence });
      }, interval);
      sendGateway({
        op: 2,
        d: {
          token,
          intents: VOICE_INTENTS,
          properties: { os: 'linux', browser: 'cardroom', device: 'cardroom' },
        },
      });
      return;
    }
    if (parsed.op === 7 || parsed.op === 9) {
      return;
    }
    if (
      parsed.op !== 0 ||
      typeof parsed.t !== 'string' ||
      !isRecord(parsed.d)
    ) {
      return;
    }
    if (parsed.t === 'READY') {
      const user = parsed.d.user;
      if (isRecord(user) && typeof user.id === 'string') {
        botUserId = user.id;
      }
      sync();
      return;
    }
    if (parsed.t === 'VOICE_STATE_UPDATE') {
      const userId = stringField(parsed.d, 'user_id');
      if (userId !== botUserId) {
        return;
      }
      sessionId = stringField(parsed.d, 'session_id') ?? '';
      const channelId = stringField(parsed.d, 'channel_id');
      const guildId = stringField(parsed.d, 'guild_id') ?? voiceGuildId;
      if (channelId && guildId) {
        connected.set(guildId, channelId);
        joinedChannelId = channelId;
      }
      openVoiceIfReady();
      return;
    }
    if (parsed.t === 'VOICE_SERVER_UPDATE') {
      voiceToken = stringField(parsed.d, 'token') ?? '';
      voiceEndpoint = stringField(parsed.d, 'endpoint') ?? '';
      voiceGuildId = stringField(parsed.d, 'guild_id') ?? voiceGuildId;
      openVoiceIfReady();
    }
  });

  gateway.addEventListener('close', (event) => {
    if (event.code === 4004) {
      console.log('Discord speaking gateway unauthorized (4004)');
    }
  });

  gateway.addEventListener('error', () => {});

  function openVoiceIfReady(): void {
    if (
      stopped ||
      voiceOpen ||
      botUserId.length === 0 ||
      sessionId.length === 0 ||
      voiceToken.length === 0 ||
      voiceEndpoint.length === 0 ||
      joinedChannelId.length === 0
    ) {
      return;
    }
    voiceOpen = true;
    const channelId = joinedChannelId;
    const guildId = voiceGuildId;
    const endpoint = voiceEndpoint.replace(/^wss?:\/\//, '').replace(/\/$/, '');
    const socket = openSocket(`wss://${endpoint}/?v=8`);
    voiceSockets.push(socket);
    const state: VoiceControlState = { ssrcToUser: new Map() };
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let discovered = false;

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      const signal = applyVoiceControlFrame(channelId, event.data, state);
      if (signal) {
        onSpeaking(signal);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isRecord(parsed) || typeof parsed.op !== 'number') {
        return;
      }
      if (parsed.op === 8 && isRecord(parsed.d)) {
        const interval = numberField(parsed.d, 'heartbeat_interval') ?? 41250;
        let nonce = 0;
        socket.send(JSON.stringify({ op: 3, d: nonce }));
        heartbeatTimer = setInterval(() => {
          nonce += 1;
          socket.send(JSON.stringify({ op: 3, d: nonce }));
        }, interval);
        socket.send(
          JSON.stringify({
            op: 0,
            d: {
              server_id: guildId,
              user_id: botUserId,
              session_id: sessionId,
              token: voiceToken,
            },
          }),
        );
        return;
      }
      if (parsed.op === 2 && isRecord(parsed.d)) {
        const ready = parsed.d;
        const ssrc = numberField(ready, 'ssrc');
        const ip = stringField(ready, 'ip');
        const port = numberField(ready, 'port');
        const mode = selectMode(ready.modes);
        if (ssrc === undefined || !ip || port === undefined || discovered) {
          return;
        }
        const udp = createSocket('udp4');
        udpSockets.push(udp);
        udp.on('error', () => {
          udp.close();
        });
        udp.on('message', (msg: Buffer) => {
          if (discovered) {
            return;
          }
          const found = readDiscoveryDatagram(msg);
          if (!found) {
            return;
          }
          discovered = true;
          socket.send(
            JSON.stringify({
              op: 1,
              d: {
                protocol: 'udp',
                data: {
                  address: found.address,
                  port: found.port,
                  mode,
                },
              },
            }),
          );
        });
        const packet = Buffer.alloc(74);
        packet.writeUInt16BE(1, 0);
        packet.writeUInt16BE(70, 2);
        packet.writeUInt32BE(ssrc, 4);
        udp.send(packet, port, ip);
      }
    });

    socket.addEventListener('error', () => {});
    socket.addEventListener('close', () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    });
  }

  return {
    sync,
    stop(): void {
      stopped = true;
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      for (const guildId of [...connected.keys()]) {
        sendGateway(voiceStatePayload(guildId, null));
      }
      gateway.close();
      for (const socket of voiceSockets) {
        socket.close();
      }
      for (const udp of udpSockets) {
        udp.close();
      }
    },
  };
}

function selectMode(modes: unknown): string {
  if (!Array.isArray(modes)) {
    return 'xsalsa20_poly1305';
  }
  for (const mode of modes) {
    if (mode === 'xsalsa20_poly1305') {
      return mode;
    }
  }
  const first = modes[0];
  if (typeof first === 'string' && first.length > 0 && first.length < 64) {
    return first;
  }
  return 'xsalsa20_poly1305';
}

function openGlobalSocket(url: string): GatewaySocket {
  const SocketCtor = (
    globalThis as { WebSocket?: new (url: string) => GatewaySocket }
  ).WebSocket;
  if (!SocketCtor) {
    throw new Error('WebSocket is unavailable');
  }
  return new SocketCtor(url);
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
