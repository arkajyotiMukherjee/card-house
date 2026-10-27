/**
 * The local player's chosen card front style and card back, from the Pixel
 * Poker Pack's standard deck variants. Stored in `localStorage`, same kind of
 * per-browser preference as `clientId`. Never sent to SpacetimeDB.
 */

/** localStorage key. Keep this name stable. */
export const CARD_APPEARANCE_STORAGE_KEY = 'cardAppearance';

export const CARD_FRONT_STYLES = ['light', 'dark'] as const;
export type CardFrontStyle = (typeof CARD_FRONT_STYLES)[number];

export const CARD_BACK_STYLES = ['classic', 'bold'] as const;
export type CardBackStyle = (typeof CARD_BACK_STYLES)[number];

export const DEFAULT_CARD_FRONT_STYLE: CardFrontStyle = 'light';
export const DEFAULT_CARD_BACK_STYLE: CardBackStyle = 'classic';

export const CARD_FRONT_LABELS: Record<CardFrontStyle, string> = {
  light: 'Light',
  dark: 'Dark',
};

export const CARD_BACK_LABELS: Record<CardBackStyle, string> = {
  classic: 'Classic',
  bold: 'Bold',
};

export interface CardAppearance {
  front: CardFrontStyle;
  back: CardBackStyle;
}

function isCardFrontStyle(value: unknown): value is CardFrontStyle {
  return (CARD_FRONT_STYLES as readonly unknown[]).includes(value);
}

function isCardBackStyle(value: unknown): value is CardBackStyle {
  return (CARD_BACK_STYLES as readonly unknown[]).includes(value);
}

function defaultAppearance(): CardAppearance {
  return { front: DEFAULT_CARD_FRONT_STYLE, back: DEFAULT_CARD_BACK_STYLE };
}

function parseAppearance(raw: string | null): CardAppearance {
  if (!raw) {
    return defaultAppearance();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultAppearance();
    }
    const front = (parsed as Record<string, unknown>).front;
    const back = (parsed as Record<string, unknown>).back;
    return {
      front: isCardFrontStyle(front) ? front : DEFAULT_CARD_FRONT_STYLE,
      back: isCardBackStyle(back) ? back : DEFAULT_CARD_BACK_STYLE,
    };
  } catch {
    return defaultAppearance();
  }
}

export function getCardAppearance(
  storage: Pick<Storage, 'getItem'> = localStorage,
): CardAppearance {
  return parseAppearance(storage.getItem(CARD_APPEARANCE_STORAGE_KEY));
}

function saveAppearance(
  appearance: CardAppearance,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): CardAppearance {
  storage.setItem(CARD_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  return appearance;
}

export function setCardFrontStyle(
  front: CardFrontStyle,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): CardAppearance {
  const current = getCardAppearance(storage);
  return saveAppearance({ ...current, front }, storage);
}

export function setCardBackStyle(
  back: CardBackStyle,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): CardAppearance {
  const current = getCardAppearance(storage);
  return saveAppearance({ ...current, back }, storage);
}

function stepStyle<T extends string>(
  values: readonly T[],
  current: T,
  delta: number,
  fallback: T,
): T {
  const count = values.length;
  const index = values.indexOf(current);
  const next = ((((index < 0 ? 0 : index) + delta) % count) + count) % count;
  return values[next] ?? fallback;
}

/** Steps through the front styles. `delta` may be negative. */
export function stepCardFrontStyle(
  current: CardFrontStyle,
  delta: number,
): CardFrontStyle {
  return stepStyle(CARD_FRONT_STYLES, current, delta, DEFAULT_CARD_FRONT_STYLE);
}

/** Steps through the back styles. `delta` may be negative. */
export function stepCardBackStyle(
  current: CardBackStyle,
  delta: number,
): CardBackStyle {
  return stepStyle(CARD_BACK_STYLES, current, delta, DEFAULT_CARD_BACK_STYLE);
}

/** Cycles to the next style in `CARD_FRONT_STYLES`, wrapping around. */
export function nextCardFrontStyle(current: CardFrontStyle): CardFrontStyle {
  return stepCardFrontStyle(current, 1);
}

/** Cycles to the next style in `CARD_BACK_STYLES`, wrapping around. */
export function nextCardBackStyle(current: CardBackStyle): CardBackStyle {
  return stepCardBackStyle(current, 1);
}
