import { gaussian } from '../core/rng.js';
import { weightCount } from './network.js';

// A genome is the flat Float32Array of MLP weights (see network.js layout).

/** He-normal initialization: weights ~ N(0, sqrt(2/fanIn)), biases = 0. */
export function createGenome(arch, rng) {
  const genome = new Float32Array(weightCount(arch));
  let offset = 0;
  for (let l = 0; l < arch.length - 1; l++) {
    const nIn = arch[l];
    const nOut = arch[l + 1];
    const std = Math.sqrt(2 / nIn);
    for (let i = 0; i < nOut * nIn; i++) genome[offset + i] = gaussian(rng) * std;
    // biases stay 0
    offset += (nIn + 1) * nOut;
  }
  return genome;
}

/** Fresh random value for a single gene (used by gene-reset mutation). */
export function randomGene(rng) {
  return gaussian(rng) * 0.3;
}

/** Normalized L2 distance between two genomes (comparable across sizes). */
export function genomeDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/**
 * Mean pairwise distance over a random sample of the population.
 * Cheap diversity estimate for the auto-tuner and the diversity chart.
 */
export function populationDiversity(population, rng, samplePairs = 30) {
  const n = population.length;
  if (n < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let k = 0; k < samplePairs; k++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * n);
    if (i === j) j = (j + 1) % n;
    total += genomeDistance(population[i], population[j]);
    pairs++;
  }
  return total / pairs;
}

/** Concatenates genomes into a single transferable ArrayBuffer. */
export function packGenomes(genomes) {
  const len = genomes[0]?.length ?? 0;
  const packed = new Float32Array(len * genomes.length);
  for (let i = 0; i < genomes.length; i++) packed.set(genomes[i], i * len);
  return packed;
}

/** Splits a packed buffer back into genome views (no copy). */
export function unpackGenomes(buffer, genomeLength) {
  const flat = new Float32Array(buffer);
  const out = [];
  for (let o = 0; o + genomeLength <= flat.length; o += genomeLength) {
    out.push(flat.subarray(o, o + genomeLength));
  }
  return out;
}
