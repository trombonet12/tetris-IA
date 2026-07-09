import { packGenomes } from '../ai/genome.js';
import { VISIBLE_CELLS } from '../game/constants.js';

export const STATS_FIELDS = 9; // matches sim-worker.js: [alive,score,lines,pieces,level,combo,fitnessSoFar,seedIdx,tetrises]

/**
 * Main-thread orchestrator: spreads the population across a pool of module
 * workers, forwards control messages and aggregates per-generation results.
 *
 * Callbacks (assign before runGeneration):
 *   onFrame({agentIds, grids: Uint8Array, stats: Float32Array, inspect})
 *   onAgentDone({agentId, fitness, stats})
 */
export class TrainingPool {
  constructor({ workerCount } = {}) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.workerCount = workerCount ?? Math.max(1, Math.min(cores - 1, 8));
    this.workers = [];
    this.onFrame = null;
    this.onAgentDone = null;
    this._pending = null;
  }

  async init() {
    const readiness = [];
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
      readiness.push(
        new Promise((resolve) => {
          const onReady = (e) => {
            if (e.data?.type === 'ready') {
              worker.removeEventListener('message', onReady);
              resolve();
            }
          };
          worker.addEventListener('message', onReady);
        }),
      );
      worker.addEventListener('message', (e) => this._handleMessage(e.data));
      worker.addEventListener('error', (e) => {
        console.error('sim-worker error:', e.message, e);
        this._pending?.reject?.(new Error(`Worker error: ${e.message}`));
        this._pending = null;
      });
      this.workers.push(worker);
    }
    await Promise.all(readiness);
    return this;
  }

  /**
   * Evaluates a full population for one generation.
   * @returns {Promise<Array<{agentId:number, fitness:number, stats:object, games:object[]}>>}
   *   resolved results are sorted by agentId (= population index).
   */
  runGeneration({
    generation,
    population,
    arch,
    seeds,
    maxPieces,
    maxLines,
    fitnessCoeffs,
    useHold = true,
    featureMask = null,
    speed = 1,
    live = true,
  }) {
    if (this._pending) throw new Error('generation already running');
    const size = population.length;
    const genomeLength = population[0].length;
    const chunkSize = Math.ceil(size / this.workers.length);

    return new Promise((resolve, reject) => {
      this._pending = {
        resolve,
        reject,
        results: [],
        remainingWorkers: 0,
        generation,
      };

      for (let w = 0; w < this.workers.length; w++) {
        const start = w * chunkSize;
        if (start >= size) break;
        const end = Math.min(size, start + chunkSize);
        const chunk = population.slice(start, end);
        const agentIds = new Uint16Array(end - start);
        for (let i = 0; i < agentIds.length; i++) agentIds[i] = start + i;
        const packed = packGenomes(chunk);
        this._pending.remainingWorkers++;
        this.workers[w].postMessage(
          {
            type: 'evalBatch',
            generation,
            agentIds,
            genomes: packed.buffer,
            genomeLength,
            speed,
            config: {
              arch,
              seeds: Uint32Array.from(seeds),
              maxPieces,
              maxLines,
              fitnessCoeffs,
              useHold,
              featureMask: featureMask ? Uint8Array.from(featureMask) : null,
              live,
            },
          },
          [packed.buffer],
        );
      }
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'frame':
        if (this.onFrame) {
          this.onFrame({
            generation: msg.generation,
            agentIds: msg.agentIds,
            grids: new Uint8Array(msg.grids),
            stats: new Float32Array(msg.stats),
            inspect: msg.inspect,
            cellsPerBoard: VISIBLE_CELLS,
          });
        }
        break;
      case 'agentDone':
        this.onAgentDone?.(msg);
        break;
      case 'batchDone': {
        const pending = this._pending;
        if (!pending || msg.generation !== pending.generation) return;
        pending.results.push(...msg.results);
        pending.remainingWorkers--;
        if (pending.remainingWorkers === 0) {
          pending.results.sort((a, b) => a.agentId - b.agentId);
          this._pending = null;
          pending.resolve(pending.results);
        }
        break;
      }
    }
  }

  _broadcast(msg) {
    for (const w of this.workers) w.postMessage(msg);
  }

  setSpeed(speed) {
    this._broadcast({ type: 'setSpeed', speed });
  }

  pause() {
    this._broadcast({ type: 'pause' });
  }

  resume() {
    this._broadcast({ type: 'resume' });
  }

  abort() {
    this._broadcast({ type: 'abort' });
    if (this._pending) {
      this._pending.reject(new Error('aborted'));
      this._pending = null;
    }
  }

  /** agentId or null. Only the worker owning that agent will answer. */
  inspect(agentId) {
    this._broadcast({ type: 'inspect', agentId });
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this._pending = null;
  }
}
