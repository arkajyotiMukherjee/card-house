import * as ex from 'excalibur';
import { TABLE_HEIGHT, TABLE_WIDTH } from './sheets';

/** Felt colors shipped in the table pack, without guide overlays. */
export const TABLE_STYLES = ['green', 'purple', 'red'] as const;

export type TableStyle = (typeof TABLE_STYLES)[number];

const nearest = { filtering: ex.ImageFiltering.Pixel };

const TABLE_PATHS: Record<TableStyle, string> = {
  green: '/assets/table-green.png',
  purple: '/assets/table-purple.png',
  red: '/assets/table-red.png',
};

const tableView = {
  x: 0,
  y: 0,
  width: TABLE_WIDTH,
  height: TABLE_HEIGHT,
};

/**
 * Maps a table style name to that table's background sprite.
 * Green is the default felt.
 */
export class TableAtlas {
  private readonly images: Record<TableStyle, ex.ImageSource>;

  constructor() {
    this.images = {
      green: new ex.ImageSource(TABLE_PATHS.green, nearest),
      purple: new ex.ImageSource(TABLE_PATHS.purple, nearest),
      red: new ex.ImageSource(TABLE_PATHS.red, nearest),
    };
  }

  sprite(style: TableStyle = 'green'): ex.Sprite {
    const image = this.images[style];
    if (!image) {
      throw new Error(`Unknown table style: ${style}`);
    }
    return image.toSprite({ sourceView: { ...tableView } });
  }
}
