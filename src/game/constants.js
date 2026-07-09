// Board geometry. Row 0 is the TOP (hidden buffer); y grows downward.
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20; // visible rows
export const HIDDEN_ROWS = 4; // buffer rows above the visible field
export const TOTAL_ROWS = BOARD_HEIGHT + HIDDEN_ROWS;
export const VISIBLE_CELLS = BOARD_WIDTH * BOARD_HEIGHT;

// Cell values stored in the board grid.
export const PIECE = { NONE: 0, I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
export const GARBAGE = 8; // gray garbage cell (cheese mode)
export const PIECE_NAMES = ['', 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Snapshot encoding (Uint8Array of VISIBLE_CELLS):
//   0      empty
//   1..7   piece cell (locked or active)
//   8      garbage
//   9..15  ghost cell (piece type + GHOST_OFFSET)
export const GHOST_OFFSET = 8;

export const ROTATION_CW = 1;
export const ROTATION_CCW = -1;
export const ROTATION_180 = 2;

// Number of distinct rotations per piece type (for AI move enumeration).
// Index by piece id: [-, I, O, T, S, Z, J, L]
export const UNIQUE_ROTATIONS = [0, 2, 1, 4, 2, 2, 4, 4];
