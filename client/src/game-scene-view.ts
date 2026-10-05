import * as ex from 'excalibur';
import { greenTable, pixelFont } from './boot-scene';
import {
  LEAVE_TABLE_BUTTON,
  placeSeats,
  seatLabels,
  tableSubscriptionQueries,
  type MemberRef,
  type SeatRef,
} from './game-scene';
import type { DbConnection, SubscriptionHandle } from './module_bindings';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
} from './sheets';

const FELT = ex.Color.fromHex('#145c38');
const GOLD = ex.Color.fromHex('#f4e4b3');
const SELF = ex.Color.fromHex('#fff6d0');
const DIM = ex.Color.fromHex('#d7c08a');
const PLATE = ex.Color.fromHex('#0b2418');
const BUTTON = ex.Color.fromHex('#6e2a24');
const BUTTON_DOWN = ex.Color.fromHex('#3f1614');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const DANGER = ex.Color.fromHex('#e85d4c');

function canvasText(text: string, size: number, color: ex.Color): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: pixelFont.toFont({
      family: '"Press Start 2P"',
      size,
      color,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

function panelRect(
  width: number,
  height: number,
  fill: ex.Color,
  stroke: ex.Color,
): ex.Rectangle {
  const rect = new ex.Rectangle({
    width,
    height,
    color: fill,
    strokeColor: stroke,
    lineWidth: 2,
    smoothing: false,
  });
  rect.origin = ex.vec(0, 0);
  return rect;
}

export class GameScene extends ex.Scene {
  private tableId = '';
  private lobbyMemberId = '';
  private ready = false;
  private leaving = false;
  private seatActors: ex.Actor[] = [];
  private errorText!: ex.Text;
  private waitingText!: ex.Text;
  private subscription: SubscriptionHandle | undefined;
  private subscribedTableId = '';

  constructor(
    private readonly connection: DbConnection,
    private readonly clientId: string,
    private readonly onLeft: () => void,
  ) {
    super();
  }

  open(tableId: string, lobbyMemberId: string): void {
    this.tableId = tableId;
    this.lobbyMemberId = lobbyMemberId;
    this.leaving = false;
    if (this.ready) {
      this.errorText.text = '';
    }
  }

  onInitialize(): void {
    this.backgroundColor = FELT;

    const sprite = greenTable.clone();
    sprite.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);
    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 8),
      anchor: ex.vec(0.5, 0.5),
      width: TABLE_WIDTH * TABLE_SCALE,
      height: TABLE_HEIGHT * TABLE_SCALE,
      z: 0,
    });
    table.graphics.use(sprite);
    this.add(table);

    this.waitingText = canvasText('', 8, DIM);
    const waiting = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2 - 80, LOGICAL_HEIGHT / 2),
      anchor: ex.vec(0, 0),
      z: 4,
    });
    waiting.graphics.use(this.waitingText);
    this.add(waiting);

    this.errorText = canvasText('', 8, DANGER);
    const error = new ex.Actor({
      pos: ex.vec(200, 24),
      anchor: ex.vec(0, 0),
      z: 22,
    });
    error.graphics.use(this.errorText);
    this.add(error);

    this.addLeaveButton();
    this.watchRows();
    this.ready = true;
  }

  onActivate(): void {
    this.bindTable();
  }

  onDeactivate(): void {
    this.endSubscription();
  }

  private watchRows(): void {
    this.connection.db.gameSeat.onInsert(() => {
      this.paintSeats();
    });
    this.connection.db.gameSeat.onUpdate(() => {
      this.paintSeats();
    });
    this.connection.db.gameSeat.onDelete(() => {
      this.paintSeats();
    });
    this.connection.db.lobbyMember.onUpdate(() => {
      this.paintSeats();
    });
  }

  private bindTable(): void {
    const tableId = this.tableId;
    if (tableId.length === 0) {
      return;
    }
    if (this.subscription && this.subscribedTableId === tableId) {
      this.paintSeats();
      return;
    }
    this.endSubscription();
    this.subscribedTableId = tableId;
    const queries = tableSubscriptionQueries(tableId);
    this.subscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (this.subscribedTableId === tableId) {
          this.paintSeats();
        }
      })
      .onError((ctx) => {
        const detail =
          ctx.event instanceof Error
            ? ctx.event.message
            : 'Could not subscribe';
        this.showError(detail);
      })
      .subscribe([...queries]);
    this.paintSeats();
  }

  private endSubscription(): void {
    const handle = this.subscription;
    this.subscription = undefined;
    this.subscribedTableId = '';
    if (!handle || handle.isEnded()) {
      return;
    }
    handle.unsubscribe();
  }

  private paintSeats(): void {
    if (!this.ready || this.tableId.length === 0) {
      return;
    }
    for (const actor of this.seatActors) {
      actor.kill();
    }
    this.seatActors = [];
    const placed = placeSeats(
      seatLabels(
        readSeats(this.connection),
        readMembers(this.connection),
        this.tableId,
        this.clientId,
      ),
    );
    this.waitingText.text = placed.length === 0 ? 'Waiting for seats' : '';
    for (const seat of placed) {
      this.addSeat(seat.name, seat.x, seat.y, seat.self);
    }
  }

  private addSeat(name: string, x: number, y: number, self: boolean): void {
    const width = Math.max(48, name.length * 8 + 16);
    const plate = new ex.Actor({
      pos: ex.vec(x - width / 2, y),
      anchor: ex.vec(0, 0),
      width,
      height: 20,
      z: 6,
    });
    plate.graphics.use(panelRect(width, 20, PLATE, self ? STROKE_HOT : STROKE));
    const text = canvasText(name, 8, self ? SELF : GOLD);
    const label = new ex.Actor({
      pos: ex.vec(8, 6),
      anchor: ex.vec(0, 0),
    });
    label.graphics.use(text);
    plate.addChild(label);
    this.add(plate);
    this.seatActors.push(plate);
  }

  private addLeaveButton(): void {
    const box = LEAVE_TABLE_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 20,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const caption = new ex.Actor({
      pos: ex.vec(8, 10),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Leave Table', 8, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(8, 11);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(8, 10);
      this.leave();
    });
    this.add(actor);
  }

  private leave(): void {
    if (this.leaving || this.tableId.length === 0) {
      return;
    }
    this.leaving = true;
    this.errorText.text = '';
    const tableId = this.tableId;
    const lobbyMemberId = this.lobbyMemberId;
    void this.connection.reducers
      .leaveTable({ tableId, lobbyMemberId })
      .then(() => {
        this.onLeft();
      })
      .catch((error: unknown) => {
        this.leaving = false;
        this.showError(
          error instanceof Error ? error.message : 'Could not leave',
        );
      });
  }

  private showError(message: string): void {
    if (!this.ready) {
      return;
    }
    this.errorText.text = message;
  }
}

function readSeats(connection: DbConnection): SeatRef[] {
  const rows: SeatRef[] = [];
  for (const seat of connection.db.gameSeat.iter()) {
    rows.push({
      tableId: seat.tableId,
      lobbyMemberId: seat.lobbyMemberId,
      seatIndex: seat.seatIndex,
    });
  }
  return rows;
}

function readMembers(connection: DbConnection): MemberRef[] {
  const rows: MemberRef[] = [];
  for (const member of connection.db.lobbyMember.iter()) {
    rows.push({
      id: member.id,
      lobbyId: member.lobbyId,
      clientId: member.clientId,
      name: member.name,
    });
  }
  return rows;
}
