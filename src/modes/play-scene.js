import { Game } from '../game/game.js';
import { BOARD_WIDTH, BOARD_HEIGHT, VISIBLE_CELLS } from '../game/constants.js';
import { InputController, optimalInputs } from '../ui/keyboard.js';
import { ParticleSystem, ScreenShake } from '../ui/particles.js';
import { THEMES } from '../ui/board-renderer.js';
import { el, button, modal, promptModal, tabBar, toast, formatTime, formatNumber } from '../ui/dom.js';
import { STR, fmt } from '../ui/strings.es.js';
import { randomSeed } from '../core/rng.js';
import {
  submitHighScore,
  getHighScores,
  getBestScore,
  accumulateLifetimeStats,
  loadLifetimeStats,
} from '../storage/settings-store.js';
import { saveReplay, listReplays, getReplay, deleteReplay } from '../storage/model-store.js';
import { PIECE_NAMES } from '../game/constants.js';

export const MODES = ['marathon', 'sprint', 'ultra', 'zen', 'cheese', 'endless'];

const SPRINT_GOAL = 40;
const MARATHON_GOAL = 150;
const ULTRA_MS = 120000;
const COUNTDOWN_STEP_MS = 750;

// ═════════════════════════════════════════════════════════════════════════
// PlayScene — Normal mode (all sub-modes) + replay playback
// ═════════════════════════════════════════════════════════════════════════

