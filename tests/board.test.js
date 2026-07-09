import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/board.js';
import { PIECES } from '../src/game/pieces.js';
import {
  PIECE,
  GARBAGE,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  HIDDEN_ROWS,
  TOTAL_ROWS,
} from '../src/game/constants.js';

const O_CELLS = PIECES[PIECE.O][0]; // [[1,0],[2,0],[1,1],[2,1]]
const I_H = PIECES[PIECE.I][0]; // horizontal I, cells at y offset 1
const I_V = PIECES[PIECE.I][1]; // vertical I, cells at x offset 2

/** Fills row y completely except the columns in `holes`. */
function fillRow(board, y, holes = [], value = 1) {
  for (let x = 0; x < BOARD_WIDTH; x++) {
    board.set(x, y, holes.includes(x) ? 0 : value);
  }
}

test('board dimensions match constants', () => {
  const b = new Board();
  assert.equal(b.width, BOARD_WIDTH);
  assert.equal(b.height, BOARD_HEIGHT);
  assert.equal(b.hidden, HIDDEN_ROWS);
  assert.equal(b.totalRows, TOTAL_ROWS);
  assert.equal(b.grid.length, BOARD_WIDTH * TOTAL_ROWS);
});

test('get/set round-trip', () => {
  const b = new Board();
  b.set(3, 5, 7);
  assert.equal(b.get(3, 5), 7);
  assert.equal(b.get(4, 5), 0);
  b.set(3, 5, 0);
  assert.equal(b.get(3, 5), 0);
});

test('collides: left and right walls', () => {
  const b = new Board();
  // O piece cell offsets span x 1..2, so origin x=-1 touches the left wall.
  assert.equal(b.collides(O_CELLS, -1, 10), false);
  assert.equal(b.collides(O_CELLS, -2, 10), true, 'x=-2 puts a cell at absolute x=-1');
  // Right wall: max offset 2, so origin 7 puts cells at x=9 (ok), 8 puts x=10 (wall).
  assert.equal(b.collides(O_CELLS, 7, 10), false);
  assert.equal(b.collides(O_CELLS, 8, 10), true);
});

test('collides: floor', () => {
  const b = new Board();
  // O cells span y 0..1, so origin y = totalRows-2 rests on the floor.
  assert.equal(b.collides(O_CELLS, 4, TOTAL_ROWS - 2), false);
  assert.equal(b.collides(O_CELLS, 4, TOTAL_ROWS - 1), true);
});

test('collides: stack cells', () => {
  const b = new Board();
  b.set(5, 12, 3);
  // O at origin (4,11) covers (5,11),(6,11),(5,12),(6,12) → hits (5,12).
  assert.equal(b.collides(O_CELLS, 4, 11), true);
  assert.equal(b.collides(O_CELLS, 4, 9), false);
});

test('collides: cells above the board (y < 0) are free', () => {
  const b = new Board();
  // Vertical I at y=-3: cells at y -3..0, all in-bounds columns → no collision.
  assert.equal(b.collides(I_V, 0, -3), false);
  // But a wall collision still applies even above the board.
  assert.equal(b.collides(I_V, -3, -3), true);
});

test('dropY: empty board', () => {
  const b = new Board();
  // O spans y 0..1 → origin rests at totalRows-2 = 22.
  assert.equal(b.dropY(O_CELLS, 4, 0), TOTAL_ROWS - 2);
  // Horizontal I has cells at y offset 1 → origin rests at totalRows-2 = 22.
  assert.equal(b.dropY(I_H, 3, 0), TOTAL_ROWS - 2);
  // Vertical I spans y 0..3 → origin rests at totalRows-4 = 20.
  assert.equal(b.dropY(I_V, 3, 0), TOTAL_ROWS - 4);
});

test('dropY: lands on top of the stack', () => {
  const b = new Board();
  fillRow(b, 20); // stack top at row 20
  // O spans y 0..1 → must rest with bottom row at 19 → origin 18.
  assert.equal(b.dropY(O_CELLS, 4, 0), 18);
});

test('dropY: starting position already resting returns the same y', () => {
  const b = new Board();
  assert.equal(b.dropY(O_CELLS, 4, TOTAL_ROWS - 2), TOTAL_ROWS - 2);
});

test('lock writes the piece value into the grid (and skips y < 0 cells)', () => {
  const b = new Board();
  b.lock(O_CELLS, 4, 10, PIECE.O);
  assert.equal(b.get(5, 10), PIECE.O);
  assert.equal(b.get(6, 10), PIECE.O);
  assert.equal(b.get(5, 11), PIECE.O);
  assert.equal(b.get(6, 11), PIECE.O);
  assert.equal(b.get(4, 10), 0);
  // Cells above the board are silently dropped, no crash.
  const b2 = new Board();
  b2.lock(I_V, 0, -2, PIECE.I); // cells at y -2,-1,0,1
  assert.equal(b2.get(2, 0), PIECE.I);
  assert.equal(b2.get(2, 1), PIECE.I);
});

