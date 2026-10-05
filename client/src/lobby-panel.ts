import * as ex from 'excalibur';
import { pixelFont } from './boot-scene';
import {
  knownTableId,
  memberForClient,
  type MemberRef,
  type TableRef,
} from './game-scene';
import {
  applyCodeKey,
  applyFieldKey,
  findCreatedLobby,
  LOBBY_PANEL,
  lobbyByCode,
  memberLines,
  NAME_MAX,
  normalizePlayerName,
  normalizeRoomCode,
  type LobbyRow,
  type MemberLine,
  type MemberRow,
} from './lobby';
import type { DbConnection } from './module_bindings';

const GOLD = ex.Color.fromHex('#f4e4b3');
const SELF = ex.Color.fromHex('#fff6d0');
const DIM = ex.Color.fromHex('#d7c08a');
const FIELD = ex.Color.fromHex('#0b2418');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const DANGER = ex.Color.fromHex('#e85d4c');

type FieldId = 'name' | 'code';
type SubmitKind = 'create' | 'join';

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

function labelActor(
  scene: ex.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: ex.Color,
): ex.Text {
  const graphic = canvasText(text, size, color);
  const actor = new ex.Actor({
    pos: ex.vec(x, y),
    anchor: ex.vec(0, 0),
    z: 21,
  });
  actor.graphics.use(graphic);
  scene.add(actor);
  return graphic;
}

