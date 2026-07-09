import { Game } from '../game/game.js';
import { BOARD_WIDTH, BOARD_HEIGHT, VISIBLE_CELLS, PIECE_NAMES } from '../game/constants.js';
import { PIECES } from '../game/pieces.js';
import { AiPlayer } from '../ai/agent.js';
import { MLP } from '../ai/network.js';
import { FEATURE_COUNT, FEATURE_LABELS_ES, FEATURE_VERSION, countHoles } from '../ai/features.js';
import { serializeModel, parseModel } from '../ai/model-io.js';
import { gameFitness } from '../ai/fitness.js';
import { InputController } from '../ui/keyboard.js';
import { NetworkViz } from '../ui/nn-viz.js';
import { LineChart, Histogram, BoardHeatmap } from '../ui/charts.js';
import { el, button, modal, confirmModal, promptModal, numberInput, select, toast, formatNumber, formatTime } from '../ui/dom.js';
import { STR, fmt } from '../ui/strings.es.js';
import { randomSeed, deriveSeed } from '../core/rng.js';
import { listModels, saveModel, updateModel, deleteModel, listHallOfFame } from '../storage/model-store.js';
import { downloadText, pickTextFile, enableFileDrop, toCsv } from '../storage/file-io.js';

const SPEED_PPS = { 0.5: 1, 1: 2, 2: 4, 5: 10 };
const RANK_COLORS = ['#4ade80', '#a3e635', '#facc15', '#fb923c', '#ff4d6d'];

