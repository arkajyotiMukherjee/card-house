import * as ex from 'excalibur';
import { CLASSIC, classicText } from './classic-table-design';
import { anchorTableActor } from './table-viewport';

export const PRIZE_POOL_BADGE = { x: 672, y: 12, w: 220, h: 48 } as const;

/** Shared entry-fee prize, kept distinct from poker pots and casino playing stacks. */
export class PrizePoolBadge extends ex.Actor {
  private readonly caption: ex.Actor;
  private readonly value: ex.Actor;
  private amount: number | undefined;

  constructor() {
    const box = PRIZE_POOL_BADGE;
    super({
      name: 'prize-pool-badge',
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 26,
    });
    const face = new ex.Rectangle({
      width: box.w,
      height: box.h,
      color: ex.Color.fromHex(CLASSIC.felt),
      strokeColor: ex.Color.fromHex(CLASSIC.gold),
      lineWidth: 2,
    });
    face.origin = ex.vec(0, 0);
    this.graphics.use(face);
    this.pointer.useColliderShape = false;
    this.pointer.useGraphicsBounds = false;
    const trophy = new ex.Actor({
      name: 'prize-pool-trophy',
      pos: ex.vec(8, 8),
      anchor: ex.vec(0, 0),
    });
    trophy.graphics.use(
      new ex.Canvas({
        width: 32,
        height: 32,
        draw: (g) => {
          g.fillStyle = CLASSIC.gold;
          g.beginPath();
          g.moveTo(7, 2);
          g.lineTo(25, 2);
          g.lineTo(24, 12);
          g.quadraticCurveTo(23, 18, 18, 20);
          g.lineTo(18, 26);
          g.lineTo(24, 28);
          g.lineTo(24, 31);
          g.lineTo(8, 31);
          g.lineTo(8, 28);
          g.lineTo(14, 26);
          g.lineTo(14, 20);
          g.quadraticCurveTo(9, 18, 8, 12);
          g.closePath();
          g.fill();
          g.strokeStyle = CLASSIC.gold;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(8, 5);
          g.lineTo(2, 5);
          g.lineTo(2, 10);
          g.quadraticCurveTo(2, 16, 10, 16);
          g.moveTo(24, 5);
          g.lineTo(30, 5);
          g.lineTo(30, 10);
          g.quadraticCurveTo(30, 16, 22, 16);
          g.stroke();
        },
      }),
    );
    this.caption = new ex.Actor({
      name: 'prize-pool-caption',
      anchor: ex.vec(0, 0),
    });
    this.caption.graphics.use(classicText('PRIZE POOL', 14, CLASSIC.gold));
    this.value = new ex.Actor({
      name: 'prize-pool-amount',
      anchor: ex.vec(0, 0),
    });
    for (const child of [trophy, this.caption, this.value]) {
      child.pointer.useColliderShape = false;
      child.pointer.useGraphicsBounds = false;
      this.addChild(child);
    }
    this.centerText(this.caption, 46, 3, 166, 16);
    anchorTableActor(this, 'right', box.x);
    this.setAmount(undefined);
  }

  setAmount(amount: number | undefined): void {
    const visible = amount !== undefined;
    this.graphics.isVisible = visible;
    for (const child of this.children)
      if (child instanceof ex.Actor) child.graphics.isVisible = visible;
    if (amount === undefined || this.amount === amount) return;
    this.amount = amount;
    const label = `${amount.toLocaleString('en-US')} chips`;
    let size = 28,
      text = classicText(label, size, CLASSIC.cream);
    // Keep the exact amount on one line, including maximum supported entry fees.
    while ((text.width > 166 || text.height > 29) && size > 1)
      text = classicText(label, --size, CLASSIC.cream);
    this.value.graphics.use(text);
    this.centerText(this.value, 46, 18, 166, 29);
  }

  private centerText(
    actor: ex.Actor,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const graphic = actor.graphics.current!;
    actor.pos = ex.vec(
      x + (w - graphic.width) / 2,
      y + (h - graphic.height) / 2,
    );
  }
}
