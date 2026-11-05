import { BUTTON_HEIGHT } from './button-style';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';
import { isMobileDevice } from './mobile-shell';

const PHONE_LAYOUT = typeof window !== 'undefined' && isMobileDevice();

export const MENU_VERSION = 'v0.1';

export type MenuAction = 'create' | 'join' | 'solo' | 'howto' | 'theme';

export interface MenuButtonSpec {
  action: MenuAction;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BUTTON_W = 400;
const BUTTON_H = PHONE_LAYOUT ? 64 : 44;
const BUTTON_GAP = PHONE_LAYOUT ? 8 : 16;
const BUTTON_TOP = 168;

const MENU_ENTRIES: ReadonlyArray<Pick<MenuButtonSpec, 'action' | 'caption'>> =
  [
    { action: 'create', caption: 'Create Room' },
    { action: 'join', caption: 'Join Room' },
    { action: 'solo', caption: 'Single Player' },
    { action: 'howto', caption: 'How to Play (All Games)' },
    { action: 'theme', caption: 'Theme' },
  ];

export const MENU_BUTTONS: readonly MenuButtonSpec[] = MENU_ENTRIES.map(
  (entry, index) => ({
    ...entry,
    x: (LOGICAL_WIDTH - BUTTON_W) / 2,
    y: BUTTON_TOP + index * (BUTTON_H + BUTTON_GAP),
    w: BUTTON_W,
    h: BUTTON_H,
  }),
);

export const MENU_BACKDROP = {
  x: 200,
  y: 48,
  w: 560,
  h: PHONE_LAYOUT ? 480 : 420,
} as const;

export const MENU_TITLE = { text: 'Card House', size: 48, y: 72 } as const;
export const MENU_TAGLINE = {
  text: 'Online card games with friends',
  size: 8,
  y: 132,
} as const;

/** Single Player picker. Five menu buttons already fill the main panel. */
export const SOLO_PICKER = {
  panel: { x: 180, y: 36, w: 600, h: 468 },
  gameRow: { x: 220, y: PHONE_LAYOUT ? 100 : 110 },
  seatRow: { x: 220, y: PHONE_LAYOUT ? 190 : 180 },
  variationRow: { x: 220, y: PHONE_LAYOUT ? 280 : 250 },
  nameField: {
    x: 220,
    y: PHONE_LAYOUT ? 370 : 320,
    w: 520,
    h: PHONE_LAYOUT ? 44 : 28,
  },
  error: { x: 220, y: PHONE_LAYOUT ? 416 : 364 },
  play: {
    x: 220,
    y: PHONE_LAYOUT ? 430 : 400,
    w: 240,
    h: PHONE_LAYOUT ? 64 : BUTTON_HEIGHT,
  },
  cancel: {
    x: 500,
    y: PHONE_LAYOUT ? 430 : 400,
    w: 240,
    h: PHONE_LAYOUT ? 64 : BUTTON_HEIGHT,
  },
  arrowGap: PHONE_LAYOUT ? 456 : 280,
} as const;

/** Seat count the picker shows. `index` wraps inside min..max. */
export function soloSeatCount(
  minPlayers: number,
  maxPlayers: number,
  index: number,
): number {
  const span = maxPlayers - minPlayers + 1;
  if (span <= 1) {
    return minPlayers;
  }
  return minPlayers + stepIndex(index, 0, span);
}

/** Poker stores its variation. Every other game starts with no settings. */
export function soloSettingsJson(
  gameType: string,
  variation: string | undefined,
): string | undefined {
  if (
    gameType !== 'poker' ||
    variation === undefined ||
    variation.length === 0
  ) {
    return undefined;
  }
  return JSON.stringify({ variation });
}

export const PROMPT = PHONE_LAYOUT
  ? ({
      panel: { x: 180, y: 48, w: 600, h: 444 },
      nameField: { x: 220, y: 144, w: 520, h: 64 },
      codeField: { x: 220, y: 256, w: 520, h: 64 },
      submit: { x: 220, y: 400, w: 240, h: 64 },
      cancel: { x: 500, y: 400, w: 240, h: 64 },
      error: { x: 220, y: 356 },
    } as const)
  : ({
      panel: { x: 220, y: 150, w: 520, h: 240 },
      nameField: { x: 244, y: 214, w: 472, h: 28 },
      codeField: { x: 244, y: 270, w: 472, h: 28 },
      submit: { x: 244, y: 336, w: 224, h: BUTTON_HEIGHT },
      cancel: { x: 492, y: 336, w: 224, h: BUTTON_HEIGHT },
      error: { x: 244, y: 310 },
    } as const);

export const HOW_TO_PLAY = {
  panel: { x: 40, y: 40, w: 880, h: 460 },
  list: { x: 56, y: 96, w: 240, rowH: 28 },
  body: { x: 320, y: 96, w: 584, lineH: 16, maxLines: 22 },
  back: { x: 56, y: 450, w: 120, h: BUTTON_HEIGHT },
} as const;

export type ThemeChoiceId = 'front' | 'back' | 'table' | 'background';

export type ThemePreview = 'face' | 'back' | 'table' | 'background';

export interface ThemeChoiceSpec {
  id: ThemeChoiceId;
  label: string;
  preview: ThemePreview;
  x: number;
  y: number;
  labelY: number;
  previewBox: { x: number; y: number; w: number; h: number };
}

/**
 * One Theme panel. Each row has arrows and a preview beside the choice:
 * a card face, a card back, a table swatch, and a background swatch.
 */
export const THEME_PANEL = {
  panel: { x: 120, y: 24, w: 720, h: PHONE_LAYOUT ? 504 : 432 },
  arrow: { w: PHONE_LAYOUT ? 64 : 24, h: PHONE_LAYOUT ? 64 : 24 },
  arrowGap: PHONE_LAYOUT ? 400 : 200,
  close: {
    x: 280,
    y: PHONE_LAYOUT ? 448 : 416,
    w: PHONE_LAYOUT ? 360 : 160,
    h: PHONE_LAYOUT ? 64 : BUTTON_HEIGHT,
  },
  choices: [
    {
      id: 'front',
      label: 'Card Front',
      preview: 'face',
      x: 168,
      y: 108,
      labelY: 88,
      previewBox: { x: PHONE_LAYOUT ? 680 : 400, y: 88, w: 64, h: 64 },
    },
    {
      id: 'back',
      label: 'Card Back',
      preview: 'back',
      x: 168,
      y: 196,
      labelY: 176,
      previewBox: { x: PHONE_LAYOUT ? 680 : 400, y: 176, w: 64, h: 64 },
    },
    {
      id: 'table',
      label: 'Table Color',
      preview: 'table',
      x: 168,
      y: 284,
      labelY: 264,
      previewBox: { x: PHONE_LAYOUT ? 680 : 400, y: 256, w: 129, h: 80 },
    },
    {
      id: 'background',
      label: 'Background',
      preview: 'background',
      x: 168,
      y: 372,
      labelY: 352,
      previewBox: { x: PHONE_LAYOUT ? 680 : 400, y: 368, w: 48, h: 32 },
    },
  ] as const satisfies readonly ThemeChoiceSpec[],
} as const;

export type PromptKind = 'create' | 'join';

export type MenuMode = 'main' | PromptKind | 'solo' | 'howto' | 'theme';

/**
 * A menu button runs only on the main menu, and only when the open dialog
 * did not already take this click. Theme's Close sits on the Theme button.
 * Closing the dialog must not count as pressing the button underneath.
 */
export function menuAcceptsAction(
  mode: MenuMode,
  overlayClaimedClick: boolean,
): boolean {
  return mode === 'main' && !overlayClaimedClick;
}

export interface PromptField {
  id: 'name' | 'code';
  label: string;
}

export function promptFields(kind: PromptKind): readonly PromptField[] {
  return kind === 'create'
    ? [{ id: 'name', label: 'Your Name' }]
    : [
        { id: 'name', label: 'Your Name' },
        { id: 'code', label: 'Room Code' },
      ];
}

export function promptTitle(kind: PromptKind): string {
  return kind === 'create' ? 'Create Room' : 'Join Room';
}

export function promptSubmitLabel(kind: PromptKind): string {
  return kind === 'create' ? 'Create' : 'Join';
}

/** Where an Enter press lands: the next empty field, or submit on the last. */
export function nextFieldAfterEnter(
  kind: PromptKind,
  focused: 'name' | 'code',
  name: string,
): 'name' | 'code' | 'submit' {
  if (kind === 'create') {
    return 'submit';
  }
  return focused === 'name' && name.trim().length > 0 ? 'code' : 'submit';
}

export function promptError(
  kind: PromptKind,
  name: string,
  code: string,
): string | undefined {
  if (name.trim().length === 0) {
    return 'Name is required';
  }
  if (kind === 'join' && code.trim().length === 0) {
    return 'Room code is required';
  }
  return undefined;
}

/** Strip the markdown heading and return the title and body of a how-to-play. */
export function splitHowToPlay(markdown: string): {
  title: string;
  body: string;
} {
  const lines = markdown.split('\n');
  const first = lines[0] ?? '';
  if (first.startsWith('# ')) {
    return {
      title: first.slice(2).trim(),
      body: lines.slice(1).join('\n').trim(),
    };
  }
  return { title: '', body: markdown.trim() };
}

/** Greedy word wrap at a fixed column count. Long words are split. */
export function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim().length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const rawWord of paragraph.split(/\s+/)) {
      let word = rawWord;
      while (word.length > maxChars) {
        if (line.length > 0) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (word.length === 0) {
        continue;
      }
      if (line.length === 0) {
        line = word;
      } else if (line.length + 1 + word.length <= maxChars) {
        line = `${line} ${word}`;
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line.length > 0) {
      out.push(line);
    }
  }
  return out;
}

