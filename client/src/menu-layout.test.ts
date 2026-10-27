import { describe, expect, it } from 'vitest';
import { bluffGameDefinition } from '../../src/shared/games/bluff';
import {
  FLOATER_MARGIN,
  MENU_BACKDROP,
  MENU_BUTTONS,
  MENU_TITLE,
  SOLO_PICKER,
  THEME_PANEL,
  soloSeatCount,
  soloSettingsJson,
  floaterPose,
  makeFloaters,
  menuAcceptsAction,
  nextFieldAfterEnter,
  promptError,
  promptFields,
  splitHowToPlay,
  stepIndex,
  wrapText,
} from './menu-layout';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

describe('menu title', () => {
  it('names the game Card House', () => {
    expect(MENU_TITLE.text).toBe('Card House');
  });
});

describe('menu buttons', () => {
  it('lists Create Room, Join Room, Single Player, How to Play, and Theme in a centered stack', () => {
    expect(MENU_BUTTONS.map((button) => button.caption)).toEqual([
      'Create Room',
      'Join Room',
      'Single Player',
      'How to Play (All Games)',
      'Theme',
    ]);
    for (const button of MENU_BUTTONS) {
      expect(button.x + button.w / 2).toBe(LOGICAL_WIDTH / 2);
      expect(button.y + button.h).toBeLessThanOrEqual(LOGICAL_HEIGHT);
      expect(button.x).toBeGreaterThanOrEqual(MENU_BACKDROP.x);
      expect(button.x + button.w).toBeLessThanOrEqual(
        MENU_BACKDROP.x + MENU_BACKDROP.w,
      );
      expect(button.y).toBeGreaterThanOrEqual(MENU_BACKDROP.y);
      expect(button.y + button.h).toBeLessThanOrEqual(
        MENU_BACKDROP.y + MENU_BACKDROP.h,
      );
    }
    for (let index = 1; index < MENU_BUTTONS.length; index += 1) {
      const above = MENU_BUTTONS[index - 1];
      const below = MENU_BUTTONS[index];
      expect(below?.y).toBeGreaterThan((above?.y ?? 0) + (above?.h ?? 0));
    }
  });
});

describe('overlay clicks', () => {
  it('draws Theme Close over the Theme button', () => {
    const theme = MENU_BUTTONS.find((button) => button.action === 'theme');
    const close = THEME_PANEL.close;
    expect(theme).toBeDefined();
    if (!theme) {
      return;
    }
    const overlaps =
      close.x < theme.x + theme.w &&
      close.x + close.w > theme.x &&
      close.y < theme.y + theme.h &&
      close.y + close.h > theme.y;
    expect(overlaps).toBe(true);
  });

  it('ignores a menu action when the dialog already took the click', () => {
    expect(menuAcceptsAction('theme', true)).toBe(false);
    expect(menuAcceptsAction('main', true)).toBe(false);
    expect(menuAcceptsAction('howto', false)).toBe(false);
    expect(menuAcceptsAction('main', false)).toBe(true);
  });
});

describe('theme panel', () => {
  it('lists card front, card back, table color, and background with previews', () => {
    expect(THEME_PANEL.choices.map((choice) => choice.id)).toEqual([
      'front',
      'back',
      'table',
      'background',
    ]);
    expect(THEME_PANEL.choices.map((choice) => choice.label)).toEqual([
      'Card Front',
      'Card Back',
      'Table Color',
      'Background',
    ]);
    expect(THEME_PANEL.choices.map((choice) => choice.preview)).toEqual([
      'face',
      'back',
      'table',
      'background',
    ]);
    const panel = THEME_PANEL.panel;
    for (const choice of THEME_PANEL.choices) {
      const preview = choice.previewBox;
      expect(preview.w).toBeGreaterThan(0);
      expect(preview.h).toBeGreaterThan(0);
      expect(preview.x).toBeGreaterThanOrEqual(panel.x);
      expect(preview.y).toBeGreaterThanOrEqual(panel.y);
      expect(preview.x + preview.w).toBeLessThanOrEqual(panel.x + panel.w);
      expect(preview.y + preview.h).toBeLessThanOrEqual(panel.y + panel.h);
      expect(preview.x).toBeGreaterThan(choice.x);
      const arrowCenter = choice.y + THEME_PANEL.arrow.h / 2;
      const previewCenter = preview.y + preview.h / 2;
      expect(previewCenter).toBe(arrowCenter);
    }
    for (let index = 0; index < THEME_PANEL.choices.length; index += 1) {
      const box = THEME_PANEL.choices[index]?.previewBox;
      if (!box) {
        continue;
      }
      for (
        let other = index + 1;
        other < THEME_PANEL.choices.length;
        other += 1
      ) {
        const next = THEME_PANEL.choices[other]?.previewBox;
        if (!next) {
          continue;
        }
        const overlaps =
          box.x < next.x + next.w &&
          box.x + box.w > next.x &&
          box.y < next.y + next.h &&
          box.y + box.h > next.y;
        expect(overlaps).toBe(false);
      }
    }
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.w).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(panel.y + panel.h).toBeLessThanOrEqual(LOGICAL_HEIGHT);
  });
});

