import { BOARD_WIDTH, BOARD_HEIGHT, HIDDEN_ROWS, TOTAL_ROWS, GARBAGE } from './constants.js';

/**
 * Headless board. Row 0 is the top hidden row; y grows downward.
 * Cells hold 0 (empty), 1..7 (piece color) or 8 (garbage).
 */
export class Board {
  constructor(width = BOARD_WIDTH, height = BOARD_HEIGHT, hidden = HIDDEN_ROWS) {
    this.width = width;
    this.height = height;
    this.hidden = hidden;
    this.totalRows = height + hidden;
    this.grid = new Uint8Array(width * this.totalRows);
  }

  get(x, y) {
    return this.grid[y * this.width + x];
  }

  set(x, y, v) {
    this.grid[y * this.width + x] = v;
  }

  /**
   * True if the piece (cell offsets + origin) overlaps walls, floor or stack.
   * Cells above the board (y < 0) are considered free.
   */
  collides(cells, px, py) {
    for (let i = 0; i < 4; i++) {
      const x = px + cells[i][0];
      const y = py + cells[i][1];
      if (x < 0 || x >= this.width || y >= this.totalRows) return true;
      if (y >= 0 && this.grid[y * this.width + x] !== 0) return true;
    }
    return false;
  }

  /** Lowest y (piece origin) the piece can fall to from (px, py). */
  dropY(cells, px, py) {
    let y = py;
    while (!this.collides(cells, px, y + 1)) y++;
    return y;
  }

  /** Writes the piece into the grid. */
  lock(cells, px, py, value) {
    for (let i = 0; i < 4; i++) {
      const x = px + cells[i][0];
      const y = py + cells[i][1];
      if (y >= 0) this.grid[y * this.width + x] = value;
    }
  }

  /** Removes full rows, compacting downward. Returns cleared row indices (ascending). */
  clearLines() {
    const cleared = [];
    const w = this.width;
    for (let y = 0; y < this.totalRows; y++) {
      let full = true;
      for (let x = 0; x < w; x++) {
        if (this.grid[y * w + x] === 0) {
          full = false;
          break;
        }
      }
      if (full) cleared.push(y);
    }
    if (cleared.length === 0) return cleared;
    // Compact: walk from bottom, skipping cleared rows.
    let write = this.totalRows - 1;
    for (let read = this.totalRows - 1; read >= 0; read--) {
      if (cleared.includes(read)) continue;
      if (write !== read) {
        this.grid.copyWithin(write * w, read * w, read * w + w);
      }
      write--;
    }
    while (write >= 0) {
      this.grid.fill(0, write * w, write * w + w);
      write--;
    }
    return cleared;
  }

  /**
   * Column heights measured from the floor (0 = empty column), counting
   * hidden rows too. Writes into `out` (Uint8Array of width) and returns it.
   */
  getColumnHeights(out) {
    const w = this.width;
    for (let x = 0; x < w; x++) {
      let h = 0;
      for (let y = 0; y < this.totalRows; y++) {
        if (this.grid[y * w + x] !== 0) {
          h = this.totalRows - y;
          break;
        }
      }
      out[x] = h;
    }
    return out;
  }

  /** True if any cell in the hidden buffer is occupied (stack reached the top). */
  isTopOut() {
    const limit = this.hidden * this.width;
    for (let i = 0; i < limit; i++) {
      if (this.grid[i] !== 0) return true;
    }
    return false;
  }

  /** True if the whole board is empty (perfect clear detection). */
  isEmpty() {
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] !== 0) return false;
    }
    return true;
  }

  /**
   * Pushes the stack up `count` rows and inserts garbage rows at the bottom,
   * each with a single hole. holeColumns: array of hole x per row.
   */
  insertGarbage(count, holeColumns) {
    const w = this.width;
    this.grid.copyWithin(0, count * w);
    for (let r = 0; r < count; r++) {
      const y = this.totalRows - count + r;
      const hole = holeColumns[r];
      for (let x = 0; x < w; x++) {
        this.grid[y * w + x] = x === hole ? 0 : GARBAGE;
      }
    }
  }

  /** Number of remaining garbage cells (cheese/dig mode progress). */
  countGarbageRows() {
    const w = this.width;
    let rows = 0;
    for (let y = 0; y < this.totalRows; y++) {
      for (let x = 0; x < w; x++) {
        if (this.grid[y * w + x] === GARBAGE) {
          rows++;
          break;
        }
      }
    }
    return rows;
  }

  reset() {
    this.grid.fill(0);
  }

  copyFrom(other) {
    this.grid.set(other.grid);
  }

  clone() {
    const b = new Board(this.width, this.height, this.hidden);
    b.grid.set(this.grid);
    return b;
  }
}
