import { BOARD_WIDTH, BOARD_HEIGHT, GHOST_OFFSET, GARBAGE, PIECE_NAMES } from '../game/constants.js';
import { PIECES, EXTENTS } from '../game/pieces.js';

// Piece colors per theme, indexed by cell value 1..7 (+8 garbage).
export const THEMES = {
  neon: {
    background: '#0b0f1c',
    gridLine: 'rgba(255,255,255,0.045)',
    border: '#2a3550',
    colors: ['', '#00e5ff', '#ffd500', '#b36bff', '#4ade80', '#ff4d6d', '#4f7cff', '#ff9f43', '#5b6472'],
    glow: true,
  },
  classic: {
    background: '#101010',
    gridLine: 'rgba(255,255,255,0.06)',
    border: '#3a3a3a',
    colors: ['', '#31c7ef', '#f7d308', '#ad4d9c', '#42b642', '#ef2029', '#5a65ad', '#ef7921', '#7a7a7a'],
    glow: false,
  },
  minimal: {
    background: '#111318',
    gridLine: 'rgba(255,255,255,0.05)',
    border: '#31353f',
    colors: ['', '#c8cdd8', '#aab1c0', '#8f97a8', '#c8cdd8', '#aab1c0', '#8f97a8', '#c8cdd8', '#565c68'],
    glow: false,
  },
};

const HIGH_CONTRAST_COLORS = ['', '#00ffff', '#ffff00', '#ff00ff', '#00ff00', '#ff2222', '#4488ff', '#ff8800', '#999999'];

/**
 * Draws boards (big or mini) from engine snapshots onto any 2D context.
 * Pure rendering: no game knowledge beyond the snapshot encoding.
 */
export class BoardRenderer {
  constructor({ theme = 'neon', colorblind = false, highContrast = false } = {}) {
    this.setOptions({ theme, colorblind, highContrast });
  }

  setOptions({ theme, colorblind, highContrast } = {}) {
    if (theme !== undefined) this.themeName = theme;
    if (colorblind !== undefined) this.colorblind = colorblind;
    if (highContrast !== undefined) this.highContrast = highContrast;
    this.theme = THEMES[this.themeName] ?? THEMES.neon;
  }

  _color(value) {
    const palette = this.highContrast ? HIGH_CONTRAST_COLORS : this.theme.colors;
    return palette[value] ?? '#ffffff';
  }

  /**
   * Full-detail board (play + watch modes).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Uint8Array} snapshot 200 cells (see Game.getSnapshot)
   * @param {object} opts { clearingRows: number[], clearProgress: 0..1, dim: boolean }
   */
  draw(ctx, snapshot, x, y, cellSize, opts = {}) {
    const w = BOARD_WIDTH * cellSize;
    const h = BOARD_HEIGHT * cellSize;
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(x, y, w, h);

    // Grid lines
    ctx.strokeStyle = this.theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cx = 1; cx < BOARD_WIDTH; cx++) {
      ctx.moveTo(x + cx * cellSize + 0.5, y);
      ctx.lineTo(x + cx * cellSize + 0.5, y + h);
    }
    for (let cy = 1; cy < BOARD_HEIGHT; cy++) {
      ctx.moveTo(x, y + cy * cellSize + 0.5);
      ctx.lineTo(x + w, y + cy * cellSize + 0.5);
    }
    ctx.stroke();

    const clearing = opts.clearingRows ?? null;
    const progress = opts.clearProgress ?? 0;