export class PlayScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.snapshot = new Uint8Array(VISIBLE_CELLS);
    this.heights = new Uint8Array(BOARD_WIDTH);
    this.particles = new ParticleSystem();
    this.shake = new ScreenShake();
    this._unsubs = [];
  }

  enter(params = {}) {
    const { settings } = this.ctx;
    this.mode = params.mode ?? 'marathon';
    this.startLevel = params.startLevel ?? settings.startLevel ?? 1;
    this.cheeseRows = params.cheeseRows ?? 8;
    this.replay = params.replay ?? null;
    this.seed = (params.seed ?? (this.replay ? this.replay.seed : randomSeed())) >>> 0;
    this.shake.setMode(settings.reducedMotion ? 'off' : settings.screenShake);

    this._buildDom();
    this._startGame();
  }

  exit() {
    this._teardownGame();
    this.ctx.audio.stopMusic();
    this.ctx.audio.setDanger(false);
    window.removeEventListener('blur', this._onBlur);
  }

  // ── DOM ──────────────────────────────────────────────────────────────────

  _buildDom() {
    const s = STR;
    this.holdCanvas = el('canvas', { width: 110, height: 90, style: { width: '110px', height: '90px' } });
    this.nextCanvas = el('canvas', { width: 110, height: 340, style: { width: '110px', height: '340px' } });
    this.boardCanvas = el('canvas');
    this.overlayLayer = el('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.boardWrap = el('div', { style: { position: 'relative', display: 'inline-block' } }, this.boardCanvas, this.overlayLayer);

    const stat = (label) => {
      const value = el('div', { class: 'stat-value' }, '0');
      const node = el('div', { style: { marginBottom: '10px' } }, el('div', { class: 'stat-label' }, label), value);
      return { node, value };
    };
    this.statScore = stat(s.common.score);
    this.statLines = stat(s.common.lines);
    this.statLevel = stat(s.common.level);
    this.statTime = stat(s.common.time);
    this.statPps = stat(s.game.pps);
    this.comboLabel = el('div', { class: 'stat-value accent', style: { minHeight: '22px' } }, '');
    this.b2bLabel = el('div', { class: 'stat-value gold', style: { minHeight: '22px' } }, '');

    this.topInfo = el('span', { class: 'stat-value accent', style: { fontSize: '16px' } }, '');
    const modeName = this.replay ? `${STR.replay.title} · ${STR.modes[this.replay.mode]?.name ?? ''}` : STR.modes[this.mode].name;

    this.replayControls = null;
    if (this.replay) {
      this.replaySpeed = 1;
      const speedBtn = (mult, label) =>
        button(label, () => {
          this.replaySpeed = mult;
          [...this.replayControls.children].forEach((b) => b.classList.remove('btn-active'));
          btnMap.get(mult)?.classList.add('btn-active');
        });
      const btnMap = new Map([
        [0.5, speedBtn(0.5, '0.5x')],
        [1, speedBtn(1, '1x')],
        [2, speedBtn(2, '2x')],
      ]);
      btnMap.get(1).classList.add('btn-active');
      this.replayControls = el('div', { class: 'row' }, [...btnMap.values()]);
    }

    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar' },
        button(`← ${s.common.back}`, () => this._backToMenu()),
        el('span', { class: 'topbar-title' }, modeName),
        el('span', { class: 'spacer' }),
        this.topInfo,
        this.replayControls,
        el('span', { class: 'spacer' }),
        this.replay ? null : button(`⏸ ${s.common.pause}`, () => this._togglePause()),
      ),
      el(
        'div',
        { class: 'row', style: { flex: '1', justifyContent: 'center', alignItems: 'flex-start', minHeight: '0' } },
        el(
          'div',
          { class: 'panel col', style: { width: '150px' } },
          el('div', { class: 'panel-title' }, s.game.hold),
          this.holdCanvas,
          el('div', { style: { marginTop: '8px' } }, this.statScore.node, this.statLines.node, this.statLevel.node, this.statTime.node, this.statPps.node),
        ),
        this.boardWrap,
        el(
          'div',
          { class: 'panel col', style: { width: '150px' } },
          el('div', { class: 'panel-title' }, s.game.next),
          this.nextCanvas,
          el('div', { class: 'panel-title', style: { marginTop: '10px' } }, s.game.combo),
          this.comboLabel,
          el('div', { class: 'panel-title' }, s.game.b2b),
          this.b2bLabel,
        ),
      ),
    );
    this.ctx.root.append(this.el);
    this.resize();
  }

  resize() {
    const avail = this.el?.clientHeight ? this.el.clientHeight - 90 : window.innerHeight - 140;
    this.cellSize = Math.max(14, Math.floor(Math.min(avail / BOARD_HEIGHT, (window.innerWidth - 420) / BOARD_WIDTH)));
    const w = BOARD_WIDTH * this.cellSize + 4;
    const h = BOARD_HEIGHT * this.cellSize + 4;
    const dpr = window.devicePixelRatio || 1;
    this.boardCanvas.width = w * dpr;
    this.boardCanvas.height = h * dpr;
    this.boardCanvas.style.width = `${w}px`;
    this.boardCanvas.style.height = `${h}px`;
    this.boardCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Game lifecycle ───────────────────────────────────────────────────────

  _startGame() {
    this._teardownGame();
    const { settings, keybinds, audio } = this.ctx;
    const replayCfg = this.replay?.config ?? {};
    this.game = new Game({
      seed: this.seed,
      config: {
        startLevel: this.replay ? replayCfg.startLevel ?? 1 : this.startLevel,
        previewCount: this.replay ? replayCfg.previewCount ?? 5 : settings.previewCount,
        softDropFactor: this.replay ? replayCfg.softDropFactor ?? 20 : settings.softDropFactor,
        ghostEnabled: settings.ghostEnabled,
        zen: (this.replay ? this.replay.mode : this.mode) === 'zen',
      },
    });
    if ((this.replay ? this.replay.mode : this.mode) === 'cheese') {
      this.game.addGarbage(this.replay ? replayCfg.cheeseRows ?? 8 : this.cheeseRows);
    }

    this.input = new InputController({
      keybinds,
      dasMs: settings.dasMs,
      arrMs: settings.arrMs,
      onAction: (a) => this._onAction(a),
    });
    this.input.attach(this.game);
    this.input.onPause = () => this._togglePause();
    this.input.onRestart = () => this._restart(false);
    this.input.enabled = false;

    this.phase = 'countdown';
    this.countdownT = 0;
    this.countdownIdx = -1;
    this.bufferedActions = new Set();
    this.finesse = { optimal: 0, spent: 0 };
    this.inputsThisPiece = 0;
    this.heldThisPiece = false;
    this.recording = [];
    this.replayClock = 0;
    this.replayIdx = 0;
    this.gameOverAnim = -1;
    this.dangerOn = false;
    this.clearFlash = null; // {rows, t}
    this.finished = false;
    this.particles.clear();

    // Engine event wiring → audio / particles / toasts.
    const ev = this.game.events;
    const track = (unsub) => this._unsubs.push(unsub);
    track(ev.on('move', () => audio.play('move')));
    track(ev.on('rotate', () => audio.play('rotate')));
    track(ev.on('hold', () => {
      audio.play('hold');
      this.heldThisPiece = true;
    }));
    track(ev.on('harddrop', ({ distance }) => {
      audio.play('harddrop');
      if (distance > 2) this.shake.shake(3, 120);
      this._burstAtPiece(6);
    }));
    track(ev.on('lock', (e) => this._onLock(e)));
    track(ev.on('clear', (e) => this._onClear(e)));
    track(ev.on('levelup', ({ level }) => {
      audio.play('levelup');
      audio.setMusicLevel(level);
      this._toast(fmt(STR.game.toasts.levelUp, { n: level }), 'var(--accent)');
    }));
    track(ev.on('zenreset', () => this._toast(STR.game.toasts.zenReset, 'var(--green)')));
    track(ev.on('over', () => this._onGameOver()));

    this._onBlur = () => {
      if (this.ctx.settings.autoPauseOnBlur && this.phase === 'playing' && !this.replay) this._togglePause(true);
    };
    window.addEventListener('blur', this._onBlur);

    if (settings.musicEnabled) {
      audio.startMusic();
      audio.setMusicLevel(this.game.stats.level);
    }
  }

  _teardownGame() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._pauseModal?.close();
    this._pauseModal = null;
  }

  _restart(sameSeed) {
    if (this.replay) {
      this._startGame();
      return;
    }
    if (!sameSeed) this.seed = randomSeed();
    this.ctx.audio.play('click');
    this._startGame();
  }

  _backToMenu() {
    this.ctx.manager.switchTo(this.replay ? 'records' : 'modeSelect');
  }

  // ── Input / actions ──────────────────────────────────────────────────────

  onKeyDown(e) {
    if (this.phase === 'countdown') {
      // IRS/IHS buffering: rotation/hold pressed during the countdown.
      const action = Object.entries(this.ctx.keybinds).find(([, code]) => code === e.code)?.[0];
      if (action && ['rotateCW', 'rotateCCW', 'rotate180', 'hold'].includes(action)) {
        this.bufferedActions.add(action);
        e.preventDefault();
        return;
      }
    }
    if (this.replay) {
      if (e.code === 'Space') {
        e.preventDefault();
        this._togglePause();
      } else if (e.code === 'Escape') this._backToMenu();
      return;
    }
    this.input?.onKeyDown(e);
  }

  onKeyUp(e) {
    if (!this.replay) this.input?.onKeyUp(e);
  }

  _onAction(action) {
    if (this.phase !== 'playing') return;
    this.recording.push({ t: Math.round(this.game.stats.timeMs), a: action });
    if (['moveLeft', 'moveRight', 'rotateCW', 'rotateCCW', 'rotate180', 'hold'].includes(action)) {
      this.inputsThisPiece++;
    }
  }

  _applyReplayAction(a) {
    const g = this.game;
    const map = {
      moveLeft: () => g.moveLeft(),
      moveRight: () => g.moveRight(),
      rotateCW: () => g.rotateCW(),
      rotateCCW: () => g.rotateCCW(),
      rotate180: () => g.rotate180(),
      hold: () => g.hold(),
      hardDrop: () => g.hardDrop(),
      softDropOn: () => g.setSoftDrop(true),
      softDropOff: () => g.setSoftDrop(false),
    };
    map[a]?.();
  }

  // ── Engine events ────────────────────────────────────────────────────────

  _onLock(e) {
    this.ctx.audio.play('lock');
    // Finesse: compare inputs spent vs optimal for this placement.
    const spent = this.inputsThisPiece + 1; // + hard drop
    const optimal = optimalInputs({ rotation: e.rot, dx: e.x - 3, usedHold: this.heldThisPiece });
    this.finesse.optimal += Math.min(optimal, spent);
    this.finesse.spent += spent;
    this.inputsThisPiece = 0;
    this.heldThisPiece = false;
    this._checkGoals();
    this._checkDanger();
  }

  _onClear(e) {
    const audio = this.ctx.audio;
    const t = STR.game.toasts;
    const colors = THEMES[this.ctx.settings.theme]?.colors ?? THEMES.neon.colors;
    if (e.lines > 0) {
      this.clearFlash = { rows: e.rows.map((r) => r - 4), t: 0 };
      if (this.ctx.settings.particles && !this.ctx.settings.reducedMotion) {
        for (const row of e.rows) {
          this.particles.spawnLineClear(2, 2, (row - 4 + 0.5) * this.cellSize, BOARD_WIDTH * this.cellSize, this.cellSize, [colors[1], colors[3], colors[7]]);
        }
      }
    }
    let label = null;
    let color = 'var(--accent)';
    if (e.tspin === 'full') {
      label = [t.tspin, t.tspinSingle, t.tspinDouble, t.tspinTriple][e.lines];
      color = 'var(--accent-2)';
      audio.play('tspin');
      this.shake.shake(5, 200);
    } else if (e.tspin === 'mini') {
      label = t.tspinMini;
      color = 'var(--accent-2)';
      audio.play('tspin');
    } else if (e.lines === 4) {
      label = t.tetris;
      color = 'var(--gold)';
      audio.play('tetris');
      this.shake.shake(7, 260);
      if (this.ctx.settings.particles && !this.ctx.settings.reducedMotion) {
        this.particles.spawnConfetti(0, 0, BOARD_WIDTH * this.cellSize);
      }
    } else if (e.lines > 0) {
      label = [null, t.single, t.double, t.triple][e.lines];
      audio.play(e.lines === 1 ? 'clear' : e.lines === 2 ? 'double' : 'triple');
    }
    if (label) this._toast(label, color);
    if (e.b2bApplied) {
      this._toast(fmt(t.b2b, { n: e.b2b }), 'var(--gold)', 34);
      audio.play('b2b');
    }
    if (e.combo > 0) {
      this._toast(fmt(t.combo, { n: e.combo }), 'var(--accent)', 62);
      audio.play('combo', { step: e.combo });
    }
    if (e.allClear) {
      this._toast(t.allClear, 'var(--gold)', 90);
      audio.play('allclear');
      if (this.ctx.settings.particles && !this.ctx.settings.reducedMotion) {
        this.particles.spawnConfetti(0, 0, BOARD_WIDTH * this.cellSize);
      }
    }
  }

  _onGameOver() {
    this.ctx.audio.play('gameover');
    this.ctx.audio.stopMusic();
    this.ctx.audio.setDanger(false);
    this.input.enabled = false;
    this.input.releaseAll();
    this.phase = 'gameover-anim';
    this.gameOverAnim = 0;
  }

  _checkGoals() {
    if (this.finished || this.replay) return;
    const st = this.game.stats;
    const win =
      (this.mode === 'sprint' && st.lines >= SPRINT_GOAL) ||
      (this.mode === 'marathon' && st.lines >= MARATHON_GOAL) ||
      (this.mode === 'cheese' && this.game.board.countGarbageRows() === 0);
    if (win) this._finish(true);
  }

  _checkDanger() {
    this.game.board.getColumnHeights(this.heights);
    let max = 0;
    for (const h of this.heights) if (h > max) max = h;
    const danger = max > 15 && this.game.state === 'playing';
    if (danger !== this.dangerOn) {
      this.dangerOn = danger;
      this.boardWrap.classList.toggle('danger-pulse', danger);
      this.ctx.audio.setDanger(danger);
      if (danger) this.ctx.audio.play('danger');
    }
  }

  _finish(victory) {
    this.finished = true;
    this.input.enabled = false;
    this.input.releaseAll();
    this.ctx.audio.stopMusic();
    this.ctx.audio.setDanger(false);
    if (victory) this.ctx.audio.play('allclear');
    this.phase = 'summary';
    this._showSummary(victory);
  }

  // ── Pause ────────────────────────────────────────────────────────────────

  _togglePause(force = false) {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.input.enabled = false;
      this.input.releaseAll();
      this.ctx.audio.stopMusic();
      const s = STR;
      this._pauseModal = modal({
        title: s.game.paused,
        content: el('div', {}),
        onClose: false,
        buttons: [
          { label: s.common.resume, cls: 'btn-primary', onClick: () => this._resumeFromPause() },
          { label: s.common.restart, onClick: () => this._restart(false) },
          { label: s.settings.title, onClick: () => this.ctx.manager.switchTo('settings') },
          { label: s.common.menu, cls: 'btn-ghost', onClick: () => this.ctx.manager.switchTo('menu') },
        ],
      });
    } else if (this.phase === 'paused' && !force) {
      this._resumeFromPause();
    }
  }

  _resumeFromPause() {
    this._pauseModal?.close();
    this._pauseModal = null;
    this.phase = 'countdown';
    this.countdownT = 0;
    this.countdownIdx = -1;
  }

  // ── Update / render ──────────────────────────────────────────────────────

  update(dt) {
    this.particles.update(dt);
    this.shake.update(dt);
    if (this.clearFlash) {
      this.clearFlash.t += dt;
      if (this.clearFlash.t > 160) this.clearFlash = null;
    }

    if (this.phase === 'countdown') {
      this.countdownT += dt;
      const idx = Math.floor(this.countdownT / COUNTDOWN_STEP_MS);
      if (idx !== this.countdownIdx && idx < STR.game.countdown.length) {
        this.countdownIdx = idx;
        this._showCountdown(STR.game.countdown[idx]);
        this.ctx.audio.play(idx === STR.game.countdown.length - 1 ? 'go' : 'countdown');
      }
      if (this.countdownT >= COUNTDOWN_STEP_MS * STR.game.countdown.length) {
        this.phase = 'playing';
        this.input.enabled = !this.replay;
        if (this.ctx.settings.musicEnabled) this.ctx.audio.startMusic();
        // Apply buffered IRS/IHS.
        for (const a of this.bufferedActions) {
          if (a === 'hold') this.game.hold();
          else if (a === 'rotateCW') this.game.rotateCW();
          else if (a === 'rotateCCW') this.game.rotateCCW();
          else if (a === 'rotate180') this.game.rotate180();
        }
        this.bufferedActions.clear();
      }
      return;
    }

    if (this.phase === 'gameover-anim') {
      this.gameOverAnim += dt;
      if (this.gameOverAnim > 900) {
        this.phase = 'summary';
        this._showSummary(false);
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (this.replay) {
      this.replayClock += dt * this.replaySpeed;
      const inputs = this.replay.inputs ?? [];
      while (this.replayIdx < inputs.length && inputs[this.replayIdx].t <= this.replayClock) {
        this._applyReplayAction(inputs[this.replayIdx].a);
        this.replayIdx++;
      }
      this.game.step(dt * this.replaySpeed);
      if (this.game.state === 'over' && !this.finished) {
        this.finished = true;
        this._toast(STR.replay.finished, 'var(--accent)');
      }
      return;
    }

    this.input.update(dt);
    this.game.step(dt);

    if (this.mode === 'ultra' && this.game.stats.timeMs >= ULTRA_MS && !this.finished) {
      this._finish(true);
    }
  }

  render() {
    if (!this.game) return;
    const ctx2d = this.boardCanvas.getContext('2d');
    const w = this.boardCanvas.clientWidth;
    const h = this.boardCanvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.save();
    ctx2d.translate(2 + this.shake.offset.x, 2 + this.shake.offset.y);

    this.game.getSnapshot(this.snapshot);
    const dim = this.phase === 'paused';
    this.ctx.boardRenderer.draw(ctx2d, this.snapshot, 0, 0, this.cellSize, { dim });

    // Game-over fill animation: gray rises from the bottom.
    if (this.phase === 'gameover-anim' || (this.phase === 'summary' && this.game.state === 'over')) {
      const progress = Math.min(1, (this.gameOverAnim ?? 900) / 900);
      const rows = Math.floor(progress * BOARD_HEIGHT);
      ctx2d.fillStyle = 'rgba(110,116,134,0.75)';
      for (let r = 0; r < rows; r++) {
        ctx2d.fillRect(0, (BOARD_HEIGHT - 1 - r) * this.cellSize, BOARD_WIDTH * this.cellSize, this.cellSize);
      }
    }

    // Line-clear flash overlay.
    if (this.clearFlash) {
      const alpha = 1 - this.clearFlash.t / 160;
      ctx2d.fillStyle = `rgba(255,255,255,${0.55 * alpha})`;
      for (const row of this.clearFlash.rows) {
        ctx2d.fillRect(0, row * this.cellSize, BOARD_WIDTH * this.cellSize, this.cellSize);
      }
    }

    if (this.ctx.settings.particles) this.particles.render(ctx2d);
    ctx2d.restore();

    this._renderSidePanels();
    this._renderHud();
  }

  _renderSidePanels() {
    const hold = this.holdCanvas.getContext('2d');
    hold.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    if (this.game.holdType) {
      this.ctx.boardRenderer.drawPreview(hold, this.game.holdType, 55, 45, 20, { dim: !this.game.canHold });
    }
    const next = this.nextCanvas.getContext('2d');
    next.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const queue = this.game.nextQueue;
    for (let i = 0; i < queue.length; i++) {
      this.ctx.boardRenderer.drawPreview(next, queue[i], 55, 34 + i * 56, i === 0 ? 20 : 16);
    }
  }

  _renderHud() {
    const st = this.game.stats;
    this.statScore.value.textContent = formatNumber(st.score);
    const activeMode = this.replay ? this.replay.mode : this.mode;
    this.statLines.value.textContent =
      activeMode === 'sprint' ? `${st.lines}/${SPRINT_GOAL}` : activeMode === 'marathon' ? `${st.lines}/${MARATHON_GOAL}` : String(st.lines);
    this.statLevel.value.textContent = String(st.level);
    this.statTime.value.textContent = formatTime(st.timeMs, { centis: activeMode === 'sprint' });
    this.statPps.value.textContent = (st.pieces / Math.max(0.001, st.timeMs / 1000)).toFixed(2);
    this.comboLabel.textContent = st.combo > 0 ? `×${st.combo}` : '';
    this.b2bLabel.textContent = st.b2b > 1 ? `×${st.b2b}` : '';

    if (activeMode === 'ultra') {
      const left = Math.max(0, ULTRA_MS - st.timeMs);
      this.topInfo.textContent = formatTime(left);
      this.topInfo.style.color = left < 10000 ? 'var(--red)' : '';
    } else if (activeMode === 'sprint') {
      const best = getBestScore('sprint');
      this.topInfo.textContent = best ? `${STR.modes.best}: ${formatTime(best.timeMs, { centis: true })}` : '';
    } else if (activeMode === 'cheese') {
      this.topInfo.textContent = `${STR.modes.cheeseRows}: ${this.game.board.countGarbageRows()}`;
    } else if (this.replay) {
      this.topInfo.textContent = `${STR.replay.piece} ${st.pieces}`;
    }
  }

  // ── Overlays ─────────────────────────────────────────────────────────────

  _showCountdown(text) {
    this.overlayLayer.innerHTML = '';
    this.overlayLayer.append(
      el('div', { class: 'board-overlay-msg', style: { background: 'rgba(6,8,14,0.45)' } }, el('div', { class: 'countdown-number' }, text)),
    );
    if (text === STR.game.countdown[STR.game.countdown.length - 1]) {
      setTimeout(() => (this.overlayLayer.innerHTML = ''), 400);
    }
  }

  _toast(text, color, topPx = 8) {
    const node = el('div', { class: 'action-toast', style: { top: `${topPx}%`, color, fontSize: '22px' } }, text);
    this.overlayLayer.append(node);
    setTimeout(() => node.remove(), 1100);
  }

  _burstAtPiece(count) {
    if (!this.ctx.settings.particles || this.ctx.settings.reducedMotion) return;
    const c = this.game.current;
    if (!c) return;
    const colors = THEMES[this.ctx.settings.theme]?.colors ?? THEMES.neon.colors;
    this.particles.spawnBurst((c.x + 1.5) * this.cellSize, (c.y - 4 + 1) * this.cellSize, {
      color: colors[c.type],
      count,
      speed: 90,
      angle: -Math.PI / 2,
      spread: 1.2,
      lifeMs: 350,
    });
  }

  // ── Summary / records ────────────────────────────────────────────────────

  async _showSummary(victory) {
    if (this.replay) return;
    const s = STR.summary;
    const st = this.game.stats;
    const stats = { ...st, pieceCounts: Array.from(st.pieceCounts), breakdown: { ...st.breakdown } };
    accumulateLifetimeStats(this.mode, st);

    // Persist the replay (last game per mode + records).
    let replayId = null;
    try {
      const old = (await listReplays()).filter((r) => r.mode === this.mode && r.label === 'Última partida');
      for (const r of old) await deleteReplay(r.id);
      const saved = await saveReplay({
        mode: this.mode,
        seed: this.seed,
        inputs: this.recording,
        stats: { score: st.score, lines: st.lines, level: st.level, timeMs: st.timeMs, pieces: st.pieces },
        config: {
          startLevel: this.startLevel,
          previewCount: this.ctx.settings.previewCount,
          softDropFactor: this.ctx.settings.softDropFactor,
          cheeseRows: this.cheeseRows,
        },
        label: 'Última partida',
      });
      replayId = saved.id;
    } catch {
      /* IndexedDB unavailable — skip replay persistence */
    }

    // High score qualification (sprint requires victory; ranked by time).
    const table = getHighScores(this.mode);
    const qualifies =
      (this.mode !== 'sprint' || victory) &&
      (table.length < 10 || (this.mode === 'sprint' ? st.timeMs < table[table.length - 1].timeMs : st.score > table[table.length - 1].score));

    let rank = 0;
    if (qualifies && (st.score > 0 || victory)) {
      this.ctx.audio.play('record');
      const name = (await promptModal(`${s.newRecord} ${s.enterName}`, { value: 'Jugador' })) || 'Jugador';
      rank = submitHighScore(this.mode, {
        name: name.slice(0, 12),
        score: st.score,
        lines: st.lines,
        level: st.level,
        timeMs: st.timeMs,
        date: Date.now(),
        seed: this.seed,
        replayId,
      });
    }

    const bd = stats.breakdown;
    const breakdownRows = [
      [s.clearPoints, bd.clearPoints],
      [s.tspinPoints, bd.tspinPoints],
      [s.comboPoints, bd.comboPoints],
      [s.b2bBonus, bd.b2bBonus],
      [s.allClearPoints, bd.allClearPoints],
      [s.dropPoints, bd.dropPoints],
    ].filter(([, v]) => v > 0);

    const maxPiece = Math.max(...stats.pieceCounts.slice(1), 1);
    const distBars = el(
      'div',
      { class: 'row', style: { alignItems: 'flex-end', gap: '6px', height: '64px', margin: '8px 0' } },
      stats.pieceCounts.slice(1).map((count, i) =>
        el(
          'div',
          { class: 'col', style: { alignItems: 'center', gap: '2px', flex: '1' } },
          el('div', {
            style: {
              width: '100%',
              height: `${Math.round((count / maxPiece) * 44)}px`,
              background: (THEMES[this.ctx.settings.theme]?.colors ?? THEMES.neon.colors)[i + 1],
              borderRadius: '2px',
              minHeight: '2px',
            },
          }),
          el('span', { style: { fontSize: '10px', color: 'var(--text-dim)' } }, `${PIECE_NAMES[i + 1]}·${count}`),
        ),
      ),
    );

    const finessePct = this.finesse.spent > 0 ? Math.round((this.finesse.optimal / this.finesse.spent) * 100) : 100;
    const tetrisRate = st.lines > 0 ? Math.round(((st.tetrises * 4) / st.lines) * 100) : 0;
    const best = getBestScore(this.mode);

    modal({
      title: victory ? STR.game.victory : STR.game.gameOver,
      wide: false,
      content: el(
        'div',
        {},
        rank > 0 ? el('p', { style: { color: 'var(--gold)', fontWeight: '700', marginBottom: '8px' } }, `${s.newRecord} — #${rank}`) : null,
        el(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '10px' } },
          statCard(STR.common.score, formatNumber(st.score)),
          statCard(STR.common.lines, st.lines),
          statCard(STR.common.level, st.level),
          statCard(STR.common.time, formatTime(st.timeMs, { centis: this.mode === 'sprint' })),
          statCard(STR.game.pps, (st.pieces / Math.max(0.001, st.timeMs / 1000)).toFixed(2)),
        ),
        el('div', { class: 'panel-title' }, s.breakdown),
        el(
          'table',
          { class: 'data-table' },
          breakdownRows.map(([label, v]) => el('tr', {}, el('td', {}, label), el('td', { style: { textAlign: 'right' } }, formatNumber(v)))),
        ),
        el('div', { class: 'panel-title', style: { marginTop: '10px' } }, s.pieceDistribution),
        distBars,
        el(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
          statCard(s.tetrisRate, `${tetrisRate}%`),
          statCard(s.finesseRate, `${finessePct}%`),
          best ? statCard(s.vsBest, this.mode === 'sprint' ? formatTime(best.timeMs, { centis: true }) : formatNumber(best.score)) : null,
        ),
      ),
      onClose: () => this._restart(false),
      buttons: [
        { label: s.retry, cls: 'btn-primary', onClick: () => this._restart(false) },
        { label: s.playAgainSeed, onClick: () => this._restart(true) },
        { label: STR.common.menu, cls: 'btn-ghost', onClick: () => this.ctx.manager.switchTo('modeSelect') },
      ],
    });
  }
}

