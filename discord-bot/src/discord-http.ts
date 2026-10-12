export class DiscordHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | undefined;

  constructor(status: number, retryAfterMs?: number) {
    super(
      status === 429
        ? 'Discord rate limited'
        : `Discord request failed (${status})`,
    );
    this.name = 'DiscordHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface DiscordRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
}

export interface DiscordResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface DiscordApi {
  request(req: DiscordRequest): Promise<DiscordResponse>;
}

export interface DiscordFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface DiscordFetch {
  (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<DiscordFetchResponse>;
}

export interface DiscordRestOptions {
  token: string;
  fetchImpl?: DiscordFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
}

const API = 'https://discord.com/api/v10';

export function discordRestApi(options: DiscordRestOptions): DiscordApi {
  const token = options.token.trim();
  if (token.length === 0) {
    throw new Error('Discord bot token is required');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? delay;
  const maxWaitMs = options.maxWaitMs ?? 1_500;
  const buckets = new Map<string, { remaining: number; resetAt: number }>();
  let globalResetAt = 0;
  let chain: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function waitForTurn(key: string): Promise<void> {
    const current = now();
    const bucket = buckets.get(key);
    const resetAt = Math.max(
      globalResetAt,
      bucket && bucket.remaining <= 0 ? bucket.resetAt : 0,
    );
    if (resetAt <= current) {
      return;
    }
    const waitMs = resetAt - current;
    if (waitMs > maxWaitMs) {
      throw new DiscordHttpError(429, waitMs);
    }
    await sleep(waitMs);
  }

  async function send(
    req: DiscordRequest,
    attempt: number,
  ): Promise<DiscordResponse> {
    const key = routeKey(req.method, req.path);
    await waitForTurn(key);
    const headers: Record<string, string> = {
      Authorization: `Bot ${token}`,
    };
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }
    let response: DiscordFetchResponse;
    try {
      response = await fetchImpl(`${API}${req.path}`, {
        method: req.method,
        headers,
        body,
      });
    } catch {
      throw new DiscordHttpError(0);
    }
    rememberLimits(buckets, key, response.headers, now());
    const text = await response.text();
    const parsed = parseJson(text);
    if (response.status === 429) {
      const retryAfterMs = retryAfterFrom(parsed, response.headers);
      if (isGlobal(parsed)) {
        globalResetAt = Math.max(globalResetAt, now() + retryAfterMs);
      } else {
        buckets.set(key, { remaining: 0, resetAt: now() + retryAfterMs });
      }
      if (attempt >= 1 || retryAfterMs > maxWaitMs) {
        throw new DiscordHttpError(429, retryAfterMs);
      }
      await sleep(retryAfterMs);
      return send(req, attempt + 1);
    }
    return {
      status: response.status,
      body: parsed,
      headers: {},
    };
  }

  return {
    request(req: DiscordRequest): Promise<DiscordResponse> {
      return enqueue(() => send(req, 0));
    },
  };
}

export async function probeDiscordBot(
  token: string,
  fetchImpl?: DiscordFetch,
): Promise<{ status: number; body: string }> {
  const secret = token.trim();
  if (secret.length === 0) {
    throw new Error('Discord bot token is unset');
  }
  const response = await (fetchImpl ?? fetch)(`${API}/users/@me`, {
    method: 'GET',
    headers: { Authorization: `Bot ${secret}` },
  });
  const raw = await response.text();
  const clipped = raw.length > 500 ? raw.slice(0, 500) : raw;
  return {
    status: response.status,
    body: clipped.split(secret).join('[redacted]'),
  };
}

function routeKey(method: string, path: string): string {
  return `${method} ${path.replace(/\/\d{17,20}(?=\/|$)/g, '/:id')}`;
}

function rememberLimits(
  buckets: Map<string, { remaining: number; resetAt: number }>,
  key: string,
  headers: { get(name: string): string | null },
  current: number,
): void {
  const remaining = headers.get('x-ratelimit-remaining');
  if (remaining === null) {
    return;
  }
  const left = Number(remaining);
  if (!Number.isFinite(left)) {
    return;
  }
  const resetAfter = headers.get('x-ratelimit-reset-after');
  const seconds = resetAfter === null ? 0 : Number(resetAfter);
  const resetAt =
    current + (Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : 0);
  buckets.set(key, { remaining: left, resetAt });
}

function retryAfterFrom(
  body: unknown,
  headers: { get(name: string): string | null },
): number {
  if (isRecord(body) && typeof body.retry_after === 'number') {
    return Math.max(0, Math.ceil(body.retry_after * 1000));
  }
  const header = headers.get('retry-after');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.max(0, Math.ceil(seconds * 1000));
    }
  }
  return 1_000;
}

function isGlobal(body: unknown): boolean {
  return isRecord(body) && body.global === true;
}

function parseJson(text: string): unknown {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
