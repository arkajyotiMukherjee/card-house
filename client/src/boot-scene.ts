import * as ex from 'excalibur';
import {
  getCardAppearance,
  type CardBackStyle,
  type CardFrontStyle,
} from './card-appearance';
import { CardAtlas, type CardFace } from './card-atlas';
import { ChipAtlas } from './chip-atlas';
import {
  CARD_SIZE,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
} from './sheets';
import { TABLE_STYLES, TableAtlas, type TableStyle } from './table-atlas';

const FELT = ex.Color.fromHex('#145c38');
const STATUS = ex.Color.fromHex('#f4e4b3');

const nearest = { filtering: ex.ImageFiltering.Pixel };

const CARD_SCALE = 2;
const CHIP_SCALE = 4;
/** Face top to stack top on chips-no-outline.png, in source pixels. */
const CHIP_BODY_OFFSET = 21;
/** How far each extra chip sits above the one below it. */
const CHIP_STACK_STEP = 6;
const CHIP_STACK_COUNT = 3;

export const heartsImage = new ex.ImageSource(
  '/assets/cards-hearts.png',
  nearest,
);
export const diamondsImage = new ex.ImageSource(
  '/assets/cards-diamonds.png',
  nearest,
);
export const clubsImage = new ex.ImageSource(
  '/assets/cards-clubs.png',
  nearest,
);
export const spadesImage = new ex.ImageSource(
  '/assets/cards-spades.png',
  nearest,
);
export const cardBackImage = new ex.ImageSource(
  '/assets/card-back-01.png',
  nearest,
);
export const cardBackBoldImage = new ex.ImageSource(
  '/assets/card-back-02.png',
  nearest,
);
export const heartsDarkImage = new ex.ImageSource(
  '/assets/cards-hearts-dark.png',
  nearest,
);
export const diamondsDarkImage = new ex.ImageSource(
  '/assets/cards-diamonds-dark.png',
  nearest,
);
export const clubsDarkImage = new ex.ImageSource(
  '/assets/cards-clubs-dark.png',
  nearest,
);
export const spadesDarkImage = new ex.ImageSource(
  '/assets/cards-spades-dark.png',
  nearest,
);
export const chipsImage = new ex.ImageSource(
  '/assets/chips-no-outline.png',
  nearest,
);

const tables = new TableAtlas();
export const cardAtlas = new CardAtlas(heartsImage, cardBackImage, {
  diamonds: diamondsImage,
  clubs: clubsImage,
  spades: spadesImage,
});
export const chipAtlas = new ChipAtlas(chipsImage);

const FRONT_IMAGES: Record<
  CardFrontStyle,
  {
    hearts: ex.ImageSource;
    diamonds: ex.ImageSource;
    clubs: ex.ImageSource;
    spades: ex.ImageSource;
  }
> = {
  light: {
    hearts: heartsImage,
    diamonds: diamondsImage,
    clubs: clubsImage,
    spades: spadesImage,
  },
  dark: {
    hearts: heartsDarkImage,
    diamonds: diamondsDarkImage,
    clubs: clubsDarkImage,
    spades: spadesDarkImage,
  },
};

const BACK_IMAGES: Record<CardBackStyle, ex.ImageSource> = {
  classic: cardBackImage,
  bold: cardBackBoldImage,
};

const personalCardAtlases: Partial<Record<string, CardAtlas>> = {};

/**
 * The local player's own card atlas: the front and back styles stored in
 * `card-appearance.ts`. Built once per style pair and cached, since the
 * underlying `ImageSource`s are already loaded by `demoImages`.
 */
export function personalCardAtlas(): CardAtlas {
  const appearance = getCardAppearance();
  const key = `${appearance.front}:${appearance.back}`;
  const cached = personalCardAtlases[key];
  if (cached) {
    return cached;
  }
  const fronts = FRONT_IMAGES[appearance.front];
  const atlas = new CardAtlas(fronts.hearts, BACK_IMAGES[appearance.back], {
    diamonds: fronts.diamonds,
    clubs: fronts.clubs,
    spades: fronts.spades,
  });
  personalCardAtlases[key] = atlas;
  return atlas;
}

