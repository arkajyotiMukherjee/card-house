import {
  defaultPlayerName,
  readDiscordJoinIdentity,
} from '../../src/shared/discord-player-name';

export type JoinName =
  { state: 'ready'; name: string } | { state: 'lookup'; discordUserId: string };

/** Name to use when a join URL already carries a Discord profile. An id alone is a lookup. */
export function joinNameFromSearch(search: string): JoinName {
  const identity = readDiscordJoinIdentity(search);
  if (!identity) {
    return { state: 'ready', name: '' };
  }
  if (identity.source === 'id') {
    return { state: 'lookup', discordUserId: identity.discordUserId };
  }
  return { state: 'ready', name: defaultPlayerName(identity.user) };
}

/** Asks the bot for the default name. A non-OK response, including 401, yields no name. */
export async function fetchDefaultPlayerName(
  botUrl: string,
  discordUserId: string,
): Promise<string> {
  const base = botUrl.trim().replace(/\/+$/, '');
  if (base.length === 0) {
    return '';
  }
  let response: Response;
  try {
    const url = new URL('/default-player-name', `${base}/`);
    url.searchParams.set('discord_user_id', discordUserId);
    response = await fetch(url);
  } catch {
    return '';
  }
  if (!response.ok) {
    return '';
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return '';
  }
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const name = (body as { name?: unknown }).name;
  return typeof name === 'string' ? name.trim() : '';
}

export async function discordLinkAvailable(botUrl: string): Promise<boolean> {
  try {
    const url = new URL('/casino/discord/status', botUrl);
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const status: unknown = await response.json();
    return (
      typeof status === 'object' &&
      status !== null &&
      'available' in status &&
      status.available === true
    );
  } catch {
    return false;
  }
}

export function cardroomBotUrl(): string {
  return typeof __CARDROOM_BOT_URL__ === 'string'
    ? __CARDROOM_BOT_URL__
    : 'http://127.0.0.1:8787';
}