export function mountLobbyPanel(
  scene: ex.Scene,
  connection: DbConnection,
  clientId: string,
  onEnterTable: (tableId: string, lobbyMemberId: string) => void,
): void {
  const backdrop = new ex.Actor({
    pos: ex.vec(8, 44),
    anchor: ex.vec(0, 0),
    width: 144,
    height: 460,
    z: 15,
  });
  backdrop.graphics.use(
    panelRect(144, 460, ex.Color.fromHex('#0a2e1c'), STROKE),
  );
  scene.add(backdrop);

  const nameLabel = labelActor(scene, 16, 52, 'Name', 8, DIM);
  const codeLabel = labelActor(scene, 16, 100, 'Code', 8, DIM);
  const nameText = labelActor(scene, 22, 76, '_', 8, GOLD);
  const codeText = labelActor(scene, 22, 124, 'optional', 8, DIM);
  const errorText = labelActor(scene, 16, 222, '', 8, DANGER);
  const tableMessage = labelActor(scene, 16, 424, '', 8, DANGER);
  const roomLabel = labelActor(scene, 16, 52, '', 8, DIM);
  const roomCode = labelActor(scene, 16, 70, '', 16, GOLD);
  const playersLabel = labelActor(scene, 16, 100, '', 8, DIM);

  const nameBox = fieldActor(scene, LOBBY_PANEL.nameField);
  const codeBox = fieldActor(scene, LOBBY_PANEL.codeField);
  const createButton = buttonActor(scene, LOBBY_PANEL.createButton, 'Create');
  const joinButton = buttonActor(scene, LOBBY_PANEL.joinButton, 'Join');

  let name = '';
  let code = '';
  let focused: FieldId = 'name';
  let busy = false;
  let joinedCode = '';
  let joinTableButton: ex.Actor | undefined;
  const nameActors: ex.Actor[] = [];

  const paintFields = (): void => {
    nameBox.graphics.use(
      panelRect(
        LOBBY_PANEL.nameField.w,
        LOBBY_PANEL.nameField.h,
        FIELD,
        focused === 'name' ? STROKE_HOT : STROKE,
      ),
    );
    codeBox.graphics.use(
      panelRect(
        LOBBY_PANEL.codeField.w,
        LOBBY_PANEL.codeField.h,
        FIELD,
        focused === 'code' ? STROKE_HOT : STROKE,
      ),
    );
    nameText.text = name.length > 0 ? name : focused === 'name' ? '_' : '';
    nameText.color = GOLD;
    if (code.length > 0) {
      codeText.text = code;
      codeText.color = GOLD;
    } else if (focused === 'code') {
      codeText.text = '_';
      codeText.color = GOLD;
    } else {
      codeText.text = 'optional';
      codeText.color = DIM;
    }
  };

  const setFormVisible = (visible: boolean): void => {
    const opacity = visible ? 1 : 0;
    nameLabel.opacity = opacity;
    codeLabel.opacity = opacity;
    nameText.opacity = opacity;
    codeText.opacity = opacity;
    nameBox.graphics.opacity = opacity;
    codeBox.graphics.opacity = opacity;
    createButton.graphics.opacity = opacity;
    joinButton.graphics.opacity = opacity;
  };

  const renderLobby = (room: string, lines: MemberLine[]): void => {
    setFormVisible(false);
    errorText.text = '';
    roomLabel.text = 'Room';
    roomCode.text = room;
    playersLabel.text = 'Players';
    for (const actor of nameActors) {
      actor.kill();
    }
    nameActors.length = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      const graphic = canvasText(line.name, 8, line.self ? SELF : GOLD);
      const actor = new ex.Actor({
        pos: ex.vec(16, 118 + index * 16),
        anchor: ex.vec(0, 0),
        z: 21,
      });
      actor.graphics.use(graphic);
      scene.add(actor);
      nameActors.push(actor);
    }
    ensureJoinButton();
  };

  const syncJoinedLobby = (): void => {
    if (joinedCode.length === 0) {
      return;
    }
    const lobby = lobbyByCode(readLobbies(connection), joinedCode);
    if (!lobby) {
      return;
    }
    renderLobby(
      lobby.code,
      memberLines(readMembers(connection), lobby.id, clientId),
    );
  };

  const fail = (message: string): void => {
    errorText.text = message;
  };

  const submit = (kind: SubmitKind): void => {
    if (busy || joinedCode.length > 0) {
      return;
    }
    const playerName = normalizePlayerName(name);
    if (playerName.length === 0) {
      fail('Name is required');
      return;
    }
    errorText.text = '';
    busy = true;
    const task =
      kind === 'create'
        ? createThenJoin(connection, clientId, playerName)
        : joinExisting(connection, clientId, playerName, code);
    void task
      .then((room) => {
        joinedCode = room;
        syncJoinedLobby();
        if (
          joinedCode.length > 0 &&
          !lobbyByCode(readLobbies(connection), joinedCode)
        ) {
          fail('Waiting for room');
        }
      })
      .catch((error: unknown) => {
        fail(error instanceof Error ? error.message : 'Could not join');
      })
      .finally(() => {
        busy = false;
      });
  };

  nameBox.on('pointerup', () => {
    if (joinedCode.length > 0) {
      return;
    }
    focused = 'name';
    paintFields();
  });
  codeBox.on('pointerup', () => {
    if (joinedCode.length > 0) {
      return;
    }
    focused = 'code';
    paintFields();
  });
  createButton.on('pointerup', () => {
    submit('create');
  });
  joinButton.on('pointerup', () => {
    submit('join');
  });

  scene.engine.input.keyboard.on('press', (evt) => {
    if (busy || joinedCode.length > 0) {
      return;
    }
    if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
      return;
    }
    if (evt.key === ex.Keys.Backspace) {
      writeField('Backspace');
      return;
    }
    if (evt.key === ex.Keys.Enter) {
      submit(code.trim().length > 0 ? 'join' : 'create');
      return;
    }
    if (evt.key === ex.Keys.Tab) {
      focused = focused === 'name' ? 'code' : 'name';
      paintFields();
      return;
    }
    const typed = evt.value ?? '';
    if (typed.length !== 1) {
      return;
    }
    writeField(typed);
  });

  connection.db.lobby.onInsert(() => {
    syncJoinedLobby();
  });
  connection.db.lobbyMember.onInsert(() => {
    syncJoinedLobby();
  });
  connection.db.lobbyMember.onUpdate(() => {
    syncJoinedLobby();
  });
  connection.db.lobbyMember.onDelete(() => {
    syncJoinedLobby();
  });

  const sit = (): void => {
    if (busy || joinedCode.length === 0) {
      return;
    }
    const lobby = lobbyByCode(readLobbies(connection), joinedCode);
    if (!lobby) {
      tableMessage.text = 'Waiting for room';
      return;
    }
    const member = memberForClient(
      readMemberRefs(connection),
      lobby.id,
      clientId,
    );
    if (!member) {
      tableMessage.text = 'Waiting for seat';
      return;
    }
    const tableId = knownTableId(readTables(connection), lobby.id);
    if (!tableId) {
      tableMessage.text = 'No table';
      return;
    }
    errorText.text = '';
    tableMessage.text = '';
    busy = true;
    void connection.reducers
      .joinTable({ tableId, lobbyMemberId: member.id })
      .then(() => {
        onEnterTable(tableId, member.id);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Could not sit';
        if (message === 'Already seated') {
          onEnterTable(tableId, member.id);
          return;
        }
        tableMessage.text = message;
      })
      .finally(() => {
        busy = false;
      });
  };

  function ensureJoinButton(): void {
    if (joinTableButton) {
      return;
    }
    joinTableButton = buttonActor(
      scene,
      LOBBY_PANEL.joinTableButton,
      'Join Table',
    );
    joinTableButton.on('pointerup', () => {
      sit();
    });
  }

  paintFields();

  function writeField(key: string): void {
    if (focused === 'name') {
      name = applyFieldKey(name, key, NAME_MAX);
    } else {
      code = applyCodeKey(code, key);
    }
    paintFields();
  }
}

