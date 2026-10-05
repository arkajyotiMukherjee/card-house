import * as ex from 'excalibur';
import { BootScene, bootAssets } from './boot-scene';
import { connectCardroom } from './connect';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, integerScale } from './sheets';

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
const loader = new ex.Loader(bootAssets);
engine.add('boot', { scene, loader });

window.addEventListener('resize', applyIntegerScale);
applyIntegerScale();

void engine
  .start(loader)
  .then(() => {
    return engine.goToScene('boot');
  })
  .then(() => {
    applyIntegerScale();
    connectCardroom((line) => {
      scene.setStatus(line);
    });
  });
