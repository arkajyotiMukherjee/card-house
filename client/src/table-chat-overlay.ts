import { bindButtonPress } from './button-press';
import * as ex from 'excalibur';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import {
  BUTTON,
  BUTTON_DOWN,
  canvasText,
  CHAT_OTHER_SENDER,
  CHAT_SEND,
  CHAT_SEND_DOWN,
  CHAT_SYSTEM_MESSAGE,
  DANGER,
  GOLD,
  makeFieldCaret,
  panelRect,
  PLATE,
  SELF,
  showFieldCaret,
  STROKE,
  STROKE_HOT,
} from './canvas-ui';
import {
  TABLE_CHAT_BUTTON,
  TABLE_CHAT_INPUT,
  TABLE_CHAT_PANEL,
  TABLE_CHAT_SEND_BUTTON,
  TABLE_CHAT_TEXT,
  type MemberRef,
} from './game-scene';
import {
  bindCanvasTextField,
  eventTargetsHtmlField,
  fieldLabelColumns,
  layoutFieldCaret,
  type CanvasTextFieldHandle,
  type FieldLabel,
} from './html-field';
import { wrapChatLines } from './chat-layout';
import { wrapText } from './menu-layout';
import type { DbConnection } from './module_bindings';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';
import {
  applyChatKey,
  applyChatText,
  tableChatButtonVisible,
  tableChatSender,
  tableChatMessagesForTable,
  TABLE_CHAT_BODY_MAX,
  type ChatLobbyRef,
  type ChatTableRef,
  type TableChatRow,
} from './table-chat';

const BACKDROP = new ex.Color(0, 0, 0, 0.65);
const Z_BACKDROP = 100;
const Z_BUTTON = 103;
const Z_PANEL = 101;
const Z_TEXT = 102;
const FIELD = ex.Color.fromHex('#0b2418');
const CHAT_TEXT_PAD = 6;

function tableChatLabel(): FieldLabel {
  const box = TABLE_CHAT_INPUT;
  const size = box.h >= 60 ? 16 : BUTTON_FONT_SIZE;
  return {
    size,
    x: box.x + CHAT_TEXT_PAD,
    y: box.y + Math.round((box.h - size) / 2),
    columns: fieldLabelColumns(box.w, CHAT_TEXT_PAD, size),
  };
}

interface WaitingTable {
  name: string;
  seated: number;
  capacity: number;
  minimum: number;
  start?: () => void;
  leave: () => void;
}

/**
 * Per-table chat drawn on top of the table. Scoped to one `GameTable`:
 * `setTable` resets the draft and history when the table id changes, and
 * `send_table_chat` on the module rejects a sender who is not seated or
 * watching that table, so a message never reaches the rest of the lobby.
 * A solo lobby hides the Chat button. A shared table keeps it.
 */
export class TableChatOverlay {
  private opened = false;
  private waiting?: WaitingTable;
  private waitingDetails?: ex.Text;
  private waitingSeats?: ex.Text;
  private startControl?: ex.Actor;
  private startLabel?: ex.Text;
  private tableId = '';
  private lobbyMemberId = '';
  private draft = '';
  private sending = false;
  private chatAvailable = true;
  private button!: ex.Actor;
  private chatCaption!: ex.Actor;
  private overlayActors: ex.Actor[] = [];
  private lineTexts: { sender: ex.Text; body: ex.Text; bodyActor: ex.Actor }[] =
    [];
  private inputField: ex.Text | undefined;
  private inputCaret: ex.Actor | undefined;
  private errorText: ex.Text | undefined;
  private readonly composer: CanvasTextFieldHandle;

