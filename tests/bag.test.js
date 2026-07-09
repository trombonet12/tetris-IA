import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SevenBag } from '../src/game/bag.js';
import { mulberry32 } from '../src/core/rng.js';
import { ALL_TYPES } from '../src/game/pieces.js';

const SORTED_TYPES = [1, 2, 3, 4, 5, 6, 7];

test('every run of 7 pieces contains exactly the types 1..7', () => {
  const bag = new SevenBag(mulberry32(123));
  for (let run = 0; run < 20; run++) {
    const batch = [];
    for (let i = 0; i < 7; i++) batch.push(bag.next());
    assert.deepEqual(
      batch.slice().sort((a, b) => a - b),
      SORTED_TYPES,
      `run ${run} was not a permutation of 1..7: [${batch}]`,
    );
  }
});

test('ALL_TYPES is exactly the 7 piece ids', () => {
  assert.deepEqual(ALL_TYPES.slice().sort((a, b) => a - b), SORTED_TYPES);
});

test('peek(n) does not consume and matches the following next() calls', () => {
  const bag = new SevenBag(mulberry32(456));
  const preview = bag.peek(10); // spans two bags
  assert.equal(preview.length, 10);
  // Peeking again returns the same thing (nothing consumed).
  assert.deepEqual(bag.peek(10), preview);
  // next() returns exactly the peeked sequence.
  for (let i = 0; i < 10; i++) {
    assert.equal(bag.next(), preview[i], `next() #${i} diverged from peek`);
  }
});

test('peek after consuming stays consistent', () => {
  const bag = new SevenBag(mulberry32(789));
  bag.next();
  bag.next();
  const preview = bag.peek(5);
  for (let i = 0; i < 5; i++) assert.equal(bag.next(), preview[i]);
});

test('reproducible: same seed yields identical sequences', () => {
  const a = new SevenBag(mulberry32(2025));
  const b = new SevenBag(mulberry32(2025));
  for (let i = 0; i < 70; i++) assert.equal(a.next(), b.next());
});

test('different seeds yield different orders eventually', () => {
  const a = new SevenBag(mulberry32(1));
  const b = new SevenBag(mulberry32(2));
  const seqA = Array.from({ length: 21 }, () => a.next());
  const seqB = Array.from({ length: 21 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});
