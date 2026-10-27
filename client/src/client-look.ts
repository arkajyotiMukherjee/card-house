import {
  getCardAppearance,
  type CardBackStyle,
  type CardFrontStyle,
} from './card-appearance';
import {
  backgroundHex,
  getBackground,
  getTheme,
  type BackgroundStyle,
} from './theme';
import type { TableStyle } from './table-atlas';

type LookStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The four Theme choices stored for this browser. */
export interface ClientLook {
  table: TableStyle;
  background: BackgroundStyle;
  front: CardFrontStyle;
  back: CardBackStyle;
}

/**
 * What a table scene paints from the saved Theme: felt sprite, page and
 * margin color, and the card front and back this client draws.
 */
export interface TableScenePaint {
  table: TableStyle;
  background: string;
  front: CardFrontStyle;
  back: CardBackStyle;
}

export function readClientLook(
  clientId: string,
  storage: LookStorage = localStorage,
): ClientLook {
  const cards = getCardAppearance(storage);
  return {
    table: getTheme(clientId, storage),
    background: getBackground(clientId, storage),
    front: cards.front,
    back: cards.back,
  };
}

/** The look `GameScene` applies when it opens and on each refresh. */
export function tableScenePaint(
  clientId: string,
  storage: LookStorage = localStorage,
): TableScenePaint {
  const look = readClientLook(clientId, storage);
  return {
    table: look.table,
    background: backgroundHex(look.background),
    front: look.front,
    back: look.back,
  };
}
