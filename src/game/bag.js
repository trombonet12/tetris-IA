import { shuffle } from '../core/rng.js';
import { ALL_TYPES } from './pieces.js';

/** Guideline 7-bag randomizer: every run of 7 pieces contains each type once. */
export class SevenBag {
  /** @param {() => number} rng float rng in [0,1) */
  constructor(rng) {
    this.rng = rng;
    this.queue = [];
  }

  _refill() {
    this.queue.push(...shuffle(ALL_TYPES.slice(), this.rng));
  }

  next() {
    if (this.queue.length === 0) this._refill();
    return this.queue.shift();
  }

  /** Returns the next n piece types without consuming them. */
  peek(n) {
    while (this.queue.length < n) this._refill();
    return this.queue.slice(0, n);
  }
}
