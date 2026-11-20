import { CASINO_RECORDS } from './game-music';

const SLIDE_MS = 240;

export class CasinoJukebox {
  index = 0;
  playing = true;
  private transition?: { from: number; direction: -1 | 1; started: number };

  step(direction: -1 | 1, now: number): void {
    this.transition = { from: this.index, direction, started: now };
    this.index =
      (this.index + direction + CASINO_RECORDS.length) % CASINO_RECORDS.length;
  }

  slides(
    now: number,
    reducedMotion: boolean,
  ): { index: number; offset: number }[] {
    const transition = this.transition;
    if (!transition || reducedMotion || now >= transition.started + SLIDE_MS)
      return [{ index: this.index, offset: 0 }];
    const time = Math.max(0, (now - transition.started) / SLIDE_MS);
    const eased = time * time * (3 - 2 * time);
    return [
      { index: transition.from, offset: -transition.direction * eased },
      { index: this.index, offset: transition.direction * (1 - eased) },
    ];
  }
}

const VINYL = [
  '....###....',
  '..##===##..',
  '.#==#####=.',
  '.#=##o###=#',
  '#=##ooo##=#',
  '#=##o.o##=#',
  '#=##ooo##=#',
  '#=###o##=#.',
  '.=#####==#.',
  '..##===##..',
  '....###....',
];

export function drawVinylRecord(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  labelColor: string,
): void {
  const colors = { '#': '#151c1b', '=': '#52625a', o: labelColor };
  for (const [row, line] of VINYL.entries())
    for (const [column, pixel] of Array.from(line).entries()) {
      const color = colors[pixel as keyof typeof colors];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x + column * 4, y + row * 4, 4, 4);
    }
}
