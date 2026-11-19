import { isLobbyViewport, placeLobbyWidths } from './lobby-viewport';
import { placeTableAnchors, tableViewportWidth } from './table-viewport';
import * as ex from 'excalibur';
import { demoImages } from './boot-scene';
import { CardHouseLoader, LoadingScreen } from './loading-screen';
import { getOrCreateClientId } from './client-id';
import { openCasinoAvatarEditor } from './casino-profile';
import { reloadLanding, reloadLoadingLine } from './reload-landing';
import { lifetimeWinningsCaption } from './lifetime-winnings';
import { connectCardroom, linkStatusLine } from './connect';
import {
  clearLastRoom,
  forgetTable,
  readLastRoom,
  rememberLobby,
  rememberTable,
  roomGoneMessage,
  type LastRoom,
} from './last-room';
import { lobbyByCode, type LobbyRow } from './lobby';
import { GameScene } from './game-scene-view';
import { LEAVE_TABLE_BUTTON } from './game-scene';
import {
  cardroomBotUrl,
  fetchDefaultPlayerName,
  joinNameFromSearch,
  takeDiscordLinkResult,
} from './discord-join';
import {
  discordIdentityFromSearch,
  roomCodeFromPath,
  showLobbyUrl,
  showTableUrl,
  tableLinkFromPath,
} from './join-path';
import { LobbyScene } from './lobby-scene';
import { mountLobbyPanel, type LobbyPanel } from './lobby-panel';
import { MenuScene } from './menu-scene';
import { findSoloSeat, hasOwnMembership } from './solo-room';
import type { DbConnection } from './module_bindings';
import { isCanvasFieldFocused, refreshCanvasTextFields } from './html-field';
import {
  isMobileDevice,
  isPortrait,
  mountMobileShell,
  readSafeInsets,
  visibleSize,
  readShellInputs,
  shellView,
  installGameGestureGuard,
} from './mobile-shell';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitViewport } from './sheets';
import { installTouchTargets } from './touch-targets';
import { tableScenePaint } from './client-look';
import { applyPageBackground } from './page-background';
import { backgroundHex } from './theme';

const clientId = getOrCreateClientId();
localStorage.removeItem('tableSessionStats');
const discordLinkResult = takeDiscordLinkResult();
const theme = tableScenePaint(clientId);
applyPageBackground(theme.background);
const initialTableLink = tableLinkFromPath(window.location.pathname);
const joinCode =
  initialTableLink?.lobbyCode ?? roomCodeFromPath(window.location.pathname);
const parsedIdentity = discordIdentityFromSearch(window.location.search);
const discordIdentity =
  parsedIdentity && parsedIdentity.discordUsername.length > 0
    ? parsedIdentity
    : undefined;

const canvas = document.createElement('canvas');
canvas.draggable = false;
document.querySelector('#app')?.append(canvas);

const engine = new ex.Engine({
  canvasElement: canvas,
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  displayMode: ex.DisplayMode.Fixed,
  antialiasing: false,
  suppressHiDPIScaling: true,
  suppressPlayButton: true,
  snapToPixel: true,
  backgroundColor: ex.Color.fromHex(theme.background),
  pixelRatio: 2,
});

let settledSize = visibleSize();
let fittedClassicControls = false;

/**
 * Fits the whole 960×540 frame inside the visible area and the safe-area
 * insets. The same contain scale is used on every browser. While a phone
 * keyboard has a field focused, the last size is kept and `html-field.ts`
 * lifts the box. A desktop resize always refits, so a narrower window cannot
 * crop the frame.
 */
