// Central defaults. UI settings override these at runtime (settings-store).

export const GAME_DEFAULTS = {
  startLevel: 1,
  levelUpLines: 10, // lines per level
  maxLevel: 20,
  previewCount: 5, // next queue length shown (1..6)
  lockDelayMs: 500,
  maxLockResets: 15, // move-reset cap (replenishes on reaching a new lowest row)
  softDropFactor: 20, // SDF: gravity multiplier while soft-dropping
  holdEnabled: true,
  ghostEnabled: true,
  zen: false, // no game over: board resets instead
};

export const INPUT_DEFAULTS = {
  dasMs: 150, // delayed auto shift
  arrMs: 30, // auto repeat rate (0 = instant to wall)
};

export const DEFAULT_KEYBINDS = {
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  softDrop: 'ArrowDown',
  hardDrop: 'Space',
  rotateCW: 'ArrowUp',
  rotateCCW: 'KeyZ',
  rotate180: 'KeyA',
  hold: 'KeyC',
  pause: 'Escape',
  restart: 'KeyR',
};

export const AI_DEFAULTS = {
  arch: [14, 24, 12, 1], // input features → hidden → hidden → score
  useHold: true, // agent may also evaluate placements of the held/next piece
};

export const GA_DEFAULTS = {
  populationSize: 60, // 10..100
  eliteFraction: 0.05,
  tournamentK: 3, // 2..8
  crossoverOp: 'uniform', // 'uniform' | 'blx' | 'none'
  crossoverRate: 0.85,
  blxAlpha: 0.3,
  mutationRate: 0.05, // per-gene probability
  mutationSigma: 0.1, // gaussian std dev
  geneResetRate: 0.01, // chance a mutation re-randomizes the gene entirely
  seedsPerEval: 3, // games per agent per generation (fitness = mean)
  maxLines: 300, // stop a game early: the agent already "won"
  // Fitness coefficients (editable in UI)
  fitness: {
    lines: 10,
    tetrises: 40,
    tspins: 25,
    pieces: 0.5,
    scoreSqrt: 0.1,
  },
};

export const TUNER_DEFAULTS = {
  enabled: true,
  sigmaMin: 0.02,
  sigmaMax: 0.5,
  mutationRateMax: 0.3,
  improveFactor: 1.01, // best > bestEver * factor counts as progress
  sigmaDecay: 0.95, // on progress
  sigmaBoost: 1.5, // on stagnation
  rateBoost: 1.25,
  stagnationSoft: 5, // generations without progress → widen search
  stagnationHard: 12, // → diversity injection
  diversityFloor: 0.05, // × sqrt(genomeLength); below → forced injection
  injectRandomFraction: 0.2, // worst X% replaced by fresh genomes
  hypermutateFraction: 0.2, // mid X% hypermutated (sigma × 3)
  // Curriculum: cap on pieces per game, grows as the population improves
  curriculumStart: 200,
  curriculumStep: 100,
  curriculumMax: 2000,
};

export const TRAINING_DEFAULTS = {
  autoSaveEveryGens: 10,
  sessionAutoSaveEveryGens: 5,
  hallOfFameEveryGens: 25,
  snapshotHz: 20, // live board snapshots from workers
};
