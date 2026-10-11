import { describe, expect, it } from 'vitest';
import { bluffGameDefinition } from '../../src/shared/games/bluff';
import {
  FLOATER_MARGIN,
  MENU_BUTTONS,
  floaterPose,
  makeFloaters,
  nextFieldAfterEnter,
  promptError,
  promptFields,
  splitHowToPlay,
  stepIndex,
  wrapText,
} from './menu-layout';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

describe('menu buttons', () => {
  it('lists Create Room, Join Room, and How to Play in a centered stack', () => {
    expect(MENU_BUTTONS.map((button) => button.caption)).toEqual([
      'Create Room',
      'Join Room',
      'How to Play (All Games)',
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