export class WatchScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.view = 'selector';
    this.snapshot = new Uint8Array(VISIBLE_CELLS);
    this.heights = new Uint8Array(BOARD_WIDTH);
    this._cleanups = [];
  }

  enter() {
    this._showSelector();
  }

  exit() {
    this._cleanup();
  }

  _cleanup() {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
    this.nnViz?.destroy();
    this.nnViz = null;
    this.benchmark = null;
    this.duel = null;
    this.compare = null;
    this.tournament = null;
  }

  _root(...children) {
    this._cleanup();
    this.ctx.root.innerHTML = '';
    this.el = el('div', { class: 'scene' }, ...children);
    this.ctx.root.append(this.el);
  }

  // ═══════════════════════════════════ SELECTOR ═════════════════════════════

  async _showSelector() {
    this.view = 'selector';
    const w = STR.watch;
    this.sortBy = this.sortBy ?? 'fitness';
    this.filterText = this.filterText ?? '';
    this.selectedForTournament = new Set();

    let models = [];
    let hof = [];
    try {
      models = await listModels();
      hof = await listHallOfFame();
    } catch {
      /* IndexedDB unavailable */
    }

    const grid = el('div', { class: 'card-grid' });
    const hofGrid = el('div', { class: 'card-grid', style: { marginTop: '8px' } });

    const renderCards = () => {
      const text = this.filterText.toLowerCase();
      let list = models.filter((m) => !text || m.name.toLowerCase().includes(text) || m.tags?.some((tag) => tag.toLowerCase().includes(text)));
      list.sort((a, b) => (this.sortBy === 'fitness' ? b.bestFitness - a.bestFitness : this.sortBy === 'date' ? b.updatedAt - a.updatedAt : a.name.localeCompare(b.name)));
      grid.innerHTML = '';
      if (list.length === 0) grid.append(el('p', { style: { color: 'var(--text-dim)', padding: '10px' } }, w.empty));
      for (const m of list) grid.append(this._modelCard(m, renderCards));
      hofGrid.innerHTML = '';
      for (const entry of hof.sort((a, b) => b.fitness - a.fitness).slice(0, 12)) {
        hofGrid.append(
          el(
            'div',
            { class: 'card' },
            el('div', { class: 'card-title' }, `${entry.sessionName || 'HOF'} · ${fmt(w.genShort, { n: entry.generation })}`),
            el('div', { class: 'card-sub' }, `${STR.training.bestFitness}: ${formatNumber(entry.fitness)} · ${new Date(entry.createdAt).toLocaleDateString('es-ES')}`),
            el('div', { class: 'card-actions' }, button(w.watchBtn, () => this._showViewer(this._hofToModel(entry)), 'btn-primary btn-icon')),
          ),
        );
      }
    };

    const filterInput = el('input', {
      class: 'input',
      placeholder: w.filter,
      value: this.filterText,
      oninput: () => {
        this.filterText = filterInput.value;
        renderCards();
      },
    });

    this._root(
      el(
        'div',
        { class: 'topbar' },
        button(`← ${STR.common.back}`, () => this.ctx.manager.switchTo('menu')),
        el('span', { class: 'topbar-title' }, w.selectorTitle),
        el('span', { class: 'spacer' }),
        filterInput,
        el('span', { class: 'field-hint' }, w.sortBy),
        select({
          options: Object.entries(w.sortOptions),
          value: this.sortBy,
          onChange: (v) => {
            this.sortBy = v;
            renderCards();
          },
        }),
        button(`⬆ ${w.importModel}`, () => this._importModel()),
        button(w.tournamentBtn, () => this._startTournamentFromSelection(models), 'btn-ghost'),
      ),
      el(
        'div',
        { class: 'panel scrollable', style: { flex: '1' } },
        el('p', { class: 'field-hint', style: { marginBottom: '8px' } }, w.dropHint),
        grid,
        hof.length ? el('div', { class: 'panel-title', style: { marginTop: '16px' } }, STR.training.hallOfFame) : null,
        hofGrid,
      ),
    );

    this._cleanups.push(enableFileDrop(this.el, async (text) => this._importModelText(text)));
    renderCards();
  }

  _hofToModel(entry) {
    return {
      id: null,
      name: `${entry.sessionName || 'HOF'} gen ${entry.generation}`,
      arch: entry.arch,
      weights: entry.weights,
      featureMask: entry.featureMask,
      generation: entry.generation,
      bestFitness: entry.fitness,
      stats: { gamesWatched: 0, bestLines: 0, totalLines: 0, totalGames: 0 },
    };
  }

  _modelCard(m, refresh) {
    const w = STR.watch;
    const tagChip = (tag) => {
      let hash = 0;
      for (const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
      const hue = ((hash % 360) + 360) % 360;
      return el('span', { style: { background: `hsl(${hue},60%,30%)`, borderRadius: '8px', padding: '1px 8px', fontSize: '10px', marginRight: '4px' } }, tag);
    };
    return el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'row', style: { justifyContent: 'space-between' } },
        el('div', { class: 'card-title' }, `${m.favorite ? '★ ' : ''}${m.name}`),
        button(m.favorite ? '★' : '☆', async () => {
          await updateModel(m.id, { favorite: !m.favorite });
          m.favorite = !m.favorite;
          refresh();
        }, 'btn-icon btn-ghost'),
      ),
      el('div', { class: 'card-sub' }, `${fmt(w.genShort, { n: m.generation })} · ${STR.training.bestFitness}: ${formatNumber(m.bestFitness)} · ${new Date(m.updatedAt).toLocaleDateString('es-ES')}`),
      el('div', { class: 'card-sub' }, fmt(w.modelStats, { games: m.stats?.totalGames ?? 0, best: m.stats?.bestLines ?? 0 })),
      m.tags?.length ? el('div', { style: { marginTop: '4px' } }, m.tags.map(tagChip)) : null,
      el(
        'div',
        { class: 'card-actions' },
        button(w.watchBtn, () => this._showViewer(m), 'btn-primary btn-icon'),
        button(w.compareBtn, () => this._pickSecondModel(m), 'btn-icon'),
        button(w.duelBtn, () => this._showDuel(m), 'btn-icon'),
        button('⋮', () => this._modelMenu(m, refresh), 'btn-icon btn-ghost'),
      ),
    );
  }

  _modelMenu(m, refresh) {
    const w = STR.watch;
    const menu = modal({
      title: m.name,
      content: el(
        'div',
        { class: 'col' },
        button(w.modelCard, () => {
          menu.close();
          this._showTechSheet(m);
        }, 'btn-ghost'),
        button(STR.common.rename, async () => {
          const name = await promptModal(STR.common.rename, { value: m.name });
          if (name) {
            await updateModel(m.id, { name });
            m.name = name;
            refresh();
          }
          menu.close();
        }, 'btn-ghost'),
        button(w.notes, async () => {
          const notes = await promptModal(w.notes, { value: m.notes ?? '' });
          if (notes !== null) {
            await updateModel(m.id, { notes });
            m.notes = notes;
          }
          menu.close();
        }, 'btn-ghost'),
        button(w.tags, async () => {
          const raw = await promptModal(`${w.tags} (a, b, c)`, { value: (m.tags ?? []).join(', ') });
          if (raw !== null) {
            m.tags = raw.split(',').map((s) => s.trim()).filter(Boolean);
            await updateModel(m.id, { tags: m.tags });
            refresh();
          }
          menu.close();
        }, 'btn-ghost'),
        button(w.exportBtn, () => {
          downloadText(`${m.name.replaceAll(' ', '_')}.tetris-model.json`, serializeModel({ arch: m.arch, weights: m.weights, meta: { name: m.name, generation: m.generation, bestFitness: m.bestFitness, createdAt: new Date(m.createdAt).toISOString(), gaConfig: m.gaConfig, featureMask: m.featureMask ? Array.from(m.featureMask) : null } }));
          menu.close();
        }, 'btn-ghost'),
        button(STR.common.delete, async () => {
          menu.close();
          if (await confirmModal(fmt(w.deleteConfirm, { name: m.name }), { danger: true })) {
            await deleteModel(m.id);
            this._showSelector();
          }
        }, 'btn-danger'),
      ),
      buttons: [{ label: STR.common.close, cls: 'btn-ghost' }],
    });
  }

  _showTechSheet(m) {
    const w = STR.watch;
    const maskInfo = m.featureMask
      ? FEATURE_LABELS_ES.filter((_, i) => m.featureMask[i]).join(', ')
      : FEATURE_LABELS_ES.join(', ');
    modal({
      title: `${w.modelCard}: ${m.name}`,
      content: el(
        'div',
        { class: 'event-log' },
        el('div', {}, `${w.archLabel}: ${m.arch.join(' → ')}`),
        el('div', {}, `${w.weightsLabel}: ${m.weights.length}`),
        el('div', {}, `${STR.training.inputFeatures}: ${maskInfo}`),
        m.gaConfig
          ? el('div', { style: { marginTop: '6px' } }, `${w.originConfig}: ${STR.training.population} ${m.gaConfig.populationSize}, σ ${m.gaConfig.mutationSigma}, ${STR.training.seedsPerEval} ${m.gaConfig.seedsPerEval}`)
          : null,
        m.notes ? el('div', { style: { marginTop: '6px' } }, `${w.notes}: ${m.notes}`) : null,
      ),
      buttons: [{ label: STR.common.close, cls: 'btn-ghost' }],
    });
  }

  async _importModel() {
    const text = await pickTextFile('.json');
    if (text) this._importModelText(text);
  }

  async _importModelText(text) {
    try {
      const parsed = parseModel(text);
      const record = await saveModel({
        name: parsed.meta.name ?? 'Modelo importado',
        arch: parsed.arch,
        weights: parsed.weights,
        featureVersion: parsed.featureVersion,
        featureMask: parsed.meta.featureMask ? Uint8Array.from(parsed.meta.featureMask) : null,
        generation: parsed.meta.generation ?? 0,
        bestFitness: parsed.meta.bestFitness ?? 0,
        gaConfig: parsed.meta.gaConfig ?? null,
      });
      toast(fmt(STR.watch.importOk, { name: record.name }), 'ok');
      this._showSelector();
    } catch (err) {
      toast(String(err.message ?? err), 'error');
    }
  }

  // ═══════════════════════════════════ VIEWER ═══════════════════════════════

  _showViewer(model, seed = randomSeed()) {
    this.view = 'viewer';
    const w = STR.watch;
    this.model = model;
    this.seed = seed >>> 0;
    this.game = new Game({ seed: this.seed });
    this.player = new AiPlayer({ arch: model.arch, weights: model.weights, featureMask: model.featureMask ?? null });
    this.mlp = new MLP(model.arch);
    this.speed = 1;
    this.paused = false;
    this.instant = false;
    this.pieceAcc = 0;
    this.placementHistory = [];
    this.lastDecision = null;
    this.decisionAge = 0;
    this.hoveredCandidate = -1;
    this.decisionLog = [];
    this.heatmapCounts = new Uint32Array(VISIBLE_CELLS);
    this.featImportance = new Float64Array(FEATURE_COUNT);
    this.featImportanceN = 0;
    this.criticalMoments = [];
    this.showNetwork = true;
    this.showHeuristics = false;
    this.showHeatmap = false;
    this.finishedHandled = false;

    this.boardCanvas = el('canvas', { width: 268, height: 528, style: { width: '268px', height: '528px' } });
    this.nnCanvas = el('canvas', { style: { width: '100%', height: '380px' } });
    this.heatmapCanvas = el('canvas', { style: { width: '140px', height: '280px', display: 'none' } });
    this.featurePanel = el('div', { class: 'col', style: { gap: '3px' } });
    this.decisionPanel = el('div', { class: 'event-log' });
    this.contribPanel = el('div', { class: 'col', style: { gap: '2px' } });
    this.logPanel = el('div', { class: 'event-log scrollable', style: { maxHeight: '150px' } });
    this.liveStats = el('div', { class: 'event-log' });
    this.criticalStrip = el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } });

    const speedBtns = new Map();
    const speedBtn = (v, label) => {
      const b = button(label, () => {
        this.instant = v === 'instant';
        if (!this.instant) this.speed = v;
        for (const [key, bb] of speedBtns) bb.classList.toggle('btn-active', key === v);
        this.ctx.audio.play('click');
      });
      speedBtns.set(v, b);
      return b;
    };

    const seedInput = numberInput({ min: 0, max: 4294967295, value: this.seed, width: '130px', onChange: (v) => (this.seed = v >>> 0) });

    this._root(
      el(
        'div',
        { class: 'topbar', style: { flexWrap: 'wrap' } },
        button(`‹ ${w.selectorTitle}`, () => this._showSelector()),
        el('span', { class: 'topbar-title' }, model.name),
        button('⏯', () => (this.paused = !this.paused), 'btn-icon'),
        button(`⏭ ${w.stepBtn}`, () => this._stepOnce()),
        button(`⏮ ${w.backBtn}`, () => this._stepBack()),
        speedBtn(0.5, '0.5x'),
        (() => {
          const b = speedBtn(1, '1x');
          b.classList.add('btn-active');
          return b;
        })(),
        speedBtn(2, '2x'),
        speedBtn(5, '5x'),
        speedBtn('instant', `⚡ ${w.instant}`),
        el('span', { class: 'spacer' }),
        el('span', { class: 'field-hint' }, STR.common.seed),
        seedInput,
        button(w.sameSeed, () => this._resetGame(this.seed)),
        button(w.newSeed, () => this._resetGame(randomSeed())),
        button(`📊 ${w.benchmark}`, () => this._openBenchmark()),
        button('📷', () => this._screenshot(), 'btn-icon'),
      ),
      el(
        'div',
        { class: 'row', style: { flex: '1', minHeight: '0', alignItems: 'flex-start' } },
        el(
          'div',
          { class: 'panel col', style: { flex: '0 0 auto' } },
          this.boardCanvas,
          el('div', { class: 'panel-title', style: { marginTop: '6px' } }, w.liveStats),
          this.liveStats,
          el(
            'div',
            { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap' } },
            button(w.heuristicOverlay, () => {
              this.showHeuristics = !this.showHeuristics;
            }, 'btn-icon'),
            button(w.heatmap, () => {
              this.showHeatmap = !this.showHeatmap;
              this.heatmapCanvas.style.display = this.showHeatmap ? 'block' : 'none';
              if (this.showHeatmap) {
                this.boardHeatmap.setData(this.heatmapCounts);
                this.boardHeatmap.resize();
              }
            }, 'btn-icon'),
          ),
          this.heatmapCanvas,
          el('div', { class: 'panel-title', style: { marginTop: '6px' } }, w.criticalMoments),
          this.criticalStrip,
        ),
        el(
          'div',
          { class: 'panel col', style: { flex: '1', minWidth: '0' } },
          el(
            'div',
            { class: 'row' },
            el('div', { class: 'panel-title', style: { margin: 0, flex: '1' } }, w.network),
            button(w.toggleNetwork, () => {
              this.showNetwork = !this.showNetwork;
              this.nnCanvas.style.display = this.showNetwork ? 'block' : 'none';
            }, 'btn-icon btn-ghost'),
          ),
          this.nnCanvas,
          el('div', { class: 'panel-title' }, w.features),
          el('div', { class: 'scrollable', style: { maxHeight: '190px' } }, this.featurePanel),
        ),
        el(
          'div',
          { class: 'panel col scrollable', style: { flex: '1', minWidth: '300px', maxWidth: '420px', maxHeight: '100%' } },
          el('div', { class: 'panel-title' }, w.decision),
          this.decisionPanel,
          el('div', { class: 'panel-title', style: { marginTop: '8px' } }, w.contribution),
          this.contribPanel,
          el('div', { class: 'panel-title', style: { marginTop: '8px' } }, w.featureImportance),
          (this.importancePanel = el('div', { class: 'col', style: { gap: '2px' } })),
          el('div', { class: 'panel-title', style: { marginTop: '8px' } }, w.decisionLog),
          this.logPanel,
        ),
      ),
    );
    // Created AFTER _root(): _root() → _cleanup() nulls scene objects, so
    // building these earlier would destroy them immediately.
    this.nnViz = new NetworkViz(this.nnCanvas, { inputLabels: FEATURE_LABELS_ES });
    this.nnViz.setNetwork(model.arch, model.weights, (l, i, j) => this.mlp.getConnection(model.weights, l, i, j));
    this.boardHeatmap = new BoardHeatmap(this.heatmapCanvas);
    setTimeout(() => this.nnViz?.resize(), 50);
  }

  _resetGame(seed) {
    this.seed = seed >>> 0;
    this.game.reset(this.seed);
    this.placementHistory = [];
    this.lastDecision = null;
    this.decisionLog = [];
    this.heatmapCounts.fill(0);
    this.featImportance.fill(0);
    this.featImportanceN = 0;
    this.criticalMoments = [];
    this.finishedHandled = false;
    this.criticalStrip.innerHTML = '';
  }

  _playOnePiece(detailed) {
    const game = this.game;
    if (game.state !== 'playing') return false;
    let decision = null;
    if (detailed) {
      const d = this.player.chooseDetailed(game, 5);
      if (!d.best) return false;
      decision = d;
      this.lastDecision = {
        pieceIndex: game.stats.pieces,
        type: game.current.type,
        best: d.best,
        candidates: d.candidates,
        totalCandidates: d.totalCandidates,
        activations: d.activations,
        boardBefore: Uint8Array.from(game.board.grid),
      };
      this.decisionAge = 0;
      this._recordContribution(d.best);
      this.decisionLog.unshift({
        n: game.stats.pieces,
        type: game.current.type,
        rot: d.best.rotation,
        x: d.best.x,
        hold: d.best.useHold,
        score: d.best.score,
        cands: d.totalCandidates,
      });
      if (this.decisionLog.length > 120) this.decisionLog.length = 120;
    } else {
      const move = this.player.chooseMove(game);
      if (!move) return false;
      decision = { best: move };
    }
    // Heatmap: the 4 cells where the piece lands.
    const type = decision.best.useHold ? null : game.current.type;
    const rot = decision.best.rotation;
    const px = decision.best.x;
    game.applyPlacement(decision.best);
    if (type !== null) {
      // Re-derive landing cells from the pre-placement board copy if available.
      const cells = PIECES[type][rot];
      if (this.lastDecision?.boardBefore) {
        // dropY over the stored board: cheap simulation.
        let y = -4;
        const collides = (yy) => {
          for (const [cx, cy] of cells) {
            const x = px + cx;
            const ry = yy + cy;
            if (x < 0 || x >= BOARD_WIDTH || ry >= 24) return true;
            if (ry >= 0 && this.lastDecision.boardBefore[ry * BOARD_WIDTH + x] !== 0) return true;
          }
          return false;
        };
        while (!collides(y + 1)) y++;
        for (const [cx, cy] of cells) {
          const vy = y + cy - 4;
          if (vy >= 0 && vy < BOARD_HEIGHT) this.heatmapCounts[vy * BOARD_WIDTH + px + cx]++;
        }
      }
    }
    this.placementHistory.push({ useHold: decision.best.useHold, rotation: decision.best.rotation, x: decision.best.x });

    // Critical moments: stack above row 15.
    this.game.board.getColumnHeights(this.heights);
    let max = 0;
    for (const h of this.heights) if (h > max) max = h;
    const lastCrit = this.criticalMoments[this.criticalMoments.length - 1];
    if (max > 15 && this.criticalMoments.length < 20 && (!lastCrit || game.stats.pieces - lastCrit > 10)) {
      this.criticalMoments.push(game.stats.pieces);
      this.criticalStrip.append(
        button(`#${game.stats.pieces}`, () => this._replayTo(game.stats.pieces), 'btn-icon btn-ghost'),
      );
    }
    return true;
  }

  _recordContribution(best) {
    // Leave-one-out contribution: score drop when each feature is zeroed.
    const base = best.score;
    const scratch = Float32Array.from(best.features);
    this.lastContrib = [];
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (best.features[i] === 0) {
        this.lastContrib.push(0);
        continue;
      }
      const orig = scratch[i];
      scratch[i] = 0;
      const without = this.mlp.forward(this.model.weights, scratch);
      scratch[i] = orig;
      const delta = base - without; // positive = the feature pushed the score up
      this.lastContrib.push(delta);
      this.featImportance[i] += Math.abs(delta);
    }
    this.featImportanceN++;
  }

  _stepOnce() {
    this.paused = true;
    this._playOnePiece(true);
  }

  _stepBack() {
    if (this.placementHistory.length === 0) return;
    this.paused = true;
    const target = Math.max(0, this.placementHistory.length - 1);
    this._replayToPlacements(this.placementHistory.slice(0, target));
  }

  _replayTo(pieceIndex) {
    this.paused = true;
    this._replayToPlacements(this.placementHistory.slice(0, pieceIndex));
  }

  _replayToPlacements(placements) {
    this.game.reset(this.seed);
    for (const p of placements) {
      if (this.game.state !== 'playing') break;
      this.game.applyPlacement(p);
    }
    this.placementHistory = placements.slice();
    this.lastDecision = null;
    this.finishedHandled = false;
  }

  async _onGameFinished() {
    if (this.finishedHandled) return;
    this.finishedHandled = true;
    const w = STR.watch;
    const st = this.game.stats;
    const stats = this.model.stats ?? { gamesWatched: 0, bestLines: 0, totalLines: 0, totalGames: 0 };
    const prevMean = stats.totalGames > 0 ? stats.totalLines / stats.totalGames : 0;
    stats.totalGames++;
    stats.totalLines += st.lines;
    stats.gamesWatched++;
    stats.bestLines = Math.max(stats.bestLines, st.lines);
    this.model.stats = stats;
    if (this.model.id) updateModel(this.model.id, { stats }).catch(() => {});
    const pct = prevMean > 0 ? Math.min(99, Math.round((st.lines / (prevMean * 2)) * 100)) : 50;
    toast(`${STR.game.gameOver} · ${st.lines} ${STR.common.lines} · ${fmt(w.vsHistory, { pct })}`, 'ok', 4200);
  }

  // ── Benchmark ────────────────────────────────────────────────────────────

  _openBenchmark() {
    const w = STR.watch;
    let games = 50;
    const progress = el('div', { class: 'field-hint' }, '');
    const results = el('div', {});
    const histCanvas = el('canvas', { style: { width: '100%', height: '150px', display: 'none' } });
    const survCanvas = el('canvas', { style: { width: '100%', height: '150px', display: 'none' } });
    const hist = new Histogram(histCanvas, { color: '#00e5ff' });
    const surv = new LineChart(survCanvas, { series: [{ key: 'pct', label: w.survival, color: '#4ade80' }] });
    this._charts = [hist, surv];

    const runBtn = button(w.benchmarkRun, () => {
      runBtn.disabled = true;
      this.benchmark = { total: games, done: 0, rows: [], progress, results, hist, surv, histCanvas, survCanvas, runBtn, cancelled: false };
    }, 'btn-primary');

    modal({
      title: fmt(w.benchmarkTitle, { name: this.model.name }),
      wide: true,
      content: el(
        'div',
        {},
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'field-hint' }, w.benchmarkGames),
          numberInput({ min: 10, max: 200, value: games, onChange: (v) => (games = v) }),
          runBtn,
          button(w.benchmarkCancel, () => {
            if (this.benchmark) this.benchmark.cancelled = true;
          }, 'btn-ghost'),
        ),
        progress,
        results,
        histCanvas,
        survCanvas,
      ),
      onClose: () => {
        this.benchmark = null;
      },
      buttons: [{ label: STR.common.close, cls: 'btn-ghost' }],
    });
  }

  _benchmarkTick() {
    const b = this.benchmark;
    if (!b) return;
    const w = STR.watch;
    const deadline = performance.now() + 12;
    const game = (b.game ??= new Game({ seed: 1 }));
    while (performance.now() < deadline && b.done < b.total && !b.cancelled) {
      if (!b.running) {
        game.reset(deriveSeed(this.seed, 7777, b.done));
        b.running = true;
      }
      let steps = 0;
      while (game.state === 'playing' && game.stats.pieces < 2000 && game.stats.lines < 300 && steps++ < 120) {
        this.player.playPiece(game);
      }
      if (game.state !== 'playing' || game.stats.pieces >= 2000 || game.stats.lines >= 300) {
        b.rows.push({ game: b.done + 1, lines: game.stats.lines, pieces: game.stats.pieces, score: game.stats.score, fitness: Math.round(gameFitness(game.stats)) });
        b.done++;
        b.running = false;
      }
    }
    b.progress.textContent = fmt(w.benchmarkRunning, { i: b.done, n: b.total });
    if (b.done >= b.total || b.cancelled) {
      const rows = b.rows;
      this.benchmark = null;
      b.runBtn.disabled = false;
      if (rows.length === 0) return;
      const lines = rows.map((r) => r.lines);
      const mean = lines.reduce((a, x) => a + x, 0) / lines.length;
      const sd = Math.sqrt(lines.reduce((a, x) => a + (x - mean) ** 2, 0) / lines.length);
      b.results.innerHTML = '';
      b.results.append(
        el(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', gap: '8px', margin: '10px 0' } },
          card(w.mean, mean.toFixed(1)),
          card(w.stdDev, sd.toFixed(1)),
          card(w.min, Math.min(...lines)),
          card(w.max, Math.max(...lines)),
        ),
        button(w.exportCsv, () => downloadText(`benchmark_${this.model.name.replaceAll(' ', '_')}.csv`, toCsv(rows), 'text/csv')),
      );
      b.histCanvas.style.display = 'block';
      b.hist.setData(lines, 12);
      b.hist.resize();
      b.survCanvas.style.display = 'block';
      const pieces = rows.map((r) => r.pieces).sort((a, x) => a - x);
      const maxP = pieces[pieces.length - 1] || 1;
      const points = [];
      for (let i = 0; i <= 20; i++) {
        const x = Math.round((i / 20) * maxP);
        points.push({ x, pct: (pieces.filter((p) => p >= x).length / pieces.length) * 100 });
      }
      b.surv.setData(points);
      b.surv.resize();
    }
  }

  _screenshot() {
    const canvas = document.createElement('canvas');
    const bw = this.boardCanvas.width;
    const nw = this.nnCanvas.width;
    canvas.width = bw + nw + 20;
    canvas.height = Math.max(this.boardCanvas.height, this.nnCanvas.height);
    const c = canvas.getContext('2d');
    c.fillStyle = '#0a0e17';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(this.boardCanvas, 0, 0);
    c.drawImage(this.nnCanvas, bw + 20, 0);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tetris-ia_${this.model.name.replaceAll(' ', '_')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }

  // ═══════════════════════════════════ COMPARE ══════════════════════════════

  async _pickSecondModel(first) {
    const models = (await listModels().catch(() => [])).filter((m) => m.id !== first.id);
    if (models.length === 0) {
      toast(STR.watch.empty, 'error');
      return;
    }
    const picker = modal({
      title: STR.watch.compareTitle,
      content: el('div', { class: 'col' }, models.map((m) => button(m.name, () => {
        picker.close();
        this._showCompare(first, m);
      }, 'btn-ghost'))),
      buttons: [{ label: STR.common.cancel, cls: 'btn-ghost' }],
    });
  }

  _showCompare(modelA, modelB) {
    this.view = 'compare';
    const w = STR.watch;
    const seed = randomSeed();
    this.compare = {
      seed,
      sides: [modelA, modelB].map((m) => ({
        model: m,
        game: new Game({ seed }),
        player: new AiPlayer({ arch: m.arch, weights: m.weights, featureMask: m.featureMask ?? null }),
        canvas: el('canvas', { width: 224, height: 444, style: { width: '224px', height: '444px' } }),
        stats: el('div', { class: 'event-log' }),
      })),
      scoreboard: el('div', { class: 'stat-value accent', style: { textAlign: 'center', minWidth: '220px' } }, '—'),
      acc: 0,
      finished: false,
    };
    this._root(
      el(
        'div',
        { class: 'topbar' },
        button(`‹ ${w.selectorTitle}`, () => this._showSelector()),
        el('span', { class: 'topbar-title' }, `${w.compareTitle} · ${w.samePieces}`),
      ),
      el(
        'div',
        { class: 'row', style: { flex: '1', justifyContent: 'center', alignItems: 'flex-start' } },
        el('div', { class: 'panel col' }, el('div', { class: 'card-title' }, modelA.name), this.compare.sides[0].canvas, this.compare.sides[0].stats),
        el('div', { class: 'panel col', style: { alignSelf: 'center' } }, el('div', { class: 'panel-title' }, w.scoreboard), this.compare.scoreboard),
        el('div', { class: 'panel col' }, el('div', { class: 'card-title' }, modelB.name), this.compare.sides[1].canvas, this.compare.sides[1].stats),
      ),
    );
  }

  _compareTick(dt) {
    const c = this.compare;
    if (!c || c.finished) return;
    const w = STR.watch;
    c.acc += (dt / 1000) * 6; // 6 pps
    while (c.acc >= 1) {
      c.acc -= 1;
      for (const side of c.sides) {
        if (side.game.state === 'playing' && side.game.stats.pieces < 2000 && side.game.stats.lines < 300) {
          side.player.playPiece(side.game);
        }
      }
    }
    for (const side of c.sides) {
      side.game.getSnapshot(this.snapshot);
      const ctx2d = side.canvas.getContext('2d');
      ctx2d.clearRect(0, 0, side.canvas.width, side.canvas.height);
      this.ctx.boardRenderer.draw(ctx2d, this.snapshot, 2, 2, 22);
      const st = side.game.stats;
      side.stats.textContent = `${st.lines} L · ${formatNumber(st.score)} pts · ${st.pieces} pzs`;
    }
    const [a, b] = c.sides;
    const diff = a.game.stats.lines - b.game.stats.lines;
    c.scoreboard.textContent = diff === 0 ? w.tied : fmt(w.leader, { name: diff > 0 ? a.model.name : b.model.name }) + ` (+${Math.abs(diff)})`;
    const allDone = c.sides.every((s) => s.game.state !== 'playing' || s.game.stats.pieces >= 2000 || s.game.stats.lines >= 300);
    if (allDone) c.finished = true;
  }

  // ═══════════════════════════════════ TOURNAMENT ═══════════════════════════

  async _startTournamentFromSelection(models) {
    const w = STR.watch;
    if (models.length < 2) {
      toast(w.tournamentPick, 'error');
      return;
    }
    const chosen = new Set();
    let gamesPerModel = 4;
    const list = el(
      'div',
      { class: 'col' },
      models.map((m) => {
        const cb = el('input', { type: 'checkbox', onchange: () => (cb.checked ? chosen.add(m) : chosen.delete(m)) });
        return el('label', { class: 'checkbox' }, cb, el('span', {}, `${m.name} (${formatNumber(m.bestFitness)})`));
      }),
    );
    modal({
      title: w.tournamentTitle,
      content: el(
        'div',
        {},
        el('p', { class: 'field-hint' }, w.tournamentPick),
        list,
        el('div', { class: 'row', style: { marginTop: '8px' } }, el('span', { class: 'field-hint' }, w.gamesPerModel), numberInput({ min: 2, max: 10, value: gamesPerModel, onChange: (v) => (gamesPerModel = v) })),
      ),
      buttons: [
        { label: STR.common.cancel, cls: 'btn-ghost' },
        {
          label: w.runTournament,
          cls: 'btn-primary',
          onClick: () => {
            if (chosen.size < 2) {
              toast(w.tournamentPick, 'error');
              return false;
            }
            this._showTournament([...chosen], gamesPerModel);
          },
        },
      ],
    });
  }

  _showTournament(models, gamesPerModel) {
    this.view = 'tournament';
    const w = STR.watch;
    const baseSeed = randomSeed();
    this.tournament = {
      models,
      seeds: Array.from({ length: gamesPerModel }, (_, i) => deriveSeed(baseSeed, i)),
      results: models.map(() => []),
      mi: 0,
      si: 0,
      game: new Game({ seed: 1 }),
      players: models.map((m) => new AiPlayer({ arch: m.arch, weights: m.weights, featureMask: m.featureMask ?? null })),
      running: false,
      progress: el('div', { class: 'field-hint' }, ''),
      table: el('div', {}),
    };
    this._root(
      el(
        'div',
        { class: 'topbar' },
        button(`‹ ${w.selectorTitle}`, () => this._showSelector()),
        el('span', { class: 'topbar-title' }, w.tournamentTitle),
        el('span', { class: 'spacer' }),
        this.tournament.progress,
      ),
      el('div', { class: 'panel scrollable', style: { flex: '1' } }, this.tournament.table),
    );
  }

  _tournamentTick() {
    const t = this.tournament;
    if (!t || t.mi >= t.models.length) return;
    const w = STR.watch;
    const deadline = performance.now() + 12;
    while (performance.now() < deadline && t.mi < t.models.length) {
      if (!t.running) {
        t.game.reset(t.seeds[t.si]);
        t.running = true;
      }
      const player = t.players[t.mi];
      let steps = 0;
      while (t.game.state === 'playing' && t.game.stats.pieces < 1500 && t.game.stats.lines < 300 && steps++ < 150) {
        player.playPiece(t.game);
      }
      if (t.game.state !== 'playing' || t.game.stats.pieces >= 1500 || t.game.stats.lines >= 300) {
        t.results[t.mi].push(t.game.stats.lines);
        t.running = false;
        t.si++;
        if (t.si >= t.seeds.length) {
          t.si = 0;
          t.mi++;
        }
      }
    }
    t.progress.textContent = `${t.mi}/${t.models.length} · ${t.si}/${t.seeds.length}`;
    this._renderTournamentTable();
  }

  _renderTournamentTable() {
    const t = this.tournament;
    const w = STR.watch;
    const rows = t.models.map((m, i) => {
      const lines = t.results[i];
      const mean = lines.length ? lines.reduce((a, b) => a + b, 0) / lines.length : 0;
      const sd = lines.length ? Math.sqrt(lines.reduce((a, x) => a + (x - mean) ** 2, 0) / lines.length) : 0;
      return { name: m.name, mean, best: lines.length ? Math.max(...lines) : 0, consistency: mean > 0 ? 1 / (1 + sd / Math.max(1, mean)) : 0, lines };
    });
    const done = t.mi >= t.models.length;
    rows.sort((a, b) => b.mean - a.mean);
    t.table.innerHTML = '';
    if (done && rows[0]) t.table.append(el('div', { class: 'stat-value gold', style: { marginBottom: '10px' } }, fmt(w.tournamentChampion, { name: rows[0].name })));
    t.table.append(
      el(
        'table',
        { class: 'data-table' },
        el('tr', {}, el('th', {}, STR.common.name), el('th', {}, w.mean), el('th', {}, w.max), el('th', {}, w.consistency), el('th', {}, STR.common.lines)),
        rows.map((r, i) =>
          el(
            'tr',
            { class: done && i === 0 ? 'row-highlight' : '' },
            el('td', {}, r.name),
            el('td', {}, r.mean.toFixed(1)),
            el('td', {}, String(r.best)),
            el('td', {}, r.consistency.toFixed(2)),
            el('td', {}, r.lines.join(' · ')),
          ),
        ),
      ),
    );
  }

  // ═══════════════════════════════════ DUEL ═════════════════════════════════

  _showDuel(model) {
    this.view = 'duel';
    const w = STR.watch;
    const seed = randomSeed();
    const humanGame = new Game({ seed, config: { previewCount: this.ctx.settings.previewCount, softDropFactor: this.ctx.settings.softDropFactor, ghostEnabled: this.ctx.settings.ghostEnabled } });
    const aiGame = new Game({ seed });
    const input = new InputController({ keybinds: this.ctx.keybinds, dasMs: this.ctx.settings.dasMs, arrMs: this.ctx.settings.arrMs });
    input.attach(humanGame);
    input.onPause = () => (this.duel.paused = !this.duel.paused);
    this.duel = {
      model,
      seed,
      humanGame,
      aiGame,
      input,
      player: new AiPlayer({ arch: model.arch, weights: model.weights, featureMask: model.featureMask ?? null }),
      aiSpeed: 1,
      acc: 0,
      paused: false,
      finished: false,
      humanCanvas: el('canvas', { width: 224, height: 444, style: { width: '224px', height: '444px' } }),
      aiCanvas: el('canvas', { width: 224, height: 444, style: { width: '224px', height: '444px' } }),
      humanStats: el('div', { class: 'event-log' }, ''),
      aiStats: el('div', { class: 'event-log' }, ''),
    };
    this._root(
      el(
        'div',
        { class: 'topbar' },
        button(`‹ ${w.selectorTitle}`, () => this._showSelector()),
        el('span', { class: 'topbar-title' }, `${w.duelTitle} · ${model.name}`),
        el('span', { class: 'spacer' }),
        el('span', { class: 'field-hint' }, w.duelHandicap),
        select({
          options: [
            ['0.5', '0.5x'],
            ['1', '1x'],
            ['2', '2x'],
          ],
          value: '1',
          onChange: (v) => (this.duel.aiSpeed = Number(v)),
        }),
      ),
      el(
        'div',
        { class: 'row', style: { flex: '1', justifyContent: 'center', alignItems: 'flex-start' } },
        el('div', { class: 'panel col' }, el('div', { class: 'card-title' }, w.duelHuman), this.duel.humanCanvas, this.duel.humanStats),
        el('div', { class: 'panel col' }, el('div', { class: 'card-title' }, `${w.duelAi}: ${model.name}`), this.duel.aiCanvas, this.duel.aiStats),
      ),
    );
  }

  _duelTick(dt) {
    const d = this.duel;
    if (!d || d.paused) return;
    const w = STR.watch;
    if (!d.finished) {
      d.input.update(dt);
      if (d.humanGame.state === 'playing') d.humanGame.step(dt);
      d.acc += (dt / 1000) * 2 * d.aiSpeed;
      while (d.acc >= 1) {
        d.acc -= 1;
        if (d.aiGame.state === 'playing' && d.aiGame.stats.lines < 300 && d.aiGame.stats.pieces < 2000) d.player.playPiece(d.aiGame);
      }
      const humanDone = d.humanGame.state !== 'playing';
      const aiDone = d.aiGame.state !== 'playing' || d.aiGame.stats.lines >= 300 || d.aiGame.stats.pieces >= 2000;
      if (humanDone && (aiDone || d.aiGame.stats.lines > d.humanGame.stats.lines)) {
        d.finished = true;
        this._duelResult();
      } else if (humanDone && aiDone) {
        d.finished = true;
        this._duelResult();
      }
    }
    for (const [game, canvas, statsEl] of [
      [d.humanGame, d.humanCanvas, d.humanStats],
      [d.aiGame, d.aiCanvas, d.aiStats],
    ]) {
      game.getSnapshot(this.snapshot);
      const ctx2d = canvas.getContext('2d');
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      this.ctx.boardRenderer.draw(ctx2d, this.snapshot, 2, 2, 22);
      const st = game.stats;
      statsEl.textContent = `${st.lines} L · ${formatNumber(st.score)} pts · PPS ${(st.pieces / Math.max(0.001, st.timeMs / 1000)).toFixed(2)}`;
    }
  }

  _duelResult() {
    const w = STR.watch;
    const d = this.duel;
    const hl = d.humanGame.stats.lines;
    const al = d.aiGame.stats.lines;
    let title = w.duelTie;
    if (hl > al || (hl === al && d.humanGame.stats.score > d.aiGame.stats.score)) title = w.duelWin;
    else if (al > hl || d.aiGame.stats.score > d.humanGame.stats.score) title = w.duelLose;
    this.ctx.audio.play(title === w.duelWin ? 'allclear' : 'gameover');
    modal({
      title,
      content: el(
        'div',
        { class: 'row', style: { gap: '10px' } },
        card(w.duelHuman, `${hl} L · ${formatNumber(d.humanGame.stats.score)}`),
        card(w.duelAi, `${al} L · ${formatNumber(d.aiGame.stats.score)}`),
      ),
      buttons: [
        { label: w.rematch, cls: 'btn-primary', onClick: () => this._showDuelSame() },
        { label: `‹ ${w.selectorTitle}`, cls: 'btn-ghost', onClick: () => this._showSelector() },
      ],
    });
  }

  _showDuelSame() {
    const model = this.duel.model;
    const seed = this.duel.seed;
    this._showDuel(model);
    // Reuse the exact same seed for the rematch.
    this.duel.seed = seed;
    this.duel.humanGame.reset(seed);
    this.duel.aiGame.reset(seed);
  }

  // ═══════════════════════════════════ LOOP ═════════════════════════════════

  update(dt) {
    if (this.benchmark) this._benchmarkTick();
    if (this.view === 'compare') this._compareTick(dt);
    if (this.view === 'tournament') this._tournamentTick();
    if (this.view === 'duel') this._duelTick(dt);
    if (this.view !== 'viewer' || !this.game) return;

    this.decisionAge += dt;
    if (this.paused) return;

    if (this.game.state !== 'playing') {
      this._onGameFinished();
      return;
    }

    if (this.instant) {
      const deadline = performance.now() + 8;
      let count = 0;
      while (performance.now() < deadline && count++ < 200 && this.game.state === 'playing') {
        this._playOnePiece(false);
      }
      return;
    }

    this.pieceAcc += (dt / 1000) * (SPEED_PPS[this.speed] ?? 2);
    while (this.pieceAcc >= 1) {
      this.pieceAcc -= 1;
      const detailed = this.showNetwork || this.speed <= 2;
      this._playOnePiece(detailed);
    }
  }

  render() {
    if (this.view !== 'viewer' || !this.game) return;
    const w = STR.watch;
    const ctx2d = this.boardCanvas.getContext('2d');
    ctx2d.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    this.game.getSnapshot(this.snapshot);
    this.ctx.boardRenderer.draw(ctx2d, this.snapshot, 4, 4, 26);

    // Candidate ghosts of the last decision (paused/step or shortly after deciding).
    const d = this.lastDecision;
    if (d && (this.paused || this.decisionAge < 400) && d.candidates) {
      for (let i = Math.min(4, d.candidates.length - 1); i >= 0; i--) {
        const cand = d.candidates[i];
        if (cand.useHold !== d.best.useHold) continue;
        if (i === this.hoveredCandidate || this.paused || i === 0) {
          const type = d.type;
          const cells = PIECES[type][cand.rotation];
          let y = -4;
          const collides = (yy) => {
            for (const [cx, cy] of cells) {
              const x = cand.x + cx;
              const ry = yy + cy;
              if (x < 0 || x >= BOARD_WIDTH || ry >= 24) return true;
              if (ry >= 0 && d.boardBefore[ry * BOARD_WIDTH + x] !== 0) return true;
            }
            return false;
          };
          while (!collides(y + 1)) y++;
          this.ctx.boardRenderer.drawPlacementGhost(ctx2d, type, cand.rotation, cand.x, y, 4, 4, 26, RANK_COLORS[i] ?? '#ff4d6d', i === 0 ? 0.5 : 0.3);
        }
      }
    }

    // Heuristic overlay: holes in red + column heights.
    if (this.showHeuristics) {
      this.game.board.getColumnHeights(this.heights);
      ctx2d.fillStyle = 'rgba(255,77,109,0.45)';
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const top = 24 - this.heights[x];
        for (let y = Math.max(top + 1, 4); y < 24; y++) {
          if (this.game.board.grid[y * BOARD_WIDTH + x] === 0) {
            ctx2d.fillRect(4 + x * 26, 4 + (y - 4) * 26, 26, 26);
          }
        }
      }
      ctx2d.strokeStyle = '#00e5ff';
      ctx2d.beginPath();
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const hy = 4 + Math.max(0, 20 - this.heights[x]) * 26;
        ctx2d.moveTo(4 + x * 26, hy);
        ctx2d.lineTo(4 + (x + 1) * 26, hy);
      }
      ctx2d.stroke();
    }

    // Live stats.
    const st = this.game.stats;
    this.game.board.getColumnHeights(this.heights);
    let sumH = 0;
    for (const h of this.heights) sumH += h;
    this.liveStats.innerHTML = '';
    this.liveStats.append(
      el('div', {}, `${STR.common.lines}: ${st.lines} · ${STR.common.pieces}: ${st.pieces}`),
      el('div', {}, `${STR.common.score}: ${formatNumber(st.score)} · ${STR.game.pps}: ${(st.pieces / Math.max(0.001, st.timeMs / 1000) || 0).toFixed(1)}`),
      el('div', {}, `${w.holes}: ${countHoles(this.game.board, this.heights)} · ${w.avgHeight}: ${(sumH / BOARD_WIDTH).toFixed(1)}`),
    );

    // Network: always draw the structure (activations layered when present).
    // Lazy resize because the flex layout settles a frame after the view mounts.
    if (this.showNetwork && this.nnViz) {
      if (!this.nnViz._size.w || this.nnCanvas.clientWidth !== this._nnW) {
        this._nnW = this.nnCanvas.clientWidth;
        if (this._nnW > 0) this.nnViz.resize();
      }
      this.nnViz.setActivations(d?.activations ?? null);
      this.nnViz.render();
    }
    if (d) {
      this._renderFeaturePanel(d);
      this._renderDecisionPanel(d);
    }
    if (this.showHeatmap) {
      this.boardHeatmap.setData(this.heatmapCounts);
      this.boardHeatmap.render();
    }
  }

  _renderFeaturePanel(d) {
    if (this._lastFeatureRender === d) return;
    this._lastFeatureRender = d;
    this.featurePanel.innerHTML = '';
    for (let i = 0; i < FEATURE_COUNT; i++) {
      const v = d.best.features[i];
      this.featurePanel.append(
        el(
          'div',
          { class: 'row', style: { gap: '6px' } },
          el('span', { style: { width: '160px', fontSize: '10px', color: 'var(--text-dim)' } }, FEATURE_LABELS_ES[i]),
          el('span', { style: { width: '46px', fontSize: '10px', fontFamily: 'var(--font-mono)' } }, v.toFixed(3)),
          el('div', { style: { flex: '1', height: '5px', background: '#1d2438', borderRadius: '3px' } },
            el('div', { style: { width: `${Math.min(100, Math.abs(v) * 100)}%`, height: '100%', background: v >= 0 ? 'var(--accent)' : 'var(--accent-2)', borderRadius: '3px' } }),
          ),
        ),
      );
    }
    // Aggregated importance.
    if (this.featImportanceN > 0 && this.importancePanel) {
      const items = FEATURE_LABELS_ES.map((label, i) => ({ label, v: this.featImportance[i] / this.featImportanceN })).sort((a, b) => b.v - a.v);
      const max = items[0]?.v || 1;
      this.importancePanel.innerHTML = '';
      for (const item of items.slice(0, 8)) {
        this.importancePanel.append(
          el(
            'div',
            { class: 'row', style: { gap: '6px' } },
            el('span', { style: { width: '160px', fontSize: '10px', color: 'var(--text-dim)' } }, item.label),
            el('div', { style: { flex: '1', height: '5px', background: '#1d2438', borderRadius: '3px' } },
              el('div', { style: { width: `${(item.v / max) * 100}%`, height: '100%', background: 'var(--gold)', borderRadius: '3px' } }),
            ),
          ),
        );
      }
    }
  }

  _renderDecisionPanel(d) {
    if (this._lastDecisionRender === d) return;
    this._lastDecisionRender = d;
    const w = STR.watch;
    this.decisionPanel.innerHTML = '';
    const scores = d.candidates.map((c) => c.score);
    const gap = scores.length > 1 ? scores[0] - scores[1] : 1;
    const sd = scores.length > 1 ? Math.sqrt(scores.reduce((a, s) => a + (s - scores[0]) ** 2, 0) / scores.length) || 1 : 1;
    const conf = Math.max(0, Math.min(1, gap / (sd || 1)));
    const confLabel = conf > 0.6 ? w.confidenceHigh : conf > 0.25 ? w.confidenceMid : w.confidenceLow;

    this.decisionPanel.append(
      el('div', { class: 'log-record' }, `${PIECE_NAMES[d.type]} → rot ${d.best.rotation}, col ${d.best.x} · ${d.best.score.toFixed(3)}`),
      d.best.useHold ? el('div', { class: 'log-tuner' }, w.holdUsed) : null,
      el('div', {}, fmt(w.candidates, { n: Math.min(5, d.candidates.length) }) + ` / ${d.totalCandidates}`),
      ...d.candidates.slice(0, 5).map((c, i) =>
        el(
          'div',
          {
            style: { cursor: 'pointer', color: RANK_COLORS[i] ?? 'var(--text-dim)' },
            onmouseenter: () => (this.hoveredCandidate = i),
            onmouseleave: () => (this.hoveredCandidate = -1),
          },
          `${i + 1}. rot ${c.rotation}, col ${c.x}${c.useHold ? ' (R)' : ''} → ${c.score.toFixed(3)}${c.linesCleared ? ` · ${c.linesCleared}L` : ''}`,
        ),
      ),
      el(
        'div',
        { class: 'row', style: { margin: '6px 0' } },
        el('span', { class: 'field-hint' }, w.confidence),
        el('div', { style: { flex: '1', height: '7px', background: '#1d2438', borderRadius: '4px' } },
          el('div', { style: { width: `${conf * 100}%`, height: '100%', background: conf > 0.6 ? 'var(--green)' : conf > 0.25 ? 'var(--gold)' : 'var(--red)', borderRadius: '4px' } }),
        ),
        el('span', { class: 'field-hint' }, confLabel),
      ),
    );
    // Per-feature contribution of the winner.
    if (this.lastContrib) {
      this.contribPanel.innerHTML = '';
      const items = this.lastContrib.map((v, i) => ({ v, i })).filter((x) => x.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 8);
      const max = Math.max(...items.map((x) => Math.abs(x.v)), 1e-6);
      for (const { v, i } of items) {
        this.contribPanel.append(
          el(
            'div',
            { class: 'row', style: { gap: '6px' } },
            el('span', { style: { width: '150px', fontSize: '10px', color: 'var(--text-dim)' } }, FEATURE_LABELS_ES[i]),
            el('span', { style: { width: '52px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: v >= 0 ? 'var(--green)' : 'var(--red)' } }, `${v >= 0 ? '+' : ''}${v.toFixed(3)}`),
            el('div', { style: { flex: '1', height: '5px', background: '#1d2438', borderRadius: '3px' } },
              el('div', { style: { width: `${(Math.abs(v) / max) * 100}%`, height: '100%', background: v >= 0 ? 'var(--green)' : 'var(--red)', borderRadius: '3px' } }),
            ),
          ),
        );
      }
      // 1st vs 2nd comparison.
      if (this.lastDecision?.candidates?.length > 1) {
        const a = this.lastDecision.candidates[0];
        const b = this.lastDecision.candidates[1];
        const diffs = [];
        for (let i = 0; i < FEATURE_COUNT; i++) {
          const delta = a.features[i] - b.features[i];
          if (Math.abs(delta) > 1e-4) diffs.push({ i, delta });
        }
        diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
        if (diffs.length) {
          this.contribPanel.append(
            el('div', { class: 'panel-title', style: { marginTop: '6px' } }, STR.watch.vsSecond),
            ...diffs.slice(0, 3).map(({ i, delta }) =>
              el('div', { style: { fontSize: '10px', color: 'var(--text-dim)' } }, `${FEATURE_LABELS_ES[i]}: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`),
            ),
          );
        }
      }
    }
    // Decision log.
    this.logPanel.innerHTML = '';
    for (const entry of this.decisionLog.slice(0, 40)) {
      this.logPanel.append(
        el('div', {}, `#${entry.n} ${PIECE_NAMES[entry.type]} rot ${entry.rot} col ${entry.x}${entry.hold ? ' (R)' : ''} → ${entry.score.toFixed(2)} (${entry.cands})`),
      );
    }
  }

  resize() {
    this.nnViz?.resize();
  }

  onKeyDown(e) {
    if (this.view === 'duel') {
      if (e.key === 'Escape') this._showSelector();
      else this.duel?.input.onKeyDown(e);
      return;
    }
    if (this.view !== 'viewer') {
      if (e.key === 'Escape') {
        if (this.view === 'selector') this.ctx.manager.switchTo('menu');
        else this._showSelector();
      }
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.paused = !this.paused;
        break;
      case 'ArrowRight':
        this._stepOnce();
        break;
      case 'ArrowLeft':
        this._stepBack();
        break;
      case 'KeyN':
        this.showNetwork = !this.showNetwork;
        this.nnCanvas.style.display = this.showNetwork ? 'block' : 'none';
        break;
      case 'KeyB':
        this._openBenchmark();
        break;
      case 'Escape':
        this._showSelector();
        break;
      case 'NumpadAdd':
      case 'Equal':
        this.speed = this.speed === 0.5 ? 1 : this.speed === 1 ? 2 : 5;
        break;
      case 'NumpadSubtract':
      case 'Minus':
        this.speed = this.speed === 5 ? 2 : this.speed === 2 ? 1 : 0.5;
        break;
    }
  }

  onKeyUp(e) {
    if (this.view === 'duel') this.duel?.input.onKeyUp(e);
  }
}

function card(label, value) {
  return el('div', { class: 'stat-card' }, el('div', { class: 'stat-label' }, label), el('div', { class: 'stat-value' }, String(value)));
}
