// Small MLP evaluated forward-only (weights come from the genetic algorithm,
// there is no backprop). Hidden layers use ReLU; the output is linear.
//
// Flat weight layout, layer by layer:
//   for each layer l (in=arch[l], out=arch[l+1]):
//     out×in weights (output-major: all inputs of neuron 0, then neuron 1...)
//     then `out` biases.

/** Total number of parameters for an architecture like [14,24,12,1]. */
export function weightCount(arch) {
  let n = 0;
  for (let l = 0; l < arch.length - 1; l++) n += (arch[l] + 1) * arch[l + 1];
  return n;
}

export class MLP {
  /** @param {number[]} arch e.g. [14, 24, 12, 1] */
  constructor(arch) {
    if (!Array.isArray(arch) || arch.length < 2) throw new Error('invalid architecture');
    this.arch = arch.slice();
    this.weightCount = weightCount(arch);
    // Ping-pong scratch buffers sized to the widest layer: zero allocations per call.
    const widest = Math.max(...arch);
    this._bufA = new Float32Array(widest);
    this._bufB = new Float32Array(widest);
  }

  /**
   * Forward pass. Returns the scalar score (first output neuron).
   * @param {Float32Array} weights flat genome (length === this.weightCount)
   * @param {Float32Array} input length === arch[0]
   */
  forward(weights, input) {
    const arch = this.arch;
    let src = this._bufA;
    let dst = this._bufB;
    src.set(input.subarray(0, arch[0]));
    let offset = 0;
    for (let l = 0; l < arch.length - 1; l++) {
      const nIn = arch[l];
      const nOut = arch[l + 1];
      const biasBase = offset + nOut * nIn;
      const isLast = l === arch.length - 2;
      for (let j = 0; j < nOut; j++) {
        let sum = weights[biasBase + j];
        const wBase = offset + j * nIn;
        for (let i = 0; i < nIn; i++) sum += weights[wBase + i] * src[i];
        dst[j] = isLast ? sum : sum > 0 ? sum : 0; // ReLU on hidden layers
      }
      offset = biasBase + nOut;
      const tmp = src;
      src = dst;
      dst = tmp;
    }
    return src[0];
  }

  /**
   * Forward pass that also records every layer's activations (for the
   * network visualizer). Allocates — UI use only, never in the hot path.
   * @returns {{score:number, activations:Float32Array[]}} activations[0] = input copy
   */
  forwardWithActivations(weights, input) {
    const arch = this.arch;
    const activations = [Float32Array.from(input.subarray(0, arch[0]))];
    let offset = 0;
    for (let l = 0; l < arch.length - 1; l++) {
      const nIn = arch[l];
      const nOut = arch[l + 1];
      const src = activations[l];
      const out = new Float32Array(nOut);
      const biasBase = offset + nOut * nIn;
      const isLast = l === arch.length - 2;
      for (let j = 0; j < nOut; j++) {
        let sum = weights[biasBase + j];
        const wBase = offset + j * nIn;
        for (let i = 0; i < nIn; i++) sum += weights[wBase + i] * src[i];
        out[j] = isLast ? sum : sum > 0 ? sum : 0;
      }
      activations.push(out);
      offset = biasBase + nOut;
    }
    return { score: activations[activations.length - 1][0], activations };
  }

  /**
   * Returns the weight connecting input neuron i (layer l) to output neuron j
   * (layer l+1), and the bias of neuron j. For the visualizer/tooltips.
   */
  getConnection(weights, layer, i, j) {
    const arch = this.arch;
    let offset = 0;
    for (let l = 0; l < layer; l++) offset += (arch[l] + 1) * arch[l + 1];
    const nIn = arch[layer];
    const nOut = arch[layer + 1];
    return {
      weight: weights[offset + j * nIn + i],
      bias: weights[offset + nOut * nIn + j],
    };
  }
}
