import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MLP, weightCount } from '../src/ai/network.js';
import { createGenome, genomeDistance } from '../src/ai/genome.js';
import { mulberry32 } from '../src/core/rng.js';

test('weightCount matches layer arithmetic', () => {
  assert.equal(weightCount([14, 24, 12, 1]), (14 + 1) * 24 + (24 + 1) * 12 + (12 + 1) * 1);
  assert.equal(weightCount([2, 2]), 6);
});

test('forward computes exact values with hand-set weights', () => {
  // arch [2, 2, 1]: layer0 weights [w00,w01, w10,w11, b0,b1], layer1 [v0,v1, c]
  const net = new MLP([2, 2, 1]);
  const w = new Float32Array([
    1, 0, // neuron 0 ← [1, 0]
    0, 1, // neuron 1 ← [0, 1]
    0.5, -3, // biases
    2, 1, // output ← [2, 1]
    0.25, // output bias
  ]);
  // input [1, 2] → h0 = relu(1 + 0.5) = 1.5; h1 = relu(2 - 3) = 0
  // out = 2·1.5 + 1·0 + 0.25 = 3.25 (linear output)
  const score = net.forward(w, Float32Array.from([1, 2]));
  assert.ok(Math.abs(score - 3.25) < 1e-6);
});

test('forwardWithActivations matches forward and records layers', () => {
  const arch = [14, 24, 12, 1];
  const net = new MLP(arch);
  const rng = mulberry32(7);
  const genome = createGenome(arch, rng);
  const input = new Float32Array(14).map(() => rng());
  const a = net.forward(genome, input);
  const detailed = net.forwardWithActivations(genome, input);
  assert.ok(Math.abs(a - detailed.score) < 1e-6);
  assert.equal(detailed.activations.length, arch.length);
  assert.equal(detailed.activations[0].length, 14);
  assert.equal(detailed.activations[3].length, 1);
});

test('forward is reusable without allocation side effects', () => {
  const net = new MLP([14, 24, 12, 1]);
  const genome = createGenome([14, 24, 12, 1], mulberry32(3));
  const input = new Float32Array(14).fill(0.5);
  const first = net.forward(genome, input);
  for (let i = 0; i < 100; i++) net.forward(genome, input);
  assert.equal(net.forward(genome, input), first);
});

test('getConnection reads the same weights forward uses', () => {
  const net = new MLP([2, 2, 1]);
  const w = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(net.getConnection(w, 0, 0, 0).weight, 1);
  assert.equal(net.getConnection(w, 0, 1, 1).weight, 4);
  assert.equal(net.getConnection(w, 0, 0, 1).bias, 6);
  assert.equal(net.getConnection(w, 1, 1, 0).weight, 8);
  assert.equal(net.getConnection(w, 1, 0, 0).bias, 9);
});

test('genome init is deterministic per seed and biases are zero', () => {
  const a = createGenome([14, 24, 12, 1], mulberry32(42));
  const b = createGenome([14, 24, 12, 1], mulberry32(42));
  const c = createGenome([14, 24, 12, 1], mulberry32(43));
  assert.equal(genomeDistance(a, b), 0);
  assert.ok(genomeDistance(a, c) > 0);
  // First-layer biases live at offset 14*24 .. 14*24+23
  for (let i = 14 * 24; i < 14 * 24 + 24; i++) assert.equal(a[i], 0);
});
