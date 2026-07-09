// Canvas charts for the training dashboard and benchmarks. Dark-theme styled.

const AXIS_COLOR = '#8a93ab';
const GRID_COLOR = 'rgba(255,255,255,0.06)';
const FONT = '10px monospace';
const PAD = { left: 44, right: 10, top: 22, bottom: 22 };

function niceTicks(min, max, target = 5) {
  const span = max - min || 1;
  const step0 = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? mag * 10;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function fmtTick(v) {
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function setupDpr(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(50, rect.width);
  const h = Math.max(40, rect.height);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

/**
 * Multi-series line chart with percentile band, wheel zoom (horizontal),
 * drag pan, double-click reset and hover tooltip.
 */
export class LineChart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts { series: [{key,label,color,width?}],
   *   band?: {lowKey, highKey, color}, xLabel?, yLabel? }
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.series = opts.series;
    this.band = opts.band ?? null;
    this.xLabel = opts.xLabel ?? '';
    this.yLabel = opts.yLabel ?? '';
    this.rows = [];
    this._zoom = null; // {x0, x1} in data coords, null = fit all
    this._hover = null; // canvas x of pointer
    this._drag = null;
    this._size = { w: 0, h: 0 };

    this._onWheel = (e) => {
      e.preventDefault();
      if (this.rows.length < 2) return;
      const { x0, x1 } = this._xRange();
      const rect = this.canvas.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / this._plotW()));
      const cx = x0 + frac * (x1 - x0);
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      let nx0 = cx - (cx - x0) * factor;
      let nx1 = cx + (x1 - cx) * factor;
      const [minX, maxX] = this._dataXExtent();
      nx0 = Math.max(minX, nx0);
      nx1 = Math.min(maxX, nx1);
      this._zoom = nx1 - nx0 >= maxX - minX ? null : { x0: nx0, x1: nx1 };
      this.render();
    };
    this._onDown = (e) => {
      this._drag = { startPx: e.clientX, range: this._xRange() };
    };
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this._hover = e.clientX - rect.left;
      if (this._drag && this.rows.length > 1) {
        const { x0, x1 } = this._drag.range;
        const dx = ((e.clientX - this._drag.startPx) / this._plotW()) * (x1 - x0);
        const [minX, maxX] = this._dataXExtent();
        let nx0 = x0 - dx;
        let nx1 = x1 - dx;
        if (nx0 < minX) {
          nx1 += minX - nx0;
          nx0 = minX;
        }
        if (nx1 > maxX) {
          nx0 -= nx1 - maxX;
          nx1 = maxX;
        }
        this._zoom = { x0: nx0, x1: nx1 };
      }
      this.render();
    };
    this._onUp = () => (this._drag = null);
    this._onLeave = () => {
      this._hover = null;
      this._drag = null;
      this.render();
    };
    this._onDblClick = () => {
      this._zoom = null;
      this.render();
    };
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointerleave', this._onLeave);
    canvas.addEventListener('dblclick', this._onDblClick);
  }

  destroy() {
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.canvas.removeEventListener('dblclick', this._onDblClick);
  }

  setData(rows) {
    this.rows = rows;
  }

  resize() {
    this._size = setupDpr(this.canvas, this.ctx);
    this.render();
  }

  _plotW() {
    return Math.max(1, this._size.w - PAD.left - PAD.right);
  }

  _plotH() {
    return Math.max(1, this._size.h - PAD.top - PAD.bottom);
  }

  _dataXExtent() {
    if (this.rows.length === 0) return [0, 1];
    return [this.rows[0].x, this.rows[this.rows.length - 1].x || 1];
  }

  _xRange() {
    if (this._zoom) return this._zoom;
    const [a, b] = this._dataXExtent();
    return { x0: a, x1: Math.max(b, a + 1) };
  }

  render() {
    const ctx = this.ctx;
    if (!this._size.w) this._size = setupDpr(this.canvas, ctx);
    const { w, h } = this._size;
    ctx.clearRect(0, 0, w, h);
    if (this.rows.length === 0) {
      ctx.fillStyle = AXIS_COLOR;
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.fillText('—', w / 2, h / 2);
      return;
    }

    const { x0, x1 } = this._xRange();
    const visible = this.rows.filter((r) => r.x >= x0 - 1 && r.x <= x1 + 1);
    const keys = this.series.map((s) => s.key);
    if (this.band) keys.push(this.band.lowKey, this.band.highKey);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const r of visible) {
      for (const k of keys) {
        const v = r[k];
        if (v === undefined || !Number.isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!Number.isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    if (yMin === yMax) yMax = yMin + 1;
    const yPad = (yMax - yMin) * 0.06;
    yMin -= yPad;
    yMax += yPad;

    const px = (x) => PAD.left + ((x - x0) / (x1 - x0)) * this._plotW();
    const py = (y) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * this._plotH();

    // Grid + ticks
    ctx.font = FONT;
    ctx.strokeStyle = GRID_COLOR;
    ctx.fillStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    for (const t of niceTicks(yMin, yMax, 5)) {
      const y = py(t);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtTick(t), PAD.left - 5, y);
    }
    for (const t of niceTicks(x0, x1, 6)) {
      const x = px(t);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(fmtTick(t), x, h - PAD.bottom + 5);
    }

    // Decimate to ~2 points per pixel for large datasets.
    const maxPoints = this._plotW() * 2;
    const step = Math.max(1, Math.floor(visible.length / maxPoints));
    const rows = step === 1 ? visible : visible.filter((_, i) => i % step === 0);

    // Percentile band
    if (this.band) {
      const { lowKey, highKey, color } = this.band;
      ctx.beginPath();
      let started = false;
      for (const r of rows) {
        if (r[lowKey] === undefined) continue;
        const x = px(r.x);
        if (!started) {
          ctx.moveTo(x, py(r[highKey]));
          started = true;
        } else ctx.lineTo(x, py(r[highKey]));
      }
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r[lowKey] === undefined) continue;
        ctx.lineTo(px(r.x), py(r[lowKey]));
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Series
    for (const s of this.series) {
      ctx.beginPath();
      let started = false;
      for (const r of rows) {
        const v = r[s.key];
        if (v === undefined || !Number.isFinite(v)) continue;
        const x = px(r.x);
        const y = py(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 1.5;
      ctx.stroke();
    }

    // Legend
    let lx = PAD.left;
    ctx.textBaseline = 'middle';
    for (const s of this.series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 8, 10, 3);
      ctx.fillStyle = AXIS_COLOR;
      ctx.textAlign = 'left';
      ctx.fillText(s.label, lx + 14, 10);
      lx += 14 + ctx.measureText(s.label).width + 14;
    }

    // Hover tooltip
    if (this._hover !== null && this._hover > PAD.left && this._hover < w - PAD.right && visible.length > 0) {
      const dataX = x0 + ((this._hover - PAD.left) / this._plotW()) * (x1 - x0);
      let nearest = visible[0];
      for (const r of visible) if (Math.abs(r.x - dataX) < Math.abs(nearest.x - dataX)) nearest = r;
      const hx = px(nearest.x);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(hx, PAD.top);
      ctx.lineTo(hx, h - PAD.bottom);
      ctx.stroke();
      const lines = [`x: ${fmtTick(nearest.x)}`, ...this.series.filter((s) => nearest[s.key] !== undefined).map((s) => `${s.label}: ${fmtTick(nearest[s.key])}`)];
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
      const bh = lines.length * 13 + 8;
      const bx = Math.min(hx + 8, w - PAD.right - bw);
      const by = PAD.top + 4;
      ctx.fillStyle = 'rgba(19,26,42,0.94)';
      ctx.strokeStyle = '#2a3550';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? AXIS_COLOR : this.series[i - 1]?.color ?? '#fff';
        ctx.fillText(l, bx + 7, by + 12 + i * 13);
      });
    }
  }
}

