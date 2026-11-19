import * as ex from 'excalibur';
import { tableFont, retroFont } from './ui-text';
import {
  getCardAppearance,
  type CardBackStyle,
  type CardFrontStyle,
} from './card-appearance';
import { CardAtlas } from './card-atlas';
import { ChipAtlas } from './chip-atlas';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
} from './sheets';
import { backgroundHex } from './theme';
import { TABLE_STYLES, TableAtlas, type TableStyle } from './table-atlas';

const STATUS = ex.Color.fromHex('#f4e4b3');

const nearest = { filtering: ex.ImageFiltering.Pixel };

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
export const jokersImage = new ex.ImageSource('/assets/jokers.png', nearest);
export const jokersDarkImage = new ex.ImageSource(
  '/assets/jokers-dark.png',
  nearest,
);
export const chipsImage = new ex.ImageSource(
  '/assets/chips-no-outline.png',
  nearest,
);

const tables = new TableAtlas();
export const cardAtlas = new CardAtlas(
  heartsImage,
  cardBackImage,
  {
    diamonds: diamondsImage,
    clubs: clubsImage,
    spades: spadesImage,
  },
  jokersImage,
);
export const chipAtlas = new ChipAtlas(chipsImage);

const FRONT_IMAGES: Record<
  CardFrontStyle,
  {
    hearts: ex.ImageSource;
    diamonds: ex.ImageSource;
    clubs: ex.ImageSource;
    spades: ex.ImageSource;
    jokers: ex.ImageSource;
  }
> = {
  light: {
    hearts: heartsImage,
    diamonds: diamondsImage,
    clubs: clubsImage,
    spades: spadesImage,
    jokers: jokersImage,
  },
  dark: {
    hearts: heartsDarkImage,
    diamonds: diamondsDarkImage,
    clubs: clubsDarkImage,
    spades: spadesDarkImage,
    jokers: jokersDarkImage,
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
 * underlying `ImageSource`s are already loaded with the boot assets.
 */
export function personalCardAtlas(): CardAtlas {
  const appearance = getCardAppearance();
  const key = `${appearance.front}:${appearance.back}`;
  const cached = personalCardAtlases[key];
  if (cached) {
    return cached;
  }
  const fronts = FRONT_IMAGES[appearance.front];
  const atlas = new CardAtlas(
    fronts.hearts,
    BACK_IMAGES[appearance.back],
    {
      diamonds: fronts.diamonds,
      clubs: fronts.clubs,
      spades: fronts.spades,
    },
    fronts.jokers,
  );
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

function feltSprite(style: TableStyle): ex.Sprite {
  const sprite = tableSprites[style].clone();
  sprite.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);
  return sprite;
}

export const pixelFont = retroFont;

export const casinoEntrance = new ex.ImageSource('/assets/casino-entrance.png');

export const demoImages = [
  casinoEntrance,
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
  jokersImage,
  jokersDarkImage,
  chipsImage,
  ...TABLE_STYLES.map((style) => tableSprites[style].image),
  pixelFont,
  tableFont,
];

export class BootScene extends ex.Scene {
  private status = new ex.Text({
    text: '',
    font: pixelFont.toFont({
      family: '"Press Start 2P"',
      size: 8,
      color: STATUS,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  private tableActor: ex.Actor | undefined;
  private backgroundHex: string;

  constructor(
    private style: TableStyle = 'green',
    background: string = backgroundHex('green'),
  ) {
    super();
    this.backgroundHex = background;
  }

  onInitialize(engine: ex.Engine): void {
    this.applyBackground(engine);

    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 16),
      anchor: ex.vec(0.5, 0.5),
      width: TABLE_WIDTH * TABLE_SCALE,
      height: TABLE_HEIGHT * TABLE_SCALE,
      z: 0,
    });
    table.graphics.use(feltSprite(this.style));
    this.tableActor = table;
    this.add(table);

    const label = new ex.Actor({
      pos: ex.vec(16, 512),
      anchor: ex.vec(0, 0),
      z: 10,
    });
    label.graphics.use(this.status);
    this.add(label);
  }

  /** A short loading or error line. Empty by default, so the host is not shown. */
  setStatus(text: string): void {
    this.status.text = text;
  }

  /** Repaints the felt for a theme switch without waiting for a reload. */
  setTableStyle(style: TableStyle): void {
    this.style = style;
    this.tableActor?.graphics.use(feltSprite(style));
  }

  /** Paints the margin around the felt, and the canvas behind it. */
  setBackground(hex: string): void {
    this.backgroundHex = hex;
    this.applyBackground(this.engine);
  }

  private applyBackground(engine: ex.Engine | undefined): void {
    const color = ex.Color.fromHex(this.backgroundHex);
    this.backgroundColor = color;
    if (engine) {
      engine.backgroundColor = color;
    }
  }
}
