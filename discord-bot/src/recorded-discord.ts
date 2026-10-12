import type {
  DiscordApi,
  DiscordRequest,
  DiscordResponse,
} from './discord-http.ts';

const VOICE = 2;

export interface RecordedChannel {
  id: string;
  guildId: string;
  name: string;
  type: number;
}

export interface RecordedCall {
  method: string;
  path: string;
  body?: unknown;
}

export interface RecordedDiscordApi extends DiscordApi {
  calls: RecordedCall[];
  channels(): RecordedChannel[];
}

export function recordedDiscordApi(): RecordedDiscordApi {
  const calls: RecordedCall[] = [];
  const channels = new Map<string, RecordedChannel>();
  let next = 900000000000000000n;

  return {
    calls,
    channels(): RecordedChannel[] {
      return [...channels.values()];
    },
    request(req: DiscordRequest): Promise<DiscordResponse> {
      calls.push({ method: req.method, path: req.path, body: req.body });
      const created = createChannel(req, channels, () => {
        next += 1n;
        return next.toString();
      });
      if (created) {
        return Promise.resolve(created);
      }
      const removed = deleteChannel(req, channels);
      if (removed) {
        return Promise.resolve(removed);
      }
      return Promise.resolve({ status: 404, body: null, headers: {} });
    },
  };
}

function createChannel(
  req: DiscordRequest,
  channels: Map<string, RecordedChannel>,
  nextId: () => string,
): DiscordResponse | undefined {
  if (
    req.method !== 'POST' ||
    !/^\/guilds\/\d{17,20}\/channels$/.test(req.path)
  ) {
    return undefined;
  }
  const guildId = req.path.split('/')[2] ?? '';
  const name = readName(req.body);
  const type = readType(req.body);
  if (name.length === 0 || type !== VOICE) {
    return {
      status: 400,
      body: { message: 'voice channel required' },
      headers: {},
    };
  }
  const id = nextId();
  const channel = { id, guildId, name, type: VOICE };
  channels.set(id, channel);
  return {
    status: 201,
    body: { id, guild_id: guildId, name, type: VOICE },
    headers: {},
  };
}

function deleteChannel(
  req: DiscordRequest,
  channels: Map<string, RecordedChannel>,
): DiscordResponse | undefined {
  if (req.method !== 'DELETE' || !/^\/channels\/\d{17,20}$/.test(req.path)) {
    return undefined;
  }
  const id = req.path.split('/')[2] ?? '';
  if (!channels.has(id)) {
    return { status: 404, body: null, headers: {} };
  }
  channels.delete(id);
  return { status: 204, body: null, headers: {} };
}

function readName(body: unknown): string {
  if (!isRecord(body) || typeof body.name !== 'string') {
    return '';
  }
  return body.name;
}

function readType(body: unknown): number | undefined {
  if (!isRecord(body) || typeof body.type !== 'number') {
    return undefined;
  }
  return body.type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
