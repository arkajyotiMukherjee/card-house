import { describe, expect, it } from 'vitest';
import { bluffGameDefinition } from '../../src/shared/games/bluff';
import {
  CARD_STYLE,
  FLOATER_MARGIN,
  MENU_BUTTONS,
  MENU_THEME_BUTTON,
  MENU_TITLE,
  floaterPose,
  makeFloaters,
  menuAcceptsAction,
  nextFieldAfterEnter,
  promptError,
  promptFields,
  splitHowToPlay,
  stepIndex,
  themeButtonLabel,
  wrapText,
} from './menu-layout';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

describe('menu title', () => {
  it('names the game Card House', () => {
    expect(MENU_TITLE.text).toBe('Card House');
  });
});

describe('menu buttons', () => {
  it('lists Create Room, Join Room, How to Play, and Card Style in a centered stack', () => {
    expect(MENU_BUTTONS.map((button) => button.caption)).toEqual([
      'Create Room',
      'Join Room',
      'How to Play (All Games)',
      'Card Style',
    ]);
    for (const button of MENU_BUTTONS) {
      expect(button.x + button.w / 2).toBe(LOGICAL_WIDTH / 2);
      expect(button.y + button.h).toBeLessThanOrEqual(LOGICAL_HEIGHT);
    }
    for (let index = 1; index < MENU_BUTTONS.length; index += 1) {
      const above = MENU_BUTTONS[index - 1];
      const below = MENU_BUTTONS[index];
      expect(below?.y).toBeGreaterThan((above?.y ?? 0) + (above?.h ?? 0));
    }
  });
});

describe('overlay clicks', () => {
  it('draws Card Style Close over How to Play', () => {
    const howto = MENU_BUTTONS.find((button) => button.action === 'howto');
    const close = CARD_STYLE.close;
    expect(howto).toBeDefined();
    if (!howto) {
      return;
    }
    const overlaps =
      close.x < howto.x + howto.w &&
      close.x + close.w > howto.x &&
      close.y < howto.y + howto.h &&
      close.y + close.h > howto.y;
    expect(overlaps).toBe(true);
  });

  it('ignores a menu action when the dialog already took the click', () => {
    expect(menuAcceptsAction('cards', true)).toBe(false);
    expect(menuAcceptsAction('main', true)).toBe(false);
    expect(menuAcceptsAction('howto', false)).toBe(false);
    expect(menuAcceptsAction('main', false)).toBe(true);
  });
});

describe('theme button', () => {
  it('sits clear of the main menu panel', () => {
    expect(MENU_THEME_BUTTON.x + MENU_THEME_BUTTON.w).toBeLessThanOrEqual(
      LOGICAL_WIDTH,
    );
    expect(MENU_THEME_BUTTON.y + MENU_THEME_BUTTON.h).toBeLessThanOrEqual(72);
  });

  it('names the current table style', () => {
    expect(themeButtonLabel('green')).toBe('Theme: Green');
    expect(themeButtonLabel('purple')).toBe('Theme: Purple');
    expect(themeButtonLabel('red')).toBe('Theme: Red');
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
    expect(parts.body.startsWith('Play 1 to 4 cards')).toBe(true);
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
