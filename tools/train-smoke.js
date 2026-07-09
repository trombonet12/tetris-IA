// End-to-end training smoke: evolve a small population for a few generations
// and verify that fitness actually improves. Run: node tools/train-smoke.js
import { GeneticAlgorithm } from '../src/ai/ga.js';
import { AutoTuner } from '../src/ai/auto-tuner.js';
import { evaluateGenome } from '../src/ai/fitness.js';
import { AiPlayer } from '../src/ai/agent.js';
import { Game } from '../src/game/game.js';
import { AI_DEFAULTS } from '../src/core/config.js';
import { mulberry32, deriveSeed } from '../src/core/rng.js';

const MASTER_SEED = 20260706;
const POP = 30;
const GENERATIONS = 12;
const ARCH = AI_DEFAULTS.arch;

const gaRng = mulberry32(deriveSeed(MASTER_SEED, 1));
const ga = new GeneticAlgorithm({ arch: ARCH, rng: gaRng });
const tuner = new AutoTuner({ ga, rng: mulberry32(deriveSeed(MASTER_SEED, 2)) });

let population = ga.createPopulation(POP);
let maxPieces = tuner.maxPieces;

// Reusable evaluation objects (same trick the workers will use).
const player = new AiPlayer({ arch: ARCH, weights: population[0] });
const game = new Game({ seed: 1 });

const t0 = performance.now();
let firstBest = 0;
let lastBest = 0;
let totalPieces = 0;

for (let gen = 0; gen < GENERATIONS; gen++) {
  const seeds = [deriveSeed(MASTER_SEED, 100 + gen, 0), deriveSeed(MASTER_SEED, 100 + gen, 1)];
  const fitnesses = [];
  const piecesList = [];
  for (const genome of population) {
    const res = evaluateGenome({ genome, arch: ARCH, seeds, maxPieces, player, game });
    fitnesses.push(res.fitness);
    piecesList.push(res.stats.meanPieces);
    totalPieces += res.stats.meanPieces * seeds.length;
  }
  const sortedFit = [...fitnesses].sort((a, b) => b - a);
  const best = sortedFit[0];
  const median = sortedFit[Math.floor(sortedFit.length / 2)];
  const medianPieces = [...piecesList].sort((a, b) => a - b)[Math.floor(piecesList.length / 2)];
  if (gen === 0) firstBest = best;
  lastBest = best;

  const { events, evolveOpts, maxPieces: newMax } = tuner.update({
    generation: gen,
    best,
    median,
    medianPieces,
    population,
  });
  maxPieces = newMax;
  const evolved = ga.evolve(population, fitnesses, evolveOpts);
  population = evolved.population;

  const evStr = events.map((e) => e.type).join(',') || '-';
  console.log(
    `gen ${String(gen).padStart(2)}  best=${best.toFixed(1).padStart(8)}  median=${median.toFixed(1).padStart(7)}  ` +
      `sigma=${ga.params.mutationSigma.toFixed(3)}  maxPieces=${maxPieces}  events=[${evStr}]`,
  );
}

const elapsed = (performance.now() - t0) / 1000;
console.log(`\n${GENERATIONS} generations, pop ${POP}, ${Math.round(totalPieces)} pieces in ${elapsed.toFixed(1)}s ` +
  `(${Math.round(totalPieces / elapsed)} pieces/s single-thread)`);
console.log(`best fitness: gen0=${firstBest.toFixed(1)} → gen${GENERATIONS - 1}=${lastBest.toFixed(1)}`);

if (!(lastBest > firstBest)) {
  console.error('TRAIN SMOKE FAILED: fitness did not improve');
  process.exit(1);
}
console.log('TRAIN SMOKE PASSED');
