import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { mulberry32, rngInt } from '../src/core/rng.js';
import { SPAWN_X, SPAWN_Y, EXTENTS } from '../src/game/pieces.js';
import { GAME_DEFAULTS } from '../src/core/config.js';
import { PIECE, UNIQUE_ROTATIONS, BOARD_WIDTH, GHOST_OFFSET } from '../src/game/constants.js';

/** Soft-drops the current piece until it rests on the stack (no lock yet). */
function groundCurrent(g) {
  g.setSoftDrop(true);
  for (let i = 0; i < 300 && g.current.y < g.ghostY(); i++) g.step(50);
  g.setSoftDrop(false);
  assert.equal(g.current.y, g.ghostY(), 'helper failed to ground the piece');
}

/** Fills rows 20..23 in columns 0..8 (a tetris well in column 9). */
function buildTetrisWell(g) {
  for (let y = 20; y <= 23; y++) {
    for (let x = 0; x <= 8; x++) g.board.set(x, y, 1);
  }
}

/** Fills columns 0..8 of every visible row (tall stack, no clearable rows). */
function fillAlmostFullStack(g) {
  for (let y = 4; y < g.board.totalRows; y++) {
    for (let x = 0; x <= 8; x++) g.board.set(x, y, 1);
  }
}

// ── Spawn ─────────────────────────────────────────────────────────────────

test('pieces spawn at SPAWN_X/SPAWN_Y with rot 0, deterministically from the bag', () => {
  const g = new Game({ seed: 1 });
  assert.equal(g.current.x, SPAWN_X);
  assert.equal(g.current.y, SPAWN_Y);
  assert.equal(g.current.rot, 0);
  assert.ok(g.current.type >= 1 && g.current.type <= 7);

  // Same seed spawns the same piece and preview.
  const g2 = new Game({ seed: 1 });
  assert.equal(g2.current.type, g.current.type);
  assert.deepEqual(g2.nextQueue, g.nextQueue);

  // The head of the queue becomes the next current piece.
  const expectedNext = g.nextQueue[0];
  const spawns = [];
  g.events.on('spawn', (e) => spawns.push(e.type));
  g.hardDrop();
  assert.equal(g.current.type, expectedNext);
  assert.equal(g.current.x, SPAWN_X);
  assert.equal(g.current.y, SPAWN_Y);
  assert.deepEqual(spawns, [expectedNext]);
});

// ── Hold ──────────────────────────────────────────────────────────────────

test('hold: first hold stores the piece and pulls the next from the queue', () => {
  const g = new Game({ seed: 2 });
  const first = g.current.type;
  const next = g.nextQueue[0];
  let holdEvents = 0;
  g.events.on('hold', () => holdEvents++);

  assert.equal(g.holdType, PIECE.NONE);
  assert.equal(g.canHold, true);
  assert.equal(g.hold(), true);
  assert.equal(g.holdType, first);
  assert.equal(g.current.type, next, 'first hold must spawn the next queue piece');
  assert.equal(holdEvents, 1);
});

test('hold: only once per piece; canHold restores on the next spawn; swap works', () => {
  const g = new Game({ seed: 2 });
  const first = g.current.type;
  g.hold();
  assert.equal(g.canHold, false);
  assert.equal(g.hold(), false, 'second hold on the same piece must be rejected');

  g.hardDrop(); // lock, spawn next
  assert.equal(g.canHold, true, 'canHold restores after the next spawn');

  // Second hold now swaps with the stored piece.
  const beforeSwap = g.current.type;
  assert.equal(g.hold(), true);
  assert.equal(g.holdType, beforeSwap);
  assert.equal(g.current.type, first, 'swap must bring back the held piece');
});

test('hold: disabled via config', () => {
  const g = new Game({ seed: 2, config: { holdEnabled: false } });
  assert.equal(g.hold(), false);
  assert.equal(g.holdType, PIECE.NONE);
});

// ── Drops ─────────────────────────────────────────────────────────────────

