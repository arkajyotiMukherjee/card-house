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
import { mountLobbyPanel } from './lobby-panel';
import { MenuScene } from './menu-scene';
import type { DbConnection } from './module_bindings';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, coverViewport } from './sheets';
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

function applyCoverScale(): void {
  const covered = coverViewport(window.innerWidth, window.innerHeight);
  engine.screen.viewport = covered;
  engine.screen.applyResolutionAndViewport();
  canvas.style.imageRendering = 'pixelated';
  canvas.style.position = 'absolute';
  const extraX = covered.width - window.innerWidth;
  const extraY = covered.height - window.innerHeight;
  canvas.style.left = extraX > 0 ? `${-extraX / 2}px` : '0px';
  canvas.style.top = extraY > 0 ? `${-extraY / 2}px` : '0px';
}

const scene = new BootScene(theme);
engine.add('boot', scene);
const menu = new MenuScene(clientId);
engine.add('menu', menu);

window.addEventListener('resize', applyCoverScale);
applyCoverScale();

const loader = new ex.Loader(demoImages);
void engine.start(loader).then(() => {
  engine.goToScene('menu');
  applyCoverScale();
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
        );
        lobbyScene.mount();
        const panel = mountLobbyPanel(
          engine,
          scene,
          connection,
          clientId,
          discordIdentity,
          {
            onJoined: (lobby) => {
              void lobbyScene.openLobby(lobby.id, lobby.code);
            },
          },
        );
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
