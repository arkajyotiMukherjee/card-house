import { TABLE_STYLES, type TableStyle } from './table-atlas';

/** localStorage key for the chosen color theme. Keep this name stable. */
export const THEME_STORAGE_KEY = 'theme';

const DEFAULT_STYLE: TableStyle = 'green';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isTableStyle(value: unknown): value is TableStyle {
  return (
    typeof value === 'string' &&
    (TABLE_STYLES as readonly string[]).includes(value)
  );
}

/**
 * Reads the color theme saved for this `clientId`. Falls back to the default
 * felt when nothing is stored, the JSON is malformed, or the stored
 * `clientId` does not match (e.g. a cleared and regenerated id).
 */
export function getTheme(
  clientId: string,
  storage: ThemeStorage = localStorage,
): TableStyle {
  const raw = storage.getItem(THEME_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_STYLE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_STYLE;
  }
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_STYLE;
  }
  const record = parsed as Record<string, unknown>;
  if (record.clientId !== clientId || !isTableStyle(record.style)) {
    return DEFAULT_STYLE;
  }
  return record.style;
}

/** Saves the chosen color theme, keyed by this `clientId`. */
export function saveTheme(
  clientId: string,
  style: TableStyle,
  storage: ThemeStorage = localStorage,
): void {
  storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ clientId, style }));
}
