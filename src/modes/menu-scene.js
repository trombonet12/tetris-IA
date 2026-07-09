import { el } from '../ui/dom.js';
import { STR } from '../ui/strings.es.js';
import { mulberry32, randomSeed } from '../core/rng.js';
import { PIECES } from '../game/pieces.js';
import { THEMES } from '../ui/board-renderer.js';

const ENTRIES = [
  { icon: '▶', label: STR.menu.play, scene: 'modeSelect' },
  { icon: '⚙', label: STR.menu.training, scene: 'training' },
  { icon: '◉', label: STR.menu.watch, scene: 'watch' },
  { icon: '★', label: STR.menu.records, scene: 'records' },
  { icon: '⚒', label: STR.menu.settings, scene: 'settings' },
];

/** Main menu: neon logo, 5 buttons, canvas of slowly falling pieces. */
export class MenuScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.focus = 0;
    this.buttons = [];
    this.pieces = [];
    this.rng = mulberry32(randomSeed());
  }

  enter() {
    const { root } = this.ctx;
    this.canvas = el('canvas', { class: 'menu-bg' });
    this.buttons = ENTRIES.map((entry, i) =>
      el(
        'button',
        {
          class: 'btn menu-btn',
          onclick: () => this._go(i),
          onmouseenter: () => this._setFocus(i),
        },
        el('span', { class: 'menu-btn-icon' }, entry.icon),
        el('span', {}, entry.label),
        el('span', { class: 'spacer' }),
        el('span', { style: { color: 'var(--text-dim)', fontSize: '12px' } }, String(i + 1)),
      ),
    );
    this.el = el(
      'div',
      { class: 'scene menu-scene' },
      this.canvas,
      el(
        'div',
        { class: 'menu-box' },
        el('div', {}, el('div', { class: 'menu-logo' }, 'TETRIS·', el('span', { class: 'logo-ia' }, 'IA')), el('div', { class: 'menu-subtitle' }, STR.app.subtitle)),
        el('div', { class: 'menu-buttons' }, this.buttons),
        el('div', { class: 'menu-footer' }, `${STR.menu.hint} · ${STR.app.footer}`),
      ),
    );
    root.append(this.el);
    this._setFocus(0);
    this._spawnInitialPieces();
  }

  exit() {}

  _go(i) {
    this.ctx.audio.play('click');
    this.ctx.manager.switchTo(ENTRIES[i].scene);
  }

  _setFocus(i) {
    this.focus = i;
    this.buttons.forEach((b, j) => b.classList.toggle('menu-btn-focused', j === i));
  }

  onKeyDown(e) {
    if (e.key === 'ArrowDown') this._setFocus((this.focus + 1) % ENTRIES.length);
    else if (e.key === 'ArrowUp') this._setFocus((this.focus + ENTRIES.length - 1) % ENTRIES.length);
    else if (e.key === 'Enter') this._go(this.focus);
    else if (/^[1-5]$/.test(e.key)) this._go(Number(e.key) - 1);
  }

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _spawnInitialPieces() {
    for (let i = 0; i < 14; i++) this._spawnPiece(true);
  }

  _spawnPiece(anywhere = false) {
    const type = 1 + Math.floor(this.rng() * 7);
    this.pieces.push({
      type,
      x: this.rng() * (this.canvas?.clientWidth || window.innerWidth),
      y: anywhere ? this.rng() * (this.canvas?.clientHeight || window.innerHeight) : -60,
      rot: this.rng() * Math.PI * 2,
      spin: (this.rng() - 0.5) * 0.0012,
      speed: 12 + this.rng() * 26,
      size: 10 + this.rng() * 14,
      alpha: 0.08 + this.rng() * 0.12,
    });
  }

  update(dt) {
    const h = this.canvas?.clientHeight || window.innerHeight;
    for (const p of this.pieces) {
      p.y += (p.speed * dt) / 1000;
      p.rot += p.spin * dt;
    }
    this.pieces = this.pieces.filter((p) => p.y < h + 80);
    while (this.pieces.length < 14) this._spawnPiece();
  }

  render() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const colors = THEMES[this.ctx.settings.theme]?.colors ?? THEMES.neon.colors;
    for (const p of this.pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = colors[p.type];
      for (const [cx, cy] of PIECES[p.type][0]) {
        ctx.fillRect((cx - 1.5) * p.size, (cy - 1) * p.size, p.size - 1, p.size - 1);
      }
      ctx.restore();
    }
  }
}