    for (let cy = 0; cy < BOARD_HEIGHT; cy++) {
      const isClearing = clearing?.includes(cy);
      for (let cx = 0; cx < BOARD_WIDTH; cx++) {
        const v = snapshot[cy * BOARD_WIDTH + cx];
        if (v === 0) continue;
        const px = x + cx * cellSize;
        const py = y + cy * cellSize;
        if (v > GHOST_OFFSET) {
          // Ghost cell: outline in the piece color.
          const color = this._color(v - GHOST_OFFSET);
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = color;
          ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color;
          ctx.strokeRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
          continue;
        }
        if (isClearing) {
          // Line clear flash: white → shrink.
          const shrink = (cellSize / 2) * progress;
          ctx.fillStyle = progress < 0.4 ? '#ffffff' : this._color(v);
          ctx.globalAlpha = 1 - progress * 0.9;
          ctx.fillRect(px + shrink, py + shrink, cellSize - shrink * 2, cellSize - shrink * 2);
          ctx.globalAlpha = 1;
          continue;
        }
        this._cell(ctx, px, py, cellSize, v);
        if (this.colorblind && v >= 1 && v <= 7 && cellSize >= 14) {
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.font = `bold ${Math.floor(cellSize * 0.55)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(PIECE_NAMES[v], px + cellSize / 2, py + cellSize / 2 + 1);
        }
      }
    }

    if (opts.dim) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.62)';
      ctx.fillRect(x, y, w, h);
    }

    ctx.strokeStyle = this.theme.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }

  _cell(ctx, px, py, size, value) {
    const color = this._color(value);
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    if (size >= 10 && value !== GARBAGE) {
      // Simple bevel: lighter top edge, darker bottom edge.
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(px + 1, py + 1, size - 2, Math.max(1, size * 0.14));
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(px + 1, py + size - 1 - Math.max(1, size * 0.14), size - 2, Math.max(1, size * 0.14));
    }
  }

  /** Compact board for the training grid (no grid lines, no bevel). */
  drawMini(ctx, snapshot, x, y, cellSize, opts = {}) {
    const w = BOARD_WIDTH * cellSize;
    const h = BOARD_HEIGHT * cellSize;
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(x, y, w, h);
    for (let cy = 0; cy < BOARD_HEIGHT; cy++) {
      for (let cx = 0; cx < BOARD_WIDTH; cx++) {
        const v = snapshot[cy * BOARD_WIDTH + cx];
        if (v === 0 || v > GHOST_OFFSET) continue; // skip ghosts at mini scale
        ctx.fillStyle = this._color(v);
        ctx.fillRect(x + cx * cellSize, y + cy * cellSize, cellSize, cellSize);
      }
    }
    if (opts.dim) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.66)';
      ctx.fillRect(x, y, w, h);
    }
  }

  /** Centered piece preview (hold / next panels). */
  drawPreview(ctx, type, centerX, centerY, cellSize, { dim = false } = {}) {
    if (!type) return;
    const cells = PIECES[type][0];
    const ext = EXTENTS[type][0];
    const pw = (ext.maxX - ext.minX + 1) * cellSize;
    const ph = (ext.maxY - ext.minY + 1) * cellSize;
    const ox = centerX - pw / 2 - ext.minX * cellSize;
    const oy = centerY - ph / 2 - ext.minY * cellSize;
    if (dim) ctx.globalAlpha = 0.35;
    for (const [cx, cy] of cells) {
      this._cell(ctx, ox + cx * cellSize, oy + cy * cellSize, cellSize, type);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Ghost overlay of a candidate placement (watch mode top-N visualization).
   * colorOverride: CSS color for the candidate's rank.
   */
  drawPlacementGhost(ctx, type, rotation, pieceX, pieceY, boardX, boardY, cellSize, colorOverride, alpha = 0.5) {
    const cells = PIECES[type][rotation];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorOverride;
    for (const [cx, cy] of cells) {
      const vy = pieceY + cy - 4; // HIDDEN_ROWS
      if (vy < 0 || vy >= BOARD_HEIGHT) continue;
      ctx.fillRect(boardX + (pieceX + cx) * cellSize + 1, boardY + vy * cellSize + 1, cellSize - 2, cellSize - 2);
    }
    ctx.globalAlpha = 1;
  }
}
