/** Same 32 characters as `CODE_ALPHABET` in `server/src/index.ts`. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Discord identity carried on a join URL. Display name is not taken from these fields. */
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

/**
 * Discord identity from a join URL query.
 * Absent `discordUserId` is a web-only join.
 * A blank or `0` discriminator is left off so the module does not store one.
 */
export function discordIdentityFromSearch(
  search: string,
): DiscordJoinIdentity | undefined {
  const params = new URLSearchParams(search);
  const discordUserId = (params.get('discordUserId') ?? '').trim();
  if (discordUserId.length === 0) {
    return undefined;
  }
  const identity: DiscordJoinIdentity = {
    discordUserId,
    discordUsername: (params.get('discordUsername') ?? '').trim(),
    discordGlobalName: (params.get('discordGlobalName') ?? '').trim(),
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
