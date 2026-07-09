import { BOARD_WIDTH, BOARD_HEIGHT, VISIBLE_CELLS } from '../game/constants.js';
import { STATS_FIELDS } from '../workers/worker-pool.js';

const HEADER_PX = 14; // per-tile header strip (id + fitness)

/**
 * Renders the whole population as a grid of mini-boards on ONE canvas.
 * Keeps the latest snapshot per agent with dirty flags so a frame only
 * repaints boards that actually changed.
 */
export class AgentGridRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./board-renderer.js').BoardRenderer} boardRenderer
   */
  constructor(canvas, boardRenderer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.boardRenderer = boardRenderer;
    this.agentCount = 0;
    this.grids = null; // Uint8Array(agentCount × 200)
    this.stats = null; // Float32Array(agentCount × STATS_FIELDS)
    this.dirty = null; // Uint8Array(agentCount)
    this.order = null; // display order: array of agent ids
    this.bestId = -1;
    this.selectedId = -1;
    this.crownId = -1; // lineage of the all-time record
    this._layout = null;
    this._allDirty = true;
  }

  setAgentCount(n) {
    this.agentCount = n;
    this.grids = new Uint8Array(n * VISIBLE_CELLS);
    this.stats = new Float32Array(n * STATS_FIELDS);
    this.dirty = new Uint8Array(n);
    this.order = Array.from({ length: n }, (_, i) => i);
    this._allDirty = true;
    this._layout = null;
  }

  /** Recomputes tile layout for the current canvas size. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._computeLayout(rect.width, rect.height);
    this._allDirty = true;
  }

  _computeLayout(cw, ch) {
    const n = Math.max(1, this.agentCount);
    // Find the column count that maximizes cell size.
    let best = { cell: 0, cols: 1 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const tileW = cw / cols;
      const tileH = ch / rows;
      const cell = Math.min((tileW - 4) / BOARD_WIDTH, (tileH - 4 - HEADER_PX) / BOARD_HEIGHT);
      if (cell > best.cell) best = { cell, cols };
    }
    const cols = best.cols;
    const rows = Math.ceil(n / cols);
    const cell = Math.max(1, Math.floor(best.cell));
    const tileW = cell * BOARD_WIDTH + 4;
    const tileH = cell * BOARD_HEIGHT + 4 + HEADER_PX;
    const offsetX = (cw - cols * tileW) / 2;
    const offsetY = (ch - rows * tileH) / 2;
    this._layout = { cols, rows, cell, tileW, tileH, offsetX, offsetY };
  }

  /** Ingest a worker frame (agentIds are global population indices). */
  updateFrame({ agentIds, grids, stats }) {
    if (!this.grids) return;
    for (let i = 0; i < agentIds.length; i++) {
      const id = agentIds[i];
      if (id >= this.agentCount) continue;
      const src = grids.subarray(i * VISIBLE_CELLS, (i + 1) * VISIBLE_CELLS);
      const dst = this.grids.subarray(id * VISIBLE_CELLS, (id + 1) * VISIBLE_CELLS);
      // Cheap change detection to keep dirty flags honest.
      let changed = false;
      for (let c = 0; c < VISIBLE_CELLS; c++) {
        if (dst[c] !== src[c]) {
          changed = true;
          break;
        }
      }
      if (changed) {
        dst.set(src);
        this.dirty[id] = 1;
      }
      const so = id * STATS_FIELDS;
      const si = i * STATS_FIELDS;
      for (let f = 0; f < STATS_FIELDS; f++) {
        if (this.stats[so + f] !== stats[si + f]) {
          this.stats[so + f] = stats[si + f];
          this.dirty[id] = 1;
        }
      }
    }
  }

  /** Reorders tiles (e.g. by live fitness). Forces a full repaint. */
  setOrder(order) {
    this.order = order;
    this._allDirty = true;
  }

  setHighlights({ bestId = -1, selectedId = -1, crownId = -1 }) {
    if (bestId !== this.bestId || selectedId !== this.selectedId || crownId !== this.crownId) {
      this.bestId = bestId;
      this.selectedId = selectedId;
      this.crownId = crownId;
      this._allDirty = true;
    }
  }

  render() {
    if (!this._layout || !this.grids) return;
    const { cols, cell, tileW, tileH, offsetX, offsetY } = this._layout;
    const ctx = this.ctx;

    if (this._allDirty) {
      const rect = this.canvas.getBoundingClientRect();
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    for (let slot = 0; slot < this.order.length; slot++) {
      const id = this.order[slot];
      if (!this._allDirty && !this.dirty[id]) continue;
      this.dirty[id] = 0;
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const tx = offsetX + col * tileW;
      const ty = offsetY + row * tileH;
      this._drawTile(ctx, id, tx, ty, cell, tileW, tileH);
    }
    this._allDirty = false;
  }

  _drawTile(ctx, id, tx, ty, cell, tileW, tileH) {
    const so = id * STATS_FIELDS;
    const alive = this.stats[so] > 0;
    const fitness = this.stats[so + 6];
    const lines = this.stats[so + 2];

    // Clear the tile area.
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(tx, ty, tileW, tileH);

    // Header: agent id + live fitness.
    ctx.font = `${Math.min(10, HEADER_PX - 3)}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = alive ? '#8a93ab' : '#4a5064';
    ctx.fillText(`#${id}`, tx + 2, ty + HEADER_PX / 2);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(fitness)}·${lines}L`, tx + tileW - 3, ty + HEADER_PX / 2);
    if (id === this.crownId) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd500';
      ctx.fillText('♛', tx + tileW / 2, ty + HEADER_PX / 2);
    }

    const snapshot = this.grids.subarray(id * VISIBLE_CELLS, (id + 1) * VISIBLE_CELLS);
    this.boardRenderer.drawMini(ctx, snapshot, tx + 2, ty + HEADER_PX + 2, cell, { dim: !alive });

    // State border: gold = generation best, cyan = selected, gray = done.
    let border = alive ? '#2a3550' : '#3a4054';
    if (id === this.bestId) border = '#ffd500';
    if (id === this.selectedId) border = '#00e5ff';
    ctx.strokeStyle = border;
    ctx.lineWidth = id === this.bestId || id === this.selectedId ? 2 : 1;
    ctx.strokeRect(tx + 1, ty + HEADER_PX + 1, cell * BOARD_WIDTH + 2, cell * BOARD_HEIGHT + 2);

    // 1px relative fitness bar under the board.
    const maxFit = Math.max(1, this._maxFitness ?? 1);
    const frac = Math.max(0, Math.min(1, fitness / maxFit));
    ctx.fillStyle = '#1d2438';
    ctx.fillRect(tx + 2, ty + tileH - 2, tileW - 4, 1.5);
    ctx.fillStyle = id === this.bestId ? '#ffd500' : '#00e5ff';
    ctx.fillRect(tx + 2, ty + tileH - 2, (tileW - 4) * frac, 1.5);
  }

  /** Update the normalization max for the per-tile fitness bars. */
  setMaxFitness(v) {
    this._maxFitness = v;
  }

  /** Returns the agent id under canvas-relative CSS pixel coordinates. */
  hitTest(px, py) {
    if (!this._layout) return null;
    const { cols, rows, tileW, tileH, offsetX, offsetY } = this._layout;
    const col = Math.floor((px - offsetX) / tileW);
    const row = Math.floor((py - offsetY) / tileH);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    const slot = row * cols + col;
    return slot < this.order.length ? this.order[slot] : null;
  }

  /** Marks every tile dirty (e.g. after theme change). */
  invalidate() {
    this._allDirty = true;
  }
}
