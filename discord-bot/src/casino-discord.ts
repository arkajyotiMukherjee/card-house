import { createHash, randomBytes } from 'node:crypto';
import type { Express } from 'express';
import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import { DiscordHttpError, type DiscordApi } from './discord-http.ts';

const DISCORD_API = 'https://discord.com/api/v10';
const LINK_TTL = 5 * 60_000;
const STATE_COOKIE = 'cardhouse_discord_state';
const SNOWFLAKE = /^\d{17,20}$/;

interface LinkOptions {
  applicationId: string;
  secret: string;
  redirectUri: string;
  complete(id: string, discordUserId: string): Promise<void>;
  fetchImpl?: typeof fetch;
}

export function attachCasinoLink(app: Express, options: LinkOptions): void {
  if (!options.applicationId || !options.secret || !options.redirectUri) return;
  const redirect = new URL(options.redirectUri);
  const states = new Map<
    string,
    { challenge: string; verifier: string; expiresAt: number }
  >();
  const fetchImpl = options.fetchImpl ?? fetch;
  const cookieFlags = `Path=/casino/discord; HttpOnly; SameSite=Lax${redirect.protocol === 'https:' ? '; Secure' : ''}`;

  app.get('/casino/discord/link', (request, response) => {
    const challenge = request.query.challenge;
    if (typeof challenge !== 'string' || !/^[a-f0-9]{64}$/.test(challenge)) {
      response.status(400).send('Open Discord linking from Card House.');
      return;
    }
    const now = Date.now();
    for (const [key, entry] of states)
      if (entry.expiresAt <= now) states.delete(key);
    if (states.size >= 1024) {
      response.status(429).send('Discord linking is busy. Try again shortly.');
      return;
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    states.set(state, { challenge, verifier, expiresAt: now + LINK_TTL });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: options.applicationId,
      redirect_uri: redirect.toString(),
      response_type: 'code',
      scope: 'identify',
      state,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    response.set('Cache-Control', 'no-store');
    response.set(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; Max-Age=300; ${cookieFlags}`,
    );
    response.redirect(url.toString());
  });

  app.get(redirect.pathname, async (request, response) => {
    const { code, state } = request.query;
    const cookie = request.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);
    const link =
      typeof state === 'string' && state === cookie
        ? states.get(state)
        : undefined;
    response.set('Cache-Control', 'no-store');
    response.set('Set-Cookie', `${STATE_COOKIE}=; Max-Age=0; ${cookieFlags}`);
    if (
      !link ||
      link.expiresAt < Date.now() ||
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      response
        .status(400)
        .send('Discord linking expired. Open it again in Card House.');
      return;
    }
    states.delete(state);
    try {
      const tokenResponse = await fetchImpl(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: options.applicationId,
          client_secret: options.secret,
          redirect_uri: redirect.toString(),
          code_verifier: link.verifier,
        }),
      });
      if (!tokenResponse.ok)
        throw new Error('Discord rejected the authorization');
      const token = ((await tokenResponse.json()) as { access_token?: string })
        .access_token;
      if (!token) throw new Error('Discord authorization token missing');
      const me = await fetchImpl(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = me.ok ? ((await me.json()) as { id?: string }) : {};
      if (!user.id || !SNOWFLAKE.test(user.id))
        throw new Error('Discord identity missing');
      await options.complete(link.challenge, user.id);
      response
        .type('html')
        .send(
          '<!doctype html><title>Card House</title><p>Discord linked. You can close this tab and return to Card House.</p>',
        );
    } catch {
      response
        .status(502)
        .send('Discord linking could not finish. Try again from Card House.');
    }
  });
}

export interface CasinoDiscordMessage {
  channelId: string;
  messageId: string;
  discordUserId: string;
  author: string;
  body: string;
  deleted: boolean;
}

export function casinoDiscordMessages(
  event: string,
  data: Record<string, unknown>,
): CasinoDiscordMessage[] {
  const channelId = data.channel_id;
  if (
    typeof data.guild_id !== 'string' ||
    typeof channelId !== 'string' ||
    !SNOWFLAKE.test(channelId)
  )
    return [];
  const author = data.author as
    | { bot?: boolean; id?: string; username?: string; global_name?: string }
    | undefined;
  if (author?.bot || data.webhook_id) return [];
  const member = data.member as { nick?: string } | undefined;
  const deleted = event === 'MESSAGE_DELETE' || event === 'MESSAGE_DELETE_BULK';
  if (
    !deleted &&
    ((event !== 'MESSAGE_CREATE' && event !== 'MESSAGE_UPDATE') ||
      typeof data.content !== 'string')
  )
    return [];
  const ids =
    event === 'MESSAGE_DELETE_BULK' && Array.isArray(data.ids)
      ? data.ids
      : [data.id];
  return ids
    .filter((id): id is string => typeof id === 'string' && SNOWFLAKE.test(id))
    .map((messageId) => ({
      channelId,
      messageId,
      discordUserId: author?.id ?? '',
      author: member?.nick ?? author?.global_name ?? author?.username ?? '',
      body: typeof data.content === 'string' ? data.content : '',
      deleted,
    }));
}

export function watchCasinoVoiceMoves(
  targets: Pick<
    DbConnection['db']['myCasinoVoiceTargets'],
    'iter' | 'onInsert' | 'onDelete'
  >,
  api: DiscordApi,
  onError: (error: unknown) => void,
) {
  const current = new Map<string, string>();
  const pending = new Set<string>();
  const attempted = new Map<string, string>();
  const refresh = (): void => {
    for (const row of targets.iter()) {
      const key = `${row.guildId}:${row.discordUserId}`;
      const move = `${row.sourceChannelId}:${row.targetChannelId}`;
      if (
        current.get(key) !== row.sourceChannelId ||
        pending.has(key) ||
        attempted.get(key) === move
      )
        continue;
      pending.add(key);
      attempted.set(key, move);
      void api
        .request({
          method: 'PATCH',
          path: `/guilds/${row.guildId}/members/${row.discordUserId}`,
          body: { channel_id: row.targetChannelId },
        })
        .then(({ status }) => {
          if (status < 200 || status >= 300) throw new DiscordHttpError(status);
        })
        .catch(onError)
        .finally(() => {
          pending.delete(key);
          refresh();
        });
    }
  };
  targets.onInsert(refresh);
  targets.onDelete(refresh);
  const record = (
    guildId: string,
    userId: string,
    channelId: string | null,
  ): void => {
    const key = `${guildId}:${userId}`;
    if (current.get(key) !== channelId) attempted.delete(key);
    if (channelId) current.set(key, channelId);
    else current.delete(key);
  };
  const resyncGuild = (guildId: string): void => {
    for (const key of current.keys())
      if (key.startsWith(`${guildId}:`)) {
        current.delete(key);
        attempted.delete(key);
      }
  };
  const channelFor = (guildId: string, userId: string): string | undefined =>
    current.get(`${guildId}:${userId}`);
  const reset = (): void => {
    current.clear();
    attempted.clear();
  };
  return { record, resyncGuild, refresh, channelFor, reset };
}
