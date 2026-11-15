import { expect, it } from 'vitest';
import { resultNoticeLayout } from './result-notice';

it('wraps winner names in the empty margin without covering result cards or the local hand', () => {
  for (const mobile of [false, true]) {
    for (const text of [
      'Winner: Alexandra',
      'Winners: Alexandra, Benjamin, Charlotte, Dominique',
    ]) {
      const notice = resultNoticeLayout(text, mobile);
      expect(960 - notice.width - 8).toBeGreaterThan(736);
      expect(540 - notice.height - 8).toBeGreaterThanOrEqual(440);
      expect(notice.lines.join(' ')).toBe(text);
      for (const line of notice.lines)
        expect(line.length * notice.size).toBeLessThanOrEqual(
          notice.width - 16,
        );
    }
  }
});
