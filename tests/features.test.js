import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/board.js';
import { extractFeatures, countHoles, FEATURE_COUNT, FEATURE_NAMES } from '../src/ai/features.js';
import { BOARD_WIDTH } from '../src/game/constants.js';

function makeBoard(fill) {
  // fill: array of [x, y] cells to occupy (absolute rows, 0 = top hidden row)
  const b = new Board();
  for (const [x, y] of fill) b.set(x, y, 1);
  return b;
}

function extract(board, info = {}) {
  const out = new Float32Array(FEATURE_COUNT);
  const heights = new Uint8Array(BOARD_WIDTH);
  extractFeatures(
    board,
    { linesCleared: 0, landingHeight: 0, erodedCells: 0, holesBefore: 0, ...info },
    out,
    heights,
  );
  return out;
}

const F = (name) => FEATURE_NAMES.indexOf(name);

test('empty board has zero features', () => {
  const out = extract(makeBoard([]));
  for (let i = 0; i < FEATURE_COUNT; i++) {
    if (FEATURE_NAMES[i] === 'newHoles') continue; // signed delta of 0-0
    assert.equal(out[i], 0, `${FEATURE_NAMES[i]} should be 0`);
  }
});

test('holes and hole depth counted correctly', () => {
  // Column 0: filled at rows 21 and 23, hole at row 22 with 1 filled above → wait
  // rows: 21 filled, 22 empty (hole, 1 cell above), 23 filled.
  const b = makeBoard([
    [0, 21],
    [0, 23],
  ]);
  const heights = new Uint8Array(BOARD_WIDTH);
  b.getColumnHeights(heights);
  assert.equal(heights[0], 3); // total rows 24 - top row 21
  assert.equal(countHoles(b, heights), 1);
  const out = extract(b);
  assert.ok(Math.abs(out[F('holes')] - 1 / 40) < 1e-6);
  assert.ok(out[F('holeDepth')] > 0);
  assert.ok(out[F('rowsWithHoles')] > 0);
});

test('bumpiness of a staircase', () => {
  // Heights: col0=2, col1=1, rest 0 → |2-1| + |1-0| = 2
  const b = makeBoard([
    [0, 22],
    [0, 23],
    [1, 23],
  ]);
  const out = extract(b);
  assert.ok(Math.abs(out[F('bumpiness')] - 2 / 100) < 1e-6);
  assert.ok(Math.abs(out[F('aggregateHeight')] - 3 / 200) < 1e-6);
  assert.ok(Math.abs(out[F('maxHeight')] - 2 / 24) < 1e-6);
});

test('well depth detects a central well', () => {
  // Columns 3 and 5 at height 3, column 4 empty → well of depth 3 → 3·4/2=6
  const cells = [];
  for (let y = 21; y <= 23; y++) {
    cells.push([3, y], [5, y]);
  }
  const b = makeBoard(cells);
  const out = extract(b);
  assert.ok(Math.abs(out[F('wellDepth')] - 6 / 50) < 1e-6);
});

test('almost full rows detected (≥8 of 10)', () => {
  const cells = [];
  for (let x = 0; x < 8; x++) cells.push([x, 23]);
  const b = makeBoard(cells);
  const out = extract(b);
  assert.ok(Math.abs(out[F('almostFullRows')] - 1 / 20) < 1e-6);
});

test('info passthrough features normalized', () => {
  const out = extract(makeBoard([]), { linesCleared: 4, landingHeight: 12, erodedCells: 8, holesBefore: 2 });
  assert.equal(out[F('linesCleared')], 1);
  assert.ok(Math.abs(out[F('landingHeight')] - 12 / 24) < 1e-6);
  assert.equal(out[F('erodedCells')], 1);
  assert.ok(Math.abs(out[F('newHoles')] - -2 / 10) < 1e-6); // 0 holes now, 2 before
});

test('feature mask zeroes disabled features', () => {
  const b = makeBoard([
    [0, 22],
    [0, 23],
    [1, 23],
  ]);
  const out = new Float32Array(FEATURE_COUNT);
  const heights = new Uint8Array(BOARD_WIDTH);
  const mask = new Uint8Array(FEATURE_COUNT).fill(1);
  mask[F('bumpiness')] = 0;
  extractFeatures(b, { linesCleared: 0, landingHeight: 0, erodedCells: 0, holesBefore: 0 }, out, heights, mask);
  assert.equal(out[F('bumpiness')], 0);
  assert.ok(out[F('aggregateHeight')] > 0);
});