function statCard(label, value) {
  return el('div', { class: 'stat-card' }, el('div', { class: 'stat-label' }, label), el('div', { class: 'stat-value' }, String(value)));
}

// ═════════════════════════════════════════════════════════════════════════
// ModeSelectScene
// ═════════════════════════════════════════════════════════════════════════

export class ModeSelectScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.startLevel = ctx.settings.startLevel ?? 1;
    this.cheeseRows = 8;
  }

  enter() {
    const s = STR.modes;
    const cards = MODES.map((mode, i) => {
      const best = getBestScore(mode);
      const bestText = best
        ? mode === 'sprint'
          ? formatTime(best.timeMs, { centis: true })
          : formatNumber(best.score)
        : STR.common.none;
      return el(
        'div',
        { class: 'card', onclick: () => this._start(mode) },
        el('div', { class: 'card-title' }, `${i + 1} · ${s[mode].name}`),
        el('div', { class: 'card-sub' }, s[mode].desc),
        el('div', { class: 'card-sub', style: { marginTop: '6px', color: 'var(--gold)' } }, `${s.best}: ${bestText}`),
      );
    });

    const levelSlider = el('input', {
      class: 'slider',
      type: 'range',
      min: 1,
      max: 15,
      value: this.startLevel,
      oninput: () => {
        this.startLevel = Number(levelSlider.value);
        levelLabel.textContent = String(this.startLevel);
      },
    });
    const levelLabel = el('span', { class: 'slider-value' }, String(this.startLevel));
    const cheeseSlider = el('input', {
      class: 'slider',
      type: 'range',
      min: 4,
      max: 16,
      value: this.cheeseRows,
      oninput: () => {
        this.cheeseRows = Number(cheeseSlider.value);
        cheeseLabel.textContent = String(this.cheeseRows);
      },
    });
    const cheeseLabel = el('span', { class: 'slider-value' }, String(this.cheeseRows));

    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar' },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, s.title),
      ),
      el(
        'div',
        { class: 'panel scrollable', style: { flex: '1' } },
        el('div', { class: 'card-grid' }, cards),
        el(
          'div',
          { class: 'row', style: { marginTop: '16px', gap: '30px', flexWrap: 'wrap' } },
          el('div', { class: 'row', style: { flex: '1', minWidth: '260px' } }, el('span', { class: 'field-label' }, s.startLevel), levelSlider, levelLabel),
          el('div', { class: 'row', style: { flex: '1', minWidth: '260px' } }, el('span', { class: 'field-label' }, s.cheeseRows), cheeseSlider, cheeseLabel),
        ),
      ),
    );
    this.ctx.root.append(this.el);
  }

  exit() {}

  _start(mode) {
    this.ctx.audio.play('click');
    this.ctx.settings.startLevel = this.startLevel;
    this.ctx.saveSettings();
    this.ctx.manager.switchTo('play', { mode, startLevel: this.startLevel, cheeseRows: this.cheeseRows });
  }

  onKeyDown(e) {
    if (e.key === 'Escape') this.ctx.manager.switchTo('menu');
    else if (/^[1-6]$/.test(e.key)) this._start(MODES[Number(e.key) - 1]);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RecordsScene
// ═════════════════════════════════════════════════════════════════════════

export class RecordsScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.activeMode = 'marathon';
  }

  enter() {
    const s = STR.records;
    this.content = el('div', { class: 'col', style: { flex: '1', minHeight: '0' } });
    const tabs = tabBar(
      MODES.map((m) => ({ id: m, label: STR.modes[m].name })),
      this.activeMode,
      (id) => {
        this.activeMode = id;
        tabs.setActive(id);
        this._renderTables();
      },
    );
    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar' },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, s.title),
        el('span', { class: 'spacer' }),
        tabs.bar,
      ),
      this.content,
    );
    this.ctx.root.append(this.el);
    this._renderTables();
  }

  exit() {}

  async _renderTables() {
    const s = STR.records;
    this.content.innerHTML = '';
    const scores = getHighScores(this.activeMode);
    const isSprint = this.activeMode === 'sprint';

    const table =
      scores.length === 0
        ? el('p', { style: { color: 'var(--text-dim)', padding: '14px' } }, s.empty)
        : el(
            'table',
            { class: 'data-table' },
            el(
              'tr',
              {},
              el('th', {}, '#'),
              el('th', {}, STR.common.name),
              el('th', {}, isSprint ? STR.common.time : STR.common.score),
              el('th', {}, STR.common.lines),
              el('th', {}, STR.common.level),
              el('th', {}, STR.common.date),
              el('th', {}, ''),
            ),
            scores.map((entry, i) =>
              el(
                'tr',
                { class: i === 0 ? 'row-highlight' : '' },
                el('td', {}, String(i + 1)),
                el('td', {}, entry.name),
                el('td', {}, isSprint ? formatTime(entry.timeMs, { centis: true }) : formatNumber(entry.score)),
                el('td', {}, String(entry.lines)),
                el('td', {}, String(entry.level)),
                el('td', {}, new Date(entry.date).toLocaleDateString('es-ES')),
                el(
                  'td',
                  {},
                  entry.replayId
                    ? button(s.watchReplay, async () => {
                        const replay = await getReplay(entry.replayId);
                        if (replay) this.ctx.manager.switchTo('play', { replay });
                        else toast(s.noReplay, 'error');
                      }, 'btn-icon')
                    : '',
                ),
              ),
            ),
          );

    const life = loadLifetimeStats();
    const lifePanel = el(
      'div',
      { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
      statCard(s.totalGames, formatNumber(life.games)),
      statCard(s.totalLines, formatNumber(life.lines)),
      statCard(s.totalPieces, formatNumber(life.pieces)),
      statCard(s.totalTetrises, formatNumber(life.tetrises)),
      statCard(s.totalTspins, formatNumber(life.tspins)),
      statCard(s.maxCombo, `×${life.maxCombo}`),
      statCard(s.totalTime, formatTime(life.timeMs)),
    );

    let replays = [];
    try {
      replays = (await listReplays()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    } catch {
      /* no IndexedDB */
    }
    const replayList = el(
      'div',
      { class: 'col', style: { gap: '6px' } },
      replays.map((r) =>
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '4px 0' } },
          el(
            'span',
            { style: { fontSize: '12px' } },
            `${STR.modes[r.mode]?.name ?? r.mode} · ${r.label} · ${formatNumber(r.stats?.score ?? 0)} pts · ${new Date(r.createdAt).toLocaleString('es-ES')}`,
          ),
          el(
            'div',
            { class: 'row', style: { gap: '4px' } },
            button(s.watchReplay, () => this.ctx.manager.switchTo('play', { replay: r }), 'btn-icon'),
            button('✕', async () => {
              await deleteReplay(r.id);
              this._renderTables();
            }, 'btn-icon btn-danger'),
          ),
        ),
      ),
    );

    this.content.append(
      el('div', { class: 'panel scrollable', style: { flex: '1' } },
        table,
        el('div', { class: 'panel-title', style: { marginTop: '18px' } }, s.lifetime),
        lifePanel,
        el('div', { class: 'panel-title', style: { marginTop: '18px' } }, s.replays),
        replays.length ? replayList : el('p', { style: { color: 'var(--text-dim)' } }, STR.common.none),
      ),
    );
  }

  onKeyDown(e) {
    if (e.key === 'Escape') this.ctx.manager.switchTo('menu');
  }
}
