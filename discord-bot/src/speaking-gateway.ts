import {
  Networking,
  type ConnectionOptions,
  type NetworkingState,
  type VoiceWebSocket,
} from '@discordjs/voice';
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
  packet: unknown,
  state: VoiceControlState,
): SpeakingSignal | undefined {
  if (
    !isRecord(packet) ||
    !isRecord(packet.d) ||
    typeof packet.op !== 'number'
  ) {
    return undefined;
  }
  const data = packet.d;
  if (packet.op === 12) {
    const userId = stringField(data, 'user_id');
    const ssrc = numberField(data, 'audio_ssrc');
    if (userId && ssrc !== undefined) {
      state.ssrcToUser.set(ssrc, userId);
    }
    return undefined;
  }
  if (packet.op === 13) {
    const userId = stringField(data, 'user_id');
    if (userId) {
      for (const [ssrc, id] of state.ssrcToUser) {
        if (id === userId) {
          state.ssrcToUser.delete(ssrc);
        }
      }
    }
    return userId && /^\d{17,20}$/.test(userId)
      ? {
          discordUserId: userId,
          discordVoiceChannelId: channelId,
          isSpeaking: false,
        }
      : undefined;
  }
  if (packet.op !== 5) {
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

type VoiceConnection = Pick<Networking, 'state' | 'on' | 'destroy'>;

export function createSpeakingGateway(
  token: string,
  probe: GatewayProbe,
  openSocket: (url: string) => GatewaySocket = openGlobalSocket,
  connectVoice: (options: ConnectionOptions) => VoiceConnection = (options) =>
    new Networking(options, { daveEncryption: true }),
): SpeakingGateway {
  return {
    listen(channels, onSpeaking) {
      if (probe.status !== 200 || !probe.url.startsWith('wss://')) {
        return {
          stop(): void {},
          sync(): void {},
        };
      }
      return startGateway(
        token,
        probe.url,
        openSocket,
        connectVoice,
        channels,
        onSpeaking,
      );
    },
  };
}

function startGateway(
  token: string,
  gatewayUrl: string,
  openSocket: (url: string) => GatewaySocket,
  connectVoice: (options: ConnectionOptions) => VoiceConnection,
  channels: () => readonly WatchedVoiceChannel[],
  onSpeaking: (signal: SpeakingSignal) => void,
): { stop(): void; sync(): void } {
  let stopped = false;
  let sequence: number | null = null;
  let botUserId = '';
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const requested = new Map<string, string>();
  interface VoiceSession {
    channelId?: string;
    sessionId?: string;
    token?: string;
    endpoint?: string;
    close?: () => void;
  }
  const sessions = new Map<string, VoiceSession>();

  function clearVoice(guildId: string): void {
    const voice = sessions.get(guildId);
    sessions.delete(guildId);
    voice?.close?.();
  }

  let gateway: GatewaySocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let voiceRetry: ReturnType<typeof setTimeout> | undefined;

  function sendGateway(payload: unknown): void {
    if (!stopped) gateway?.send(JSON.stringify(payload));
  }

  function scheduleSync(): void {
    if (stopped || voiceRetry) return;
    voiceRetry = setTimeout(() => {
      voiceRetry = undefined;
      sync();
    }, 5000);
    voiceRetry.unref();
  }

  function sync(): void {
    if (stopped || botUserId.length === 0) {
      return;
    }
    const wanted = new Map(
      channels().map((item) => [item.guildId, item.channelId]),
    );
    for (const [guildId, next] of wanted) {
      if (requested.get(guildId) === next) continue;
      clearVoice(guildId);
      requested.set(guildId, next);
      sendGateway(voiceStatePayload(guildId, next));
    }
    for (const guildId of requested.keys()) {
      if (!wanted.has(guildId)) {
        requested.delete(guildId);
        clearVoice(guildId);
        sendGateway(voiceStatePayload(guildId, null));
      }
    }
  }

  function connect(): void {
    sequence = null;
    const socket = openSocket(
      `${gatewayUrl.replace(/\/$/, '')}/?v=10&encoding=json`,
    );
    gateway = socket;
    socket.addEventListener('message', (event) => {
      if (gateway !== socket || typeof event.data !== 'string') {
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
        if (heartbeat) clearInterval(heartbeat);
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
            properties: {
              os: 'linux',
              browser: 'cardroom',
              device: 'cardroom',
            },
          },
        });
        return;
      }
      if (parsed.op === 1) {
        sendGateway({ op: 1, d: sequence });
        return;
      }
      if (parsed.op === 7 || parsed.op === 9) {
        socket.close();
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
      const guildId = stringField(parsed.d, 'guild_id');
      if (!guildId || !requested.has(guildId)) return;
      const voice = sessions.get(guildId) ?? {};
      if (
        parsed.t === 'VOICE_STATE_UPDATE' &&
        stringField(parsed.d, 'user_id') === botUserId
      ) {
        const channelId = stringField(parsed.d, 'channel_id');
        if (parsed.d.channel_id === null) {
          clearVoice(guildId);
          requested.delete(guildId);
          scheduleSync();
          return;
        }
        if (!channelId || channelId !== requested.get(guildId)) return;
        const sessionId = stringField(parsed.d, 'session_id');
        if (voice.close && voice.sessionId !== sessionId) {
          voice.close();
          voice.close = undefined;
        }
        voice.channelId = channelId;
        voice.sessionId = sessionId;
      } else if (parsed.t === 'VOICE_SERVER_UPDATE') {
        const token = stringField(parsed.d, 'token');
        const endpoint = stringField(parsed.d, 'endpoint');
        if (voice.endpoint !== endpoint || voice.token !== token) {
          voice.close?.();
          voice.close = undefined;
        }
        voice.token = token;
        voice.endpoint = endpoint;
      } else return;
      sessions.set(guildId, voice);
      openVoiceIfReady(guildId, voice);
    });

    socket.addEventListener('close', (event) => {
      if (gateway !== socket) return;
      gateway = undefined;
      botUserId = '';
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
      for (const guildId of sessions.keys()) clearVoice(guildId);
      requested.clear();
      if (stopped) return;
      if (event.code === 4004) {
        console.log('Discord speaking gateway unauthorized (4004)');
        return;
      }
      retry = setTimeout(connect, 5000);
      retry.unref();
    });
    socket.addEventListener('error', () =>
      console.error('Discord speaking gateway error'),
    );
  }

  function openVoiceIfReady(guildId: string, voice: VoiceSession): void {
    const { channelId, sessionId, token, endpoint: address } = voice;
    if (
      stopped ||
      voice.close ||
      !botUserId ||
      !channelId ||
      !sessionId ||
      !token ||
      !address
    )
      return;
    const network = connectVoice({
      endpoint: address.replace(/^wss?:\/\//, '').replace(/\/$/, ''),
      serverId: guildId,
      channelId,
      sessionId,
      userId: botUserId,
      token,
    });
    const state: VoiceControlState = { ssrcToUser: new Map() };
    const speaking = new Set<string>();
    const handlePacket = (packet: unknown): void => {
      const signal = applyVoiceControlFrame(channelId, packet, state);
      if (!signal) return;
      if (signal.isSpeaking) {
        if (speaking.has(signal.discordUserId)) return;
        speaking.add(signal.discordUserId);
      } else if (!speaking.delete(signal.discordUserId)) return;
      onSpeaking(signal);
    };
    let controlSocket: VoiceWebSocket | undefined;
    const bindControlSocket = (next: NetworkingState): void => {
      const ws = 'ws' in next ? next.ws : undefined;
      if (ws === controlSocket) return;
      controlSocket?.off('packet', handlePacket);
      controlSocket = ws;
      ws?.on('packet', handlePacket);
    };
    voice.close = () => {
      controlSocket?.off('packet', handlePacket);
      controlSocket = undefined;
      network.destroy();
      for (const discordUserId of speaking)
        onSpeaking({
          discordUserId,
          discordVoiceChannelId: channelId,
          isSpeaking: false,
        });
      speaking.clear();
    };
    network.on('stateChange', (_previous, next) => bindControlSocket(next));
    const reconnectVoice = (): void => {
      if (sessions.get(guildId) !== voice) return;
      clearVoice(guildId);
      requested.delete(guildId);
      scheduleSync();
    };
    network.on('error', () => {
      console.error('Discord voice connection error');
      reconnectVoice();
    });
    network.on('close', (code) => {
      console.error(`Discord voice connection closed (${code})`);
      reconnectVoice();
    });
    // Only subscribe to voice gateway control packets. Networking handles
    // DAVE and UDP discovery without installing a voice receiver.
    bindControlSocket(network.state);
  }

  connect();
  return {
    sync,
    stop(): void {
      if (heartbeat) clearInterval(heartbeat);
      for (const guildId of requested.keys())
        sendGateway(voiceStatePayload(guildId, null));
      stopped = true;
      if (retry) clearTimeout(retry);
      if (voiceRetry) clearTimeout(voiceRetry);
      gateway?.close();
      for (const guildId of sessions.keys()) clearVoice(guildId);
    },
  };
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
