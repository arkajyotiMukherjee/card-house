import * as ex from 'excalibur';
import {
  BUTTON_FONT_SIZE,
  BUTTON_HEIGHT,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import {
  BUTTON,
  BUTTON_DOWN,
  canvasText,
  DANGER,
  GOLD,
  panelRect,
  PLATE,
  SELF,
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
  type CanvasTextFieldHandle,
} from './html-field';
import { wrapText } from './menu-layout';
import type { DbConnection } from './module_bindings';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';
import {
  applyChatKey,
  applyChatText,
  tableChatLine,
  tableChatMessagesForTable,
  TABLE_CHAT_BODY_MAX,
  type TableChatRow,
} from './table-chat';

const BACKDROP = new ex.Color(0, 0, 0, 0.65);
const Z_BACKDROP = 100;
const Z_BUTTON = 103;
const Z_PANEL = 101;
const Z_TEXT = 102;
const FIELD = ex.Color.fromHex('#0b2418');

/**
 * Per-table chat drawn on top of the table. Scoped to one `GameTable`:
 * `setTable` resets the draft and history when the table id changes, and
 * `send_table_chat` on the module rejects a sender who is not seated or
 * watching that table, so a message never reaches the rest of the lobby.
 */
export class TableChatOverlay {
  private opened = false;
  private tableId = '';
  private lobbyMemberId = '';
  private draft = '';
  private sending = false;
  private overlayActors: ex.Actor[] = [];
  private lineTexts: ex.Text[] = [];
  private inputField: ex.Text | undefined;
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
        this.close();
      },
      enterKeyHint: 'send',
      autoCapitalize: 'off',
    });
    this.buildButton();
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
      if (this.opened) {
        this.close();
      }
    }
  }

  toggle(): void {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.opened || this.tableId.length === 0) {
      return;
    }
    this.onBeforeOpen();
    this.opened = true;
    this.buildOverlay();
    this.refresh();
    this.composer.refresh();
    this.composer.focus();
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
    this.inputField = undefined;
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
    const lines: string[] = [];
    for (const row of rows) {
      const line = tableChatLine(row, members, this.lobbyMemberId);
      for (const wrapped of wrapText(line, TABLE_CHAT_TEXT.columns)
        .join('\n')
        .split('\n')) {
        lines.push(wrapped);
      }
    }
    const slice = lines.slice(-TABLE_CHAT_TEXT.rows);
    this.lineTexts.forEach((text, index) => {
      text.text = slice[index] ?? '';
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
      this.close();
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
    if (this.inputField) {
      this.inputField.text = this.draft.length > 0 ? this.draft : '_';
    }
  }

  private showError(message: string): void {
    if (this.errorText) {
      this.errorText.text = message;
    }
  }

  private track(actor: ex.Actor): ex.Actor {
    this.overlayActors.push(actor);
    this.scene.add(actor);
    return actor;
  }

  private buildButton(): ex.Actor {
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
    const rest = buttonCaptionPos('Chat', box.w, box.h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Chat', BUTTON_FONT_SIZE, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = PLATE;
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      face.color = PLATE;
      caption.pos = ex.vec(rest.x, rest.y);
      this.toggle();
    });
    this.scene.add(actor);
    return actor;
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

    const window = new ex.Actor({
      pos: ex.vec(panel.x, panel.y),
      anchor: ex.vec(0, 0),
      width: panel.w,
      height: panel.h,
      z: Z_PANEL,
    });
    window.graphics.use(panelRect(panel.w, panel.h, PLATE, STROKE_HOT));
    this.track(window);

    const title = new ex.Actor({
      pos: ex.vec(panel.x + text.padding, panel.y + 20),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    title.graphics.use(canvasText('Table Chat', 16, GOLD));
    this.track(title);

    for (let row = 0; row < text.rows; row += 1) {
      const lineText = canvasText('', 8, SELF);
      const actor = new ex.Actor({
        pos: ex.vec(
          panel.x + text.padding,
          panel.y + text.top + row * text.lineHeight,
        ),
        anchor: ex.vec(0, 0),
        z: Z_TEXT,
      });
      actor.graphics.use(lineText);
      this.track(actor);
      this.lineTexts.push(lineText);
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
    this.track(inputBox);

    this.inputField = canvasText('_', BUTTON_FONT_SIZE, GOLD);
    const inputFieldActor = new ex.Actor({
      pos: ex.vec(
        inputBoxSpec.x + 6,
        inputBoxSpec.y + Math.round((inputBoxSpec.h - BUTTON_FONT_SIZE) / 2),
      ),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    inputFieldActor.graphics.use(this.inputField);
    this.track(inputFieldActor);
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

    this.track(this.buildCloseButton());
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
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const rest = buttonCaptionPos('Send', box.w, box.h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Send', BUTTON_FONT_SIZE, GOLD));
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
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
      this.send();
    });
    return actor;
  }

  private buildCloseButton(): ex.Actor {
    const panel = TABLE_CHAT_PANEL;
    const w = 120;
    const h = BUTTON_HEIGHT;
    const actor = new ex.Actor({
      pos: ex.vec(
        panel.x + panel.w - w - TABLE_CHAT_TEXT.padding,
        panel.y + 16,
      ),
      anchor: ex.vec(0, 0),
      width: w,
      height: h,
      z: Z_TEXT,
    });
    const face = panelRect(w, h, BUTTON, STROKE);
    actor.graphics.use(face);
    const rest = buttonCaptionPos('Close', w, h);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText('Close', BUTTON_FONT_SIZE, GOLD));
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
      caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      caption.pos = ex.vec(rest.x, rest.y);
      this.close();
    });
    return actor;
  }
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