  constructor(
    private readonly scene: ex.Scene,
    private readonly connection: DbConnection,
    private readonly clientId: string,
    private readonly readMembers: () => Iterable<MemberRef>,
    private readonly onBeforeOpen: () => void,
  ) {
    this.composer = bindCanvasTextField({
      id: 'table-chat',
      label: 'Chat',
      box: TABLE_CHAT_INPUT,
      maxLength: TABLE_CHAT_BODY_MAX,
      active: () => this.opened,
      read: () => this.draft,
      sanitize: (value) => applyChatText(value, TABLE_CHAT_BODY_MAX),
      write: (value) => {
        if (this.sending) {
          this.composer.sync();
          return;
        }
        this.draft = value;
        this.paintInput();
      },
      submit: () => {
        this.send();
      },
      cancel: () => {
        if (!this.waiting) this.close();
      },
      enterKeyHint: 'send',
      autoCapitalize: 'off',
      metrics: tableChatLabel(),
      onCaret: () => {
        this.paintInput();
      },
    });
    this.buildButton();
    this.connection.db.lobby.onInsert(() => {
      this.refreshChatButton();
    });
    this.connection.db.lobby.onUpdate(() => {
      this.refreshChatButton();
    });
    this.connection.db.gameTable.onInsert(() => {
      this.refreshChatButton();
    });
    this.refreshChatButton();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** Resets the draft and clears stale history when the table changes. */
  setTable(tableId: string, lobbyMemberId: string): void {
    const changed = this.tableId !== tableId;
    this.tableId = tableId;
    this.lobbyMemberId = lobbyMemberId;
    if (changed) {
      this.draft = '';
      this.waiting = undefined;
      if (this.opened) {
        this.close();
      }
    }
    this.refreshChatButton();
  }

  setWaiting(waiting: WaitingTable | undefined): void {
    const wasWaiting = Boolean(this.waiting);
    this.waiting = waiting;
    if (wasWaiting !== Boolean(waiting)) this.close();
    if (!waiting) return;
    this.open(false);
    if (this.waitingDetails)
      this.waitingDetails.text = waiting.name.slice(0, 32);
    if (this.waitingSeats) {
      this.waitingSeats.text = `${waiting.seated}/${waiting.capacity} seated`;
    }
    if (this.startControl && this.startLabel) {
      const visible = waiting.start !== undefined;
      this.startControl.graphics.isVisible = visible;
      this.startControl.pointer.useColliderShape = visible;
      this.startControl.pointer.useGraphicsBounds = visible;
      this.startLabel.text = visible ? 'Start Game' : '';
      this.startLabel.color = waiting.seated >= waiting.minimum ? GOLD : STROKE;
    }
  }

  toggle(): void {
    if (this.waiting) return;
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  open(focus = true): void {
    if (!this.chatAvailable || this.opened || this.tableId.length === 0) {
      return;
    }
    this.onBeforeOpen();
    this.opened = true;
    this.buildOverlay();
    this.refresh();
    this.composer.refresh();
    if (focus) this.composer.focus();
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    for (const actor of this.overlayActors) {
      actor.kill();
    }
    this.overlayActors = [];
    this.lineTexts = [];
    this.waitingDetails = undefined;
    this.waitingSeats = undefined;
    this.startControl = undefined;
    this.startLabel = undefined;
    this.inputField = undefined;
    this.inputCaret = undefined;
    this.errorText = undefined;
    this.composer.refresh();
  }

  /** Repaints the history from the subscribed `TableChatMessage` rows. */
  refresh(): void {
    if (!this.opened) {
      return;
    }
    const rows = tableChatMessagesForTable(
      readChatRows(this.connection),
      this.tableId,
    );
    const members = [...this.readMembers()];
    const lines = rows.flatMap((row) => {
      const name = tableChatSender(row, members, this.lobbyMemberId);
      return wrapChatLines(name, row.body, TABLE_CHAT_TEXT.columns).map(
        (line) => ({
          ...line,
          system: !name,
          self: row.lobbyMemberId === this.lobbyMemberId,
        }),
      );
    });
    const slice = lines.slice(-TABLE_CHAT_TEXT.rows);
    this.lineTexts.forEach((line, index) => {
      const entry = slice[index];
      line.sender.text = entry?.sender ?? '';
      line.sender.color = entry?.self ? GOLD : CHAT_OTHER_SENDER;
      line.body.text = entry?.body ?? '';
      line.body.color = entry?.system ? CHAT_SYSTEM_MESSAGE : SELF;
      line.bodyActor.pos.x =
        TABLE_CHAT_PANEL.x +
        TABLE_CHAT_TEXT.padding +
        (entry?.indent ?? 0) * TABLE_CHAT_TEXT.size;
    });
  }

  /** Returns true when the key was consumed by the chat overlay. */
  handleKey(evt: ex.KeyEvent): boolean {
    if (!this.opened) {
      return false;
    }
    if (eventTargetsHtmlField(evt.originalEvent)) {
      return true;
    }
    if (evt.key === ex.Keys.Escape) {
      if (!this.waiting) this.close();
      return true;
    }
    if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
      return true;
    }
    if (evt.key === ex.Keys.Backspace) {
      this.draft = applyChatKey(this.draft, 'Backspace', TABLE_CHAT_BODY_MAX);
      this.paintInput();
      return true;
    }
    if (evt.key === ex.Keys.Enter) {
      this.send();
      return true;
    }
    const typed = evt.value ?? '';
    if (typed.length === 1) {
      this.draft = applyChatKey(this.draft, typed, TABLE_CHAT_BODY_MAX);
      this.paintInput();
    }
    return true;
  }

  private send(): void {
    const body = this.draft.trim();
    if (body.length === 0 || this.sending || this.tableId.length === 0) {
      return;
    }
    this.sending = true;
    const tableId = this.tableId;
    const clientId = this.clientId;
    this.showError('');
    void this.connection.reducers
      .sendTableChat({ tableId, clientId, body })
      .then(() => {
        this.draft = '';
        this.paintInput();
        this.composer.sync();
      })
      .catch((error: unknown) => {
        this.showError(
          error instanceof Error ? error.message : 'Could not send',
        );
      })
      .finally(() => {
        this.sending = false;
      });
  }

  private paintInput(): void {
    if (!this.inputField || !this.inputCaret) {
      return;
    }
    const metrics = tableChatLabel();
    const layout = layoutFieldCaret({
      value: this.draft,
      index: this.composer.selectionIndex(),
      size: metrics.size,
      originX: metrics.x,
      originY: metrics.y,
      columns: metrics.columns,
    });
    this.inputField.text = layout.text;
    showFieldCaret(this.inputCaret, true, layout.x, layout.y);
  }

  showError(message: string, color = DANGER): void {
    if (this.errorText) {
      this.errorText.color = color;
      this.errorText.text = wrapText(message, TABLE_CHAT_TEXT.columns)
        .slice(0, 1)
        .join('');
    }
  }

  private track(actor: ex.Actor): ex.Actor {
    this.overlayActors.push(actor);
    this.scene.add(actor);
    return actor;
  }

  private buildButton(): void {
    const box = TABLE_CHAT_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: Z_BUTTON,
    });
    const face = panelRect(box.w, box.h, PLATE, STROKE);
    actor.graphics.use(face);
    const size = buttonFontSize('Chat', box.w, box.h);
    const rest = buttonCaptionPos('Chat', box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Chat', size, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      if (!this.chatAvailable) {
        return;
      }
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        if (!this.chatAvailable) {
          return;
        }
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        if (!this.chatAvailable) {
          return;
        }
        face.strokeColor = STROKE;
        face.color = PLATE;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      () => {
        if (this.chatAvailable) this.toggle();
      },
    );
    this.button = actor;
    this.chatCaption = caption;
    this.scene.add(actor);
  }

  /** Hides Chat on a solo table and keeps it on a shared table. */
  private refreshChatButton(): void {
    const show = tableChatButtonVisible(
      this.tableId,
      readChatTables(this.connection),
      readChatLobbies(this.connection),
    );
    this.chatAvailable = show;
    this.button.graphics.isVisible = show;
    this.chatCaption.graphics.isVisible = show;
    this.button.pointer.useColliderShape = show;
    this.button.pointer.useGraphicsBounds = show;
    if (!show) {
      this.close();
    }
  }

  private buildOverlay(): void {
    const panel = TABLE_CHAT_PANEL;
    const text = TABLE_CHAT_TEXT;

    const backdrop = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      z: Z_BACKDROP,
    });
    const dim = new ex.Rectangle({
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      color: BACKDROP,
      smoothing: false,
    });
    dim.origin = ex.vec(0, 0);
    backdrop.graphics.use(dim);
    this.track(backdrop);

    const panelActor = new ex.Actor({
      pos: ex.vec(panel.x, panel.y),
      anchor: ex.vec(0, 0),
      width: panel.w,
      height: panel.h,
      z: Z_PANEL,
    });
    panelActor.graphics.use(panelRect(panel.w, panel.h, PLATE, STROKE_HOT));
    this.track(panelActor);

    const title = new ex.Actor({
      pos: ex.vec(panel.x + text.padding, panel.y + 20),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    title.graphics.use(
      canvasText(this.waiting ? 'Table Lobby' : 'Table Chat', 16, GOLD),
    );
    this.track(title);

    if (this.waiting) {
      const label = (y: number, color: ex.Color): ex.Text => {
        const actor = new ex.Actor({
          pos: ex.vec(panel.x + text.padding, panel.y + y),
          anchor: ex.vec(0, 0),
          z: Z_TEXT,
        });
        const graphic = canvasText('', 8, color);
        actor.graphics.use(graphic);
        this.track(actor);
        return graphic;
      };
      this.waitingDetails = label(48, GOLD);
      this.waitingSeats = label(66, SELF);
      this.track(
        this.buildHeaderButton(440, 116, 'Copy Link', () => {
          const url = new URL(window.location.pathname, window.location.origin);
          void navigator.clipboard?.writeText(url.href).then(
            () => this.showError('Table link copied', GOLD),
            () => this.showError('Copy the table link from the address bar'),
          );
          if (!navigator.clipboard)
            this.showError('Copy the table link from the address bar');
        }),
      );
      const start = this.buildHeaderButton(566, 130, 'Start Game', () => {
        const waiting = this.waiting;
        if (!waiting?.start) return;
        if (waiting.seated < waiting.minimum) {
          this.showError(`Waiting for at least ${waiting.minimum} players`);
          return;
        }
        waiting.start();
      });
      this.startControl = this.track(start);
    }

    for (let row = 0; row < text.rows; row += 1) {
      const position = ex.vec(
        panel.x + text.padding,
        panel.y + text.top + row * text.lineHeight,
      );
      const sender = canvasText('', text.size, CHAT_OTHER_SENDER);
      const body = canvasText('', text.size, SELF);
      const senderActor = new ex.Actor({
        pos: position,
        anchor: ex.vec(0, 0),
        z: Z_TEXT,
      });
      const bodyActor = new ex.Actor({
        pos: position.clone(),
        anchor: ex.vec(0, 0),
        z: Z_TEXT,
      });
      senderActor.graphics.use(sender);
      bodyActor.graphics.use(body);
      this.track(senderActor);
      this.track(bodyActor);
      this.lineTexts.push({ sender, body, bodyActor });
    }

    const inputBoxSpec = TABLE_CHAT_INPUT;
    const inputBox = new ex.Actor({
      pos: ex.vec(inputBoxSpec.x, inputBoxSpec.y),
      anchor: ex.vec(0, 0),
      width: inputBoxSpec.w,
      height: inputBoxSpec.h,
      z: Z_TEXT,
    });
    const inputRect = panelRect(
      inputBoxSpec.w,
      inputBoxSpec.h,
      FIELD,
      STROKE_HOT,
    );
    inputBox.graphics.use(inputRect);
    inputBox.on('pointerup', () => this.composer.focus());
    this.track(inputBox);

    const metrics = tableChatLabel();
    this.inputField = canvasText('', metrics.size, GOLD);
    const inputFieldActor = new ex.Actor({
      pos: ex.vec(metrics.x, metrics.y),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    inputFieldActor.graphics.use(this.inputField);
    this.track(inputFieldActor);
    this.inputCaret = this.track(makeFieldCaret(metrics.size, Z_TEXT + 1));
    this.paintInput();

    this.track(this.buildSendButton());

    this.errorText = canvasText('', 8, DANGER);
    const errorActor = new ex.Actor({
      pos: ex.vec(panel.x + text.padding, inputBoxSpec.y - 20),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    errorActor.graphics.use(this.errorText);
    this.track(errorActor);

    this.track(
      this.buildHeaderButton(706, 110, this.waiting ? 'Leave' : 'Close', () => {
        if (this.waiting) this.waiting.leave();
        else this.close();
      }),
    );
  }

  private buildSendButton(): ex.Actor {
    const box = TABLE_CHAT_SEND_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: Z_TEXT,
    });
    const face = panelRect(box.w, box.h, CHAT_SEND, STROKE);
    actor.graphics.use(face);
    const size = buttonFontSize('Send', box.w, box.h);
    const rest = buttonCaptionPos('Send', box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Send', size, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = CHAT_SEND_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.strokeColor = STROKE;
        face.color = CHAT_SEND;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      () => this.send(),
    );
    return actor;
  }

  private buildHeaderButton(
    x: number,
    w: number,
    label: string,
    activate: () => void,
  ): ex.Actor {
    const panel = TABLE_CHAT_PANEL;
    const h = TABLE_CHAT_INPUT.h;
    const actor = new ex.Actor({
      pos: ex.vec(x, panel.y + 16),
      anchor: ex.vec(0, 0),
      width: w,
      height: h,
      z: Z_TEXT,
    });
    const face = panelRect(w, h, BUTTON, STROKE);
    actor.graphics.use(face);
    const size = buttonFontSize(label, w, h);
    const rest = buttonCaptionPos(label, w, h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    const graphic = canvasText(label, size, GOLD);
    if (label === 'Start Game') this.startLabel = graphic;
    caption.graphics.use(graphic);
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
      activate,
    );
    return actor;
  }
}

function readChatTables(connection: DbConnection): ChatTableRef[] {
  const rows: ChatTableRef[] = [];
  for (const table of connection.db.gameTable.iter()) {
    rows.push({ id: table.id, lobbyId: table.lobbyId });
  }
  return rows;
}

function readChatLobbies(connection: DbConnection): ChatLobbyRef[] {
  const rows: ChatLobbyRef[] = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({ id: lobby.id, solo: lobby.solo });
  }
  return rows;
}

function readChatRows(connection: DbConnection): TableChatRow[] {
  const rows: TableChatRow[] = [];
  for (const row of connection.db.tableChatMessage.iter()) {
    rows.push({
      id: row.id,
      tableId: row.tableId,
      lobbyMemberId: row.lobbyMemberId,
      body: row.body,
      createdAtMicros: row.createdAt.microsSinceUnixEpoch,
    });
  }
  return rows;
}
