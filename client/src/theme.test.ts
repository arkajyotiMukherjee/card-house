import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_HEX,
  getBackground,
  getTheme,
  saveBackground,
  saveTheme,
  THEME_STORAGE_KEY,
} from './theme';

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

describe('getBackground', () => {
  it('defaults to the previous green', () => {
    expect(getBackground('client-1', memoryStorage())).toBe('green');
    expect(BACKGROUND_HEX.green).toBe('#145c38');
  });

  it('keeps a saved background when the table color changes', () => {
    const storage = memoryStorage();
    saveBackground('client-1', 'red', storage);
    saveTheme('client-1', 'purple', storage);
    expect(getTheme('client-1', storage)).toBe('purple');
    expect(getBackground('client-1', storage)).toBe('red');
  });

  it('keeps a saved table color when the background changes', () => {
    const storage = memoryStorage();
    saveTheme('client-1', 'purple', storage);
    saveBackground('client-1', 'red', storage);
    expect(getTheme('client-1', storage)).toBe('purple');
    expect(getBackground('client-1', storage)).toBe('red');
  });

  it('falls back to green for another client, bad JSON, or an unknown color', () => {
    const storage = memoryStorage();
    saveBackground('client-1', 'purple', storage);
    expect(getBackground('client-2', storage)).toBe('green');
    storage.setItem(THEME_STORAGE_KEY, 'not json');
    expect(getBackground('client-1', storage)).toBe('green');
    storage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({
        clientId: 'client-1',
        style: 'red',
        background: 'blue',
      }),
    );
    expect(getTheme('client-1', storage)).toBe('red');
    expect(getBackground('client-1', storage)).toBe('green');
  });
});
