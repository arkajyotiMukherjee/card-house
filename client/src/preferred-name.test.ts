import { describe, expect, it } from 'vitest';
import {
  PREFERRED_NAME_STORAGE_KEY,
  preferredPlayerName,
  readPlayerNamePreference,
  rememberPlayerNamePreference,
} from './preferred-name';

const ADA = '6f1e8c2a-1b4d-4e8a-8c3d-9a0b1c2d3e4f';
const BEA = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

const DISCORD_ID = '123456789012345678';
const USERNAME = 'avery_long.discord_username';

const rememberCustomName = (
  clientId: string,
  customName: string,
  storage: ReturnType<typeof memoryStorage>,
) => rememberPlayerNamePreference(clientId, { customName }, storage);
const readCustomName = (
  clientId: string,
  storage: ReturnType<typeof memoryStorage>,
) => readPlayerNamePreference(clientId, storage).customName;

describe('preferred name', () => {
  it('stores the name under that clientId', () => {
    const storage = memoryStorage();
    rememberCustomName(ADA, '  River ', storage);
    expect(readCustomName(ADA, storage)).toBe('River');
    const saved = JSON.parse(
      storage.getItem(PREFERRED_NAME_STORAGE_KEY) ?? '{}',
    ) as Record<string, string>;
    expect(saved[ADA]).toBe('River');
    expect(Object.keys(saved)).toEqual([ADA]);
  });

  it('does not return another clientId in the same storage', () => {
    const storage = memoryStorage();
    rememberCustomName(ADA, 'River', storage);
    rememberCustomName(BEA, 'Bea', storage);
    expect(readCustomName(ADA, storage)).toBe('River');
    expect(readCustomName(BEA, storage)).toBe('Bea');
    rememberCustomName(ADA, 'Ada', storage);
    expect(readCustomName(BEA, storage)).toBe('Bea');
  });

  it('does not return the name from a different storage', () => {
    const first = memoryStorage();
    const second = memoryStorage();
    rememberCustomName(ADA, 'River', first);
    expect(readCustomName(ADA, second)).toBe('');
    expect(second.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
  });

  it('clears that clientId when the name is blank', () => {
    const storage = memoryStorage();
    rememberCustomName(ADA, 'River', storage);
    rememberCustomName(BEA, 'Bea', storage);
    rememberCustomName(ADA, '   ', storage);
    expect(readCustomName(ADA, storage)).toBe('');
    expect(readCustomName(BEA, storage)).toBe('Bea');
    rememberCustomName(BEA, '', storage);
    expect(storage.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
  });

  it('ignores a bad id, a bad name, and corrupt JSON', () => {
    const storage = memoryStorage();
    rememberCustomName('not-a-client', 'River', storage);
    expect(storage.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
    rememberCustomName(ADA, 'River!', storage);
    expect(readCustomName(ADA, storage)).toBe('');
    storage.setItem(PREFERRED_NAME_STORAGE_KEY, '{');
    expect(readCustomName(ADA, storage)).toBe('');
  });

  it('uses a saved custom name, an invite fallback, or Guest', () => {
    const storage = memoryStorage();
    rememberCustomName(ADA, 'River', storage);
    expect(preferredPlayerName(ADA, 'Cord', undefined, storage)).toBe('River');
    expect(preferredPlayerName(BEA, 'Cord', undefined, storage)).toBe('Cord');
    expect(preferredPlayerName(BEA, '', undefined, storage)).toBe('Guest');
  });

  it('keeps the full username for the linked account and remembers the custom name', () => {
    const storage = memoryStorage();
    rememberPlayerNamePreference(
      ADA,
      {
        customName: 'River',
        discord: { userId: DISCORD_ID, username: USERNAME },
      },
      storage,
    );
    expect(preferredPlayerName(ADA, '', DISCORD_ID, storage)).toBe(USERNAME);
    expect(preferredPlayerName(ADA, '', '234567890123456789', storage)).toBe(
      'River',
    );
    expect(readCustomName(ADA, storage)).toBe('River');
    expect(readCustomName(BEA, storage)).toBe('');
    rememberCustomName(ADA, 'River', storage);
    expect(preferredPlayerName(ADA, '', DISCORD_ID, storage)).toBe('River');
  });

  it('never promotes a legacy numeric ID to a display name', () => {
    const storage = memoryStorage();
    storage.setItem(
      PREFERRED_NAME_STORAGE_KEY,
      JSON.stringify({ [ADA]: DISCORD_ID }),
    );
    expect(preferredPlayerName(ADA, DISCORD_ID, DISCORD_ID, storage)).toBe(
      'Guest',
    );
    rememberPlayerNamePreference(
      ADA,
      {
        customName: 'River',
        discord: { userId: DISCORD_ID, username: DISCORD_ID },
      },
      storage,
    );
    expect(preferredPlayerName(ADA, '', DISCORD_ID, storage)).toBe('River');
  });
});
