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
 * use this same grid.
 * Row 0 is blank, Ace, 2, 3, 4.
 * Row 1 is 5, 6, 7, 8, 9.
 * Row 2 starts with 10, Jack, then a joker, King, and Queen.
 * Ace is column 1 of row 0.
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
  K: { col: 3, row: 2 },
  Q: { col: 4, row: 2 },
};

export class CardAtlas {
  private readonly sheets: Record<Suit, ex.ImageSource | undefined>;

  constructor(
    hearts: ex.ImageSource,
    private readonly cardBack: ex.ImageSource,
    others: Partial<Record<Exclude<Suit, 'hearts'>, ex.ImageSource>> = {},
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
}
