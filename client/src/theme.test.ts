import { describe, expect, it } from 'vitest';
import { getTheme, saveTheme, THEME_STORAGE_KEY } from './theme';

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

describe('getTheme', () => {
  it('defaults to green when nothing is stored', () => {
    expect(getTheme('client-1', memoryStorage())).toBe('green');
  });

  it('returns the style saved for that clientId', () => {
    const storage = memoryStorage();
    saveTheme('client-1', 'purple', storage);
    expect(getTheme('client-1', storage)).toBe('purple');
  });

  it('round-trips every table style', () => {
    const storage = memoryStorage();
    for (const style of ['green', 'purple', 'red'] as const) {
      saveTheme('client-1', style, storage);
      expect(getTheme('client-1', storage)).toBe(style);
    }
  });

  it('falls back to green for a different clientId', () => {
    const storage = memoryStorage();
    saveTheme('client-1', 'red', storage);
    expect(getTheme('client-2', storage)).toBe('green');
  });

  it('falls back to green for malformed JSON', () => {
    const storage = memoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'not json');
    expect(getTheme('client-1', storage)).toBe('green');
  });

  it('falls back to green for an unknown style', () => {
    const storage = memoryStorage();
    storage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ clientId: 'client-1', style: 'blue' }),
    );
    expect(getTheme('client-1', storage)).toBe('green');
  });
});
