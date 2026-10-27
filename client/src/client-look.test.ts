import { describe, expect, it } from 'vitest';
import { setCardBackStyle, setCardFrontStyle } from './card-appearance';
import { readClientLook, tableScenePaint } from './client-look';
import { BACKGROUND_HEX, saveBackground, saveTheme } from './theme';

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

describe('table scene look', () => {
  it('defaults to a green margin, a green table, and the classic light deck', () => {
    const paint = tableScenePaint('client-1', memoryStorage());
    expect(paint).toEqual({
      table: 'green',
      background: BACKGROUND_HEX.green,
      front: 'light',
      back: 'classic',
    });
    expect(paint.background).toBe('#145c38');
  });

  it('paints a saved black background as the felt margin', () => {
    const storage = memoryStorage();
    saveBackground('client-1', 'black', storage);
    const paint = tableScenePaint('client-1', storage);
    expect(paint.table).toBe('green');
    expect(paint.background).toBe('#000000');
    expect(paint.background).toBe(BACKGROUND_HEX.black);
  });

  it('survives a reload and is what the table scene paints', () => {
    const storage = memoryStorage();
    saveTheme('client-1', 'purple', storage);
    saveBackground('client-1', 'red', storage);
    setCardFrontStyle('dark', storage);
    setCardBackStyle('bold', storage);
    const saved = readClientLook('client-1', storage);
    const reloaded = tableScenePaint('client-1', storage);
    expect(saved).toEqual({
      table: 'purple',
      background: 'red',
      front: 'dark',
      back: 'bold',
    });
    expect(reloaded).toEqual({
      table: 'purple',
      background: BACKGROUND_HEX.red,
      front: 'dark',
      back: 'bold',
    });
  });
});
