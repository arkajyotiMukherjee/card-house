import * as ex from 'excalibur';

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
    width * 2,
    height * 2,
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
  facesUp: boolean,
): void {
  sprite(g, facesUp ? 'chairBack' : 'chairFront', x - 16, y - 12);
}

export const JUKEBOX_BASE_Y = 300;

export function drawWalnutJukebox(g: CanvasRenderingContext2D): void {
  sprite(g, 'jukebox', 42, JUKEBOX_BASE_Y - 60);
}
