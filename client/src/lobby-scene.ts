import {
  stakeFieldUpdates,
  validateStakeForm,
  validateBuyIn,
} from './stake-form';
import {
  casinoGame,
  formatCoins,
  tableEconomy,
  type TableEconomy,
} from '../../src/shared/economy';
import {
  leaderboardRows,
  clampLeaderboardOffset,
  leaderboardScrollThumb,
} from './leaderboard';
import { coinDialog, type CoinField } from './coin-dialog';
import {
  anchorLobbyActor,
  enableLobbyViewport,
  lobbyFieldGeometry,
  stretchLobbyActor,
} from './lobby-viewport';
import { anchorTableActor, tableGutter } from './table-viewport';
import * as ex from 'excalibur';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import { pixelFont } from './boot-scene';
import { statsCaption } from './client-stats';
import { subscribeLobbyTables } from './connect';
import { joinFailureMessage } from './join-errors';
import { showLobbyUrl, tableCodeForId } from './join-path';
import { tableToReopen } from './last-room';
import { roomComposer } from './room-composer';
import { wrapText } from './menu-layout';
import {
  bindCanvasTextField,
  eventTargetsHtmlField,
  fieldLabelColumns,
  layoutFieldCaret,
  refreshCanvasTextFields,
  type CanvasTextFieldHandle,
  type FieldLabel,
} from './html-field';
import {
  CHAT_OTHER_SENDER,
  CHAT_SEND,
  CHAT_SEND_DOWN,
  CHAT_SYSTEM_MESSAGE,
  makeFieldCaret,
  SELF,
  showFieldCaret,
} from './canvas-ui';
import { wrapChatLines } from './chat-layout';
import {
  applyChatKey,
  applyChatText,
  CHAT_BODY_MAX,
  CHAT_PANEL,
  CHAT_TOGGLE,
  REFILL_CHIPS_BUTTON,
  LEAVE_CONFIRM,
  LEAVE_ROOM,
  leaveConfirmHit,
  chatLines,
  clampPlayerCount,
  CREATE_TABLE as DESKTOP_CREATE_TABLE,
  MOBILE_CREATE_TABLE,
  discordBadgeBox,
  DISCORD_BADGE,
  gameOption,
  lobbyLaunchedFromDiscord,
  normalizeChatBody,
  POKER_GAME_TYPE,
  POKER_VARIATION_LABELS,
  POKER_VARIATIONS,
  memberByClient,
  listLayout,
  nextTableName,
  ROOM_BANNER,
  seatedTableIds,
  tableGroups,
  tableLines,
  tableSettingsJson,
  TABLE_LIST,
  WATCH_BUTTON,
  MOBILE_WATCH_BUTTON,
  JOIN_BUTTON,
  MOBILE_JOIN_BUTTON,
  watchingTableIds,
  type ChatMessageRow,
  type ListSlot,
  type MemberRecord,
  type SeatRef,
  type TableRow,
} from './lobby';
import type { DbConnection } from './module_bindings';

const PHONE_LAYOUT = isMobileDevice();
const CREATE_TABLE = PHONE_LAYOUT ? MOBILE_CREATE_TABLE : DESKTOP_CREATE_TABLE;

const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const FIELD = ex.Color.fromHex('#0b2418');
const BUTTON = CHAT_SEND;
const BUTTON_DOWN = CHAT_SEND_DOWN;
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const DANGER = ex.Color.fromHex('#e85d4c');
const PANEL = ex.Color.fromHex('#0a2e1c');
const FIELD_SEATED = ex.Color.fromHex('#1a4a2c');
const INK = ex.Color.fromHex('#0a2e1c');
const BANNER_FILL = ex.Color.fromHex('#0a2e1c');

const CHAT_TEXT_PAD = 6;

function chatFieldLabel(
  box: { x: number; y: number; w: number; h: number },
  size: number = CHAT_PANEL.list.size,
): FieldLabel {
  return {
    size,
    x: box.x + CHAT_TEXT_PAD,
    y: box.y + Math.round((box.h - size) / 2),
    columns: fieldLabelColumns(box.w, CHAT_TEXT_PAD, size),
  };
}

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

function solidRect(
  width: number,
  height: number,
  color: ex.Color,
): ex.Rectangle {
  const rect = new ex.Rectangle({ width, height, color, smoothing: false });
  rect.origin = ex.vec(0, 0);
  return rect;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Could not update the table';
}

export class LobbyScene {
  private lobbyId = '';
  private lobbyCode = '';
  private subscribedLobbyId = '';
  private panelReady = false;
  private watching = false;
  private busy = false;
  private creating = false;
  private tableNameDraft = '';
  private tableNameText?: ex.Text;
  private gameIndex = 0;
  private variationIndex = 0;
  private pokerLimit: 'no-limit' | 'pot-limit' | undefined;
  private maxPlayers = gameOption(0).maxPlayers;
  private readonly rowActors: ex.Actor[] = [];
  private emptyText: ex.Text | undefined;
  private moreText: ex.Text | undefined;
  private tablePage = 0;
  private tablePages = 1;
  private pagingButton: ex.Actor | undefined;
  private codeText: ex.Text | undefined;
  private codeActor: ex.Actor | undefined;
  private errorText: ex.Text | undefined;
  private statsActor: ex.Actor | undefined;
  private linkLine = '';
  private linkText = canvasText('', 8, GOLD);
  private linkActor: ex.Actor | undefined;
  private gameText: ex.Text | undefined;
  private maxText: ex.Text | undefined;
  private variationText: ex.Text | undefined;
  private dealLabel: ex.Text | undefined;
  private variationActors: ex.Actor[] = [];
  private popup: ex.Actor | undefined;
  private discordBadge: ex.Actor | undefined;
  private tablesReady: Promise<boolean> = Promise.resolve(false);
  private statsText = canvasText(
    statsCaption({ handsPlayed: 0, gamesWon: 0 }),
    8,
    DIM,
  );
  private chatOpen = false;
  private chatUnread = 0;
  private chatToggle?: ex.Actor;
  private readonly buttonCaptions = new WeakMap<
    ex.Actor,
    (caption: string) => void
  >();
  private readonly chatActors: { actor: ex.Actor; y: number }[] = [];
  private readonly leaderboardActors: ex.Actor[] = [];
  private leaderboardOffset = 0;
  private leaderboardCount = 0;
  private leaderboardDrag?: {
    pointerId: number;
    y: number;
    thumbGrab?: number;
  };
  private fundingDialog = false;
  private chatBody = '';
  private chatFocused = false;
  private chatField: CanvasTextFieldHandle | undefined;
  private chatBusy = false;
  private chatKeyboardBound = false;
  private readonly chatMessageActors: ex.Actor[] = [];
  private chatInputBox: ex.Actor | undefined;
  private chatInputText: ex.Text | undefined;
  private chatCaret: ex.Actor | undefined;
  private chatErrorText: ex.Text | undefined;
  private leaveConfirm: ex.Actor | undefined;
  private readonly leaveConfirmButtons: ex.Actor[] = [];
  private leavingRoom = false;
  private returnedToMenu = false;
  private viewportGutter = -1;

  constructor(
    private readonly engine: ex.Engine,
    private readonly scene: ex.Scene,
    private readonly connection: DbConnection,
    private readonly clientId: string,
    private readonly onSeated: (
      tableId: string,
      lobbyMemberId: string,
    ) => void = () => {},
    private readonly onLeftRoom: () => void = () => {},
  ) {}

  get dialogOpen(): boolean {
    return (
      this.creating || this.fundingDialog || this.leaveConfirm !== undefined
    );
  }

  setStats(line: string): void {
    this.statsText.text = line;
  }

  /** A short line while the socket is being replaced. Empty once it is up. */
  setLinkStatus(line: string): void {
    this.linkLine = line;
    this.linkText.text = line;
    if (this.linkActor) {
      this.linkActor.pos = ex.vec(16, 4);
    }
  }

