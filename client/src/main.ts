import * as ex from 'excalibur';
import { BootScene, demoImages } from './boot-scene';
import { getOrCreateClientId } from './client-id';
import { statsCaption, statsForClient } from './client-stats';
import { connectCardroom } from './connect';
import {
  clearLastRoom,
  forgetTable,
  readLastRoom,
  rememberTable,
  roomGoneMessage,
  type LastRoom,
} from './last-room';
import { lobbyByCode, type LobbyRow } from './lobby';
import { GameScene } from './game-scene-view';
import {
  cardroomBotUrl,
  fetchDefaultPlayerName,
  joinNameFromSearch,
} from './discord-join';
import { discordIdentityFromSearch, roomCodeFromPath } from './join-path';
import { LobbyScene } from './lobby-scene';
import { mountLobbyPanel, type LobbyPanel } from './lobby-panel';
import { MenuScene } from './menu-scene';
import type { DbConnection } from './module_bindings';
import { isCanvasFieldFocused, refreshCanvasTextFields } from './html-field';
import {
  isMobileDevice,
  isPortrait,
  mountMobileShell,
  readSafeInsets,
  visibleSize,
} from './mobile-shell';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitViewport } from './sheets';
import { installTouchTargets } from './touch-targets';
import { getTheme, saveTheme } from './theme';

const clientId = getOrCreateClientId();
const theme = getTheme(clientId);
const joinCode = roomCodeFromPath(window.location.pathname);
const parsedIdentity = discordIdentityFromSearch(window.location.search);
const discordIdentity =
  parsedIdentity && parsedIdentity.discordUsername.length > 0
    ? parsedIdentity
    : undefined;

const canvas = document.createElement('canvas');
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
  backgroundColor: ex.Color.fromHex('#145c38'),
  pixelRatio: 1,
});

let settledSize = visibleSize();

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
  const fitted = fitViewport(
    settledSize.width,
    settledSize.height,
    readSafeInsets(),
  );
  engine.screen.viewport = { width: fitted.width, height: fitted.height };
  engine.screen.applyResolutionAndViewport();
  canvas.style.imageRendering = 'pixelated';
  canvas.style.position = 'absolute';
  canvas.style.left = `${fitted.left}px`;
  canvas.style.top = `${fitted.top}px`;
  refreshCanvasTextFields();
}

const scene = new BootScene(theme);
engine.add('boot', scene);
const menu = new MenuScene(clientId);
engine.add('menu', menu);

window.addEventListener('resize', applyContainScale);
window.addEventListener('orientationchange', applyContainScale);
window.visualViewport?.addEventListener('resize', applyContainScale);
applyContainScale();
mountMobileShell({ onChange: applyContainScale });
installTouchTargets(engine);

const loader = new ex.Loader(demoImages);
const savedRoomAtStart = joinCode ? undefined : readLastRoom();
void engine.start(loader).then(() => {
  if (savedRoomAtStart) {
    scene.setStatus('Rejoining room');
    engine.goToScene('boot');
  } else {
    engine.goToScene('menu');
  }
  applyContainScale();
  connectCardroom(
    {
      onPhase: (phase) => {
        menu.setConnectionPhase(phase);
      },
      onSubscribed: (connection) => {
        const game = new GameScene(
          connection,
          clientId,
          () => {
            forgetTable();
            engine.goToScene('boot');
          },
          theme,
        );
        engine.add('game', game);
        const joined: { panel?: LobbyPanel } = {};
        const lobbyScene = new LobbyScene(
          engine,
          scene,
          connection,
          clientId,
          (tableId, lobbyMemberId) => {
            rememberTable(tableId);
            game.open(tableId, lobbyMemberId);
            engine.goToScene('game');
          },
          () => {
            clearLastRoom();
            joined.panel?.resetAfterLeave();
            engine.goToScene('menu');
          },
        );
        lobbyScene.mount();
        const panel = mountLobbyPanel(
          engine,
          scene,
          connection,
          clientId,
          discordIdentity,
          {
            returning: savedRoomAtStart !== undefined,
            onJoined: (lobby) => {
              scene.setStatus('');
              void lobbyScene.openLobby(lobby.id, lobby.code);
            },
          },
        );
        joined.panel = panel;
        menu.connect(
          (entry) => panel.enter(entry.kind, entry.name, entry.code),
          () => {
            engine.goToScene('boot');
          },
        );
        menu.connectTheme(theme, (style) => {
          saveTheme(clientId, style);
          scene.setTableStyle(style);
          game.setTableStyle(style);
        });
        const savedRoom = joinCode ? undefined : readLastRoom();
        if (joinCode) {
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

        async function rejoinSavedRoom(
          db: DbConnection,
          saved: LastRoom,
        ): Promise<void> {
          const error = await panel.enter('join', saved.name, saved.lobbyCode);
          if (error) {
            if (roomGoneMessage(error)) {
              clearLastRoom();
              panel.resetAfterLeave();
              engine.goToScene('menu');
            } else {
              scene.setStatus(error);
            }
            return;
          }
          engine.goToScene('boot');
          if (saved.tableId.length === 0) {
            return;
          }
          const lobby = lobbyByCode(lobbyRows(db), saved.lobbyCode);
          if (!lobby) {
            return;
          }
          const ready = await lobbyScene.openLobby(lobby.id, lobby.code);
          if (!ready) {
            return;
          }
          if (!lobbyScene.reopenIfSeated(saved.tableId)) {
            forgetTable();
          }
        }

        const publishStats = (): void => {
          const line = statsCaption(
            statsForClient(connection.db.clientStats.iter(), clientId),
          );
          menu.setStats(line);
          lobbyScene.setStats(line);
          game.setStats(line);
        };
        connection.db.clientStats.onInsert(() => {
          publishStats();
        });
        connection.db.clientStats.onUpdate(() => {
          publishStats();
        });
        connection.db.clientStats.onDelete(() => {
          publishStats();
        });
        publishStats();
      },
    },
    clientId,
  );
});

function lobbyRows(connection: DbConnection): LobbyRow[] {
  const rows: LobbyRow[] = [];
  for (const lobby of connection.db.lobby.iter()) {
    rows.push({ id: lobby.id, code: lobby.code });
  }
  return rows;
}
