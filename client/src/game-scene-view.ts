import { casinoTableBackdrop } from './casino-art';
import {
  DEFAULT_AVATAR,
  readCasinoAvatar,
} from '../../src/shared/casino-avatar';
import { localCasinoAvatar } from './casino-profile';
import * as ex from 'excalibur';
import { LoadingScreen } from './loading-screen';
import {
  casinoGame,
  coinUnits,
  formatCoins,
  type TableEconomy,
} from '../../src/shared/economy';
import {
  readBlackjackState,
  type BlackjackState,
} from '../../src/shared/games/blackjack';
import { readBluffState, type BluffState } from '../../src/shared/games/bluff';
import {
  readCrazyEightsState,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights';
import {
  DUMMY_INCREMENT,
  type DummyIntent,
} from '../../src/shared/games/dummy-counter';
import {
  readGoFishState,
  type GoFishState,
} from '../../src/shared/games/go-fish';
import {
  readHeartsState,
  type HeartsState,
} from '../../src/shared/games/hearts';
import { readPokerState, type PokerState } from '../../src/shared/games/poker';
import {
  readPresidentState,
  type PresidentState,
} from '../../src/shared/games/president';
import { readRummyState, type RummyState } from '../../src/shared/games/rummy';
import {
  readSpadesState,
  type SpadesState,
} from '../../src/shared/games/spades';
import { BlackjackDriver } from './blackjack-driver';
import { BluffDriver } from './bluff-driver';
import { personalCardAtlas, tableSprites } from './boot-scene';
import { bindButtonPress } from './button-press';
import { BUTTON_PRESS_SHIFT } from './button-style';
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
import { tableScenePaint } from './client-look';
import { lifetimeWinningsCaption } from './lifetime-winnings';
import { coinDialog, coinDialogOpen } from './coin-dialog';
import { CrazyEightsDriver } from './crazy-eights-driver';
import { eventMessage, readStoredEvent } from './event-messages';
import type { GameDriver, RenderContext } from './game-driver';
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
import { GoFishDriver } from './go-fish-driver';
import { HeartsDriver } from './hearts-driver';
import { HowToPlayOverlay } from './how-to-play-overlay';
import { refreshCanvasTextFields } from './html-field';
import { isMobileDevice } from './mobile-shell';
import type { DbConnection, SubscriptionHandle } from './module_bindings';
import { PokerDriver } from './poker-driver';
import { PresidentDriver } from './president-driver';
import { PrizePoolBadge } from './prize-pool-badge';
import { entryFeePrizePool } from './prize-pool';
import { RummyDriver } from './rummy-driver';
import { finishedPrizeMessage, settledSeats } from './settled-seats';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TABLE_HEIGHT,
  TABLE_SCALE,
  TABLE_WIDTH,
} from './sheets';
import { SpadesDriver } from './spades-driver';
import { SpeakingFader, tableSpeakers, type SpeakingRow } from './speaking';
import { seatGlow, speechBubble } from './speaking-view';
import { STATUS_FONT_SIZE, STATUS_HUD, STATUS_LINE_HEIGHT } from './status-hud';
import { type TableStyle } from './table-atlas';
import { TableChatOverlay } from './table-chat-overlay';
import { tableNoticeLayout } from './table-notice';
import { opponentNameAnchor, seatPlateWidth } from './table-presentation';
import { anchorTableActor } from './table-viewport';
import { uiCaption, uiText } from './ui-text';
import { CLASSIC, isClassicGame } from './classic-table-design';
import { tableGutter } from './table-viewport';
import {
  headsetActor,
  tableVoiceMemberIds,
  type PresenceRef,
} from './voice-presence';

const WARN_PLATE = ex.Color.fromHex('#4a1713');
const STRIP_HOLD_MS = 3200;
const STRIP_FADE_MS = 500;

