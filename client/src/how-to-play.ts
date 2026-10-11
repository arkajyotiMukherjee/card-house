import {
  bluffGameDefinition,
  BLUFF_GAME_TYPE,
} from '../../src/shared/games/bluff';
import {
  presidentGameDefinition,
  PRESIDENT_GAME_TYPE,
} from '../../src/shared/games/president';
import {
  dummyGameDefinition,
  DUMMY_GAME_TYPE,
} from '../../src/shared/games/dummy-counter';
import type { GameDefinition } from '../../src/shared/games/game-definition';

/** Definitions the table can show instructions for, keyed by `gameType`. */
const DEFINITIONS: ReadonlyMap<string, GameDefinition> = new Map<
  string,
  GameDefinition
>([
  [BLUFF_GAME_TYPE, bluffGameDefinition],
  [PRESIDENT_GAME_TYPE, presidentGameDefinition],
  [DUMMY_GAME_TYPE, dummyGameDefinition],
]);

export interface HowToPlayText {
  title: string;
  lines: string[];
}

export function definitionFor(gameType: string): GameDefinition | undefined {
  return DEFINITIONS.get(gameType);
}

/** Greedy word wrap. A word longer than `maxChars` is split. */
export function wrapText(text: string, maxChars: number): string[] {
  if (maxChars < 1) {
    throw new Error('maxChars must be at least 1');
  }
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (word.length === 0) {
      continue;
    }
    let rest = word;
    while (rest.length > maxChars) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (current.length === 0) {
      current = rest;
    } else if (current.length + 1 + rest.length <= maxChars) {
      current = `${current} ${rest}`;
    } else {
      lines.push(current);
      current = rest;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * Turns a `howToPlay` markdown string into a title and wrapped body lines.
 * The first `#` heading becomes the title. Other headings and paragraphs are
 * wrapped, bullets keep a `- ` marker, and a blank line separates blocks.
 */
export function layoutHowToPlay(
  definition: GameDefinition,
  maxChars: number,
): HowToPlayText {
  let heading = definition.displayName;
  const lines: string[] = [];
  let seenHeading = false;
  let paragraph: string[] = [];

  const gap = (): void => {
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
  };
  const flush = (): void => {
    if (paragraph.length === 0) {
      return;
    }
    lines.push(...wrapText(paragraph.join(' '), maxChars));
    paragraph = [];
  };

  for (const raw of definition.howToPlay.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) {
      flush();
      gap();
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      const text = (headingMatch[2] ?? '').trim();
      if (!seenHeading && headingMatch[1] === '#') {
        seenHeading = true;
        heading = text.length > 0 ? text : heading;
      } else {
        gap();
        lines.push(...wrapText(text, maxChars));
      }
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const wrapped = wrapText(bullet[1] ?? '', maxChars - 2);
      wrapped.forEach((part, index) => {
        lines.push(`${index === 0 ? '- ' : '  '}${part}`);
      });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return { title: `How to Play ${heading}`, lines };
}

export function clampScroll(
  offset: number,
  totalLines: number,
  visibleLines: number,
): number {
  const max = Math.max(0, totalLines - visibleLines);
  return Math.min(Math.max(0, offset), max);
}
