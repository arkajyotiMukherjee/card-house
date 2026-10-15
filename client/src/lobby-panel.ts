import * as ex from 'excalibur';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { pixelFont } from './boot-scene';
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
  type MemberRecord,
} from './lobby';
import { SERVER_UNREACHABLE } from './connect';
import { joinFailureMessage } from './join-errors';
import type { DiscordJoinIdentity } from './join-path';
import { rememberLobby } from './last-room';
import { roomComposer } from './room-composer';
import { readPreferredName, rememberPreferredName } from './preferred-name';
import { wrapText } from './menu-layout';
import type { DbConnection } from './module_bindings';
import { lobbySpeakers, SpeakingFader, type SpeakingRow } from './speaking';
import { speechBubble } from './speaking-view';
import {
  headsetActor,
  HEADSET_HEIGHT,
  HEADSET_WIDTH,
  lobbyVoiceMemberIds,
  type PresenceRef,
} from './voice-presence';

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

export interface LobbyPanel {
  /** Fills the form, submits it, and resolves to an error message if it fails. */
  enter: (
    kind: SubmitKind,
    playerName: string,
    roomCode: string,
  ) => Promise<string | undefined>;
  /** Clears a joined room after Leave Room so the next create or join can run. */
  resetAfterLeave: () => void;
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
  engine: ex.Engine,
  scene: ex.Scene,
  connection: DbConnection,
  clientId: string,
  discordIdentity: DiscordJoinIdentity | undefined,
  handlers: {
    onJoined?: (lobby: LobbyRow) => void;
    returning?: boolean;
  } = {},
): LobbyPanel {
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
  const roomLabel = labelActor(scene, 16, 52, '', 8, DIM);
  const roomCode = labelActor(scene, 16, 70, '', 16, GOLD);
  const playersLabel = labelActor(scene, 16, 100, '', 8, DIM);

  const nameBox = fieldActor(scene, LOBBY_PANEL.nameField);
  const codeBox = fieldActor(scene, LOBBY_PANEL.codeField);
  const createButton = buttonActor(scene, LOBBY_PANEL.createButton, 'Create');
  const joinButton = buttonActor(scene, LOBBY_PANEL.joinButton, 'Join');
  const renameLabel = labelActor(scene, 16, 412, 'Name', 8, DIM);
  const renameText = labelActor(scene, 22, 436, '', 8, GOLD);
  const renameBox = fieldActor(scene, LOBBY_PANEL.renameField);
  const saveButton = buttonActor(scene, LOBBY_PANEL.saveButton, 'Save');
  renameLabel.opacity = 0;
  renameText.opacity = 0;
  renameBox.graphics.opacity = 0;
  saveButton.graphics.opacity = 0;

  let name = readPreferredName(clientId);
  let code = '';
  let renameName = '';
  let focused: FieldId = 'name';
  let renameFocused = false;
  let busy = false;
  let joinedCode = '';
  const nameActors: ex.Actor[] = [];
  const fader = new SpeakingFader();
  let joinedLobbyId = '';
  let speaking = new Set<string>();

  const refreshSpeaking = (): void => {
    speaking =
      joinedLobbyId.length === 0
        ? new Set<string>()
        : lobbySpeakers(readSpeaking(connection), joinedLobbyId);
  };

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
    const renameOpacity = visible ? 0 : 1;
    renameLabel.opacity = renameOpacity;
    renameText.opacity = renameOpacity;
    renameBox.graphics.opacity = renameOpacity;
    saveButton.graphics.opacity = renameOpacity;
  };

  const paintRename = (): void => {
    renameBox.graphics.use(
      panelRect(
        LOBBY_PANEL.renameField.w,
        LOBBY_PANEL.renameField.h,
        FIELD,
        renameFocused ? STROKE_HOT : STROKE,
      ),
    );
    renameText.text = renameName.length > 0 ? renameName : '_';
    renameText.color = GOLD;
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
      const y = 118 + index * 16;
      if (!line) {
        continue;
      }
      if (y >= 400) {
        break;
      }
      const graphic = canvasText(line.name, 8, line.self ? SELF : GOLD);
      const actor = new ex.Actor({
        pos: ex.vec(16, y),
        anchor: ex.vec(0, 0),
        z: 21,
      });
      actor.graphics.use(graphic);
      scene.add(actor);
      nameActors.push(actor);
      let markerX = 16 + line.name.length * 8 + 4;
      if (line.inVoice) {
        const headset = headsetActor(
          markerX,
          y + Math.floor((8 - HEADSET_HEIGHT) / 2) + 1,
          21,
        );
        scene.add(headset);
        nameActors.push(headset);
        markerX += HEADSET_WIDTH + 4;
      }
      const bubble = speechBubble(
        ex.vec(markerX, y - 2),
        21,
        1,
        fader,
        line.id,
        () => speaking.has(line.id),
      );
      scene.add(bubble);
      nameActors.push(bubble);
    }
    const self = lines.find((line) => line.self);
    if (self && !renameFocused && !busy) {
      renameName = self.name.slice(0, NAME_MAX);
    }
    paintRename();
  };

  const syncJoinedLobby = (): void => {
    if (joinedCode.length === 0) {
      return;
    }
    const lobby = lobbyByCode(readLobbies(connection), joinedCode);
    if (!lobby) {
      return;
    }
    joinedLobbyId = lobby.id;
    refreshSpeaking();
    renderLobby(
      lobby.code,
      memberLines(
        readMembers(connection),
        lobby.id,
        clientId,
        lobbyVoiceMemberIds(readPresence(connection), lobby.id),
      ),
    );
    handlers.onJoined?.(lobby);
  };

  const fail = (message: string): void => {
    errorText.text = wrapText(message, 16).join('\n');
  };

  const submit = (kind: SubmitKind): Promise<string | undefined> => {
    if (busy || joinedCode.length > 0) {
      return Promise.resolve(undefined);
    }
    const playerName = normalizePlayerName(name);
    if (playerName.length === 0) {
      fail('Name is required');
      return Promise.resolve('Name is required');
    }
    if (!connection.isActive) {
      fail(SERVER_UNREACHABLE);
      return Promise.resolve(SERVER_UNREACHABLE);
    }
    errorText.text = '';
    busy = true;
    const task =
      kind === 'create'
        ? createThenJoin(connection, clientId, playerName, discordIdentity)
        : joinExisting(connection, clientId, playerName, code, discordIdentity);
    return task
      .then((room) => {
        joinedCode = room;
        renameName = playerName;
        renameFocused = false;
        rememberLobby(room, playerName);
        rememberPreferredName(clientId, playerName);
        syncJoinedLobby();
        if (
          joinedCode.length > 0 &&
          !lobbyByCode(readLobbies(connection), joinedCode)
        ) {
          fail('Waiting for room');
        }
        return undefined;
      })
      .catch((error: unknown) => {
        const message = joinFailureMessage(error, 'Could not join');
        fail(message);
        return message;
      })
      .finally(() => {
        busy = false;
      });
  };

  const saveName = (): Promise<void> => {
    if (busy || joinedCode.length === 0) {
      return Promise.resolve();
    }
    const playerName = normalizePlayerName(renameName);
    if (playerName.length === 0) {
      fail('Name is required');
      return Promise.resolve();
    }
    errorText.text = '';
    busy = true;
    roomComposer.blur('name');
    return joinMember(
      connection,
      clientId,
      playerName,
      joinedCode,
      discordIdentity,
    )
      .then(() => {
        renameName = playerName;
        rememberLobby(joinedCode, playerName);
        rememberPreferredName(clientId, playerName);
        paintRename();
        syncJoinedLobby();
      })
      .catch((error: unknown) => {
        roomComposer.focus('name');
        const message =
          error instanceof Error ? error.message : 'Could not rename';
        fail(message);
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
    void submit('create');
  });
  joinButton.on('pointerup', () => {
    void submit('join');
  });
  renameBox.on('pointerup', () => {
    if (joinedCode.length === 0 || busy) {
      return;
    }
    roomComposer.focus('name');
  });
  saveButton.on('pointerup', () => {
    void saveName();
  });

  engine.input.keyboard.on('press', (evt) => {
    if (engine.currentScene !== scene) {
      return;
    }
    if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
      return;
    }
    if (joinedCode.length > 0) {
      if (roomComposer.active() !== 'name' || busy) {
        return;
      }
      if (evt.key === ex.Keys.Backspace) {
        renameName = applyFieldKey(renameName, 'Backspace', NAME_MAX);
        paintRename();
        return;
      }
      if (evt.key === ex.Keys.Enter) {
        void saveName();
        return;
      }
      const typedName = evt.value ?? '';
      if (typedName.length !== 1) {
        return;
      }
      renameName = applyFieldKey(renameName, typedName, NAME_MAX);
      paintRename();
      return;
    }
    if (busy) {
      return;
    }
    if (evt.key === ex.Keys.Backspace) {
      writeField('Backspace');
      return;
    }
    if (evt.key === ex.Keys.Enter) {
      void submit(code.trim().length > 0 ? 'join' : 'create');
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
  connection.db.voicePresence.onInsert(() => {
    syncJoinedLobby();
  });
  connection.db.voicePresence.onUpdate(() => {
    syncJoinedLobby();
  });
  connection.db.voicePresence.onDelete(() => {
    syncJoinedLobby();
  });
  connection.db.lobbyMember.onDelete(() => {
    syncJoinedLobby();
  });
  connection.db.speakingState.onInsert(refreshSpeaking);
  connection.db.speakingState.onUpdate(refreshSpeaking);
  connection.db.speakingState.onDelete(refreshSpeaking);

  paintFields();
  if (handlers.returning) {
    setFormVisible(false);
  }
  roomComposer.watch(() => {
    const next = roomComposer.active() === 'name';
    if (renameFocused === next) {
      return;
    }
    renameFocused = next;
    paintRename();
  });

  return {
    enter: (kind, playerName, roomCode) => {
      name = playerName.slice(0, NAME_MAX);
      code = roomCode;
      paintFields();
      return submit(kind);
    },
    resetAfterLeave: () => {
      joinedCode = '';
      joinedLobbyId = '';
      speaking = new Set();
      roomComposer.clear();
      for (const actor of nameActors) {
        actor.kill();
      }
      nameActors.length = 0;
      roomLabel.text = '';
      roomCode.text = '';
      playersLabel.text = '';
      errorText.text = '';
      renameName = '';
      setFormVisible(true);
      paintFields();
    },
  };

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

function readMembers(connection: DbConnection): MemberRecord[] {
  const rows: MemberRecord[] = [];
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

async function createThenJoin(
  connection: DbConnection,
  clientId: string,
  playerName: string,
  discordIdentity: DiscordJoinIdentity | undefined,
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
  await joinMember(
    connection,
    clientId,
    playerName,
    created.code,
    discordIdentity,
  );
  return created.code;
}

async function joinExisting(
  connection: DbConnection,
  clientId: string,
  playerName: string,
  rawCode: string,
  discordIdentity: DiscordJoinIdentity | undefined,
): Promise<string> {
  const lobbyCode = normalizeRoomCode(rawCode);
  if (lobbyCode.length === 0) {
    throw new Error('Room code is required');
  }
  await joinMember(
    connection,
    clientId,
    playerName,
    lobbyCode,
    discordIdentity,
  );
  return lobbyCode;
}

async function joinMember(
  connection: DbConnection,
  clientId: string,
  playerName: string,
  lobbyCode: string,
  discordIdentity: DiscordJoinIdentity | undefined,
): Promise<void> {
  if (discordIdentity) {
    await connection.reducers.joinLobbyWithDiscord({
      lobbyCode,
      clientId,
      name: playerName,
      discordUserId: discordIdentity.discordUserId,
      discordUsername: discordIdentity.discordUsername,
      discordGlobalName: discordIdentity.discordGlobalName,
      discordDiscriminator: discordIdentity.discordDiscriminator,
    });
    return;
  }
  await connection.reducers.joinLobby({
    lobbyCode,
    clientId,
    name: playerName,
  });
}