export class GameScene extends ex.Scene {
  private economyText?: ex.Text;
  private topUpActor?: ex.Actor;
  private economySecond = -1;
  private tableId = '';
  private lobbyMemberId = '';
  private ready = false;
  private leaving = false;
  private seatActors: ex.Actor[] = [];
  private linkLine = '';
  private linkText = canvasText('', 8, GOLD);
  private linkActor: ex.Actor | undefined;
  private active = false;
  private readonly loading = new LoadingScreen(this);
  private waiting = false;
  private starting = false;
  private dealActors: ex.Actor[] = [];
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
  private lastRow: {
    id: string;
    gameType: string;
    stateJson: string;
    name: string;
    minPlayers: number;
    maxPlayers: number;
    waiting: boolean;
    hostMemberId?: string;
    startsAt?: bigint;
  } | null = null;
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
  private winningsText!: ex.Text;
  private winningsLine = lifetimeWinningsCaption();
  private tableActor: ex.Actor | undefined;
  private leaveControl?: ex.Actor;
  private winningsActor?: ex.Actor;
  private readonly prizeBadge = new PrizePoolBadge();

  get usesClassicLayout(): boolean {
    return (
      !!this.lastRow &&
      isClassicGame(this.lastRow.gameType) &&
      !this.lastRow.waiting
    );
  }

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
      anchorTableActor(this.linkActor, 'left', 16);
    }
  }

  setLifetimeWinnings(line: string): void {
    this.winningsLine = line;
    if (this.winningsText) {
      this.winningsText.text = line;
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
    this.loading.show('Loading table');
    this.applyStoredLook();
    this.tableId = tableId;
    this.lobbyMemberId = lobbyMemberId;
    this.leaving = false;
    this.lastRow = null;
    this.waiting = false;
    this.starting = false;
    this.clearOpeningDeal();
    this.clearStrip();
    this.shownEvents.clear();
    if (this.ready) {
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
    this.economyText = canvasText('', isMobileDevice() ? 12 : 8, GOLD);
    const economy = new ex.Actor({
      pos: ex.vec(16, 146),
      anchor: ex.vec(0, 0),
      z: 22,
    });
    economy.graphics.use(this.economyText);
    anchorTableActor(economy, 'left');
    this.add(economy);
    const topUp = new ex.Actor({
      pos: ex.vec(16, -2000),
      anchor: ex.vec(0, 0),
      width: 120,
      height: 30,
      z: 22,
    });
    topUp.graphics.use(panelRect(120, 30, ex.Color.fromHex('#1b5c38'), STROKE));
    const caption = new ex.Actor({ pos: ex.vec(28, 10), anchor: ex.vec(0, 0) });
    caption.graphics.use(canvasText('Top up', 8, GOLD));
    topUp.addChild(caption);
    bindButtonPress(
      topUp,
      () => {},
      () => {},
      () => void this.topUp(),
    );
    anchorTableActor(topUp, 'left');
    this.add(topUp);
    this.topUpActor = topUp;
    this.applyStoredLook();

    const trim = new ex.Actor({ x: -240, y: 0, anchor: ex.vec(0, 0), z: -1 });
    trim.graphics.use(casinoTableBackdrop());
    this.add(trim);
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

    this.spectatingText = canvasText('', isMobileDevice() ? 12 : 8, DIM);
    const spectating = new ex.Actor({
      pos: ex.vec(16, isMobileDevice() ? 86 : 50),
      anchor: ex.vec(0, 0),
      z: 8,
    });
    spectating.graphics.use(this.spectatingText);
    this.add(spectating);

    this.linkText.text = this.linkLine;
    this.linkActor = new ex.Actor({
      pos: ex.vec(16, 4),
      anchor: ex.vec(0, 0),
      z: 30,
    });
    this.linkActor.graphics.use(this.linkText);
    anchorTableActor(this.linkActor, 'left');
    this.add(this.linkActor);

    this.winningsText = uiText(this.winningsLine, 15, GOLD);
    const winnings = new ex.Actor({
      pos: ex.vec(isMobileDevice() ? 256 : 280, 22),
      anchor: ex.vec(0, 0),
      z: 21,
    });
    winnings.graphics.use(this.winningsText);
    this.winningsActor = winnings;
    anchorTableActor(winnings, 'left');
    this.add(winnings);

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
    this.add(this.prizeBadge);
    this.watchRows();
    this.ready = true;
  }

  onActivate(): void {
    this.active = true;
    this.input.keyboard.on('press', this.onKeyPress);
    this.input.pointers.on('wheel', this.onWheel);
    this.bindTable();
    refreshCanvasTextFields();
  }

  onDeactivate(): void {
    this.active = false;
    this.waiting = false;
    this.clearOpeningDeal();
    this.input.keyboard.off('press', this.onKeyPress);
    this.input.pointers.off('wheel', this.onWheel);
    this.howToPlay.close();
    this.tableChat.close();
    refreshCanvasTextFields();
    this.endSubscription();
  }

  onPreUpdate(): void {
    this.placeTablePresentation();
    const second = Math.floor(Date.now() / 1000);
    if (second === this.economySecond || !this.active) return;
    this.economySecond = second;
    if (this.lastRow?.waiting) this.readSubscribedState();
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === this.tableId,
    );
    const funding = [...this.connection.db.tableFunding.iter()].find(
      (row) =>
        row.tableId === this.tableId && row.walletId === this.lobbyMemberId,
    );
    if (table && isClassicGame(table.gameType)) {
      if (this.economyText) this.economyText.text = '';
      if (this.topUpActor) this.topUpActor.pos.y = -2000;
      return;
    }
    const countdown =
      table?.startsAt === undefined
        ? ''
        : `Starts in ${Math.max(0, Math.ceil((Number(table.startsAt / 1000n) - Date.now()) / 1000))}s`;
    const mine = this.placed.find((seat) => seat.self);
    const chips =
      table?.gameType === 'blackjack' && mine
        ? JSON.parse(table.stateJson).seats[String(mine.seatIndex)]?.chips
        : undefined;
    if (this.economyText)
      this.economyText.text =
        chips === undefined
          ? countdown
          : `Stack\n\n${formatCoins(coinUnits(chips))}\n\n${countdown}`;
    const phase = table && JSON.parse(table.stateJson).phase;
    const closed =
      table?.gameType === 'poker' && table.status.tag === 'Finished';
    const paused = !closed && (phase === 'finished' || phase === 'lobby');
    if (this.topUpActor)
      this.topUpActor.pos.y =
        table && funding && casinoGame(table.gameType) && paused ? 234 : -2000;
  }

  private placeTablePresentation(): void {
    if (!this.tableActor) return;
    const classic = this.usesClassicLayout;
    this.tableActor.pos = ex.vec(
      480,
      classic ? CLASSIC.feltBox.y + CLASSIC.feltBox.h / 2 : 278,
    );
    const sprite = this.tableActor.graphics.current;
    if (sprite)
      sprite.scale = classic
        ? ex.vec(
            (CLASSIC.feltBox.w + 2 * tableGutter()) / TABLE_WIDTH,
            CLASSIC.feltBox.h / TABLE_HEIGHT,
          )
        : ex.vec(TABLE_SCALE, TABLE_SCALE);
    if (this.leaveControl) {
      this.leaveControl.graphics.isVisible = !classic;
      for (const child of this.leaveControl.children)
        if (child instanceof ex.Actor) {
          child.graphics.isVisible = !classic;
          child.pointer.useGraphicsBounds = !classic;
          child.pointer.useColliderShape = !classic;
        }
      this.leaveControl.pointer.useColliderShape = !classic;
      this.leaveControl.pointer.useGraphicsBounds = !classic;
    }
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === this.tableId,
    );
    const prizePool = table
      ? entryFeePrizePool(
          table,
          this.connection.db.tableFunding.iter(),
          this.connection.db.gameSettlement.iter(),
        )
      : undefined;
    this.prizeBadge.setAmount(prizePool);
    if (this.winningsActor) {
      this.winningsActor.pos.y = classic ? 61 : 22;
      anchorTableActor(
        this.winningsActor,
        'left',
        classic ? 16 : isMobileDevice() ? 256 : 280,
      );
    }
    // Keep fallback HUD geometry separate from the scene-owned prize badge.
    anchorTableActor(
      this.hudPlate,
      'right',
      prizePool === undefined ? STATUS_HUD.x : 384,
    );
    this.tableChat?.setTriggerVisible(!classic);
    this.howToPlay?.setTriggerVisible(!classic);
  }

  private async topUp(): Promise<void> {
    if (coinDialogOpen(this)) return;
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === this.tableId,
    );
    const funding = [...this.connection.db.tableFunding.iter()].find(
      (row) =>
        row.tableId === this.tableId && row.walletId === this.lobbyMemberId,
    );
    if (!table?.economyJson || !funding) return;
    if (table.gameType === 'poker' && table.status.tag === 'Finished') return;
    this.howToPlay.close();
    this.tableChat.close();
    const settings = JSON.parse(table.economyJson) as TableEconomy;
    const current = Number(funding.units) / 2;
    const wallet = [...this.connection.db.roomWallet.iter()].find(
      (row) => row.id === this.lobbyMemberId,
    );
    const selected = await coinDialog(
      this.engine,
      this,
      'Top up',
      `Stack ${current}. Limit ${settings.maxBuyIn}. Available ${wallet ? formatCoins(wallet.available) : '—'} chips.`,
      [
        {
          key: 'amount',
          label: 'Additional chips',
          value: Math.max(1, Math.ceil(settings.minBuyIn - current)),
        },
      ],
      'Add chips',
    );
    if (!selected) return;
    try {
      await this.connection.reducers.topUpTable({
        tableId: this.tableId,
        amount: selected.amount,
      });
    } catch (error) {
      this.showError(
        error instanceof Error ? error.message : 'Could not top up',
      );
    }
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
    this.connection.db.gameSettlement.onInsert(() => this.paintSeats());
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
    this.connection.db.speakingState.onInsert((_ctx, row) => {
      if (this.active && row.tableId === this.tableId) {
        this.refreshSpeaking();
        this.paintGame();
      }
    });
    this.connection.db.speakingState.onUpdate((_ctx, _previous, row) => {
      if (this.active && row.tableId === this.tableId) {
        this.refreshSpeaking();
        this.paintGame();
      }
    });
    this.connection.db.speakingState.onDelete((_ctx, row) => {
      if (this.active && row.tableId === this.tableId) {
        this.refreshSpeaking();
        this.paintGame();
      }
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
    this.connection.db.casinoPresence.onUpdate((_ctx, previous, row) => {
      if (
        this.active &&
        previous.avatar !== row.avatar &&
        this.placed.some((seat) => seat.lobbyMemberId === row.id)
      )
        this.paintGame();
    });
    this.connection.db.myCasinoTableChat.onInsert(() =>
      this.tableChat.refresh(),
    );
    this.connection.db.myCasinoTableChat.onUpdate(() =>
      this.tableChat.refresh(),
    );
    this.connection.db.myCasinoTableChat.onDelete(() =>
      this.tableChat.refresh(),
    );
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
      this.loading.hide();
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
          this.loading.hide();
        }
      })
      .onError((ctx) => {
        const detail =
          ctx.event instanceof Error
            ? ctx.event.message
            : 'Could not subscribe';
        if (this.subscribedTableId === tableId) {
          this.loading.hide();
          this.showError(detail);
        }
      })
      .subscribe([...queries, 'SELECT * FROM my_casino_table_chat']);
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
    let labels = seatLabels(
      readSeats(this.connection),
      readMembers(this.connection),
      this.tableId,
      this.clientId,
      tableVoiceMemberIds(readPresence(this.connection), this.tableId),
    );
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === this.tableId,
    );
    if (table && JSON.parse(table.stateJson).phase === 'finished') {
      const snapshot = settledSeats(
        this.connection.db.gameSettlement.iter(),
        this.tableId,
        table.handNumber,
        this.lobbyMemberId,
      );
      if (snapshot.length) labels = snapshot;
    }
    const placed = placeSeats(labels);
    this.placed = placed;
    this.waitingText.text = placed.length === 0 ? 'Waiting for seats' : '';
    this.spectatingText.text = this.usesClassicLayout
      ? ''
      : spectatingLine(
          placed.some((seat) => seat.self),
          memberIsWatching(
            readSpectators(this.connection),
            this.tableId,
            this.lobbyMemberId,
          ),
        );
    for (const seat of placed) {
      if (table && isClassicGame(table.gameType)) continue;
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
    const text = uiText(name, 18, self ? SELF : GOLD);
    const width = Math.max(seatPlateWidth(name), Math.ceil(text.width) + 16);
    const caption = uiCaption(name, width, 20, 18);
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
    const label = new ex.Actor({
      pos: ex.vec(caption.x, caption.y),
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
    const size = 20;
    const rest = uiCaption('Leave Table', box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(uiText('Leave Table', size, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.strokeColor = STROKE;
        face.color = BUTTON;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      () => this.leave(),
    );
    anchorTableActor(actor, 'left');
    this.add(actor);
    this.leaveControl = actor;
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
      coinDialogOpen(this) ||
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

  /** Keep the latest accepted action visible; only warnings fade away. */
  private showStrip(message: string, warning: boolean): void {
    this.clearStrip();
    const gameType = this.gameTypeOfTable();
    const classic = isClassicGame(gameType);
    if (classic && !warning) {
      this.driverFor(gameType)?.setAnnouncement?.(message);
      return;
    }
    const layout = tableNoticeLayout(
      message,
      isMobileDevice(),
      warning,
      classic,
      classic ? (text, size) => uiText(text, size, GOLD).width : undefined,
      gameType === 'poker' ? 388 : gameType === 'blackjack' ? 260 : 184,
    );
    const strip = new ex.Actor({
      name: 'table-notice',
      pos: ex.vec(layout.x, layout.y),
      anchor: ex.vec(0, 0),
      width: layout.w,
      height: layout.h,
      z: warning ? 90 : 26,
    });
    strip.graphics.use(
      panelRect(
        layout.w,
        layout.h,
        warning ? WARN_PLATE : PLATE,
        warning ? DANGER : STROKE_HOT,
      ),
    );
    for (const [index, line] of layout.lines.entries()) {
      const caption = new ex.Actor({
        pos: ex.vec(
          12,
          (classic
            ? Math.floor(
                (layout.h - layout.lines.length * layout.lineHeight) / 2,
              )
            : 6) +
            index * layout.lineHeight,
        ),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(
        classic
          ? uiText(line, layout.size, warning ? DANGER : GOLD)
          : canvasText(line, layout.size, warning ? DANGER : GOLD),
      );
      strip.addChild(caption);
    }
    if (classic && warning) {
      anchorTableActor(strip, 'right', layout.x);
      strip.collider.useBoxCollider(layout.w, layout.h, ex.vec(0, 0));
      strip.on('pointerdown', (event) => event.cancel());
      strip.on('pointerup', (event) => event.cancel());
    }
    if (warning || !classic)
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
    name: string;
    minPlayers: number;
    maxPlayers: number;
    hostMemberId?: string;
    startsAt?: bigint;
  }): void {
    if (!this.ready || !this.active || row.id !== this.tableId) {
      return;
    }
    let waiting = false;
    try {
      const state = JSON.parse(row.stateJson);
      waiting = state.phase === 'lobby';
      if (
        row.gameType === 'poker' &&
        this.lastRow?.gameType === 'poker' &&
        JSON.parse(this.lastRow.stateJson).handNumber !== state.handNumber
      )
        this.clearStrip();
    } catch {
      // Invalid state is reported by the game driver.
    }
    this.lastRow = { ...row, waiting };
    this.howToPlay.setGameType(row.gameType);
    this.paintSeats();
  }

  private startWaitingGame(): void {
    if (!this.waiting || this.starting) return;
    this.starting = true;
    const tableId = this.tableId;
    void this.connection.reducers
      .handleGameIntent({
        tableId,
        clientId: this.clientId,
        intentPayload: JSON.stringify({ type: 'start_game' }),
      })
      .catch((error: unknown) => {
        if (this.tableId === tableId) {
          this.tableChat.showError(
            error instanceof Error ? error.message : 'Could not start the game',
          );
        }
      })
      .finally(() => {
        if (this.tableId === tableId) this.starting = false;
      });
  }

  private clearOpeningDeal(): void {
    for (const actor of this.dealActors) actor.kill();
    this.dealActors = [];
  }

  private playOpeningDeal(): boolean {
    if (
      this.placed.length === 0 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return false;
    }
    this.waitingText.text = 'Dealing cards...';
    this.placeHud(false);
    const origin = ex.vec(480, 256);
    const targets = [...this.placed];
    const back = personalCardAtlas().back();
    const cards: ex.Actor[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (const _seat of targets) {
        const card = new ex.Actor({ pos: origin.clone(), z: 60 });
        card.graphics.use(back.clone());
        card.graphics.opacity = 0;
        card.pointer.useGraphicsBounds = false;
        card.pointer.useColliderShape = false;
        this.add(card);
        cards.push(card);
      }
    }
    this.dealActors = cards;
    let elapsed = 0;
    const stagger = Math.min(70, 520 / cards.length);
    cards[0].on('postupdate', (event) => {
      elapsed += event.elapsed;
      for (const [index, card] of cards.entries()) {
        const progress = Math.max(
          0,
          Math.min(1, (elapsed - index * stagger) / 250),
        );
        const seat = targets[index % targets.length];
        const eased = 1 - (1 - progress) ** 2;
        card.graphics.opacity = progress > 0 && progress < 1 ? 1 : 0;
        card.pos = ex.vec(
          origin.x + (seat.x - origin.x) * eased,
          origin.y + (seat.y - origin.y) * eased,
        );
      }
      if (elapsed >= (cards.length - 1) * stagger + 250) {
        this.clearOpeningDeal();
        this.paintGame();
      }
    });
    return true;
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
    if (
      !this.ready ||
      !this.active ||
      !row ||
      row.id !== this.tableId ||
      this.dealActors.length > 0
    ) {
      return;
    }
    const beganPlaying = this.waiting && !row.waiting;
    this.waiting = row.waiting;
    if (row.waiting) {
      const seats = [...this.connection.db.gameSeat.iter()]
        .filter((seat) => seat.tableId === row.id)
        .sort((a, b) => {
          const first = a.joinedAt.microsSinceUnixEpoch;
          const second = b.joinedAt.microsSinceUnixEpoch;
          return first === second
            ? a.id.localeCompare(b.id)
            : first < second
              ? -1
              : 1;
        });
      const seatedHere = seats.some(
        (seat) => seat.lobbyMemberId === this.lobbyMemberId,
      );
      this.tableChat.setWaiting({
        participation: seatedHere
          ? 'seated'
          : memberIsWatching(
                readSpectators(this.connection),
                this.tableId,
                this.lobbyMemberId,
              )
            ? 'watching'
            : 'released',
        name: row.name,
        startsAt: row.startsAt,
        seated: seats.length,
        capacity: row.maxPlayers,
        minimum: row.minPlayers,
        start:
          seatedHere && row.hostMemberId === this.lobbyMemberId
            ? () => this.startWaitingGame()
            : undefined,
        leave: () => this.leave(true),
      });
    } else {
      this.tableChat.setWaiting(undefined);
      if (beganPlaying && this.playOpeningDeal()) return;
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.bluffDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.presidentDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.goFishDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.crazyEightsDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.rummyDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.blackjackDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.spadesDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.heartsDriver.render(state, this.driverContext());
    this.placeHud(false);
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
    this.waitingText.text =
      state.phase === 'lobby' ? 'Waiting for host to start' : '';
    this.pokerDriver.render(state, this.driverContext());
    this.placeHud(false);
  }

  private placeHud(visible: boolean): void {
    this.hudPlate.pos = visible
      ? ex.vec(STATUS_HUD.x, STATUS_HUD.y)
      : ex.vec(STATUS_HUD.x, -200);
    anchorTableActor(this.hudPlate, 'right', STATUS_HUD.x);
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
    this.hudTurn = canvasText('', STATUS_FONT_SIZE, SELF);
    this.hudPhase = canvasText('', STATUS_FONT_SIZE, GOLD);
    this.hudRound = canvasText('', STATUS_FONT_SIZE, DIM);
    const rows = [this.hudTurn, this.hudPhase, this.hudRound];
    for (let index = 0; index < rows.length; index += 1) {
      const row = new ex.Actor({
        pos: ex.vec(10, 8 + index * STATUS_LINE_HEIGHT),
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
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === this.tableId,
    );
    const finishedMessage = table
      ? finishedPrizeMessage(
          this.connection.db.gameSettlement.iter(),
          this.tableId,
          table.handNumber,
        )
      : undefined;
    const funding = [...this.connection.db.tableFunding.iter()].find(
      (row) =>
        row.tableId === this.tableId && row.walletId === this.lobbyMemberId,
    );
    const phase = table ? JSON.parse(table.stateJson).phase : '';
    return {
      scene: this,
      seats: this.placed.map((seat) => {
        const db = this.connection.db;
        const presence = [...db.casinoPresence.iter()].find(
          (row) => row.id === seat.lobbyMemberId,
        );
        const verified = [...db.casinoDiscordMember.iter()].some(
          (row) => row.id === seat.lobbyMemberId,
        );
        const inVoice = [...db.voicePresence.iter()].some(
          (row) =>
            row.tableId === this.tableId &&
            row.lobbyMemberId === seat.lobbyMemberId,
        );
        return {
          ...seat,
          avatar:
            readCasinoAvatar(presence?.avatar ?? '') ??
            (seat.self ? localCasinoAvatar() : DEFAULT_AVATAR),
          speaking:
            !!verified && inVoice && this.speaking.has(seat.lobbyMemberId),
        };
      }),
      meSeatIndex,
      finishedMessage,
      tableName: table?.name,
      prizePool: table
        ? entryFeePrizePool(
            table,
            this.connection.db.tableFunding.iter(),
            this.connection.db.gameSettlement.iter(),
          )
        : undefined,
      navigation: {
        leave: () => this.leave(),
        chat: () => this.tableChat.toggle(),
        help: () => this.howToPlay.toggle(),
        chatAvailable: this.tableChat?.available ?? false,
      },
      houseGame:
        table?.gameType === 'blackjack'
          ? {
              nextHandAt:
                table.startsAt === undefined
                  ? undefined
                  : Number(table.startsAt / 1000n),
              topUp:
                funding && (phase === 'finished' || phase === 'lobby')
                  ? () => void this.topUp()
                  : undefined,
            }
          : undefined,
      cashGame:
        table?.gameType === 'poker'
          ? {
              topUp:
                funding &&
                table.status.tag !== 'Finished' &&
                (phase === 'finished' || phase === 'lobby')
                  ? () => void this.topUp()
                  : undefined,
              closed: table.status.tag === 'Finished',
              nextHandAt:
                table.startsAt === undefined
                  ? undefined
                  : Number(table.startsAt / 1000n),
            }
          : undefined,
      cards: mine,
      myCards: mine,
      sendIntent: (intent) => {
        this.sendPayload(JSON.stringify(intent), intent);
      },
      inputBlocked: () =>
        this.howToPlay.isOpen || this.tableChat.isOpen || coinDialogOpen(this),
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
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
      },
      () => {
        face.strokeColor = STROKE;
        face.color = PLATE;
      },
      () => this.sendIntent({ type: DUMMY_INCREMENT }),
    );
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

  private leave(fromWaiting = false): void {
    if (
      this.leaving ||
      coinDialogOpen(this) ||
      this.howToPlay.isOpen ||
      (this.tableChat.isOpen && !fromWaiting) ||
      this.tableId.length === 0
    ) {
      return;
    }
    this.leaving = true;
    const tableId = this.tableId;
    const lobbyMemberId = this.lobbyMemberId;
    void this.connection.reducers
      .leaveTable({ tableId, lobbyMemberId })
      .then(() => {
        this.onLeft();
      })
      .catch((error: unknown) => {
        this.leaving = false;
        const message =
          error instanceof Error ? error.message : 'Could not leave';
        if (/^(Not seated|Table not found)$/.test(message)) {
          this.onLeft();
          return;
        }
        if (fromWaiting) this.tableChat.showError(message);
        else this.showError(message);
      });
  }

  private showError(message: string): void {
    if (!this.ready) {
      return;
    }
    this.showStrip(message, true);
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
