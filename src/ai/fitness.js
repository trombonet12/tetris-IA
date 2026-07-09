import { Game } from '../game/game.js';
import { AiPlayer } from './agent.js';
import { GA_DEFAULTS } from '../core/config.js';

/** Fitness of a single finished (or truncated) game. */
export function gameFitness(stats, coeffs = GA_DEFAULTS.fitness) {
  return (
    stats.lines * coeffs.lines +
    stats.tetrises * coeffs.tetrises +
    (stats.tspins + stats.tspinMinis) * coeffs.tspins +
    stats.pieces * coeffs.pieces +
    Math.sqrt(Math.max(0, stats.score)) * coeffs.scoreSqrt
  );
}

/**
 * Evaluates one genome over several seeds; fitness is the mean.
 * Multi-seed evaluation + per-generation seed rotation is the main defense
 * against overfitting to a single piece sequence.
 *
 * @param {object} opts
 * @param {Float32Array} opts.genome
 * @param {number[]} opts.arch
 * @param {number[]|Uint32Array} opts.seeds
 * @param {number} opts.maxPieces per-game piece cap (curriculum / watchdog)
 * @param {number} [opts.maxLines] early stop: the agent already "won"
 * @param {object} [opts.fitnessCoeffs]
 * @param {boolean} [opts.useHold]
 * @param {Uint8Array|null} [opts.featureMask]
 * @param {AiPlayer} [opts.player] reusable player (avoids re-allocating buffers)
 * @param {Game} [opts.game] reusable game instance
 * @returns {{fitness:number, games:object[], stats:object}}
 */
export function evaluateGenome(opts) {
  const {
    genome,
    arch,
    seeds,
    maxPieces,
    maxLines = GA_DEFAULTS.maxLines,
    fitnessCoeffs = GA_DEFAULTS.fitness,
    useHold = true,
    featureMask = null,
  } = opts;

  const player = opts.player ?? new AiPlayer({ arch, weights: genome, useHold, featureMask });
  player.setWeights(genome);
  const game = opts.game ?? new Game({ seed: 1 });

  const games = [];
  let fitnessSum = 0;
  for (const seed of seeds) {
    game.reset(seed >>> 0);
    while (game.state === 'playing' && game.stats.pieces < maxPieces && game.stats.lines < maxLines) {
      player.playPiece(game);
    }
    const s = game.stats;
    const f = gameFitness(s, fitnessCoeffs);
    fitnessSum += f;
    games.push({
      seed: seed >>> 0,
      fitness: f,
      lines: s.lines,
      pieces: s.pieces,
      score: s.score,
      tetrises: s.tetrises,
      tspins: s.tspins + s.tspinMinis,
      level: s.level,
      truncated: game.state === 'playing',
    });
  }

  const n = games.length || 1;
  const agg = (key) => games.reduce((acc, g) => acc + g[key], 0) / n;
  return {
    fitness: fitnessSum / n,
    games,
    stats: {
      meanLines: agg('lines'),
      meanPieces: agg('pieces'),
      meanScore: agg('score'),
      totalTetrises: games.reduce((a, g) => a + g.tetrises, 0),
      totalTspins: games.reduce((a, g) => a + g.tspins, 0),
      bestLines: Math.max(...games.map((g) => g.lines), 0),
    },
  };
}
