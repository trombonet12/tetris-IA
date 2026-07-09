import { weightCount } from './network.js';
import { FEATURE_VERSION, FEATURE_COUNT } from './features.js';

// Portable model file format (.tetris-model.json). Works in browser and Node
// (btoa/atob are global in both). Weights are base64 of little-endian f32.

export const MODEL_MAGIC = 'TETRIS-IA-MODEL';
export const MODEL_FILE_VERSION = 1;

/** Float32Array → base64 (little-endian, chunked to avoid stack limits). */
export function f32ToB64(arr) {
  const bytes = new Uint8Array(arr.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < arr.length; i++) view.setFloat32(i * 4, arr[i], true);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 → Float32Array (little-endian). */
export function b64ToF32(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/**
 * Serializes a model to a JSON string ready to download.
 * @param {object} model
 * @param {number[]} model.arch
 * @param {Float32Array} model.weights
 * @param {object} [model.meta] name, generation, bestFitness, createdAt,
 *   gaConfig, fitnessHistory, featureMask, notes...
 */
export function serializeModel({ arch, weights, meta = {} }) {
  if (weights.length !== weightCount(arch)) {
    throw new Error('El número de pesos no coincide con la arquitectura');
  }
  return JSON.stringify(
    {
      magic: MODEL_MAGIC,
      version: MODEL_FILE_VERSION,
      arch,
      activation: 'relu',
      featureVersion: FEATURE_VERSION,
      weightsB64: f32ToB64(weights),
      meta,
    },
    null,
    2,
  );
}

/**
 * Parses and validates a model file. Throws Error with a Spanish,
 * user-presentable message on any problem.
 * @returns {{arch:number[], weights:Float32Array, featureVersion:number, meta:object}}
 */
export function parseModel(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('El fichero no es un JSON válido');
  }
  if (data?.magic !== MODEL_MAGIC) {
    throw new Error('El fichero no es un modelo de Tetris IA (cabecera incorrecta)');
  }
  if (data.version !== MODEL_FILE_VERSION) {
    throw new Error(`Versión de modelo no soportada: ${data.version} (se esperaba ${MODEL_FILE_VERSION})`);
  }
  if (!Array.isArray(data.arch) || data.arch.length < 2 || data.arch.some((n) => !Number.isInteger(n) || n < 1 || n > 4096)) {
    throw new Error('Arquitectura de red inválida');
  }
  if (data.arch[0] !== FEATURE_COUNT) {
    throw new Error(`El modelo espera ${data.arch[0]} entradas pero esta versión usa ${FEATURE_COUNT}`);
  }
  if (data.featureVersion !== FEATURE_VERSION) {
    throw new Error(`Versión de features incompatible: ${data.featureVersion} (esta versión usa ${FEATURE_VERSION})`);
  }
  let weights;
  try {
    weights = b64ToF32(data.weightsB64);
  } catch {
    throw new Error('Los pesos del modelo están corruptos (base64 inválido)');
  }
  const expected = weightCount(data.arch);
  if (weights.length !== expected) {
    throw new Error(`Número de pesos incorrecto: ${weights.length} (se esperaban ${expected})`);
  }
  if (!weights.every(Number.isFinite)) {
    throw new Error('Los pesos del modelo contienen valores no finitos');
  }
  return {
    arch: data.arch,
    weights,
    featureVersion: data.featureVersion,
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
  };
}
