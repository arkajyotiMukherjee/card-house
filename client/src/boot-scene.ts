import * as ex from 'excalibur';
import {
  ACE_HEART,
  CARD_BACK,
  CARD_SIZE,
  CHIP_HEIGHT,
  CHIP_WIDTH,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NUMBER_HEART,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
  chipRect,
} from './sheets';

const FELT = ex.Color.fromHex('#145c38');
const STATUS = ex.Color.fromHex('#f4e4b3');

const nearest = { filtering: ex.ImageFiltering.Pixel };

export const heartsImage = new ex.ImageSource(
  '/assets/cards-hearts.png',
  nearest,
);
export const cardBackImage = new ex.ImageSource(
  '/assets/card-back-01.png',
  nearest,
);
export const chipsImage = new ex.ImageSource(
  '/assets/chips-no-outline.png',
  nearest,
);
export const tableImage = new ex.ImageSource(
  '/assets/table-green.png',
  nearest,
);

export const demoImages = [heartsImage, cardBackImage, chipsImage, tableImage];

function pixelSprite(
  image: ex.ImageSource,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
): ex.Sprite {
  return image.toSprite({
    sourceView: rect,
    scale: ex.vec(scale, scale),
  });
}

export class BootScene extends ex.Scene {
  private status = new ex.Text({
    text: 'SpacetimeDB: starting',
    font: new ex.Font({
      family: 'sans-serif',
      size: 16,
      color: STATUS,
    }),
  });

  onInitialize(engine: ex.Engine): void {
    engine.backgroundColor = FELT;

    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 16),
      anchor: ex.vec(0.5, 0.5),
      width: TABLE_WIDTH,
      height: TABLE_HEIGHT,
    });
    table.graphics.use(
      pixelSprite(
        tableImage,
        {
          x: 0,
          y: 0,
          width: TABLE_WIDTH,
          height: TABLE_HEIGHT,
        },
        TABLE_SCALE,
      ),
    );
    engine.add(table);

    const cardScale = 2;
    const cardY = LOGICAL_HEIGHT / 2 + 8;
    const cards: Array<{
      image: ex.ImageSource;
      col: number;
      row: number;
      x: number;
    }> = [
      { image: heartsImage, col: ACE_HEART.col, row: ACE_HEART.row, x: 360 },
      {
        image: heartsImage,
        col: NUMBER_HEART.col,
        row: NUMBER_HEART.row,
        x: 500,
      },
      { image: cardBackImage, col: CARD_BACK.col, row: CARD_BACK.row, x: 640 },
    ];
    for (const card of cards) {
      const actor = new ex.Actor({
        pos: ex.vec(card.x, cardY),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_SIZE,
        height: CARD_SIZE,
      });
      actor.graphics.use(
        pixelSprite(
          card.image,
          {
            x: card.col * CARD_SIZE,
            y: card.row * CARD_SIZE,
            width: CARD_SIZE,
            height: CARD_SIZE,
          },
          cardScale,
        ),
      );
      engine.add(actor);
    }

    const chip = chipRect();
    const chipActor = new ex.Actor({
      pos: ex.vec(760, cardY + 8),
      anchor: ex.vec(0.5, 0.5),
      width: CHIP_WIDTH,
      height: CHIP_HEIGHT,
    });
    chipActor.graphics.use(pixelSprite(chipsImage, chip, 2));
    engine.add(chipActor);

    const label = new ex.Actor({
      pos: ex.vec(16, 14),
      anchor: ex.vec(0, 0),
    });
    label.graphics.use(this.status);
    engine.add(label);
  }

  setStatus(text: string): void {
    this.status.text = text;
  }
}