test('clearLines: single line, rows above shift down', () => {
  const b = new Board();
  fillRow(b, 23);
  b.set(0, 22, 5); // marker above the cleared line
  const cleared = b.clearLines();
  assert.deepEqual(cleared, [23]);
  assert.equal(b.get(0, 23), 5, 'marker must compact down into row 23');
  for (let x = 1; x < BOARD_WIDTH; x++) assert.equal(b.get(x, 23), 0);
  assert.equal(b.get(0, 22), 0);
});

test('clearLines: two non-adjacent lines compact correctly', () => {
  const b = new Board();
  fillRow(b, 23);
  fillRow(b, 21);
  b.set(3, 22, 7); // sandwiched partial row
  b.set(4, 20, 6); // row above both
  const cleared = b.clearLines();
  assert.deepEqual(cleared, [21, 23]);
  // Sandwiched row falls to the bottom; row 20 falls two rows.
  assert.equal(b.get(3, 23), 7);
  assert.equal(b.get(4, 22), 6);
  assert.equal(b.get(3, 22), 0);
  assert.equal(b.get(4, 20), 0);
  assert.equal(b.get(4, 21), 0);
});

test('clearLines: four lines (tetris) compact correctly', () => {
  const b = new Board();
  for (let y = 20; y <= 23; y++) fillRow(b, y);
  b.set(9, 19, 2); // marker above
  const cleared = b.clearLines();
  assert.deepEqual(cleared, [20, 21, 22, 23]);
  assert.equal(b.get(9, 23), 2, 'marker falls 4 rows');
  // Everything else empty.
  let occupied = 0;
  for (const v of b.grid) if (v !== 0) occupied++;
  assert.equal(occupied, 1);
});

test('clearLines: no full rows returns empty array and leaves grid intact', () => {
  const b = new Board();
  fillRow(b, 23, [4]);
  const before = Array.from(b.grid);
  assert.deepEqual(b.clearLines(), []);
  assert.deepEqual(Array.from(b.grid), before);
});

test('getColumnHeights: measured from the floor, includes hidden rows', () => {
  const b = new Board();
  const out = new Uint8Array(BOARD_WIDTH);
  b.getColumnHeights(out);
  assert.deepEqual(Array.from(out), new Array(BOARD_WIDTH).fill(0));

  b.set(0, 23, 1); // height 1
  b.set(3, 20, 1); // height 4
  b.set(3, 23, 1); // buried cell does not change the height
  b.set(7, 2, 1); // in the hidden buffer: height totalRows - 2 = 22
  b.getColumnHeights(out);
  assert.equal(out[0], 1);
  assert.equal(out[3], 4);
  assert.equal(out[7], TOTAL_ROWS - 2);
  assert.equal(out[5], 0);
  // Returns the same array passed in.
  assert.equal(b.getColumnHeights(out), out);
});

test('isTopOut: true only when the hidden buffer has occupied cells', () => {
  const b = new Board();
  assert.equal(b.isTopOut(), false);
  b.set(4, HIDDEN_ROWS, 1); // first visible row → not a top out
  assert.equal(b.isTopOut(), false);
  b.set(4, HIDDEN_ROWS - 1, 1); // last hidden row → top out
  assert.equal(b.isTopOut(), true);
});

test('isEmpty', () => {
  const b = new Board();
  assert.equal(b.isEmpty(), true);
  b.set(9, 23, GARBAGE);
  assert.equal(b.isEmpty(), false);
  b.reset();
  assert.equal(b.isEmpty(), true);
});

test('insertGarbage: shifts the stack up and inserts rows with a hole', () => {
  const b = new Board();
  b.set(2, 23, 5); // existing stack cell at the bottom
  b.insertGarbage(2, [3, 7]);
  // Stack cell moved up 2 rows.
  assert.equal(b.get(2, 21), 5);
  assert.equal(b.get(2, 23), GARBAGE, 'old position now garbage (hole at x=3)');
  // Garbage rows: 22 (hole 3) and 23 (hole 7).
  for (let x = 0; x < BOARD_WIDTH; x++) {
    assert.equal(b.get(x, 22), x === 3 ? 0 : GARBAGE, `row 22 col ${x}`);
    assert.equal(b.get(x, 23), x === 7 ? 0 : GARBAGE, `row 23 col ${x}`);
  }
});

test('countGarbageRows: counts rows containing at least one garbage cell', () => {
  const b = new Board();
  assert.equal(b.countGarbageRows(), 0);
  b.insertGarbage(3, [0, 5, 9]);
  assert.equal(b.countGarbageRows(), 3);
  // A lone garbage cell in another row also counts as a garbage row.
  b.set(4, 10, GARBAGE);
  assert.equal(b.countGarbageRows(), 4);
  // Non-garbage cells do not count.
  b.set(4, 5, 1);
  assert.equal(b.countGarbageRows(), 4);
});

test('reset, copyFrom and clone', () => {
  const a = new Board();
  a.set(1, 22, 3);
  a.set(8, 4, 7);

  const c = a.clone();
  assert.deepEqual(Array.from(c.grid), Array.from(a.grid));
  c.set(0, 0, 1);
  assert.equal(a.get(0, 0), 0, 'clone must not share the grid');

  const d = new Board();
  d.copyFrom(a);
  assert.deepEqual(Array.from(d.grid), Array.from(a.grid));

  a.reset();
  assert.equal(a.isEmpty(), true);
  assert.equal(d.isEmpty(), false, 'copy is independent');
});
