import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './style.css';
import Phaser from 'phaser';
import { sfx } from './game/audio';
import { WorldScene } from './phaser/WorldScene';
import { Ui } from './ui/hud';

const dpr = Math.min(window.devicePixelRatio || 1, 2);
const mount = document.getElementById('game');
if (!mount) throw new Error('Missing #game');

let scene: WorldScene | null = null;

const ui = new Ui(
  {
    start: () => {
      sfx.unlock();
      scene?.beginRun();
    },
    restart: () => {
      sfx.unlock();
      scene?.beginRun();
    },
    toggleSound: () => {
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      return !sfx.muted;
    },
    press: () => {
      sfx.unlock();
      sfx.click();
    },
  },
  sfx.muted,
);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: mount,
  backgroundColor: '#030611',
  width: Math.round(window.innerWidth * dpr),
  height: Math.round(window.innerHeight * dpr),
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  banner: false,
});

game.scene.add('world', WorldScene, true, { ui, px: dpr });
game.events.once(Phaser.Core.Events.READY, () => {
  scene = game.scene.getScene('world') as WorldScene;
});

const resize = () => {
  game.scale.resize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
  game.scale.setZoom(1 / dpr);
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 150));

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.loop.sleep();
  else game.loop.wake();
});

if (import.meta.env.DEV) {
  Object.assign(window, { __game: game, __scene: () => scene });
}
