// Simulation worker: plays a chunk of the population for one generation.
// Owns one Game per agent (so live boards persist between ticks) and a single
// shared AiPlayer whose weights are swapped per placement.
//
// Protocol (main → worker): evalBatch, setSpeed, pause, resume, abort, inspect
// Protocol (worker → main): ready, frame, agentDone, batchDone
import { Game } from '../game/game.js';
import { AiPlayer } from '../ai/agent.js';
import { gameFitness } from '../ai/fitness.js';
import { unpackGenomes } from '../ai/genome.js';
import { VISIBLE_CELLS } from '../game/constants.js';

const STATS_FIELDS = 8; // [alive, score, lines, pieces, level, combo, fitnessSoFar, seedIdx]

let batch = null; // current generation state
let speed = 1; // 1 | 2 | 4 | 8 | 'max'
let paused = false;
let inspectId = null;
let timer = null;

// MessageChannel-based yield: setTimeout(0) gets clamped in background tabs.
const yieldChannel = new MessageChannel();
let yieldCallback = null;
yieldChannel.port1.onmessage = () => {
  const cb = yieldCallback;
  yieldCallback = null;
  if (cb) cb();
};
function yieldToLoop(cb) {
  yieldCallback = cb;
  yieldChannel.port2.postMessage(0);
}

self.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'evalBatch':
      startBatch(msg);
      break;
    case 'setSpeed':
      speed = msg.speed;
      restartLoop();
      break;
    case 'pause':
      paused = true;
      break;
    case 'resume':
      paused = false;
      restartLoop();
      break;
    case 'abort':
      stopLoop();
      batch = null;
      break;
    case 'inspect':
      inspectId = msg.agentId;
      break;
  }
};

function startBatch(msg) {
  stopLoop();
  const { generation, config, agentIds, genomes, genomeLength } = msg;
  const genomeViews = unpackGenomes(genomes, genomeLength);
  const featureMask = config.featureMask ? new Uint8Array(config.featureMask) : null;

  const player = new AiPlayer({
    arch: config.arch,
    weights: genomeViews[0],
    useHold: config.useHold,
    featureMask,
  });

  const agents = [];
  for (let i = 0; i < agentIds.length; i++) {
    agents.push({
      id: agentIds[i],
      genome: genomeViews[i],
      game: new Game({ seed: config.seeds[0] }),
      seedIdx: 0,
      fitnessSum: 0,
      games: [],
      finished: false,
      pieceAccumulator: 0,
    });
  }

  batch = {
    generation,
    config,
    agents,
    player,
    remaining: agents.length,
    lastFrameAt: 0,
    snapshotScratch: new Uint8Array(VISIBLE_CELLS),
  };
  speed = msg.speed ?? speed;
  paused = false;
  restartLoop();
}

function stopLoop() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function restartLoop() {
  stopLoop();
  if (!batch || paused) return;
  if (speed === 'max') runMaxLoop();
  else runAnimatedLoop();
}

// ── Animated speeds (x1..x8): round-robin, piecesPerSecond = speed × 2 ────

const TICK_MS = 100;

function runAnimatedLoop() {
  const tick = () => {
    if (!batch || paused || speed === 'max') return;
    const piecesPerTick = (Number(speed) * 2 * TICK_MS) / 1000;
    for (const agent of batch.agents) {
      if (agent.finished) continue;
      agent.pieceAccumulator += piecesPerTick;
      while (agent.pieceAccumulator >= 1 && !agent.finished) {
        agent.pieceAccumulator -= 1;
        stepAgent(agent);
      }
    }
    maybeSendFrame(50); // 20 Hz
    if (batch && batch.remaining > 0) {
      timer = setTimeout(tick, TICK_MS);
    } else if (batch) {
      finishBatch();
    }
  };
  timer = setTimeout(tick, TICK_MS);
}

// ── Max speed: continuous simulation in ~40ms slices, yielding via port ───

function runMaxLoop() {
  const slice = () => {
    if (!batch || paused || speed !== 'max') return;
    const deadline = performance.now() + 40;
    outer: while (performance.now() < deadline) {
      let anyActive = false;
      for (const agent of batch.agents) {
        if (agent.finished) continue;
        anyActive = true;
        // A burst per agent amortizes the loop overhead.
        for (let b = 0; b < 8 && !agent.finished; b++) stepAgent(agent);
        if (performance.now() >= deadline) break outer;
      }
      if (!anyActive) break;
    }
    maybeSendFrame(250); // 4 Hz heartbeat in max mode
    if (batch && batch.remaining > 0) yieldToLoop(slice);
    else if (batch) finishBatch();
  };
  yieldToLoop(slice);
}

