import { describe, expect, it } from 'vitest';
import {
  CARD_APPEARANCE_STORAGE_KEY,
  CARD_BACK_STYLES,
  CARD_FRONT_STYLES,
  DEFAULT_CARD_BACK_STYLE,
  DEFAULT_CARD_FRONT_STYLE,
  getCardAppearance,
  nextCardBackStyle,
  nextCardFrontStyle,
  setCardBackStyle,
  setCardFrontStyle,
} from './card-appearance';

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

describe('getCardAppearance', () => {
  it('defaults to the light front and the classic back with no storage', () => {
    const appearance = getCardAppearance(memoryStorage());
    expect(appearance).toEqual({
      front: DEFAULT_CARD_FRONT_STYLE,
      back: DEFAULT_CARD_BACK_STYLE,
    });
  });

  it('falls back to defaults for malformed or unknown stored values', () => {
    const storage = memoryStorage();
    storage.setItem(CARD_APPEARANCE_STORAGE_KEY, 'not json');
    expect(getCardAppearance(storage)).toEqual({
      front: DEFAULT_CARD_FRONT_STYLE,
      back: DEFAULT_CARD_BACK_STYLE,
    });
    storage.setItem(
      CARD_APPEARANCE_STORAGE_KEY,
      JSON.stringify({ front: 'neon', back: 'glitter' }),
    );
    expect(getCardAppearance(storage)).toEqual({
      front: DEFAULT_CARD_FRONT_STYLE,
      back: DEFAULT_CARD_BACK_STYLE,
    });
  });
});

describe('setCardFrontStyle and setCardBackStyle', () => {
  it('stores a chosen front style and keeps the existing back', () => {
    const storage = memoryStorage();
    setCardBackStyle('bold', storage);
    setCardFrontStyle('dark', storage);
    expect(getCardAppearance(storage)).toEqual({ front: 'dark', back: 'bold' });
  });

  it('stores a chosen back style and keeps the existing front', () => {
    const storage = memoryStorage();
    setCardFrontStyle('dark', storage);
    setCardBackStyle('bold', storage);
    expect(getCardAppearance(storage)).toEqual({ front: 'dark', back: 'bold' });
  });

  it('persists across a fresh read, same as the display name preference', () => {
    const storage = memoryStorage();
    setCardFrontStyle('dark', storage);
    setCardBackStyle('bold', storage);
    const reloaded = getCardAppearance(storage);
    expect(reloaded.front).toBe('dark');
    expect(reloaded.back).toBe('bold');
  });

  it('a different browser storage keeps the default', () => {
    const storageA = memoryStorage();
    setCardFrontStyle('dark', storageA);
    setCardBackStyle('bold', storageA);
    const storageB = memoryStorage();
    expect(getCardAppearance(storageB)).toEqual({
      front: DEFAULT_CARD_FRONT_STYLE,
      back: DEFAULT_CARD_BACK_STYLE,
    });
  });
});

describe('nextCardFrontStyle and nextCardBackStyle', () => {
  it('cycles through every front style and wraps around', () => {
    let style = DEFAULT_CARD_FRONT_STYLE;
    const seen = new Set<string>([style]);
    for (let index = 0; index < CARD_FRONT_STYLES.length; index += 1) {
      style = nextCardFrontStyle(style);
      seen.add(style);
    }
    expect(seen.size).toBe(CARD_FRONT_STYLES.length);
    expect(style).toBe(DEFAULT_CARD_FRONT_STYLE);
  });

  it('cycles through every back style and wraps around', () => {
    let style = DEFAULT_CARD_BACK_STYLE;
    const seen = new Set<string>([style]);
    for (let index = 0; index < CARD_BACK_STYLES.length; index += 1) {
      style = nextCardBackStyle(style);
      seen.add(style);
    }
    expect(seen.size).toBe(CARD_BACK_STYLES.length);
    expect(style).toBe(DEFAULT_CARD_BACK_STYLE);
  });
});