export const greenTable = tables.sprite('green');
greenTable.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);
export const purpleTable = tables.sprite('purple');
purpleTable.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);
export const redTable = tables.sprite('red');
redTable.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);

/** Felt sprite for each color theme, scaled for table rendering. */
export const tableSprites: Record<TableStyle, ex.Sprite> = {
  green: greenTable,
  purple: purpleTable,
  red: redTable,
};

export const pixelFont = new ex.FontSource(
  '/assets/press-start-2p.ttf',
  'Press Start 2P',
);

export const demoImages = [
  heartsImage,
  diamondsImage,
  clubsImage,
  spadesImage,
  cardBackImage,
  cardBackBoldImage,
  heartsDarkImage,
  diamondsDarkImage,
  clubsDarkImage,
  spadesDarkImage,
  chipsImage,
  ...TABLE_STYLES.map((style) => tableSprites[style].image),
  pixelFont,
];

const HEARTS: Array<{ card: CardFace; x: number }> = [
  { card: { rank: 'A', suit: 'hearts' }, x: 390 },
  { card: { rank: '5', suit: 'hearts' }, x: 530 },
];

function scaled(sprite: ex.Sprite, scale: number): ex.Sprite {
  sprite.scale = ex.vec(scale, scale);
  return sprite;
}

export class BootScene extends ex.Scene {
  private status = new ex.Text({
    text: 'SpacetimeDB: starting',
    font: pixelFont.toFont({
      // Excalibur joins the family into a canvas font shorthand. An unquoted
      // name with spaces is rejected, and the context keeps 10px sans-serif.
      family: '"Press Start 2P"',
      size: 16,
      color: STATUS,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  private tableActor: ex.Actor | undefined;

  constructor(private style: TableStyle = 'green') {
    super();
  }

  onInitialize(engine: ex.Engine): void {
    engine.backgroundColor = FELT;

    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 16),
      anchor: ex.vec(0.5, 0.5),
      width: TABLE_WIDTH * TABLE_SCALE,
      height: TABLE_HEIGHT * TABLE_SCALE,
      z: 0,
    });
    table.graphics.use(tableSprites[this.style]);
    this.tableActor = table;
    this.add(table);

    const cardY = LOGICAL_HEIGHT / 2 + 8;
    for (const heart of HEARTS) {
      const actor = new ex.Actor({
        pos: ex.vec(heart.x, cardY),
        anchor: ex.vec(0.5, 0.5),
        width: CARD_SIZE * CARD_SCALE,
        height: CARD_SIZE * CARD_SCALE,
        z: 1,
      });
      actor.graphics.use(scaled(cardAtlas.sprite(heart.card), CARD_SCALE));
      this.add(actor);
    }

    this.addChipStack(680, 188);

    const label = new ex.Actor({
      pos: ex.vec(16, 512),
      anchor: ex.vec(0, 0),
      z: 10,
    });
    label.graphics.use(this.status);
    this.add(label);
  }

  setStatus(text: string): void {
    this.status.text = text;
  }

  /** Repaints the felt for a theme switch without waiting for a reload. */
  setTableStyle(style: TableStyle): void {
    this.style = style;
    this.tableActor?.graphics.use(tableSprites[style]);
  }

  private addChipStack(x: number, top: number): void {
    const step = CHIP_STACK_STEP * CHIP_SCALE;
    const body = CHIP_BODY_OFFSET * CHIP_SCALE;
    for (let index = 0; index < CHIP_STACK_COUNT; index += 1) {
      const faceTop = top + index * step;
      const depth = (CHIP_STACK_COUNT - index) * 2;
      const stack = new ex.Actor({
        pos: ex.vec(x, faceTop + body),
        anchor: ex.vec(0.5, 0),
        z: depth,
      });
      stack.graphics.use(scaled(chipAtlas.stackSprite('red'), CHIP_SCALE));
      this.add(stack);

      const face = new ex.Actor({
        pos: ex.vec(x, faceTop),
        anchor: ex.vec(0.5, 0),
        z: depth + 1,
      });
      face.graphics.use(scaled(chipAtlas.sprite('red'), CHIP_SCALE));
      this.add(face);
    }
  }
}
