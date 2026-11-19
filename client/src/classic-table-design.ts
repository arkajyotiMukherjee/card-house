import * as ex from 'excalibur';
import type { DriverSeat } from './game-driver';
import { retroFont, RETRO_DISPLAY_MIN_SIZE, uiText } from './ui-text';

const CLASSIC_GAMES = new Set([
  'poker',
  'bluff',
  'president',
  'go_fish',
  'crazy_eights',
  'rummy',
  'blackjack',
  'spades',
  'hearts',
]);

/** Every catalog card game now uses the approved table family; stubs stay separate. */
export function isClassicGame(gameType: string): boolean {
  return CLASSIC_GAMES.has(gameType);
}

/** Shared vocabulary for the approved classic-table family. See docs/design-system.md. */
export const CLASSIC = {
  cream: '#fff2c4',
  gold: '#e8cc82',
  dim: '#d2c795',
  secondary: '#c4d3c2',
  quiet: '#a7bfae',
  accent: '#f3d98b',
  softBorder: '#66866e',
  felt: '#0c3825',
  active: '#24583b',
  danger: '#712b24',
  nameSize: 17,
  bodySize: 20,
  captionSize: 16,
  personal: { x: 8, y: 436, w: 944, h: 96 },
  board: { x: 264, y: 302, w: 432, h: 96 },
  pot: { x: 244, y: 226, w: 176, h: 72 },
  potChips: { x: 432, y: 212, w: 280, h: 100 },
  panel: { x: 568, y: 440, w: 368, h: 80 },
  feltBox: { x: 144, y: 80, w: 672, h: 352 },
} as const;

export const classicFont = retroFont;

export function classicText(
  text: string,
  size = 18,
  color: string | ex.Color = CLASSIC.cream,
): ex.Text {
  const ink = typeof color === 'string' ? ex.Color.fromHex(color) : color;
  if (size < RETRO_DISPLAY_MIN_SIZE) return uiText(text, size, ink);
  const graphic = new ex.Text({
    text,
    color: ink,
    font: classicFont.toFont({
      family: '"Press Start 2P"',
      size,
      color: ink,
      quality: 2,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

export function classicCaption(
  text: string,
  w: number,
  h: number,
  size: number,
): { x: number; y: number } {
  const graphic = classicText(text, size);
  return {
    x: Math.round((w - graphic.width) / 2),
    y: Math.round((h - graphic.height) / 2),
  };
}

/** A quiet chamfered badge; never use a large containing panel for each opponent. */
export function classicFrame(
  w: number,
  h: number,
  fill: string = CLASSIC.felt,
  hot = false,
  border: string | null = CLASSIC.gold,
): ex.Canvas {
  return new ex.Canvas({
    width: w,
    height: h,
    draw: (g) => {
      if (border) {
        g.fillStyle = fill;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = hot ? CLASSIC.cream : border;
        g.lineWidth = border === CLASSIC.gold ? 2 : 1;
        g.strokeRect(1, 1, w - 2, h - 2);
        return;
      }
      const cut = border ? 0 : Math.min(6, h / 4);
      g.beginPath();
      g.moveTo(cut, 1);
      g.lineTo(w - cut, 1);
      g.lineTo(w - 1, cut);
      g.lineTo(w - 1, h - cut);
      g.lineTo(w - cut, h - 1);
      g.lineTo(cut, h - 1);
      g.lineTo(1, h - cut);
      g.lineTo(1, cut);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      if (border) {
        g.strokeStyle = hot ? CLASSIC.cream : border;
        g.lineWidth = border === CLASSIC.gold ? 2 : 1;
        g.stroke();
      }
    },
  });
}

export interface ClassicSeat {
  seat: DriverSeat;
  x: number;
  y: number;
  w: number;
  h: number;
  edge?: 'left' | 'right';
}

/** Name/stack/action stay attached to the same seat. The card fan lives above its badge. */
export function classicSeats(seats: readonly DriverSeat[]): ClassicSeat[] {
  const opponents = seats.filter((seat) => !seat.self);
  const top = (x: number): [number, number, 'left' | 'right' | undefined] => [
    x,
    144,
    undefined,
  ];
  const side = (
    right: boolean,
    y: number,
  ): [number, number, 'left' | 'right'] => [
    right ? 868 : 92,
    y,
    right ? 'right' : 'left',
  ];
  const layouts = [
    [],
    [top(480)],
    [top(350), top(610)],
    [top(480), side(false, 266), side(true, 266)],
    [top(360), top(600), side(false, 266), side(true, 266)],
    [top(300), top(480), top(660), side(false, 266), side(true, 266)],
    [
      top(360),
      top(600),
      side(false, 188),
      side(false, 350),
      side(true, 188),
      side(true, 350),
    ],
    [
      top(300),
      top(480),
      top(660),
      side(false, 188),
      side(false, 350),
      side(true, 188),
      side(true, 350),
    ],
    [
      top(258),
      top(406),
      top(554),
      top(702),
      side(false, 188),
      side(false, 350),
      side(true, 188),
      side(true, 350),
    ],
  ];
  const slots = layouts[opponents.length] ?? layouts[8];
  return opponents.map((seat, index) => {
    const [center, y, edge] = slots[index];
    const w = opponents.length === 8 && !edge ? 140 : 168;
    return { seat, x: center - w / 2, y, w, h: 76, edge };
  });
}

export function classicHeader(
  mobile: boolean,
): Record<'leave' | 'chat' | 'help', Pick<ClassicSeat, 'x' | 'y' | 'w' | 'h'>> {
  return {
    leave: { x: mobile ? 64 : 16, y: 16, w: 144, h: 40 },
    chat: { x: mobile ? 220 : 172, y: 16, w: 80, h: 40 },
    help: { x: 908, y: 16, w: 44, h: 40 },
  };
}
