import { SceneManager } from './modes/scene-manager.js';
import { MenuScene } from './modes/menu-scene.js';
import { SettingsScene } from './modes/settings-scene.js';
import { PlayScene, ModeSelectScene, RecordsScene } from './modes/play-scene.js';
import { TrainingScene } from './modes/training-scene.js';
import { WatchScene } from './modes/watch-scene.js';
import { BoardRenderer } from './ui/board-renderer.js';
import { AudioEngine } from './ui/audio.js';
import { STR } from './ui/strings.es.js';
import { loadSettings, saveSettings, loadKeybinds, saveKeybinds, loadGamepadBinds, saveGamepadBinds } from './storage/settings-store.js';

const settings = loadSettings();
const keybinds = loadKeybinds();
const audio = new AudioEngine(settings);
const boardRenderer = new BoardRenderer({
  theme: settings.theme,
  colorblind: settings.colorblind,
  highContrast: settings.highContrast,
});

function applyVideoSettings() {
  document.body.classList.toggle('high-contrast', settings.highContrast);
  const reduced = settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.toggle('reduced-motion', reduced);
  boardRenderer.setOptions({
    theme: settings.theme,
    colorblind: settings.colorblind,
    highContrast: settings.highContrast,
  });
}

applyVideoSettings();

const root = document.getElementById('app');
const manager = new SceneManager({
  root,
  context: {
    settings,
    saveSettings: () => saveSettings(settings),
    keybinds,
    saveKeybinds: () => saveKeybinds(keybinds),
    loadGamepadBinds,
    saveGamepadBinds,
    audio,
    boardRenderer,
    applyVideoSettings,
    strings: STR,
  },
});

manager.register('menu', (ctx) => new MenuScene(ctx));
manager.register('modeSelect', (ctx) => new ModeSelectScene(ctx));
manager.register('play', (ctx) => new PlayScene(ctx));
manager.register('records', (ctx) => new RecordsScene(ctx));
manager.register('training', (ctx) => new TrainingScene(ctx));
manager.register('watch', (ctx) => new WatchScene(ctx));
manager.register('settings', (ctx) => new SettingsScene(ctx));

// AudioContext can only start after a user gesture.
const unlockAudio = () => {
  audio.resume();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

manager.start();
manager.switchTo('menu');
