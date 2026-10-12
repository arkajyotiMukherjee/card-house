import type { VoiceStateEvent } from './voice-presence.ts';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const INTENT_GUILDS = 1 << 0;
const INTENT_GUILD_VOICE_STATES = 1 << 7;

export interface GatewaySocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface VoiceGatewayHandlers {
  onGuildVoice(guildId: string, states: VoiceStateEvent[]): void;
  onVoiceState(guildId: string, state: VoiceStateEvent): void;
}

export interface VoiceGatewayOptions {
  token: string;
  handlers: VoiceGatewayHandlers;
  openSocket?: (url: string) => GatewaySocket;
  reconnectMs?: number;
}

/**
 * Listens to Discord voice state updates through the gateway. It subscribes to
 * guild and voice-state events only. A voice state carries a user id and a
 * channel id, never audio. The token is sent in Identify and is never logged.
 */
export function connectVoiceGateway(options: VoiceGatewayOptions): () => void {
  const open =
    options.openSocket ??
    ((url: string): GatewaySocket =>
      new WebSocket(url) as unknown as GatewaySocket);
  const reconnectMs = options.reconnectMs ?? 5_000;
  let stopped = false;
  let socket: GatewaySocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let sequence: number | null = null;

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  }

  function scheduleReconnect(): void {
    stopHeartbeat();
    if (stopped || retry !== undefined) {
      return;
    }
    retry = setTimeout(() => {
      retry = undefined;
      connect();
    }, reconnectMs);
  }

  function connect(): void {
    sequence = null;
    const current = open(GATEWAY_URL);
    socket = current;
    current.onmessage = (event) => {
      handleFrame(current, event.data);
    };
    current.onclose = () => {
      scheduleReconnect();
    };
    current.onerror = () => {
      console.error('Discord gateway error');
    };
  }

  function handleFrame(current: GatewaySocket, raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(frame) || typeof frame.op !== 'number') {
      return;
    }
    if (typeof frame.s === 'number') {
      sequence = frame.s;
    }
    if (frame.op === 10 && isRecord(frame.d)) {
      const every = Number(frame.d.heartbeat_interval);
      stopHeartbeat();
      if (Number.isFinite(every) && every > 0) {
        heartbeat = setInterval(() => {
          current.send(JSON.stringify({ op: 1, d: sequence }));
        }, every);
      }
      current.send(
        JSON.stringify({
          op: 2,
          d: {
            token: options.token,
            intents: INTENT_GUILDS | INTENT_GUILD_VOICE_STATES,
            properties: {
              os: 'linux',
              browser: 'discordcardgames',
              device: 'discordcardgames',
            },
          },
        }),
      );
      return;
    }
    if (frame.op === 1) {
      current.send(JSON.stringify({ op: 1, d: sequence }));
      return;
    }
    if (frame.op === 7 || frame.op === 9) {
      current.close();
      return;
    }
    if (frame.op !== 0 || !isRecord(frame.d)) {
      return;
    }
    if (frame.t === 'GUILD_CREATE') {
      const guildId = stringField(frame.d, 'id');
      if (guildId === undefined) {
        return;
      }
      const states: VoiceStateEvent[] = [];
      const list = Array.isArray(frame.d.voice_states)
        ? frame.d.voice_states
        : [];
      for (const entry of list) {
        const state = readState(entry);
        if (state) {
          states.push(state);
        }
      }
      options.handlers.onGuildVoice(guildId, states);
      return;
    }
    if (frame.t === 'VOICE_STATE_UPDATE') {
      const guildId = stringField(frame.d, 'guild_id');
      const state = readState(frame.d);
      if (guildId !== undefined && state) {
        options.handlers.onVoiceState(guildId, state);
      }
    }
  }

  connect();
  return () => {
    stopped = true;
    stopHeartbeat();
    if (retry !== undefined) {
      clearTimeout(retry);
      retry = undefined;
    }
    socket?.close();
  };
}

function readState(value: unknown): VoiceStateEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const userId = stringField(value, 'user_id');
  if (userId === undefined) {
    return undefined;
  }
  const channel = value.channel_id;
  return {
    userId,
    channelId: typeof channel === 'string' ? channel : null,
  };
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