test('hardDrop scores 2 points per cell and locks the piece', () => {
  const g = new Game({ seed: 3 });
  const distance = g.ghostY() - g.current.y;
  assert.ok(distance > 0);
  let dropEvent = null;
  let lockEvents = 0;
  g.events.on('harddrop', (e) => (dropEvent = e));
  g.events.on('lock', () => lockEvents++);

  g.hardDrop();
  assert.equal(g.stats.score, distance * 2);
  assert.equal(g.stats.breakdown.dropPoints, distance * 2);
  assert.equal(g.stats.pieces, 1, 'hardDrop must lock');
  assert.equal(lockEvents, 1);
  assert.deepEqual(dropEvent, { distance });
});

test('soft drop scores 1 point per cell descended', () => {
  const g = new Game({ seed: 3 });
  const y0 = g.current.y;
  g.setSoftDrop(true);
  // Level 1 gravity = 1 row/s; SDF 20 → one row per 50 ms.
  g.step(50);
  assert.equal(g.current.y, y0 + 1);
  assert.equal(g.stats.score, 1);
  g.step(50);
  g.step(50);
  assert.equal(g.current.y, y0 + 3);
  assert.equal(g.stats.score, 3);
  assert.equal(g.stats.pieces, 0, 'soft drop must not lock by itself');
  assert.equal(g.stats.breakdown.dropPoints, 3);
});

test('gravity without soft drop: one row per second at level 1', () => {
  const g = new Game({ seed: 3 });
  const y0 = g.current.y;
  g.step(999);
  assert.equal(g.current.y, y0, 'no full row accumulated yet');
  g.step(2);
  assert.equal(g.current.y, y0 + 1);
  assert.equal(g.stats.score, 0, 'plain gravity scores nothing');
});

// ── Lock delay ────────────────────────────────────────────────────────────

test('lock delay: a grounded piece locks after 500 ms of step time', () => {
  const g = new Game({ seed: 4 });
  const nextType = g.nextQueue[0];
  groundCurrent(g);

  g.step(499);
  assert.equal(g.stats.pieces, 0, 'must not lock before lockDelayMs');
  g.step(1);
  assert.equal(g.stats.pieces, 1, 'must lock at exactly 500 ms grounded');
  assert.equal(g.current.type, nextType, 'a new piece spawns after the lock');
});

test('move-reset: moving before 500 ms resets the lock timer', () => {
  const g = new Game({ seed: 4 });
  groundCurrent(g);

  g.step(400);
  assert.equal(g.stats.pieces, 0);
  const moved = g.current.x > 0 ? g.moveLeft() : g.moveRight();
  assert.equal(moved, true, 'setup: the move must succeed');
  g.step(400);
  assert.equal(g.stats.pieces, 0, '400+400 ms with a move in between must NOT lock');

  g.step(200); // 400 + 200 = 600 ms grounded since the move
  assert.equal(g.stats.pieces, 1, 'locks once the timer runs out with no more resets');
});

test('move-reset: after maxLockResets (15) the piece locks anyway', () => {
  const g = new Game({ seed: 4 });
  groundCurrent(g);

  let locked = false;
  let dir = -1;
  for (let i = 0; i < 40; i++) {
    g.step(300);
    if (g.stats.pieces > 0) {
      locked = true;
      break;
    }
    // Keep wiggling: each successful move consumes one lock reset.
    if (dir < 0) g.moveLeft();
    else g.moveRight();
    dir = -dir;
  }
  assert.equal(locked, true, 'continuous movement must not stall the lock forever');
});

// ── T-spins and back-to-back ──────────────────────────────────────────────

test('T-spin double: rotation into a slot scores 1200 and counts stats.tspins', () => {
  const g = new Game({ seed: 9 });
  const b = g.board;
  // Classic TSD slot: bottom row with a hole at x=5, row above open at 4..6,
  // overhang at (4,21) to satisfy the 3-corner rule.
  for (let x = 0; x < 10; x++) if (x !== 5) b.set(x, 23, 1);
  for (let x = 0; x < 10; x++) if (x < 4 || x > 6) b.set(x, 22, 1);
  b.set(4, 21, 1);

  // Place the T (rot 1, nose right) beside the slot and rotate CW into it.
  g.current = { type: PIECE.T, rot: 1, x: 4, y: 21 };
  assert.equal(g.rotateCW(), true, 'rotation into the slot must succeed');
  assert.deepEqual({ rot: g.current.rot, x: g.current.x, y: g.current.y }, { rot: 2, x: 4, y: 21 });

  let clearEvent = null;
  g.events.on('clear', (e) => (clearEvent = e));
  const scoreBefore = g.stats.score;
  g.hardDrop(); // distance 0 → last action remains 'rotate'

  assert.equal(g.stats.score - scoreBefore, 1200, 'TSD = 1200 at level 1');
  assert.equal(g.stats.tspins, 1);
  assert.equal(g.stats.lines, 2);
  assert.equal(g.stats.b2b, 1, 'a T-spin clear starts a b2b streak');
  assert.ok(clearEvent);
  assert.equal(clearEvent.tspin, 'full');
  assert.equal(clearEvent.lines, 2);
  assert.equal(g.stats.breakdown.tspinPoints, 1200);
});

