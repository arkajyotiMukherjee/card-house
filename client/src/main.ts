import * as ex from 'excalibur';
import { BootScene, demoImages } from './boot-scene';
import { getOrCreateClientId } from './client-id';
import { connectCardroom } from './connect';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, integerScale } from './sheets';

getOrCreateClientId();

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

window.addEventListener('resize', applyIntegerScale);
applyIntegerScale();

const loader = new ex.Loader(demoImages);
void engine.start(loader).then(() => {
  engine.goToScene('boot');
  applyIntegerScale();
  connectCardroom((line) => {
    scene.setStatus(line);
  });
});
