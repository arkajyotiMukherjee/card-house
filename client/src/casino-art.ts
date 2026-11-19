import * as ex from 'excalibur';
import {
  DEFAULT_AVATAR,
  NO_AVATAR_HAIR,
  type CasinoAvatar,
} from '../../src/shared/casino-avatar';

export const CASINO_PALETTE = {
  dark: '#0b281e',
  wood: '#643521',
  highlight: '#b47542',
  gold: '#e8c479',
  cream: '#fff2c4',
  green: '#235f45',
  red: '#672f37',
};
const skin = ['#edc3a3', '#cf9170', '#a86c50', '#76503d'];
const hair = ['#2b262c', '#643828', '#daa55b', '#bbbdc6', '#785075'];
const clothes = ['#38817a', '#a54753', '#b38843', '#555c91', '#bb677b'];
const pants = [
  ['#211b23', '#211b23'],
  ['#626c79', '#3c444e'],
  ['#404f81', '#293554'],
  ['#846046', '#533b2f'],
  ['#717246', '#474a2c'],
  ['#884356', '#542939'],
];
export type Direction = 'up' | 'down' | 'left' | 'right';

/** A layered 16×24 sprite. Shapes use integer pixel clusters and a shared silhouette. */
export function avatarSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  look: CasinoAvatar = DEFAULT_AVATAR,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(scale, scale);
  if (direction === 'left') {
    g.translate(16, 0);
    g.scale(-1, 1);
  }
  const side = direction === 'left' || direction === 'right';
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const walking = frame > 0 && !seated;
  const stride = walking ? [0, -1, 0, 1][frame % 4] : 0;
  const bob = walking && stride === 0 ? 1 : 0;
  const facingBack = direction === 'up';
  const outline = '#211b23';
  fill('#221a24a0', 2, 22, 12, 2);
  fill(outline, 3, 12 + bob, 10, 8);
  fill(clothes[look.color], look.body ? 5 : 4, 13 + bob, look.body ? 6 : 8, 6);
  fill('#ffffff38', 5, 13 + bob, 5, 1);
  const swing = facingBack ? -stride : stride;
  fill(skin[look.skin], 3 + (side ? swing : 0), 17 + bob + swing, 2, 2);
  fill(skin[look.skin], 11 - (side ? swing : 0), 17 + bob - swing, 2, 2);
  if (!facingBack && look.outfit === 0) fill('#fff0c5', 7, 13 + bob, 2, 4);
  if (!facingBack && look.outfit === 1) fill('#352a32', 7, 14 + bob, 2, 5);
  const [trouser, shoe] = pants[look.pantsColor];
  const leg = (x: number, y: number) => {
    fill(trouser, x, y, 3, 2);
    fill(shoe, x, y + 2, 3, 1);
  };
  leg(side ? 5 - stride * 2 : 4, seated ? 19 : 20 + (side ? 0 : swing));
  leg(side ? 8 + stride * 2 : 9, seated ? 19 : 21 - (side ? 0 : swing));
  const bald = look.hair === NO_AVATAR_HAIR;
  const headColor = bald ? skin[look.skin] : hair[look.hairColor];
  fill(outline, 3, (bald ? 4 : 3) + bob, 10, bald ? 9 : 10);
  fill(headColor, 4, (bald ? 4 : 2) + bob, 8, 7);
  if (!bald) fill('#ffffff28', 5, 3 + bob, 6, 1);
  if (direction === 'up') fill(headColor, 4, 5 + bob, 8, 7);
  else {
    fill(skin[look.skin], side ? 7 : 4, 6 + bob, side ? 6 : 8, 6);
    fill(outline, side ? 11 : 6, 8 + bob, 1, 2);
    if (!side) fill(outline, 10, 8 + bob, 1, 2);
    fill('#f9b58a', side ? 11 : 7, 10 + bob, 2, 1);
  }
  if (look.hair === 1) fill(hair[look.hairColor], 4, 5 + bob, 3, 3);
  if (look.hair === 2) {
    fill(hair[look.hairColor], 2, 5 + bob, 3, 10);
    if (!side) fill(hair[look.hairColor], 12, 5 + bob, 2, 9);
  }
  if (look.hair === 3) fill(hair[look.hairColor], 5, bob, 6, 3);
  g.restore();
}

export function woodPanel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.fillStyle = '#2d1c17';
  g.fillRect(x + 4, y + 5, w, h);
  g.fillStyle = '#5d3322';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#b17948';
  g.fillRect(x, y, w, 3);
  for (let next = x + 6; next < x + w - 8; next += 16) {
    g.fillStyle = '#3f251b';
    g.fillRect(next, y + 8, Math.min(12, x + w - next), h - 12);
    g.fillStyle = '#76482c';
    g.fillRect(next + 2, y + 10, Math.min(8, x + w - next - 2), h - 16);
  }
}

