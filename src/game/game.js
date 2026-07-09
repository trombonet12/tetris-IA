import { Board } from './board.js';
import { SevenBag } from './bag.js';
import { PIECES, EXTENTS, SPAWN_X, SPAWN_Y } from './pieces.js';
import { tryRotate } from './srs.js';
import {
  scoreEvent,
  gravitySecondsPerRow,
  SOFT_DROP_POINTS,
  HARD_DROP_POINTS,
} from './scoring.js';
import { mulberry32, deriveSeed, rngInt } from '../core/rng.js';
import { EventEmitter } from '../core/event-emitter.js';
import { GAME_DEFAULTS } from '../core/config.js';
import {
  PIECE,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  HIDDEN_ROWS,
  GHOST_OFFSET,
  ROTATION_CW,
  ROTATION_CCW,
  ROTATION_180,
} from './constants.js';

function createStats(startLevel) {
  return {
    score: 0,
    lines: 0,
    level: startLevel,
    pieces: 0,
    timeMs: 0,
    combo: -1,
    maxCombo: 0,
    b2b: 0,
    maxB2b: 0,
    tetrises: 0,
    tspins: 0, // full T-spins with lines
    tspinMinis: 0,
    tspinZero: 0, // T-spins without line clear
    allClears: 0,
    zenResets: 0,
    garbageLinesCleared: 0,
    pieceCounts: new Uint16Array(8), // by piece id, counted on lock
    breakdown: {
      clearPoints: 0,
      tspinPoints: 0,
      comboPoints: 0,
      b2bBonus: 0,
      allClearPoints: 0,
      dropPoints: 0,
    },
  };
}

/**
 * Headless Tetris engine (modern guideline): SRS + kicks, 7-bag, hold, ghost,
 * lock delay with move-reset, T-spins, combos, back-to-back, all clears.
 *
 * The engine only exposes atomic actions (DAS/ARR/SDF handling lives in the
 * input controller) so AI, tests and the human UI drive the exact same rules.
 * Everything is deterministic given the seed.
 */
export class Game {
  constructor({ seed = 1, config = {} } = {}) {
    this.config = { ...GAME_DEFAULTS, ...config };
    this.events = new EventEmitter();
    this.board = new Board();
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(deriveSeed(this.seed, 0x7e7215));
    this.garbageRng = mulberry32(deriveSeed(this.seed, 0x6a5ba6e));
    this.board.reset();
    this.bag = new SevenBag(this.rng);
    this.holdType = PIECE.NONE;
    this.canHold = true;
    this.state = 'playing'; // 'playing' | 'over'
    this.overReason = null; // 'blockout' | 'lockout' | 'topout'
    this.stats = createStats(this.config.startLevel);
    this.current = null;
    this._softDrop = false;
    this._gravityAcc = 0;
    this._groundedMs = 0;
    this._lockResets = 0;
    this._lowestY = -1;
    this._lastAction = 'none'; // 'move' | 'rotate' | 'gravity' | 'drop' | 'none'
    this._lastKickIndex = 0;
    this._spawn(this.bag.next());
    return this;
  }

  // ── Queries ────────────────────────────────────────────────────────────

  get nextQueue() {
    return this.bag.peek(this.config.previewCount);
  }

  /** y where the current piece would land (for ghost rendering). */
  ghostY() {
    const c = this.current;
    if (!c) return -1;
    return this.board.dropY(PIECES[c.type][c.rot], c.x, c.y);
  }

  /**
   * Bakes the visible field into `out` (Uint8Array of 200):
   * 0 empty, 1..7 piece, 8 garbage, 9..15 ghost (type + GHOST_OFFSET).
   */
  getSnapshot(out) {
    const w = BOARD_WIDTH;
    const grid = this.board.grid;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      const src = (y + HIDDEN_ROWS) * w;
      for (let x = 0; x < w; x++) out[y * w + x] = grid[src + x];
    }
    const c = this.current;
    if (c && this.state === 'playing') {
      const cells = PIECES[c.type][c.rot];
      if (this.config.ghostEnabled) {
        const gy = this.board.dropY(cells, c.x, c.y);
        for (let i = 0; i < 4; i++) {
          const x = c.x + cells[i][0];
          const y = gy + cells[i][1] - HIDDEN_ROWS;
          if (y >= 0 && y < BOARD_HEIGHT && out[y * w + x] === 0) {
            out[y * w + x] = c.type + GHOST_OFFSET;
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const x = c.x + cells[i][0];
        const y = c.y + cells[i][1] - HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_HEIGHT) out[y * w + x] = c.type;
      }
    }
    return out;
  }

