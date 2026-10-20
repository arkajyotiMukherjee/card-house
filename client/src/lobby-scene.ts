import * as ex from 'excalibur';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { cardAtlas, pixelFont } from './boot-scene';
import { statsCaption } from './client-stats';
import { subscribeLobbyTables } from './connect';
import { joinFailureMessage, wrapTableError } from './join-errors';
import { tableToReopen } from './last-room';
import { roomComposer } from './room-composer';
import {
  IDLE_CARDS,
  IDLE_OPACITY,
  idleCardPose,
  type IdleCard,
} from './lobby-ambience';
import {
  bindCanvasTextField,
  eventTargetsHtmlField,
  refreshCanvasTextFields,
  type CanvasTextFieldHandle,
} from './html-field';
import {
  applyChatKey,
  applyChatText,
  CHAT_BODY_MAX,
  CHAT_PANEL,
  LEAVE_CONFIRM,
  LEAVE_ROOM,
  chatLines,
  clampPlayerCount,
  CREATE_TABLE,
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
  watchHit,
  watchingTableIds,
  type ChatLine,
  type ChatMessageRow,
  type ListSlot,
  type MemberRecord,
  type SeatRef,
  type TableRow,
} from './lobby';
import type { DbConnection } from './module_bindings';

const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const FIELD = ex.Color.fromHex('#0b2418');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const DANGER = ex.Color.fromHex('#e85d4c');
const PANEL = ex.Color.fromHex('#0a2e1c');
const WAITING = ex.Color.fromHex('#3dd68c');
const PLAYING = ex.Color.fromHex('#e6c27a');
const FIELD_SEATED = ex.Color.fromHex('#1a4a2c');
const INK = ex.Color.fromHex('#0a2e1c');
const BANNER_FILL = ex.Color.fromHex('#0a2e1c');

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
  private gameIndex = 0;
  private variationIndex = 0;
  private maxPlayers = gameOption(0).maxPlayers;
  private readonly rowActors: ex.Actor[] = [];
  private emptyText: ex.Text | undefined;
  private moreText: ex.Text | undefined;
  private codeText: ex.Text | undefined;
  private codeActor: ex.Actor | undefined;
  private errorText: ex.Text | undefined;
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
  private chatErrorText: ex.Text | undefined;
  private leaveConfirm: ex.Actor | undefined;
  private leavingRoom = false;

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

  setStats(line: string): void {
    this.statsText.text = line;
  }

  mount(): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
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
    this.connection.db.lobby.onDelete(() => {
      this.paintDiscordBadge();
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
    this.onSeated(openId, member.id);
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

    this.addLabel(808, 52, 'Tables', 8, DIM);
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
      8,
      DANGER,
    );
    this.button(TABLE_LIST.create, 'Create Table', () => {
      this.openCreate();
    });
    this.buildPopup();
    this.buildBanner();
    this.buildIdleCards();
    this.buildChatPanel();
    this.buildLeaveRoom();
    const stats = new ex.Actor({
      pos: ex.vec(170, 500),
      anchor: ex.vec(0, 0),
      z: 20,
    });
    stats.graphics.use(this.statsText);
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
      field.x + 6,
      field.y + Math.round((field.h - BUTTON_FONT_SIZE) / 2),
      '_',
      BUTTON_FONT_SIZE,
      GOLD,
    );
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
        !this.leaveConfirm,
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
    this.scene.add(panel);
    this.childLabel(panel, 16, 20, 'Leave the room?', GOLD);
    this.childLabel(
      panel,
      16,
      40,
      "You'll lose your seats at all tables.",
      DIM,
    );
    this.button(
      LEAVE_CONFIRM.leave,
      'Leave',
      () => {
        void this.confirmLeave();
      },
      panel,
    );
    this.button(
      LEAVE_CONFIRM.cancel,
      'Cancel',
      () => {
        this.closeLeaveConfirm();
      },
      panel,
    );
    this.leaveConfirm = panel;
    refreshCanvasTextFields();
  }

  private closeLeaveConfirm(): void {
    this.leaveConfirm?.kill();
    this.leaveConfirm = undefined;
    refreshCanvasTextFields();
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
      this.closeLeaveConfirm();
      this.lobbyId = '';
      this.lobbyCode = '';
      this.leavingRoom = false;
      this.onLeftRoom();
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
    if (!this.chatInputBox || !this.chatInputText) {
      return;
    }
    const field = CHAT_PANEL.field;
    this.chatInputBox.graphics.use(
      panelRect(
        field.w,
        field.h,
        FIELD,
        this.chatFocused ? STROKE_HOT : STROKE,
      ),
    );
    this.chatInputText.text =
      this.chatBody.length > 0
        ? this.chatBody.slice(-58)
        : this.chatFocused
          ? '_'
          : 'Say something...';
    this.chatInputText.color = this.chatBody.length > 0 ? GOLD : DIM;
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
    const { list } = CHAT_PANEL;
    const capacity = Math.floor((list.bottom - list.y) / list.lineH);
    const visible = lines.slice(Math.max(0, lines.length - capacity));
    for (let index = 0; index < visible.length; index += 1) {
      const line = visible[index];
      if (!line) {
        continue;
      }
      this.chatMessageActors.push(this.chatLineActor(line, index));
    }
  }

  private chatLineActor(line: ChatLine, index: number): ex.Actor {
    const { list } = CHAT_PANEL;
    const y = list.y + index * list.lineH;
    const actor = new ex.Actor({
      pos: ex.vec(list.x, y),
      anchor: ex.vec(0, 0),
      z: 16,
    });
    const text = `${line.name}: ${line.body}`.slice(0, 76);
    actor.graphics.use(canvasText(text, 8, line.self ? STROKE_HOT : GOLD));
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

  private buildIdleCards(): void {
    for (const idle of IDLE_CARDS) {
      this.scene.add(this.idleCardActor(idle));
    }
  }

  private idleCardActor(idle: IdleCard): ex.Actor {
    const sprite =
      idle.card === 'back' ? cardAtlas.back() : cardAtlas.sprite(idle.card);
    sprite.scale = ex.vec(2, 2);
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
    this.addLabel(204, 156, 'Create Table', 8, GOLD, popup);
    this.addLabel(204, 180, 'Game', 8, DIM, popup);
    this.gameText = this.addLabel(204, 196, gameOption(0).name, 8, GOLD, popup);
    this.addLabel(420, 180, 'Max', 8, DIM, popup);
    this.maxText = this.addLabel(
      420,
      196,
      String(this.maxPlayers),
      8,
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
    this.dealLabel = this.addLabel(420, 252, '', 8, DIM, popup);
    this.variationText = this.addLabel(420, 276, '', 8, GOLD, popup);
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
    this.variationIndex = 0;
    this.paintChoice();
    this.setPopupOpen(true);
  }

  private closeCreate(): void {
    this.creating = false;
    this.setPopupOpen(false);
  }

  private setPopupOpen(open: boolean): void {
    if (!this.popup) {
      return;
    }
    this.popup.pos = open
      ? ex.vec(CREATE_TABLE.panel.x, CREATE_TABLE.panel.y)
      : ex.vec(CREATE_TABLE.panel.x, -400);
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
      actor.graphics.isVisible = poker;
    }
  }

  private async createTable(): Promise<void> {
    if (this.busy || !this.creating || this.lobbyId.length === 0) {
      return;
    }
    const game = gameOption(this.gameIndex);
    const maxPlayers = clampPlayerCount(game, this.maxPlayers);
    const tableName = nextTableName(this.readTables(), this.lobbyId, game);
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

  private async joinTable(tableId: string): Promise<void> {
    if (this.busy || this.lobbyId.length === 0) {
      return;
    }
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    if (!member) {
      this.setError('Join the room first');
      return;
    }
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.joinTable({
        tableId,
        lobbyMemberId: member.id,
      });
    } catch (error: unknown) {
      const message = joinFailureMessage(error, 'Could not join the table');
      if (
        message === 'Already seated' &&
        this.memberSeatedHere(tableId, member.id)
      ) {
        this.onSeated(tableId, member.id);
        return;
      }
      this.setError(message);
      return;
    } finally {
      this.busy = false;
    }
    this.render();
    this.onSeated(tableId, member.id);
  }

  private async spectateTable(tableId: string): Promise<void> {
    if (this.busy || this.lobbyId.length === 0) {
      return;
    }
    const member = memberByClient(
      this.readMembers(),
      this.lobbyId,
      this.clientId,
    );
    if (!member) {
      this.setError('Join the room first');
      return;
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
        return;
      }
      this.setError(message);
      return;
    } finally {
      this.busy = false;
    }
    this.render();
    this.onSeated(tableId, member.id);
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
    const layout = listLayout(tableGroups(lines));
    if (this.emptyText) {
      this.emptyText.text = lines.length === 0 ? 'No tables' : '';
    }
    if (this.moreText) {
      this.moreText.text = layout.hidden > 0 ? `+${layout.hidden} more` : '';
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
    this.childLabel(actor, 0, 2, name, GOLD);
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
    const restStroke = line.seated ? STROKE_HOT : STROKE;
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
    this.childLabel(actor, 16, 4, line.tableName, GOLD);
    this.childLabel(
      actor,
      16,
      17,
      `${line.seatsLabel} ${line.statusLabel}`,
      DIM,
    );
    if (line.seated) {
      this.seatBadge(actor, row.w - 33, 3);
    } else {
      this.watchControl(actor, line.watching);
    }
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = restStroke;
    });
    actor.on('pointerup', (event) => {
      const localX = event.worldPos.x - actor.pos.x;
      const localY = event.worldPos.y - actor.pos.y;
      if (!line.seated && (full || watchHit(localX, localY))) {
        void this.spectateTable(line.id);
        return;
      }
      void this.joinTable(line.id);
    });
    this.scene.add(actor);
    return actor;
  }

  private watchControl(parent: ex.Actor, watching: boolean): void {
    const box = WATCH_BUTTON;
    const button = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
    });
    button.pointer.useGraphicsBounds = false;
    button.pointer.useColliderShape = false;
    button.graphics.use(
      solidRect(box.w, box.h, watching ? STROKE_HOT : BUTTON),
    );
    parent.addChild(button);
    const caption = new ex.Actor({
      pos: ex.vec(4, 2),
      anchor: ex.vec(0, 0),
    });
    caption.pointer.useGraphicsBounds = false;
    caption.pointer.useColliderShape = false;
    const watchLabel = buttonCaptionPos('Watch', box.w, box.h);
    caption.pos = ex.vec(watchLabel.x, watchLabel.y);
    caption.graphics.use(
      canvasText('Watch', BUTTON_FONT_SIZE, watching ? INK : GOLD),
    );
    button.addChild(caption);
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
      this.errorText.text = wrapTableError(message);
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
  ): void {
    const graphic = canvasText(text, 8, color);
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
    });
    actor.graphics.use(graphic);
    parent.addChild(actor);
  }

  private button(
    box: { x: number; y: number; w: number; h: number },
    caption: string,
    onPress: () => void,
    parent?: ex.Actor,
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
    const captionText = canvasText(caption, BUTTON_FONT_SIZE, GOLD);
    const rest = buttonCaptionPos(caption, box.w, box.h);
    const captionActor = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(captionText);
    actor.addChild(captionActor);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      captionActor.pos = ex.vec(rest.x, rest.y);
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      captionActor.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
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
