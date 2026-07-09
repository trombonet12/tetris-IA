import { GA_DEFAULTS } from '../core/config.js';
import { gaussian } from '../core/rng.js';
import { createGenome, randomGene } from './genome.js';
import { weightCount } from './network.js';

/**
 * Generational GA over flat weight genomes. Deterministic given the injected
 * rng. `params` (sigma, rates, tournament size) are mutable at runtime — the
 * AutoTuner adjusts them between generations.
 */
export class GeneticAlgorithm {
  /**
   * @param {object} opts
   * @param {number[]} opts.arch network architecture (defines genome length)
   * @param {() => number} opts.rng float rng in [0,1)
   * @param {object} [opts.config] GA_DEFAULTS overrides
   */
  constructor({ arch, rng, config = {} }) {
    this.arch = arch.slice();
    this.rng = rng;
    this.config = { ...GA_DEFAULTS, ...config, fitness: { ...GA_DEFAULTS.fitness, ...(config.fitness ?? {}) } };
    this.genomeLength = weightCount(this.arch);
    // Live parameters (AutoTuner mutates these).
    this.params = {
      tournamentK: this.config.tournamentK,
      crossoverOp: this.config.crossoverOp,
      crossoverRate: this.config.crossoverRate,
      blxAlpha: this.config.blxAlpha,
      mutationRate: this.config.mutationRate,
      mutationSigma: this.config.mutationSigma,
      geneResetRate: this.config.geneResetRate,
    };
    this.generation = 0;
  }

  /** Fresh random population. */
  createPopulation(size) {
    const pop = [];
    for (let i = 0; i < size; i++) pop.push(createGenome(this.arch, this.rng));
    return pop;
  }

  /**
   * Warm-start population from a saved model: index 0 is the exact genome,
   * the first ~10% get light mutations, the rest stronger ones.
   */
  createPopulationFrom(genome, size) {
    const pop = [Float32Array.from(genome)];
    const lightCount = Math.max(1, Math.floor(size * 0.1));
    for (let i = 1; i < size; i++) {
      const clone = Float32Array.from(genome);
      const sigmaMul = i <= lightCount ? 1 : 3;
      this._mutate(clone, this.params.mutationSigma * sigmaMul, Math.max(this.params.mutationRate, 0.1));
      pop.push(clone);
    }
    return pop;
  }

  /**
   * Produces the next generation.
   * @param {Float32Array[]} population
   * @param {number[]} fitnesses parallel to population
   * @param {object} [opts] AutoTuner directives
   * @param {number} [opts.injectRandom] replace this many offspring with fresh genomes
   * @param {number} [opts.hypermutate] hypermutate this many offspring (sigma × mul)
   * @param {number} [opts.hypermutateSigmaMul]
   * @returns {{population: Float32Array[], ranking: number[], eliteCount: number}}
   *   ranking: population indices sorted by fitness, best first
   */
  evolve(population, fitnesses, opts = {}) {
    const size = population.length;
    const ranking = population.map((_, i) => i).sort((a, b) => fitnesses[b] - fitnesses[a]);
    const eliteCount = Math.max(1, Math.round(size * this.config.eliteFraction));

    const next = [];
    for (let e = 0; e < eliteCount && e < size; e++) {
      next.push(Float32Array.from(population[ranking[e]]));
    }
    while (next.length < size) {
      const a = population[this._tournament(fitnesses)];
      const b = population[this._tournament(fitnesses)];
      const child = this._crossover(a, b);
      this._mutate(child, this.params.mutationSigma, this.params.mutationRate);
      next.push(child);
    }

    // AutoTuner directives — never touch the elites.
    const injectRandom = Math.min(opts.injectRandom ?? 0, size - eliteCount);
    for (let i = 0; i < injectRandom; i++) {
      next[size - 1 - i] = createGenome(this.arch, this.rng);
    }
    const hyper = Math.min(opts.hypermutate ?? 0, size - eliteCount - injectRandom);
    const hyperSigma = this.params.mutationSigma * (opts.hypermutateSigmaMul ?? 3);
    for (let i = 0; i < hyper; i++) {
      this._mutate(next[eliteCount + i], hyperSigma, Math.max(this.params.mutationRate * 2, 0.2));
    }

    this.generation++;
    return { population: next, ranking, eliteCount };
  }

  _tournament(fitnesses) {
    const n = fitnesses.length;
    const k = Math.max(2, Math.min(this.params.tournamentK, n));
    let best = Math.floor(this.rng() * n);
    for (let i = 1; i < k; i++) {
      const c = Math.floor(this.rng() * n);
      if (fitnesses[c] > fitnesses[best]) best = c;
    }
    return best;
  }

  _crossover(a, b) {
    const op = this.params.crossoverOp;
    if (op === 'none' || this.rng() >= this.params.crossoverRate) {
      return Float32Array.from(a);
    }
    const child = new Float32Array(a.length);
    if (op === 'blx') {
      // BLX-α: sample uniformly in the expanded interval around both parents.
      const alpha = this.params.blxAlpha;
      for (let i = 0; i < a.length; i++) {
        const lo = Math.min(a[i], b[i]);
        const hi = Math.max(a[i], b[i]);
        const range = hi - lo;
        child[i] = lo - alpha * range + this.rng() * (range + 2 * alpha * range);
      }
    } else {
      // Uniform: each gene from either parent with p=0.5.
      for (let i = 0; i < a.length; i++) child[i] = this.rng() < 0.5 ? a[i] : b[i];
    }
    return child;
  }

  _mutate(genome, sigma, rate) {
    for (let i = 0; i < genome.length; i++) {
      if (this.rng() < rate) {
        if (this.rng() < this.params.geneResetRate) genome[i] = randomGene(this.rng);
        else genome[i] += gaussian(this.rng) * sigma;
      }
    }
  }
}
