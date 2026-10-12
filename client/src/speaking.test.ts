import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_RECTS,
  BUBBLE_SIZE,
  GLOW_PAD,
  glowRects,
  lobbySpeakers,
  SPEAKING_FADE_MS,
  SpeakingFader,
  tableSpeakers,
  type SpeakingRow,
} from './speaking';

const rows: SpeakingRow[] = [
  { lobbyId: 'l1', tableId: '', lobbyMemberId: 'm_ada', isSpeaking: true },
  { lobbyId: 'l1', tableId: '', lobbyMemberId: 'm_bea', isSpeaking: false },
  { lobbyId: 'l2', tableId: '', lobbyMemberId: 'm_cara', isSpeaking: true },
  { lobbyId: 'l1', tableId: 't1', lobbyMemberId: 'm_dee', isSpeaking: true },
  { lobbyId: 'l1', tableId: 't1', lobbyMemberId: 'm_eve', isSpeaking: false },
  { lobbyId: 'l1', tableId: 't2', lobbyMemberId: 'm_fay', isSpeaking: true },
];

describe('speaking rows', () => {
  it('lobby voice is the rows with an empty tableId in that lobby', () => {
    expect([...lobbySpeakers(rows, 'l1')]).toEqual(['m_ada']);
    expect([...lobbySpeakers(rows, 'l2')]).toEqual(['m_cara']);
  });

  it('table voice is the rows for that table only', () => {
    expect([...tableSpeakers(rows, 't1')]).toEqual(['m_dee']);
    expect([...tableSpeakers(rows, 't2')]).toEqual(['m_fay']);
  });

  it('shows nothing when the bot wrote no rows', () => {
    expect(lobbySpeakers([], 'l1').size).toBe(0);
    expect(tableSpeakers([], 't1').size).toBe(0);
    expect(tableSpeakers(rows, '').size).toBe(0);
  });

  it('a web-only member with no row is not speaking', () => {
    expect(lobbySpeakers(rows, 'l1').has('m_web')).toBe(false);
    expect(tableSpeakers(rows, 't1').has('m_web')).toBe(false);
  });

  it('a lobby speaker is not a table speaker, and the reverse', () => {
    expect(tableSpeakers(rows, 't1').has('m_ada')).toBe(false);
    expect(lobbySpeakers(rows, 'l1').has('m_dee')).toBe(false);
  });
});

describe('speaking fade', () => {
  it('rises to 1 and falls to 0 in the fade time', () => {
    const fader = new SpeakingFader();
    expect(fader.level('a')).toBe(0);
    expect(fader.step('a', true, SPEAKING_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(fader.step('a', true, SPEAKING_FADE_MS)).toBe(1);
    expect(fader.step('a', false, SPEAKING_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(fader.step('a', false, SPEAKING_FADE_MS)).toBe(0);
  });

  it('keeps one level per key', () => {
    const fader = new SpeakingFader();
    fader.step('a', true, SPEAKING_FADE_MS);
    expect(fader.level('a')).toBe(1);
    expect(fader.level('b')).toBe(0);
  });

  it('a short fade stays under half a second', () => {
    expect(SPEAKING_FADE_MS).toBeLessThanOrEqual(500);
  });
});

describe('speaking pixels', () => {
  it('bubble has three 2x2 dots inside its grid', () => {
    const dots = BUBBLE_RECTS.filter((rect) => rect.w === 2 && rect.h === 2);
    expect(dots).toHaveLength(3);
    for (const rect of BUBBLE_RECTS) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(BUBBLE_SIZE.w);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BUBBLE_SIZE.h);
    }
  });

  it('glow stays inside a canvas GLOW_PAD larger than the plate', () => {
    const w = 64;
    const h = 20;
    const rects = glowRects(w, h);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(w + GLOW_PAD * 2);
      expect(rect.y + rect.h).toBeLessThanOrEqual(h + GLOW_PAD * 2);
      const overPlate =
        rect.x < GLOW_PAD + w &&
        rect.x + rect.w > GLOW_PAD &&
        rect.y < GLOW_PAD + h &&
        rect.y + rect.h > GLOW_PAD;
      expect(overPlate).toBe(false);
    }
  });
});

describe('client voice boundary', () => {
  const root = new URL('.', import.meta.url).pathname;
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .filter((name) => !name.startsWith('module_bindings'));

  it('does not call Discord or touch audio', () => {
    const banned = [
      /discord\.com/i,
      /discordapp/i,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /getUserMedia/,
      /RTCPeerConnection/,
      /AudioContext/,
      /MediaRecorder/,
      /new Audio\b/,
      /SpeechRecognition/,
    ];
    // Default-name lookup asks the local bot. Speaking still does not fetch.
    const fetchAllowed = new Set(['discord-join.ts']);
    expect(files.length).toBeGreaterThan(10);
    for (const name of files) {
      const source = readFileSync(join(root, name), 'utf8');
      for (const pattern of banned) {
        if (fetchAllowed.has(name) && pattern.source === '\\bfetch\\s*\\(') {
          continue;
        }
        expect(`${name} ${pattern}: ${pattern.test(source)}`).toBe(
          `${name} ${pattern}: false`,
        );
      }
    }
    const lookup = readFileSync(join(root, 'discord-join.ts'), 'utf8');
    expect(lookup).toContain('/default-player-name');
    expect(lookup).not.toMatch(/discord\.com/i);
  });
});
