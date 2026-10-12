import * as ex from 'excalibur';

/** One `VoicePresence` row. `tableId` is empty for the lobby voice channel. */
export interface PresenceRef {
  lobbyId: string;
  tableId: string;
  lobbyMemberId: string;
}

/** Members the bot saw in this lobby's voice channel. */
export function lobbyVoiceMemberIds(
  rows: Iterable<PresenceRef>,
  lobbyId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.lobbyId === lobbyId && row.tableId === '') {
      ids.add(row.lobbyMemberId);
    }
  }
  return ids;
}

/** Members the bot saw in this table's voice channel. */
export function tableVoiceMemberIds(
  rows: Iterable<PresenceRef>,
  tableId: string,
): Set<string> {
  const ids = new Set<string>();
  if (tableId.length === 0) {
    return ids;
  }
  for (const row of rows) {
    if (row.tableId === tableId) {
      ids.add(row.lobbyMemberId);
    }
  }
  return ids;
}

/**
 * Headset sprite, one character per pixel. `#` is the band and ear cups,
 * `o` is the mic. Drawn on the 960×540 grid with no scaling.
 */
export const HEADSET_PIXELS = [
  '...######...',
  '..#......#..',
  '.#........#.',
  '.#........#.',
  '##........##',
  '###......###',
  '###......###',
  '###......###',
  '.##......##.',
  '.........o..',
  '......ooo...',
] as const;

export const HEADSET_WIDTH = HEADSET_PIXELS[0].length;
export const HEADSET_HEIGHT = HEADSET_PIXELS.length;

const HEADSET_BAND = '#fff6d0';
const HEADSET_MIC = '#7fd18b';

/** A headset graphic. Each call returns its own canvas. */
export function headsetGraphic(): ex.Canvas {
  return new ex.Canvas({
    width: HEADSET_WIDTH,
    height: HEADSET_HEIGHT,
    cache: true,
    draw: (ctx) => {
      for (let y = 0; y < HEADSET_HEIGHT; y += 1) {
        const row = HEADSET_PIXELS[y] ?? '';
        for (let x = 0; x < HEADSET_WIDTH; x += 1) {
          const cell = row[x];
          if (cell === '#' || cell === 'o') {
            ctx.fillStyle = cell === '#' ? HEADSET_BAND : HEADSET_MIC;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    },
  });
}

/** A headset actor placed with its top left at (x, y). */
export function headsetActor(x: number, y: number, z: number): ex.Actor {
  const actor = new ex.Actor({
    pos: ex.vec(x, y),
    anchor: ex.vec(0, 0),
    width: HEADSET_WIDTH,
    height: HEADSET_HEIGHT,
    z,
  });
  const graphic = headsetGraphic();
  graphic.origin = ex.vec(0, 0);
  actor.graphics.use(graphic);
  return actor;
}
