import { FEATURE_LABELS_ES } from '../ai/features.js';

// Live neural network visualizer: layers as columns, weights as colored
// connections (cyan +, magenta −), neuron brightness = activation.

const POS_COLOR = [0, 229, 255];
const NEG_COLOR = [255, 46, 151];
const MAX_CONNECTIONS = 110;

export class NetworkViz {
  constructor(canvas, { inputLabels = FEATURE_LABELS_ES } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.inputLabels = inputLabels;
    this.arch = null;
    this.weights = null;
    this.getConnection = null;
    this.activations = null;
    this._topConnections = [];
    this._zoom = 1;
    this._pan = { x: 0, y: 0 };
    this._hover = null;
    this._drag = null;
    this._size = { w: 0, h: 0 };

    this._onWheel = (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const z = Math.max(0.5, Math.min(3, this._zoom * factor));
      // Zoom centered on the cursor.
      this._pan.x = mx - ((mx - this._pan.x) / this._zoom) * z;
      this._pan.y = my - ((my - this._pan.y) / this._zoom) * z;
      this._zoom = z;
      this.render();
    };
    this._onDown = (e) => {
      this._drag = { x: e.clientX, y: e.clientY, px: this._pan.x, py: this._pan.y };
    };
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (this._drag) {
        this._pan.x = this._drag.px + (e.clientX - this._drag.x);
        this._pan.y = this._drag.py + (e.clientY - this._drag.y);
      }
      this._hover = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.render();
    };
    this._onUp = () => (this._drag = null);
    this._onLeave = () => {
      this._hover = null;
      this._drag = null;
      this.render();
    };
    this._onDbl = () => {
      this._zoom = 1;
      this._pan = { x: 0, y: 0 };
      this.render();
    };
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointerleave', this._onLeave);
    canvas.addEventListener('dblclick', this._onDbl);
  }

  destroy() {
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.canvas.removeEventListener('dblclick', this._onDbl);
  }

  /**
   * @param {number[]} arch
   * @param {Float32Array|null} weights
   * @param {(layer:number, i:number, j:number) => {weight:number, bias:number}} getConnection
   */
  setNetwork(arch, weights, getConnection) {
    this.arch = arch;
    this.weights = weights;
    this.getConnection = getConnection;
    this._computeTopConnections();
  }

  setActivations(activations) {
    this.activations = activations;
  }

  _computeTopConnections() {
    this._topConnections = [];
    if (!this.arch || !this.weights || !this.getConnection) return;
    const all = [];
    for (let l = 0; l < this.arch.length - 1; l++) {
      for (let j = 0; j < this.arch[l + 1]; j++) {
        for (let i = 0; i < this.arch[l]; i++) {
          const { weight } = this.getConnection(l, i, j);
          all.push({ l, i, j, w: weight });
        }
      }
    }
    all.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    this._topConnections = all.slice(0, MAX_CONNECTIONS);
    this._maxAbsW = Math.abs(all[0]?.w ?? 1) || 1;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._size = { w: Math.max(50, rect.width), h: Math.max(50, rect.height) };
    this.canvas.width = Math.floor(this._size.w * dpr);
    this.canvas.height = Math.floor(this._size.h * dpr);
    this._dpr = dpr;
    this.render();
  }

  _layout() {
    const { w, h } = this._size;
    const layers = this.arch.length;
    const labelSpace = this.inputLabels.length ? 110 : 20;
    const colGap = (w - labelSpace - 40) / Math.max(1, layers - 1);
    const positions = [];
    for (let l = 0; l < layers; l++) {
      const n = this.arch[l];
      const col = [];
      const gap = Math.min(26, (h - 30) / n);
      const oy = (h - gap * (n - 1)) / 2;
      for (let i = 0; i < n; i++) col.push({ x: labelSpace + l * colGap, y: oy + i * gap });
      positions.push(col);
    }
    const maxN = Math.max(...this.arch);
    const radius = Math.max(2.5, Math.min(8, (h - 40) / (maxN * 2.4)));
    return { positions, radius, labelSpace };
  }

  render() {
    const ctx = this.ctx;
    if (!this._size.w) this.resize();
    const { w, h } = this._size;
    ctx.setTransform(this._dpr || 1, 0, 0, this._dpr || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.arch) return;
    ctx.translate(this._pan.x, this._pan.y);
    ctx.scale(this._zoom, this._zoom);

    const { positions, radius, labelSpace } = this._layout();

    // Connections (top |w| only).
    for (const c of this._topConnections) {
      const a = positions[c.l][c.i];
      const b = positions[c.l + 1][c.j];
      const mag = Math.min(1, Math.abs(c.w) / this._maxAbsW);
      const [r, g, bl] = c.w >= 0 ? POS_COLOR : NEG_COLOR;
      ctx.strokeStyle = `rgba(${r},${g},${bl},${0.12 + mag * 0.35})`;
      ctx.lineWidth = 0.5 + mag * 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Neurons.
    for (let l = 0; l < positions.length; l++) {
      const acts = this.activations?.[l] ?? null;
      let maxAct = 1;
      if (acts) {
        maxAct = 0;
        for (const v of acts) maxAct = Math.max(maxAct, Math.abs(v));
        maxAct = maxAct || 1;
      }
      for (let i = 0; i < positions[l].length; i++) {
        const p = positions[l][i];
        const act = acts ? Math.abs(acts[i]) / maxAct : 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        if (act > 0.02) {
          const glow = Math.round(60 + act * 195);
          ctx.fillStyle = `rgb(${Math.round(glow * 0.5)},${glow},255)`;
          ctx.shadowColor = 'rgba(0,229,255,0.7)';
          ctx.shadowBlur = act * 10;
        } else {
          ctx.fillStyle = '#1d2438';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#2a3550';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Input labels.
    if (this.inputLabels.length) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#8a93ab';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < Math.min(this.inputLabels.length, positions[0].length); i++) {
        const p = positions[0][i];
        let label = this.inputLabels[i];
        if (label.length > 16) label = `${label.slice(0, 15)}…`;
        ctx.fillText(label, p.x - radius - 4, p.y);
      }
    }

    // Hover tooltip.
    if (this._hover) {
      const hx = (this._hover.x - this._pan.x) / this._zoom;
      const hy = (this._hover.y - this._pan.y) / this._zoom;
      let found = null;
      for (let l = 0; l < positions.length && !found; l++) {
        for (let i = 0; i < positions[l].length; i++) {
          const p = positions[l][i];
          if ((p.x - hx) ** 2 + (p.y - hy) ** 2 <= (radius + 3) ** 2) {
            found = { l, i, p };
            break;
          }
        }
      }
      if (found) this._drawTooltip(ctx, found, labelSpace);
    }

    ctx.setTransform(this._dpr || 1, 0, 0, this._dpr || 1, 0, 0);
  }

  _drawTooltip(ctx, { l, i, p }, labelSpace) {
    const act = this.activations?.[l]?.[i];
    const lines = [`Capa ${l} · neurona ${i}`];
    if (act !== undefined) lines.push(`Activación: ${act.toFixed(3)}`);
    if (l > 0 && this.getConnection) {
      const { bias } = this.getConnection(l - 1, 0, i);
      lines.push(`Bias: ${bias.toFixed(3)}`);
      const incoming = [];
      for (let k = 0; k < this.arch[l - 1]; k++) {
        incoming.push({ k, w: this.getConnection(l - 1, k, i).weight });
      }
      incoming.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
      for (const c of incoming.slice(0, 5)) {
        const name = l - 1 === 0 && this.inputLabels[c.k] ? this.inputLabels[c.k].slice(0, 12) : `n${c.k}`;
        lines.push(`  ${name}: ${c.w >= 0 ? '+' : ''}${c.w.toFixed(3)}`);
      }
    } else if (l === 0 && this.inputLabels[i]) {
      lines.unshift(this.inputLabels[i]);
    }
    ctx.font = '10px monospace';
    const bw = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 14;
    const bh = lines.length * 13 + 8;
    let bx = p.x + 12;
    let by = p.y - bh / 2;
    if (bx + bw > this._size.w / this._zoom) bx = p.x - bw - 12;
    ctx.fillStyle = 'rgba(19,26,42,0.95)';
    ctx.strokeStyle = '#2a3550';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8ecf5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((s, idx) => {
      ctx.fillStyle = idx === 0 ? '#00e5ff' : '#e8ecf5';
      ctx.fillText(s, bx + 7, by + 5 + idx * 13);
    });
  }
}