function applyContainScale(): void {
  const size = visibleSize();
  const sameOrientation =
    isPortrait(size.width, size.height) ===
    isPortrait(settledSize.width, settledSize.height);
  if (!isMobileDevice() || !isCanvasFieldFocused() || !sameOrientation) {
    settledSize = size;
  }
  const insets = readSafeInsets();
  const classicControls =
    engine.currentScene instanceof GameScene &&
    engine.currentScene.usesClassicLayout;
  fittedClassicControls = classicControls;
  // Reserve a rail for the phone shell so Fullscreen never covers game input.
  const shell = shellView(readShellInputs());
  if (shell.button && !shell.gate && !classicControls) {
    insets.left += 60;
  }
  const tableActive = engine.currentScene instanceof GameScene;
  const logicalWidth = tableActive
    ? tableViewportWidth(
        settledSize.width - insets.left - insets.right,
        settledSize.height - insets.top - insets.bottom,
      )
    : LOGICAL_WIDTH;
  engine.screen.resolution = { width: logicalWidth, height: LOGICAL_HEIGHT };
  engine.currentScene.camera.pos = ex.vec(
    LOGICAL_WIDTH / 2,
    LOGICAL_HEIGHT / 2,
  );
  placeTableAnchors(engine.currentScene, logicalWidth);
  const fitted = fitViewport(
    settledSize.width,
    settledSize.height,
    insets,
    logicalWidth,
  );
  engine.screen.viewport = { width: fitted.width, height: fitted.height };
  engine.screen.applyResolutionAndViewport();
  canvas.style.imageRendering = 'auto';
  canvas.style.position = 'absolute';
  canvas.style.left = `${fitted.left}px`;
  canvas.style.top = `${fitted.top}px`;
  const controlScale = fitted.height / LOGICAL_HEIGHT;
  document.documentElement.style.setProperty(
    '--cardhouse-control-height',
    `${(classicControls ? 40 : LEAVE_TABLE_BUTTON.h) * controlScale}px`,
  );
  document.documentElement.style.setProperty(
    '--cardhouse-control-top',
    `${fitted.top + LEAVE_TABLE_BUTTON.y * controlScale}px`,
  );
  refreshCanvasTextFields();
}

const scene = new ex.Scene();
scene.backgroundColor = ex.Color.fromHex(theme.background);
const reloadScene = new ex.Scene();
const loading = new LoadingScreen(reloadScene);
const menu = new MenuScene(clientId);
const savedRoomAtStart =
  !discordLinkResult && (readLastRoom()?.lobbyCode === joinCode || !joinCode)
    ? readLastRoom()
    : undefined;
const loadingLine = reloadLoadingLine(savedRoomAtStart);
if (loadingLine) {
  loading.show(loadingLine);
  engine.add('loading', reloadScene);
  engine.add('boot', scene);
  engine.add('menu', menu);
} else {
  engine.add('menu', menu);
  engine.add('boot', scene);
  engine.add('loading', reloadScene);
}

window.addEventListener('resize', applyContainScale);
window.addEventListener('orientationchange', applyContainScale);
window.visualViewport?.addEventListener('resize', applyContainScale);
applyContainScale();
mountMobileShell({ onChange: applyContainScale });
installGameGestureGuard();
installTouchTargets(engine);
engine.on('postframe', () => {
  const tableActive = engine.currentScene instanceof GameScene;
  const insets = readSafeInsets();
  const shell = shellView(readShellInputs());
  if (
    shell.button &&
    !shell.gate &&
    !(
      engine.currentScene instanceof GameScene &&
      engine.currentScene.usesClassicLayout
    )
  )
    insets.left += 60;
  const width = tableActive
    ? tableViewportWidth(
        settledSize.width - insets.left - insets.right,
        settledSize.height - insets.top - insets.bottom,
      )
    : LOGICAL_WIDTH;
  const classicControls =
    engine.currentScene instanceof GameScene &&
    engine.currentScene.usesClassicLayout;
  if (
    engine.screen.resolution.width !== width ||
    classicControls !== fittedClassicControls
  )
    applyContainScale();
  placeTableAnchors(engine.currentScene, width);
  if (isLobbyViewport(engine.currentScene))
    placeLobbyWidths(engine.currentScene);
});

