(function (global) {
  'use strict';

  const VOICES = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
  const DEFAULT_MASTER_GAIN = 0.9;
  const DEFAULT_VOICE_SETTINGS = {
    v1: { gain: 1.00, decay: 0.95 },
    v2: { gain: 0.95, decay: 0.90 },
    v3: { gain: 0.90, decay: 0.90 },
    v4: { gain: 1.00, decay: 1.15 },
    v5: { gain: 0.85, decay: 1.25 },
    v6: { gain: 0.80, decay: 1.60 }
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

  class EventBus {
    constructor() { this.handlers = {}; }
    on(name, fn) {
      if (!this.handlers[name]) this.handlers[name] = [];
      this.handlers[name].push(fn);
      return () => { this.handlers[name] = (this.handlers[name] || []).filter(h => h !== fn); };
    }
    emit(name, payload) {
      (this.handlers[name] || []).forEach(fn => {
        try { fn(payload); } catch (err) { console.error('[Engine] event handler failed', err); }
      });
    }
  }

  class UniversalPercussionEngine {
    constructor(getGridConfig) {
      this.getGridConfig = typeof getGridConfig === 'function'
        ? getGridConfig
        : () => ({ beatCount: 4, stepsPerBeat: 4, stepCount: 16 });
      this.bus = new EventBus();
      this.audioContext = null;
      this.masterGain = null;
      this.sampleCache = new Map();
      const cfg = this.getGridConfig();
      this.pattern = this._createEmptyPattern(cfg.stepCount || 16);
      this.bpm = 100;
      this.kitId = 'standard';
      this.kit = null;
      this.isReady = false;
      this.isPlaying = false;
      this.schedulerTimer = null;
      this.currentStep = 0;
      this.nextNoteTime = 0;
      this.lookaheadMs = 25;
      this.scheduleAheadTime = 0.12;
      this.masterVolume = DEFAULT_MASTER_GAIN;
      this.voiceSettings = deepClone(DEFAULT_VOICE_SETTINGS);
      this.metricAccent = { enabled: true, strength: 0.55 };
      this.metricAccentProfile = this._buildMetricAccentProfile(cfg.beatCount || 4, cfg.stepsPerBeat || 4);
      this.kits = this._createKitLibrary();
    }

    on(name, fn) { return this.bus.on(name, fn); }
    emit(name, payload) { this.bus.emit(name, payload); }

    async init() {
      if (this.isReady) return;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio API is not available.');
      this.audioContext = new Ctx();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.audioContext.destination);
      this.isReady = true;
      this.emit('ready', { engineVersion: '1.0.0-fixed' });
    }

    async ensureReady(resume = false) {
      if (!this.isReady) await this.init();
      if (resume && this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    }

    async loadKit(kitId) {
      await this.ensureReady(false);
      const kit = this.kits[kitId];
      if (!kit) {
        const err = { code: 'KIT_NOT_FOUND', message: `Kit '${kitId}' was not found.` };
        this.emit('error', err);
        throw new Error(err.message);
      }
      if (kit.type === 'sample') await this._prepareSampleKit(kit);
      this.kitId = kitId;
      this.kit = kit;
      this.voiceSettings = mergeVoiceSettings(DEFAULT_VOICE_SETTINGS, kit.defaultVoiceSettings || {});
      this.emit('kitLoaded', {
        kitId,
        labels: Object.fromEntries(Object.entries(kit.voices).map(([k, v]) => [k, v.label])),
        voiceCount: Object.keys(kit.voices).length,
        voiceSettings: deepClone(this.voiceSettings)
      });
      return kit;
    }

    setPattern(pattern) {
      const normalized = this._normalizePattern(pattern);
      if (!normalized) {
        this.emit('error', { code: 'PATTERN_INVALID', message: 'Invalid pattern received by engine.' });
        return;
      }
      if (normalized.__voiceSettings) {
        this.voiceSettings = mergeVoiceSettings(this.voiceSettings, normalized.__voiceSettings);
        delete normalized.__voiceSettings;
      }
      if (normalized.__metricAccent) {
        this.setMetricAccentState(normalized.__metricAccent, false);
        delete normalized.__metricAccent;
      }
      this.pattern = normalized;
      const grid = this.getGridConfig();
      this.metricAccentProfile = this._buildMetricAccentProfile(grid.beatCount || 4, grid.stepsPerBeat || 4);
      this.emit('patternLoaded', {
        stepCount: grid.stepCount || Object.values(this.pattern)[0].length,
        voiceCount: VOICES.length,
        voiceSettings: deepClone(this.voiceSettings),
        metricAccent: deepClone(this.metricAccent)
      });
    }

    setBpm(bpm) {
      const n = Number(bpm);
      if (!Number.isFinite(n) || n <= 0) return;
      this.bpm = n;
      this.emit('bpmChanged', { bpm: this.bpm });
    }

    setMasterVolume(v) {
      this.masterVolume = clamp(Number(v) || DEFAULT_MASTER_GAIN, 0, 1.5);
      if (this.masterGain && this.audioContext) {
        this.masterGain.gain.setTargetAtTime(this.masterVolume, this.audioContext.currentTime, 0.01);
      }
    }

    setVoiceGain(id, value) {
      if (!VOICES.includes(id)) return;
      this.voiceSettings[id].gain = clamp(Number(value) || 1, 0, 2);
      this.emit('voiceSettingsChanged', { voiceId: id, all: deepClone(this.voiceSettings) });
    }

    setVoiceDecay(id, value) {
      if (!VOICES.includes(id)) return;
      this.voiceSettings[id].decay = clamp(Number(value) || 1, 0.2, 3);
      this.emit('voiceSettingsChanged', { voiceId: id, all: deepClone(this.voiceSettings) });
    }

    setVoiceSettings(all) {
      this.voiceSettings = mergeVoiceSettings(this.voiceSettings, all || {});
      this.emit('voiceSettingsChanged', { all: deepClone(this.voiceSettings) });
    }

    getVoiceSettings() { return deepClone(this.voiceSettings); }
    setMetricAccentEnabled(enabled, emit = true) { this.metricAccent.enabled = !!enabled; if (emit) this.emit('metricAccentChanged', deepClone(this.metricAccent)); }
    setMetricAccentStrength(value, emit = true) { this.metricAccent.strength = clamp(Number(value) || 0, 0, 1); if (emit) this.emit('metricAccentChanged', deepClone(this.metricAccent)); }
    setMetricAccentState(state, emit = true) {
      if (state && typeof state === 'object') {
        if (typeof state.enabled === 'boolean') this.metricAccent.enabled = state.enabled;
        if (state.strength != null) this.metricAccent.strength = clamp(Number(state.strength) || 0, 0, 1);
      }
      if (emit) this.emit('metricAccentChanged', deepClone(this.metricAccent));
    }
    getMetricAccentState() { return deepClone(this.metricAccent); }

    async play() {
      await this.ensureReady(true);
      if (!this.kit) await this.loadKit(this.kitId);
      if (this.isPlaying) return;
      this.isPlaying = true;
      this.currentStep = 0;
      this.nextNoteTime = this.audioContext.currentTime + 0.03;
      this.emit('playbackStarted', { bpm: this.bpm, kitId: this.kitId });
      this._scheduler();
    }

    stop() {
      if (!this.isPlaying) return;
      this.isPlaying = false;
      if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
      this.currentStep = 0;
      this.emit('playbackStopped', {});
    }

    pause() {
      if (!this.isPlaying) return;
      this.isPlaying = false;
      if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
      this.emit('playbackPaused', {});
    }

    resume() { if (!this.isPlaying) this.play(); }

    getState() {
      const cfg = this.getGridConfig();
      return {
        isReady: this.isReady,
        isPlaying: this.isPlaying,
        bpm: this.bpm,
        kitId: this.kitId,
        currentStep: this.currentStep,
        stepCount: cfg.stepCount || 16,
        voiceSettings: deepClone(this.voiceSettings),
        metricAccent: deepClone(this.metricAccent)
      };
    }

    destroy() {
      this.stop();
      if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.masterGain = null;
      this.isReady = false;
    }

    _scheduler() {
      if (!this.isPlaying || !this.audioContext) return;
      while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
        this._scheduleStep(this.currentStep, this.nextNoteTime);
        this._advanceStep();
      }
      this.schedulerTimer = setTimeout(() => this._scheduler(), this.lookaheadMs);
    }

    _advanceStep() {
      const cfg = this.getGridConfig();
      const stepDuration = (60 / this.bpm) / cfg.stepsPerBeat;
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % cfg.stepCount;
    }

    _scheduleStep(stepIndex, when) {
      this.emit('step', stepIndex);
      const cfg = this.getGridConfig();
      const stepDuration = (60 / this.bpm) / cfg.stepsPerBeat;
      for (const voiceId of VOICES) {
        const step = this.pattern[voiceId]?.[stepIndex];
        if (!step || !step.on) continue;
        const chance = typeof step.chance === 'number' ? step.chance : 1;
        if (chance < 1 && Math.random() > chance) continue;
        const velocity = typeof step.velocity === 'number' ? step.velocity : 0.8;
        const accent = this._getAccent(stepIndex);
        const finalVelocity = clamp(velocity * this.voiceSettings[voiceId].gain * accent, 0.02, 2);
        const offset = typeof step.offset === 'number' ? step.offset : 0;
        this._triggerVoice(voiceId, finalVelocity, when + (offset * stepDuration));
      }
    }

    _getAccent(stepIndex) {
      if (!this.metricAccent.enabled) return 1;
      const p = this.metricAccentProfile[stepIndex % this.metricAccentProfile.length] || 1;
      return 1 + ((p - 1) * this.metricAccent.strength);
    }

    _triggerVoice(voiceId, velocity, time) {
      if (!this.kit || !this.audioContext) return;
      const voice = this.kit.voices[voiceId];
      if (!voice || typeof voice.trigger !== 'function') return;
      voice.trigger(this.audioContext, this.masterGain, velocity, time, this.voiceSettings[voiceId].decay);
    }

    _createEmptyPattern(stepCount) {
      const p = {};
      VOICES.forEach(v => { p[v] = Array.from({ length: stepCount }, () => ({ on: false })); });
      return p;
    }

    _normalizePattern(pattern) {
      if (!pattern || typeof pattern !== 'object') return null;
      const normalized = {};
      const stepCount = Math.max(...VOICES.map(v => Array.isArray(pattern[v]) ? pattern[v].length : 0));
      if (stepCount <= 0) return null;
      for (const v of VOICES) {
        if (!Array.isArray(pattern[v])) return null;
        normalized[v] = Array.from({ length: stepCount }, (_, i) => {
          const s = pattern[v][i];
          if (!s || typeof s !== 'object') return { on: false };
          return {
            on: !!s.on,
            velocity: typeof s.velocity === 'number' ? clamp(s.velocity, 0, 1) : 0.8,
            offset: typeof s.offset === 'number' ? s.offset : 0,
            chance: typeof s.chance === 'number' ? clamp(s.chance, 0, 1) : 1
          };
        });
      }
      if (pattern.voiceSettings) normalized.__voiceSettings = pattern.voiceSettings;
      if (pattern.metricAccent) normalized.__metricAccent = pattern.metricAccent;
      return normalized;
    }

    _buildMetricAccentProfile(beatCount, stepsPerBeat) {
      const weights = getBeatWeights(beatCount, stepsPerBeat);
      const arr = [];
      for (let b = 0; b < beatCount; b++) {
        const base = weights[b] || 0.8;
        for (let s = 0; s < stepsPerBeat; s++) {
          const sub = s === 0 ? 1 : (1 - 0.06 * s);
          arr.push(clamp(base * sub, 0.6, 1.2));
        }
      }
      return arr;
    }

    async _prepareSampleKit(kit) {
      for (const voice of Object.values(kit.voices)) {
        if (!voice.samplePaths || voice.buffers) continue;
        voice.buffers = [];
        for (const relPath of voice.samplePaths) {
          const abs = new URL(relPath, global.location.href).href;
          let buffer = this.sampleCache.get(abs);
          if (!buffer) {
            const response = await fetch(abs);
            if (!response.ok) throw new Error(`Failed to load sample: ${relPath}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
            this.sampleCache.set(abs, buffer);
          }
          voice.buffers.push(buffer);
        }
        voice._rrIndex = 0;
        voice.trigger = (ctx, dest, vel, time, decayMul) => playSample(ctx, dest, vel, time, voice, decayMul);
      }
    }

    _createKitLibrary() {
      return {
        standard: {
          type: 'synth',
          defaultVoiceSettings: {
            v1: { gain: 1.0, decay: 0.9 }, v2: { gain: 0.95, decay: 0.9 }, v3: { gain: 0.9, decay: 1.0 },
            v4: { gain: 0.9, decay: 1.05 }, v5: { gain: 0.85, decay: 1.1 }, v6: { gain: 0.8, decay: 1.15 }
          },
          voices: {
            v1: { label: 'KICK', trigger: (c,d,v,t,m)=>kick(c,d,v,t,m) },
            v2: { label: 'SNARE', trigger: (c,d,v,t,m)=>snare(c,d,v,t,m) },
            v3: { label: 'CLAP', trigger: (c,d,v,t,m)=>clap(c,d,v,t,m) },
            v4: { label: 'HAT', trigger: (c,d,v,t,m)=>hat(c,d,v,t,m) },
            v5: { label: 'TOM', trigger: (c,d,v,t,m)=>tom(c,d,v,t,m) },
            v6: { label: 'SHAKER', trigger: (c,d,v,t,m)=>shaker(c,d,v,t,m) }
          }
        },
        eastern: {
          type: 'synth',
          voices: {
            v1: { label: 'DUM', trigger: (c,d,v,t,m)=>dum(c,d,v,t,m) },
            v2: { label: 'TEK', trigger: (c,d,v,t,m)=>tek(c,d,v,t,m) },
            v3: { label: 'KA', trigger: (c,d,v,t,m)=>ka(c,d,v,t,m) },
            v4: { label: 'ROLL', trigger: (c,d,v,t,m)=>roll(c,d,v,t,m) },
            v5: { label: 'CLAP', trigger: (c,d,v,t,m)=>clap(c,d,v,t,m) },
            v6: { label: 'JING', trigger: (c,d,v,t,m)=>jing(c,d,v,t,m) }
          }
        },
        'eastern-real-v1': {
          type: 'sample',
          voices: {
            v1: { label: 'DUM', samplePaths: ['kits/eastern_real_v1/v1_doum_main.wav'], gain: 1.0 },
            v2: { label: 'MID', samplePaths: ['kits/eastern_real_v1/v2_mid_body.wav'], gain: 0.95 },
            v3: { label: 'MUTE', samplePaths: ['kits/eastern_real_v1/v3_mute_dry.wav'], gain: 0.90 },
            v4: { label: 'TEK', samplePaths: ['kits/eastern_real_v1/v4_tek_main.wav', 'kits/eastern_real_v1/v4_tek_hi_alt.wav'], gain: 1.0 },
            v5: { label: 'ACCENT', samplePaths: ['kits/eastern_real_v1/v5_tambourine_accent.wav'], gain: 0.85 },
            v6: { label: 'JINGLE', samplePaths: ['kits/eastern_real_v1/v6_jingle_short_a.wav', 'kits/eastern_real_v1/v6_jingle_short_b.wav'], gain: 0.80 }
          }
        },
        global: {
          type: 'synth',
          voices: {
            v1: { label: 'LOW', trigger: (c,d,v,t,m)=>kick(c,d,v,t,m) },
            v2: { label: 'BODY', trigger: (c,d,v,t,m)=>tom(c,d,v,t,m) },
            v3: { label: 'MID', trigger: (c,d,v,t,m)=>clap(c,d,v,t,m) },
            v4: { label: 'EDGE', trigger: (c,d,v,t,m)=>hat(c,d,v,t,m) },
            v5: { label: 'HAND', trigger: (c,d,v,t,m)=>ka(c,d,v,t,m) },
            v6: { label: 'METAL', trigger: (c,d,v,t,m)=>jing(c,d,v,t,m) }
          }
        }
      };
    }
  }

  function mergeVoiceSettings(base, extra) {
    const out = deepClone(base);
    for (const v of VOICES) {
      if (!extra[v]) continue;
      out[v].gain = clamp(Number(extra[v].gain ?? out[v].gain), 0, 2);
      out[v].decay = clamp(Number(extra[v].decay ?? out[v].decay), 0.2, 3);
    }
    return out;
  }

  function getBeatWeights(beatCount, stepsPerBeat) {
    const b = Number(beatCount) || 4;
    if (b === 2) return [1.00, 0.78];
    if (b === 3) return [1.00, 0.78, 0.84];
    if (b === 4) return [1.00, 0.72, 0.88, 0.76];
    if (b === 5 && stepsPerBeat === 2) return [1.00, 0.82, 0.74, 0.92, 0.76];
    if (b === 7 && stepsPerBeat === 2) return [1.00, 0.82, 0.94, 0.76, 0.90, 0.74, 0.82];
    if (b === 9 && stepsPerBeat === 2) return [1.00, 0.80, 0.92, 0.78, 0.90, 0.76, 0.88, 0.74, 0.82];
    return Array.from({ length: b }, (_, i) => i === 0 ? 1 : 0.8);
  }

  function env(ctx, time, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.01, decay));
    return g;
  }

  function noiseBuffer(ctx, duration) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function kick(ctx, dest, vel, time, decayMul) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time); osc.frequency.exponentialRampToValueAtTime(42, time + 0.22 * decayMul);
    const g = env(ctx, time, vel, 0.22 * decayMul); osc.connect(g); g.connect(dest); osc.start(time); osc.stop(time + 0.25 * decayMul);
  }
  function snare(ctx, dest, vel, time, decayMul) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.16 * decayMul);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
    const g = env(ctx, time, vel * 0.9, 0.16 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.17 * decayMul);
  }
  function clap(ctx, dest, vel, time, decayMul) {
    [0, 0.012, 0.024].forEach((off, i) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.07 * decayMul);
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
      const g = env(ctx, time + off, vel * (1 - i * 0.15), 0.07 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time + off); src.stop(time + off + 0.08 * decayMul);
    });
  }
  function hat(ctx, dest, vel, time, decayMul) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.055 * decayMul);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = env(ctx, time, vel * 0.6, 0.055 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.06 * decayMul);
  }
  function tom(ctx, dest, vel, time, decayMul) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(210, time); osc.frequency.exponentialRampToValueAtTime(110, time + 0.18 * decayMul);
    const g = env(ctx, time, vel * 0.95, 0.18 * decayMul); osc.connect(g); g.connect(dest); osc.start(time); osc.stop(time + 0.20 * decayMul);
  }
  function shaker(ctx, dest, vel, time, decayMul) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.085 * decayMul);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    const g = env(ctx, time, vel * 0.45, 0.085 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.09 * decayMul);
  }
  function dum(ctx, dest, vel, time, decayMul) { kick(ctx, dest, vel * 1.1, time, 1.15 * decayMul); }
  function tek(ctx, dest, vel, time, decayMul) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.09 * decayMul);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 1.2;
    const g = env(ctx, time, vel * 0.8, 0.09 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.10 * decayMul);
  }
  function ka(ctx, dest, vel, time, decayMul) { hat(ctx, dest, vel * 0.9, time, 0.95 * decayMul); }
  function roll(ctx, dest, vel, time, decayMul) { [0,0.018,0.034].forEach((o,i)=>tek(ctx,dest,vel*(0.85-i*0.12),time+o,0.65*decayMul)); }
  function jing(ctx, dest, vel, time, decayMul) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.11 * decayMul);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6200;
    const g = env(ctx, time, vel * 0.42, 0.11 * decayMul); src.connect(f); f.connect(g); g.connect(dest); src.start(time); src.stop(time + 0.12 * decayMul);
  }

  function playSample(ctx, dest, vel, time, voice, decayMul) {
    if (!voice.buffers || voice.buffers.length === 0) return;
    const idx = voice._rrIndex || 0;
    const buffer = voice.buffers[idx % voice.buffers.length];
    voice._rrIndex = (idx + 1) % voice.buffers.length;
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 13000;
    const g = ctx.createGain();
    const peak = Math.max(0.0001, vel * (voice.gain || 1));
    const tail = clamp((0.18 + buffer.duration * 0.55) * decayMul, 0.05, 1.4);
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.65), time + Math.min(0.08, tail * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, time + tail);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(time); src.stop(time + Math.min(buffer.duration + 0.2 * decayMul, 1.8));
  }

  global.UniversalPercussionEngine = UniversalPercussionEngine;
})(window);
