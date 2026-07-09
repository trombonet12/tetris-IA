// Procedural audio: every SFX and the chiptune music track are synthesized
// with WebAudio oscillators/noise — zero external assets. Safe to call any
// method while the AudioContext is suspended (autoplay policy) or missing.

const SMOOTH = 0.04; // setTargetAtTime time constant for hot volume changes

/** Deterministic PRNG so the music pattern is always the same. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOT = 110; // A2
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor scale (semitones)

/** Frequency of a scale degree (degree may exceed 6 → next octave). */
function degreeFreq(degree, octave = 0) {
  const oct = octave + Math.floor(degree / MINOR.length);
  const semi = MINOR[((degree % MINOR.length) + MINOR.length) % MINOR.length];
  return ROOT * 2 ** (oct + semi / 12);
}

/**
 * Synthesized SFX + procedural chiptune sequencer.
 * settings: { sfxEnabled, musicEnabled, sfxVolume, musicVolume, muted }
 */
export class AudioEngine {
  constructor(settings = {}) {
    this.settings = {
      sfxEnabled: true,
      musicEnabled: true,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      muted: false,
      ...settings,
    };
    this.ctx = null;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) return;

    // Routing: sfx → master, music channels → musicGain → lowpass → master.
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1400;
    this.musicFilter.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.musicFilter);

    this._applyVolumes(true);

    // Shared 1s white-noise buffer for percussion / impact SFX.
    this._noiseBuffer = this._makeNoiseBuffer();

    // Music sequencer state.
    this._musicOn = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this._bpm = 100;
    this._bpmTarget = 100;
    this._danger = false;
    this._buildPattern();
  }

  // ── Settings / lifecycle ──────────────────────────────────────────────────

  /** Applies setting changes hot (volumes ramp smoothly). */
  updateSettings(settings = {}) {
    Object.assign(this.settings, settings);
    this._applyVolumes(false);
  }

  _applyVolumes(instant) {
    if (!this.ctx) return;
    const s = this.settings;
    const set = (param, value) => {
      if (instant) param.value = value;
      else param.setTargetAtTime(value, this.ctx.currentTime, SMOOTH);
    };
    set(this.master.gain, s.muted ? 0 : 1);
    set(this.sfxGain.gain, s.sfxEnabled ? s.sfxVolume : 0);
    set(this.musicGain.gain, s.musicEnabled ? s.musicVolume * 0.6 : 0);
  }

  /** Call on the first user gesture (autoplay policy). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  dispose() {
    this.stopMusic();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  /**
   * Fires a synthesized sound effect.
   * @param {string} name see the switch below
   * @param {object} opts e.g. {step} for 'combo'
   */
  play(name, opts = {}) {
    const s = this.settings;
    if (!this.ctx || s.muted || !s.sfxEnabled || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move':
        this._tone({ freq: 880, type: 'square', dur: 0.03, vol: 0.12, at: t });
        break;
      case 'rotate':
        this._tone({ freq: 620, endFreq: 940, type: 'triangle', dur: 0.06, vol: 0.2, at: t });
        break;
      case 'softdrop':
        this._tone({ freq: 210, type: 'square', dur: 0.03, vol: 0.1, at: t });
        break;
      case 'harddrop':
        this._noise({ dur: 0.12, vol: 0.35, filterFreq: 500, at: t });
        this._tone({ freq: 130, endFreq: 55, type: 'sine', dur: 0.12, vol: 0.5, at: t });
        break;
      case 'lock':
        this._tone({ freq: 1250, type: 'square', dur: 0.02, vol: 0.14, at: t });
        this._noise({ dur: 0.03, vol: 0.1, filterFreq: 2500, at: t });
        break;
      case 'clear':
        this._arpeggio([440, 554, 659], 0.055, 0.13, 0.25, t);
        break;
      case 'double':
        this._arpeggio([440, 554, 659, 880], 0.05, 0.13, 0.26, t);
        break;
      case 'triple':
        this._arpeggio([440, 554, 659, 880, 1108], 0.045, 0.14, 0.28, t);
        break;
      case 'tetris':
        this._arpeggio([523, 659, 784, 1046], 0.09, 0.3, 0.32, t, 'square');
        this._noise({ dur: 0.25, vol: 0.12, filterFreq: 5000, at: t });
        break;
      case 'tspin':
        // Characteristic twang: detuned saws with a fast pitch dip.
        this._tone({ freq: 330, endFreq: 495, type: 'sawtooth', dur: 0.2, vol: 0.2, at: t });
        this._tone({ freq: 336, endFreq: 502, type: 'sawtooth', dur: 0.2, vol: 0.14, at: t });
        break;
      case 'b2b':
        this._tone({ freq: 1318, type: 'triangle', dur: 0.35, vol: 0.14, at: t });
        this._tone({ freq: 1568, type: 'triangle', dur: 0.35, vol: 0.11, at: t + 0.04 });
        break;
      case 'combo': {
        const step = Math.min(12, Math.max(0, opts.step ?? 0));
        this._tone({ freq: 440 * 2 ** (step / 12), type: 'triangle', dur: 0.09, vol: 0.22, at: t });
        break;
      }
      case 'allclear':
        this._arpeggio([523, 659, 784, 1046, 1318, 1568], 0.11, 0.5, 0.3, t, 'square');
        this._arpeggio([262, 330, 392, 523, 659, 784], 0.11, 0.5, 0.15, t, 'triangle');
        break;
      case 'hold':
        this._tone({ freq: 587, type: 'triangle', dur: 0.05, vol: 0.18, at: t });
        this._tone({ freq: 880, type: 'triangle', dur: 0.06, vol: 0.18, at: t + 0.05 });
        break;
      case 'levelup':
        this._tone({ freq: 440, endFreq: 880, type: 'square', dur: 0.22, vol: 0.18, at: t });
        this._tone({ freq: 880, type: 'triangle', dur: 0.28, vol: 0.2, at: t + 0.18 });
        break;
      case 'gameover':
        this._arpeggio([392, 330, 262, 196], 0.18, 0.4, 0.24, t, 'sawtooth');
        break;
      case 'countdown':
        this._tone({ freq: 440, type: 'square', dur: 0.1, vol: 0.2, at: t });
        break;
      case 'go':
        this._tone({ freq: 880, type: 'square', dur: 0.16, vol: 0.24, at: t });
        break;
      case 'danger':
        this._tone({ freq: 220, type: 'square', dur: 0.09, vol: 0.2, at: t });
        this._tone({ freq: 220, type: 'square', dur: 0.09, vol: 0.2, at: t + 0.14 });
        break;
      case 'click':
        this._tone({ freq: 1000, type: 'square', dur: 0.015, vol: 0.12, at: t });
        break;
      case 'record':
        this._tone({ freq: 1568, type: 'sine', dur: 0.6, vol: 0.18, at: t });
        this._tone({ freq: 2093, type: 'sine', dur: 0.5, vol: 0.1, at: t + 0.02 });
        break;
      default:
        break;
    }
  }

  /** One oscillator note with an exponential decay envelope. */
  _tone({ freq, endFreq = null, type = 'square', dur = 0.1, vol = 0.2, at, dest = null }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.sfxGain);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Filtered white-noise burst (thuds, hats, snares). */
  _noise({ dur = 0.1, vol = 0.2, filterFreq = 2000, filterType = 'lowpass', at, dest = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest ?? this.sfxGain);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  _arpeggio(freqs, gap, noteDur, vol, at, type = 'triangle') {
    freqs.forEach((f, i) => this._tone({ freq: f, type, dur: noteDur, vol, at: at + i * gap }));
  }

  _makeNoiseBuffer() {
    const len = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ── Music: procedural chiptune sequencer ────────────────────────────────────

  /** 16-step pattern, generated once from a fixed seed (always identical). */
  _buildPattern() {
    const rng = mulberry32(0xc0ffee);
    this.bassPattern = [];
    this.arpPattern = [];
    const bassDegrees = [0, 2, 4, 5];
    const arpDegrees = [0, 2, 4, 7, 9];
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 0) this.bassPattern.push(0);
      else this.bassPattern.push(rng() < 0.55 ? bassDegrees[Math.floor(rng() * bassDegrees.length)] : -1);
      if (s % 2 === 0 || rng() < 0.3) this.arpPattern.push(arpDegrees[Math.floor(rng() * arpDegrees.length)]);
      else this.arpPattern.push(-1);
    }
  }

  startMusic() {
    if (!this.ctx || this._musicOn) return;
    this._musicOn = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.05;
    // Lookahead scheduling: wake every 25 ms, schedule 0.1 s ahead.
    this._timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic() {
    this._musicOn = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** level 1..20 → tempo ramps from 100 to ~160 BPM (glides gradually). */
  setMusicLevel(level) {
    const l = Math.min(20, Math.max(1, level));
    this._bpmTarget = 100 + ((l - 1) / 19) * 60;
  }

  /** Danger: the lowpass opens up and a high pulse joins on the beat. */
  setDanger(active) {
    this._danger = !!active;
    if (!this.ctx) return;
    const target = active ? 7000 : 1400;
    this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  _schedule() {
    if (!this.ctx || !this._musicOn) return;
    if (this.ctx.state !== 'running') {
      this._nextTime = this.ctx.currentTime + 0.05; // stay in sync while suspended
      return;
    }
    const horizon = this.ctx.currentTime + 0.1;
    while (this._nextTime < horizon) {
      this._scheduleStep(this._step, this._nextTime);
      this._bpm += (this._bpmTarget - this._bpm) * 0.03; // gradual tempo glide
      this._nextTime += 60 / this._bpm / 4; // 16th notes
      this._step = (this._step + 1) % 16;
    }
  }

  _scheduleStep(step, at) {
    const dest = this.musicGain;
    const stepDur = 60 / this._bpm / 4;
    // Bass channel: square, one octave down.
    const bass = this.bassPattern[step];
    if (bass >= 0) {
      this._tone({ freq: degreeFreq(bass, -1), type: 'square', dur: stepDur * 0.9, vol: 0.22, at, dest });
    }
    // Arpeggio channel: triangle, one octave up.
    const arp = this.arpPattern[step];
    if (arp >= 0) {
      this._tone({ freq: degreeFreq(arp, 1), type: 'triangle', dur: stepDur * 0.8, vol: 0.16, at, dest });
    }
    // Percussion: kick (0, 8), snare (4, 12), hat on even steps.
    if (step === 0 || step === 8) {
      this._tone({ freq: 150, endFreq: 50, type: 'sine', dur: 0.1, vol: 0.4, at, dest });
    }
    if (step === 4 || step === 12) {
      this._noise({ dur: 0.08, vol: 0.16, filterFreq: 1800, filterType: 'bandpass', at, dest });
    }
    if (step % 2 === 0) {
      this._noise({ dur: 0.025, vol: 0.05, filterFreq: 8000, filterType: 'highpass', at, dest });
    }
    // Danger pulse on the beat.
    if (this._danger && step % 4 === 0) {
      this._tone({ freq: 1760, type: 'square', dur: 0.05, vol: 0.07, at, dest });
    }
  }
}