const loader = new CardHouseLoader({ loadables: demoImages });
void engine.start(loader).then(() => {
  if (loadingLine) {
    engine.goToScene('loading');
  } else {
    engine.goToScene('menu');
  }
  applyContainScale();
  let lobbyScene: LobbyScene | undefined;
  let game: GameScene | undefined;
  let rejoinAfterReconnect = (): void => {};
  connectCardroom({
    onPhase: (phase) => {
      menu.setConnectionPhase(phase);
      const line = linkStatusLine(phase);
      lobbyScene?.setLinkStatus(line);
      game?.setLinkStatus(line);
    },
    onReconnected: () => {
      rejoinAfterReconnect();
    },
    onSubscribed: (connection) => {
      menu.casinoConnection = connection;
      const joined: { panel?: LobbyPanel } = {};
      let openTableId = '';
      let endTableSession = (): void => {};
      let openSeatedTable = (
        _tableId: string,
        _lobbyMemberId: string,
      ): void => {};
      const tableScene = new GameScene(
        connection,
        clientId,
        () => {
          if (!hasOwnMembership(readOwnMembers(connection), clientId)) {
            clearLastRoom();
            endTableSession();
            joined.panel?.resetAfterLeave();
            engine.goToScene('menu');
            return;
          }
          forgetTable();
          const room = readLastRoom();
          if (room) showLobbyUrl(room.lobbyCode);
          endTableSession();
          engine.goToScene('boot');
        },
        theme.table,
      );
      game = tableScene;
      engine.add('game', tableScene);
      const roomScene = new LobbyScene(
        engine,
        scene,
        connection,
        clientId,
        (tableId, lobbyMemberId) => {
          openSeatedTable(tableId, lobbyMemberId);
        },
        () => {
          clearLastRoom();
          endTableSession();
          joined.panel?.resetAfterLeave();
          engine.goToScene('menu');
        },
      );
      lobbyScene = roomScene;
      const publishWinnings = (): void => {
        const [row] = connection.db.myLifetimeWinnings.iter();
        const caption = lifetimeWinningsCaption(row?.units ?? 0n);
        menu.setLifetimeWinnings(caption);
        roomScene.setLifetimeWinnings(caption);
        tableScene.setLifetimeWinnings(caption);
      };
      endTableSession = (): void => {
        openTableId = '';
      };
      openSeatedTable = (tableId, lobbyMemberId): void => {
        rememberTable(tableId);
        const saved = readLastRoom();
        if (saved) showTableUrl(saved.lobbyCode, tableId);
        openTableId = tableId;
        tableScene.open(tableId, lobbyMemberId);
        engine.goToScene('game');
      };
      roomScene.mount();
      const savedRoom = savedRoomAtStart;
      let pendingReload: LastRoom | undefined = savedRoom;
      let reloadBusy = false;
      let pendingTableCode = initialTableLink?.tableCode;
      const followTableLink = async (lobbyCode: string): Promise<boolean> => {
        const code = pendingTableCode;
        if (!code || lobbyCode !== initialTableLink?.lobbyCode) return false;
        pendingTableCode = undefined;
        return roomScene.followTableLink(code);
      };
      const panel = mountLobbyPanel(
        engine,
        scene,
        connection,
        clientId,
        discordIdentity,
        {
          returning: savedRoomAtStart !== undefined,
          inputBlocked: () => roomScene.dialogOpen,
          onJoined: (lobby) => {
            if (pendingReload) {
              void finishReload(lobby);
              return;
            }
            if (openTableId) return;
            void roomScene.openLobby(lobby.id, lobby.code).then((ready) => {
              if (ready) void followTableLink(lobby.code);
            });
          },
        },
      );
      joined.panel = panel;
      rejoinAfterReconnect = () => {
        const saved = readLastRoom();
        if (!saved) {
          return;
        }
        void connection.reducers
          .joinLobby({
            lobbyCode: saved.lobbyCode,
            clientId,
            name: saved.name,
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : '';
            if (!roomGoneMessage(message)) {
              return;
            }
            clearLastRoom();
            endTableSession();
            panel.resetAfterLeave();
            engine.goToScene('menu');
          });
      };
      menu.connect(
        (entry) => panel.enter(entry.kind, entry.name, entry.code),
        () => {
          engine.goToScene('boot');
        },
      );
      menu.connectSolo(async (start) => {
        try {
          await connection.reducers.startSoloGame({
            clientId,
            name: start.name,
            gameType: start.gameType,
            seatCount: start.seatCount,
            settings: start.settings,
          });
        } catch (error: unknown) {
          return error instanceof Error ? error.message : 'Could not start';
        }
        const seat = findSoloSeat(
          clientId,
          readSoloLobbies(connection),
          readSoloMembers(connection),
          readSoloTables(connection),
        );
        if (!seat) {
          return 'Could not open the table';
        }
        rememberLobby(seat.code, start.name);
        const ready = await roomScene.openLobby(seat.lobbyId, seat.code);
        if (!ready) {
          return 'Could not open the table';
        }
        openSeatedTable(seat.tableId, seat.lobbyMemberId);
        return undefined;
      });
      menu.connectLook((look) => {
        const hex = backgroundHex(look.background);
        applyPageBackground(hex);
        const color = ex.Color.fromHex(hex);
        engine.backgroundColor = color;
        scene.backgroundColor = color;
        tableScene.setTableStyle(look.table);
        tableScene.setBackground(hex);
      });
      if (discordLinkResult) {
        openCasinoAvatarEditor(menu, connection, '', discordLinkResult);
      } else if (joinCode && !savedRoom) {
        const joinName = joinNameFromSearch(window.location.search);
        if (joinName.state === 'ready') {
          menu.openJoin(joinCode, joinName.name);
        } else {
          void fetchDefaultPlayerName(
            cardroomBotUrl(),
            joinName.discordUserId,
          ).then((name) => {
            menu.openJoin(joinCode, name);
          });
        }
      } else if (savedRoom) {
        void rejoinSavedRoom(connection, savedRoom);
      }

      async function finishReload(lobby: LobbyRow): Promise<void> {
        const saved = pendingReload;
        if (!saved || reloadBusy || lobby.code !== saved.lobbyCode) {
          return;
        }
        reloadBusy = true;
        try {
          const ready = await roomScene.openLobby(lobby.id, lobby.code);
          const atTable =
            ready &&
            (pendingTableCode
              ? await followTableLink(lobby.code)
              : saved.tableId.length > 0 &&
                roomScene.reopenIfSeated(saved.tableId));
          const landing = reloadLanding({ atTable, inRoom: true });
          pendingReload = undefined;
          if (landing === 'table') {
            return;
          }
          endTableSession();
          if (landing === 'lobby') {
            if (ready && saved.tableId.length > 0) {
              forgetTable();
            }
            engine.goToScene('boot');
            return;
          }
          clearLastRoom();
          panel.resetAfterLeave();
          engine.goToScene('menu');
        } finally {
          reloadBusy = false;
        }
      }

      async function rejoinSavedRoom(
        db: DbConnection,
        saved: LastRoom,
      ): Promise<void> {
        const error = await panel.enter('join', saved.name, saved.lobbyCode);
        if (error) {
          pendingReload = undefined;
          if (roomGoneMessage(error)) {
            clearLastRoom();
            endTableSession();
            panel.resetAfterLeave();
            const landing = reloadLanding({ atTable: false, inRoom: false });
            if (landing === 'menu') {
              engine.goToScene('menu');
            }
          } else {
            loading.show(error, false);
          }
          return;
        }
        const lobby = lobbyByCode(lobbyRows(db), saved.lobbyCode);
        if (lobby) {
          await finishReload(lobby);
        }
      }

      connection.db.myLifetimeWinnings.onInsert(publishWinnings);
      connection.db.myLifetimeWinnings.onUpdate(publishWinnings);
      connection.db.myLifetimeWinnings.onDelete(publishWinnings);
      publishWinnings();
    },
  });
});

