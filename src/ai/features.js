import { GARBAGE } from '../game/constants.js';

// Board feature extraction for the position evaluator. All features are
// normalized to roughly [0, 1] (newHoles is signed, roughly [-1, 1]).
// Hot path: zero allocations — callers pass scratch buffers.

export const FEATURE_VERSION = 1;
export const FEATURE_COUNT = 14;

export const FEATURE_NAMES = [
  'linesCleared',
  'holes',
  'newHoles',
  'aggregateHeight',
  'maxHeight',
  'bumpiness',
  'wellDepth',
  'rowTransitions',
  'colTransitions',
  'landingHeight',
  'erodedCells',
  'holeDepth',
  'rowsWithHoles',
  'almostFullRows',
];

// UI labels (Spanish) in the same order.
export const FEATURE_LABELS_ES = [
  'Líneas completadas',
  'Huecos',
  'Huecos nuevos',
  'Altura agregada',
  'Altura máxima',
  'Rugosidad',
  'Prof. de pozos',
  'Transiciones de fila',
  'Transiciones de columna',
  'Altura de aterrizaje',
  'Celdas erosionadas',
  'Profundidad de huecos',
  'Filas con huecos',
  'Filas casi llenas',
];

/** Counts holes: empty cells with at least one filled cell above them. */
export function countHoles(board, heights) {
  const w = board.width;
  const total = board.totalRows;
  let holes = 0;
  for (let x = 0; x < w; x++) {
    const top = total - heights[x];
    for (let y = top + 1; y < total; y++) {
      if (board.grid[y * w + x] === 0) holes++;
    }
  }
  return holes;
}

/**
 * Fills `out` (Float32Array of FEATURE_COUNT) with normalized features of a
 * post-placement board.
 * @param {import('../game/board.js').Board} board board AFTER lock+clear
 * @param {object} info { linesCleared, landingHeight, erodedCells, holesBefore }
 *   landingHeight: rows from the floor to the locked piece's vertical center
 * @param {Float32Array} out
 * @param {Uint8Array} heightsScratch reusable Uint8Array(board.width)
 * @param {Uint8Array|null} mask per-feature enable flags (null = all enabled)
 */
export function extractFeatures(board, info, out, heightsScratch, mask = null) {
  const w = board.width;
  const total = board.totalRows;
  const grid = board.grid;
  const heights = board.getColumnHeights(heightsScratch);

  let aggregateHeight = 0;
  let maxHeight = 0;
  let bumpiness = 0;
  let wellDepth = 0;
  for (let x = 0; x < w; x++) {
    const h = heights[x];
    aggregateHeight += h;
    if (h > maxHeight) maxHeight = h;
    if (x < w - 1) bumpiness += Math.abs(h - heights[x + 1]);
    // Well: column strictly lower than both neighbors (walls count as tall).
    const left = x === 0 ? total : heights[x - 1];
    const right = x === w - 1 ? total : heights[x + 1];
    const depth = Math.min(left, right) - h;
    if (depth > 0) wellDepth += (depth * (depth + 1)) / 2; // cumulative: deep wells hurt more
  }

  let holes = 0;
  let holeDepth = 0;
  let colTransitions = 0;
  for (let x = 0; x < w; x++) {
    const top = total - heights[x];
    let filledAbove = 0;
    // Column transitions: cell above the stack top is empty; floor is filled.
    let prevFilled = false;
    for (let y = top; y < total; y++) {
      const filled = grid[y * w + x] !== 0;
      if (y > top && filled !== prevFilled) colTransitions++;
      prevFilled = filled;
      if (filled) {
        filledAbove++;
      } else {
        holes++;
        holeDepth += filledAbove;
      }
    }
    if (heights[x] > 0 && !prevFilled) colTransitions++; // bottom cell empty vs floor
  }

  let rowTransitions = 0;
  let rowsWithHoles = 0;
  let almostFullRows = 0;
  const highestTop = total - maxHeight;
  for (let y = highestTop; y < total; y++) {
    let filledCount = 0;
    let rowHasHole = false;
    let prev = true; // left wall counts as filled
    for (let x = 0; x < w; x++) {
      const filled = grid[y * w + x] !== 0;
      if (filled !== prev) rowTransitions++;
      prev = filled;
      if (filled) filledCount++;
      else if (total - heights[x] < y) rowHasHole = true; // empty below the column top
    }
    if (!prev) rowTransitions++; // right wall counts as filled
    if (rowHasHole) rowsWithHoles++;
    if (filledCount >= 8 && filledCount < w) almostFullRows++;
  }

  out[0] = info.linesCleared / 4;
  out[1] = holes / 40;
  out[2] = (holes - info.holesBefore) / 10; // signed delta
  out[3] = aggregateHeight / 200;
  out[4] = maxHeight / total;
  out[5] = bumpiness / 100;
  out[6] = wellDepth / 50;
  out[7] = rowTransitions / 100;
  out[8] = colTransitions / 100;
  out[9] = info.landingHeight / total;
  out[10] = info.erodedCells / 8;
  out[11] = holeDepth / 100;
  out[12] = rowsWithHoles / 20;
  out[13] = almostFullRows / 20;

  if (mask) {
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (!mask[i]) out[i] = 0;
    }
  }
  return out;
}