describe('single player picker', () => {
  it('keeps the picker inside the frame', () => {
    const boxes = [
      SOLO_PICKER.panel,
      SOLO_PICKER.nameField,
      SOLO_PICKER.play,
      SOLO_PICKER.cancel,
    ];
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(LOGICAL_WIDTH);
      expect(box.y + box.h).toBeLessThanOrEqual(LOGICAL_HEIGHT);
    }
  });

  it('wraps the seat count inside the catalog range', () => {
    expect(soloSeatCount(4, 4, 3)).toBe(4);
    expect(soloSeatCount(2, 6, 0)).toBe(2);
    expect(soloSeatCount(2, 6, 4)).toBe(6);
    expect(soloSeatCount(2, 6, 5)).toBe(2);
    expect(soloSeatCount(1, 7, -1)).toBe(7);
  });

  it('sends a poker variation and nothing for the other games', () => {
    expect(soloSettingsJson('poker', 'omaha')).toBe(
      JSON.stringify({ variation: 'omaha' }),
    );
    expect(soloSettingsJson('hearts', 'omaha')).toBeUndefined();
    expect(soloSettingsJson('poker', undefined)).toBeUndefined();
  });
});

describe('menu prompts', () => {
  it('asks for a code only when joining', () => {
    expect(promptFields('create').map((field) => field.id)).toEqual(['name']);
    expect(promptFields('join').map((field) => field.id)).toEqual([
      'name',
      'code',
    ]);
  });

  it('requires a name, and a code to join', () => {
    expect(promptError('create', '  ', '')).toBe('Name is required');
    expect(promptError('create', 'Ada', '')).toBeUndefined();
    expect(promptError('join', 'Ada', ' ')).toBe('Room code is required');
    expect(promptError('join', 'Ada', 'AB3D')).toBeUndefined();
  });

  it('moves from the name to the code, then submits', () => {
    expect(nextFieldAfterEnter('create', 'name', 'Ada')).toBe('submit');
    expect(nextFieldAfterEnter('join', 'name', 'Ada')).toBe('code');
    expect(nextFieldAfterEnter('join', 'name', '')).toBe('submit');
    expect(nextFieldAfterEnter('join', 'code', 'Ada')).toBe('submit');
  });
});

describe('how to play text', () => {
  it('splits the heading from the Bluff rules', () => {
    const parts = splitHowToPlay(bluffGameDefinition.howToPlay);
    expect(parts.title).toBe('Bluff');
    expect(parts.body.startsWith('The lead selects any number')).toBe(true);
  });

  it('wraps at word boundaries within the column limit', () => {
    const lines = wrapText('one two three four', 9);
    expect(lines).toEqual(['one two', 'three', 'four']);
    for (const line of wrapText(bluffGameDefinition.howToPlay, 40)) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('splits a word longer than the column', () => {
    expect(wrapText('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
  });

  it('wraps the list index in both directions', () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe('background drifters', () => {
  it('builds the same cards and chips every time', () => {
    expect(makeFloaters(10)).toEqual(makeFloaters(10));
    const kinds = new Set(makeFloaters(10).map((floater) => floater.kind));
    expect(kinds).toEqual(new Set(['card', 'back', 'chip']));
  });

  it('moves over time and stays inside the looped margin', () => {
    for (const spec of makeFloaters(10)) {
      const start = floaterPose(spec, 0);
      const later = floaterPose(spec, 5);
      expect(later.x !== start.x || later.y !== start.y).toBe(true);
      for (const seconds of [0, 17, 90, 1234]) {
        const pose = floaterPose(spec, seconds);
        expect(pose.x).toBeGreaterThanOrEqual(-FLOATER_MARGIN);
        expect(pose.x).toBeLessThan(LOGICAL_WIDTH + FLOATER_MARGIN);
        expect(pose.y).toBeGreaterThanOrEqual(-FLOATER_MARGIN);
        expect(pose.y).toBeLessThan(LOGICAL_HEIGHT + FLOATER_MARGIN);
      }
    }
  });
});