/** Simple bar histogram. */
export class Histogram {
  constructor(canvas, { color = '#00e5ff', xLabel = '', yLabel = '' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = color;
    this.xLabel = xLabel;
    this.bins = [];
    this.binLabels = [];
    this._size = { w: 0, h: 0 };
  }

  setData(values, binCount = 12) {
    this.bins = [];
    this.binLabels = [];
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const n = Math.min(binCount, Math.max(4, values.length));
    this.bins = new Array(n).fill(0);
    for (const v of values) {
      const b = Math.min(n - 1, Math.floor(((v - min) / span) * n));
      this.bins[b]++;
    }
    for (let i = 0; i < n; i++) this.binLabels.push(Math.round(min + (i + 0.5) * (span / n)));
  }

  resize() {
    this._size = setupDpr(this.canvas, this.ctx);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    if (!this._size.w) this._size = setupDpr(this.canvas, ctx);
    const { w, h } = this._size;
    ctx.clearRect(0, 0, w, h);
    if (this.bins.length === 0) return;
    const maxBin = Math.max(...this.bins, 1);
    const plotH = h - 26;
    const bw = (w - 20) / this.bins.length;
    ctx.font = FONT;
    for (let i = 0; i < this.bins.length; i++) {
      const bh = (this.bins[i] / maxBin) * (plotH - 8);
      const x = 10 + i * bw;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x + 1, plotH - bh, bw - 2, bh);
      ctx.globalAlpha = 1;
      if (this.bins.length <= 16 || i % 2 === 0) {
        ctx.fillStyle = AXIS_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText(String(this.binLabels[i]), x + bw / 2, h - 8);
      }
    }
  }
}

/** 10×20 heatmap of piece landing positions. */
export class BoardHeatmap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.counts = null; // 200 entries, row 0 = top visible row
    this._size = { w: 0, h: 0 };
  }

  setData(counts) {
    this.counts = counts;
  }

  resize() {
    this._size = setupDpr(this.canvas, this.ctx);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    if (!this._size.w) this._size = setupDpr(this.canvas, ctx);
    const { w, h } = this._size;
    ctx.clearRect(0, 0, w, h);
    const cell = Math.floor(Math.min(w / 10, h / 20));
    const ox = (w - cell * 10) / 2;
    const oy = (h - cell * 20) / 2;
    ctx.fillStyle = '#0b0f1c';
    ctx.fillRect(ox, oy, cell * 10, cell * 20);
    if (this.counts) {
      let max = 0;
      for (let i = 0; i < 200; i++) if (this.counts[i] > max) max = this.counts[i];
      if (max > 0) {
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 10; x++) {
            const v = this.counts[y * 10 + x] / max;
            if (v <= 0) continue;
            // Cold (transparent cyan) → hot (magenta).
            const r = Math.round(v * 255);
            const g = Math.round(46 + (1 - v) * 120);
            const b = Math.round(151 + (1 - v) * 100);
            ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + v * 0.8})`;
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
          }
        }
      }
    }
    ctx.strokeStyle = '#2a3550';
    ctx.strokeRect(ox - 0.5, oy - 0.5, cell * 10 + 1, cell * 20 + 1);
  }
}
