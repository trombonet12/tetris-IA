import { TUNER_DEFAULTS } from '../core/config.js';
import { populationDiversity } from './genome.js';

/**
 * Self-finetuning controller. After every generation it inspects progress and
 * adjusts the GA's live parameters:
 *  - progress → exploit: shrink sigma, decay mutation rate toward base
 *  - soft stagnation → explore: boost sigma/rate, lower selection pressure
 *  - hard stagnation or diversity collapse → inject fresh genomes + hypermutate
 *  - curriculum: raise the per-game piece cap as the population survives it
 *
 * Deterministic given the injected rng. Every decision is returned as an
 * event so the UI can log and chart it.
 */
export class AutoTuner {
  /**
   * @param {object} opts
   * @param {import('./ga.js').GeneticAlgorithm} opts.ga
   * @param {() => number} opts.rng
   * @param {object} [opts.config]
   */
  constructor({ ga, rng, config = {} }) {
    this.ga = ga;
    this.rng = rng;
    this.config = { ...TUNER_DEFAULTS, ...config };
    this.enabled = this.config.enabled;
    this.bestEver = -Infinity;
    this.stagnation = 0;
    this.maxPieces = this.config.curriculumStart;
    this.baseSigma = ga.params.mutationSigma;
    this.baseRate = ga.params.mutationRate;
    this.baseTournamentK = ga.params.tournamentK;
    this.history = []; // per generation: {generation, sigma, rate, stagnation, diversity, maxPieces}
    this.lastReason = null; // Spanish-ready key of the last adjustment, for the UI panel
  }

  /**
   * Call once per generation, BEFORE ga.evolve().
   * @param {object} info
   * @param {number} info.generation
   * @param {number} info.best best fitness this generation
   * @param {number} info.median median fitness
   * @param {number} info.medianPieces median pieces survived (curriculum signal)
   * @param {Float32Array[]} info.population
   * @returns {{events: Array<{type:string, data?:object}>,
   *            evolveOpts: {injectRandom:number, hypermutate:number, hypermutateSigmaMul:number},
   *            maxPieces: number}}
   */
  update({ generation, best, median, medianPieces, population }) {
    const cfg = this.config;
    const params = this.ga.params;
    const events = [];
    const evolveOpts = { injectRandom: 0, hypermutate: 0, hypermutateSigmaMul: 3 };

    const diversity = populationDiversity(population, this.rng);

    if (!this.enabled) {
      if (best > this.bestEver) this.bestEver = best;
      this.history.push(this._snapshot(generation, diversity));
      return { events, evolveOpts, maxPieces: this.maxPieces };
    }

    // 1) Progress vs stagnation
    const improved = best > this.bestEver * cfg.improveFactor || (this.bestEver <= 0 && best > this.bestEver);
    if (best > this.bestEver) {
      events.push({ type: 'record', data: { best, generation } });
      this.bestEver = best;
    }
    if (improved) {
      this.stagnation = 0;
      const newSigma = Math.max(cfg.sigmaMin, params.mutationSigma * cfg.sigmaDecay);
      if (newSigma !== params.mutationSigma) {
        params.mutationSigma = newSigma;
        events.push({ type: 'sigma-down', data: { sigma: newSigma } });
      }
      // Decay mutation rate back toward its base value.
      params.mutationRate = Math.max(this.baseRate, params.mutationRate * 0.9);
      params.tournamentK = this.baseTournamentK;
      this.lastReason = 'progress';
    } else {
      this.stagnation++;
      if (this.stagnation === cfg.stagnationSoft) {
        params.mutationSigma = Math.min(cfg.sigmaMax, params.mutationSigma * cfg.sigmaBoost);
        params.mutationRate = Math.min(cfg.mutationRateMax, params.mutationRate * cfg.rateBoost);
        params.tournamentK = 2; // lower selection pressure → more exploration
        events.push({
          type: 'sigma-up',
          data: { sigma: params.mutationSigma, rate: params.mutationRate, stagnation: this.stagnation },
        });
        this.lastReason = 'stagnation-soft';
      } else if (this.stagnation > cfg.stagnationSoft && this.stagnation % cfg.stagnationSoft === 0 && this.stagnation < cfg.stagnationHard) {
        params.mutationSigma = Math.min(cfg.sigmaMax, params.mutationSigma * cfg.sigmaBoost);
        events.push({ type: 'sigma-up', data: { sigma: params.mutationSigma, stagnation: this.stagnation } });
        this.lastReason = 'stagnation-soft';
      }
    }

    // 2) Hard stagnation or diversity collapse → diversity injection
    const size = population.length;
    const diversityFloor = cfg.diversityFloor;
    const collapsed = diversity > 0 && diversity < diversityFloor;
    if (this.stagnation >= cfg.stagnationHard || collapsed) {
      evolveOpts.injectRandom = Math.floor(size * cfg.injectRandomFraction);
      evolveOpts.hypermutate = Math.floor(size * cfg.hypermutateFraction);
      events.push({
        type: collapsed && this.stagnation < cfg.stagnationHard ? 'diversity-collapse' : 'injection',
        data: {
          injected: evolveOpts.injectRandom,
          hypermutated: evolveOpts.hypermutate,
          diversity,
          stagnation: this.stagnation,
        },
      });
      this.stagnation = 0;
      this.lastReason = collapsed ? 'diversity-collapse' : 'stagnation-hard';
    }

    // 3) Curriculum: raise the piece cap once the population survives it.
    if (medianPieces >= 0.8 * this.maxPieces && this.maxPieces < cfg.curriculumMax) {
      this.maxPieces = Math.min(cfg.curriculumMax, this.maxPieces + cfg.curriculumStep);
      events.push({ type: 'curriculum-up', data: { maxPieces: this.maxPieces } });
      this.lastReason = 'curriculum';
    }

    this.history.push(this._snapshot(generation, diversity));
    return { events, evolveOpts, maxPieces: this.maxPieces };
  }

  _snapshot(generation, diversity) {
    return {
      generation,
      sigma: this.ga.params.mutationSigma,
      rate: this.ga.params.mutationRate,
      tournamentK: this.ga.params.tournamentK,
      stagnation: this.stagnation,
      diversity,
      maxPieces: this.maxPieces,
      bestEver: this.bestEver,
    };
  }

  /** Serializable state for resumable training sessions. */
  getState() {
    return {
      bestEver: this.bestEver,
      stagnation: this.stagnation,
      maxPieces: this.maxPieces,
      baseSigma: this.baseSigma,
      baseRate: this.baseRate,
      baseTournamentK: this.baseTournamentK,
      history: this.history,
      lastReason: this.lastReason,
      params: { ...this.ga.params },
    };
  }

  setState(state) {
    this.bestEver = state.bestEver;
    this.stagnation = state.stagnation;
    this.maxPieces = state.maxPieces;
    this.baseSigma = state.baseSigma;
    this.baseRate = state.baseRate;
    this.baseTournamentK = state.baseTournamentK;
    this.history = state.history ?? [];
    this.lastReason = state.lastReason ?? null;
    Object.assign(this.ga.params, state.params ?? {});
  }
}