  // ── Player actions (atomic) ────────────────────────────────────────────

  moveLeft() {
    return this._shift(-1);
  }

  moveRight() {
    return this._shift(1);
  }

  _shift(dx) {
    const c = this.current;
    if (!c || this.state !== 'playing') return false;
    const cells = PIECES[c.type][c.rot];
    if (this.board.collides(cells, c.x + dx, c.y)) return false;
    c.x += dx;
    this._afterManeuver('move');
    this.events.emit('move', { dx });
    return true;
  }

  rotateCW() {
    return this._rotate(ROTATION_CW);
  }

  rotateCCW() {
    return this._rotate(ROTATION_CCW);
  }

  rotate180() {
    return this._rotate(ROTATION_180);
  }

  _rotate(dir) {
    const c = this.current;
    if (!c || this.state !== 'playing') return false;
    const res = tryRotate(this.board, c.type, c.rot, c.x, c.y, dir);
    if (!res) return false;
    c.rot = res.rot;
    c.x = res.x;
    c.y = res.y;
    this._lastKickIndex = res.kickIndex;
    this._afterManeuver('rotate');
    this.events.emit('rotate', { dir, kickIndex: res.kickIndex });
    return true;
  }

  _afterManeuver(kind) {
    this._lastAction = kind;
    const c = this.current;
    if (c.y > this._lowestY) {
      // Reached a new lowest row (e.g. via a downward kick): resets replenish.
      this._lowestY = c.y;
      this._lockResets = 0;
    }
    if (this._isGrounded() && this._lockResets < this.config.maxLockResets) {
      this._groundedMs = 0;
      this._lockResets++;
    }
  }

  setSoftDrop(active) {
    this._softDrop = !!active;
  }

  hardDrop() {
    const c = this.current;
    if (!c || this.state !== 'playing') return false;
    const cells = PIECES[c.type][c.rot];
    const targetY = this.board.dropY(cells, c.x, c.y);
    const distance = targetY - c.y;
    if (distance > 0) {
      c.y = targetY;
      this.stats.score += distance * HARD_DROP_POINTS;
      this.stats.breakdown.dropPoints += distance * HARD_DROP_POINTS;
      this._lastAction = 'drop'; // moving down forfeits T-spin credit
    }
    this.events.emit('harddrop', { distance });
    this._lockNow();
    return true;
  }

  hold() {
    if (!this.config.holdEnabled || !this.canHold || this.state !== 'playing') return false;
    const swapped = this.holdType;
    this.holdType = this.current.type;
    if (swapped !== PIECE.NONE) this._spawn(swapped);
    else this._spawn(this.bag.next());
    this.canHold = false;
    this.events.emit('hold', { held: this.holdType, got: this.current?.type });
    return true;
  }

  // ── Simulation ─────────────────────────────────────────────────────────

  /** Advances the game clock. Call with fixed timesteps for determinism. */
  step(dtMs) {
    if (this.state !== 'playing' || !this.current) return;
    this.stats.timeMs += dtMs;

    if (this._isGrounded()) {
      this._gravityAcc = 0;
      this._groundedMs += dtMs;
      if (this._groundedMs >= this.config.lockDelayMs) this._lockNow();
      return;
    }

    this._groundedMs = 0;
    const secondsPerRow = gravitySecondsPerRow(this.stats.level);
    let rowsPerMs = 1 / (secondsPerRow * 1000);
    if (this._softDrop) rowsPerMs *= this.config.softDropFactor;
    this._gravityAcc += dtMs * rowsPerMs;

    let steps = Math.floor(this._gravityAcc);
    this._gravityAcc -= steps;
    const c = this.current;
    while (steps-- > 0) {
      const cells = PIECES[c.type][c.rot];
      if (this.board.collides(cells, c.x, c.y + 1)) break;
      c.y++;
      this._lastAction = 'gravity';
      if (this._softDrop) {
        this.stats.score += SOFT_DROP_POINTS;
        this.stats.breakdown.dropPoints += SOFT_DROP_POINTS;
      }
      if (c.y > this._lowestY) {
        this._lowestY = c.y;
        this._lockResets = 0;
      }
    }
  }

