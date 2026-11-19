import {
  DISCORD_USER_ID,
  discordDisplayUsername,
  publicPlayerName,
} from '../../src/shared/discord-player-name';
import { NAME_MAX, normalizePlayerName } from './lobby';

export const PREFERRED_NAME_STORAGE_KEY = 'preferredNames';

const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PlayerNamePreference {
  customName: string;
  discord?: { userId: string; username: string };
}

function readNames(storage: NameStorage): Record<string, unknown> {
  try {
    const names: unknown = JSON.parse(
      storage.getItem(PREFERRED_NAME_STORAGE_KEY) ?? '{}',
    );
    if (names && typeof names === 'object' && !Array.isArray(names)) {
      return names as Record<string, unknown>;
    }
  } catch {
    // A malformed preference is equivalent to no saved name.
  }
  return {};
}

export function readPlayerNamePreference(
  clientId: string,
  storage: NameStorage = localStorage,
): PlayerNamePreference {
  const id = clientId.trim();
  const stored = CLIENT_ID_PATTERN.test(id)
    ? readNames(storage)[id]
    : undefined;
  if (typeof stored === 'string') {
    return { customName: customPlayerName(stored) };
  }
  if (stored && typeof stored === 'object' && 'customName' in stored) {
    const { customName, discord } = stored as PlayerNamePreference;
    const username = discordDisplayUsername(discord?.username);
    return {
      customName: customPlayerName(customName),
      discord:
        typeof discord?.userId === 'string' &&
        DISCORD_USER_ID.test(discord.userId) &&
        username
          ? { userId: discord.userId, username }
          : undefined,
    };
  }
  return { customName: '' };
}

export function rememberPlayerNamePreference(
  clientId: string,
  preference: PlayerNamePreference,
  storage: NameStorage = localStorage,
): void {
  const id = clientId.trim();
  if (!CLIENT_ID_PATTERN.test(id)) return;
  const customName = normalizePlayerName(preference.customName);
  if (customName && !customPlayerName(customName)) return;

  const names = readNames(storage);
  if (preference.discord) {
    names[id] = { ...preference, customName };
  } else if (customName) {
    names[id] = customName;
  } else {
    delete names[id];
  }
  if (Object.keys(names).length) {
    storage.setItem(PREFERRED_NAME_STORAGE_KEY, JSON.stringify(names));
  } else {
    storage.removeItem(PREFERRED_NAME_STORAGE_KEY);
  }
}

export function preferredPlayerName(
  clientId: string,
  fallback = '',
  discordUserId?: string,
  storage: NameStorage = localStorage,
): string {
  const preference = readPlayerNamePreference(clientId, storage);
  if (preference.discord && preference.discord.userId === discordUserId) {
    return preference.discord.username;
  }
  return publicPlayerName(preference.customName || fallback);
}

export function customPlayerName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = normalizePlayerName(value);
  return name.length <= NAME_MAX && /^[A-Za-z0-9 ]+$/.test(name) ? name : '';
}
