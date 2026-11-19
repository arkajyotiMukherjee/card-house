import * as ex from 'excalibur';
import { CLASSIC, classicText, classicHeader } from './classic-table-design';
import { uiText } from './ui-text';
import { panelRect } from './canvas-ui';
import { anchorTableActor, tableGutter } from './table-viewport';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import { casinoPortrait } from './casino-art';
import type { RenderContext } from './game-driver';
export interface ClassicBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Reusable classic header, tonal band, measured text, and rectangular controls. */
export class ClassicTableUi {
  private actors: ex.Actor[] = [];
  constructor(private readonly ctx: RenderContext) {}
  clear(): void {
    for (const actor of this.actors) actor.kill();
    this.actors = [];
  }
  add(actor: ex.Actor): ex.Actor {
    this.actors.push(actor);
    this.ctx.scene.add(actor);
    return actor;
  }
  text(
    box: ClassicBox,
    value: string,
    size = 18,
    color: string = CLASSIC.cream,
    edge?: 'left' | 'right',
    display = false,
    name = 'classic-label',
    seatIndex?: number,
  ): ex.Actor {
    const seat = this.ctx.seats.find((row) => row.seatIndex === seatIndex);
    const portrait =
      seat?.avatar && casinoPortrait(seat.avatar, !!seat.speaking);
    const textWidth = box.w - (portrait ? 23 : 0);
    const make = (size: number, text = value): ex.Text =>
      display
        ? classicText(text, size, color)
        : uiText(text, size, ex.Color.fromHex(color));
    let graphic = make(size);
    while ((graphic.width > textWidth || graphic.height > box.h) && size > 16)
      graphic = make(--size);
    if (name.endsWith('player-name') && graphic.width > textWidth) {
      let short = value;
      do {
        short = short.slice(0, -1);
        graphic = make(size, `${short}…`);
      } while (graphic.width > textWidth && short.length > 1);
    }
    if (!name.endsWith('player-name')) {
      const lines: string[] = [];
      for (const paragraph of value.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (line && make(size, next).width > textWidth) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        lines.push(line);
      }
      graphic = make(size, lines.join('\n'));
    }

    const actor = new ex.Actor({
      name,
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 25,
    });
    if (portrait) {
      const x = (textWidth - graphic.width) / 2;
      actor.graphics.use(
        new ex.GraphicsGroup({
          members: [
            { graphic: portrait, offset: ex.vec(x, (box.h - 19) / 2) },
            { graphic, offset: ex.vec(x + 23, (box.h - graphic.height) / 2) },
          ],
          useAnchor: false,
        }),
      );
    } else {
      actor.graphics.use(graphic);
      actor.graphics.offset = ex.vec(
        (box.w - graphic.width) / 2,
        (box.h - graphic.height) / 2,
      );
    }
    actor.pointer.useGraphicsBounds = false;
    actor.pointer.useColliderShape = false;
    if (edge) anchorTableActor(actor, edge);
    return this.add(actor);
  }
  surface(
    box: ClassicBox,
    name: string,
    fill: string = CLASSIC.felt,
  ): ex.Actor {
    const actor = new ex.Actor({
      name,
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 5,
    });
    actor.graphics.use(
      new ex.Rectangle({
        width: box.w,
        height: box.h,
        color: ex.Color.fromHex(fill),
      }),
    );
    actor.graphics.current!.origin = ex.vec(0, 0);
    actor.pointer.useGraphicsBounds = false;
    actor.pointer.useColliderShape = false;
    return this.add(actor);
  }
  button(
    box: ClassicBox,
    caption: string,
    action: () => void,
    edge?: 'left' | 'right',
    danger = false,
  ): void {
    const actor = new ex.Actor({
      name: `classic-${caption.toLowerCase().replaceAll(' ', '-')}`,
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 26,
    });
    actor.graphics.use(
      panelRect(
        box.w,
        box.h,
        ex.Color.fromHex(danger ? CLASSIC.danger : CLASSIC.felt),
        ex.Color.fromHex(danger ? CLASSIC.gold : CLASSIC.softBorder),
      ),
    );
    const graphic = uiText(caption, 17, ex.Color.fromHex(CLASSIC.cream));
    const child = new ex.Actor({
      pos: ex.vec((box.w - graphic.width) / 2, (box.h - graphic.height) / 2),
      anchor: ex.vec(0, 0),
    });
    child.graphics.use(graphic);
    child.pointer.useGraphicsBounds = false;
    child.pointer.useColliderShape = false;
    actor.addChild(child);
    bindButtonPress(actor, undefined, undefined, () => {
      if (!this.ctx.inputBlocked()) action();
    });
    if (edge) anchorTableActor(actor, edge);
    this.add(actor);
  }
  header(title: string, meta = ''): void {
    const header = classicHeader(isMobileDevice()),
      nav = this.ctx.navigation;
    if (nav) {
      this.button(header.leave, 'Leave Table', nav.leave, 'left', true);
      if (nav.chatAvailable) this.button(header.chat, 'Chat', nav.chat, 'left');
      this.button(header.help, '?', nav.help, 'right');
    }
    this.text(
      { x: 312, y: 16, w: 336, h: 40 },
      title,
      24,
      CLASSIC.cream,
      undefined,
      true,
      'classic-game-title',
    );
    if (meta)
      this.text(
        { x: 670, y: 16, w: 210, h: 40 },
        meta,
        14,
        CLASSIC.quiet,
        'right',
      );
  }
  personalBand(): void {
    const band = this.surface(
      { x: 8, y: 436, w: 944, h: 96 },
      'classic-personal-band',
      '#103c27',
    );
    const fit = (): void => {
      band.pos.x = 8 - tableGutter();
      band.graphics.current!.scale.x = (944 + tableGutter() * 2) / 944;
    };
    fit();
    band.on('postupdate', fit);
  }
}
