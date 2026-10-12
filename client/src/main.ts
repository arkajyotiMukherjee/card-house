import * as ex from 'excalibur';
import { BootScene, demoImages } from './boot-scene';
import { getOrCreateClientId } from './client-id';
import { connectCardroom } from './connect';
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
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, integerScale } from './sheets';

const clientId = getOrCreateClientId();
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

function applyIntegerScale(): void {
  const scale = integerScale(window.innerWidth, window.innerHeight);
  engine.screen.viewport = {
    width: LOGICAL_WIDTH * scale,
    height: LOGICAL_HEIGHT * scale,
  };
  engine.screen.applyResolutionAndViewport();
  canvas.style.imageRendering = 'pixelated';
}

const scene = new BootScene();
engine.add('boot', scene);
const menu = new MenuScene();
engine.add('menu', menu);

window.addEventListener('resize', applyIntegerScale);
applyIntegerScale();

const loader = new ex.Loader(demoImages);
void engine.start(loader).then(() => {
  engine.goToScene('menu');
  applyIntegerScale();
  connectCardroom({
    onStatus: (line) => {
      scene.setStatus(line);
      menu.setStatus(line);
    },
    onSubscribed: (connection) => {
      const game = new GameScene(connection, clientId, () => {
        engine.goToScene('boot');
      });
      engine.add('game', game);
      const lobbyScene = new LobbyScene(
        scene,
        connection,
        clientId,
        (tableId, lobbyMemberId) => {
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
            lobbyScene.openLobby(lobby.id, lobby.code);
          },
        },
      );
      menu.connect(
        (entry) => panel.enter(entry.kind, entry.name, entry.code),
        () => {
          engine.goToScene('boot');
        },
      );
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
      }
    },
  });
});
