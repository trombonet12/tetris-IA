import { GAME_DEFAULTS, INPUT_DEFAULTS, DEFAULT_KEYBINDS } from '../core/config.js';

// Settings, keybinds, high scores and lifetime stats in localStorage
// (small, synchronous). Models/sessions/replays live in IndexedDB.

const PREFIX = 'tetris-ia:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) — settings just won't persist */
  }
}

// ── Settings ───────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  // Game feel
  dasMs: INPUT_DEFAULTS.dasMs,
  arrMs: INPUT_DEFAULTS.arrMs,
  softDropFactor: GAME_DEFAULTS.softDropFactor,
  ghostEnabled: true,
  previewCount: GAME_DEFAULTS.previewCount,
  startLevel: 1,
  // Video
  theme: 'neon', // 'neon' | 'classic' | 'minimal'
  particles: true,
  screenShake: 'soft', // 'off' | 'soft' | 'strong'
  reducedMotion: false,
  highContrast: false,
  colorblind: false, // draw piece letters inside cells
  // Audio
  sfxEnabled: true,
  musicEnabled: false,
  sfxVolume: 0.6,
  musicVolume: 0.4,
  muted: false,
  // Misc
  autoPauseOnBlur: true,
  lastMode: null,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read('settings', {}) };
}

export function saveSettings(settings) {
  write('settings', settings);
}

export function loadKeybinds() {
  return { ...DEFAULT_KEYBINDS, ...read('keybinds', {}) };
}

export function saveKeybinds(keybinds) {
  write('keybinds', keybinds);
}

export function loadGamepadBinds() {
  return read('gamepadBinds', null);
}

export function saveGamepadBinds(binds) {
  write('gamepadBinds', binds);
}

// ── High scores (top 10 per game mode) ─────────────────────────────────────

const MAX_SCORES = 10;

/**
 * @param {string} mode 'marathon' | 'sprint' | 'ultra' | 'zen' | 'cheese' | 'endless'
 * @param {object} entry { name, score, lines, level, timeMs, date, seed, replayId }
 * @returns {number} rank achieved (1-based) or 0 if it did not enter the table
 */
export function submitHighScore(mode, entry) {
  const table = read(`scores:${mode}`, []);
  table.push(entry);
  // Sprint ranks by time ascending; everything else by score descending.
  table.sort((a, b) => (mode === 'sprint' ? a.timeMs - b.timeMs : b.score - a.score));
  const rank = table.indexOf(entry) + 1;
  if (rank > MAX_SCORES) return 0;
  write(`scores:${mode}`, table.slice(0, MAX_SCORES));
  return rank;
}

export function getHighScores(mode) {
  return read(`scores:${mode}`, []);
}

export function getBestScore(mode) {
  return getHighScores(mode)[0] ?? null;
}

// ── Lifetime stats ─────────────────────────────────────────────────────────

const EMPTY_LIFETIME = {
  games: 0,
  pieces: 0,
  lines: 0,
  tetrises: 0,
  tspins: 0,
  allClears: 0,
  timeMs: 0,
  maxCombo: 0,
  perMode: {},
};

export function loadLifetimeStats() {
  return { ...EMPTY_LIFETIME, ...read('lifetime', {}) };
}

/** Accumulates a finished game into lifetime stats. */
export function accumulateLifetimeStats(mode, stats) {
  const life = loadLifetimeStats();
  life.games++;
  life.pieces += stats.pieces;
  life.lines += stats.lines;
  life.tetrises += stats.tetrises;
  life.tspins += stats.tspins + stats.tspinMinis;
  life.allClears += stats.allClears;
  life.timeMs += stats.timeMs;
  life.maxCombo = Math.max(life.maxCombo, stats.maxCombo);
  const m = life.perMode[mode] ?? { games: 0, lines: 0, bestScore: 0 };
  m.games++;
  m.lines += stats.lines;
  m.bestScore = Math.max(m.bestScore, stats.score);
  life.perMode[mode] = m;
  write('lifetime', life);
  return life;
}

// ── Training presets ───────────────────────────────────────────────────────

export function loadTrainingPresets() {
  return read('trainingPresets', []);
}

export function saveTrainingPresets(presets) {
  write('trainingPresets', presets);
}

// ── Data management ────────────────────────────────────────────────────────

export function exportAllLocalData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = read(key.slice(PREFIX.length), null);
  }
  return out;
}

export function importAllLocalData(data) {
  for (const [key, value] of Object.entries(data)) write(key, value);
}

export function clearAllLocalData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}