function fieldActor(
  scene: ex.Scene,
  box: { x: number; y: number; w: number; h: number },
): ex.Actor {
  const actor = new ex.Actor({
    pos: ex.vec(box.x, box.y),
    anchor: ex.vec(0, 0),
    width: box.w,
    height: box.h,
    z: 20,
  });
  actor.graphics.use(panelRect(box.w, box.h, FIELD, STROKE));
  scene.add(actor);
  return actor;
}

function buttonActor(
  scene: ex.Scene,
  box: { x: number; y: number; w: number; h: number },
  caption: string,
): ex.Actor {
  const actor = new ex.Actor({
    pos: ex.vec(box.x, box.y),
    anchor: ex.vec(0, 0),
    width: box.w,
    height: box.h,
    z: 20,
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
  });
  scene.add(actor);
  return actor;
}

function readLobbies(connection: DbConnection): LobbyRow[] {
  const rows: LobbyRow[] = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({ id: lobby.id, code: lobby.code });
  }
  return rows;
}

function readTables(connection: DbConnection): TableRef[] {
  const rows: TableRef[] = [];
  for (const table of connection.db.gameTable.iter()) {
    rows.push({
      id: table.id,
      lobbyId: table.lobbyId,
      createdAtMicros: table.createdAt.microsSinceUnixEpoch,
    });
  }
  return rows;
}

function readMemberRefs(connection: DbConnection): MemberRef[] {
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

function readMembers(connection: DbConnection): MemberRow[] {
  const rows: MemberRow[] = [];
  for (const member of connection.db.lobbyMember.iter()) {
    rows.push({
      lobbyId: member.lobbyId,
      clientId: member.clientId,
      name: member.name,
    });
  }
  return rows;
}

async function createThenJoin(
  connection: DbConnection,
  clientId: string,
  playerName: string,
): Promise<string> {
  const knownIds = new Set(readLobbies(connection).map((lobby) => lobby.id));
  await connection.reducers.createLobby({});
  const created = findCreatedLobby(
    readLobbies(connection),
    knownIds,
    connection.identity?.toHexString() ?? '',
  );
  if (!created) {
    throw new Error('Could not read the new room');
  }
  await connection.reducers.joinLobby({
    lobbyCode: created.code,
    clientId,
    name: playerName,
  });
  return created.code;
}

async function joinExisting(
  connection: DbConnection,
  clientId: string,
  playerName: string,
  rawCode: string,
): Promise<string> {
  const lobbyCode = normalizeRoomCode(rawCode);
  if (lobbyCode.length === 0) {
    throw new Error('Room code is required');
  }
  await connection.reducers.joinLobby({
    lobbyCode,
    clientId,
    name: playerName,
  });
  return lobbyCode;
}
