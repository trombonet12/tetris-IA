import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneticAlgorithm } from '../src/ai/ga.js';
import { AutoTuner } from '../src/ai/auto-tuner.js';
import { genomeDistance } from '../src/ai/genome.js';
import { serializeModel, parseModel, f32ToB64, b64ToF32 } from '../src/ai/model-io.js';
import { weightCount } from '../src/ai/network.js';
import { mulberry32 } from '../src/core/rng.js';

const ARCH = [14, 24, 12, 1];

function makeGa(seed = 1, config = {}) {
  return new GeneticAlgorithm({ arch: ARCH, rng: mulberry32(seed), config });
}

test('same seed produces the same population and the same evolution', () => {
  const run = () => {
    const ga = makeGa(11);
    let pop = ga.createPopulation(20);
    const fitnesses = pop.map((_, i) => i * 3.7); // stub fitness
    for (let g = 0; g < 3; g++) ({ population: pop } = ga.evolve(pop, fitnesses));
    return pop;
  };
  const a = run();
  const b = run();
  for (let i = 0; i < a.length; i++) assert.equal(genomeDistance(a[i], b[i]), 0, `genome ${i} differs`);
});

test('elitism preserves the best genome exactly', () => {
  const ga = makeGa(5, { eliteFraction: 0.1 });
  const pop = ga.createPopulation(20);
  const fitnesses = pop.map(() => 1);
  fitnesses[13] = 999; // best is index 13
  const { population: next, ranking, eliteCount } = ga.evolve(pop, fitnesses);
  assert.equal(ranking[0], 13);
  assert.ok(eliteCount >= 1);
  assert.equal(genomeDistance(next[0], pop[13]), 0);
});

test('injectRandom replaces tail offspring but never the elites', () => {
  const ga = makeGa(7, { eliteFraction: 0.1 });
  const pop = ga.createPopulation(20);
  const fitnesses = pop.map((_, i) => i);
  const { population: next } = ga.evolve(pop, fitnesses, { injectRandom: 5 });
  // Elite (best = index 19) must survive exactly.
  assert.equal(genomeDistance(next[0], pop[19]), 0);
  assert.equal(next.length, 20);
});

test('crossover none + rate 0 mutation yields clones of parents', () => {
  const ga = makeGa(3, { crossoverOp: 'none', mutationRate: 0, eliteFraction: 0.05 });
  const pop = ga.createPopulation(10);
  const fitnesses = pop.map((_, i) => i);
  const { population: next } = ga.evolve(pop, fitnesses);
  for (const child of next) {
    const isClone = pop.some((p) => genomeDistance(child, p) === 0);
    assert.ok(isClone, 'every child should be an exact clone of some parent');
  }
});

test('createPopulationFrom: index 0 exact, rest mutated', () => {
  const ga = makeGa(9);
  const base = ga.createPopulation(1)[0];
  const pop = ga.createPopulationFrom(base, 10);
  assert.equal(genomeDistance(pop[0], base), 0);
  assert.ok(genomeDistance(pop[5], base) > 0);
});

test('auto-tuner raises sigma on stagnation and injects on hard stagnation', () => {
  const ga = makeGa(2);
  const tuner = new AutoTuner({ ga, rng: mulberry32(4) });
  const pop = ga.createPopulation(10);
  const sigmaBefore = ga.params.mutationSigma;
  // First a record, then flat generations.
  tuner.update({ generation: 0, best: 100, median: 50, medianPieces: 10, population: pop });
  let injected = false;
  for (let g = 1; g <= 15; g++) {
    const { evolveOpts } = tuner.update({ generation: g, best: 100, median: 50, medianPieces: 10, population: pop });
    if (evolveOpts.injectRandom > 0) injected = true;
  }
  assert.ok(ga.params.mutationSigma > sigmaBefore, 'sigma should rise under stagnation');
  assert.ok(injected, 'hard stagnation should trigger diversity injection');
});

test('auto-tuner lowers sigma on sustained progress', () => {
  const ga = makeGa(2);
  const tuner = new AutoTuner({ ga, rng: mulberry32(4) });
  const pop = ga.createPopulation(10);
  const sigmaBefore = ga.params.mutationSigma;
  for (let g = 0; g < 8; g++) {
    tuner.update({ generation: g, best: 100 * (g + 1), median: 50, medianPieces: 10, population: pop });
  }
  assert.ok(ga.params.mutationSigma < sigmaBefore, 'sigma should shrink while improving');
  assert.equal(tuner.stagnation, 0);
});

test('auto-tuner curriculum raises maxPieces when the population survives it', () => {
  const ga = makeGa(2);
  const tuner = new AutoTuner({ ga, rng: mulberry32(4) });
  const pop = ga.createPopulation(10);
  const start = tuner.maxPieces;
  tuner.update({ generation: 0, best: 10, median: 5, medianPieces: start, population: pop });
  assert.ok(tuner.maxPieces > start);
});

test('auto-tuner state roundtrip', () => {
  const ga = makeGa(2);
  const tuner = new AutoTuner({ ga, rng: mulberry32(4) });
  const pop = ga.createPopulation(6);
  for (let g = 0; g < 6; g++) tuner.update({ generation: g, best: 5, median: 3, medianPieces: 10, population: pop });
  const state = tuner.getState();
  const ga2 = makeGa(2);
  const tuner2 = new AutoTuner({ ga: ga2, rng: mulberry32(4) });
  tuner2.setState(state);
  assert.equal(tuner2.stagnation, tuner.stagnation);
  assert.equal(tuner2.maxPieces, tuner.maxPieces);
  assert.equal(ga2.params.mutationSigma, ga.params.mutationSigma);
});

test('model-io: base64 roundtrip preserves f32 values', () => {
  const arr = Float32Array.from([0, 1.5, -3.25, 1e-7, 12345.678]);
  const back = b64ToF32(f32ToB64(arr));
  assert.equal(back.length, arr.length);
  for (let i = 0; i < arr.length; i++) assert.equal(back[i], arr[i]);
});

test('model-io: serialize/parse roundtrip with metadata', () => {
  const weights = new Float32Array(weightCount(ARCH)).map(() => Math.fround(Math.sin(Math.random() * 10)));
  const json = serializeModel({ arch: ARCH, weights, meta: { name: 'Campeón', generation: 42, bestFitness: 1234.5 } });
  const parsed = parseModel(json);
  assert.deepEqual(parsed.arch, ARCH);
  assert.equal(parsed.meta.name, 'Campeón');
  assert.equal(parsed.weights.length, weights.length);
  for (let i = 0; i < weights.length; i++) assert.equal(parsed.weights[i], weights[i]);
});

test('model-io: rejects corrupt files with Spanish messages', () => {
  assert.throws(() => parseModel('esto no es json'), /JSON válido/);
  assert.throws(() => parseModel('{"magic":"OTRA-COSA"}'), /cabecera/);
  const good = JSON.parse(serializeModel({ arch: ARCH, weights: new Float32Array(weightCount(ARCH)) }));
  assert.throws(() => parseModel(JSON.stringify({ ...good, version: 99 })), /Versión/);
  assert.throws(() => parseModel(JSON.stringify({ ...good, arch: [14, 0, 1] })), /Arquitectura/);
  assert.throws(() => parseModel(JSON.stringify({ ...good, weightsB64: good.weightsB64.slice(0, 20) })), /pesos/i);
});
