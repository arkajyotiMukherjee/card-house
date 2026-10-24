import * as ex from 'excalibur';
import { CARD_BACK, CARD_SIZE, cellRect, type GridCell } from './sheets';

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export interface CardFace {
  rank: Rank;
  suit: Suit;
}

/**
 * Light suit sheets, five columns by four rows. Diamonds, clubs, and spades
 * use this same grid. Jokers are a separate two-cell sheet, not these faces.
 * Row 0 is blank, Ace, 2, 3, 4.
 * Row 1 is 5, 6, 7, 8, 9.
 * Row 2 is 10, Jack index, Jack face, Queen index, Queen face.
 * Row 3 is King index, King face, then empty cells.
 * The index cells are the big rank letters. King is not the Queen cell.
 */
const HEART_CELLS: Record<Rank, GridCell> = {
  A: { col: 1, row: 0 },
  '2': { col: 2, row: 0 },
  '3': { col: 3, row: 0 },
  '4': { col: 4, row: 0 },
  '5': { col: 0, row: 1 },
  '6': { col: 1, row: 1 },
  '7': { col: 2, row: 1 },
  '8': { col: 3, row: 1 },
  '9': { col: 4, row: 1 },
  '10': { col: 0, row: 2 },
  J: { col: 1, row: 2 },
  Q: { col: 3, row: 2 },
  K: { col: 0, row: 3 },
};

export type JokerColor = 'red' | 'black';

const JOKER_CELLS: Record<JokerColor, GridCell> = {
  red: { col: 0, row: 0 },
  black: { col: 1, row: 0 },
};

export class CardAtlas {
  private readonly sheets: Record<Suit, ex.ImageSource | undefined>;

  constructor(
    hearts: ex.ImageSource,
    private readonly cardBack: ex.ImageSource,
    others: Partial<Record<Exclude<Suit, 'hearts'>, ex.ImageSource>> = {},
    private readonly jokers?: ex.ImageSource,
  ) {
    this.sheets = {
      hearts,
      diamonds: others.diamonds,
      clubs: others.clubs,
      spades: others.spades,
    };
  }

  sprite(card: CardFace): ex.Sprite {
    const sheet = this.sheets[card.suit];
    if (!sheet) {
      throw new Error(`CardAtlas has no sheet for ${card.suit}`);
    }
    return sheet.toSprite({
      sourceView: cellRect(HEART_CELLS[card.rank], CARD_SIZE),
    });
  }

  back(): ex.Sprite {
    return this.cardBack.toSprite({
      sourceView: cellRect(CARD_BACK, CARD_SIZE),
    });
  }

  /** A joker face. The sheet says Joker, and it is not a queen cell. */
  joker(color: JokerColor): ex.Sprite {
    if (!this.jokers) {
      throw new Error('CardAtlas has no joker sheet');
    }
    return this.jokers.toSprite({
      sourceView: cellRect(JOKER_CELLS[color], CARD_SIZE),
    });
  }
}
