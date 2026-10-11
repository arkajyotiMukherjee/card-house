import { describe, expect, it } from 'vitest';
import { bluffGameDefinition } from '../../src/shared/games/bluff';
import { crazyEightsGameDefinition } from '../../src/shared/games/crazy-eights';
import { goFishGameDefinition } from '../../src/shared/games/go-fish';
import { presidentGameDefinition } from '../../src/shared/games/president';
import { rummyGameDefinition } from '../../src/shared/games/rummy';
import { blackjackGameDefinition } from '../../src/shared/games/blackjack';
import { HOW_TO_PLAY_TEXT } from './game-scene';
import {
  clampScroll,
  definitionFor,
  layoutHowToPlay,
  wrapText,
} from './how-to-play';

describe('definitionFor', () => {
  it('returns the Bluff definition for gameType bluff', () => {
    expect(definitionFor('bluff')).toBe(bluffGameDefinition);
  });

  it('returns the President definition for gameType president', () => {
    expect(definitionFor('president')).toBe(presidentGameDefinition);
  });

  it('returns the Go Fish definition for gameType go_fish', () => {
    expect(definitionFor('go_fish')).toBe(goFishGameDefinition);
  });

  it('returns the Crazy Eights definition for gameType crazy_eights', () => {
    expect(definitionFor('crazy_eights')).toBe(crazyEightsGameDefinition);
  });

  it('returns the Rummy definition for gameType rummy', () => {
    expect(definitionFor('rummy')).toBe(rummyGameDefinition);
    const layout = layoutHowToPlay(
      rummyGameDefinition,
      HOW_TO_PLAY_TEXT.columns,
    );
    expect(layout.title).toBe('How to Play Rummy');
    for (const line of layout.lines) {
      expect(line.length).toBeLessThanOrEqual(HOW_TO_PLAY_TEXT.columns);
    }
    expect(layout.lines.length).toBeLessThanOrEqual(HOW_TO_PLAY_TEXT.rows);
  });

  it('returns the Blackjack definition for gameType blackjack', () => {
    expect(definitionFor('blackjack')).toBe(blackjackGameDefinition);
  });

  it('has no definition for an unknown gameType', () => {
    expect(definitionFor('nope')).toBeUndefined();
  });
});

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('splits a word longer than the line', () => {
    expect(wrapText('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
  });

  it('rejects a zero width', () => {
    expect(() => wrapText('a', 0)).toThrow();
  });
});

describe('layoutHowToPlay', () => {
  it('titles the overlay from the markdown heading', () => {
    const layout = layoutHowToPlay(bluffGameDefinition, 84);
    expect(layout.title).toBe('How to Play Bluff');
  });

  it('keeps every body word of the Bluff how-to-play text', () => {
    const layout = layoutHowToPlay(bluffGameDefinition, 84);
    const body = bluffGameDefinition.howToPlay
      .replace(/^# .*\n+/, '')
      .split(/\s+/)
      .join(' ');
    expect(layout.lines.join(' ')).toBe(body);
  });

  it('wraps within the column count and fits the window', () => {
    const layout = layoutHowToPlay(
      bluffGameDefinition,
      HOW_TO_PLAY_TEXT.columns,
    );
    for (const line of layout.lines) {
      expect(line.length).toBeLessThanOrEqual(HOW_TO_PLAY_TEXT.columns);
    }
    expect(layout.lines.length).toBeLessThanOrEqual(HOW_TO_PLAY_TEXT.rows);
  });

  it('separates blocks and formats bullets and sub-headings', () => {
    const layout = layoutHowToPlay(
      {
        gameType: 'x',
        displayName: 'X',
        minPlayers: 1,
        maxPlayers: 2,
        howToPlay: '# Title\n\nIntro text.\n\n## Turn\n\n- one\n- two',
      },
      20,
    );
    expect(layout.title).toBe('How to Play Title');
    expect(layout.lines).toEqual([
      'Intro text.',
      '',
      'Turn',
      '',
      '- one',
      '- two',
    ]);
  });

  it('falls back to the display name without a heading', () => {
    const layout = layoutHowToPlay(
      {
        gameType: 'x',
        displayName: 'Plain',
        minPlayers: 1,
        maxPlayers: 2,
        howToPlay: 'Just text.',
      },
      40,
    );
    expect(layout.title).toBe('How to Play Plain');
    expect(layout.lines).toEqual(['Just text.']);
  });
});

describe('clampScroll', () => {
  it('stays inside the text', () => {
    expect(clampScroll(-3, 30, 19)).toBe(0);
    expect(clampScroll(5, 30, 19)).toBe(5);
    expect(clampScroll(99, 30, 19)).toBe(11);
  });

  it('does not scroll text that fits', () => {
    expect(clampScroll(3, 10, 19)).toBe(0);
  });
});
