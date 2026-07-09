import { MLP } from './network.js';
import { MoveEnumerator } from './move-enumerator.js';
import { FEATURE_COUNT } from './features.js';
import { AI_DEFAULTS } from '../core/config.js';

/**
 * Position-evaluator agent: enumerates all legal placements, scores each
 * feature vector with the MLP and plays the argmax via Game.applyPlacement.
 * Stateless with respect to the game — pass any Game instance.
 */
export class AiPlayer {
  /**
   * @param {object} opts
   * @param {number[]} [opts.arch]
   * @param {Float32Array} opts.weights flat genome
   * @param {boolean} [opts.useHold]
   * @param {Uint8Array|null} [opts.featureMask]
   */
  constructor({ arch = AI_DEFAULTS.arch, weights, useHold = AI_DEFAULTS.useHold, featureMask = null }) {
    this.net = new MLP(arch);
    if (weights.length !== this.net.weightCount) {
      throw new Error(`genome length ${weights.length} != expected ${this.net.weightCount}`);
    }
    this.weights = weights;
    this.useHold = useHold;
    this.featureMask = featureMask;
    this.enumerator = new MoveEnumerator();
    this._best = { useHold: false, rotation: 0, x: 0, score: -Infinity, candidates: 0 };
  }

  setWeights(weights) {
    this.weights = weights;
  }

  /**
   * Picks the best placement for the current state. Returns a REUSED object —
   * consume it before the next call. Null if the game is over or no moves.
   */
  chooseMove(game) {
    const best = this._best;
    best.score = -Infinity;
    best.candidates = 0;
    this.enumerator.enumerate(
      game,
      (features, viaHold, rotation, x) => {
        const score = this.net.forward(this.weights, features);
        best.candidates++;
        if (score > best.score) {
          best.score = score;
          best.useHold = viaHold;
          best.rotation = rotation;
          best.x = x;
        }
      },
      { useHold: this.useHold, featureMask: this.featureMask },
    );
    return best.candidates > 0 ? best : null;
  }

  /**
   * Chooses and immediately executes the best placement (training hot path).
   * @returns {{gameOver:boolean, linesCleared:number}}
   */
  playPiece(game) {
    const move = this.chooseMove(game);
    if (!move) return { gameOver: true, linesCleared: 0 };
    const res = game.applyPlacement(move);
    return { gameOver: res.gameOver, linesCleared: res.linesCleared };
  }

  /**
   * Detailed evaluation for the UI (watch mode / training inspector):
   * every candidate with a copied feature vector and score, sorted best-first,
   * plus per-layer activations of the winning placement. Allocates freely.
   */
  chooseDetailed(game, topN = Infinity) {
    const candidates = [];
    this.enumerator.enumerate(
      game,
      (features, useHold, rotation, x, info) => {
        candidates.push({
          useHold,
          rotation,
          x,
          score: this.net.forward(this.weights, features),
          features: Float32Array.from(features),
          linesCleared: info.linesCleared,
        });
      },
      { useHold: this.useHold, featureMask: this.featureMask },
    );
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] ?? null;
    let activations = null;
    if (best) {
      activations = this.net.forwardWithActivations(this.weights, best.features).activations;
    }
    return {
      best,
      candidates: candidates.slice(0, topN === Infinity ? candidates.length : topN),
      totalCandidates: candidates.length,
      activations,
    };
  }
}

export { FEATURE_COUNT };