  mount(): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
    let lastSecond = 0;
    this.scene.on('preupdate', () => {
      if (this.panelReady && this.viewportGutter !== tableGutter()) {
        this.viewportGutter = tableGutter();
        this.render();
      }
      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        if (
          [...this.connection.db.gameTable.iter()].some(
            (row) => row.startsAt !== undefined,
          ) ||
          [...this.connection.db.seatAbsence.iter()].some(
            (absence) => absence.deadlineMicros !== undefined,
          )
        )
          this.render();
      }
    });
    this.linkText.text = this.linkLine;
    this.linkActor = new ex.Actor({
      pos: ex.vec(16, 4),
      anchor: ex.vec(0, 0),
      z: 30,
    });
    this.linkActor.graphics.use(this.linkText);
    this.scene.add(this.linkActor);
    this.connection.db.gameTable.onInsert(() => {
      this.render();
    });
    this.connection.db.gameTable.onUpdate(() => {
      this.render();
    });
    this.connection.db.gameTable.onDelete(() => {
      this.render();
    });
    this.connection.db.gameSeat.onInsert(() => {
      this.render();
    });
    this.connection.db.gameSeat.onUpdate(() => {
      this.render();
    });
    this.connection.db.gameSeat.onDelete(() => {
      this.render();
    });
    this.connection.db.spectator.onInsert(() => {
      this.render();
    });
    this.connection.db.spectator.onUpdate(() => {
      this.render();
    });
    this.connection.db.spectator.onDelete(() => {
      this.render();
    });
    this.connection.db.lobby.onInsert(() => {
      this.paintDiscordBadge();
    });
    this.connection.db.lobby.onUpdate(() => {
      this.paintDiscordBadge();
    });
    this.connection.db.lobby.onDelete((_ctx, lobby) => {
      if (lobby.id === this.lobbyId) {
        this.finishLeave();
      }
      this.paintDiscordBadge();
    });
    this.connection.db.lobbyMember.onDelete((_ctx, member) => {
      if (
        member.lobbyId === this.lobbyId &&
        member.clientId === this.clientId
      ) {
        this.finishLeave();
      }
    });
    this.connection.db.lobbyChatMessage.onInsert((ctx, message) => {
      const me = memberByClient(
        this.readMembers(),
        this.lobbyId,
        this.clientId,
      );
      if (
        !this.chatOpen &&
        ctx.event.tag !== 'SubscribeApplied' &&
        message.lobbyMemberId !== me?.id
      )
        this.chatUnread += 1;
      this.renderLeaderboard();
      this.renderChat();
    });
    this.connection.db.lobbyChatMessage.onUpdate(() => {
      this.renderChat();
    });
    this.connection.db.lobbyChatMessage.onDelete(() => {
      this.renderChat();
    });
    this.connection.db.lobbyMember.onInsert(() => {
      this.renderChat();
    });
    this.connection.db.lobbyMember.onUpdate((_ctx, previous, member) => {
      if (
        !previous.leftRoom &&
        member.leftRoom &&
        member.clientId === this.clientId &&
        member.lobbyId === this.lobbyId
      )
        this.finishLeave();
      this.renderChat();
    });
    this.connection.db.roomWallet.onInsert(() => this.renderLeaderboard());
    this.connection.db.roomWallet.onUpdate(() => this.renderLeaderboard());
    this.connection.db.tableFunding.onUpdate(() => this.renderLeaderboard());
    this.bindChatKeyboard();
    this.bindLeaderboardScroll();
    roomComposer.watch(() => {
      this.chatFocused = roomComposer.active() === 'chat';
      this.paintChatField();
    });
  }

  openLobby(lobbyId: string, code = ''): Promise<boolean> {
    this.returnedToMenu = false;
    if (this.lobbyId !== lobbyId) showLobbyUrl(code);
    if (this.lobbyId !== lobbyId) this.leaderboardOffset = 0;
    this.lobbyId = lobbyId;
    this.lobbyCode = code;
    this.closeLeaveConfirm();
    this.ensurePanel();
    this.paintCode();
    this.paintDiscordBadge();
    this.chatBody = '';
    this.chatFocused = false;
    roomComposer.blur('chat');
    this.paintChatField();
    this.chatField?.sync();
    refreshCanvasTextFields();
    this.setChatError('');
    if (this.subscribedLobbyId === lobbyId) {
      this.render();
      this.renderChat();
      return this.tablesReady;
    }
    this.subscribedLobbyId = lobbyId;
    this.tablesReady = subscribeLobbyTables(this.connection, lobbyId)
      .then(() => {
        if (this.lobbyId === lobbyId) {
          this.render();
          this.renderChat();
        }
        return true;
      })
      .catch((error: unknown) => {
        if (this.subscribedLobbyId === lobbyId) {
          this.subscribedLobbyId = '';
        }
        this.setError(errorMessage(error));
        return false;
      });
    return this.tablesReady;
  }

  /**
   * Opens the stored table when this member's seat or spectator row
   * and the table row are both still in the joined lobby.
   */
  reopenIfSeated(tableId: string): boolean {
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    if (!member) {
      return false;
    }
    const openId = tableToReopen(
      tableId,
      this.readTables(),
      this.readSeats(),
      member.id,
      this.lobbyId,
      this.readSpectators(),
    );
    if (openId.length === 0) {
      return false;
    }
    if (this.memberSeatedHere(openId, member.id)) void this.joinTable(openId);
    else this.onSeated(openId, member.id);
    return true;
  }

  private ensurePanel(): void {
    if (this.panelReady) {
      return;
    }
    this.panelReady = true;
    enableLobbyViewport(this.scene);
    const box = TABLE_LIST.panel;
    const backdrop = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 15,
    });
    backdrop.graphics.use(panelRect(box.w, box.h, PANEL, STROKE));
    anchorLobbyActor(backdrop);
    stretchLobbyActor(backdrop, box.w);
    this.scene.add(backdrop);

    this.addLabel(
      TABLE_LIST.list.x,
      100,
      'Tables',
      PHONE_LAYOUT ? 12 : 10,
      DIM,
    );
    this.emptyText = this.addLabel(
      TABLE_LIST.list.x,
      TABLE_LIST.list.y,
      'No tables',
      8,
      DIM,
    );
    this.moreText = this.addLabel(
      TABLE_LIST.more.x,
      TABLE_LIST.more.y,
      '',
      8,
      DIM,
    );
    this.errorText = this.addLabel(
      TABLE_LIST.error.x,
      TABLE_LIST.error.y,
      '',
      PHONE_LAYOUT ? 10 : 8,
      DANGER,
    );
    const create = this.button(TABLE_LIST.create, 'Create Table', () => {
      this.openCreate();
    });
    anchorTableActor(create, 'right', TABLE_LIST.create.x);
    const next = this.button(
      { x: 488, y: 464, w: 140, h: PHONE_LAYOUT ? 32 : 28 },
      'Next page',
      () => {
        this.tablePage = (this.tablePage + 1) % this.tablePages;
        this.render();
      },
    );
    anchorTableActor(next, 'right', 488);
    this.pagingButton = next;
    this.buildPopup();
    this.buildBanner();

    const beforeChat = new Set(this.scene.actors);
    this.buildChatPanel();
    for (const actor of this.scene.actors)
      if (!beforeChat.has(actor))
        this.chatActors.push({ actor, y: actor.pos.y });
    const chatToggle = this.button(CHAT_TOGGLE, 'Chat', () => {
      this.chatOpen = !this.chatOpen;
      this.chatUnread = 0;
      roomComposer.blur('chat');
      this.setChatVisible();
      this.renderChat();
      this.renderLeaderboard();
    });
    anchorTableActor(chatToggle, 'right', CHAT_TOGGLE.x);
    this.chatToggle = chatToggle;
    this.setChatVisible();
    this.button(REFILL_CHIPS_BUTTON, 'Refill chips', () => {
      void this.connection.reducers
        .refillRoomCoins({ lobbyId: this.lobbyId, clientId: this.clientId })
        .catch((error) => this.setError(errorMessage(error)));
    });
    this.buildLeaveRoom();
    const stats = new ex.Actor({
      pos: ex.vec(20, 518),
      anchor: ex.vec(0, 0),
      z: 20,
    });
    stats.graphics.use(this.statsText);
    anchorLobbyActor(stats);
    this.statsActor = stats;
    this.scene.add(stats);
  }

  private setChatVisible(): void {
    for (const { actor, y } of this.chatActors) {
      actor.graphics.isVisible = this.chatOpen;
      actor.pos.y = this.chatOpen ? y : -2000;
    }
    if (!this.chatOpen && this.chatCaret) this.chatCaret.graphics.opacity = 0;
    refreshCanvasTextFields();
  }

  private renderLeaderboard(): void {
    if (!this.panelReady) return;
    for (const actor of this.leaderboardActors) actor.kill();
    this.leaderboardActors.length = 0;
    if (this.chatToggle)
      this.buttonCaptions.get(this.chatToggle)?.(
        this.chatOpen
          ? 'Rankings'
          : this.chatUnread
            ? `Chat (${this.chatUnread > 99 ? '99+' : this.chatUnread})`
            : 'Chat',
      );
    if (this.chatOpen) return;
    const box = CHAT_PANEL.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 15,
    });
    panel.graphics.use(panelRect(box.w, box.h, PANEL, STROKE));
    anchorLobbyActor(panel);
    this.scene.add(panel);
    this.leaderboardActors.push(panel);
    const label = (
      y: number,
      value: string,
      size: number,
      color = GOLD,
    ): void => {
      const actor = this.addChatLabel(CHAT_PANEL.list.x, y, value, size, color);
      this.leaderboardActors.push(actor);
    };
    label(98, 'Leaderboard', PHONE_LAYOUT ? 16 : 12);
    label(122, 'Ranked by net winnings', PHONE_LAYOUT ? 11 : 8, DIM);
    const wallets = leaderboardRows(
      [...this.connection.db.roomWallet.iter()].filter(
        (row) => row.lobbyId === this.lobbyId,
      ),
    );
    const capacity = PHONE_LAYOUT ? 4 : 5;
    this.leaderboardCount = wallets.length;
    this.leaderboardOffset = clampLeaderboardOffset(
      this.leaderboardOffset,
      wallets.length,
      capacity,
    );
    const start = this.leaderboardOffset;
    const textX = CHAT_PANEL.list.x + 24;
    const rowLabel = (
      y: number,
      value: string,
      size: number,
      color = GOLD,
    ): void => {
      const actor = this.addChatLabel(textX, y, value, size, color);
      this.leaderboardActors.push(actor);
    };
    wallets.slice(start, start + capacity).forEach((wallet, index) => {
      const y = 158 + index * (PHONE_LAYOUT ? 70 : 54);
      const mine = wallet.clientId === this.clientId;
      const size = PHONE_LAYOUT ? 14 : 10;
      const prefix = `${wallet.rank}. `;
      const nameLimit = Math.floor((932 - textX - 12) / size) - prefix.length;
      const name =
        wallet.name.length > nameLimit
          ? wallet.name.slice(0, nameLimit - 3) + '...'
          : wallet.name;
      rowLabel(y, prefix + name, size, mine ? SELF : GOLD);
      if (wallet.crowned) this.addLeaderCrown(CHAT_PANEL.list.x, y - 1);
      const committed = [...this.connection.db.tableFunding.iter()]
        .filter((row) => row.walletId === wallet.id)
        .reduce((sum, row) => sum + row.units, 0n);
      if (PHONE_LAYOUT) {
        rowLabel(
          y + 22,
          `Net ${wallet.profit > 0n ? '+' : ''}${formatCoins(wallet.profit)}`,
          12,
          DIM,
        );
        rowLabel(
          y + 40,
          `Chips ${formatCoins(wallet.available + committed)}`,
          12,
          DIM,
        );
      } else
        rowLabel(
          y + 20,
          `${wallet.profit > 0n ? '+' : ''}${formatCoins(wallet.profit)} net | ${formatCoins(wallet.available + committed)} chips`,
          8,
          DIM,
        );
    });
    label(
      474,
      wallets.length
        ? `${start + 1}-${Math.min(start + capacity, wallets.length)} of ${wallets.length} players`
        : 'No players yet',
      PHONE_LAYOUT ? 11 : 8,
      DIM,
    );
    if (wallets.length > capacity) {
      label(
        452,
        PHONE_LAYOUT ? 'Swipe to scroll' : 'Scroll for more',
        PHONE_LAYOUT ? 10 : 8,
        DIM,
      );
      const thumb = leaderboardScrollThumb(
        start,
        wallets.length,
        capacity,
        280,
      );
      for (const [y, h, color] of [
        [154, 280, FIELD],
        [154 + thumb.y, thumb.h, STROKE],
      ] as const) {
        const actor = new ex.Actor({
          pos: ex.vec(932, y),
          anchor: ex.vec(0, 0),
          width: 6,
          height: h,
          z: 21,
        });
        actor.graphics.use(panelRect(6, h, color, color));
        this.silencePointer(actor);
        anchorLobbyActor(actor);
        this.scene.add(actor);
        this.leaderboardActors.push(actor);
      }
    }
  }

  private addLeaderCrown(x: number, y: number): void {
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      z: 21,
    });
    const graphic = new ex.Canvas({
      width: 18,
      height: 14,
      cache: true,
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
      draw: (ctx) => {
        ctx.fillStyle = '#e6c27a';
        ctx.fillRect(0, 2, 2, 6);
        ctx.fillRect(8, 0, 2, 8);
        ctx.fillRect(16, 2, 2, 6);
        ctx.fillRect(2, 6, 14, 4);
        ctx.fillRect(2, 12, 14, 2);
        ctx.fillStyle = '#fff6d0';
        ctx.fillRect(4, 8, 10, 2);
      },
    });
    graphic.origin = ex.vec(0, 0);
    actor.graphics.use(graphic);
    this.silencePointer(actor);
    anchorLobbyActor(actor);
    this.scene.add(actor);
    this.leaderboardActors.push(actor);
  }

  private bindLeaderboardScroll(): void {
    const active = (): boolean =>
      this.panelReady &&
      this.engine.currentScene === this.scene &&
      !this.chatOpen &&
      !this.dialogOpen;
    const contains = (x: number, y: number): boolean =>
      active() &&
      x >= CHAT_PANEL.panel.x + tableGutter() &&
      x < CHAT_PANEL.panel.x + CHAT_PANEL.panel.w + tableGutter() &&
      y >= 146 &&
      y < 440;
    const scroll = (offset: number): void => {
      const next = clampLeaderboardOffset(
        offset,
        this.leaderboardCount,
        PHONE_LAYOUT ? 4 : 5,
      );
      if (next === this.leaderboardOffset) return;
      this.leaderboardOffset = next;
      this.renderLeaderboard();
    };
    this.engine.input.pointers.on('wheel', (event) => {
      if (!contains(event.x, event.y) || !event.deltaY) return;
      event.cancel();
      scroll(this.leaderboardOffset + Math.sign(event.deltaY));
    });
    this.engine.input.pointers.on('down', (event) => {
      if (!contains(event.worldPos.x, event.worldPos.y)) return;
      const thumb = leaderboardScrollThumb(
        this.leaderboardOffset,
        this.leaderboardCount,
        PHONE_LAYOUT ? 4 : 5,
        280,
      );
      const track = event.worldPos.x >= 922 + tableGutter();
      this.leaderboardDrag = {
        pointerId: event.pointerId,
        y: event.worldPos.y,
        thumbGrab: track
          ? Math.max(0, Math.min(thumb.h, event.worldPos.y - 154 - thumb.y))
          : undefined,
      };
      event.cancel();
    });
    this.engine.input.pointers.on('move', (event) => {
      const drag = this.leaderboardDrag;
      if (!drag || drag.pointerId !== event.pointerId || !active()) return;
      if (drag.thumbGrab !== undefined) {
        const capacity = PHONE_LAYOUT ? 4 : 5;
        const thumb = leaderboardScrollThumb(
          this.leaderboardOffset,
          this.leaderboardCount,
          capacity,
          280,
        );
        scroll(
          ((event.worldPos.y - 154 - drag.thumbGrab) /
            Math.max(1, 280 - thumb.h)) *
            Math.max(0, this.leaderboardCount - capacity),
        );
      } else {
        const steps = Math.trunc(
          (drag.y - event.worldPos.y) / (PHONE_LAYOUT ? 40 : 32),
        );
        if (steps) {
          scroll(this.leaderboardOffset + steps);
          drag.y = event.worldPos.y;
        }
      }
      event.cancel();
    });
    this.engine.input.pointers.on('up', (event) => {
      if (this.leaderboardDrag?.pointerId === event.pointerId)
        this.leaderboardDrag = undefined;
    });
    this.engine.canvas.addEventListener('pointercancel', () => {
      this.leaderboardDrag = undefined;
    });
  }

  private buildChatPanel(): void {
    const box = CHAT_PANEL.panel;
    const backdrop = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 15,
    });
    backdrop.graphics.use(panelRect(box.w, box.h, PANEL, STROKE));
    anchorLobbyActor(backdrop);
    this.scene.add(backdrop);
    this.addLabel(
      CHAT_PANEL.title.x,
      CHAT_PANEL.title.y,
      'Chat',
      CHAT_PANEL.title.size,
      DIM,
    );

    const field = CHAT_PANEL.field;
    const chatMetrics = chatFieldLabel(field);
    this.chatInputBox = new ex.Actor({
      pos: ex.vec(field.x, field.y),
      anchor: ex.vec(0, 0),
      width: field.w,
      height: field.h,
      z: 20,
    });
    this.chatInputBox.graphics.use(panelRect(field.w, field.h, FIELD, STROKE));
    anchorLobbyActor(this.chatInputBox);
    this.scene.add(this.chatInputBox);
    this.chatInputText = this.addLabel(
      chatMetrics.x,
      chatMetrics.y,
      '',
      chatMetrics.size,
      GOLD,
    );
    this.chatCaret = makeFieldCaret(chatMetrics.size, 22);
    this.chatCaret.name = 'lobby-chat-caret';
    this.scene.add(this.chatCaret);
    this.chatInputBox.on('pointerup', () => {
      roomComposer.focus('chat');
    });
    this.chatField = bindCanvasTextField({
      id: 'lobby-chat',
      label: 'Chat',
      box: lobbyFieldGeometry(CHAT_PANEL.field, 'right'),
      maxLength: CHAT_BODY_MAX,
      active: () =>
        this.engine.currentScene === this.scene &&
        this.lobbyId.length > 0 &&
        !this.leaveConfirm &&
        !this.creating &&
        this.chatOpen &&
        !this.fundingDialog,
      read: () => this.chatBody,
      sanitize: (value) => applyChatText(value),
      write: (value) => {
        if (this.chatBusy) {
          this.chatField?.sync();
          return;
        }
        this.chatBody = value;
        this.paintChatField();
      },
      submit: () => {
        void this.sendChat();
      },
      onFocus: () => {
        roomComposer.focus('chat');
      },
      enterKeyHint: 'send',
      autoCapitalize: 'off',
      metrics: lobbyFieldGeometry(chatFieldLabel(CHAT_PANEL.field), 'right'),
      onCaret: (index) => {
        this.paintChatField(index);
      },
    });

    this.button(CHAT_PANEL.send, 'Send', () => {
      void this.sendChat();
    });

    this.chatErrorText = this.addLabel(
      CHAT_PANEL.list.x,
      field.y + field.h + 4,
      '',
      8,
      DANGER,
    );
    this.paintChatField();
  }

  private buildLeaveRoom(): void {
    this.button(LEAVE_ROOM, 'Leave Room', () => {
      this.openLeaveConfirm();
    });
  }

  private openLeaveConfirm(): void {
    if (this.leaveConfirm || this.lobbyId.length === 0 || this.leavingRoom) {
      return;
    }
    roomComposer.clear();
    const box = LEAVE_CONFIRM.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 40,
    });
    panel.graphics.use(panelRect(box.w, box.h, PANEL, STROKE_HOT));
    this.claimLeavePanel(panel);
    this.scene.add(panel);
    this.childLabel(
      panel,
      16,
      20,
      'Leave the room?',
      GOLD,
      PHONE_LAYOUT ? 18 : 8,
    );
    this.childLabel(
      panel,
      16,
      PHONE_LAYOUT ? 66 : 40,
      "You'll lose your seats at all tables.",
      DIM,
      PHONE_LAYOUT ? 12 : 8,
    );
    this.leaveConfirmButtons.push(
      this.leaveButton(LEAVE_CONFIRM.leave, 'Leave', () => {
        void this.confirmLeave();
      }),
      this.leaveButton(LEAVE_CONFIRM.cancel, 'Cancel', () => {
        this.closeLeaveConfirm();
      }),
    );
    this.leaveConfirm = panel;
    refreshCanvasTextFields();
  }

  /**
   * The panel is the top hit target in local z when buttons are parented to
   * it, and those clicks never reached Leave. Buttons are scene actors above
   * the panel. The panel still answers a click on those same boxes.
   */
  private claimLeavePanel(panel: ex.Actor): void {
    const claim = (event: { cancel: () => void }): void => {
      event.cancel();
    };
    panel.on('pointerdown', claim);
    panel.on('pointerup', (event) => {
      event.cancel();
      const hit = leaveConfirmHit(event.worldPos.x, event.worldPos.y);
      if (hit === 'leave') {
        void this.confirmLeave();
      } else if (hit === 'cancel') {
        this.closeLeaveConfirm();
      }
    });
  }

  private leaveButton(
    box: { x: number; y: number; w: number; h: number },
    caption: string,
    onPress: () => void,
  ): ex.Actor {
    const actor = this.button(box, caption, onPress, undefined, true);
    actor.z = 42;
    return actor;
  }

  private closeLeaveConfirm(): void {
    this.leaveConfirm?.kill();
    this.leaveConfirm = undefined;
    for (const actor of this.leaveConfirmButtons) {
      actor.kill();
    }
    this.leaveConfirmButtons.length = 0;
    refreshCanvasTextFields();
  }

  private finishLeave(): void {
    if (this.returnedToMenu || this.lobbyId.length === 0) {
      return;
    }
    this.returnedToMenu = true;
    this.leavingRoom = false;
    this.closeLeaveConfirm();
    this.lobbyId = '';
    this.lobbyCode = '';
    this.onLeftRoom();
  }

  private async confirmLeave(): Promise<void> {
    if (this.leavingRoom || this.lobbyId.length === 0) {
      return;
    }
    this.leavingRoom = true;
    this.setError('');
    const lobbyId = this.lobbyId;
    try {
      await this.connection.reducers.leaveLobby({
        lobbyId,
        clientId: this.clientId,
      });
      this.finishLeave();
    } catch (error: unknown) {
      this.leavingRoom = false;
      this.setError(errorMessage(error));
    }
  }

  private bindChatKeyboard(): void {
    if (this.chatKeyboardBound) {
      return;
    }
    this.chatKeyboardBound = true;
    this.engine.input.keyboard.on('press', (evt) => {
      if (
        roomComposer.active() !== 'chat' ||
        this.engine.currentScene !== this.scene ||
        this.leaveConfirm
      ) {
        return;
      }
      if (eventTargetsHtmlField(evt.originalEvent)) {
        return;
      }
      if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
        return;
      }
      if (this.chatBusy) {
        return;
      }
      if (evt.key === ex.Keys.Backspace) {
        this.chatBody = applyChatKey(this.chatBody, 'Backspace');
        this.paintChatField();
        return;
      }
      if (evt.key === ex.Keys.Enter) {
        void this.sendChat();
        return;
      }
      const typed = evt.value ?? '';
      if (typed.length !== 1) {
        return;
      }
      this.chatBody = applyChatKey(this.chatBody, typed);
      this.paintChatField();
    });
  }

  private paintChatField(caretIndex?: number): void {
    if (!this.chatInputBox || !this.chatInputText || !this.chatCaret) {
      return;
    }
    const field = CHAT_PANEL.field;
    const metrics = chatFieldLabel(field);
    this.chatInputBox.graphics.use(
      panelRect(
        field.w,
        field.h,
        FIELD,
        this.chatFocused ? STROKE_HOT : STROKE,
      ),
    );
    const index = this.chatFocused
      ? (caretIndex ?? this.chatField?.selectionIndex() ?? this.chatBody.length)
      : this.chatBody.length;
    const layout = layoutFieldCaret({
      value: this.chatBody,
      index,
      size: metrics.size,
      originX: metrics.x,
      originY: metrics.y,
      columns: metrics.columns,
    });
    if (this.chatBody.length > 0) {
      this.chatInputText.text = layout.text;
      this.chatInputText.color = GOLD;
    } else if (this.chatFocused) {
      this.chatInputText.text = '';
      this.chatInputText.color = GOLD;
    } else {
      this.chatInputText.text = 'Say something...';
      this.chatInputText.color = DIM;
    }
    showFieldCaret(this.chatCaret, this.chatFocused, layout.x, layout.y);
    anchorTableActor(this.chatCaret, 'right', layout.x);
  }

  private async sendChat(): Promise<void> {
    if (this.chatBusy || this.lobbyId.length === 0) {
      return;
    }
    const body = normalizeChatBody(this.chatBody);
    if (body.length === 0) {
      return;
    }
    this.chatBusy = true;
    this.setChatError('');
    try {
      await this.connection.reducers.sendLobbyChatMessage({
        lobbyId: this.lobbyId,
        clientId: this.clientId,
        body: body.slice(0, CHAT_BODY_MAX),
      });
      this.chatBody = '';
      this.paintChatField();
      this.chatField?.sync();
    } catch (error: unknown) {
      this.setChatError(errorMessage(error));
    } finally {
      this.chatBusy = false;
    }
  }

  private setChatError(message: string): void {
    if (this.chatErrorText) {
      this.chatErrorText.text = message;
    }
  }

  private renderChat(): void {
    for (const actor of this.chatMessageActors) actor.kill();
    if (!this.panelReady || this.lobbyId.length === 0 || !this.chatOpen) {
      return;
    }
    for (const actor of this.chatMessageActors) {
      actor.kill();
    }
    this.chatMessageActors.length = 0;
    const lines = chatLines(
      this.readChatMessages(),
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    const { list, panel } = CHAT_PANEL;
    const capacity = Math.floor((list.bottom - list.y) / list.lineHeight);
    const columns = Math.floor((panel.w - 2 * (list.x - panel.x)) / list.size);
    const visible = lines
      .flatMap(({ name, body, self }) =>
        wrapChatLines(name, body, columns).map((line) => ({
          ...line,
          self,
          system: !name,
        })),
      )
      .slice(-capacity);
    visible.forEach((line, index) => {
      const y = list.y + index * list.lineHeight;
      if (line.sender) {
        this.chatMessageActors.push(
          this.addChatLabel(
            list.x,
            y,
            line.sender,
            list.size,
            line.self ? GOLD : CHAT_OTHER_SENDER,
          ),
        );
      }
      this.chatMessageActors.push(
        this.addChatLabel(
          list.x + line.indent * list.size,
          y,
          line.body,
          list.size,
          line.system ? CHAT_SYSTEM_MESSAGE : SELF,
        ),
      );
    });
  }

  private addChatLabel(
    x: number,
    y: number,
    text: string,
    size: number,
    color: ex.Color,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      z: 16,
    });
    actor.graphics.use(canvasText(text, size, color));
    anchorLobbyActor(actor);
    this.scene.add(actor);
    return actor;
  }

  private readChatMessages(): ChatMessageRow[] {
    const rows: ChatMessageRow[] = [];
    for (const message of this.connection.db.lobbyChatMessage.iter()) {
      rows.push({
        id: message.id,
        lobbyId: message.lobbyId,
        lobbyMemberId: message.lobbyMemberId,
        body: message.body,
      });
    }
    return rows;
  }

  private buildBanner(): void {
    const box = ROOM_BANNER.panel;
    const backdrop = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 15,
    });
    backdrop.graphics.use(panelRect(box.w, box.h, BANNER_FILL, STROKE_HOT));
    anchorLobbyActor(backdrop);
    this.scene.add(backdrop);

    this.centeredActor(
      canvasText('ROOM CODE', ROOM_BANNER.title.size, DIM),
      ROOM_BANNER.title.y,
      'ROOM CODE',
      ROOM_BANNER.title.size,
    );
    this.codeText = canvasText('', ROOM_BANNER.code.size, GOLD);
    this.codeActor = this.centeredActor(
      this.codeText,
      ROOM_BANNER.code.y,
      '',
      ROOM_BANNER.code.size,
    );
  }

  private centeredActor(
    graphic: ex.Text,
    y: number,
    text: string,
    size: number,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(this.centeredX(text, size), y),
      anchor: ex.vec(0, 0),
      z: 21,
    });
    actor.graphics.use(graphic);
    anchorLobbyActor(actor);
    this.scene.add(actor);
    return actor;
  }

  private centeredX(text: string, size: number): number {
    const box = ROOM_BANNER.panel;
    return box.x + Math.floor((box.w - text.length * size) / 2);
  }

  private paintCode(): void {
    if (!this.codeText || !this.codeActor) {
      return;
    }
    const code = this.lobbyCode.length > 0 ? this.lobbyCode : '----';
    this.codeText.text = code;
    this.codeActor.pos = ex.vec(
      this.centeredX(code, ROOM_BANNER.code.size),
      ROOM_BANNER.code.y,
    );
    anchorTableActor(
      this.codeActor,
      'left',
      this.centeredX(code, ROOM_BANNER.code.size),
    );
  }

  private paintDiscordBadge(): void {
    const linked =
      this.panelReady &&
      this.lobbyId.length > 0 &&
      lobbyLaunchedFromDiscord(this.connection.db.lobby.iter(), this.lobbyId);
    if (!linked) {
      this.discordBadge?.kill();
      this.discordBadge = undefined;
      return;
    }
    if (this.discordBadge) {
      return;
    }
    const box = discordBadgeBox();
    const badge = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 21,
    });
    badge.graphics.use(panelRect(box.w, box.h, BANNER_FILL, STROKE));
    const caption = new ex.Actor({
      pos: ex.vec(
        DISCORD_BADGE.padX,
        Math.floor((box.h - DISCORD_BADGE.size) / 2),
      ),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(
      canvasText(DISCORD_BADGE.label, DISCORD_BADGE.size, GOLD),
    );
    badge.addChild(caption);
    this.scene.add(badge);
    this.discordBadge = badge;
  }

  private buildPopup(): void {
    const box = CREATE_TABLE.panel;
    const popup = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 40,
    });
    popup.graphics.use(panelRect(box.w, box.h, PANEL, STROKE));
    this.addLabel(
      PHONE_LAYOUT ? 184 : 276,
      PHONE_LAYOUT ? 54 : 150,
      'Create Table',
      PHONE_LAYOUT ? 18 : 8,
      GOLD,
      popup,
    );
    this.addLabel(
      PHONE_LAYOUT ? 288 : 276,
      PHONE_LAYOUT ? 100 : 174,
      'Game',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.gameText = this.addLabel(
      PHONE_LAYOUT ? 288 : 276,
      PHONE_LAYOUT ? 132 : 190,
      gameOption(0).name,
      PHONE_LAYOUT ? 16 : 8,
      GOLD,
      popup,
    );
    this.addLabel(
      PHONE_LAYOUT ? 288 : 492,
      PHONE_LAYOUT ? 200 : 174,
      PHONE_LAYOUT ? 'Max players' : 'Max',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.maxText = this.addLabel(
      PHONE_LAYOUT ? 288 : 492,
      PHONE_LAYOUT ? 232 : 190,
      String(this.maxPlayers),
      PHONE_LAYOUT ? 16 : 8,
      GOLD,
      popup,
    );
    this.button(
      CREATE_TABLE.prev,
      'Prev',
      () => {
        this.stepGame(-1);
      },
      popup,
    );
    this.button(
      CREATE_TABLE.next,
      'Next',
      () => {
        this.stepGame(1);
      },
      popup,
    );
    this.button(
      CREATE_TABLE.minus,
      '-',
      () => {
        this.stepPlayers(-1);
      },
      popup,
    );
    this.button(
      CREATE_TABLE.plus,
      '+',
      () => {
        this.stepPlayers(1);
      },
      popup,
    );
    this.dealLabel = this.addLabel(
      PHONE_LAYOUT ? 288 : 492,
      PHONE_LAYOUT ? 300 : 246,
      '',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.variationText = this.addLabel(
      PHONE_LAYOUT ? 288 : 492,
      PHONE_LAYOUT ? 332 : 270,
      '',
      PHONE_LAYOUT ? 16 : 8,
      GOLD,
      popup,
    );
    this.variationActors = [
      this.button(
        CREATE_TABLE.varPrev,
        'Prev',
        () => {
          this.stepVariation(-1);
        },
        popup,
      ),
      this.button(
        CREATE_TABLE.varNext,
        'Next',
        () => {
          this.stepVariation(1);
        },
        popup,
      ),
    ];
    const name = CREATE_TABLE.name;
    this.addLabel(
      name.x,
      name.y - (PHONE_LAYOUT ? 15 : 12),
      'Table name (optional)',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    const nameFace = new ex.Actor({
      pos: ex.vec(name.x - box.x, name.y - box.y),
      anchor: ex.vec(0, 0),
      width: name.w,
      height: name.h,
      z: 1,
    });
    nameFace.graphics.use(panelRect(name.w, name.h, FIELD, STROKE));
    popup.addChild(nameFace);
    const metrics = chatFieldLabel(name, PHONE_LAYOUT ? 12 : BUTTON_FONT_SIZE);
    this.tableNameText = this.addLabel(
      metrics.x,
      metrics.y,
      '',
      metrics.size,
      GOLD,
      popup,
    );
    const caret = makeFieldCaret(metrics.size, 3);
    caret.name = 'table-name-caret';
    this.silencePointer(caret);
    popup.addChild(caret);
    let nameFocused = false;
    const paintName = (index = this.tableNameDraft.length): void => {
      const layout = layoutFieldCaret({
        value: this.tableNameDraft,
        index,
        size: metrics.size,
        originX: metrics.x,
        originY: metrics.y,
        columns: metrics.columns,
      });
      if (this.tableNameText) this.tableNameText.text = layout.text;
      showFieldCaret(
        caret,
        nameFocused && this.creating && !this.fundingDialog,
        layout.x - box.x,
        layout.y - box.y,
      );
    };
    const nameField = bindCanvasTextField({
      id: 'table-name',
      label: 'Table name (optional)',
      box: name,
      maxLength: 32,
      active: () =>
        this.creating &&
        !this.fundingDialog &&
        this.engine.currentScene === this.scene,
      read: () => this.tableNameDraft,
      sanitize: (value) => applyChatText(value).slice(0, 32),
      write: (value) => {
        this.tableNameDraft = value;
        paintName(nameField.selectionIndex());
      },
      submit: () => void this.createTable(),
      cancel: () => this.closeCreate(),
      metrics,
      onFocus: () => {
        nameFocused = true;
        paintName(nameField.selectionIndex());
      },
      onBlur: () => {
        nameFocused = false;
        caret.graphics.opacity = 0;
      },
      onCaret: paintName,
    });
    nameFace.on('pointerup', () => nameField.focus());
    this.button(
      CREATE_TABLE.create,
      'Create',
      () => {
        void this.createTable();
      },
      popup,
    );
    this.button(
      CREATE_TABLE.cancel,
      'Cancel',
      () => {
        this.closeCreate();
      },
      popup,
    );
    popup.pointer.useColliderShape = false;
    popup.pointer.useGraphicsBounds = false;
    this.scene.add(popup);
    this.popup = popup;
    this.setPopupOpen(false);
  }

  private openCreate(): void {
    if (this.busy || this.lobbyId.length === 0 || !this.popup) {
      return;
    }
    this.creating = true;
    this.tableNameDraft = '';
    if (this.tableNameText) this.tableNameText.text = '';
    this.variationIndex = 0;
    this.pokerLimit = undefined;
    this.paintChoice();
    this.setPopupOpen(true);
    roomComposer.clear();
    refreshCanvasTextFields();
  }

  private closeCreate(): void {
    this.creating = false;
    this.setPopupOpen(false);
    refreshCanvasTextFields();
  }

  private setPopupOpen(open: boolean): void {
    if (!this.popup) {
      return;
    }
    this.popup.pos = open
      ? ex.vec(CREATE_TABLE.panel.x, CREATE_TABLE.panel.y)
      : ex.vec(CREATE_TABLE.panel.x, -CREATE_TABLE.panel.h - 64);
  }

  private stepGame(delta: number): void {
    if (!this.creating) {
      return;
    }
    this.gameIndex += delta;
    const game = gameOption(this.gameIndex);
    this.maxPlayers = game.maxPlayers;
    this.paintChoice();
  }

  private stepPlayers(delta: number): void {
    if (!this.creating) {
      return;
    }
    const game = gameOption(this.gameIndex);
    this.maxPlayers = clampPlayerCount(game, this.maxPlayers + delta);
    this.paintChoice();
  }

  private stepVariation(delta: number): void {
    if (
      !this.creating ||
      gameOption(this.gameIndex).gameType !== POKER_GAME_TYPE
    ) {
      return;
    }
    const count = POKER_VARIATIONS.length;
    this.variationIndex = (this.variationIndex + delta + count) % count;
    this.paintChoice();
  }

  private paintChoice(): void {
    const game = gameOption(this.gameIndex);
    if (this.gameText) {
      this.gameText.text = game.name;
    }
    if (this.maxText) {
      this.maxText.text = String(this.maxPlayers);
    }
    const poker = game.gameType === POKER_GAME_TYPE;
    const variation =
      POKER_VARIATIONS[this.variationIndex] ?? POKER_VARIATIONS[0];
    if (this.dealLabel) {
      this.dealLabel.text = poker ? 'Deal' : '';
    }
    if (this.variationText) {
      this.variationText.text = poker ? POKER_VARIATION_LABELS[variation] : '';
    }
    for (const actor of this.variationActors) {
      actor.pos.y = poker
        ? CREATE_TABLE.varPrev.y - CREATE_TABLE.panel.y
        : -1000;
    }
  }

  private async createTable(stakes?: Record<string, number>): Promise<void> {
    if (this.busy || !this.creating || this.lobbyId.length === 0) {
      return;
    }
    const game = gameOption(this.gameIndex);
    if (this.fundingDialog) return;
    if (!stakes) {
      this.fundingDialog = true;
      if (game.gameType === 'poker')
        this.pokerLimit ??=
          POKER_VARIATIONS[this.variationIndex] === 'holdem'
            ? 'no-limit'
            : 'pot-limit';
      const defaults = tableEconomy(game.gameType);
      const fields: CoinField[] = casinoGame(game.gameType)
        ? [
            ...(game.gameType === 'poker'
              ? [
                  {
                    key: 'smallBlind',
                    label: 'Small blind',
                    value: defaults.smallBlind,
                  },
                  {
                    key: 'bigBlind',
                    label: 'Big blind',
                    value: defaults.bigBlind,
                  },
                ]
              : [
                  {
                    key: 'minBet',
                    label: 'Minimum wager',
                    value: defaults.minBet,
                  },
                  {
                    key: 'maxBet',
                    label: 'Maximum wager',
                    value: defaults.maxBet,
                  },
                ]),
            {
              key: 'minBuyIn',
              label: 'Minimum buy-in',
              value: defaults.minBuyIn,
            },
            {
              key: 'maxBuyIn',
              label: 'Maximum buy-in',
              value: defaults.maxBuyIn,
            },
            { key: 'buyIn', label: 'Your buy-in', value: defaults.minBuyIn },
          ]
        : [{ key: 'entryFee', label: 'Entry fee', value: defaults.entryFee }];
      const selected = await coinDialog(
        this.engine,
        this.scene,
        'Table stakes',
        'Create and join as host. Chips are reserved immediately.',
        fields,
        'Create and join',
        {
          onChange: stakeFieldUpdates,
          choice:
            game.gameType === 'poker'
              ? {
                  values: ['No limit', 'Pot limit'],
                  index: this.pokerLimit === 'no-limit' ? 0 : 1,
                  onChange: (index) => {
                    this.pokerLimit = index === 0 ? 'no-limit' : 'pot-limit';
                  },
                }
              : undefined,
          validate: (values) => validateStakeForm(game.gameType, values),
        },
      );
      this.fundingDialog = false;
      if (selected) await this.createTable(selected);
      return;
    }
    const maxPlayers = clampPlayerCount(game, this.maxPlayers);
    const tableName =
      this.tableNameDraft.trim() ||
      nextTableName(this.readTables(), this.lobbyId, game);
    const variation =
      game.gameType === POKER_GAME_TYPE
        ? POKER_VARIATIONS[this.variationIndex]
        : undefined;
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.createGameTable({
        lobbyId: this.lobbyId,
        gameType: game.gameType,
        settings: JSON.stringify({
          ...JSON.parse(
            tableSettingsJson(
              game.minPlayers,
              maxPlayers,
              tableName,
              variation,
            ),
          ),
          ...stakes,
          ...(game.gameType === 'poker' ? { limit: this.pokerLimit } : {}),
        }),
      });
    } catch (error: unknown) {
      this.setError(errorMessage(error));
      return;
    } finally {
      this.busy = false;
    }
    this.closeCreate();
    this.render();
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    const seat = member
      ? [...this.connection.db.gameSeat.iter()].find(
          (row) => row.lobbyMemberId === member.id,
        )
      : undefined;
    if (seat && member) this.onSeated(seat.tableId, member.id);
  }

  async followTableLink(code: string): Promise<boolean> {
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.lobbyId === this.lobbyId && tableCodeForId(row.id) === code,
    );
    if (!table) {
      this.setError('Table link unavailable');
      return false;
    }
    return this.joinTable(table.id, true);
  }

  private async joinTable(tableId: string, fromLink = false): Promise<boolean> {
    if (this.busy || this.lobbyId.length === 0) {
      return false;
    }
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    if (!member) {
      this.setError('Join the room first');
      return false;
    }
    const linkedTable = fromLink
      ? [...this.connection.db.gameTable.iter()].find(
          (row) => row.id === tableId,
        )
      : undefined;
    if (
      fromLink &&
      linkedTable?.status.tag !== 'WaitingForPlayers' &&
      !this.memberSeatedHere(tableId, member.id)
    ) {
      return this.spectateTable(tableId);
    }
    if (this.fundingDialog) return false;
    const table = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === tableId,
    );
    if (table?.gameType === 'poker' && table.status.tag === 'Finished')
      return this.spectateTable(tableId);
    let buyIn: number | undefined;
    if (table?.economyJson && !this.memberSeatedHere(tableId, member.id)) {
      this.fundingDialog = true;
      const settings = JSON.parse(table.economyJson) as TableEconomy;
      const casino = casinoGame(table.gameType);
      const selected = await coinDialog(
        this.engine,
        this.scene,
        casino ? 'Buy in' : 'Join paid game',
        casino
          ? `Buy-in range: ${settings.minBuyIn} to ${settings.maxBuyIn} chips`
          : `Entry: ${settings.entryFee} chips. Winner takes the pool.`,
        casino
          ? [{ key: 'buyIn', label: 'Your buy-in', value: settings.minBuyIn }]
          : [],
        'Join table',
        {
          validate: (values) => {
            if (casino)
              validateBuyIn(values.buyIn, settings.minBuyIn, settings.maxBuyIn);
          },
        },
      );
      this.fundingDialog = false;
      if (!selected) return false;
      buyIn = selected.buyIn;
    }
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.joinTable({
        tableId,
        lobbyMemberId: member.id,
        buyIn,
      });
    } catch (error: unknown) {
      if (
        fromLink &&
        /Game already (started|ended)/i.test(errorMessage(error))
      ) {
        this.busy = false;
        return await this.spectateTable(tableId);
      }
      const message = joinFailureMessage(error, 'Could not join the table');
      if (
        message === 'Already seated' &&
        this.memberSeatedHere(tableId, member.id)
      ) {
        this.onSeated(tableId, member.id);
        return true;
      }
      this.setError(message);
      return false;
    } finally {
      this.busy = false;
    }
    this.render();
    this.onSeated(tableId, member.id);
    return true;
  }

  private async spectateTable(tableId: string): Promise<boolean> {
    if (this.busy || this.lobbyId.length === 0) {
      return false;
    }
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    if (!member) {
      this.setError('Join the room first');
      return false;
    }
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.spectateTable({
        tableId,
        lobbyMemberId: member.id,
      });
    } catch (error: unknown) {
      const message = joinFailureMessage(error, 'Could not watch the table');
      if (
        message === 'Already watching' &&
        this.memberWatchingHere(tableId, member.id)
      ) {
        this.onSeated(tableId, member.id);
        return true;
      }
      this.setError(message);
      return false;
    } finally {
      this.busy = false;
    }
    this.render();
    this.onSeated(tableId, member.id);
    return true;
  }

  private memberSeatedHere(tableId: string, lobbyMemberId: string): boolean {
    for (const seat of this.connection.db.gameSeat.iter()) {
      if (seat.tableId === tableId && seat.lobbyMemberId === lobbyMemberId) {
        return true;
      }
    }
    return false;
  }

  private memberWatchingHere(tableId: string, lobbyMemberId: string): boolean {
    for (const row of this.connection.db.spectator.iter()) {
      if (row.tableId === tableId && row.lobbyMemberId === lobbyMemberId) {
        return true;
      }
    }
    return false;
  }

  private render(): void {
    this.renderLeaderboard();
    if (!this.panelReady || this.lobbyId.length === 0) {
      return;
    }
    const seats = this.readSeats();
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    const lines = tableLines(
      this.readTables(),
      seats,
      this.lobbyId,
      seatedTableIds(seats, member?.id ?? ''),
      watchingTableIds(this.readSpectators(), member?.id ?? ''),
    );
    const mobile = isMobileDevice();
    this.tablePages = Math.max(1, Math.ceil(lines.length / 3));
    this.tablePage = Math.min(this.tablePage, this.tablePages - 1);
    if (this.pagingButton) {
      this.pagingButton.graphics.isVisible = this.tablePages > 1;
      for (const child of this.pagingButton.children)
        (child as ex.Actor).graphics.isVisible = this.tablePages > 1;
      this.pagingButton.pointer.useColliderShape = this.tablePages > 1;
      this.pagingButton.pointer.useGraphicsBounds = this.tablePages > 1;
    }
    const ordered = [...lines].sort((a, b) => a.id.localeCompare(b.id));
    const shown = ordered.slice(this.tablePage * 3, this.tablePage * 3 + 3);
    const layout = listLayout(tableGroups(shown), mobile);
    if (this.emptyText) {
      this.emptyText.text = lines.length === 0 ? 'No tables' : '';
    }
    if (this.moreText) {
      this.moreText.text =
        this.tablePages > 1
          ? `Page ${this.tablePage + 1}/${this.tablePages}`
          : '';
    }
    for (const actor of this.rowActors) {
      actor.kill();
    }
    this.rowActors.length = 0;
    for (const slot of layout.slots) {
      this.rowActors.push(
        slot.kind === 'header' ? this.headerActor(slot) : this.rowActor(slot),
      );
    }
  }

  private headerActor(slot: Extract<ListSlot, { kind: 'header' }>): ex.Actor {
    const { list, header, row } = TABLE_LIST;
    const actor = new ex.Actor({
      pos: ex.vec(list.x, slot.y),
      anchor: ex.vec(0, 0),
      width: row.w,
      height: header.h,
      z: 20,
    });
    const name = slot.group.gameName.slice(0, 11).toUpperCase();
    const count = String(slot.group.lines.length);
    this.childLabel(actor, 0, 2, name, GOLD, PHONE_LAYOUT ? 12 : 8);
    this.childLabel(
      actor,
      row.w + tableGutter() * 2 - count.length * 8,
      2,
      count,
      DIM,
    );
    const rule = new ex.Actor({
      pos: ex.vec(0, header.h - 1),
      anchor: ex.vec(0, 0),
    });
    rule.graphics.use(solidRect(row.w, 2, STROKE));
    stretchLobbyActor(rule, row.w);
    actor.addChild(rule);
    anchorLobbyActor(actor);
    stretchLobbyActor(actor, TABLE_LIST.row.w);
    this.scene.add(actor);
    return actor;
  }

  private rowActor(slot: Extract<ListSlot, { kind: 'row' }>): ex.Actor {
    const { line } = slot;
    const row = TABLE_LIST.row;
    const actor = new ex.Actor({
      pos: ex.vec(TABLE_LIST.list.x, slot.y),
      anchor: ex.vec(0, 0),
      width: row.w,
      height: row.h,
      z: 20,
    });
    const face = panelRect(
      row.w,
      row.h,
      line.seated ? FIELD_SEATED : FIELD,
      line.seated ? STROKE_HOT : STROKE,
    );
    actor.graphics.use(face);
    const dbTable = [...this.connection.db.gameTable.iter()].find(
      (row) => row.id === line.id,
    );
    if (dbTable?.economyJson) {
      const settings = JSON.parse(dbTable.economyJson) as TableEconomy;
      const host =
        this.readMembers().find((row) => row.id === dbTable.hostMemberId)
          ?.name ?? 'Away';
      const stakes =
        dbTable.gameType === 'poker'
          ? `${settings.smallBlind}/${settings.bigBlind} | Buy-in ${settings.minBuyIn}+`
          : dbTable.gameType === 'blackjack'
            ? `Bet ${settings.minBet}-${settings.maxBet}`
            : `Entry ${settings.entryFee} chips`;
      const countdown =
        dbTable.startsAt === undefined
          ? `Host ${host.slice(0, 12)}`
          : `Starts ${Math.max(0, Math.ceil((Number(dbTable.startsAt / 1000n) - Date.now()) / 1000))}s`;
      this.childLabel(
        actor,
        8,
        58,
        stakes.slice(0, PHONE_LAYOUT ? 18 : 25),
        DIM,
        PHONE_LAYOUT ? 12 : 8,
      );
      this.childLabel(actor, 8, 78, countdown, DIM, PHONE_LAYOUT ? 12 : 8);
    }
    const full = line.currentSeats >= line.maxPlayers;
    const titleSize = PHONE_LAYOUT ? 12 : 10;
    const titleLimit = Math.floor(
      (row.w + tableGutter() * 2 - 208) / titleSize,
    );
    const [first, ...rest] = wrapText(line.tableName, titleLimit);
    const title =
      PHONE_LAYOUT && rest.length > 0
        ? `${(first ?? '').slice(0, titleLimit - 3)}...`
        : (first ?? '');
    this.childLabel(actor, 16, 12, title, GOLD, titleSize);
    const absence = [...this.connection.db.seatAbsence.iter()].find(
      (a) =>
        a.tableId === line.id &&
        this.readMembers().some(
          (m) => m.id === a.lobbyMemberId && m.clientId === this.clientId,
        ),
    );
    const returnLine =
      absence?.deadlineMicros === undefined
        ? 'Seat saved'
        : `Return ${Math.max(0, Math.ceil((Number(absence.deadlineMicros / 1000n) - Date.now()) / 1000))}s`;
    this.childLabel(
      actor,
      8,
      40,
      absence ? returnLine : `${line.seatsLabel} ${line.statusLabel}`,
      DIM,
      PHONE_LAYOUT ? 10 : 8,
    );
    if (line.seated) {
      this.seatBadge(actor, 176, 40);
    }
    // The card is informational. Only the two visible buttons accept a tap.
    this.silencePointer(actor);
    const mobile = isMobileDevice();
    const ended =
      line.statusLabel === 'Finished' && line.gameType !== 'blackjack';
    this.tableAction(
      actor,
      mobile ? MOBILE_JOIN_BUTTON : JOIN_BUTTON,
      line.seated ? 'Return' : ended ? 'Ended' : full ? 'Full' : 'Join',
      () => void this.joinTable(line.id),
      true,
      line.seated || (!full && !ended),
    );
    this.tableAction(
      actor,
      mobile ? MOBILE_WATCH_BUTTON : WATCH_BUTTON,
      'Watch',
      () => void this.spectateTable(line.id),
      line.watching,
      !line.seated,
    );
    anchorLobbyActor(actor);
    stretchLobbyActor(actor, TABLE_LIST.row.w);
    this.scene.add(actor);
    return actor;
  }

  private tableAction(
    row: ex.Actor,
    box: { x: number; y: number; w: number; h: number },
    label: string,
    activate: () => void,
    primary: boolean,
    enabled: boolean,
  ): void {
    // Scene actors participate in the shared CSS-pixel touch-target expansion.
    const button = new ex.Actor({
      pos: ex.vec(TABLE_LIST.list.x + box.x, row.pos.y + box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 21,
    });
    const fill = enabled && primary ? BUTTON : FIELD;
    const stroke = enabled ? STROKE : DIM;
    const face = panelRect(box.w, box.h, fill, stroke);
    button.graphics.use(face);
    const size = PHONE_LAYOUT ? 12 : BUTTON_FONT_SIZE;
    const rest = buttonCaptionPos(label, box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(label, size, enabled ? GOLD : DIM));
    this.silencePointer(caption);
    button.addChild(caption);
    if (enabled) {
      button.on('pointerenter', () => {
        face.strokeColor = STROKE_HOT;
      });
      bindButtonPress(
        button,
        () => {
          face.color = BUTTON_DOWN;
          caption.pos.y = rest.y + BUTTON_PRESS_SHIFT;
        },
        () => {
          face.color = fill;
          face.strokeColor = stroke;
          caption.pos.y = rest.y;
        },
        activate,
      );
    } else {
      this.silencePointer(button);
    }
    anchorTableActor(button, 'right', TABLE_LIST.list.x + box.x);
    this.scene.add(button);
    this.rowActors.push(button);
  }

  private seatBadge(parent: ex.Actor, x: number, y: number): void {
    const badge = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
    });
    badge.graphics.use(solidRect(28, 12, STROKE_HOT));
    parent.addChild(badge);
    const caption = new ex.Actor({
      pos: ex.vec(2, 2),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('YOU', 8, INK));
    badge.addChild(caption);
  }

  private readTables(): TableRow[] {
    const rows: TableRow[] = [];
    for (const table of this.connection.db.gameTable.iter()) {
      rows.push({
        id: table.id,
        lobbyId: table.lobbyId,
        gameType: table.gameType,
        name: table.name,
        statusTag: table.status.tag,
        maxPlayers: Number(table.maxPlayers),
      });
    }
    return rows;
  }

  private readSeats(): SeatRef[] {
    const rows: SeatRef[] = [];
    for (const seat of this.connection.db.gameSeat.iter()) {
      rows.push({
        tableId: seat.tableId,
        lobbyMemberId: seat.lobbyMemberId,
      });
    }
    return rows;
  }

  private readSpectators(): SeatRef[] {
    const rows: SeatRef[] = [];
    for (const row of this.connection.db.spectator.iter()) {
      rows.push({
        tableId: row.tableId,
        lobbyMemberId: row.lobbyMemberId,
      });
    }
    return rows;
  }

  private readMembers(): MemberRecord[] {
    const rows: MemberRecord[] = [];
    for (const member of this.connection.db.lobbyMember.iter()) {
      rows.push({
        id: member.id,
        lobbyId: member.lobbyId,
        clientId: member.clientId,
        name: member.name,
      });
    }
    return rows;
  }

  private setError(message: string): void {
    if (this.errorText) {
      const columns = Math.floor(
        (TABLE_LIST.row.w + tableGutter() * 2) / (PHONE_LAYOUT ? 10 : 8),
      );
      this.errorText.text = wrapText(message, columns).join('\n');
      if (PHONE_LAYOUT && this.statsActor) {
        this.statsActor.graphics.isVisible = message.length === 0;
      }
    }
  }

  private addLabel(
    x: number,
    y: number,
    text: string,
    size: number,
    color: ex.Color,
    parent?: ex.Actor,
  ): ex.Text {
    const graphic = canvasText(text, size, color);
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      z: parent ? 1 : 21,
    });
    actor.graphics.use(graphic);
    if (parent) {
      actor.pos = ex.vec(x - parent.pos.x, y - parent.pos.y);
      parent.addChild(actor);
    } else {
      anchorLobbyActor(actor);
      this.scene.add(actor);
    }
    return graphic;
  }

  private childLabel(
    parent: ex.Actor,
    x: number,
    y: number,
    text: string,
    color: ex.Color,
    size = 8,
  ): void {
    const graphic = canvasText(text, size, color);
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
    });
    actor.graphics.use(graphic);
    this.silencePointer(actor);
    parent.addChild(actor);
  }

  private silencePointer(actor: ex.Actor): void {
    actor.pointer.useColliderShape = false;
    actor.pointer.useGraphicsBounds = false;
  }

  private button(
    box: { x: number; y: number; w: number; h: number },
    caption: string,
    onPress: () => void,
    parent?: ex.Actor,
    claim = false,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: parent ? 2 : 20,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const sizeFor = (value: string): number =>
      buttonFontSize(value, box.w, box.h, PHONE_LAYOUT ? 12 : undefined);
    const size = sizeFor(caption);
    let captionText = canvasText(caption, size, GOLD);
    let rest = buttonCaptionPos(caption, box.w, box.h, size);
    const captionActor = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(captionText);
    this.silencePointer(captionActor);
    actor.addChild(captionActor);
    this.buttonCaptions.set(actor, (value) => {
      if (captionText.text === value) return;
      const size = sizeFor(value);
      captionText = canvasText(value, size, GOLD);
      captionActor.graphics.use(captionText);
      rest = buttonCaptionPos(value, box.w, box.h, size);
      captionActor.pos = ex.vec(rest.x, rest.y);
    });
    const claimEvent = (event: { cancel: () => void }): void => {
      if (claim) {
        event.cancel();
      }
    };
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      captionActor.pos = ex.vec(rest.x, rest.y);
    });
    actor.on('pointerdown', (event) => {
      claimEvent(event);
      face.color = BUTTON_DOWN;
      captionActor.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', (event) => {
      claimEvent(event);
      face.color = BUTTON;
      captionActor.pos = ex.vec(rest.x, rest.y);
      onPress();
    });
    if (parent) {
      actor.pos = ex.vec(box.x - parent.pos.x, box.y - parent.pos.y);
      parent.addChild(actor);
    } else {
      anchorLobbyActor(actor);
      this.scene.add(actor);
    }
    return actor;
  }
}
