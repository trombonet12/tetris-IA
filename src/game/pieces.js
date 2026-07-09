import { PIECE } from './constants.js';

// Piece definitions in SRS convention. Each rotation is a list of 4 [x, y]
// cell offsets relative to the piece origin (top-left of its bounding box).
// y grows DOWNWARD. Rotation index: 0=spawn, 1=CW, 2=180, 3=CCW.

const I = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[2, 0], [2, 1], [2, 2], [2, 3]],
  [[0, 2], [1, 2], [2, 2], [3, 2]],
  [[1, 0], [1, 1], [1, 2], [1, 3]],
];
const O = [
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
];
const T = [
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [1, 1], [2, 1], [1, 2]],
  [[0, 1], [1, 1], [2, 1], [1, 2]],
  [[1, 0], [0, 1], [1, 1], [1, 2]],
];
const S = [
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[1, 0], [1, 1], [2, 1], [2, 2]],
  [[1, 1], [2, 1], [0, 2], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [1, 2]],
];
const Z = [
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[2, 0], [1, 1], [2, 1], [1, 2]],
  [[0, 1], [1, 1], [1, 2], [2, 2]],
  [[1, 0], [0, 1], [1, 1], [0, 2]],
];
const J = [
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [1, 1], [1, 2]],
  [[0, 1], [1, 1], [2, 1], [2, 2]],
  [[1, 0], [1, 1], [0, 2], [1, 2]],
];
const L = [
  [[2, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [1, 1], [1, 2], [2, 2]],
  [[0, 1], [1, 1], [2, 1], [0, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
];

// PIECES[type][rotation] → array of 4 [x, y] offsets. Index 0 unused.
export const PIECES = [null, I, O, T, S, Z, J, L];

// Spawn origin: pieces appear fully inside the hidden buffer (rows 2-3),
// immediately above the visible field (which starts at row HIDDEN_ROWS=4).
export const SPAWN_X = 3;
export const SPAWN_Y = 2;

// Precomputed per-rotation horizontal extents, for move enumeration bounds.
// EXTENTS[type][rot] = { minX, maxX, minY, maxY }
export const EXTENTS = PIECES.map((rots) => {
  if (!rots) return null;
  return rots.map((cells) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of cells) {
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
    return { minX, maxX, minY, maxY };
  });
});

export const ALL_TYPES = [PIECE.I, PIECE.O, PIECE.T, PIECE.S, PIECE.Z, PIECE.J, PIECE.L];
