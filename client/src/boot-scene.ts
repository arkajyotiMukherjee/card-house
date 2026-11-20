import * as ex from 'excalibur';
import { tableFont, retroFont } from './ui-text';
import {
  getCardAppearance,
  type CardBackStyle,
  type CardFrontStyle,
} from './card-appearance';
import { CardAtlas } from './card-atlas';
import { ChipAtlas } from './chip-atlas';
import { TABLE_SCALE } from './sheets';
import { walnutLobbyImages } from './walnut-lobby-art';
import { TABLE_STYLES, TableAtlas, type TableStyle } from './table-atlas';

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

export const pixelFont = retroFont;

export const casinoEntrance = new ex.ImageSource('/assets/casino-entrance.png');

export const demoImages = [
  casinoEntrance,
  ...walnutLobbyImages,
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