export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return (((index + delta) % count) + count) % count;
}

export type FloaterKind = 'card' | 'back' | 'chip';

export interface FloaterSpec {
  kind: FloaterKind;
  /** Card rank/suit or chip color name, depending on `kind`. */
  face: string;
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  /** Radians per second. */
  spin: number;
  phase: number;
  scale: number;
}

const FLOATER_FACES: ReadonlyArray<{ kind: FloaterKind; face: string }> = [
  { kind: 'card', face: 'A:hearts' },
  { kind: 'card', face: 'K:spades' },
  { kind: 'card', face: 'Q:diamonds' },
  { kind: 'card', face: 'J:clubs' },
  { kind: 'back', face: 'back' },
  { kind: 'chip', face: 'red' },
  { kind: 'chip', face: 'blue' },
  { kind: 'chip', face: 'yellow' },
  { kind: 'chip', face: 'black' },
  { kind: 'chip', face: 'green' },
];

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export const FLOATER_MARGIN = 80;

/** Fixed pseudo-random drifters so the menu looks the same every load. */
export function makeFloaters(count: number, seed = 7): FloaterSpec[] {
  const next = lcg(seed);
  const out: FloaterSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const pick = FLOATER_FACES[index % FLOATER_FACES.length];
    if (!pick) {
      continue;
    }
    const isChip = pick.kind === 'chip';
    out.push({
      kind: pick.kind,
      face: pick.face,
      x: next() * LOGICAL_WIDTH,
      y: next() * LOGICAL_HEIGHT,
      vx: 6 + next() * 10,
      vy: 10 + next() * 14,
      spin: (next() - 0.5) * 0.5,
      phase: next() * Math.PI * 2,
      scale: isChip ? 3 : 2,
    });
  }
  return out;
}

function wrapAxis(value: number, span: number): number {
  const total = span + FLOATER_MARGIN * 2;
  const shifted = value + FLOATER_MARGIN;
  return (((shifted % total) + total) % total) - FLOATER_MARGIN;
}

/** Position and rotation of a drifter after `seconds`. Loops off-screen. */
export function floaterPose(
  spec: FloaterSpec,
  seconds: number,
): { x: number; y: number; rotation: number } {
  return {
    x: wrapAxis(spec.x + spec.vx * seconds, LOGICAL_WIDTH),
    y: wrapAxis(spec.y + spec.vy * seconds, LOGICAL_HEIGHT),
    rotation: spec.phase + spec.spin * seconds,
  };
}
