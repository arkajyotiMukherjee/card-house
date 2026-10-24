import { describe, expect, it } from 'vitest';
import { reloadLanding, reloadLoadingLine } from './reload-landing';

describe('reload landing', () => {
  it('opens the table, the lobby, or the menu once the session is ready', () => {
    expect(reloadLanding({ atTable: true, inRoom: true })).toBe('table');
    expect(reloadLanding({ atTable: true, inRoom: false })).toBe('table');
    expect(reloadLanding({ atTable: false, inRoom: true })).toBe('lobby');
    expect(reloadLanding({ atTable: false, inRoom: false })).toBe('menu');
  });

  it('names the saved session on the empty table while it resolves', () => {
    expect(reloadLoadingLine({ tableId: 'table_1' })).toBe('Loading table');
    expect(reloadLoadingLine({ tableId: '  ' })).toBe('Loading room');
    expect(reloadLoadingLine({ tableId: '' })).toBe('Loading room');
    expect(reloadLoadingLine(undefined)).toBeUndefined();
  });
});
