import * as ex from 'excalibur';
import { JUKEBOX_CABINET } from '../../src/shared/casino-floor';
import type { Direction } from './casino-art';

const nearest = { filtering: ex.ImageFiltering.Pixel };
const floor = new ex.ImageSource('/assets/walnut-club-floor.png', nearest);
const atlas = new ex.ImageSource('/assets/walnut-club.png', nearest);
export const walnutLobbyImages = [floor, atlas];

const cells = {
  counter: [2, 2, 90, 27],
  loungeTable: [95, 2, 90, 24],
  crest: [189, 2, 24, 20],
  banquette: [2, 32, 47, 14],
  window: [52, 30, 33, 23],
  sconce: [88, 30, 10, 11],
  chairFront: [152, 30, 16, 13],
  chairBack: [172, 30, 16, 13],
  palm: [2, 57, 22, 22],
  monstera: [28, 57, 22, 17],
  orchid: [54, 57, 14, 14],
  lion: [72, 57, 22, 23],
  muse: [98, 57, 22, 23],
  jukebox: [144, 49, 24, 32],
  receptionist: [3, 128, 12, 20],
} as const;

function sprite(
  g: CanvasRenderingContext2D,
  name: keyof typeof cells,
  x: number,
  y: number,
  scale = 2,
): void {
  const [left, top, width, height] = cells[name];
  g.drawImage(
    atlas.data,
    left,
    top,
    width,
    height,
    x,
    y,
    width * scale,
    height * scale,
  );
}

export function drawWalnutLobby(g: CanvasRenderingContext2D): void {
  g.drawImage(floor.data, 0, 0, 768, 384);
  for (const x of [42, 186, 516, 658]) sprite(g, 'window', x, 4);
  for (const x of [118, 140, 606, 630]) sprite(g, 'sconce', x, 12);
  sprite(g, 'crest', 360, 8);
  sprite(g, 'banquette', 566, 70);
  sprite(g, 'monstera', 686, 78);

  sprite(g, 'receptionist', 138, 68);
  sprite(g, 'counter', 60, 94);
  sprite(g, 'orchid', 200, 84);
  sprite(g, 'palm', 34, 111);

  sprite(g, 'loungeTable', 522, 172);
  sprite(g, 'lion', 244, 294);
  sprite(g, 'muse', 480, 294);
}

export function drawWalnutChair(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
): void {
  if (direction === 'left' || direction === 'right') {
    g.save();
    g.translate(x, y);
    g.rotate(direction === 'right' ? -Math.PI / 2 : Math.PI / 2);
    sprite(g, 'chairFront', -16, -13);
    g.restore();
    return;
  }
  sprite(g, direction === 'up' ? 'chairBack' : 'chairFront', x - 16, y - 12);
}

export function drawWalnutRug(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: 'jade' | 'oxblood',
): void {
  const edge = style === 'jade' ? '#547054' : '#a06059';
  g.fillStyle = '#172621';
  g.fillRect(x + 4, y, width - 8, height);
  g.fillRect(x, y + 4, width, height - 8);
  g.fillRect(x + 2, y + 2, width - 4, height - 4);
  g.fillStyle = edge;
  g.fillRect(x + 4, y + 2, width - 8, height - 4);
  g.fillRect(x + 2, y + 4, width - 4, height - 8);
  g.fillStyle = style === 'jade' ? '#385343' : '#713d47';
  g.fillRect(x + 6, y + 4, width - 12, height - 8);
  g.fillRect(x + 4, y + 6, width - 8, height - 12);
}

export function drawWalnutWingDecor(
  g: CanvasRenderingContext2D,
  y: number,
  width: number,
  height: number,
): void {
  drawWalnutRug(g, 24, y + 1, width - 48, 20, 'oxblood');
  sprite(g, 'crest', width - 58, y + 1, 1);

  for (const left of [true, false]) {
    const wallX = left ? 0 : width - 24;
    g.fillStyle = '#372b29';
    g.fillRect(wallX, y, 24, height);
    g.fillStyle = '#483330';
    g.fillRect(wallX + 3, y, 18, height);
    g.fillStyle = '#78503c';
    g.fillRect(wallX + 2, y, 2, height);
    g.fillRect(wallX + 20, y, 2, height);

    const mountX = wallX + 12;
    for (const offset of [62, 190, 318]) {
      g.save();
      g.translate(mountX, y + offset);
      // Turn the sill toward the room on each side wall.
      g.rotate(left ? -Math.PI / 2 : Math.PI / 2);
      sprite(g, 'window', -16, -11, 1);
      g.restore();
    }
    for (const offset of [116, 244, 372]) {
      sprite(g, 'sconce', mountX - 9, y + offset);
    }
  }

  sprite(g, 'lion', 23, y + 84);
  sprite(g, 'muse', width - 67, y + 132);
  sprite(g, 'palm', 23, y + 174);
  sprite(g, 'monstera', width - 67, y + 354);
}

export function drawWalnutJukebox(g: CanvasRenderingContext2D): void {
  sprite(g, 'jukebox', JUKEBOX_CABINET.x, JUKEBOX_CABINET.y);
}