test('tetris integration: stats.tetrises and back-to-back bonus', () => {
  const g = new Game({ seed: 11 });
  g.board.set(0, 19, 1); // stray marker so clears are never all-clears

  // Round 1: tetris.
  buildTetrisWell(g);
  g.current.type = PIECE.I;
  let res = g.applyPlacement({ rotation: 1, x: 7 }); // vertical I in column 9
  assert.equal(res.linesCleared, 4);
  assert.equal(g.stats.tetrises, 1);
  assert.equal(g.stats.b2b, 1);
  assert.equal(g.stats.score, 800, 'first tetris: no b2b bonus yet');
  assert.equal(g.stats.allClears, 0);

  // Round 2: back-to-back tetris.
  g.board.set(0, 19, 1);
  buildTetrisWell(g);
  g.current.type = PIECE.I;
  res = g.applyPlacement({ rotation: 1, x: 7 });
  assert.equal(res.linesCleared, 4);
  assert.equal(g.stats.tetrises, 2);
  assert.equal(g.stats.b2b, 2);
  assert.equal(g.stats.maxB2b, 2);
  // 800 base + 400 b2b bonus + 50 combo (combo=1, level 1).
  assert.equal(g.stats.score, 800 + 1250);
  assert.equal(g.stats.breakdown.b2bBonus, 400);
  assert.equal(g.stats.breakdown.comboPoints, 50);
  assert.equal(g.stats.lines, 8);
});

// ── applyPlacement ────────────────────────────────────────────────────────

test('applyPlacement: basic placement locks one piece', () => {
  const g = new Game({ seed: 12 });
  const res = g.applyPlacement({ rotation: 0, x: 3 });
  assert.deepEqual(res, { linesCleared: 0, gameOver: false });
  assert.equal(g.stats.pieces, 1);
  assert.equal(g.state, 'playing');
});

test('applyPlacement: out-of-bounds x is rejected as invalid', () => {
  const g = new Game({ seed: 12 });
  const res = g.applyPlacement({ rotation: 0, x: 9 });
  assert.equal(res.invalid, true);
  assert.equal(g.stats.pieces, 0, 'invalid placement must not lock anything');
});

test('applyPlacement: reports linesCleared', () => {
  const g = new Game({ seed: 13 });
  buildTetrisWell(g);
  g.board.set(0, 19, 1);
  g.current.type = PIECE.I;
  const res = g.applyPlacement({ rotation: 1, x: 7 });
  assert.equal(res.linesCleared, 4);
  assert.equal(res.gameOver, false);
});

test('applyPlacement: locking entirely inside the hidden buffer is game over (lockout)', () => {
  const g = new Game({ seed: 14 });
  fillAlmostFullStack(g);
  const res = g.applyPlacement({ rotation: 0, x: 0 });
  assert.equal(res.gameOver, true);
  assert.equal(g.state, 'over');
  assert.equal(g.overReason, 'lockout');
});

// ── Golden game (regression) ──────────────────────────────────────────────

