import * as ex from 'excalibur';
import { pixelFont } from './boot-scene';
import { subscribeLobbyTables } from './connect';
import {
  clampPlayerCount,
  CREATE_TABLE,
  gameOption,
  memberByClient,
  nextTableName,
  tableLines,
  tableSettingsJson,
  TABLE_LIST,
  type MemberRecord,
  type SeatRef,
  type TableLine,
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Could not update the table';
}

export class LobbyScene {
  private lobbyId = '';
  private subscribedLobbyId = '';
  private panelReady = false;
  private watching = false;
  private busy = false;
  private creating = false;
  private gameIndex = 0;
  private maxPlayers = gameOption(0).maxPlayers;
  private readonly rowActors: ex.Actor[] = [];
  private emptyText: ex.Text | undefined;
  private errorText: ex.Text | undefined;
  private gameText: ex.Text | undefined;
  private maxText: ex.Text | undefined;
  private popup: ex.Actor | undefined;

  constructor(
    private readonly scene: ex.Scene,
    private readonly connection: DbConnection,
    private readonly clientId: string,
    private readonly onSeated: (
      tableId: string,
      lobbyMemberId: string,
    ) => void = () => {},
  ) {}

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
  }

  openLobby(lobbyId: string): void {
    this.lobbyId = lobbyId;
    this.ensurePanel();
    if (this.subscribedLobbyId === lobbyId) {
      this.render();
      return;
    }
    this.subscribedLobbyId = lobbyId;
    void subscribeLobbyTables(this.connection, lobbyId)
      .then(() => {
        if (this.lobbyId === lobbyId) {
          this.render();
        }
      })
      .catch((error: unknown) => {
        if (this.subscribedLobbyId === lobbyId) {
          this.subscribedLobbyId = '';
        }
        this.setError(errorMessage(error));
      });
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
    this.emptyText = this.addLabel(808, 108, 'No tables', 8, DIM);
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

  private paintChoice(): void {
    const game = gameOption(this.gameIndex);
    if (this.gameText) {
      this.gameText.text = game.name;
    }
    if (this.maxText) {
      this.maxText.text = String(this.maxPlayers);
    }
  }

  private async createTable(): Promise<void> {
    if (this.busy || !this.creating || this.lobbyId.length === 0) {
      return;
    }
    const game = gameOption(this.gameIndex);
    const maxPlayers = clampPlayerCount(game, this.maxPlayers);
    const tableName = nextTableName(this.readTables(), this.lobbyId, game);
    this.busy = true;
    this.setError('');
    try {
      await this.connection.reducers.createGameTable({
        lobbyId: this.lobbyId,
        gameType: game.gameType,
        settings: tableSettingsJson(game.minPlayers, maxPlayers, tableName),
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
      const message = errorMessage(error);
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

  private memberSeatedHere(tableId: string, lobbyMemberId: string): boolean {
    for (const seat of this.connection.db.gameSeat.iter()) {
      if (seat.tableId === tableId && seat.lobbyMemberId === lobbyMemberId) {
        return true;
      }
    }
    return false;
  }

  private render(): void {
    if (!this.panelReady || this.lobbyId.length === 0) {
      return;
    }
    const lines = tableLines(this.readTables(), this.readSeats(), this.lobbyId);
    if (this.emptyText) {
      this.emptyText.text = lines.length === 0 ? 'No tables' : '';
    }
    for (const actor of this.rowActors) {
      actor.kill();
    }
    this.rowActors.length = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      this.rowActors.push(this.rowActor(index, line));
    }
  }

  private rowActor(index: number, line: TableLine): ex.Actor {
    const row = TABLE_LIST.row;
    const y = row.y + index * (row.h + row.gap);
    const actor = new ex.Actor({
      pos: ex.vec(row.x, y),
      anchor: ex.vec(0, 0),
      width: row.w,
      height: row.h,
      z: 20,
    });
    const face = panelRect(row.w, row.h, FIELD, STROKE);
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
      pos: ex.vec(6, 8),
      anchor: ex.vec(0, 0),
    });
    dotActor.graphics.use(dot);
    actor.addChild(dotActor);
    this.childLabel(actor, 16, 6, line.gameName, GOLD);
    this.childLabel(actor, 16, 18, line.tableName, DIM);
    this.childLabel(
      actor,
      16,
      30,
      `${line.seatsLabel} ${line.statusLabel}`,
      GOLD,
    );
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
    });
    actor.on('pointerup', () => {
      void this.joinTable(line.id);
    });
    this.scene.add(actor);
    return actor;
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
      rows.push({ tableId: seat.tableId });
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
      this.errorText.text = message;
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
  ): void {
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: parent ? 2 : 20,
    });
    const face = panelRect(box.w, box.h, BUTTON, STROKE);
    actor.graphics.use(face);
    const captionText = canvasText(caption, 8, GOLD);
    const captionActor = new ex.Actor({
      pos: ex.vec(8, 9),
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
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      captionActor.pos = ex.vec(8, 10);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      captionActor.pos = ex.vec(8, 9);
      onPress();
    });
    if (parent) {
      actor.pos = ex.vec(box.x - parent.pos.x, box.y - parent.pos.y);
      parent.addChild(actor);
      return;
    }
    this.scene.add(actor);
  }
}
