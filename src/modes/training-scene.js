import { TrainingPool, STATS_FIELDS } from '../workers/worker-pool.js';
import { GeneticAlgorithm } from '../ai/ga.js';
import { AutoTuner } from '../ai/auto-tuner.js';
import { MLP, weightCount } from '../ai/network.js';
import { FEATURE_COUNT, FEATURE_LABELS_ES, FEATURE_VERSION } from '../ai/features.js';
import { AgentGridRenderer } from '../ui/grid-renderer.js';
import { LineChart } from '../ui/charts.js';
import { NetworkViz } from '../ui/nn-viz.js';
import { el, button, modal, confirmModal, promptModal, fieldRow, slider, select, checkbox, numberInput, tabBar, toast, formatNumber } from '../ui/dom.js';
import { STR, fmt } from '../ui/strings.es.js';
import { mulberry32, deriveSeed, randomSeed } from '../core/rng.js';
import { GA_DEFAULTS, TRAINING_DEFAULTS, AI_DEFAULTS } from '../core/config.js';
import { saveModel, listModels, saveSession, listSessions, deleteSession, saveHallOfFameEntry } from '../storage/model-store.js';
import { loadTrainingPresets, saveTrainingPresets } from '../storage/settings-store.js';
import { downloadText, toCsv } from '../storage/file-io.js';
import { VISIBLE_CELLS, BOARD_WIDTH } from '../game/constants.js';

const BUILTIN_PRESETS = {
  fast: { populationSize: 30, seedsPerEval: 1, hidden: [16], mutationSigma: 0.12 },
  balanced: { populationSize: 60, seedsPerEval: 3, hidden: [24, 12], mutationSigma: 0.1 },
  deep: { populationSize: 100, seedsPerEval: 3, hidden: [24, 12], mutationSigma: 0.08 },
};

function defaultCfg() {
  return {
    populationSize: GA_DEFAULTS.populationSize,
    eliteFraction: GA_DEFAULTS.eliteFraction,
    tournamentK: GA_DEFAULTS.tournamentK,
    mutationRate: GA_DEFAULTS.mutationRate,
    mutationSigma: GA_DEFAULTS.mutationSigma,
    crossoverOp: GA_DEFAULTS.crossoverOp,
    crossoverRate: GA_DEFAULTS.crossoverRate,
    seedsPerEval: GA_DEFAULTS.seedsPerEval,
    masterSeed: randomSeed(),
    hidden: [24, 12],
    fitness: { ...GA_DEFAULTS.fitness },
    useHold: AI_DEFAULTS.useHold,
    featureMask: Array(FEATURE_COUNT).fill(1),
    sessionName: `Sesión ${new Date().toLocaleDateString('es-ES')}`,
    autoSaveEveryGens: TRAINING_DEFAULTS.autoSaveEveryGens,
    maxGenerations: 0, // 0 = no limit
    targetFitness: 0, // 0 = none
  };
}

