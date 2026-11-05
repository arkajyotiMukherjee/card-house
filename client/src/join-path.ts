/** Same 32 characters as `CODE_ALPHABET` in `server/src/index.ts`. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Discord identity carried on a join URL. The lobby name is mapped separately. */
export interface DiscordJoinIdentity {
  discordUserId: string;
  discordUsername: string;
  discordGlobalName: string;
  discordDiscriminator?: string;
}

/** Room code from a join URL path such as `/AB3D`. */
export function roomCodeFromPath(pathname: string): string | undefined {
  const segments = pathname.split('/').filter((part) => part.length > 0);
  if (segments.length !== 1) {
    return undefined;
  }
  const code = (segments[0] ?? '').toUpperCase();
  if (code.length !== 4) {
    return undefined;
  }
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) {
      return undefined;
    }
  }
  return code;
}

/** Show the confirmed lobby in the URL without navigating away from it. */
export function showLobbyUrl(code: string): void {
  const lobbyCode = roomCodeFromPath(code);
  if (!lobbyCode || window.location.pathname === `/${lobbyCode}`) {
    return;
  }
  const url = new URL(window.location.href);
  url.pathname = `/${lobbyCode}`;
  window.history.replaceState(window.history.state, '', url);
}

function queryValue(params: URLSearchParams, ...keys: string[]): string {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

/**
 * Discord identity from a join URL query.
 * Accepts `discordUserId` or `discord_user_id`.
 * Absent user id is a web-only join.
 * A blank or `0` discriminator is left off so the module does not store one.
 */
export function discordIdentityFromSearch(
  search: string,
): DiscordJoinIdentity | undefined {
  const params = new URLSearchParams(search);
  const discordUserId = queryValue(params, 'discordUserId', 'discord_user_id');
  if (discordUserId.length === 0) {
    return undefined;
  }
  const identity: DiscordJoinIdentity = {
    discordUserId,
    discordUsername: queryValue(params, 'discordUsername', 'discord_username'),
    discordGlobalName: queryValue(
      params,
      'discordGlobalName',
      'discord_global_name',
    ),
  };
  const rawDiscriminator = params.get('discordDiscriminator');
  if (rawDiscriminator !== null) {
    const discordDiscriminator = rawDiscriminator.trim();
    if (discordDiscriminator.length > 0 && discordDiscriminator !== '0') {
      identity.discordDiscriminator = discordDiscriminator;
    }
  }
  return identity;
}
