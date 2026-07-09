import { dbPut, dbGet, dbGetAll, dbDelete, makeId } from './db.js';

// Models, resumable training sessions and hall-of-fame entries.
// Float32Array survives structured clone, so weights are stored as-is.

// ── Models ─────────────────────────────────────────────────────────────────

/**
 * @param {object} m { name, arch, weights, featureVersion, generation,
 *   bestFitness, gaConfig, fitnessHistory, featureMask, notes, tags,
 *   favorite, sessionId, stats }
 */
export async function saveModel(m) {
  const now = Date.now();
  const record = {
    id: m.id ?? makeId(),
    name: m.name ?? `Modelo gen ${m.generation ?? 0}`,
    createdAt: m.createdAt ?? now,
    updatedAt: now,
    arch: m.arch,
    weights: m.weights,
    featureVersion: m.featureVersion,
    featureMask: m.featureMask ?? null,
    generation: m.generation ?? 0,
    bestFitness: m.bestFitness ?? 0,
    gaConfig: m.gaConfig ?? null,
    fitnessHistory: m.fitnessHistory ?? [],
    sessionId: m.sessionId ?? null,
    notes: m.notes ?? '',
    tags: m.tags ?? [],
    favorite: m.favorite ?? false,
    stats: m.stats ?? { gamesWatched: 0, bestLines: 0, totalLines: 0, totalGames: 0 },
  };
  await dbPut('models', record);
  return record;
}

export function getModel(id) {
  return dbGet('models', id);
}

export function listModels() {
  return dbGetAll('models');
}

export function deleteModel(id) {
  return dbDelete('models', id);
}

export async function updateModel(id, patch) {
  const model = await dbGet('models', id);
  if (!model) return null;
  Object.assign(model, patch, { updatedAt: Date.now() });
  await dbPut('models', model);
  return model;
}

// ── Training sessions (resumable) ──────────────────────────────────────────

/**
 * @param {object} s { name, generation, population: Float32Array[], arch,
 *   gaConfig, gaParams, tunerState, masterSeed, fitnessHistory, eventLog,
 *   bestGenome, bestFitness }
 */
export async function saveSession(s) {
  const now = Date.now();
  const record = {
    id: s.id ?? makeId(),
    name: s.name ?? 'Sesión sin nombre',
    createdAt: s.createdAt ?? now,
    updatedAt: now,
    generation: s.generation,
    arch: s.arch,
    population: s.population,
    gaConfig: s.gaConfig,
    gaParams: s.gaParams,
    tunerState: s.tunerState,
    masterSeed: s.masterSeed,
    featureMask: s.featureMask ?? null,
    useHold: s.useHold ?? true,
    fitnessHistory: s.fitnessHistory ?? [],
    eventLog: s.eventLog ?? [],
    bestGenome: s.bestGenome ?? null,
    bestFitness: s.bestFitness ?? 0,
  };
  await dbPut('sessions', record);
  return record;
}

export function getSession(id) {
  return dbGet('sessions', id);
}

export function listSessions() {
  return dbGetAll('sessions');
}

export function deleteSession(id) {
  return dbDelete('sessions', id);
}

// ── Hall of Fame ───────────────────────────────────────────────────────────

export async function saveHallOfFameEntry(entry) {
  const record = {
    id: entry.id ?? makeId(),
    createdAt: Date.now(),
    sessionId: entry.sessionId ?? null,
    sessionName: entry.sessionName ?? '',
    generation: entry.generation,
    fitness: entry.fitness,
    arch: entry.arch,
    weights: entry.weights,
    featureVersion: entry.featureVersion,
    featureMask: entry.featureMask ?? null,
    stats: entry.stats ?? null,
  };
  await dbPut('hallOfFame', record);
  return record;
}

export function listHallOfFame() {
  return dbGetAll('hallOfFame');
}

export function deleteHallOfFameEntry(id) {
  return dbDelete('hallOfFame', id);
}

// ── Replays (normal mode) ──────────────────────────────────────────────────

/**
 * @param {object} r { mode, seed, inputs: [{t, action}], stats, config }
 */
export async function saveReplay(r) {
  const record = {
    id: r.id ?? makeId(),
    createdAt: Date.now(),
    mode: r.mode,
    seed: r.seed,
    inputs: r.inputs,
    stats: r.stats,
    config: r.config ?? null,
    label: r.label ?? '',
  };
  await dbPut('replays', record);
  return record;
}

export function getReplay(id) {
  return dbGet('replays', id);
}

export function listReplays() {
  return dbGetAll('replays');
}

export function deleteReplay(id) {
  return dbDelete('replays', id);
}
