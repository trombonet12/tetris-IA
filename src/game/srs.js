import { PIECES } from './pieces.js';
import { PIECE, ROTATION_180 } from './constants.js';

// SRS wall kick tables. IMPORTANT: our y axis grows DOWNWARD, so the y
// components of the standard (y-up) tables are negated here.
// Key: `${from}>${to}` with rotation indices 0..3.

const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

// 180 rotations are not part of classic SRS; use a small pragmatic table.
const KICKS_180 = [[0, 0], [0, -1], [1, 0], [-1, 0]];

/**
 * Attempts an SRS rotation with wall kicks.
 * @param {import('./board.js').Board} board
 * @param {number} type piece id (1..7)
 * @param {number} rot current rotation (0..3)
 * @param {number} x piece origin x
 * @param {number} y piece origin y
 * @param {number} dir +1 CW, -1 CCW, 2 for 180
 * @returns {{rot:number, x:number, y:number, kickIndex:number}|null}
 *   kickIndex is the index into the kick table that succeeded. For JLSTZ,
 *   kickIndex 4 on a T piece guarantees a full T-spin (fin/overhang kick).
 */
export function tryRotate(board, type, rot, x, y, dir) {
  const newRot = (((rot + dir) % 4) + 4) % 4;
  if (newRot === rot) return null;
  const cells = PIECES[type][newRot];

  let kicks;
  if (dir === ROTATION_180) {
    kicks = KICKS_180;
  } else if (type === PIECE.O) {
    kicks = [[0, 0]]; // O never kicks (rotation is a no-op shape-wise)
  } else if (type === PIECE.I) {
    kicks = KICKS_I[`${rot}>${newRot}`];
  } else {
    kicks = KICKS_JLSTZ[`${rot}>${newRot}`];
  }

  for (let i = 0; i < kicks.length; i++) {
    const nx = x + kicks[i][0];
    const ny = y + kicks[i][1];
    if (!board.collides(cells, nx, ny)) {
      return { rot: newRot, x: nx, y: ny, kickIndex: i };
    }
  }
  return null;
}
