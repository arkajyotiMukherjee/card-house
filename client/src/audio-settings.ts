import * as ex from 'excalibur';
import { CASINO_PALETTE as ink } from './casino-art';
import { gameAudio, type VolumeChannel } from './game-audio';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

const openScenes = new WeakSet<ex.Scene>();
const sliders = [
  { channel: 'music', label: 'Music volume', y: 226 },
  { channel: 'sfx', label: 'SFX volume', y: 312 },
] as const;
const track = { left: 282, right: 678 };
const done = { x: 552, y: 366, w: 126, h: 48 };

export function audioSettingsOpen(scene: ex.Scene): boolean {
  return openScenes.has(scene);
}

export function openAudioSettings(scene: ex.Scene): void {
  if (audioSettingsOpen(scene)) return;
  openScenes.add(scene);

  let focus = 0;
  let drag: VolumeChannel | undefined;
  let donePressed: number | undefined;
  const overlay = new ex.Actor({
    name: 'audio-settings',
    pos: ex.vec(0, 0),
    anchor: ex.vec(0, 0),
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    z: 180,
  });
  const graphic = new ex.Canvas({
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    cache: false,
    draw(g) {
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#081a15df';
      g.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      g.fillStyle = ink.dark;
      g.fillRect(244, 100, 472, 348);
      g.strokeStyle = ink.gold;
      g.strokeRect(244.5, 100.5, 471, 347);
      g.fillStyle = ink.gold;
      g.font = '23px "Press Start 2P", monospace';
      g.fillText('SETTINGS', track.left, 157);

      g.font = '20px "Chakra Petch", sans-serif';
      for (const [index, slider] of sliders.entries()) {
        const value = gameAudio.volume(slider.channel);
        const width = track.right - track.left;
        const end = Math.round((width * value) / 100);
        g.fillStyle = ink.cream;
        g.fillText(slider.label, track.left, slider.y - 22);
        g.textAlign = 'right';
        g.fillText(`${value}%`, track.right, slider.y - 22);
        g.textAlign = 'left';
        g.fillStyle = '#305041';
        g.fillRect(track.left, slider.y - 5, width, 10);
        g.fillStyle = '#b88f56';
        g.fillRect(track.left, slider.y - 5, end, 10);
        g.fillStyle = ink.gold;
        g.fillRect(track.left + end - 8, slider.y - 12, 16, 24);
        if (focus === index) {
          g.strokeStyle = ink.cream;
          g.strokeRect(track.left + end - 11.5, slider.y - 15.5, 23, 31);
        }
      }

      g.fillStyle = ink.gold;
      g.fillRect(done.x, done.y, done.w, done.h);
      if (focus === sliders.length) {
        g.strokeStyle = ink.cream;
        g.strokeRect(done.x - 3.5, done.y - 3.5, done.w + 7, done.h + 7);
      }
      g.fillStyle = ink.dark;
      g.textAlign = 'center';
      g.fillText('Done', done.x + done.w / 2, done.y + 31);
    },
  });
  graphic.origin = ex.vec(0, 0);
  overlay.graphics.use(graphic);

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    scene.off('deactivate', close);
    overlay.kill();
    openScenes.delete(scene);
  };
  const closeWithSound = () => {
    gameAudio.play('back');
    close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    event.stopPropagation();
    if (event.key === 'Escape') closeWithSound();
    else if (event.key === 'Tab')
      focus =
        (focus + (event.shiftKey ? sliders.length : 1)) % (sliders.length + 1);
    else if (
      (event.key === 'Enter' || event.key === ' ') &&
      focus === sliders.length
    )
      closeWithSound();
    else {
      const slider = sliders[focus];
      if (!slider) return;
      const current = gameAudio.volume(slider.channel);
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          gameAudio.setVolume(slider.channel, current - 5);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          gameAudio.setVolume(slider.channel, current + 5);
          break;
        case 'Home':
          gameAudio.setVolume(slider.channel, 0);
          break;
        case 'End':
          gameAudio.setVolume(slider.channel, 100);
          break;
        default:
          return;
      }
      if (gameAudio.volume(slider.channel) !== current)
        gameAudio.play('selector');
    }
    event.preventDefault();
  };

  const setFromPointer = (channel: VolumeChannel, x: number) => {
    const before = Math.floor(gameAudio.volume(channel) / 10);
    gameAudio.setVolume(
      channel,
      (100 * (x - track.left)) / (track.right - track.left),
    );
    if (Math.floor(gameAudio.volume(channel) / 10) !== before)
      gameAudio.play('selector');
  };
  const overDone = (x: number, y: number) =>
    x >= done.x && x <= done.x + done.w && y >= done.y && y <= done.y + done.h;
  overlay.on('pointerdown', (event) => {
    event.cancel();
    const { x, y } = event.worldPos;
    donePressed = overDone(x, y) ? event.pointerId : undefined;
    const index = sliders.findIndex((slider) => Math.abs(y - slider.y) <= 22);
    if (index === -1 || x < track.left - 18 || x > track.right + 18) return;
    focus = index;
    drag = sliders[index].channel;
    setFromPointer(drag, x);
  });
  overlay.on('pointermove', (event) => {
    if (drag) setFromPointer(drag, event.worldPos.x);
  });
  overlay.on('pointerup', (event) => {
    event.cancel();
    const { x, y } = event.worldPos;
    if (drag) setFromPointer(drag, x);
    else if (donePressed === event.pointerId && overDone(x, y))
      closeWithSound();
    drag = undefined;
    donePressed = undefined;
  });
  overlay.on('pointercancel', () => {
    drag = undefined;
    donePressed = undefined;
  });
  overlay.on('pointerleave', () => {
    drag = undefined;
    donePressed = undefined;
  });
  document.addEventListener('keydown', onKey, true);
  scene.on('deactivate', close);
  scene.add(overlay);
}