export function casinoChair(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  g.fillStyle = '#2a1b1b';
  g.fillRect(x - 11, y - 10, 22, 19);
  g.fillStyle = '#885036';
  g.fillRect(x - 9, y - 8, 18, 15);
  g.fillStyle = '#ad5961';
  g.fillRect(x - 7, y - 7, 14, 4);
  g.fillStyle = '#703542';
  g.fillRect(x - 7, y - 2, 14, 7);
}

export function suitStatue(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  diamond: boolean,
): void {
  woodPanel(g, x - 9, y + 1, 18, 14);
  g.fillStyle = '#d69e51';
  for (let row = -14; row < 1; row += 2) {
    const w = diamond
      ? 8 - Math.abs(row + 7)
      : Math.max(2, 8 - Math.abs(row + 4));
    g.fillRect(x - w, y + row, w * 2, 2);
  }
  g.fillStyle = '#f2ca7d';
  g.fillRect(x - 2, y - 5, 4, 6);
}

export function floorLamp(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  glow: number,
): void {
  g.fillStyle = `rgba(253,190,88,${glow})`;
  g.fillRect(x - 11, y - 15, 22, 20);
  g.fillStyle = '#966a38';
  g.fillRect(x - 1, y - 8, 3, 15);
  g.fillRect(x - 5, y + 5, 11, 3);
  g.fillStyle = '#d4a858';
  g.fillRect(x - 6, y - 12, 12, 8);
  g.fillStyle = '#ffe4a4';
  g.fillRect(x - 4, y - 10, 8, 5);
}

export function floorPlant(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  g.fillStyle = '#181e1f90';
  g.fillRect(x - 12, y - 8, 27, 11);
  g.fillStyle = '#623923';
  g.fillRect(x - 8, y - 15, 17, 15);
  g.fillStyle = '#ab7646';
  g.fillRect(x - 10, y - 17, 21, 5);
  g.fillStyle = '#c99351';
  g.fillRect(x - 5, y - 11, 3, 9);
  for (const [dx, dy, w, h] of [
    [-2, -36, 5, 24],
    [-16, -29, 12, 6],
    [-14, -26, 9, 8],
    [6, -31, 12, 7],
    [4, -26, 9, 8],
    [-15, -20, 8, 4],
    [8, -21, 8, 4],
  ]) {
    g.fillStyle = '#173e2b';
    g.fillRect(x + dx, y + dy, w + 2, h + 1);
    g.fillStyle = '#479550';
    g.fillRect(x + dx + 1, y + dy + 1, w, h - 1);
    g.fillStyle = '#85af56';
    g.fillRect(x + dx + 1, y + dy + 1, Math.max(2, w / 2), 2);
  }
}

export function casinoRug(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  g.fillStyle = '#1b2620';
  g.fillRect(x + 2, y + 4, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#b98555';
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.strokeStyle = '#b985556d';
  g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  g.fillStyle = '#e8ac6b30';
  for (let row = 0; 12 + row * 12 < h - 10; row += 1) {
    for (let col = 12 + (row % 2) * 6; col < w - 10; col += 12) {
      g.fillRect(x + col, y + 12 + row * 12, 2, 4);
      g.fillRect(x + col - 1, y + 13 + row * 12, 4, 2);
    }
  }
}

/** A face-size version of the floor avatar for table labels. */
export function casinoPortrait(
  avatar: CasinoAvatar,
  speaking: boolean,
): ex.Canvas {
  const portrait = new ex.Canvas({
    width: 18,
    height: 19,
    draw: (g) => {
      g.fillStyle = speaking ? '#2e6b4a' : '#15392c';
      g.fillRect(0, 0, 18, 19);
      avatarSprite(g, 1, 2, 1, avatar);
      if (speaking) {
        g.strokeStyle = '#bcf48a';
        g.strokeRect(0.5, 0.5, 17, 18);
      }
    },
  });
  portrait.origin = ex.vec(0, 0);
  return portrait;
}

/** Timber and brass from the casino floor, outside the playing surface. */
export function casinoTableBackdrop(): ex.Canvas {
  const surface = new ex.Canvas({
    width: 1440,
    height: 540,
    draw: (g) => {
      woodPanel(g, 0, 0, 1440, 14);
      g.fillStyle = '#9f673d';
      g.fillRect(0, 14, 1440, 2);
      for (const x of [168, 300, 1140, 1272]) floorLamp(g, x, 8, 0.18);
      g.fillStyle = '#23282190';
      g.fillRect(0, 523, 1440, 17);
      g.fillStyle = '#9f673d';
      g.fillRect(0, 537, 1440, 3);
    },
  });
  surface.origin = ex.vec(0, 0);
  return surface;
}
