import * as ex from 'excalibur';
import { refreshCanvasTextFields } from './html-field';
import { readBluffState, type BluffState } from '../../src/shared/games/bluff';
import {
  readCrazyEightsState,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights';
import {
  readGoFishState,
  type GoFishState,
} from '../../src/shared/games/go-fish';
import {
  readPresidentState,
  type PresidentState,
} from '../../src/shared/games/president';
import { readRummyState, type RummyState } from '../../src/shared/games/rummy';
import {
  readBlackjackState,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import {
  readSpadesState,
  type SpadesState,
} from '../../src/shared/games/spades';
import {
  readHeartsState,
  type HeartsState,
} from '../../src/shared/games/hearts';
import { readPokerState, type PokerState } from '../../src/shared/games/poker';
import {
  DUMMY_INCREMENT,
  type DummyIntent,
} from '../../src/shared/games/dummy-counter';
import { opponentNameAnchor, seatPlateWidth } from './table-presentation';
import { BluffDriver } from './bluff-driver';
import { CrazyEightsDriver } from './crazy-eights-driver';
import { GoFishDriver } from './go-fish-driver';
import { PresidentDriver } from './president-driver';
import { RummyDriver } from './rummy-driver';
import { BlackjackDriver } from './blackjack-driver';
import { SpadesDriver } from './spades-driver';
import { HeartsDriver } from './hearts-driver';
import {
  headsetActor,
  tableVoiceMemberIds,
  type PresenceRef,
} from './voice-presence';
import { PokerDriver } from './poker-driver';
import { personalCardAtlas, tableSprites } from './boot-scene';
import { tableScenePaint } from './client-look';
import { statsCaption } from './client-stats';
import { type TableStyle } from './table-atlas';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import {
  BUTTON,
  BUTTON_DOWN,
  canvasText,
  DANGER,
  DIM,
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
  memberIsWatching,
  placeSeats,
  seatLabels,
  spectatingLine,
  tableSubscriptionQueries,
  type MemberRef,
  type PlacedSeat,
  type SeatRef,
} from './game-scene';
import type { GameDriver, RenderContext } from './game-driver';
import { HowToPlayOverlay } from './how-to-play-overlay';
import { TableChatOverlay } from './table-chat-overlay';
import type { DbConnection, SubscriptionHandle } from './module_bindings';
import { SpeakingFader, tableSpeakers, type SpeakingRow } from './speaking';
import { seatGlow, speechBubble } from './speaking-view';
import {
  bluffStatusHud,
  crazyEightsStatusHud,
  goFishStatusHud,
  presidentStatusHud,
  rummyStatusHud,
  blackjackStatusHud,
  spadesStatusHud,
  heartsStatusHud,
  pokerStatusHud,
  STATUS_HUD,
  type StatusHudLines,
} from './status-hud';
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
  private linkLine = '';
  private linkText = canvasText('', 8, GOLD);
  private linkActor: ex.Actor | undefined;
  private startButton: ex.Actor | undefined;
  private waitingText!: ex.Text;
  private spectatingText!: ex.Text;
  private subscription: SubscriptionHandle | undefined;
  private subscribedTableId = '';
  private dummy = false;
  private readonly bluffDriver = new BluffDriver();
  private readonly presidentDriver = new PresidentDriver();
  private readonly goFishDriver = new GoFishDriver();
  private readonly crazyEightsDriver = new CrazyEightsDriver();
  private readonly rummyDriver = new RummyDriver();
  private readonly blackjackDriver = new BlackjackDriver();
  private readonly spadesDriver = new SpadesDriver();
  private readonly heartsDriver = new HeartsDriver();
  private readonly pokerDriver = new PokerDriver();
  private lastRow: { id: string; gameType: string; stateJson: string } | null =
    null;
  private placed: PlacedSeat[] = [];
  private readonly speakingFader = new SpeakingFader();
  private speaking = new Set<string>();
  private strip: ex.Actor | null = null;
  private eventsLive = false;
  private readonly shownEvents = new Set<string>();
  private countText!: ex.Text;
  private countValue!: ex.Actor;
  private counterPlate!: ex.Actor;
  private howToPlay!: HowToPlayOverlay;
  private tableChat!: TableChatOverlay;
  private hudPlate!: ex.Actor;
  private hudTurn!: ex.Text;
  private hudPhase!: ex.Text;
  private hudRound!: ex.Text;
  private statsText!: ex.Text;
  private statsLine = statsCaption({ handsPlayed: 0, gamesWon: 0 });
  private tableActor: ex.Actor | undefined;

  constructor(
    private readonly connection: DbConnection,
    private readonly clientId: string,
    private readonly onLeft: () => void,
    private style: TableStyle = 'green',
  ) {
    super();
  }

  /** A short line while the socket is being replaced. Empty once it is up. */
  setLinkStatus(line: string): void {
    this.linkLine = line;
    this.linkText.text = line;
    if (this.linkActor) {
      this.linkActor.pos = ex.vec(16, 4);
    }
  }

  setStats(line: string): void {
    this.statsLine = line;
    if (this.statsText) {
      this.statsText.text = line;
    }
  }

  /** Repaints the felt for a theme switch without waiting for a reload. */
  setTableStyle(style: TableStyle): void {
    this.style = style;
    this.tableActor?.graphics.use(tableSprites[style].clone());
  }

  /** Paints the margin around the felt from the saved background color. */
  setBackground(hex: string): void {
    this.backgroundColor = ex.Color.fromHex(hex);
  }

  /** Reads this browser's Theme again so a reload or a join paints it. */
  private applyStoredLook(): void {
    const paint = tableScenePaint(this.clientId);
    this.setTableStyle(paint.table);
    this.setBackground(paint.background);
  }

  open(tableId: string, lobbyMemberId: string): void {
    this.applyStoredLook();
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
      this.tableChat.setTable(tableId, lobbyMemberId);
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.placeHud(false);
    }
  }

  onInitialize(): void {
    this.applyStoredLook();

    const sprite = tableSprites[this.style].clone();
    sprite.scale = ex.vec(TABLE_SCALE, TABLE_SCALE);
    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 8),
      anchor: ex.vec(0.5, 0.5),
      width: TABLE_WIDTH * TABLE_SCALE,
      height: TABLE_HEIGHT * TABLE_SCALE,
      z: 0,
    });
    table.graphics.use(sprite);
    this.tableActor = table;
    this.add(table);

    this.waitingText = canvasText('', 8, DIM);
    const waiting = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2 - 80, LOGICAL_HEIGHT / 2),
      anchor: ex.vec(0, 0),
      z: 4,
    });
    waiting.graphics.use(this.waitingText);
    this.add(waiting);

    this.spectatingText = canvasText('', 8, DIM);
    const spectating = new ex.Actor({
      pos: ex.vec(16, 50),
      anchor: ex.vec(0, 0),
      z: 8,
    });
    spectating.graphics.use(this.spectatingText);
    this.add(spectating);

    this.errorText = canvasText('', 8, DANGER);
    const error = new ex.Actor({
      pos: ex.vec(200, 24),
      anchor: ex.vec(0, 0),
      z: 22,
    });
    error.graphics.use(this.errorText);
    this.add(error);

    this.linkText.text = this.linkLine;
    this.linkActor = new ex.Actor({
      pos: ex.vec(16, 4),
      anchor: ex.vec(0, 0),
      z: 30,
    });
    this.linkActor.graphics.use(this.linkText);
    this.add(this.linkActor);

    this.statsText = canvasText(this.statsLine, 8, GOLD);
    const stats = new ex.Actor({
      pos: ex.vec(280, 22),
      anchor: ex.vec(0, 0),
      z: 21,
    });
    stats.graphics.use(this.statsText);
    this.add(stats);

    this.addLeaveButton();
    this.addCounterButton();
    this.howToPlay = new HowToPlayOverlay(this, () => this.tableChat.close());
    this.tableChat = new TableChatOverlay(
      this,
      this.connection,
      this.clientId,
      () => readMembers(this.connection),
      () => this.howToPlay.close(),
    );
    this.tableChat.setTable(this.tableId, this.lobbyMemberId);
    this.addStatusHud();
    this.watchRows();
    this.ready = true;
  }

  onActivate(): void {
    this.input.keyboard.on('press', this.onKeyPress);
    this.input.pointers.on('wheel', this.onWheel);
    this.bindTable();
    refreshCanvasTextFields();
  }

  onDeactivate(): void {
    this.input.keyboard.off('press', this.onKeyPress);
    this.input.pointers.off('wheel', this.onWheel);
    this.howToPlay.close();
    this.tableChat.close();
    refreshCanvasTextFields();
    this.endSubscription();
  }

  private readonly onKeyPress = (event: ex.KeyEvent): void => {
    if (this.tableChat.handleKey(event)) {
      return;
    }
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
    this.connection.db.spectator.onInsert(() => {
      this.paintSeats();
    });
    this.connection.db.spectator.onUpdate(() => {
      this.paintSeats();
    });
    this.connection.db.spectator.onDelete(() => {
      this.paintSeats();
    });
    this.connection.db.lobbyMember.onUpdate(() => {
      this.paintSeats();
    });
    this.connection.db.speakingState.onInsert(() => {
      this.refreshSpeaking();
    });
    this.connection.db.speakingState.onUpdate(() => {
      this.refreshSpeaking();
    });
    this.connection.db.speakingState.onDelete(() => {
      this.refreshSpeaking();
    });
    this.connection.db.voicePresence.onInsert(() => {
      this.paintSeats();
    });
    this.connection.db.voicePresence.onUpdate(() => {
      this.paintSeats();
    });
    this.connection.db.voicePresence.onDelete(() => {
      this.paintSeats();
    });
    this.connection.db.gameEvent.onInsert((ctx, row) => {
      if (ctx.event.tag === 'SubscribeApplied') {
        return;
      }
      this.announce(row);
    });
    this.connection.db.tableChatMessage.onInsert(() => {
      this.tableChat.refresh();
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
      this.tableChat.refresh();
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
          this.tableChat.refresh();
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
    this.startButton?.kill();
    this.startButton = undefined;
    const handle = this.subscription;
    this.subscription = undefined;
    this.subscribedTableId = '';
    this.eventsLive = false;
    if (!handle || handle.isEnded()) {
      return;
    }
    handle.unsubscribe();
  }

  private refreshSpeaking(): void {
    this.speaking = tableSpeakers(readSpeaking(this.connection), this.tableId);
  }

  private paintSeats(): void {
    if (!this.ready || this.tableId.length === 0) {
      return;
    }
    this.refreshSpeaking();
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
        tableVoiceMemberIds(readPresence(this.connection), this.tableId),
      ),
    );
    this.placed = placed;
    this.waitingText.text = placed.length === 0 ? 'Waiting for seats' : '';
    this.spectatingText.text = spectatingLine(
      placed.some((seat) => seat.self),
      memberIsWatching(
        readSpectators(this.connection),
        this.tableId,
        this.lobbyMemberId,
      ),
    );
    for (const seat of placed) {
      this.addSeat(
        seat.name,
        seat.x,
        seat.y,
        seat.self,
        seat.lobbyMemberId,
        seat.inVoice,
      );
    }
    this.paintGame();
  }

  private addSeat(
    name: string,
    x: number,
    y: number,
    self: boolean,
    lobbyMemberId: string,
    inVoice: boolean,
  ): void {
    const width = seatPlateWidth(name);
    const opponent = !self;
    const origin = opponent
      ? opponentNameAnchor(x, y, name)
      : { x: x - width / 2, y };
    const plate = new ex.Actor({
      pos: ex.vec(origin.x, origin.y),
      anchor: ex.vec(0, 0),
      width,
      height: 20,
      z: opponent ? 80 : 6,
    });
    plate.graphics.use(panelRect(width, 20, PLATE, self ? STROKE_HOT : STROKE));
    const text = canvasText(name, 8, self ? SELF : GOLD);
    const label = new ex.Actor({
      pos: ex.vec(8, 6),
      anchor: ex.vec(0, 0),
    });
    label.graphics.use(text);
    plate.addChild(label);
    const key = `${this.tableId}:${lobbyMemberId}`;
    const isSpeaking = (): boolean => this.speaking.has(lobbyMemberId);
    plate.addChild(
      seatGlow(
        ex.vec(0, 0),
        width,
        20,
        -1,
        this.speakingFader,
        key,
        isSpeaking,
      ),
    );
    plate.addChild(
      speechBubble(
        ex.vec(width - 8, -26),
        2,
        2,
        this.speakingFader,
        key,
        isSpeaking,
      ),
    );
    if (inVoice) {
      const headset = headsetActor(width + 4, 5, 0);
      plate.addChild(headset);
    }
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
    const rest = buttonCaptionPos('Leave Table', box.w, box.h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Leave Table', BUTTON_FONT_SIZE, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
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
    if (
      this.howToPlay.isOpen ||
      this.tableChat.isOpen ||
      this.tableId.length === 0 ||
      this.watchingWithoutSeat()
    ) {
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
        const driver = this.driverFor(this.lastRow?.gameType);
        if (driver) {
          driver.intentRejected?.(intent, this.driverContext());
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
    const viewer = this.placed.find((seat) => seat.self)?.seatIndex ?? null;
    const message = eventMessage(
      this.gameTypeOfTable(),
      stored.note,
      (seatIndex) => names.get(seatIndex) ?? `Seat ${seatIndex + 1}`,
      viewer,
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
    this.startButton?.kill();
    this.startButton = undefined;
    const seats = [...this.connection.db.gameSeat.iter()]
      .filter((s) => s.tableId === row.id)
      .sort((a, b) =>
        a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch
          ? -1
          : a.joinedAt.microsSinceUnixEpoch > b.joinedAt.microsSinceUnixEpoch
            ? 1
            : a.id.localeCompare(b.id),
      );
    let waiting = false;
    try {
      waiting = JSON.parse(row.stateJson).phase === 'lobby';
    } catch {
      /* invalid state is shown by the driver */
    }
    if (waiting && seats[0]?.lobbyMemberId === this.lobbyMemberId) {
      const actor = new ex.Actor({
        pos: ex.vec(380, 310),
        anchor: ex.vec(0, 0),
        width: 200,
        height: 40,
        z: 20,
      });
      actor.graphics.use(panelRect(200, 40, BUTTON, STROKE));
      const caption = new ex.Actor({
        pos: ex.vec(20, 14),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(canvasText('Start game', BUTTON_FONT_SIZE, GOLD));
      actor.addChild(caption);
      actor.on('pointerup', () =>
        this.sendPayload(JSON.stringify({ type: 'start_game' }), {
          type: 'start_game',
        }),
      );
      this.add(actor);
      this.startButton = actor;
    }
    if (row.gameType === this.bluffDriver.gameType) {
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintBluff(row.stateJson);
      return;
    }
    if (row.gameType === this.presidentDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintPresident(row.stateJson);
      return;
    }
    if (row.gameType === this.goFishDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintGoFish(row.stateJson);
      return;
    }
    if (row.gameType === this.crazyEightsDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintCrazyEights(row.stateJson);
      return;
    }
    if (row.gameType === this.rummyDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintRummy(row.stateJson);
      return;
    }
    if (row.gameType === this.blackjackDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintBlackjack(row.stateJson);
      return;
    }
    if (row.gameType === this.spadesDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintSpades(row.stateJson);
      return;
    }
    if (row.gameType === this.heartsDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.pokerDriver.destroy(this.driverContext());
      this.paintHearts(row.stateJson);
      return;
    }
    if (row.gameType === this.pokerDriver.gameType) {
      this.bluffDriver.destroy(this.driverContext());
      this.presidentDriver.destroy(this.driverContext());
      this.goFishDriver.destroy(this.driverContext());
      this.crazyEightsDriver.destroy(this.driverContext());
      this.rummyDriver.destroy(this.driverContext());
      this.blackjackDriver.destroy(this.driverContext());
      this.spadesDriver.destroy(this.driverContext());
      this.heartsDriver.destroy(this.driverContext());
      this.paintPoker(row.stateJson);
      return;
    }
    this.bluffDriver.destroy(this.driverContext());
    this.presidentDriver.destroy(this.driverContext());
    this.goFishDriver.destroy(this.driverContext());
    this.crazyEightsDriver.destroy(this.driverContext());
    this.rummyDriver.destroy(this.driverContext());
    this.blackjackDriver.destroy(this.driverContext());
    this.spadesDriver.destroy(this.driverContext());
    this.heartsDriver.destroy(this.driverContext());
    this.pokerDriver.destroy(this.driverContext());
    this.placeHud(false);
    this.paintCounter(row.gameType, row.stateJson);
  }

  private driverFor(
    gameType: string | undefined,
  ):
    | GameDriver<BluffState>
    | GameDriver<PresidentState>
    | GameDriver<GoFishState>
    | GameDriver<CrazyEightsState>
    | GameDriver<RummyState>
    | GameDriver<BlackjackState>
    | GameDriver<SpadesState>
    | GameDriver<HeartsState>
    | GameDriver<PokerState>
    | null {
    if (gameType === this.bluffDriver.gameType) {
      return this.bluffDriver;
    }
    if (gameType === this.presidentDriver.gameType) {
      return this.presidentDriver;
    }
    if (gameType === this.goFishDriver.gameType) {
      return this.goFishDriver;
    }
    if (gameType === this.crazyEightsDriver.gameType) {
      return this.crazyEightsDriver;
    }
    if (gameType === this.rummyDriver.gameType) {
      return this.rummyDriver;
    }
    if (gameType === this.blackjackDriver.gameType) {
      return this.blackjackDriver;
    }
    if (gameType === this.spadesDriver.gameType) {
      return this.spadesDriver;
    }
    if (gameType === this.heartsDriver.gameType) {
      return this.heartsDriver;
    }
    if (gameType === this.pokerDriver.gameType) {
      return this.pokerDriver;
    }
    return null;
  }

  private paintBluff(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: BluffState;
    try {
      state = readBluffState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.bluffDriver.render(state, this.driverContext());
    this.paintHud(bluffStatusHud(state, this.placed));
  }

  private paintPresident(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: PresidentState;
    try {
      state = readPresidentState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.presidentDriver.render(state, this.driverContext());
    this.paintHud(presidentStatusHud(state, this.placed));
  }

  private paintGoFish(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: GoFishState;
    try {
      state = readGoFishState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.goFishDriver.render(state, this.driverContext());
    this.paintHud(goFishStatusHud(state, this.placed));
  }

  private paintCrazyEights(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: CrazyEightsState;
    try {
      state = readCrazyEightsState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.crazyEightsDriver.render(state, this.driverContext());
    this.paintHud(crazyEightsStatusHud(state, this.placed));
  }

  private paintRummy(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: RummyState;
    try {
      state = readRummyState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.rummyDriver.render(state, this.driverContext());
    this.paintHud(rummyStatusHud(state, this.placed));
  }

  private paintBlackjack(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: BlackjackState;
    try {
      state = readBlackjackState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.blackjackDriver.render(state, this.driverContext());
    this.paintHud(blackjackStatusHud(state, this.placed));
  }

  private paintSpades(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: SpadesState;
    try {
      state = readSpadesState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.spadesDriver.render(state, this.driverContext());
    this.paintHud(spadesStatusHud(state, this.placed));
  }

  private paintHearts(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: HeartsState;
    try {
      state = readHeartsState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.heartsDriver.render(state, this.driverContext());
    this.paintHud(heartsStatusHud(state, this.placed));
  }

  private paintPoker(stateJson: string): void {
    this.dummy = false;
    this.placeCounter(false);
    let state: PokerState;
    try {
      state = readPokerState(JSON.parse(stateJson));
    } catch (error: unknown) {
      this.showError(
        error instanceof Error ? error.message : 'Invalid table state',
      );
      return;
    }
    this.errorText.text = '';
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.pokerDriver.render(state, this.driverContext());
    this.paintHud(pokerStatusHud(state, this.placed));
  }

  private paintHud(lines: StatusHudLines): void {
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
    const mine = personalCardAtlas();
    return {
      scene: this,
      seats: this.placed,
      meSeatIndex,
      cards: mine,
      myCards: mine,
      sendIntent: (intent) => {
        this.sendPayload(JSON.stringify(intent), intent);
      },
      inputBlocked: () => this.howToPlay.isOpen || this.tableChat.isOpen,
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

  private watchingWithoutSeat(): boolean {
    return (
      spectatingLine(
        this.placed.some((seat) => seat.self),
        memberIsWatching(
          readSpectators(this.connection),
          this.tableId,
          this.lobbyMemberId,
        ),
      ) === 'Spectating'
    );
  }

  private leave(): void {
    if (
      this.leaving ||
      this.howToPlay.isOpen ||
      this.tableChat.isOpen ||
      this.tableId.length === 0
    ) {
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

function readSpectators(
  connection: DbConnection,
): Array<{ tableId: string; lobbyMemberId: string }> {
  const rows: Array<{ tableId: string; lobbyMemberId: string }> = [];
  for (const row of connection.db.spectator.iter()) {
    rows.push({
      tableId: row.tableId,
      lobbyMemberId: row.lobbyMemberId,
    });
  }
  return rows;
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

function readSpeaking(connection: DbConnection): SpeakingRow[] {
  const rows: SpeakingRow[] = [];
  for (const row of connection.db.speakingState.iter()) {
    rows.push({
      lobbyId: row.lobbyId,
      tableId: row.tableId,
      lobbyMemberId: row.lobbyMemberId,
      isSpeaking: row.isSpeaking,
    });
  }
  return rows;
}

function readPresence(connection: DbConnection): PresenceRef[] {
  const rows: PresenceRef[] = [];
  for (const row of connection.db.voicePresence.iter()) {
    rows.push({
      lobbyId: row.lobbyId,
      tableId: row.tableId,
      lobbyMemberId: row.lobbyMemberId,
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
