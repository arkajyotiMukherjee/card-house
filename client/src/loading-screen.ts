import * as ex from 'excalibur';
import { CASINO_PALETTE } from './casino-art';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

const GUTTER = 320;
const MID = LOGICAL_WIDTH / 2;

function drawLoading(
  g: CanvasRenderingContext2D,
  message: string,
  working: boolean,
): void {
  const { dark, gold, cream } = CASINO_PALETTE;
  g.fillStyle = dark;
  g.fillRect(-GUTTER, 0, LOGICAL_WIDTH + GUTTER * 2, LOGICAL_HEIGHT);
  g.fillStyle = '#17392b';
  g.fillRect(-GUTTER, 346, LOGICAL_WIDTH + GUTTER * 2, 1);
  g.fillRect(-GUTTER, 194, LOGICAL_WIDTH + GUTTER * 2, 1);
  g.fillRect(MID - 50, 142, 100, 106);

  g.fillStyle = '#874a33';
  g.fillRect(MID - 40, 152, 80, 86);
  g.fillStyle = gold;
  g.fillRect(MID - 36, 156, 72, 78);
  g.fillStyle = '#215943';
  g.fillRect(MID - 33, 159, 66, 72);
  const spade = [
    '0001000',
    '0011100',
    '0111110',
    '1111111',
    '1111111',
    '0111110',
    '0001000',
    '0011100',
  ];
  g.fillStyle = cream;
  spade.forEach((line, y) => {
    for (let x = 0; x < line.length; x += 1)
      if (line[x] === '1') g.fillRect(MID - 14 + x * 4, 179 + y * 4, 4, 4);
  });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '28px "Press Start 2P", monospace';
  g.fillStyle = gold;
  g.fillText('CARD HOUSE', MID, 281);
  g.font = '19px "Chakra Petch", sans-serif';
  g.fillStyle = cream;
  g.fillText(message, MID, 316, 800);
  if (working) {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const step = reduced ? 1 : Math.floor(performance.now() / 150) % 3;
    for (let i = 0; i < 3; i += 1) {
      g.fillStyle = i === step ? gold : '#49644e';
      g.fillRect(MID - 21 + i * 17, 373, 8, 8);
    }
  }
}

export class CardHouseLoader extends ex.DefaultLoader {
  override onDraw(g: CanvasRenderingContext2D): void {
    g.save();
    g.scale(g.canvas.width / LOGICAL_WIDTH, g.canvas.height / LOGICAL_HEIGHT);
    drawLoading(g, 'Loading Card House', true);
    g.restore();
  }
}

export class LoadingScreen {
  private readonly actor: ex.Actor;
  private message = '';
  private working = true;

  constructor(scene: ex.Scene) {
    this.actor = new ex.Actor({
      name: 'cardhouse-loading',
      x: -GUTTER,
      y: 0,
      width: LOGICAL_WIDTH + GUTTER * 2,
      height: LOGICAL_HEIGHT,
      anchor: ex.vec(0, 0),
      z: 200,
    });
    const graphic = new ex.Canvas({
      width: this.actor.width,
      height: this.actor.height,
      cache: false,
      draw: (g) => {
        g.save();
        g.translate(GUTTER, 0);
        drawLoading(g, this.message, this.working);
        g.restore();
      },
    });
    graphic.origin = ex.vec(0, 0);
    this.actor.graphics.use(graphic);
    this.actor.on('pointerdown', (event) => event.cancel());
    this.actor.on('pointerup', (event) => event.cancel());
    scene.add(this.actor);
    this.hide();
  }

  show(message: string, working = true): void {
    this.message = message;
    this.working = working;
    this.actor.graphics.isVisible = true;
    this.actor.pointer.useColliderShape = true;
  }

  hide(): void {
    this.actor.graphics.isVisible = false;
    this.actor.pointer.useColliderShape = false;
    this.actor.pointer.useGraphicsBounds = false;
  }
}
