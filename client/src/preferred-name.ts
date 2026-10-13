import { NAME_MAX, normalizePlayerName } from './lobby';

/**
 * localStorage key for preferred display names.
 * The JSON value is an object keyed by `clientId`.
 */
export const PREFERRED_NAME_STORAGE_KEY = 'preferredNames';

/** Same UUID shape `getOrCreateClientId` accepts. */
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The name this `clientId` last set. Empty when this id has none.
 * A different id, or a different storage, does not see it.
 */
export function readPreferredName(
  clientId: string,
  storage: NameStorage = localStorage,
): string {
  const id = clientId.trim();
  if (!CLIENT_ID_PATTERN.test(id)) {
    return '';
  }
  const names = readNames(storage);
  const stored = names[id];
  if (typeof stored !== 'string') {
    return '';
  }
  const name = normalizePlayerName(stored);
  return isStoredName(name) ? name : '';
}

/**
 * Saves `name` for `clientId`. A blank name clears that id.
 * Other ids in the same map stay put.
 */
export function rememberPreferredName(
  clientId: string,
  name: string,
  storage: NameStorage = localStorage,
): void {
  const id = clientId.trim();
  if (!CLIENT_ID_PATTERN.test(id)) {
    return;
  }
  const playerName = normalizePlayerName(name).slice(0, NAME_MAX);
  const names = readNames(storage);
  if (playerName.length === 0) {
    if (names[id] === undefined) {
      return;
    }
    delete names[id];
  } else if (!isStoredName(playerName)) {
    return;
  } else if (names[id] === playerName) {
    return;
  } else {
    names[id] = playerName;
  }
  const ids = Object.keys(names);
  if (ids.length === 0) {
    storage.removeItem(PREFERRED_NAME_STORAGE_KEY);
    return;
  }
  storage.setItem(PREFERRED_NAME_STORAGE_KEY, JSON.stringify(names));
}

/**
 * Name to show in Create Room or Join Room.
 * An explicit name (a Discord join) wins. Otherwise the saved name for this id.
 */
export function preferredNameForPrompt(
  clientId: string,
  explicitName: string,
  storage: NameStorage = localStorage,
): string {
  const explicit = normalizePlayerName(explicitName).slice(0, NAME_MAX);
  if (explicit.length > 0) {
    return explicit;
  }
  return readPreferredName(clientId, storage);
}

function readNames(storage: NameStorage): Record<string, string> {
  const raw = storage.getItem(PREFERRED_NAME_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const names: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      names[id] = value;
    }
  }
  return names;
}

function isStoredName(name: string): boolean {
  if (name.length === 0 || name.length > NAME_MAX) {
    return false;
  }
  for (const char of name) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const upper = code >= 65 && code <= 90;
    const lower = code >= 97 && code <= 122;
    if (!digit && !upper && !lower && char !== ' ') {
      return false;
    }
  }
  return true;
}
