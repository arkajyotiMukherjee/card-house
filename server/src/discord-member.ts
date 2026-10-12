/** Discord fields stored on a lobby member. Discriminator is absent when Discord did not send one. */
export interface DiscordProfile {
  discordUserId: string;
  discordUsername: string;
  discordGlobalName: string;
  discordDiscriminator?: string;
}

const DISCORD_USER_ID = /^\d{17,20}$/;
const DISCORD_USERNAME = /^[A-Za-z0-9_.]{1,32}$/;
const DISCORD_DISCRIMINATOR = /^\d{4}$/;

/**
 * Normalize a Discord identity from a join.
 * `name` is not derived here. Issue #43 still chooses the default display name.
 * A missing, blank, or `0` discriminator is not stored.
 */
export function discordProfile(
  rawUserId: string,
  rawUsername: string,
  rawGlobalName: string,
  rawDiscriminator?: string,
): DiscordProfile {
  const discordUserId = rawUserId.trim();
  if (!DISCORD_USER_ID.test(discordUserId)) {
    throw new Error('Discord user id is invalid');
  }
  const discordUsername = rawUsername.trim();
  if (!DISCORD_USERNAME.test(discordUsername)) {
    throw new Error('Discord username is invalid');
  }
  const discordGlobalName = rawGlobalName.trim();
  if (discordGlobalName.length > 32) {
    throw new Error('Discord global name is invalid');
  }
  const profile: DiscordProfile = {
    discordUserId,
    discordUsername,
    discordGlobalName,
  };
  const discriminator = storedDiscriminator(rawDiscriminator);
  if (discriminator !== undefined) {
    profile.discordDiscriminator = discriminator;
  }
  return profile;
}

function storedDiscriminator(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  if (value.length === 0 || value === '0') {
    return undefined;
  }
  if (!DISCORD_DISCRIMINATOR.test(value)) {
    throw new Error('Discord discriminator is invalid');
  }
  return value;
}
