import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, splitmix32, deriveSeed, gaussian, rngInt, shuffle } from '../src/core/rng.js';

test('mulberry32: same seed produces the same sequence', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 100; i++) {
    assert.equal(a(), b());
  }
});

test('mulberry32: different seeds produce different sequences', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('mulberry32: outputs are floats in [0, 1)', () => {
  const rng = mulberry32(987654321);
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    assert.ok(v >= 0, `value ${v} < 0`);
    assert.ok(v < 1, `value ${v} >= 1`);
  }
});

test('splitmix32: same seed produces the same uint32 sequence', () => {
  const a = splitmix32(42);
  const b = splitmix32(42);
  for (let i = 0; i < 50; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
  }
});

test('deriveSeed: deterministic for the same base and salts', () => {
  assert.equal(deriveSeed(1234, 5, 6), deriveSeed(1234, 5, 6));
  assert.equal(deriveSeed(0xdeadbeef), deriveSeed(0xdeadbeef));
});

test('deriveSeed: sensitive to salts', () => {
  const base = 777;
  assert.notEqual(deriveSeed(base, 1), deriveSeed(base, 2));
  assert.notEqual(deriveSeed(base, 1, 2), deriveSeed(base, 2, 1));
  assert.notEqual(deriveSeed(base), deriveSeed(base, 0));
});

test('deriveSeed: result differs from base even with no salts', () => {
  for (const s of [0, 1, 42, 0xffffffff]) {
    assert.notEqual(deriveSeed(s), s >>> 0);
  }
});

test('deriveSeed: returns a uint32', () => {
  for (const s of [0, 1, 999999, 0xffffffff]) {
    const v = deriveSeed(s, 3, 7);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
  }
});

test('rngInt: respects [min, max] inclusive and hits both bounds', () => {
  const rng = mulberry32(2024);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = rngInt(rng, 2, 7);
    assert.ok(v >= 2 && v <= 7, `value ${v} out of [2, 7]`);
    assert.ok(Number.isInteger(v));
    seen.add(v);
  }
  for (let expected = 2; expected <= 7; expected++) {
    assert.ok(seen.has(expected), `never produced ${expected}`);
  }
});

test('rngInt: min === max always returns min', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) assert.equal(rngInt(rng, 5, 5), 5);
});

test('shuffle: is a deterministic permutation', () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const a = shuffle(original.slice(), mulberry32(99));
  const b = shuffle(original.slice(), mulberry32(99));
  // Deterministic: same rng seed, same result.
  assert.deepEqual(a, b);
  // Permutation: same multiset of elements.
  assert.deepEqual(a.slice().sort((x, y) => x - y), original);
  // In place: returns the same array reference.
  const arr = [1, 2, 3];
  assert.equal(shuffle(arr, mulberry32(5)), arr);
});

test('shuffle: different seeds give different orders (on a big enough array)', () => {
  const original = Array.from({ length: 20 }, (_, i) => i);
  const a = shuffle(original.slice(), mulberry32(1));
  const b = shuffle(original.slice(), mulberry32(2));
  assert.notDeepEqual(a, b);
});

test('gaussian: mean ~0 and std ~1 over 10000 samples', () => {
  const rng = mulberry32(31337);
  const n = 10000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = gaussian(rng);
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const std = Math.sqrt(sumSq / n - mean * mean);
  // Wide tolerances: this checks sanity, not statistical purity.
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean} too far from 0`);
  assert.ok(Math.abs(std - 1) < 0.05, `std ${std} too far from 1`);
});

test('gaussian: deterministic given the same rng seed', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 20; i++) assert.equal(gaussian(a), gaussian(b));
});
