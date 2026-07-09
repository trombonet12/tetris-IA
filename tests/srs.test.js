import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/board.js';
import { tryRotate } from '../src/game/srs.js';
import { PIECES } from '../src/game/pieces.js';
import { PIECE, ROTATION_CW, ROTATION_CCW, ROTATION_180 } from '../src/game/constants.js';

test('T against the left wall: rotation uses a wall kick (kickIndex > 0)', () => {
  const board = new Board();
  // T in rot 1 (nose pointing right) hugging the left wall: origin x = -1
  // puts its cells at absolute x 0/0/1/0, which is valid.
  assert.equal(board.collides(PIECES[PIECE.T][1], -1, 10), false, 'setup: T rot1 at x=-1 must fit');
  // Basic rotation 1>2 would need x = -1 (rot 2 has a cell at offset x=0 → absolute -1): collides.
  assert.equal(board.collides(PIECES[PIECE.T][2], -1, 10), true, 'setup: basic rotation must collide');
  const res = tryRotate(board, PIECE.T, 1, -1, 10, ROTATION_CW);
  assert.ok(res, 'rotation should succeed via kick');
  assert.equal(res.rot, 2);
  assert.ok(res.kickIndex > 0, 'must not be the basic (0,0) kick');
  // SRS 1>2 kick #1 is (+1, 0): piece shifted right off the wall.
  assert.equal(res.kickIndex, 1);
  assert.equal(res.x, 0);
  assert.equal(res.y, 10);
  // Resulting position must be collision-free.
  assert.equal(board.collides(PIECES[PIECE.T][res.rot], res.x, res.y), false);
});

test('O piece: rotation succeeds with kick (0,0) and identical cells', () => {
  const board = new Board();
  const res = tryRotate(board, PIECE.O, 0, 4, 10, ROTATION_CW);
  // The engine treats O rotation as a successful no-op shape-wise:
  // rot index changes, position does not, and the cell offsets are identical.
  assert.ok(res, 'O rotation returns a result (not null)');
  assert.equal(res.rot, 1);
  assert.equal(res.x, 4);
  assert.equal(res.y, 10);
  assert.equal(res.kickIndex, 0);
  assert.deepEqual(PIECES[PIECE.O][res.rot], PIECES[PIECE.O][0], 'O cells identical across rotations');
});

test('I piece: kick against the left wall', () => {
  const board = new Board();
  // Vertical I (rot 1, cells at offset x=2) hugging the left wall: origin x = -2.
  assert.equal(board.collides(PIECES[PIECE.I][1], -2, 5), false, 'setup: I rot1 at x=-2 must fit');
  assert.equal(board.collides(PIECES[PIECE.I][2], -2, 5), true, 'setup: basic rotation must collide');
  const res = tryRotate(board, PIECE.I, 1, -2, 5, ROTATION_CW);
  assert.ok(res, 'I rotation should succeed via kick');
  assert.equal(res.rot, 2);
  // I table 1>2: [(0,0), (-1,0), (+2,0), ...] → first two hit the wall, third works.
  assert.equal(res.kickIndex, 2);
  assert.equal(res.x, 0);
  assert.equal(res.y, 5);
  assert.equal(board.collides(PIECES[PIECE.I][res.rot], res.x, res.y), false);
});

test('impossible rotation: vertical I in a 1-wide surrounded well returns null', () => {
  const board = new Board();
  // Fill every visible cell except column 0: a 1-wide, 20-deep well.
  for (let y = 4; y < board.totalRows; y++) {
    for (let x = 1; x < 10; x++) board.set(x, y, 1);
  }
  // Vertical I inside the well (cells at absolute x=0, y=18..21).
  assert.equal(board.collides(PIECES[PIECE.I][1], -2, 18), false, 'setup: I fits in the well');
  assert.equal(tryRotate(board, PIECE.I, 1, -2, 18, ROTATION_CW), null, 'CW must fail');
  assert.equal(tryRotate(board, PIECE.I, 1, -2, 18, ROTATION_CCW), null, 'CCW must fail');
});

test('kickIndex is always in range 0..4', () => {
  const seeds = [
    // [board builder, type, rot, x, y, dir]
    [PIECE.T, 0, 3, 10, ROTATION_CW],
    [PIECE.T, 1, -1, 10, ROTATION_CW],
    [PIECE.T, 3, 7, 15, ROTATION_CCW],
    [PIECE.I, 1, -2, 5, ROTATION_CW],
    [PIECE.I, 0, 3, 19, ROTATION_CW],
    [PIECE.J, 2, 0, 12, ROTATION_CCW],
    [PIECE.L, 0, 7, 8, ROTATION_CW],
    [PIECE.S, 0, 0, 20, ROTATION_CW],
    [PIECE.Z, 1, 5, 18, ROTATION_CCW],
    [PIECE.O, 0, 4, 10, ROTATION_CW],
    [PIECE.T, 0, 3, 10, ROTATION_180],
    [PIECE.I, 1, -2, 18, ROTATION_180],
  ];
  const board = new Board();
  // Add some stack to force kicks in a few cases.
  for (let x = 0; x < 10; x++) if (x !== 4) board.set(x, 22, 1);
  for (const [type, rot, x, y, dir] of seeds) {
    const res = tryRotate(board, type, rot, x, y, dir);
    if (res) {
      assert.ok(res.kickIndex >= 0 && res.kickIndex <= 4, `kickIndex ${res.kickIndex} out of range`);
      assert.ok(res.rot >= 0 && res.rot <= 3);
    }
  }
});

test('180 rotation works on an empty board (kick 0, position unchanged)', () => {
  const board = new Board();
  for (const type of [PIECE.T, PIECE.J, PIECE.L, PIECE.S, PIECE.Z]) {
    const res = tryRotate(board, type, 0, 3, 10, ROTATION_180);
    assert.ok(res, `180 must succeed for type ${type}`);
    assert.equal(res.rot, 2);
    assert.equal(res.kickIndex, 0);
    assert.equal(res.x, 3);
    assert.equal(res.y, 10);
  }
});

test('180 rotation with dir=2 wraps correctly from every rotation', () => {
  const board = new Board();
  for (let rot = 0; rot < 4; rot++) {
    const res = tryRotate(board, PIECE.T, rot, 3, 10, ROTATION_180);
    assert.ok(res);
    assert.equal(res.rot, (rot + 2) % 4);
  }
});

test('rotation result never collides', () => {
  const board = new Board();
  for (let x = 0; x < 10; x++) if (x !== 0) board.set(x, 23, 1);
  for (const type of [1, 2, 3, 4, 5, 6, 7]) {
    for (let rot = 0; rot < 4; rot++) {
      for (const dir of [ROTATION_CW, ROTATION_CCW, ROTATION_180]) {
        for (const x of [-2, 0, 3, 7]) {
          if (board.collides(PIECES[type][rot], x, 12)) continue; // invalid start
          const res = tryRotate(board, type, rot, x, 12, dir);
          if (res) {
            assert.equal(
              board.collides(PIECES[type][res.rot], res.x, res.y),
              false,
              `type=${type} rot=${rot} dir=${dir} x=${x} produced a colliding result`,
            );
          }
        }
      }
    }
  }
});
