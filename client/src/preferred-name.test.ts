import { describe, expect, it } from 'vitest';
import {
  PREFERRED_NAME_STORAGE_KEY,
  preferredNameForPrompt,
  readPreferredName,
  rememberPreferredName,
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

describe('preferred name', () => {
  it('stores the name under that clientId', () => {
    const storage = memoryStorage();
    rememberPreferredName(ADA, '  River ', storage);
    expect(readPreferredName(ADA, storage)).toBe('River');
    const saved = JSON.parse(
      storage.getItem(PREFERRED_NAME_STORAGE_KEY) ?? '{}',
    ) as Record<string, string>;
    expect(saved[ADA]).toBe('River');
    expect(Object.keys(saved)).toEqual([ADA]);
  });

  it('does not return another clientId in the same storage', () => {
    const storage = memoryStorage();
    rememberPreferredName(ADA, 'River', storage);
    rememberPreferredName(BEA, 'Bea', storage);
    expect(readPreferredName(ADA, storage)).toBe('River');
    expect(readPreferredName(BEA, storage)).toBe('Bea');
    rememberPreferredName(ADA, 'Ada', storage);
    expect(readPreferredName(BEA, storage)).toBe('Bea');
  });

  it('does not return the name from a different storage', () => {
    const first = memoryStorage();
    const second = memoryStorage();
    rememberPreferredName(ADA, 'River', first);
    expect(readPreferredName(ADA, second)).toBe('');
    expect(second.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
  });

  it('clears that clientId when the name is blank', () => {
    const storage = memoryStorage();
    rememberPreferredName(ADA, 'River', storage);
    rememberPreferredName(BEA, 'Bea', storage);
    rememberPreferredName(ADA, '   ', storage);
    expect(readPreferredName(ADA, storage)).toBe('');
    expect(readPreferredName(BEA, storage)).toBe('Bea');
    rememberPreferredName(BEA, '', storage);
    expect(storage.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
  });

  it('ignores a bad id, a bad name, and corrupt JSON', () => {
    const storage = memoryStorage();
    rememberPreferredName('not-a-client', 'River', storage);
    expect(storage.getItem(PREFERRED_NAME_STORAGE_KEY)).toBeNull();
    rememberPreferredName(ADA, 'River!', storage);
    expect(readPreferredName(ADA, storage)).toBe('');
    storage.setItem(PREFERRED_NAME_STORAGE_KEY, '{');
    expect(readPreferredName(ADA, storage)).toBe('');
  });

  it('keeps an explicit prompt name and otherwise uses the saved one', () => {
    const storage = memoryStorage();
    rememberPreferredName(ADA, 'River', storage);
    expect(preferredNameForPrompt(ADA, '', storage)).toBe('River');
    expect(preferredNameForPrompt(ADA, ' Cord ', storage)).toBe('Cord');
    expect(preferredNameForPrompt(BEA, '', storage)).toBe('');
  });
});