  _isGrounded() {
    const c = this.current;
    if (!c) return false;
    return this.board.collides(PIECES[c.type][c.rot], c.x, c.y + 1);
  }

  // ── AI fast path ───────────────────────────────────────────────────────

  /**
   * Executes a placement instantly: optional hold, then a pure vertical drop
   * of the piece at (rotation, x), locking and scoring in one shot. This is
   * the training hot path (no frame-by-frame simulation).
   * @returns {{linesCleared:number, gameOver:boolean, invalid?:boolean}}
   */
  applyPlacement({ useHold = false, rotation = 0, x = 0 }) {
    if (this.state !== 'playing') return { linesCleared: 0, gameOver: true };
    if (useHold) {
      this.hold();
      if (this.state !== 'playing') return { linesCleared: 0, gameOver: true };
    }
    const c = this.current;
    const ext = EXTENTS[c.type][rotation];
    if (x + ext.minX < 0 || x + ext.maxX >= BOARD_WIDTH) {
      return { linesCleared: 0, gameOver: false, invalid: true };
    }
    c.rot = rotation;
    c.x = x;
    c.y = -4; // fully above the board (always collision-free)
    const cells = PIECES[c.type][c.rot];
    c.y = this.board.dropY(cells, c.x, c.y);
    this._lastAction = 'drop';
    const linesBefore = this.stats.lines;
    this._lockNow();
    return {
      linesCleared: this.stats.lines - linesBefore,
      gameOver: this.state === 'over',
    };
  }

  /** Inserts garbage rows with one random hole each (cheese/dig mode). */
  addGarbage(count) {
    const holes = [];
    for (let i = 0; i < count; i++) holes.push(rngInt(this.garbageRng, 0, BOARD_WIDTH - 1));
    this.board.insertGarbage(count, holes);
    if (this.board.isTopOut()) this._gameOver('topout');
  }

  // ── Internals ──────────────────────────────────────────────────────────

  _spawn(type) {
    const cells = PIECES[type][0];
    let y = SPAWN_Y;
    if (this.board.collides(cells, SPAWN_X, y)) {
      y = SPAWN_Y - 1; // guideline nudge: try one row up before dying
      if (this.board.collides(cells, SPAWN_X, y)) {
        this.current = { type, rot: 0, x: SPAWN_X, y: SPAWN_Y };
        this._gameOver('blockout');
        return;
      }
    }
    this.current = { type, rot: 0, x: SPAWN_X, y };
    this.canHold = true;
    this._gravityAcc = 0;
    this._groundedMs = 0;
    this._lockResets = 0;
    this._lowestY = y;
    this._lastAction = 'none';
    this._lastKickIndex = 0;
    this.events.emit('spawn', { type });
  }

