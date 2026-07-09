import { Board } from '../game/board.js';
import { PIECES, EXTENTS } from '../game/pieces.js';
import { UNIQUE_ROTATIONS, BOARD_WIDTH, PIECE } from '../game/constants.js';
import { FEATURE_COUNT, extractFeatures, countHoles } from './features.js';

/**
 * Enumerates every legal hard-drop placement of the current piece (and of the
 * hold/next piece when hold is available), simulates each one on a scratch
 * board and hands the resulting feature vector to a callback.
 *
 * v1 enumerates pure vertical drops (rotate+shift at the top, then drop),
 * which matches Game.applyPlacement exactly. Slides/tucks under overhangs
 * are a possible future extension.
 *
 * Reuses all buffers: safe to call in the training hot loop.
 */
export class MoveEnumerator {
  constructor() {
    this._board = new Board();
    this._heights = new Uint8Array(BOARD_WIDTH);
    this._realHeights = new Uint8Array(BOARD_WIDTH);
    this._features = new Float32Array(FEATURE_COUNT);
  }

  /**
   * @param {import('../game/game.js').Game} game
   * @param {(features: Float32Array, useHold: boolean, rotation: number, x: number,
   *          info: {linesCleared:number, landingHeight:number}) => void} visit
   *   `features` is a REUSED buffer — copy it if you need to keep it.
   * @param {object} [opts]
   * @param {boolean} [opts.useHold=true] also enumerate the hold/next piece
   * @param {Uint8Array|null} [opts.featureMask=null]
   * @returns {number} number of placements visited
   */
  enumerate(game, visit, opts = {}) {
    const useHold = opts.useHold !== false;
    const mask = opts.featureMask ?? null;
    if (game.state !== 'playing' || !game.current) return 0;

    const holesBefore = countHoles(game.board, game.board.getColumnHeights(this._realHeights));
    let count = 0;
    count += this._enumeratePiece(game, game.current.type, false, holesBefore, mask, visit);

    if (useHold && game.config.holdEnabled && game.canHold) {
      const altType = game.holdType !== PIECE.NONE ? game.holdType : game.nextQueue[0];
      if (altType && altType !== game.current.type) {
        count += this._enumeratePiece(game, altType, true, holesBefore, mask, visit);
      }
    }
    return count;
  }

  _enumeratePiece(game, type, viaHold, holesBefore, mask, visit) {
    const scratch = this._board;
    const realBoard = game.board;
    let count = 0;
    const rotations = UNIQUE_ROTATIONS[type];
    for (let rot = 0; rot < rotations; rot++) {
      const cells = PIECES[type][rot];
      const ext = EXTENTS[type][rot];
      const minX = -ext.minX;
      const maxX = BOARD_WIDTH - 1 - ext.maxX;
      for (let x = minX; x <= maxX; x++) {
        scratch.copyFrom(realBoard);
        const y = scratch.dropY(cells, x, -4);
        scratch.lock(cells, x, y, type);

        // Eroded cells (Dellacherie): piece cells sitting in cleared rows.
        const cleared = scratch.clearLines();
        let pieceCellsCleared = 0;
        if (cleared.length > 0) {
          for (let i = 0; i < 4; i++) {
            if (cleared.includes(y + cells[i][1])) pieceCellsCleared++;
          }
        }
        const landingHeight = scratch.totalRows - 1 - (y + (ext.minY + ext.maxY) / 2);
        extractFeatures(
          scratch,
          {
            linesCleared: cleared.length,
            landingHeight,
            erodedCells: cleared.length * pieceCellsCleared,
            holesBefore,
          },
          this._features,
          this._heights,
          mask,
        );
        visit(this._features, viaHold, rot, x, {
          linesCleared: cleared.length,
          landingHeight,
        });
        count++;
      }
    }
    return count;
  }
}