test('golden game: seed 555 + mulberry32(42) placement script is bit-exact', () => {
  const play = (seed) => {
    const game = new Game({ seed });
    const rng = mulberry32(42);
    while (game.state === 'playing' && game.stats.pieces < 200) {
      const type = game.current.type;
      const rotation = rngInt(rng, 0, UNIQUE_ROTATIONS[type] - 1);
      const ext = EXTENTS[type][rotation];
      const x = rngInt(rng, -ext.minX, BOARD_WIDTH - 1 - ext.maxX);
      game.applyPlacement({ useHold: false, rotation, x });
    }
    // FNV-1a over the final grid strengthens the fingerprint (score alone is 0).
    let hash = 2166136261;
    for (const v of game.board.grid) hash = Math.imul(hash ^ v, 16777619) >>> 0;
    return `${game.stats.score}|${game.stats.lines}|${game.stats.pieces}|${game.overReason}|${hash}`;
  };
  const a = play(555);
  const b = play(555);
  assert.equal(a, b, 'two runs must be identical');
  // Golden literal recorded on 2026-07-06. If the engine's rules or RNG
  // stream change intentionally, update this value.
  assert.equal(a, '0|0|21|lockout|4162653109');
});

// ── Snapshot ──────────────────────────────────────────────────────────────

test('getSnapshot: values in 0..15, active piece and ghost present', () => {
  const g = new Game({ seed: 15 });
  g.current.y = 10; // bring the piece into the visible field
  const snap = new Uint8Array(200);
  assert.equal(g.getSnapshot(snap), snap, 'returns the out array');

  let active = 0;
  let ghost = 0;
  let empty = 0;
  for (const v of snap) {
    assert.ok(v >= 0 && v <= 15, `snapshot value ${v} out of range`);
    if (v === g.current.type) active++;
    else if (v === g.current.type + GHOST_OFFSET) ghost++;
    else if (v === 0) empty++;
  }
  assert.equal(active, 4, 'active piece must occupy 4 cells');
  assert.equal(ghost, 4, 'ghost must occupy 4 cells with ghostEnabled');
  assert.equal(empty, 192);
});

test('getSnapshot: no ghost cells when ghostEnabled is false', () => {
  const g = new Game({ seed: 15, config: { ghostEnabled: false } });
  g.current.y = 10;
  const snap = g.getSnapshot(new Uint8Array(200));
  let active = 0;
  for (const v of snap) {
    assert.ok(v <= 8, `unexpected ghost value ${v}`);
    if (v === g.current.type) active++;
  }
  assert.equal(active, 4);
});

// ── Zen mode ──────────────────────────────────────────────────────────────

test('zen: never game over; the board resets instead', () => {
  const g = new Game({ seed: 16, config: { zen: true } });
  let zenResets = 0;
  g.events.on('zenreset', () => zenResets++);

  fillAlmostFullStack(g);
  const res = g.applyPlacement({ rotation: 0, x: 0 }); // would be a lockout
  assert.equal(res.gameOver, false);
  assert.equal(g.state, 'playing');
  assert.equal(g.overReason, null);
  assert.equal(g.stats.zenResets, 1);
  assert.equal(zenResets, 1);
  assert.equal(g.board.isEmpty(), true, 'board resets on zen reset');
  assert.ok(g.current, 'a new piece spawns and play continues');
});

// ── Level up ──────────────────────────────────────────────────────────────

test('level up: 10 lines raise the level and emit levelup', () => {
  const g = new Game({ seed: 17 });
  const levelups = [];
  g.events.on('levelup', (e) => levelups.push(e.level));

  for (let round = 0; round < 3; round++) {
    buildTetrisWell(g);
    g.current.type = PIECE.I;
    const res = g.applyPlacement({ rotation: 1, x: 7 });
    assert.equal(res.linesCleared, 4);
  }
  assert.equal(g.stats.lines, 12);
  assert.equal(g.stats.level, 1 + Math.floor(12 / GAME_DEFAULTS.levelUpLines));
  assert.deepEqual(levelups, [2], 'exactly one levelup event, to level 2');
});

// ── Next queue ────────────────────────────────────────────────────────────

test('nextQueue: returns previewCount piece types', () => {
  const g = new Game({ seed: 18 });
  const q = g.nextQueue;
  assert.equal(q.length, GAME_DEFAULTS.previewCount);
  for (const t of q) assert.ok(t >= 1 && t <= 7);

  const g3 = new Game({ seed: 18, config: { previewCount: 3 } });
  assert.equal(g3.nextQueue.length, 3);

  // The queue is a preview, not consumed by reading it.
  assert.deepEqual(g.nextQueue, q);
});
