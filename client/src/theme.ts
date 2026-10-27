import { TABLE_STYLES, type TableStyle } from './table-atlas';

/** localStorage key for the chosen color theme. Keep this name stable. */
export const THEME_STORAGE_KEY = 'theme';

const DEFAULT_STYLE: TableStyle = 'green';

/**
 * Page and felt-margin colors. Green is the previous felt (`#145c38`).
 * Purple and red are the felt pixels of `table-purple.png` and `table-red.png`.
 */
export const BACKGROUND_STYLES = TABLE_STYLES;
export type BackgroundStyle = TableStyle;

export const DEFAULT_BACKGROUND: BackgroundStyle = 'green';

export const BACKGROUND_HEX: Record<BackgroundStyle, string> = {
  green: '#145c38',
  purple: '#422490',
  red: '#81173f',
};

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isTableStyle(value: unknown): value is TableStyle {
  return (
    typeof value === 'string' &&
    (TABLE_STYLES as readonly string[]).includes(value)
  );
}

interface StoredTheme {
  style: TableStyle;
  background: BackgroundStyle;
}

function readTheme(clientId: string, storage: ThemeStorage): StoredTheme {
  const fallback: StoredTheme = {
    style: DEFAULT_STYLE,
    background: DEFAULT_BACKGROUND,
  };
  const raw = storage.getItem(THEME_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }
  const record = parsed as Record<string, unknown>;
  if (record.clientId !== clientId) {
    return fallback;
  }
  return {
    style: isTableStyle(record.style) ? record.style : DEFAULT_STYLE,
    background: isTableStyle(record.background)
      ? record.background
      : DEFAULT_BACKGROUND,
  };
}

function writeTheme(
  clientId: string,
  style: TableStyle,
  background: BackgroundStyle,
  storage: ThemeStorage,
): void {
  storage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({ clientId, style, background }),
  );
}

/**
 * Reads the table color saved for this `clientId`. Falls back to green felt
 * when nothing is stored, the JSON is malformed, or the stored `clientId`
 * does not match.
 */
export function getTheme(
  clientId: string,
  storage: ThemeStorage = localStorage,
): TableStyle {
  return readTheme(clientId, storage).style;
}

/** Reads the page and felt-margin color saved for this `clientId`. */
export function getBackground(
  clientId: string,
  storage: ThemeStorage = localStorage,
): BackgroundStyle {
  return readTheme(clientId, storage).background;
}

export function backgroundHex(style: BackgroundStyle): string {
  return BACKGROUND_HEX[style];
}

/** Saves the table color and keeps the background already stored for this id. */
export function saveTheme(
  clientId: string,
  style: TableStyle,
  storage: ThemeStorage = localStorage,
): void {
  const current = readTheme(clientId, storage);
  writeTheme(clientId, style, current.background, storage);
}

/** Saves the background color and keeps the table color already stored. */
export function saveBackground(
  clientId: string,
  background: BackgroundStyle,
  storage: ThemeStorage = localStorage,
): void {
  const current = readTheme(clientId, storage);
  writeTheme(clientId, current.style, background, storage);
}

/** Steps through green, purple, and red. `delta` may be negative. */
export function stepTableStyle(current: TableStyle, delta: number): TableStyle {
  const count = TABLE_STYLES.length;
  const index = TABLE_STYLES.indexOf(current);
  const next = ((((index < 0 ? 0 : index) + delta) % count) + count) % count;
  return TABLE_STYLES[next] ?? DEFAULT_STYLE;
}