export class TrainingScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.cfg = defaultCfg();
    this.running = false;
    this.paused = false;
    this.view = 'config';
    this._charts = [];
    this._beforeUnload = (e) => {
      if (this.running) {
        e.preventDefault();
        e.returnValue = STR.training.leaveWarning;
      }
    };
  }

  enter() {
    window.addEventListener('beforeunload', this._beforeUnload);
    this._showConfig();
  }

  exit() {
    window.removeEventListener('beforeunload', this._beforeUnload);
    this._stopEverything();
  }

  async canLeave() {
    if (!this.running) return true;
    const ok = await confirmModal(STR.training.leaveWarning, { danger: true });
    if (ok) this._stopEverything();
    return ok;
  }

  _stopEverything() {
    this.running = false;
    try {
      this.pool?.abort();
    } catch {
      /* already stopped */
    }
    this.pool?.dispose();
    this.pool = null;
    for (const c of this._charts) c.destroy?.();
    this._charts = [];
    this.nnViz?.destroy();
    this.nnViz = null;
  }

  get arch() {
    return [FEATURE_COUNT, ...this.cfg.hidden, 1];
  }

  // ═══════════════════════════════════ CONFIG VIEW ══════════════════════════

  _showConfig(restored = null) {
    this.view = 'config';
    const t = STR.training;
    const cfg = this.cfg;
    const { root } = this.ctx;
    root.innerHTML = '';

    const weightsInfo = el('span', { class: 'field-hint' }, fmt(t.weightsTotal, { n: weightCount(this.arch) }));
    const refreshWeights = () => (weightsInfo.textContent = fmt(t.weightsTotal, { n: weightCount(this.arch) }));

    // Evolution column
    const evolutionCol = el(
      'div',
      { class: 'col', style: { flex: '1' } },
      el('div', { class: 'panel-title' }, t.evolution),
      fieldRow(t.population, slider({ min: 10, max: 100, step: 10, value: cfg.populationSize, format: String, onChange: (v) => (cfg.populationSize = v) }), cfg.populationSize > 60 ? t.populationWarning : null),
      fieldRow(t.elitism, slider({ min: 0, max: 20, step: 1, value: Math.round(cfg.eliteFraction * 100), format: (v) => `${v}%`, onChange: (v) => (cfg.eliteFraction = v / 100) })),
      fieldRow(t.tournament, slider({ min: 2, max: 8, step: 1, value: cfg.tournamentK, format: String, onChange: (v) => (cfg.tournamentK = v) })),
      fieldRow(t.mutationRate, slider({ min: 0.01, max: 0.3, step: 0.01, value: cfg.mutationRate, format: (v) => v.toFixed(2), onChange: (v) => (cfg.mutationRate = v) })),
      fieldRow(t.mutationSigma, slider({ min: 0.02, max: 0.5, step: 0.01, value: cfg.mutationSigma, format: (v) => v.toFixed(2), onChange: (v) => (cfg.mutationSigma = v) })),
      fieldRow(t.crossover, select({ options: Object.entries(t.crossoverOps), value: cfg.crossoverOp, onChange: (v) => (cfg.crossoverOp = v) })),
      fieldRow(t.crossoverRate, slider({ min: 0, max: 1, step: 0.05, value: cfg.crossoverRate, format: (v) => v.toFixed(2), onChange: (v) => (cfg.crossoverRate = v) })),
      fieldRow(
        t.masterSeed,
        el(
          'div',
          { class: 'row' },
          numberInput({ min: 0, max: 4294967295, value: cfg.masterSeed, width: '140px', onChange: (v) => (cfg.masterSeed = v >>> 0) }),
          button(t.randomSeed, () => {
            cfg.masterSeed = randomSeed();
            this._showConfig();
          }),
        ),
      ),
      fieldRow(t.seedsPerEval, slider({ min: 1, max: 5, step: 1, value: cfg.seedsPerEval, format: String, onChange: (v) => (cfg.seedsPerEval = v) })),
      fieldRow(t.autoSave, numberInput({ min: 1, max: 100, value: cfg.autoSaveEveryGens, onChange: (v) => (cfg.autoSaveEveryGens = v) })),
      el('div', { class: 'panel-title', style: { marginTop: '10px' } }, t.stopConditions),
      fieldRow(t.maxGenerations, numberInput({ min: 0, max: 100000, value: cfg.maxGenerations, onChange: (v) => (cfg.maxGenerations = v) }), t.noLimit),
      fieldRow(t.targetFitness, numberInput({ min: 0, max: 10000000, value: cfg.targetFitness, onChange: (v) => (cfg.targetFitness = v) }), t.noLimit),
    );

    // Agent & fitness column
    const featureBoxes = FEATURE_LABELS_ES.map((label, i) =>
      checkbox({
        checked: !!cfg.featureMask[i],
        label,
        onChange: (v) => {
          const active = cfg.featureMask.reduce((a, b) => a + b, 0);
          if (!v && active <= 3) {
            toast('Mínimo 3 features activas', 'error');
            this._showConfig();
            return;
          }
          cfg.featureMask[i] = v ? 1 : 0;
        },
      }),
    );

    const layerControls = el('div', { class: 'row', style: { flexWrap: 'wrap' } });
    const rebuildLayers = () => {
      layerControls.innerHTML = '';
      layerControls.append(
        el('span', { class: 'field-hint' }, `${t.hiddenLayers}:`),
        numberInput({
          min: 0,
          max: 3,
          value: cfg.hidden.length,
          width: '58px',
          onChange: (v) => {
            while (cfg.hidden.length < v) cfg.hidden.push(12);
            cfg.hidden.length = v;
            rebuildLayers();
            refreshWeights();
          },
        }),
        ...cfg.hidden.map((n, i) =>
          numberInput({
            min: 4,
            max: 64,
            value: n,
            width: '58px',
            onChange: (v) => {
              cfg.hidden[i] = v;
              refreshWeights();
            },
          }),
        ),
        weightsInfo,
      );
    };
    rebuildLayers();

    const agentCol = el(
      'div',
      { class: 'col', style: { flex: '1' } },
      el('div', { class: 'panel-title' }, t.agentCol),
      el('div', { class: 'panel-title', style: { marginTop: '4px' } }, t.inputFeatures),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' } }, featureBoxes),
      el('div', { class: 'panel-title', style: { marginTop: '12px' } }, t.architecture),
      layerControls,
      fieldRow(t.useHold, checkbox({ checked: cfg.useHold, onChange: (v) => (cfg.useHold = v) })),
      el('div', { class: 'panel-title', style: { marginTop: '12px' } }, t.fitnessWeights),
      ...Object.keys(cfg.fitness).map((key) =>
        fieldRow(t.fitnessKeys[key] ?? key, numberInput({ min: 0, max: 1000, step: 0.1, value: cfg.fitness[key], onChange: (v) => (cfg.fitness[key] = v) })),
      ),
    );

    // Presets + session bar
    const presetButtons = el(
      'div',
      { class: 'row', style: { flexWrap: 'wrap' } },
      ...Object.entries(BUILTIN_PRESETS).map(([id, preset]) =>
        button(t.presetNames[id], () => {
          Object.assign(cfg, preset, { hidden: [...preset.hidden] });
          this._showConfig();
          toast(`${t.presets}: ${t.presetNames[id]}`, 'ok');
        }),
      ),
      ...loadTrainingPresets().map((p) =>
        button(p.name, () => {
          Object.assign(cfg, structuredClone(p.cfg));
          this._showConfig();
        }, 'btn-ghost'),
      ),
      button(t.savePreset, async () => {
        const name = await promptModal(t.presetName);
        if (!name) return;
        const presets = loadTrainingPresets().filter((p) => p.name !== name);
        presets.push({ name, cfg: structuredClone({ ...cfg, featureMask: [...cfg.featureMask], hidden: [...cfg.hidden] }) });
        saveTrainingPresets(presets);
        this._showConfig();
      }, 'btn-ghost'),
    );

    const sessionInput = el('input', { class: 'input', value: cfg.sessionName, style: { width: '240px' }, oninput: () => (cfg.sessionName = sessionInput.value) });

    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar' },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, t.configTitle),
        el('span', { class: 'spacer' }),
        el('span', { class: 'field-hint' }, t.sessionName),
        sessionInput,
      ),
      el('div', { class: 'panel', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, el('span', { class: 'panel-title', style: { margin: 0 } }, t.presets), presetButtons),
      el('div', { class: 'panel scrollable', style: { flex: '1' } }, el('div', { class: 'row', style: { alignItems: 'flex-start' } }, evolutionCol, agentCol)),
      el(
        'div',
        { class: 'panel row' },
        button(t.warmStart, () => this._pickWarmStart()),
        button(t.resumeSession, () => this._pickSession()),
        el('span', { class: 'spacer' }),
        button(t.start, () => this._start(restored), 'btn-primary btn-big'),
      ),
    );
    root.append(this.el);
  }

  async _pickWarmStart() {
    const models = await listModels().catch(() => []);
    if (models.length === 0) {
      toast(STR.watch.empty, 'error');
      return;
    }
    const list = el(
      'div',
      { class: 'col' },
      models.map((m) =>
        button(`${m.name} · gen ${m.generation} · ${formatNumber(m.bestFitness)}`, () => {
          this._warmStartModel = m;
          this.cfg.hidden = m.arch.slice(1, -1);
          if (m.featureMask) this.cfg.featureMask = Array.from(m.featureMask);
          picker.close();
          this._showConfig();
          toast(`${STR.training.warmStart} ${m.name}`, 'ok');
        }, 'btn-ghost'),
      ),
      button(STR.training.warmStartNone, () => {
        this._warmStartModel = null;
        picker.close();
      }),
    );
    const picker = modal({ title: STR.training.warmStart, content: list, buttons: [{ label: STR.common.cancel, cls: 'btn-ghost' }] });
  }

  async _pickSession() {
    const sessions = await listSessions().catch(() => []);
    if (sessions.length === 0) {
      toast(STR.common.none, 'error');
      return;
    }
    const list = el(
      'div',
      { class: 'col' },
      sessions
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((s) =>
          el(
            'div',
            { class: 'row' },
            button(`${s.name} · gen ${s.generation} · ${new Date(s.updatedAt).toLocaleString('es-ES')}`, () => {
              picker.close();
              this._resumeSession(s);
            }, 'btn-ghost'),
            button('✕', async () => {
              await deleteSession(s.id);
              picker.close();
              this._pickSession();
            }, 'btn-icon btn-danger'),
          ),
        ),
    );
    const picker = modal({ title: STR.training.resumeSession, content: list, buttons: [{ label: STR.common.cancel, cls: 'btn-ghost' }] });
  }

  _resumeSession(s) {
    this.cfg = { ...defaultCfg(), ...structuredClone(s.gaConfig), sessionName: s.name, masterSeed: s.masterSeed };
    this.cfg.hidden = s.arch.slice(1, -1);
    if (s.featureMask) this.cfg.featureMask = Array.from(s.featureMask);
    this._start({
      population: s.population.map((g) => Float32Array.from(g)),
      generation: s.generation,
      tunerState: s.tunerState,
      gaParams: s.gaParams,
      fitnessHistory: s.fitnessHistory ?? [],
      eventLog: s.eventLog ?? [],
      bestGenome: s.bestGenome ? Float32Array.from(s.bestGenome) : null,
      bestFitness: s.bestFitness ?? 0,
      sessionId: s.id,
    });
  }

  // ═══════════════════════════════════ TRAINING ═════════════════════════════

  async _start(restored = null) {
    const cfg = this.cfg;
    const arch = this.arch;
    this.gaRng = mulberry32(deriveSeed(cfg.masterSeed, 1));
    this.ga = new GeneticAlgorithm({
      arch,
      rng: this.gaRng,
      config: {
        eliteFraction: cfg.eliteFraction,
        tournamentK: cfg.tournamentK,
        crossoverOp: cfg.crossoverOp,
        crossoverRate: cfg.crossoverRate,
        mutationRate: cfg.mutationRate,
        mutationSigma: cfg.mutationSigma,
        fitness: cfg.fitness,
      },
    });
    this.tuner = new AutoTuner({ ga: this.ga, rng: mulberry32(deriveSeed(cfg.masterSeed, 2)) });

    if (restored) {
      this.population = restored.population;
      this.generation = restored.generation;
      this.tuner.setState(restored.tunerState);
      if (restored.gaParams) Object.assign(this.ga.params, restored.gaParams);
      this.fitnessHistory = restored.fitnessHistory;
      this.eventLog = restored.eventLog;
      this.bestGenome = restored.bestGenome;
      this.bestFitness = restored.bestFitness;
      this.sessionId = restored.sessionId ?? null;
    } else {
      this.population = this._warmStartModel
        ? this.ga.createPopulationFrom(this._warmStartModel.weights, cfg.populationSize)
        : this.ga.createPopulation(cfg.populationSize);
      this.generation = 0;
      this.fitnessHistory = [];
      this.eventLog = [];
      this.bestGenome = null;
      this.bestFitness = -Infinity;
      this.sessionId = null;
    }

    this.featureMask = Uint8Array.from(this.cfg.featureMask);
    this.speed = 4;
    this.paused = false;
    this.singleStep = false;
    this.running = true;
    this.agentsDone = 0;
    this.piecesCounter = { total: 0, lastTotal: 0, lastTime: performance.now(), pps: 0 };
    this.genDurations = [];
    this.heatmapCounts = new Uint32Array(VISIBLE_CELLS);
    this.inspectedId = null;
    this.gridSort = 'index';

    this._showDashboard();

    this.pool = new TrainingPool();
    await this.pool.init();
    this.pool.onFrame = (frame) => this._onFrame(frame);
    this.pool.onAgentDone = () => {
      this.agentsDone++;
    };

    this._runLoop();
  }

  async _runLoop() {
    const t = STR.training;
    const cfg = this.cfg;
    while (this.running) {
      const genStart = performance.now();
      this.agentsDone = 0;
      const seeds = Array.from({ length: cfg.seedsPerEval }, (_, i) => deriveSeed(cfg.masterSeed, 1000 + this.generation, i));
      let results;
      try {
        results = await this.pool.runGeneration({
          generation: this.generation,
          population: this.population,
          arch: this.arch,
          seeds,
          maxPieces: this.tuner.maxPieces,
          maxLines: GA_DEFAULTS.maxLines,
          fitnessCoeffs: cfg.fitness,
          useHold: cfg.useHold,
          featureMask: this.featureMask,
          speed: this.speed,
          live: this.speed !== 'max',
        });
      } catch {
        break; // aborted
      }
      if (!this.running) break;

      const fitnesses = results.map((r) => r.fitness);
      const sorted = [...fitnesses].sort((a, b) => b - a);
      const best = sorted[0];
      const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
      const worst = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.75)];
      const p75 = sorted[Math.floor(sorted.length * 0.25)];
      const bestIndex = fitnesses.indexOf(best);
      const piecesSorted = results.map((r) => r.stats.meanPieces).sort((a, b) => a - b);
      const medianPieces = piecesSorted[Math.floor(piecesSorted.length / 2)];

      if (best > this.bestFitness) {
        this.bestFitness = best;
        this.bestGenome = Float32Array.from(this.population[bestIndex]);
        this._log('record', fmt(t.events.record, { best: formatNumber(best), generation: this.generation }));
        this.ctx.audio.play('record');
        this._autoSaveModel(true);
      }

      const { events, evolveOpts } = this.tuner.update({ generation: this.generation, best, median, medianPieces, population: this.population });
      for (const e of events) {
        if (e.type === 'record') continue; // already logged with more detail
        const text = fmt(t.events[e.type] ?? e.type, {
          ...e.data,
          sigma: e.data?.sigma?.toFixed(3),
          best: formatNumber(e.data?.best ?? 0),
          diversity: e.data?.diversity?.toFixed(3),
        });
        this._log(e.type.includes('sigma') || e.type === 'injection' || e.type === 'diversity-collapse' ? 'tuner' : 'info', text);
      }

      const tunerSnap = this.tuner.history[this.tuner.history.length - 1];
      this.fitnessHistory.push({
        x: this.generation,
        best,
        mean,
        worst,
        p25,
        p75,
        diversity: tunerSnap?.diversity ?? 0,
        sigma: this.ga.params.mutationSigma,
        rate: this.ga.params.mutationRate,
      });

      if (this.generation > 0 && this.generation % cfg.autoSaveEveryGens === 0) {
        this._autoSaveModel(false);
        this._log('save', fmt(t.events.autosave, { generation: this.generation }));
      }
      if (this.generation > 0 && this.generation % TRAINING_DEFAULTS.sessionAutoSaveEveryGens === 0) this._saveSession();
      if (this.generation > 0 && this.generation % TRAINING_DEFAULTS.hallOfFameEveryGens === 0 && this.bestGenome) {
        saveHallOfFameEntry({
          sessionId: this.sessionId,
          sessionName: cfg.sessionName,
          generation: this.generation,
          fitness: this.bestFitness,
          arch: this.arch,
          weights: Float32Array.from(this.bestGenome),
          featureVersion: FEATURE_VERSION,
          featureMask: this.featureMask,
        }).then(() => this._log('save', fmt(t.events.hof, { generation: this.generation }))).catch(() => {});
      }

      // Stop conditions
      if ((cfg.maxGenerations > 0 && this.generation + 1 >= cfg.maxGenerations) || (cfg.targetFitness > 0 && best >= cfg.targetFitness)) {
        this._log('info', t.events.stopCondition);
        this.running = false;
        this._saveSession();
        toast(t.events.stopCondition, 'ok');
        break;
      }

      ({ population: this.population } = this.ga.evolve(this.population, fitnesses, evolveOpts));
      this.generation++;
      this.genDurations.push(performance.now() - genStart);
      if (this.genDurations.length > 10) this.genDurations.shift();
      this._refreshDashboardStats();
      this.gridRenderer?.setHighlights({ bestId: -1, selectedId: this.inspectedId ?? -1, crownId: 0 });

      if (this.singleStep) {
        this.singleStep = false;
        this._setPaused(true);
      }
      while (this.paused && this.running) await new Promise((r) => setTimeout(r, 120));
    }
  }

  async _autoSaveModel(isRecord) {
    if (!this.bestGenome) return;
    try {
      const record = await saveModel({
        id: this._autoModelId,
        name: `${this.cfg.sessionName} · mejor`,
        arch: this.arch,
        weights: Float32Array.from(this.bestGenome),
        featureVersion: FEATURE_VERSION,
        featureMask: this.featureMask,
        generation: this.generation,
        bestFitness: this.bestFitness,
        gaConfig: structuredClone({ ...this.cfg, featureMask: [...this.cfg.featureMask], hidden: [...this.cfg.hidden] }),
        fitnessHistory: this.fitnessHistory.map((r) => ({ gen: r.x, best: r.best, mean: r.mean })),
        sessionId: this.sessionId,
      });
      this._autoModelId = record.id;
      if (isRecord) this._log('save', STR.training.events.recordSaved);
    } catch {
      /* storage unavailable */
    }
  }

  async _saveSession() {
    try {
      const record = await saveSession({
        id: this.sessionId,
        name: this.cfg.sessionName,
        generation: this.generation,
        arch: this.arch,
        population: this.population.map((g) => Float32Array.from(g)),
        gaConfig: structuredClone({ ...this.cfg, featureMask: [...this.cfg.featureMask], hidden: [...this.cfg.hidden] }),
        gaParams: { ...this.ga.params },
        tunerState: this.tuner.getState(),
        masterSeed: this.cfg.masterSeed,
        featureMask: this.featureMask,
        useHold: this.cfg.useHold,
        fitnessHistory: this.fitnessHistory,
        eventLog: this.eventLog.slice(0, 400),
        bestGenome: this.bestGenome ? Float32Array.from(this.bestGenome) : null,
        bestFitness: this.bestFitness,
      });
      this.sessionId = record.id;
    } catch {
      /* storage unavailable */
    }
  }

  // ═══════════════════════════════════ DASHBOARD ════════════════════════════

  _showDashboard() {
    this.view = 'dashboard';
    const t = STR.training;
    const { root } = this.ctx;
    root.innerHTML = '';
    for (const c of this._charts) c.destroy?.();
    this._charts = [];

    const statCard = (label, cls = '') => {
      const value = el('div', { class: `stat-value ${cls}` }, '—');
      return { node: el('div', { class: 'stat-card' }, el('div', { class: 'stat-label' }, label), value), value };
    };
    this.cardGen = statCard(t.generation, 'accent');
    this.cardBest = statCard(t.bestFitness);
    this.cardMean = statCard(t.meanFitness);
    this.cardBestEver = statCard(t.bestEver, 'gold');
    this.cardDiversity = statCard(t.diversity);
    this.cardSigma = statCard(t.sigmaNow);
    this.cardPps = statCard(t.piecesPerSec);
    this.cardEta = statCard(t.eta);

    const speedBtns = new Map();
    const speedBtn = (v, label) => {
      const b = button(label, () => this._setSpeed(v));
      speedBtns.set(v, b);
      return b;
    };
    this._speedBtns = speedBtns;

    this.pauseBtn = button(`⏸ ${STR.common.pause}`, () => this._setPaused(!this.paused));
    this.stepBtn = button(t.plusOneGen, () => {
      this.singleStep = true;
      this._setPaused(false);
    });
    this.stepBtn.style.display = 'none';

    this.gridCanvas = el('canvas', { style: { width: '100%', height: '100%' } });
    this.gridRenderer = new AgentGridRenderer(this.gridCanvas, this.ctx.boardRenderer);
    this.gridRenderer.setAgentCount(this.population.length);
    this.gridCanvas.addEventListener('click', (e) => {
      const rect = this.gridCanvas.getBoundingClientRect();
      const id = this.gridRenderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (id !== null) this._openInspector(id);
    });

    this.headlessPanel = el(
      'div',
      { class: 'panel', style: { flex: '1', display: 'none', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } },
      el('p', { style: { color: 'var(--text-dim)' } }, t.headlessNote),
    );

    this.progressLabel = el('span', { class: 'field-hint' }, '');
    this.tunerPanel = el('div', { class: 'event-log' });
    this.logPanel = el('div', { class: 'event-log scrollable', style: { flex: '1', minHeight: '80px' } });
    this.logFilter = select({
      options: [
        ['all', 'Todos'],
        ['record', 'Récords'],
        ['tuner', 'Auto-ajuste'],
        ['save', 'Guardado'],
      ],
      value: 'all',
      onChange: () => this._renderLog(),
    });

    // Charts
    this.chartCanvas = el('canvas', { style: { width: '100%', height: '190px' } });
    this.fitnessChart = new LineChart(this.chartCanvas, {
      series: [
        { key: 'best', label: t.bestFitness, color: '#ffd500' },
        { key: 'mean', label: t.meanFitness, color: '#00e5ff' },
        { key: 'worst', label: t.worstFitness, color: '#5b6472' },
      ],
      band: { lowKey: 'p25', highKey: 'p75', color: 'rgba(0,229,255,0.10)' },
    });
    this.diversityChart = new LineChart(this.chartCanvas, {
      series: [{ key: 'diversity', label: t.diversity, color: '#4ade80' }],
    });
    this.sigmaChart = new LineChart(this.chartCanvas, {
      series: [
        { key: 'sigma', label: 'σ', color: '#ff2e97' },
        { key: 'rate', label: STR.training.mutationRate, color: '#00e5ff' },
      ],
    });
    this._charts.push(this.fitnessChart, this.diversityChart, this.sigmaChart);
    this.activeChart = this.fitnessChart;
    const chartTabs = tabBar(
      [
        { id: 'fitness', label: t.charts.fitness },
        { id: 'diversity', label: t.charts.diversity },
        { id: 'sigma', label: t.charts.sigma },
      ],
      'fitness',
      (id) => {
        chartTabs.setActive(id);
        this.activeChart = { fitness: this.fitnessChart, diversity: this.diversityChart, sigma: this.sigmaChart }[id];
        this._renderChart();
      },
    );

    this.rankingTable = el('div', { class: 'scrollable', style: { maxHeight: '180px' } });
    this.heatmapCanvas = el('canvas', { style: { width: '90px', height: '180px' } });

    const sortBtn = button(`${t.sortGrid}: ${t.sortByIndex}`, () => {
      this.gridSort = this.gridSort === 'index' ? 'fitness' : 'index';
      sortBtn.textContent = `${t.sortGrid}: ${this.gridSort === 'index' ? t.sortByIndex : t.sortByFitness}`;
    });

    this.el = el(
      'div',
      { class: 'scene' },
      el(
        'div',
        { class: 'topbar', style: { flexWrap: 'wrap' } },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, this.cfg.sessionName),
        this.cardGen.node,
        this.cardBest.node,
        this.cardMean.node,
        this.cardBestEver.node,
        this.cardDiversity.node,
        this.cardSigma.node,
        this.cardPps.node,
        this.cardEta.node,
      ),
      el(
        'div',
        { class: 'panel row', style: { flexWrap: 'wrap' } },
        this.pauseBtn,
        this.stepBtn,
        button(`⏹ ${t.stop}`, () => this._confirmStop(), 'btn-danger'),
        button(`💾 ${t.saveModel}`, () => this._manualSave()),
        el('span', { class: 'spacer' }),
        el('span', { class: 'field-hint' }, STR.common.speed),
        speedBtn(1, 'x1'),
        speedBtn(2, 'x2'),
        speedBtn(4, 'x4'),
        speedBtn(8, 'x8'),
        speedBtn('max', t.speedMax),
        sortBtn,
        button(t.exportHistory, () => this._exportHistory(), 'btn-ghost'),
        el('span', { class: 'spacer' }),
        this.progressLabel,
      ),
      el(
        'div',
        { class: 'row', style: { flex: '1', minHeight: '0', alignItems: 'stretch' } },
        el('div', { class: 'panel', style: { flex: '2', minWidth: '0', position: 'relative' } }, this.gridCanvas, this.headlessPanel),
        el(
          'div',
          { class: 'col', style: { flex: '1', minWidth: '340px', maxWidth: '460px', minHeight: '0' } },
          el('div', { class: 'panel', style: { flex: '0 0 auto' } }, chartTabs.bar, this.chartCanvas),
          el(
            'div',
            { class: 'panel', style: { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' } },
            el('div', { class: 'panel-title' }, t.tuner.title),
            this.tunerPanel,
            el('div', { class: 'row', style: { alignItems: 'flex-start', marginTop: '8px' } },
              el('div', { style: { flex: '1' } }, el('div', { class: 'panel-title' }, t.ranking), this.rankingTable),
              el('div', {}, el('div', { class: 'panel-title' }, t.heatmap), this.heatmapCanvas),
            ),
            el('div', { class: 'row', style: { marginTop: '8px', flex: '0 0 auto' } }, el('div', { class: 'panel-title', style: { margin: 0, flex: '1' } }, t.eventLog), this.logFilter),
            this.logPanel,
          ),
        ),
      ),
    );
    root.append(this.el);
    this._setSpeed(this.speed);
    this.resize();
    this._renderLog();
    this._rankingTimer = 0;
    this.cardGen.value.textContent = String(this.generation);
  }

  _setSpeed(v) {
    const wasHeadless = this.speed === 'max';
    this.speed = v;
    this.pool?.setSpeed(v);
    for (const [key, b] of this._speedBtns) b.classList.toggle('btn-active', key === v);
    const headless = v === 'max';
    this.gridCanvas.style.display = headless ? 'none' : 'block';
    this.headlessPanel.style.display = headless ? 'flex' : 'none';
    // Coming back from MÁX: the grid canvas had zero size while hidden, so
    // recompute its layout and force a full repaint once frames resume.
    if (wasHeadless && !headless && this.gridRenderer) {
      this.gridRenderer.resize();
      this.gridRenderer.invalidate();
    }
  }

  _setPaused(p) {
    this.paused = p;
    if (p) this.pool?.pause();
    else this.pool?.resume();
    this.pauseBtn.textContent = p ? `▶ ${STR.common.resume}` : `⏸ ${STR.common.pause}`;
    this.stepBtn.style.display = p ? '' : 'none';
  }

  async _confirmStop() {
    const t = STR.training;
    const wasPaused = this.paused;
    this._setPaused(true);
    modal({
      title: t.stopConfirm,
      content: el('div', {}),
      buttons: [
        {
          label: t.stopAndSave,
          cls: 'btn-primary',
          onClick: () => {
            this._manualSave();
            this._saveSession();
            this._finishTraining();
          },
        },
        { label: t.stopNoSave, cls: 'btn-danger', onClick: () => this._finishTraining() },
        { label: STR.common.cancel, cls: 'btn-ghost', onClick: () => this._setPaused(wasPaused) },
      ],
      onClose: () => {},
    });
  }

  _finishTraining() {
    this.running = false;
    this._setPaused(false);
    try {
      this.pool?.abort();
    } catch {
      /* fine */
    }
    this.ctx.manager.switchTo('menu');
  }

  async _manualSave() {
    if (!this.bestGenome) {
      toast(STR.common.none, 'error');
      return;
    }
    const name = `${this.cfg.sessionName} gen ${this.generation}`;
    try {
      await saveModel({
        name,
        arch: this.arch,
        weights: Float32Array.from(this.bestGenome),
        featureVersion: FEATURE_VERSION,
        featureMask: this.featureMask,
        generation: this.generation,
        bestFitness: this.bestFitness,
        gaConfig: structuredClone({ ...this.cfg, featureMask: [...this.cfg.featureMask], hidden: [...this.cfg.hidden] }),
        fitnessHistory: this.fitnessHistory.map((r) => ({ gen: r.x, best: r.best, mean: r.mean })),
        sessionId: this.sessionId,
      });
      toast(fmt(STR.training.modelSaved, { name }), 'ok');
      this._log('save', fmt(STR.training.modelSaved, { name }));
    } catch (err) {
      toast(String(err.message ?? err), 'error');
    }
  }

  _exportHistory() {
    const csv = toCsv(
      this.fitnessHistory.map((r) => ({
        generation: r.x,
        best: r.best.toFixed(2),
        mean: r.mean.toFixed(2),
        worst: r.worst.toFixed(2),
        p25: r.p25.toFixed(2),
        p75: r.p75.toFixed(2),
        diversity: r.diversity.toFixed(4),
        sigma: r.sigma.toFixed(4),
        rate: r.rate.toFixed(4),
      })),
    );
    downloadText(`${this.cfg.sessionName.replaceAll(' ', '_')}_historial.csv`, csv, 'text/csv');
    downloadText(`${this.cfg.sessionName.replaceAll(' ', '_')}_eventos.json`, JSON.stringify(this.eventLog, null, 2));
  }

  _log(type, text) {
    this.eventLog.unshift({ time: Date.now(), type, text });
    if (this.eventLog.length > 500) this.eventLog.length = 500;
    this._renderLog();
  }

  _renderLog() {
    if (!this.logPanel) return;
    const filter = this.logFilter?.value ?? 'all';
    this.logPanel.innerHTML = '';
    const items = this.eventLog.filter((e) => filter === 'all' || e.type === filter).slice(0, 80);
    for (const e of items) {
      this.logPanel.append(
        el('div', { class: `log-${e.type}` }, `${new Date(e.time).toLocaleTimeString('es-ES')} · ${e.text}`),
      );
    }
  }

  // ── Frames / stats ───────────────────────────────────────────────────────

  _onFrame(frame) {
    if (this.view !== 'dashboard' || !this.gridRenderer) return;
    this.gridRenderer.updateFrame(frame);
    // Pieces/s estimation + heatmap of the best live agent.
    let total = 0;
    let bestFit = -Infinity;
    let bestLocal = -1;
    for (let i = 0; i < frame.agentIds.length; i++) {
      const o = i * STATS_FIELDS;
      total += frame.stats[o + 3];
      if (frame.stats[o] > 0 && frame.stats[o + 6] > bestFit) {
        bestFit = frame.stats[o + 6];
        bestLocal = i;
      }
    }
    this.piecesCounter.total = Math.max(this.piecesCounter.total, total);
    if (bestLocal >= 0) {
      this._liveBestId = frame.agentIds[bestLocal];
      const grid = frame.grids.subarray(bestLocal * VISIBLE_CELLS, (bestLocal + 1) * VISIBLE_CELLS);
      for (let c = 0; c < VISIBLE_CELLS; c++) if (grid[c] > 0 && grid[c] <= 8) this.heatmapCounts[c]++;
    }
    if (frame.inspect && frame.inspect.agentId === this.inspectedId) this._updateInspector(frame.inspect);
  }

  _refreshDashboardStats() {
    if (this.view !== 'dashboard') return;
    const last = this.fitnessHistory[this.fitnessHistory.length - 1];
    this.cardGen.value.textContent = String(this.generation);
    if (last) {
      this.cardBest.value.textContent = formatNumber(last.best);
      this.cardMean.value.textContent = formatNumber(last.mean);
      this.cardDiversity.value.textContent = last.diversity.toFixed(3);
    }
    this.cardBestEver.value.textContent = Number.isFinite(this.bestFitness) ? formatNumber(this.bestFitness) : '—';
    this.cardSigma.value.textContent = this.ga.params.mutationSigma.toFixed(3);
    if (this.genDurations.length) {
      const avg = this.genDurations.reduce((a, b) => a + b, 0) / this.genDurations.length;
      let eta = `${(avg / 1000).toFixed(1)}s`;
      if (this.cfg.maxGenerations > 0) {
        const left = ((this.cfg.maxGenerations - this.generation) * avg) / 1000;
        eta += ` · ${Math.round(left)}s`;
      }
      this.cardEta.value.textContent = eta;
    }
    this._renderChart();
    this._renderTunerPanel();
  }

  _renderChart() {
    if (!this.activeChart) return;
    this.activeChart.setData(this.fitnessHistory);
    this.activeChart.resize();
  }

  _renderTunerPanel() {
    const t = STR.training.tuner;
    const params = this.ga.params;
    const hist = this.fitnessHistory;
    const prev = hist[hist.length - 6];
    const trend = prev && params.mutationSigma > prev.sigma ? t.trendUp : t.trendDown;
    this.tunerPanel.innerHTML = '';
    this.tunerPanel.append(
      el('div', {}, `σ: ${params.mutationSigma.toFixed(3)} · ${STR.training.mutationRate}: ${params.mutationRate.toFixed(3)} · ${trend}`),
      el('div', {}, `${t.stagnation}: ${fmt(t.gens, { n: this.tuner.stagnation })} · maxPieces: ${this.tuner.maxPieces}`),
      this.tuner.lastReason ? el('div', { class: 'log-tuner' }, t.reasons[this.tuner.lastReason] ?? this.tuner.lastReason) : null,
    );
  }

  _renderRanking() {
    if (!this.rankingTable || !this.gridRenderer?.stats) return;
    const t = STR.training;
    const n = this.population.length;
    const rows = [];
    for (let id = 0; id < n; id++) {
      const o = id * STATS_FIELDS;
      rows.push({
        id,
        fitness: this.gridRenderer.stats[o + 6],
        lines: this.gridRenderer.stats[o + 2],
        pieces: this.gridRenderer.stats[o + 3],
        tetris: this.gridRenderer.stats[o + 8],
        alive: this.gridRenderer.stats[o] > 0,
      });
    }
    rows.sort((a, b) => b.fitness - a.fitness);
    this.rankingTable.innerHTML = '';
    this.rankingTable.append(
      el(
        'table',
        { class: 'data-table' },
        el('tr', {}, el('th', {}, t.rankCols.agent), el('th', {}, t.rankCols.fitness), el('th', {}, t.rankCols.lines), el('th', {}, t.rankCols.tetris), el('th', {}, t.rankCols.status)),
        rows.slice(0, 15).map((r) =>
          el(
            'tr',
            { onclick: () => this._openInspector(r.id), style: { cursor: 'pointer' } },
            el('td', {}, `#${r.id}`),
            el('td', {}, formatNumber(r.fitness)),
            el('td', {}, String(r.lines)),
            el('td', {}, String(r.tetris)),
            el('td', {}, r.alive ? t.statusPlaying : t.statusDone),
          ),
        ),
      ),
    );
  }

  _renderHeatmap() {
    const ctx2d = this.heatmapCanvas.getContext('2d');
    const w = this.heatmapCanvas.width;
    const h = this.heatmapCanvas.height;
    ctx2d.clearRect(0, 0, w, h);
    const cell = Math.min(w / BOARD_WIDTH, h / 20);
    let max = 0;
    for (const v of this.heatmapCounts) if (v > max) max = v;
    ctx2d.fillStyle = '#0b0f1c';
    ctx2d.fillRect(0, 0, BOARD_WIDTH * cell, 20 * cell);
    if (max > 0) {
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          const v = this.heatmapCounts[y * BOARD_WIDTH + x] / max;
          if (v <= 0) continue;
          ctx2d.fillStyle = `rgba(${Math.round(v * 255)},${Math.round(46 + (1 - v) * 130)},${Math.round(151 + (1 - v) * 100)},${0.2 + v * 0.8})`;
          ctx2d.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
  }

  // ── Inspector ────────────────────────────────────────────────────────────

  _openInspector(agentId) {
    const t = STR.training.inspector;
    this.inspectedId = agentId;
    this.pool?.inspect(agentId);
    this.gridRenderer?.setHighlights({ bestId: this._liveBestId ?? -1, selectedId: agentId, crownId: 0 });

    this.inspectorBoard = el('canvas', { width: 240, height: 460, style: { width: '240px', height: '460px' } });
    this.inspectorNn = el('canvas', { style: { width: '440px', height: '460px' } });
    this.inspectorFeatures = el('div', { class: 'col', style: { gap: '3px', width: '250px' } });
    this.inspectorDecision = el('div', { class: 'event-log' });

    this.nnViz?.destroy();
    this.nnViz = new NetworkViz(this.inspectorNn, { inputLabels: FEATURE_LABELS_ES });
    const genome = this.population[agentId];
    if (genome) {
      const mlp = new MLP(this.arch);
      this.nnViz.setNetwork(this.arch, genome, (l, i, j) => mlp.getConnection(genome, l, i, j));
    }

    this._inspectorModal = modal({
      title: fmt(t.title, { id: agentId }),
      wide: true,
      content: el(
        'div',
        { class: 'row', style: { alignItems: 'flex-start' } },
        this.inspectorBoard,
        el('div', {}, el('div', { class: 'panel-title' }, t.network), this.inspectorNn),
        el(
          'div',
          { class: 'col' },
          el('div', { class: 'panel-title' }, t.featuresLive),
          this.inspectorFeatures,
          el('div', { class: 'panel-title', style: { marginTop: '8px' } }, t.decision),
          this.inspectorDecision,
        ),
      ),
      onClose: () => {
        this.inspectedId = null;
        this.pool?.inspect(null);
        this.nnViz?.destroy();
        this.nnViz = null;
      },
      buttons: [{ label: t.close, cls: 'btn-ghost' }],
    });
    setTimeout(() => this.nnViz?.resize(), 60);
  }

  _updateInspector(inspect) {
    const t = STR.training.inspector;
    if (this.nnViz && inspect.activations) {
      if (!this.nnViz._size.w) this.nnViz.resize();
      this.nnViz.setActivations(inspect.activations);
      this.nnViz.render();
    }
    if (this.inspectorFeatures && inspect.features) {
      this.inspectorFeatures.innerHTML = '';
      for (let i = 0; i < Math.min(FEATURE_COUNT, inspect.features.length); i++) {
        const v = inspect.features[i];
        this.inspectorFeatures.append(
          el(
            'div',
            { class: 'row', style: { gap: '6px' } },
            el('span', { style: { width: '150px', fontSize: '10px', color: 'var(--text-dim)' } }, FEATURE_LABELS_ES[i]),
            el('span', { style: { width: '44px', fontSize: '10px', fontFamily: 'var(--font-mono)' } }, v.toFixed(2)),
            el('div', { style: { flex: '1', height: '5px', background: '#1d2438', borderRadius: '3px' } },
              el('div', { style: { width: `${Math.min(100, Math.abs(v) * 100)}%`, height: '100%', background: v >= 0 ? 'var(--accent)' : 'var(--accent-2)', borderRadius: '3px' } }),
            ),
          ),
        );
      }
    }
    if (this.inspectorDecision && inspect.best) {
      this.inspectorDecision.innerHTML = '';
      this.inspectorDecision.append(
        el('div', { class: 'log-record' }, fmt(t.chosen, { rot: inspect.best.rotation, col: inspect.best.x, hold: inspect.best.useHold ? t.viaHold : '' })),
        el('div', {}, fmt(t.candidatesEvaluated, { n: inspect.totalCandidates })),
        ...inspect.candidates.slice(0, 5).map((c, i) =>
          el('div', {}, `${i + 1}. rot ${c.rotation} col ${c.x}${c.useHold ? ' (R)' : ''} → ${c.score.toFixed(3)}${c.linesCleared ? ` · ${c.linesCleared}L` : ''}`),
        ),
      );
    }
    // Big board from the grid renderer's latest snapshot.
    if (this.inspectorBoard && this.gridRenderer && this.inspectedId !== null) {
      const snap = this.gridRenderer.grids.subarray(this.inspectedId * VISIBLE_CELLS, (this.inspectedId + 1) * VISIBLE_CELLS);
      const c2d = this.inspectorBoard.getContext('2d');
      c2d.clearRect(0, 0, 240, 460);
      this.ctx.boardRenderer.draw(c2d, snap, 4, 4, 22);
    }
  }

  // ── Frame loop ───────────────────────────────────────────────────────────

  update(dt) {
    this._rankingTimer = (this._rankingTimer ?? 0) + dt;
    if (this._rankingTimer > 1000) {
      this._rankingTimer = 0;
      if (this.view === 'dashboard' && this.running) {
        // pieces/s
        const now = performance.now();
        const dtSec = (now - this.piecesCounter.lastTime) / 1000;
        if (dtSec > 0.5) {
          const delta = this.piecesCounter.total - this.piecesCounter.lastTotal;
          if (delta >= 0) this.piecesCounter.pps = Math.round(delta / dtSec);
          this.piecesCounter.lastTotal = this.piecesCounter.total;
          this.piecesCounter.lastTime = now;
          this.cardPps.value.textContent = String(this.piecesCounter.pps);
        }
        this.progressLabel.textContent = fmt(STR.training.agentsProgress, { done: this.agentsDone, total: this.population.length });
        this._renderRanking();
        this._renderHeatmap();
        if (this.gridSort === 'fitness' && this.gridRenderer) {
          const order = Array.from({ length: this.population.length }, (_, i) => i).sort(
            (a, b) => this.gridRenderer.stats[b * STATS_FIELDS + 6] - this.gridRenderer.stats[a * STATS_FIELDS + 6],
          );
          this.gridRenderer.setOrder(order);
        }
        this.gridRenderer?.setMaxFitness(Math.max(1, this.bestFitness));
        this.gridRenderer?.setHighlights({ bestId: this._liveBestId ?? -1, selectedId: this.inspectedId ?? -1, crownId: 0 });
      }
    }
  }

  render() {
    if (this.view === 'dashboard' && this.speed !== 'max') this.gridRenderer?.render();
  }

  resize() {
    if (this.view !== 'dashboard') return;
    this.gridRenderer?.resize();
    this.activeChart?.resize();
    this.nnViz?.resize();
  }

  onKeyDown(e) {
    if (this.view !== 'dashboard') {
      if (e.key === 'Escape') this.ctx.manager.switchTo('menu');
      return;
    }
    if (e.code === 'Space' && this.running) {
      e.preventDefault();
      this._setPaused(!this.paused);
    } else if (e.key === 'Escape' && !this._inspectorModal) {
      this.ctx.manager.switchTo('menu');
    }
  }
}
