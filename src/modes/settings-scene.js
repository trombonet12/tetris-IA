import { el, button, fieldRow, slider, select, checkbox, tabBar, toast, confirmModal } from '../ui/dom.js';
import { STR, fmt } from '../ui/strings.es.js';
import { DEFAULT_KEYBINDS } from '../core/config.js';
import { DEFAULT_SETTINGS, exportAllLocalData, importAllLocalData, clearAllLocalData } from '../storage/settings-store.js';
import { downloadText, pickTextFile } from '../storage/file-io.js';
import { listModels, listSessions } from '../storage/model-store.js';
import { dbClear } from '../storage/db.js';

const TABS = [
  { id: 'controls', label: STR.settings.tabs.controls },
  { id: 'game', label: STR.settings.tabs.game },
  { id: 'video', label: STR.settings.tabs.video },
  { id: 'audio', label: STR.settings.tabs.audio },
  { id: 'data', label: STR.settings.tabs.data },
];

export class SettingsScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.activeTab = 'controls';
    this._capturing = null; // action being rebound
  }

  enter(params = {}) {
    if (params.tab) this.activeTab = params.tab;
    const { root } = this.ctx;
    this.content = el('div', { class: 'panel scrollable', style: { flex: '1' } });
    const tabs = tabBar(TABS, this.activeTab, (id) => {
      this.activeTab = id;
      tabs.setActive(id);
      this._renderTab();
    });
    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar' },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, STR.settings.title),
        el('span', { class: 'spacer' }),
        tabs.bar,
      ),
      this.content,
    );
    root.append(this.el);
    this._renderTab();
  }

  exit() {
    window.clearInterval(this._gamepadPoll);
  }

  _save() {
    this.ctx.saveSettings();
    this.ctx.applyVideoSettings();
  }

  _renderTab() {
    window.clearInterval(this._gamepadPoll);
    this.content.innerHTML = '';
    const render = {
      controls: () => this._renderControls(),
      game: () => this._renderGame(),
      video: () => this._renderVideo(),
      audio: () => this._renderAudio(),
      data: () => this._renderData(),
    }[this.activeTab];
    render();
  }

  // ── Controls ─────────────────────────────────────────────────────────────

  _renderControls() {
    const s = STR.settings.controls;
    const { keybinds } = this.ctx;
    const rows = Object.keys(DEFAULT_KEYBINDS).map((action) => {
      const keyBtn = button(prettyKey(keybinds[action]), () => this._captureKey(action, keyBtn), 'btn-ghost');
      keyBtn.style.fontFamily = 'var(--font-mono)';
      keyBtn.style.minWidth = '160px';
      return fieldRow(s.actions[action] ?? action, keyBtn);
    });

    const gamepadInfo = el('div', { class: 'card-sub', style: { padding: '8px 0' } }, s.gamepadNone);
    this._gamepadPoll = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p?.connected);
      gamepadInfo.textContent = pad ? fmt(s.gamepadDetected, { name: pad.id.slice(0, 60) }) : s.gamepadNone;
    }, 800);

    this.content.append(
      el('div', { class: 'panel-title' }, s.keyboard),
      ...rows,
      el('div', { style: { marginTop: '14px' } }, button(s.restore, () => this._restoreKeys())),
      el('div', { class: 'panel-title', style: { marginTop: '22px' } }, s.gamepad),
      gamepadInfo,
    );
  }

  _captureKey(action, btn) {
    if (this._capturing) return;
    this._capturing = action;
    btn.textContent = STR.settings.controls.pressKey;
    btn.classList.add('btn-active');
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', handler, true);
      this._capturing = null;
      const { keybinds } = this.ctx;
      const conflict = Object.entries(keybinds).find(([a, code]) => code === e.code && a !== action);
      if (conflict) {
        toast(fmt(STR.settings.controls.conflict, { action: STR.settings.controls.actions[conflict[0]] ?? conflict[0] }), 'error');
      } else {
        keybinds[action] = e.code;
        this.ctx.saveKeybinds();
      }
      this._renderTab();
    };
    window.addEventListener('keydown', handler, true);
  }

  _restoreKeys() {
    Object.assign(this.ctx.keybinds, DEFAULT_KEYBINDS);
    this.ctx.saveKeybinds();
    this._renderTab();
    toast(STR.settings.controls.restore, 'ok');
  }

  // ── Game feel ────────────────────────────────────────────────────────────

  _renderGame() {
    const s = STR.settings.game;
    const st = this.ctx.settings;
    this.content.append(
      fieldRow(
        s.das,
        slider({ min: 50, max: 300, step: 5, value: st.dasMs, format: (v) => `${v} ${s.ms}`, onChange: (v) => ((st.dasMs = v), this._save()) }),
      ),
      fieldRow(
        s.arr,
        slider({ min: 0, max: 100, step: 5, value: st.arrMs, format: (v) => (v === 0 ? '0 (∞)' : `${v} ${s.ms}`), onChange: (v) => ((st.arrMs = v), this._save()) }),
      ),
      fieldRow(
        s.sdf,
        slider({ min: 5, max: 40, step: 1, value: st.softDropFactor, format: (v) => `×${v}`, onChange: (v) => ((st.softDropFactor = v), this._save()) }),
      ),
      fieldRow(STR.settings.game.ghost, checkbox({ checked: st.ghostEnabled, onChange: (v) => ((st.ghostEnabled = v), this._save()) })),
      fieldRow(
        s.previews,
        slider({ min: 1, max: 6, step: 1, value: st.previewCount, format: String, onChange: (v) => ((st.previewCount = v), this._save()) }),
      ),
    );
  }

  // ── Video ────────────────────────────────────────────────────────────────

  _renderVideo() {
    const s = STR.settings.video;
    const st = this.ctx.settings;
    this.content.append(
      fieldRow(
        s.theme,
        select({
          options: Object.entries(s.themes),
          value: st.theme,
          onChange: (v) => ((st.theme = v), this._save()),
        }),
      ),
      fieldRow(s.particles, checkbox({ checked: st.particles, onChange: (v) => ((st.particles = v), this._save()) })),
      fieldRow(
        s.screenShake,
        select({ options: Object.entries(s.shakeLevels), value: st.screenShake, onChange: (v) => ((st.screenShake = v), this._save()) }),
      ),
      fieldRow(s.reducedMotion, checkbox({ checked: st.reducedMotion, onChange: (v) => ((st.reducedMotion = v), this._save()) })),
      fieldRow(s.highContrast, checkbox({ checked: st.highContrast, onChange: (v) => ((st.highContrast = v), this._save()) })),
      fieldRow(s.colorblind, checkbox({ checked: st.colorblind, onChange: (v) => ((st.colorblind = v), this._save()) })),
    );
  }

  // ── Audio ────────────────────────────────────────────────────────────────

  _renderAudio() {
    const s = STR.settings.audio;
    const st = this.ctx.settings;
    const apply = () => {
      this._save();
      this.ctx.audio.updateSettings(st);
    };
    this.content.append(
      fieldRow(s.mute, checkbox({ checked: st.muted, onChange: (v) => ((st.muted = v), apply()) })),
      fieldRow(s.sfx, checkbox({ checked: st.sfxEnabled, onChange: (v) => ((st.sfxEnabled = v), apply()) })),
      fieldRow(
        s.sfxVolume,
        slider({ min: 0, max: 100, value: Math.round(st.sfxVolume * 100), format: (v) => `${v}%`, onChange: (v) => ((st.sfxVolume = v / 100), apply(), this.ctx.audio.play('click')) }),
      ),
      fieldRow(s.music, checkbox({ checked: st.musicEnabled, onChange: (v) => ((st.musicEnabled = v), apply()) })),
      fieldRow(
        s.musicVolume,
        slider({ min: 0, max: 100, value: Math.round(st.musicVolume * 100), format: (v) => `${v}%`, onChange: (v) => ((st.musicVolume = v / 100), apply()) }),
      ),
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  async _renderData() {
    const s = STR.settings.data;
    const storageInfo = el('div', { class: 'card-sub' }, '…');
    listModels()
      .then((models) => listSessions().then((sessions) => {
        storageInfo.textContent = fmt(s.modelsCount, { n: models.length, m: sessions.length });
      }))
      .catch(() => (storageInfo.textContent = '—'));

    this.content.append(
      el('div', { class: 'panel-title' }, s.storage),
      storageInfo,
      el(
        'div',
        { class: 'row', style: { marginTop: '14px', flexWrap: 'wrap' } },
        button(s.exportAll, async () => {
          await downloadText('tetris-ia-datos.json', JSON.stringify(exportAllLocalData(), null, 2));
        }),
        button(s.importAll, async () => {
          const text = await pickTextFile('.json');
          if (!text) return;
          try {
            const data = JSON.parse(text);
            if (typeof data !== 'object' || data === null) throw new Error('bad');
            importAllLocalData(data);
            Object.assign(this.ctx.settings, DEFAULT_SETTINGS, data.settings ?? {});
            this._save();
            toast(s.importOk, 'ok');
            this._renderTab();
          } catch {
            toast(s.importBad, 'error');
          }
        }),
        button(s.clearAll, async () => {
          if (!(await confirmModal(s.clearAllConfirm1, { danger: true }))) return;
          if (!(await confirmModal(s.clearAllConfirm2, { danger: true }))) return;
          clearAllLocalData();
          await Promise.all([dbClear('models'), dbClear('sessions'), dbClear('replays'), dbClear('hallOfFame')]).catch(() => {});
          Object.assign(this.ctx.settings, DEFAULT_SETTINGS);
          Object.assign(this.ctx.keybinds, DEFAULT_KEYBINDS);
          this._save();
          toast(s.cleared, 'ok');
          this._renderTab();
        }, 'btn-danger'),
      ),
    );
  }

  onKeyDown(e) {
    if (e.key === 'Escape' && !this._capturing) this.ctx.manager.switchTo('menu');
  }
}

function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace('Key', '')
    .replace('Arrow', '')
    .replace('Digit', '')
    .replace('Left', '←')
    .replace('Right', '→')
    .replace('Up', '↑')
    .replace('Down', '↓')
    .replace('Space', 'Espacio')
    .replace('Escape', 'Esc');
}
