import { wrapText } from './menu-layout';

/** Columns that fit the 136px table-list error box at 8px per glyph. */
export const TABLE_ERROR_COLUMNS = 17;

const JOIN_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ['Table is full', 'Table is full. Try another.'],
  ['Game already started', 'Game has started. Try another.'],
  ['Game already ended', 'Game has ended. Try another.'],
  ['Room closed', 'Room is closed. Get a new code.'],
];

/**
 * Turns a module rejection into the line the player reads. Each way a join can
 * be refused has its own message. Anything else keeps the module's text.
 */
export function joinFailureMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : '';
  for (const [needle, message] of JOIN_MESSAGES) {
    if (raw.includes(needle)) {
      return message;
    }
  }
  return raw.length > 0 ? raw : fallback;
}

/** Wraps a join failure to the table-list error box. */
export function wrapTableError(message: string): string {
  return wrapText(message, TABLE_ERROR_COLUMNS).join('\n');
}
