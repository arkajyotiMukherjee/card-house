import { expect, it } from 'vitest';
import { tableNoticeLayout } from './table-notice';

it('keeps the buy-in error in the personal status area, clear of all cards', () => {
  const message = 'Top-up is outside the buy-in limits';
  for (const mobile of [false, true]) {
    const layout = tableNoticeLayout(message, mobile, true, true);
    expect(layout.y).toBeGreaterThanOrEqual(436);
    expect(layout.y + layout.h).toBeLessThanOrEqual(532);
    expect(layout.x).toBeGreaterThan(520);
    expect(layout.x + layout.w).toBeLessThanOrEqual(952);
    expect(layout.lines.join(' ')).toBe(message);
    for (const line of layout.lines)
      expect((line.length * layout.size) / 2 + 24).toBeLessThanOrEqual(
        layout.w,
      );
  }
});

it('wraps longer server warnings within the visible table notification', () => {
  const message =
    'Your stack cannot exceed this table’s maximum buy-in. Choose a smaller top-up and try again.';
  const layout = tableNoticeLayout(message, true, true, true);
  expect(layout.lines.length).toBeGreaterThan(1);
  expect(layout.lines.join(' ')).toBe(message);
  expect(layout.y).toBeGreaterThanOrEqual(436);
  expect(layout.y + layout.h).toBeLessThanOrEqual(532);
  for (const line of layout.lines)
    expect((line.length * layout.size) / 2 + 24).toBeLessThanOrEqual(layout.w);
});

it('keeps compact-game errors in the action column rather than over the wider private hand', () => {
  for (const message of [
    'Invalid intent',
    'Not your turn',
    'Choose a rank you hold, then pick another player to ask.',
  ]) {
    const layout = tableNoticeLayout(message, true, true, true, undefined, 184);
    expect(layout.x).toBeGreaterThanOrEqual(752);
    expect(layout.x + layout.w).toBeLessThanOrEqual(952);
    expect(layout.y).toBeGreaterThanOrEqual(436);
    expect(layout.y + layout.h).toBeLessThanOrEqual(532);
    expect(layout.lines.join(' ')).toBe(message);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(
      layout.h - 12,
    );
    for (const line of layout.lines)
      expect((line.length * layout.size) / 2 + 24).toBeLessThanOrEqual(
        layout.w,
      );
  }
});

it('fits Blackjack warnings beside its wider action column and away from the focused hand', () => {
  const message = 'Your stack cannot exceed the maximum buy-in';
  const layout = tableNoticeLayout(message, true, true, true, undefined, 260);
  expect(layout.x).toBe(676);
  expect(layout.x + layout.w).toBe(936);
  expect(layout.lines.join(' ')).toBe(message);
  expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(
    layout.h - 12,
  );
});
