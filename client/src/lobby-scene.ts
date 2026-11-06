import * as ex from 'excalibur';
import { bindButtonPress } from './button-press';
import { isMobileDevice } from './mobile-shell';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import { personalCardAtlas, pixelFont } from './boot-scene';
import { statsCaption } from './client-stats';
import { subscribeLobbyTables } from './connect';
import { joinFailureMessage, wrapTableError } from './join-errors';
import { showLobbyUrl, tableCodeForId } from './join-path';
import { tableToReopen } from './last-room';
import { roomComposer } from './room-composer';
import { wrapText } from './menu-layout';
import {
  IDLE_CARDS,
  IDLE_OPACITY,
  idleCardPose,
  type IdleCard,
} from './lobby-ambience';
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
const WAITING = ex.Color.fromHex('#3dd68c');
const PLAYING = ex.Color.fromHex('#e6c27a');
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
  private maxPlayers = gameOption(0).maxPlayers;
  private readonly rowActors: ex.Actor[] = [];
  private emptyText: ex.Text | undefined;
  private moreText: ex.Text | undefined;
  private tablePage = 0;
  private tablePages = 1;
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
  private readonly idleCards: Array<{ actor: ex.Actor; idle: IdleCard }> = [];

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
    return this.creating || this.leaveConfirm !== undefined;
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
      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        if (
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
    this.connection.db.lobbyChatMessage.onInsert(() => {
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
    this.connection.db.lobbyMember.onUpdate(() => {
      this.renderChat();
    });
    this.bindChatKeyboard();
    roomComposer.watch(() => {
      this.chatFocused = roomComposer.active() === 'chat';
      this.paintChatField();
    });
  }

  openLobby(lobbyId: string, code = ''): Promise<boolean> {
    this.returnedToMenu = false;
    if (this.lobbyId !== lobbyId) showLobbyUrl(code);
    this.lobbyId = lobbyId;
    this.lobbyCode = code;
    this.closeLeaveConfirm();
    this.ensurePanel();
    this.refreshCards();
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
    const box = TABLE_LIST.panel;
    const backdrop = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 15,
    });
    backdrop.graphics.use(panelRect(box.w, box.h, PANEL, STROKE));
    this.scene.add(backdrop);

    if (!PHONE_LAYOUT) this.addLabel(TABLE_LIST.list.x, 52, 'Tables', 8, DIM);
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
      PHONE_LAYOUT ? 16 : TABLE_LIST.error.x,
      PHONE_LAYOUT ? 510 : TABLE_LIST.error.y,
      '',
      PHONE_LAYOUT ? 10 : 8,
      DANGER,
    );
    this.button(TABLE_LIST.create, 'Create Table', () => {
      this.openCreate();
    });
    if (isMobileDevice()) {
      this.button(
        { x: TABLE_LIST.list.x, y: 464, w: TABLE_LIST.row.w, h: 64 },
        'Next page',
        () => {
          this.tablePage = (this.tablePage + 1) % this.tablePages;
          this.render();
        },
      );
    }
    this.buildPopup();
    this.buildBanner();
    this.buildIdleCards();
    this.buildChatPanel();
    this.buildLeaveRoom();
    const stats = new ex.Actor({
      pos: ex.vec(PHONE_LAYOUT ? 222 : 170, PHONE_LAYOUT ? 514 : 500),
      anchor: ex.vec(0, 0),
      z: 20,
    });
    stats.graphics.use(this.statsText);
    this.statsActor = stats;
    this.scene.add(stats);
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
    this.scene.add(this.chatInputBox);
    this.chatInputText = this.addLabel(
      chatMetrics.x,
      chatMetrics.y,
      '',
      chatMetrics.size,
      GOLD,
    );
    this.chatCaret = makeFieldCaret(chatMetrics.size, 22);
    this.scene.add(this.chatCaret);
    this.chatInputBox.on('pointerup', () => {
      roomComposer.focus('chat');
    });
    this.chatField = bindCanvasTextField({
      id: 'lobby-chat',
      label: 'Chat',
      box: CHAT_PANEL.field,
      maxLength: CHAT_BODY_MAX,
      active: () =>
        this.engine.currentScene === this.scene &&
        this.lobbyId.length > 0 &&
        !this.leaveConfirm &&
        !this.creating,
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
      metrics: chatFieldLabel(CHAT_PANEL.field),
      onCaret: () => {
        this.paintChatField();
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

  private paintChatField(): void {
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
      ? (this.chatField?.selectionIndex() ?? this.chatBody.length)
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
    if (!this.panelReady || this.lobbyId.length === 0) {
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

  /** Repaints idle cards after a Theme change or when the lobby is shown again. */
  refreshCards(): void {
    for (const row of this.idleCards) {
      row.actor.graphics.use(this.idleSprite(row.idle));
      row.actor.graphics.opacity = IDLE_OPACITY;
    }
  }

  private buildIdleCards(): void {
    for (const idle of IDLE_CARDS) {
      const actor = this.idleCardActor(idle);
      this.idleCards.push({ actor, idle });
      this.scene.add(actor);
    }
  }

  private idleSprite(idle: IdleCard): ex.Sprite {
    const mine = personalCardAtlas();
    const sprite = idle.card === 'back' ? mine.back() : mine.sprite(idle.card);
    sprite.scale = ex.vec(2, 2);
    return sprite;
  }

  private idleCardActor(idle: IdleCard): ex.Actor {
    const sprite = this.idleSprite(idle);
    const actor = new ex.Actor({
      pos: ex.vec(idle.x, idle.y),
      anchor: ex.vec(0.5, 0.5),
      z: 2,
    });
    actor.graphics.use(sprite);
    actor.graphics.opacity = IDLE_OPACITY;
    actor.pointer.useColliderShape = false;
    actor.pointer.useGraphicsBounds = false;
    let elapsed = 0;
    actor.on('postupdate', (event) => {
      elapsed += event.elapsed;
      const pose = idleCardPose(idle, elapsed);
      actor.pos = ex.vec(pose.x, pose.y);
      actor.rotation = pose.rotation;
    });
    return actor;
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
      PHONE_LAYOUT ? 184 : 204,
      PHONE_LAYOUT ? 54 : 156,
      'Create Table',
      PHONE_LAYOUT ? 18 : 8,
      GOLD,
      popup,
    );
    this.addLabel(
      PHONE_LAYOUT ? 288 : 204,
      PHONE_LAYOUT ? 100 : 180,
      'Game',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.gameText = this.addLabel(
      PHONE_LAYOUT ? 288 : 204,
      PHONE_LAYOUT ? 132 : 196,
      gameOption(0).name,
      PHONE_LAYOUT ? 16 : 8,
      GOLD,
      popup,
    );
    this.addLabel(
      PHONE_LAYOUT ? 288 : 420,
      PHONE_LAYOUT ? 200 : 180,
      PHONE_LAYOUT ? 'Max players' : 'Max',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.maxText = this.addLabel(
      PHONE_LAYOUT ? 288 : 420,
      PHONE_LAYOUT ? 232 : 196,
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
      PHONE_LAYOUT ? 288 : 420,
      PHONE_LAYOUT ? 300 : 252,
      '',
      PHONE_LAYOUT ? 12 : 8,
      DIM,
      popup,
    );
    this.variationText = this.addLabel(
      PHONE_LAYOUT ? 288 : 420,
      PHONE_LAYOUT ? 332 : 276,
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
    const nameField = bindCanvasTextField({
      id: 'table-name',
      label: 'Table name (optional)',
      box: name,
      maxLength: 32,
      active: () => this.creating && this.engine.currentScene === this.scene,
      read: () => this.tableNameDraft,
      sanitize: (value) => applyChatText(value).slice(0, 32),
      write: (value) => {
        this.tableNameDraft = value;
        if (this.tableNameText) this.tableNameText.text = value;
      },
      submit: () => void this.createTable(),
      cancel: () => this.closeCreate(),
      metrics,
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

  private async createTable(): Promise<void> {
    if (this.busy || !this.creating || this.lobbyId.length === 0) {
      return;
    }
    const game = gameOption(this.gameIndex);
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
        settings: tableSettingsJson(
          game.minPlayers,
          maxPlayers,
          tableName,
          variation,
        ),
      });
    } catch (error: unknown) {
      this.setError(errorMessage(error));
      return;
    } finally {
      this.busy = false;
    }
    this.closeCreate();
    this.render();
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
    const table = fromLink
      ? [...this.connection.db.gameTable.iter()].find(
          (row) => row.id === tableId,
        )
      : undefined;
    if (
      fromLink &&
      table?.status.tag !== 'WaitingForPlayers' &&
      !this.memberSeatedHere(tableId, member.id)
    ) {
      return this.spectateTable(tableId);
    }
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.joinTable({
        tableId,
        lobbyMemberId: member.id,
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
    this.tablePages = Math.max(1, Math.ceil(lines.length / 2));
    this.tablePage = Math.min(this.tablePage, this.tablePages - 1);
    const ordered = [...lines].sort((a, b) => a.id.localeCompare(b.id));
    const shown = mobile
      ? ordered.slice(this.tablePage * 2, this.tablePage * 2 + 2)
      : lines;
    const layout = listLayout(tableGroups(shown), mobile);
    if (this.emptyText) {
      this.emptyText.text = lines.length === 0 ? 'No tables' : '';
    }
    if (this.moreText) {
      this.moreText.text = mobile
        ? ''
        : layout.hidden > 0
          ? `+${layout.hidden} more`
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
    this.childLabel(actor, row.w - count.length * 8, 2, count, DIM);
    const rule = new ex.Actor({
      pos: ex.vec(0, header.h - 1),
      anchor: ex.vec(0, 0),
    });
    rule.graphics.use(solidRect(row.w, 2, STROKE));
    actor.addChild(rule);
    this.scene.add(actor);
    return actor;
  }

  private rowActor(slot: Extract<ListSlot, { kind: 'row' }>): ex.Actor {
    const { line } = slot;
    const row = isMobileDevice()
      ? { ...TABLE_LIST.row, h: 128 }
      : TABLE_LIST.row;
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
    const full = line.currentSeats >= line.maxPlayers;
    const dot = new ex.Rectangle({
      width: 6,
      height: 6,
      color:
        full || line.statusLabel === 'Finished'
          ? DANGER
          : line.statusLabel === 'In Progress'
            ? PLAYING
            : WAITING,
      smoothing: false,
    });
    const dotActor = new ex.Actor({
      pos: ex.vec(6, 6),
      anchor: ex.vec(0, 0),
    });
    dotActor.graphics.use(dot);
    actor.addChild(dotActor);
    const titleSize = PHONE_LAYOUT ? 14 : 8;
    const titleLimit = Math.floor(
      (row.w - 24 - (line.seated ? 30 : 0)) / titleSize,
    );
    const [first, ...rest] = wrapText(line.tableName, titleLimit);
    const title =
      PHONE_LAYOUT && rest.length > 0
        ? `${(first ?? '').slice(0, titleLimit - 3)}...`
        : (first ?? '');
    this.childLabel(actor, 16, 4, title, GOLD, titleSize);
    if (!PHONE_LAYOUT && rest.length > 0) {
      const tail = rest.join(' ');
      this.childLabel(
        actor,
        8,
        17,
        tail.length > 15 ? `${tail.slice(0, 12)}...` : tail,
        GOLD,
      );
    }
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
      PHONE_LAYOUT ? 24 : 30,
      absence ? returnLine : `${line.seatsLabel} ${line.statusLabel}`,
      DIM,
      PHONE_LAYOUT ? 12 : 8,
    );
    if (line.seated) {
      this.seatBadge(actor, row.w - 33, 3);
    }
    // The card is informational. Only the two visible buttons accept a tap.
    this.silencePointer(actor);
    const mobile = isMobileDevice();
    this.tableAction(
      actor,
      mobile ? MOBILE_JOIN_BUTTON : JOIN_BUTTON,
      line.seated ? 'Return' : full ? 'Full' : 'Join',
      () => void this.joinTable(line.id),
      true,
      !full || line.seated,
    );
    this.tableAction(
      actor,
      mobile ? MOBILE_WATCH_BUTTON : WATCH_BUTTON,
      'Watch',
      () => void this.spectateTable(line.id),
      line.watching,
      !line.seated,
    );
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
      pos: row.pos.add(ex.vec(box.x, box.y)),
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
      this.errorText.text = PHONE_LAYOUT
        ? wrapText(message, 60).slice(0, 2).join('\n')
        : wrapTableError(message);
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
    const size = PHONE_LAYOUT ? 12 : buttonFontSize(caption, box.w, box.h);
    const captionText = canvasText(caption, size, GOLD);
    const rest = buttonCaptionPos(caption, box.w, box.h, size);
    const captionActor = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(captionText);
    this.silencePointer(captionActor);
    actor.addChild(captionActor);
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
      this.scene.add(actor);
    }
    return actor;
  }
}
