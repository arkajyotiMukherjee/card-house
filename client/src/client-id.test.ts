import { describe, expect, it } from 'vitest';
import { CLIENT_ID_STORAGE_KEY, getOrCreateClientId } from './client-id';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('getOrCreateClientId', () => {
  it('creates and stores an id on the first call', () => {
    const storage = memoryStorage();
    const id = getOrCreateClientId(storage);
    expect(id).toMatch(UUID_PATTERN);
    expect(storage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(id);
  });

  it('returns the same id on the second call', () => {
    const storage = memoryStorage();
    const first = getOrCreateClientId(storage);
    expect(getOrCreateClientId(storage)).toBe(first);
    expect(storage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(first);
  });

  it('returns a different id from a fresh storage', () => {
    const first = getOrCreateClientId(memoryStorage());
    const second = getOrCreateClientId(memoryStorage());
    expect(second).toMatch(UUID_PATTERN);
    expect(second).not.toBe(first);
  });
});
