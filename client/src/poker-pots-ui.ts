import * as ex from 'excalibur';
import type { PokerState } from '../../src/shared/games/poker';
import type { RenderContext } from './game-driver';
import { CLASSIC } from './classic-table-design';
import { ClassicTableUi } from './classic-table-ui';
import { chipAtlas } from './boot-scene';
import { bindButtonPress } from './button-press';
import {
  potChipStacks,
  POKER_CHIP_FACE_SCALE,
  POKER_CHIP_LAYER_GAP,
} from './poker-layout';
import {
  pokerPotEntries,
  pokerPotPage,
  type PokerPotEntry,
} from './poker-pots';

export class PokerPotsUi {
  private ui?: ClassicTableUi;
  private page = 0;
  private opened: string | null = null;
  private hand = -1;
  private removeKey?: () => void;
  get isOpen(): boolean {
    return this.opened !== null;
  }
  clear(reset = false): void {
    this.ui?.clear();
    this.ui = undefined;
    this.removeKey?.();
    this.removeKey = undefined;
    if (reset) {
      this.page = 0;
      this.opened = null;
      this.hand = -1;
    }
  }
  render(
    state: PokerState,
    ctx: RenderContext,
    rerender: () => void,
    focus: (seat: number) => void,
  ): void {
    this.clear();
    if (this.hand !== state.handNumber) {
      this.hand = state.handNumber;
      this.page = 0;
      this.opened = null;
    }
    const entries = pokerPotEntries(state);
    if (entries.length < 2) {
      this.opened = null;
      return;
    }
    const ui = (this.ui = new ClassicTableUi(ctx));
    const page = pokerPotPage(entries, this.page);
    this.page = page.page;
    const finished = state.phase === 'finished';
    const width = (472 - (page.columns - 1) * 8) / page.columns;
    for (const [index, entry] of page.shown.entries()) {
      const x = 244 + index * (width + 8),
        y = finished ? 274 : 226,
        h = finished ? 40 : 56;
      const tile = new ex.Actor({
        name: `poker-${entry.key}`,
        pos: ex.vec(x, y),
        anchor: ex.vec(0, 0),
        width,
        height: h,
        z: 23,
      });
      const face = new ex.Rectangle({
        width,
        height: h,
        color: ex.Color.fromHex(CLASSIC.felt),
      });
      face.origin = ex.vec(0, 0);
      tile.graphics.use(face);
      tile.pointer.useGraphicsBounds = false;
      bindButtonPress(tile, undefined, undefined, () => {
        if (ctx.inputBlocked()) return;
        this.opened = entry.key;
        if (entry.winners[0] !== undefined) focus(entry.winners[0]);
        rerender();
      });
      ui.add(tile);
      if (finished) {
        ui.text(
          { x: x + 4, y, w: width - 8, h: 20 },
          `${entry.title} · ${entry.amount.toLocaleString()}`,
          16,
          CLASSIC.cream,
          undefined,
          false,
          'poker-pot-caption',
        );
        const winner =
          entry.winners.length === 1
            ? (ctx.seats.find((seat) => seat.seatIndex === entry.winners[0])
                ?.name ?? 'Player')
            : `${entry.winners.length} winners`;
        ui.text(
          { x: x + 4, y: y + 20, w: width - 8, h: 20 },
          winner,
          16,
          CLASSIC.accent,
          undefined,
          false,
          'poker-pot-winner-player-name',
        );
      } else {
        ui.text(
          { x: x + 4, y, w: width - 8, h: 20 },
          entry.title,
          16,
          entry.pending ? CLASSIC.secondary : CLASSIC.accent,
          undefined,
          false,
          'poker-pot-caption',
        );
        ui.text(
          { x: x + 6, y: y + 22, w: width - 62, h: 30 },
          entry.amount.toLocaleString(),
          26,
          CLASSIC.cream,
          undefined,
          true,
          'poker-pot-amount',
        );
        const stacks = potChipStacks(entry.amount).slice(0, 2);
        for (const [stackIndex, stack] of stacks.entries())
          for (let layer = 0; layer < Math.min(2, stack.count); layer++) {
            const chip = new ex.Actor({
              name: 'side-pot-chip',
              pos: ex.vec(
                x + width - 32 + (stackIndex - (stacks.length - 1) / 2) * 24,
                y + 44 - layer * POKER_CHIP_LAYER_GAP,
              ),
              z: 24 + layer,
            });
            chip.graphics.use(chipAtlas.sprite(stack.value));
            chip.scale = ex.vec(POKER_CHIP_FACE_SCALE, POKER_CHIP_FACE_SCALE);
            chip.pointer.useColliderShape = false;
            chip.pointer.useGraphicsBounds = false;
            ui.add(chip);
          }
      }
    }
    if (!finished)
      ui.text(
        { x: 244, y: 286, w: 472, h: 24 },
        `Total ${state.pot.toLocaleString()} chips · Tap a pot for details`,
        16,
        CLASSIC.secondary,
        undefined,
        false,
        'poker-pot-total',
      );
    if (page.pages > 1) {
      ui.button({ x: 184, y: finished ? 274 : 234, w: 44, h: 40 }, '‹', () => {
        this.page = (this.page - 1 + page.pages) % page.pages;
        rerender();
      });
      ui.button({ x: 732, y: finished ? 274 : 234, w: 44, h: 40 }, '›', () => {
        this.page = (this.page + 1) % page.pages;
        rerender();
      });
      ui.text(
        { x: 732, y: finished ? 316 : 276, w: 44, h: 22 },
        `${page.page + 1}/${page.pages}`,
        16,
        CLASSIC.quiet,
        undefined,
        false,
        'poker-pot-page',
      );
    }
    const detail = entries.find((entry) => entry.key === this.opened);
    if (detail)
      this.details(ui, detail, state, ctx, () => {
        this.opened = null;
        rerender();
      });
  }
  private details(
    ui: ClassicTableUi,
    entry: PokerPotEntry,
    state: PokerState,
    ctx: RenderContext,
    close: () => void,
  ): void {
    const shade = new ex.Actor({
      name: 'poker-pot-detail-shade',
      pos: ex.vec(-240, 0),
      anchor: ex.vec(0, 0),
      width: 1440,
      height: 540,
      z: 90,
    });
    const dark = new ex.Rectangle({
      width: 1440,
      height: 540,
      color: ex.Color.fromRGB(0, 0, 0, 0.65),
    });
    dark.origin = ex.vec(0, 0);
    shade.graphics.use(dark);
    for (const type of ['pointerdown', 'pointerup'] as const)
      shade.on(type, (event) => event.cancel());
    ui.add(shade);
    const panel = ui.surface(
      { x: 212, y: 172, w: 536, h: 218 },
      'poker-pot-details',
    );
    panel.z = 91;
    const label = (
      box: { x: number; y: number; w: number; h: number },
      text: string,
      size: number,
      color: string = CLASSIC.cream,
      display = false,
      name = 'poker-pot-detail-label',
    ): void => {
      ui.text(box, text, size, color, undefined, display, name).z = 94;
    };
    label(
      { x: 228, y: 182, w: 504, h: 34 },
      `${entry.title} · ${entry.amount.toLocaleString()} chips`,
      26,
      CLASSIC.cream,
      true,
    );
    label(
      { x: 228, y: 218, w: 504, h: 24 },
      entry.pending
        ? entry.title === 'Uncalled'
          ? 'Unmatched chips return at showdown'
          : 'This contribution is waiting to be matched'
        : 'Eligible players',
      18,
      CLASSIC.secondary,
    );
    for (const [index, seat] of entry.eligible.entries()) {
      const name =
        ctx.seats.find((row) => row.seatIndex === seat)?.name ?? 'Player';
      const x = 228 + Math.floor(index / 4) * 252,
        y = 246 + (index % 4) * 22;
      label(
        { x, y, w: 188, h: 22 },
        name,
        18,
        entry.winners.includes(seat) ? CLASSIC.accent : CLASSIC.cream,
        false,
        'poker-pot-eligible-player-name',
      );
      if (entry.winners.includes(seat))
        label({ x: x + 192, y, w: 52, h: 22 }, 'Winner', 14, CLASSIC.accent);
    }
    if (state.phase === 'finished' && entry.winners.length > 1)
      label(
        { x: 228, y: 344, w: 330, h: 28 },
        'Tied hand · pot split independently',
        16,
        CLASSIC.secondary,
      );
    const button = new ex.Actor({
      name: 'poker-pot-details-close',
      pos: ex.vec(644, 338),
      anchor: ex.vec(0, 0),
      width: 88,
      height: 40,
      z: 95,
    });
    const face = new ex.Rectangle({
      width: 88,
      height: 40,
      color: ex.Color.fromHex(CLASSIC.active),
      strokeColor: ex.Color.fromHex(CLASSIC.gold),
      lineWidth: 1,
    });
    face.origin = ex.vec(0, 0);
    button.graphics.use(face);
    bindButtonPress(button, undefined, undefined, close);
    ui.add(button);
    ui.text({ x: 644, y: 338, w: 88, h: 40 }, 'Close', 18).z = 96;
    button.on('pointerup', (event) => event.cancel());
    const onKey = (event: ex.KeyEvent): void => {
      if (event.key === ex.Keys.Escape) close();
    };
    ctx.scene.input.keyboard.on('press', onKey);
    this.removeKey = () => ctx.scene.input.keyboard.off('press', onKey);
  }
}
