// Deterministic PRNG utilities. Game logic must never use Math.random():
// every game, agent and evaluation seed derives from a master seed so that
// replays, training runs and model benchmarks are fully reproducible.

/** Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a function producing uint32 values. Used to derive child seeds. */
export function splitmix32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Deterministically combines a base seed with salts into a new uint32 seed. */
export function deriveSeed(base, ...salts) {
  let s = base >>> 0;
  for (const salt of salts) {
    const mix = splitmix32((s ^ (salt >>> 0)) >>> 0);
    s = mix();
  }
  // One extra scramble so deriveSeed(x) !== x even with no salts.
  return splitmix32(s)();
}

/** Standard normal via Box-Muller. No spare caching: strict determinism. */
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng(); // avoid log(0)
  const v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Integer in [min, max] inclusive. */
export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher-Yates shuffle in place using the given rng. */
export function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/** Random uint32 suitable as a master seed (UI only; not used in game logic). */
export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
