export const SPEAKING_FADE_MS = 200;

export interface SpeakingRow {
  lobbyId: string;
  tableId: string;
  lobbyMemberId: string;
  isSpeaking: boolean;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
}

const BUBBLE_INK = '#0a2e1c';
const BUBBLE_FILL = '#fff6d0';
const GLOW_COLOR = '#6dff9f';

export const BUBBLE_SIZE = { w: 14, h: 11 } as const;

/**
 * Speech bubble on a 14×11 grid: outline, fill, a two-pixel tail at the
 * lower left, and three 2×2 dots with one pixel between them.
 */
export const BUBBLE_RECTS: readonly PixelRect[] = [
  { x: 0, y: 0, w: 14, h: 10, color: BUBBLE_INK, alpha: 1 },
  { x: 1, y: 1, w: 12, h: 8, color: BUBBLE_FILL, alpha: 1 },
  { x: 3, y: 9, w: 2, h: 1, color: BUBBLE_FILL, alpha: 1 },
  { x: 3, y: 10, w: 2, h: 1, color: BUBBLE_INK, alpha: 1 },
  { x: 3, y: 4, w: 2, h: 2, color: BUBBLE_INK, alpha: 1 },
  { x: 6, y: 4, w: 2, h: 2, color: BUBBLE_INK, alpha: 1 },
  { x: 9, y: 4, w: 2, h: 2, color: BUBBLE_INK, alpha: 1 },
];

export const GLOW_PAD = 8;
const GLOW_RING = 2;
const GLOW_ALPHAS = [0.15, 0.3, 0.55, 0.9] as const;

/**
 * Stepped glow around a `w`×`h` plate. Coordinates are in a canvas that is
 * `GLOW_PAD` larger than the plate on every side, so the plate sits at
 * `(GLOW_PAD, GLOW_PAD)`. The outermost ring is the faintest.
 */
export function glowRects(w: number, h: number): PixelRect[] {
  const rects: PixelRect[] = [];
  for (let ring = 0; ring < GLOW_ALPHAS.length; ring += 1) {
    const alpha = GLOW_ALPHAS[ring] ?? 0;
    const inner = GLOW_PAD - (ring + 1) * GLOW_RING;
    const outer = inner + GLOW_RING;
    const left = GLOW_PAD - outer;
    const top = GLOW_PAD - outer;
    const width = w + outer * 2;
    const height = h + outer * 2;
    rects.push(
      { x: left, y: top, w: width, h: GLOW_RING, color: GLOW_COLOR, alpha },
      {
        x: left,
        y: top + height - GLOW_RING,
        w: width,
        h: GLOW_RING,
        color: GLOW_COLOR,
        alpha,
      },
      {
        x: left,
        y: top + GLOW_RING,
        w: GLOW_RING,
        h: height - GLOW_RING * 2,
        color: GLOW_COLOR,
        alpha,
      },
      {
        x: left + width - GLOW_RING,
        y: top + GLOW_RING,
        w: GLOW_RING,
        h: height - GLOW_RING * 2,
        color: GLOW_COLOR,
        alpha,
      },
    );
  }
  return rects;
}

/**
 * Members the bot reports as speaking in a lobby's voice channel.
 * Lobby voice rows have an empty `tableId`. A member with no row, or with
 * `isSpeaking` false, is absent.
 */
export function lobbySpeakers(
  rows: Iterable<SpeakingRow>,
  lobbyId: string,
): Set<string> {
  const speaking = new Set<string>();
  for (const row of rows) {
    if (row.isSpeaking && row.lobbyId === lobbyId && row.tableId === '') {
      speaking.add(row.lobbyMemberId);
    }
  }
  return speaking;
}

/** Members the bot reports as speaking in one table's voice channel. */
export function tableSpeakers(
  rows: Iterable<SpeakingRow>,
  tableId: string,
): Set<string> {
  const speaking = new Set<string>();
  if (tableId.length === 0) {
    return speaking;
  }
  for (const row of rows) {
    if (row.isSpeaking && row.tableId === tableId) {
      speaking.add(row.lobbyMemberId);
    }
  }
  return speaking;
}

/** Fade level from 0 to 1 per key. Repainting a row keeps its level. */
export class SpeakingFader {
  private readonly levels = new Map<string, number>();

  constructor(private readonly fadeMs: number = SPEAKING_FADE_MS) {}

  level(key: string): number {
    return this.levels.get(key) ?? 0;
  }

  step(key: string, speaking: boolean, elapsedMs: number): number {
    const current = this.level(key);
    const delta = Math.max(0, elapsedMs) / this.fadeMs;
    const next = speaking
      ? Math.min(1, current + delta)
      : Math.max(0, current - delta);
    if (next === 0) {
      this.levels.delete(key);
    } else {
      this.levels.set(key, next);
    }
    return next;
  }
}
