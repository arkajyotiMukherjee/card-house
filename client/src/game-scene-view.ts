import * as ex from 'excalibur';
import { readBluffState, type BluffState } from '../../src/shared/games/bluff';
import {
  DUMMY_INCREMENT,
  type DummyIntent,
} from '../../src/shared/games/dummy-counter';
import { BluffDriver } from './bluff-driver';
import { cardAtlas, greenTable, pixelFont } from './boot-scene';
import {
  COUNTER_BUTTON,
  dummyIntentPayload,
  dummyStateFromJson,
  LEAVE_TABLE_BUTTON,
  placeSeats,
  seatLabels,
  tableSubscriptionQueries,
  type MemberRef,
  type PlacedSeat,
  type SeatRef,
} from './game-scene';
import type { RenderContext } from './game-driver';
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
  private dummy = false;
  private readonly bluffDriver = new BluffDriver();
  private lastRow: { id: string; gameType: string; stateJson: string } | null =
    null;
  private placed: PlacedSeat[] = [];
  private countText!: ex.Text;
  private countValue!: ex.Actor;
  private counterPlate!: ex.Actor;

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
    this.lastRow = null;
    if (this.ready) {
      this.errorText.text = '';
      this.bluffDriver.destroy(this.driverContext());
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
    this.addCounterButton();
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
    this.connection.db.gameTable.onInsert((_ctx, row) => {
      this.applySubscribedState(row);
    });
    this.connection.db.gameTable.onUpdate((_ctx, _old, row) => {
      this.applySubscribedState(row);
    });
  }

  private bindTable(): void {
    const tableId = this.tableId;
    if (tableId.length === 0) {
      return;
    }
    if (this.subscription && this.subscribedTableId === tableId) {
      this.paintSeats();
      this.readSubscribedState();
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
          this.readSubscribedState();
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
    this.placed = placed;
    this.waitingText.text = placed.length === 0 ? 'Waiting for seats' : '';
    for (const seat of placed) {
      this.addSeat(seat.name, seat.x, seat.y, seat.self);
    }
    this.paintGame();
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

  /**
   * Sends one intent through `handle_game_intent`.
   * The painted table changes only when `stateJson` arrives.
   */
  sendIntent(intent: DummyIntent): void {
    if (!this.dummy || this.tableId.length === 0) {
      return;
    }
    this.sendPayload(dummyIntentPayload(intent));
  }

  private sendPayload(intentPayload: string): void {
    if (this.tableId.length === 0) {
      return;
    }
    const tableId = this.tableId;
    const clientId = this.clientId;
    void this.connection.reducers
      .handleGameIntent({
        tableId,
        clientId,
        intentPayload,
      })
      .catch((error: unknown) => {
        this.showError(
          error instanceof Error ? error.message : 'Intent rejected',
        );
      });
  }

  private applySubscribedState(row: {
    id: string;
    gameType: string;
    stateJson: string;
  }): void {
    if (!this.ready || row.id !== this.tableId) {
      return;
    }
    this.lastRow = {
      id: row.id,
      gameType: row.gameType,
      stateJson: row.stateJson,
    };
    this.paintGame();
  }

  private readSubscribedState(): void {
    if (!this.ready || this.tableId.length === 0) {
      return;
    }
    for (const row of this.connection.db.gameTable.iter()) {
      if (row.id === this.tableId) {
        this.applySubscribedState(row);
        return;
      }
    }
  }

  private paintGame(): void {
    const row = this.lastRow;
    if (!this.ready || !row || row.id !== this.tableId) {
      return;
    }
    if (row.gameType !== this.bluffDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.paintCounter(row.gameType, row.stateJson);
      return;
    }
    this.dummy = false;
    this.placeCounter(false);
    let state: BluffState;
    try {
      state = readBluffState(JSON.parse(row.stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for players' : '';
    this.bluffDriver.render(state, this.driverContext());
  }

  private driverContext(): RenderContext {
    let meSeatIndex: number | null = null;
    for (const seat of this.placed) {
      if (seat.self) {
        meSeatIndex = seat.seatIndex;
      }
    }
    return {
      scene: this,
      seats: this.placed,
      meSeatIndex,
      cards: cardAtlas,
      sendIntent: (intent) => {
        this.sendPayload(JSON.stringify(intent));
      },
    };
  }

  private paintCounter(gameType: string, stateJson: string): void {
    let state: ReturnType<typeof dummyStateFromJson>;
    try {
      state = dummyStateFromJson(gameType, stateJson);
    } catch (error: unknown) {
      this.dummy = false;
      this.placeCounter(false);
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    if (!state) {
      this.dummy = false;
      this.placeCounter(false);
      return;
    }
    this.dummy = true;
    this.placeCounter(true);
    const label = String(state.count);
    this.countText.text = label;
    const width = label.length * 24;
    this.countValue.pos = ex.vec((COUNTER_BUTTON.w - width) / 2, 34);
    this.errorText.text = '';
  }

  private placeCounter(visible: boolean): void {
    const box = COUNTER_BUTTON;
    this.counterPlate.pos = visible
      ? ex.vec(box.x, box.y)
      : ex.vec(box.x, -200);
  }

  private addCounterButton(): void {
    const box = COUNTER_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, -200),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 8,
    });
    const face = panelRect(box.w, box.h, PLATE, STROKE);
    actor.graphics.use(face);
    const caption = new ex.Actor({
      pos: ex.vec(68, 10),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Count', 8, DIM));
    actor.addChild(caption);
    this.countText = canvasText('0', 24, GOLD);
    this.countValue = new ex.Actor({
      pos: ex.vec(76, 34),
      anchor: ex.vec(0, 0),
    });
    this.countValue.graphics.use(this.countText);
    actor.addChild(this.countValue);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = PLATE;
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
    });
    actor.on('pointerup', () => {
      face.color = PLATE;
      this.sendIntent({ type: DUMMY_INCREMENT });
    });
    this.add(actor);
    this.counterPlate = actor;
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
