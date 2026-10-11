import * as ex from 'excalibur';
import { readBluffState, type BluffState } from '../../src/shared/games/bluff';
import {
  DUMMY_INCREMENT,
  type DummyIntent,
} from '../../src/shared/games/dummy-counter';
import { BluffDriver } from './bluff-driver';
import { cardAtlas, greenTable } from './boot-scene';
import {
  BUTTON,
  BUTTON_DOWN,
  canvasText,
  DANGER,
  DIM,
  FELT,
  GOLD,
  panelRect,
  PLATE,
  SELF,
  STROKE,
  STROKE_HOT,
} from './canvas-ui';
import { eventMessage, readStoredEvent } from './event-messages';
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
import { HowToPlayOverlay } from './how-to-play-overlay';
import type { DbConnection, SubscriptionHandle } from './module_bindings';
import { bluffStatusHud, STATUS_HUD } from './status-hud';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
} from './sheets';

const WARN_PLATE = ex.Color.fromHex('#4a1713');
const STRIP_Y = 44;
const STRIP_HOLD_MS = 3200;
const STRIP_FADE_MS = 500;

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
  private strip: ex.Actor | null = null;
  private eventsLive = false;
  private readonly shownEvents = new Set<string>();
  private countText!: ex.Text;
  private countValue!: ex.Actor;
  private counterPlate!: ex.Actor;
  private howToPlay!: HowToPlayOverlay;
  private hudPlate!: ex.Actor;
  private hudTurn!: ex.Text;
  private hudPhase!: ex.Text;
  private hudRound!: ex.Text;

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
    this.clearStrip();
    this.shownEvents.clear();
    if (this.ready) {
      this.errorText.text = '';
      this.howToPlay.close();
      this.howToPlay.setGameType('');
      this.bluffDriver.destroy(this.driverContext());
      this.placeHud(false);
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
    this.howToPlay = new HowToPlayOverlay(this);
    this.addStatusHud();
    this.watchRows();
    this.ready = true;
  }

  onActivate(): void {
    this.input.keyboard.on('press', this.onKeyPress);
    this.input.pointers.on('wheel', this.onWheel);
    this.bindTable();
  }

  onDeactivate(): void {
    this.input.keyboard.off('press', this.onKeyPress);
    this.input.pointers.off('wheel', this.onWheel);
    this.howToPlay.close();
    this.endSubscription();
  }

  private readonly onKeyPress = (event: ex.KeyEvent): void => {
    if (event.key === ex.Keys.Escape) {
      this.howToPlay.close();
    }
  };

  private readonly onWheel = (event: ex.WheelEvent): void => {
    this.howToPlay.scrollBy(event.deltaY);
  };

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
    this.connection.db.gameEvent.onInsert((_ctx, row) => {
      this.announce(row);
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
    this.eventsLive = false;
    const queries = tableSubscriptionQueries(tableId);
    this.subscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (this.subscribedTableId === tableId) {
          this.eventsLive = true;
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
    this.eventsLive = false;
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
    this.sendPayload(dummyIntentPayload(intent), intent);
  }

  private sendPayload(intentPayload: string, intent: unknown): void {
    if (this.howToPlay.isOpen || this.tableId.length === 0) {
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
        const message =
          error instanceof Error ? error.message : 'Intent rejected';
        if (this.lastRow?.gameType === this.bluffDriver.gameType) {
          this.bluffDriver.intentRejected(intent, this.driverContext());
          this.showStrip(message, true);
          return;
        }
        this.showError(message);
      });
  }

  private announce(row: {
    id: string;
    tableId: string;
    payloadJson: string;
  }): void {
    if (!this.ready || !this.eventsLive || row.tableId !== this.tableId) {
      return;
    }
    if (this.shownEvents.has(row.id)) {
      return;
    }
    this.shownEvents.add(row.id);
    const stored = readStoredEvent(row.payloadJson);
    if (!stored) {
      return;
    }
    const names = new Map<number, string>();
    for (const seat of this.placed) {
      names.set(seat.seatIndex, seat.name);
    }
    const message = eventMessage(
      this.gameTypeOfTable(),
      stored.note,
      (seatIndex) => names.get(seatIndex) ?? `Seat ${seatIndex + 1}`,
    );
    if (message) {
      this.showStrip(message, false);
    }
  }

  private gameTypeOfTable(): string {
    if (this.lastRow && this.lastRow.id === this.tableId) {
      return this.lastRow.gameType;
    }
    for (const table of this.connection.db.gameTable.iter()) {
      if (table.id === this.tableId) {
        return table.gameType;
      }
    }
    return '';
  }

  /** One short line near the top center. It fades out on its own. */
  private showStrip(message: string, warning: boolean): void {
    this.clearStrip();
    const width = message.length * 8 + 24;
    const strip = new ex.Actor({
      pos: ex.vec(Math.floor((LOGICAL_WIDTH - width) / 2), STRIP_Y),
      anchor: ex.vec(0, 0),
      width,
      height: 22,
      z: 26,
    });
    strip.graphics.use(
      panelRect(
        width,
        22,
        warning ? WARN_PLATE : PLATE,
        warning ? DANGER : STROKE_HOT,
      ),
    );
    const caption = new ex.Actor({
      pos: ex.vec(12, 7),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(message, 8, warning ? DANGER : GOLD));
    strip.addChild(caption);
    strip.actions
      .delay(STRIP_HOLD_MS)
      .fade(0, STRIP_FADE_MS)
      .callMethod(() => {
        strip.kill();
        if (this.strip === strip) {
          this.strip = null;
        }
      });
    this.add(strip);
    this.strip = strip;
  }

  private clearStrip(): void {
    this.strip?.kill();
    this.strip = null;
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
    this.howToPlay.setGameType(row.gameType);
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
      this.placeHud(false);
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
    this.paintHud(state);
  }

  private paintHud(state: BluffState): void {
    const lines = bluffStatusHud(state, this.placed);
    this.hudTurn.text = lines.turn;
    this.hudPhase.text = lines.phase;
    this.hudRound.text = lines.round;
    this.placeHud(true);
  }

  private placeHud(visible: boolean): void {
    this.hudPlate.pos = visible
      ? ex.vec(STATUS_HUD.x, STATUS_HUD.y)
      : ex.vec(STATUS_HUD.x, -200);
  }

  private addStatusHud(): void {
    const box = STATUS_HUD;
    const plate = new ex.Actor({
      pos: ex.vec(box.x, -200),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 8,
    });
    plate.graphics.use(panelRect(box.w, box.h, PLATE, STROKE));
    this.hudTurn = canvasText('', 8, SELF);
    this.hudPhase = canvasText('', 8, GOLD);
    this.hudRound = canvasText('', 8, DIM);
    const rows = [this.hudTurn, this.hudPhase, this.hudRound];
    for (let index = 0; index < rows.length; index += 1) {
      const row = new ex.Actor({
        pos: ex.vec(10, 8 + index * 12),
        anchor: ex.vec(0, 0),
      });
      row.graphics.use(rows[index]);
      plate.addChild(row);
    }
    this.add(plate);
    this.hudPlate = plate;
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
        this.sendPayload(JSON.stringify(intent), intent);
      },
      inputBlocked: () => this.howToPlay.isOpen,
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
    if (this.leaving || this.howToPlay.isOpen || this.tableId.length === 0) {
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
