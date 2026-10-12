/** Matches `NAME_MAX` on the lobby name field. */
export const PLAYER_NAME_MAX = 12;

/** Discord snowflake. Same width as a channel id. */
export const DISCORD_USER_ID = /^\d{17,20}$/;

export const DISCORD_USER_ID_PARAM = 'discord_user_id';
export const DISCORD_USERNAME_PARAM = 'discord_username';
export const DISCORD_GLOBAL_NAME_PARAM = 'discord_global_name';

export interface DiscordUserProfile {
  id: string;
  username: string;
  globalName?: string | null;
}

export type DiscordJoinIdentity =
  | { source: 'profile'; user: DiscordUserProfile }
  | { source: 'id'; discordUserId: string };

/**
 * Default lobby name for a Discord user.
 * Global name wins when it still has letters or digits. Otherwise the username.
 * Empty when the id is not a Discord user id or nothing readable remains.
 */
export function defaultPlayerName(user: DiscordUserProfile): string {
  const id = user.id.trim();
  if (!DISCORD_USER_ID.test(id)) {
    return '';
  }
  const fromGlobal = visibleName(user.globalName ?? '');
  if (fromGlobal.length > 0) {
    return fromGlobal;
  }
  return visibleName(user.username);
}

/** Identity already known on a join URL. An id alone still needs a Discord lookup. */
export function readDiscordJoinIdentity(
  search: string,
): DiscordJoinIdentity | undefined {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const id = (
    firstQuery(params, DISCORD_USER_ID_PARAM, 'discordUserId') ?? ''
  ).trim();
  if (!DISCORD_USER_ID.test(id)) {
    return undefined;
  }
  const username = (
    firstQuery(params, DISCORD_USERNAME_PARAM, 'discordUsername') ?? ''
  ).trim();
  const globalRaw = firstQuery(
    params,
    DISCORD_GLOBAL_NAME_PARAM,
    'discordGlobalName',
  );
  const globalName = globalRaw === null ? '' : globalRaw.trim();
  if (username.length === 0 && globalName.length === 0) {
    return { source: 'id', discordUserId: id };
  }
  return {
    source: 'profile',
    user: {
      id,
      username,
      globalName: globalName.length > 0 ? globalName : null,
    },
  };
}

/** Join URL plus a Discord profile the opener already knows. */
export function withDiscordIdentity(
  joinUrl: string,
  user: DiscordUserProfile,
): string {
  const url = new URL(joinUrl);
  url.searchParams.set(DISCORD_USER_ID_PARAM, user.id.trim());
  const username = user.username.trim();
  if (username.length > 0) {
    url.searchParams.set(DISCORD_USERNAME_PARAM, username);
  }
  const globalName = user.globalName?.trim() ?? '';
  if (globalName.length > 0) {
    url.searchParams.set(DISCORD_GLOBAL_NAME_PARAM, globalName);
  }
  return url.toString();
}

function firstQuery(
  params: URLSearchParams,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    if (params.has(key)) {
      return params.get(key);
    }
  }
  return null;
}

function visibleName(raw: string): string {
  let name = '';
  let pendingSpace = false;
  const trimmed = raw.trim();
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index] ?? '';
    const mapped = char === '_' || char === '.' ? ' ' : char;
    if (mapped === ' ') {
      if (name.length > 0) {
        pendingSpace = true;
      }
      continue;
    }
    if (!/[a-zA-Z0-9]/.test(mapped)) {
      continue;
    }
    if (pendingSpace) {
      if (name.length + 1 >= PLAYER_NAME_MAX) {
        break;
      }
      name += ' ';
      pendingSpace = false;
    }
    if (name.length >= PLAYER_NAME_MAX) {
      break;
    }
    name += mapped;
  }
  return name;
}
