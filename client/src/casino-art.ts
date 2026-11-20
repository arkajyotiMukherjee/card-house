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
const skin = ['#edc3a3', '#bf8462', '#a86c50', '#76503d'];
const skinShade = ['#bf8462', '#925c4c', '#76503d', '#573b32'];
const hair = ['#302725', '#634238', '#c39658', '#b6b8b3', '#785075'];
const clothes = ['#3e7368', '#8d4854', '#b38843', '#555c91', '#bb677b'];
const pants = [
  ['#211b23', '#211b23'],
  ['#626c79', '#3c444e'],
  ['#404f81', '#293554'],
  ['#846046', '#533b2f'],
  ['#717246', '#474a2c'],
  ['#884356', '#542939'],
];
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Walnut Club silhouettes on the shared 16×24 grid, with recolorable layers. */
export function avatarSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  look: CasinoAvatar = DEFAULT_AVATAR,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
  sitProgress = 1,
): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(scale, scale);
  if (direction === 'left') {
    g.translate(16, 0);
    g.scale(-1, 1);
  }
  const side = direction === 'left' || direction === 'right';
  const facingBack = direction === 'up';
  const outline = '#172621';
  const shirt = clothes[look.color];
  const complexion = skin[look.skin];
  const shade = skinShade[look.skin];
  const [trouser, shoe] = pants[look.pantsColor];
  const fill = (
    color: string,
    px: number,
    py: number,
    w: number,
    h: number,
  ) => {
    g.fillStyle = color;
    g.fillRect(px, py, w, h);
  };
  const stride = frame > 0 && !seated ? [0, -1, 0, 1][frame % 4] : 0;
  const bob = frame > 0 && !seated && stride === 0 ? 1 : 0;
  const lowering = seated ? Math.round(3 * sitProgress) : 0;
  const drop = bob + lowering;
  const swing = facingBack ? -stride : stride;

  const shoulder = 13 + drop;
  const torsoX = side ? 5 : look.body ? 5 : 4;
  const torsoW = side ? (look.body ? 4 : 5) : look.body ? 6 : 8;
  fill(outline, torsoX - 1, shoulder, torsoW + 2, 7);
  fill(shirt, torsoX, shoulder + 1, torsoW, 5);
  if (!facingBack && look.outfit !== 2) {
    fill(look.outfit === 0 ? '#ecd29a' : outline, 7, shoulder + 1, 2, 4);
  }
  if (!side) fill(complexion, 3, shoulder + 4 + swing, 2, 2);
  fill(complexion, side ? 9 - swing : 11, shoulder + 4 - swing, 2, 2);

  if (lowering >= 2) {
    if (side) {
      fill(outline, 5, 20, 9, 3);
      fill(trouser, 6, 20, 7, 2);
      fill(shoe, 11, 22, 3, 1);
    } else {
      const knees = facingBack ? [5, 9] : [3, 10];
      for (const knee of knees) {
        fill(outline, knee, 20, 3, 4);
        fill(trouser, knee, 20, 3, 2);
        fill(shoe, knee, 22, 3, 1);
      }
    }
  } else {
    const leg = (px: number, foot: number) => {
      fill(trouser, px, 19 + bob, 3, foot - 19 - bob);
      fill(shoe, px, foot, 3, 1);
    };
    leg(side ? 5 - stride * 2 : 4, 22 + (side ? 0 : swing));
    leg(side ? 7 + stride * 2 : 9, 22 - (side ? 0 : swing));
  }

  const bald = look.hair === NO_AVATAR_HAIR;
  const headColor = bald ? complexion : hair[look.hairColor];
  const headX = side ? 3 : 4;
  fill(outline, headX + 1, 3 + drop, 6, 1);
  fill(outline, headX, 4 + drop, 8, 8);
  fill(outline, headX + 1, 12 + drop, 6, 1);
  fill(headColor, headX + 1, 4 + drop, 6, 7);
  if (!facingBack) {
    fill(complexion, side ? 7 : 5, 7 + drop, side ? 4 : 6, 4);
    fill(shade, side ? 8 : 6, 11 + drop, side ? 3 : 4, 1);
    fill(outline, side ? 10 : 6, 8 + drop, 1, 1);
    if (!side) fill(outline, 9, 8 + drop, 1, 1);
  }
  if (look.hair === 1) fill(headColor, headX + 1, 6 + drop, 3, 2);
  if (look.hair === 2) {
    fill(headColor, headX, 6 + drop, 2, 7);
    if (!side) fill(headColor, 11, 6 + drop, 2, 7);
  }
  if (look.hair === 3) {
    fill(outline, headX + 2, 1 + drop, 4, 3);
    fill(headColor, headX + 2, 2 + drop, 3, 2);
  }
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