function readOwnMembers(
  connection: DbConnection,
): { clientId: string; isBot: boolean }[] {
  const rows: { clientId: string; isBot: boolean }[] = [];
  for (const member of connection.db.lobbyMember.iter()) {
    if (member.leftRoom) continue;
    rows.push({ clientId: member.clientId, isBot: member.isBot });
  }
  return rows;
}

function readSoloLobbies(connection: DbConnection) {
  const rows = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({
      id: lobby.id,
      code: lobby.code,
      solo: lobby.solo,
      createdAtMicros: lobby.createdAt.microsSinceUnixEpoch,
    });
  }
  return rows;
}

function readSoloMembers(connection: DbConnection) {
  const rows = [];
  for (const member of connection.db.lobbyMember.iter()) {
    rows.push({
      id: member.id,
      lobbyId: member.lobbyId,
      clientId: member.clientId,
      isBot: member.isBot,
    });
  }
  return rows;
}

function readSoloTables(connection: DbConnection) {
  const rows = [];
  for (const table of connection.db.myCasinoTables.iter()) {
    rows.push({
      id: table.id,
      lobbyId: table.lobbyId,
      createdAtMicros: table.createdAt.microsSinceUnixEpoch,
    });
  }
  return rows;
}

function lobbyRows(connection: DbConnection): LobbyRow[] {
  const rows: LobbyRow[] = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({ id: lobby.id, code: lobby.code });
  }
  return rows;
}