// ── Per-agent stepping ─────────────────────────────────────────────────────

function stepAgent(agent) {
  const { config, player } = batch;
  const game = agent.game;
  player.setWeights(agent.genome);
  player.playPiece(game);

  const gameEnded =
    game.state !== 'playing' ||
    game.stats.pieces >= config.maxPieces ||
    game.stats.lines >= config.maxLines;
  if (!gameEnded) return;

  const s = game.stats;
  const f = gameFitness(s, config.fitnessCoeffs);
  agent.fitnessSum += f;
  agent.games.push({
    seed: config.seeds[agent.seedIdx],
    fitness: f,
    lines: s.lines,
    pieces: s.pieces,
    score: s.score,
    tetrises: s.tetrises,
    tspins: s.tspins + s.tspinMinis,
    truncated: game.state === 'playing',
  });

  agent.seedIdx++;
  if (agent.seedIdx < config.seeds.length) {
    game.reset(config.seeds[agent.seedIdx]);
    return;
  }

  agent.finished = true;
  batch.remaining--;
  const fitness = agent.fitnessSum / agent.games.length;
  self.postMessage({
    type: 'agentDone',
    agentId: agent.id,
    fitness,
    stats: summarize(agent),
  });
}

function summarize(agent) {
  const n = agent.games.length || 1;
  const sum = (k) => agent.games.reduce((a, g) => a + g[k], 0);
  return {
    meanLines: sum('lines') / n,
    meanPieces: sum('pieces') / n,
    meanScore: sum('score') / n,
    totalTetrises: sum('tetrises'),
    totalTspins: sum('tspins'),
    bestLines: Math.max(...agent.games.map((g) => g.lines), 0),
  };
}

// ── Live snapshots ─────────────────────────────────────────────────────────

function maybeSendFrame(minIntervalMs) {
  if (!batch || !batch.config.live) return;
  const now = performance.now();
  if (now - batch.lastFrameAt < minIntervalMs) return;
  batch.lastFrameAt = now;

  const n = batch.agents.length;
  const grids = new Uint8Array(n * VISIBLE_CELLS);
  const stats = new Float32Array(n * STATS_FIELDS);
  const ids = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const agent = batch.agents[i];
    const game = agent.game;
    ids[i] = agent.id;
    game.getSnapshot(batch.snapshotScratch);
    grids.set(batch.snapshotScratch, i * VISIBLE_CELLS);
    const o = i * STATS_FIELDS;
    const s = game.stats;
    stats[o] = agent.finished ? 0 : 1;
    stats[o + 1] = s.score;
    stats[o + 2] = s.lines;
    stats[o + 3] = s.pieces;
    stats[o + 4] = s.level;
    stats[o + 5] = s.combo;
    stats[o + 6] = agent.fitnessSum / Math.max(1, agent.seedIdx) + (agent.finished ? 0 : partialFitness(agent));
    stats[o + 7] = agent.seedIdx;
  }

  let inspect = null;
  if (inspectId !== null) {
    const agent = batch.agents.find((a) => a.id === inspectId);
    if (agent && !agent.finished && agent.game.state === 'playing') {
      const detail = batch.player // detailed eval of the CURRENT state (pre-decision)
        ? (() => {
            batch.player.setWeights(agent.genome);
            return batch.player.chooseDetailed(agent.game, 5);
          })()
        : null;
      if (detail?.best) {
        inspect = {
          agentId: agent.id,
          best: { useHold: detail.best.useHold, rotation: detail.best.rotation, x: detail.best.x, score: detail.best.score },
          candidates: detail.candidates.map((c) => ({
            useHold: c.useHold,
            rotation: c.rotation,
            x: c.x,
            score: c.score,
            linesCleared: c.linesCleared,
          })),
          totalCandidates: detail.totalCandidates,
          features: detail.best.features,
          activations: detail.activations,
          holdType: agent.game.holdType,
          currentType: agent.game.current?.type ?? 0,
        };
      }
    }
  }

  self.postMessage(
    { type: 'frame', generation: batch.generation, agentIds: ids, grids: grids.buffer, stats: stats.buffer, inspect },
    [grids.buffer, stats.buffer],
  );
}

function partialFitness(agent) {
  const s = agent.game.stats;
  return gameFitness(s, batch.config.fitnessCoeffs) / batch.config.seeds.length;
}

function finishBatch() {
  const results = batch.agents.map((a) => ({
    agentId: a.id,
    fitness: a.fitnessSum / Math.max(1, a.games.length),
    stats: summarize(a),
    games: a.games,
  }));
  const generation = batch.generation;
  stopLoop();
  batch = null;
  self.postMessage({ type: 'batchDone', generation, results });
}

self.postMessage({ type: 'ready' });