  _lockNow() {
    const c = this.current;
    const cells = PIECES[c.type][c.rot];

    // T-spin detection must happen before clearing lines.
    let tspin = 'none';
    if (c.type === PIECE.T && this._lastAction === 'rotate') {
      tspin = this._detectTspin(c);
    }

    const garbageBefore = this.board.countGarbageRows();
    this.board.lock(cells, c.x, c.y, c.type);

    let anyAboveBoard = false;
    let allInHidden = true;
    for (let i = 0; i < 4; i++) {
      const y = c.y + cells[i][1];
      if (y < 0) anyAboveBoard = true;
      if (y >= HIDDEN_ROWS) allInHidden = false;
    }

    const clearedRows = this.board.clearLines();
    const lines = clearedRows.length;

    const st = this.stats;
    st.pieces++;
    st.pieceCounts[c.type]++;

    if (lines > 0) {
      st.combo++;
      if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    } else {
      st.combo = -1;
    }

    const b2bActive = st.b2b >= 1;
    const allClear = lines > 0 && this.board.isEmpty();
    const result = scoreEvent({
      lines,
      tspin,
      combo: st.combo,
      b2bActive,
      level: st.level,
      allClear,
    });
    st.score += result.points;
    st.lines += lines;

    // Score breakdown for the end-of-game summary.
    if (tspin !== 'none') st.breakdown.tspinPoints += result.basePoints;
    else st.breakdown.clearPoints += result.basePoints;
    st.breakdown.b2bBonus += result.b2bBonus;
    st.breakdown.comboPoints += result.comboPoints;
    st.breakdown.allClearPoints += result.allClearPoints;

    if (lines === 4) st.tetrises++;
    if (tspin === 'full') {
      if (lines > 0) st.tspins++;
      else st.tspinZero++;
    } else if (tspin === 'mini') {
      if (lines > 0) st.tspinMinis++;
      else st.tspinZero++;
    }
    if (allClear) st.allClears++;

    if (lines > 0) {
      st.b2b = result.difficult ? st.b2b + 1 : 0;
      if (st.b2b > st.maxB2b) st.maxB2b = st.b2b;
      const garbageAfter = this.board.countGarbageRows();
      st.garbageLinesCleared += Math.max(0, garbageBefore - garbageAfter);
    }

    const newLevel = Math.min(
      this.config.maxLevel,
      this.config.startLevel + Math.floor(st.lines / this.config.levelUpLines),
    );
    if (newLevel > st.level) {
      st.level = newLevel;
      this.events.emit('levelup', { level: newLevel });
    }

    this.events.emit('lock', { type: c.type, x: c.x, y: c.y, rot: c.rot, tspin });
    if (lines > 0 || tspin !== 'none') {
      this.events.emit('clear', {
        lines,
        rows: clearedRows,
        tspin,
        points: result.points,
        combo: st.combo,
        b2b: st.b2b,
        b2bApplied: result.b2bApplied,
        allClear,
      });
    }

    if (anyAboveBoard) {
      this._gameOver('topout');
      return;
    }
    if (allInHidden) {
      this._gameOver('lockout');
      return;
    }
    this._spawn(this.bag.next());
  }

  _detectTspin(c) {
    // 3-corner rule on the T's 3x3 bounding box. Out-of-bounds counts as filled.
    const occupied = (x, y) => {
      if (x < 0 || x >= BOARD_WIDTH || y >= this.board.totalRows) return true;
      if (y < 0) return false;
      return this.board.get(x, y) !== 0;
    };
    const tl = occupied(c.x, c.y);
    const tr = occupied(c.x + 2, c.y);
    const bl = occupied(c.x, c.y + 2);
    const br = occupied(c.x + 2, c.y + 2);
    // Front corners = the two next to the T's nose, per rotation.
    let front;
    let back;
    switch (c.rot) {
      case 0:
        front = [tl, tr];
        back = [bl, br];
        break;
      case 1:
        front = [tr, br];
        back = [tl, bl];
        break;
      case 2:
        front = [bl, br];
        back = [tl, tr];
        break;
      default:
        front = [tl, bl];
        back = [tr, br];
        break;
    }
    const frontCount = front.filter(Boolean).length;
    const backCount = back.filter(Boolean).length;
    if (frontCount + backCount < 3) return 'none';
    if (frontCount === 2) return 'full';
    // 1 front + 2 back: mini, unless the last kick was the far kick (index 4).
    return this._lastKickIndex === 4 ? 'full' : 'mini';
  }

  _gameOver(reason) {
    if (this.config.zen) {
      this.board.reset();
      this.stats.zenResets++;
      this.events.emit('zenreset', { reason });
      if (reason === 'blockout') this._spawn(this.current.type);
      else this._spawn(this.bag.next());
      return;
    }
    this.state = 'over';
    this.overReason = reason;
    this.events.emit('over', { reason, stats: this.stats });
  }
}
