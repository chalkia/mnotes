(function (global) {
    'use strict';

    const DEFAULT_MASTER_GAIN = 0.9;
    const VOICES = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

    class UniversalPercussionEngine {
        constructor(getGridConfig) {
            this.getGridConfig = typeof getGridConfig === 'function'
                ? getGridConfig
                : () => ({ stepCount: 16, stepsPerBeat: 4 });

            this.handlers = {};
            this.audioContext = null;
            this.masterGain = null;
            this.activeChokes = new Map();

            const initialStepCount = this.getGridConfig().stepCount;
            this.pattern = this._createEmptyPattern(initialStepCount);
            this.stepCount = initialStepCount;
            this.kitId = 'standard';
            this.kit = null;
            this.bpm = 100;

            this.isReady = false;
            this.isPlaying = false;
            this.currentStep = 0;
            this.nextNoteTime = 0;
            this.schedulerTimer = null;

            this.lookaheadMs = 25;
            this.scheduleAheadTime = 0.12;
            this.masterVolume = DEFAULT_MASTER_GAIN;

            this.kits = this._createKitLibrary();
        }

        on(eventName, handler) {
            if (!this.handlers[eventName]) this.handlers[eventName] = [];
            this.handlers[eventName].push(handler);
            return () => {
                this.handlers[eventName] = (this.handlers[eventName] || []).filter(h => h !== handler);
            };
        }

        emit(eventName, payload) {
            (this.handlers[eventName] || []).forEach(handler => {
                try {
                    handler(payload);
                } catch (err) {
                    console.error('[UniversalPercussionEngine] Event handler failed:', err);
                }
            });
        }

        async init() {
            if (this.isReady) return;
            const Ctx = global.AudioContext || global.webkitAudioContext;
            if (!Ctx) {
                const error = { code: 'AUDIO_CONTEXT_UNSUPPORTED', message: 'This browser does not support Web Audio.' };
                this.emit('error', error);
                throw new Error(error.message);
            }
            this.audioContext = new Ctx();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.audioContext.destination);
            this.isReady = true;
            this.emit('ready', { engineVersion: '0.2.0-synth' });
        }

        async ensureReady(resumeContext = false) {
            if (!this.isReady) await this.init();
            if (resumeContext && this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        }

        async loadKit(kitId) {
            await this.ensureReady(false);
            this.emit('kitLoading', { kitId });
            const kit = this.kits[kitId];
            if (!kit) {
                const error = { code: 'KIT_NOT_FOUND', message: `Kit '${kitId}' was not found.` };
                this.emit('kitLoadFailed', error);
                this.emit('error', error);
                throw new Error(error.message);
            }
            this.kitId = kitId;
            this.kit = kit;
            this.emit('kitLoaded', {
                kitId,
                labels: Object.fromEntries(Object.entries(kit.voices).map(([k, v]) => [k, v.label])),
                voiceCount: Object.keys(kit.voices).length
            });
            return kit;
        }

        setPattern(pattern) {
            const normalized = this._normalizePattern(pattern);
            if (!normalized) {
                const error = { code: 'PATTERN_INVALID', message: 'Invalid pattern received by engine.' };
                this.emit('patternInvalid', error);
                this.emit('error', error);
                return;
            }
            this.pattern = normalized;
            this.stepCount = normalized.v1.length;
            this.currentStep = Math.min(this.currentStep, Math.max(0, this.stepCount - 1));
            this.emit('patternLoaded', { stepCount: this.stepCount, voiceCount: Object.keys(normalized).length });
        }

        setBpm(bpm) {
            const next = Number(bpm);
            if (!Number.isFinite(next) || next <= 0) {
                this.emit('error', { code: 'BPM_INVALID', message: 'Invalid BPM value.' });
                return;
            }
            this.bpm = next;
            this.emit('bpmChanged', { bpm: this.bpm });
        }

        setMasterVolume(value) {
            const next = Math.max(0, Math.min(1, Number(value) || DEFAULT_MASTER_GAIN));
            this.masterVolume = next;
            if (this.masterGain && this.audioContext) {
                this.masterGain.gain.setTargetAtTime(next, this.audioContext.currentTime, 0.01);
            }
        }

        async play() {
            try {
                await this.ensureReady(true);
                if (!this.kit) await this.loadKit(this.kitId || 'standard');
                if (this.isPlaying) return;
                this.isPlaying = true;
                this.currentStep = 0;
                this.nextNoteTime = this.audioContext.currentTime + 0.03;
                this.emit('playbackStarted', { bpm: this.bpm, kitId: this.kitId });
                this._scheduler();
            } catch (err) {
                this.emit('error', { code: 'PLAY_FAILED', message: err.message || 'Playback failed.' });
            }
        }

        stop() {
            if (!this.isPlaying) return;
            this.isPlaying = false;
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
            this.currentStep = 0;
            this.emit('playbackStopped', {});
        }

        pause() {
            if (!this.isPlaying) return;
            this.isPlaying = false;
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
            this.emit('playbackPaused', {});
        }

        resume() {
            if (this.isPlaying) return;
            this.play();
            this.emit('playbackResumed', {});
        }

        getState() {
            return {
                bpm: this.bpm,
                kitId: this.kitId,
                currentStep: this.currentStep,
                isPlaying: this.isPlaying,
                isReady: this.isReady,
                stepCount: this.stepCount
            };
        }

        destroy() {
            this.stop();
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close().catch(() => {});
            }
            this.audioContext = null;
            this.masterGain = null;
            this.activeChokes.clear();
            this.isReady = false;
            this.emit('destroyed', {});
            this.handlers = {};
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
            const { stepsPerBeat } = this.getGridConfig();
            const stepDuration = (60 / this.bpm) / stepsPerBeat;
            this.nextNoteTime += stepDuration;
            this.currentStep = (this.currentStep + 1) % this.stepCount;
        }

        _scheduleStep(stepIndex, time) {
            this.emit('step', stepIndex);
            for (const voiceId of VOICES) {
                const step = this.pattern?.[voiceId]?.[stepIndex];
                if (!step || !step.on) continue;

                const chance = typeof step.chance === 'number' ? step.chance : 1;
                if (chance < 1 && Math.random() > chance) continue;

                const velocity = typeof step.velocity === 'number' ? step.velocity : 0.8;
                const offsetSteps = typeof step.offset === 'number' ? step.offset : 0;
                const { stepsPerBeat } = this.getGridConfig();
                const stepDuration = (60 / this.bpm) / stepsPerBeat;
                const scheduledTime = time + (offsetSteps * stepDuration);
                this._triggerVoice(voiceId, velocity, scheduledTime);
            }
        }

        _triggerVoice(voiceId, velocity, time) {
            if (!this.audioContext || !this.kit) return;
            const recipe = this.kit.voices[voiceId];
            if (!recipe) return;

            const velocityJitter = recipe.humanize?.velocity ?? 0;
            const timeJitter = recipe.humanize?.time ?? 0;
            const scheduledVelocity = clamp(velocity + randRange(-velocityJitter, velocityJitter), 0.05, 1);
            const scheduledTime = Math.max(this.audioContext.currentTime - 0.005, time + randRange(-timeJitter, timeJitter));

            if (recipe.chokeGroup) {
                this._choke(recipe.chokeGroup, scheduledTime);
            }

            const trigger = pickTrigger(recipe);
            if (typeof trigger !== 'function') return;
            const gainNode = trigger(this.audioContext, this.masterGain, scheduledVelocity, scheduledTime);

            if (recipe.chokeGroup && gainNode) {
                this.activeChokes.set(recipe.chokeGroup, gainNode);
            }
        }

        _choke(groupName, time) {
            const active = this.activeChokes.get(groupName);
            if (!active || !active.gain) return;
            try {
                active.gain.cancelScheduledValues(time);
                active.gain.setTargetAtTime(0.0001, time, 0.01);
            } catch (_) {
                // ignore stale nodes
            }
        }

        _createEmptyPattern(stepCount) {
            const pattern = {};
            VOICES.forEach(voice => {
                pattern[voice] = Array.from({ length: stepCount }, () => ({ on: false }));
            });
            return pattern;
        }

        _normalizePattern(patternInput) {
            if (!patternInput || typeof patternInput !== 'object') return null;

            const pattern = patternInput.voices && typeof patternInput.voices === 'object'
                ? patternInput.voices
                : patternInput;

            const normalized = {};
            let stepCount = Number.isInteger(patternInput.stepCount) ? patternInput.stepCount : 0;

            for (const voiceId of VOICES) {
                if (!Array.isArray(pattern[voiceId])) return null;
                stepCount = Math.max(stepCount, pattern[voiceId].length);
            }
            if (stepCount <= 0) return null;

            for (const voiceId of VOICES) {
                normalized[voiceId] = Array.from({ length: stepCount }, (_, index) => {
                    const step = pattern[voiceId][index];
                    if (!step || typeof step !== 'object') return { on: false };
                    return {
                        on: !!step.on,
                        velocity: typeof step.velocity === 'number' ? clamp(step.velocity, 0, 1) : 0.8,
                        offset: typeof step.offset === 'number' ? step.offset : 0,
                        chance: typeof step.chance === 'number' ? clamp(step.chance, 0, 1) : 1
                    };
                });
            }
            return normalized;
        }

        _createKitLibrary() {
            return {
                standard: {
                    voices: {
                        v1: { label: 'KICK', humanize: { velocity: 0.03, time: 0.001 }, triggers: [
                            (ctx, dest, vel, time) => kick(ctx, dest, time, vel, { tone: 1.0 }),
                            (ctx, dest, vel, time) => kick(ctx, dest, time, vel, { tone: 0.94 }),
                            (ctx, dest, vel, time) => kick(ctx, dest, time, vel, { tone: 1.06 })
                        ]},
                        v2: { label: 'SNARE', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => snare(ctx, dest, time, vel, { snap: 1.0 }),
                            (ctx, dest, vel, time) => snare(ctx, dest, time, vel, { snap: 0.92 }),
                            (ctx, dest, vel, time) => snare(ctx, dest, time, vel, { snap: 1.08 })
                        ]},
                        v3: { label: 'CLAP', humanize: { velocity: 0.06, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => clap(ctx, dest, time, vel, 0),
                            (ctx, dest, vel, time) => clap(ctx, dest, time, vel, 0.004)
                        ], chokeGroup: 'hand'},
                        v4: { label: 'HAT', humanize: { velocity: 0.04, time: 0.001 }, triggers: [
                            (ctx, dest, vel, time) => hat(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => hat(ctx, dest, time, vel, 0.9),
                            (ctx, dest, vel, time) => hat(ctx, dest, time, vel, 1.08)
                        ], chokeGroup: 'metal'},
                        v5: { label: 'TOM', humanize: { velocity: 0.04, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => tom(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => tom(ctx, dest, time, vel, 0.94)
                        ]},
                        v6: { label: 'SHAKER', humanize: { velocity: 0.05, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => shaker(ctx, dest, time, vel, 0),
                            (ctx, dest, vel, time) => shaker(ctx, dest, time, vel, 0.006)
                        ], chokeGroup: 'metal'}
                    }
                },
                eastern: {
                    voices: {
                        v1: { label: 'DUM', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => dum(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => dum(ctx, dest, time, vel, 0.93),
                            (ctx, dest, vel, time) => dum(ctx, dest, time, vel, 1.08)
                        ]},
                        v2: { label: 'TEK', humanize: { velocity: 0.06, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => tek(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => tek(ctx, dest, time, vel, 0.92),
                            (ctx, dest, vel, time) => tek(ctx, dest, time, vel, 1.1)
                        ], chokeGroup: 'edge'},
                        v3: { label: 'KA', humanize: { velocity: 0.08, time: 0.0025 }, triggers: [
                            (ctx, dest, vel, time) => ka(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => ka(ctx, dest, time, vel, 0.88)
                        ], chokeGroup: 'edge'},
                        v4: { label: 'ROLL', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => roll(ctx, dest, time, vel),
                            (ctx, dest, vel, time) => flutter(ctx, dest, time, vel)
                        ]},
                        v5: { label: 'CLAP', humanize: { velocity: 0.06, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => clap(ctx, dest, time, vel, 0),
                            (ctx, dest, vel, time) => clap(ctx, dest, time, vel, 0.005)
                        ], chokeGroup: 'hand'},
                        v6: { label: 'JING', humanize: { velocity: 0.07, time: 0.0025 }, triggers: [
                            (ctx, dest, vel, time) => jing(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => jing(ctx, dest, time, vel, 0.92)
                        ], chokeGroup: 'metal'}
                    }
                },
                global: {
                    voices: {
                        v1: { label: 'LOW', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => bayan(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => bayan(ctx, dest, time, vel, 0.93)
                        ]},
                        v2: { label: 'HIGH', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => dayan(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => dayan(ctx, dest, time, vel, 0.9)
                        ]},
                        v3: { label: 'TAP', humanize: { velocity: 0.06, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => naStroke(ctx, dest, time, vel),
                            (ctx, dest, vel, time) => ka(ctx, dest, time, vel * 0.9, 0.9)
                        ], chokeGroup: 'high'},
                        v4: { label: 'RING', humanize: { velocity: 0.05, time: 0.0015 }, triggers: [
                            (ctx, dest, vel, time) => tin(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => tin(ctx, dest, time, vel, 1.08)
                        ]},
                        v5: { label: 'HAND', humanize: { velocity: 0.06, time: 0.002 }, triggers: [
                            (ctx, dest, vel, time) => clap(ctx, dest, time, vel, 0),
                            (ctx, dest, vel, time) => handTap(ctx, dest, time, vel)
                        ], chokeGroup: 'hand'},
                        v6: { label: 'METAL', humanize: { velocity: 0.07, time: 0.0025 }, triggers: [
                            (ctx, dest, vel, time) => khartal(ctx, dest, time, vel, 1.0),
                            (ctx, dest, vel, time) => khartal(ctx, dest, time, vel, 0.9)
                        ], chokeGroup: 'metal'}
                    }
                }
            };
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function pickTrigger(recipe) {
        if (Array.isArray(recipe.triggers) && recipe.triggers.length > 0) {
            const idx = Math.floor(Math.random() * recipe.triggers.length);
            return recipe.triggers[idx];
        }
        return recipe.trigger;
    }

    function createGainEnvelope(ctx, time, attack, peak, decay, floor = 0.0001) {
        const gain = ctx.createGain();
        const safePeak = Math.max(floor, peak);
        gain.gain.setValueAtTime(floor, time);
        gain.gain.exponentialRampToValueAtTime(safePeak, time + Math.max(0.001, attack));
        gain.gain.exponentialRampToValueAtTime(floor, time + Math.max(0.01, decay));
        return gain;
    }

    function connectAndStop(source, gain, destination, time, stopTime) {
        source.connect(gain);
        gain.connect(destination);
        source.start(time);
        source.stop(stopTime);
        return gain;
    }

    function createNoiseBuffer(ctx, duration = 0.2) {
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1);
        return buffer;
    }

    function noiseSource(ctx, duration) {
        const src = ctx.createBufferSource();
        src.buffer = createNoiseBuffer(ctx, duration);
        return src;
    }

    function clickBody(ctx, destination, time, velocity, freqStart, freqEnd, decay, type = 'sine', gainScale = 1) {
        const osc = ctx.createOscillator();
        const gain = createGainEnvelope(ctx, time, 0.001, velocity * gainScale, decay);
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), time + decay);
        return connectAndStop(osc, gain, destination, time, time + decay + 0.04);
    }

    function filteredNoise(ctx, destination, time, velocity, duration, filterType, frequency, q = 0.7, gainScale = 0.8) {
        const src = noiseSource(ctx, duration);
        const filter = ctx.createBiquadFilter();
        const gain = createGainEnvelope(ctx, time, 0.001, Math.max(0.0001, velocity * gainScale), duration);
        filter.type = filterType;
        filter.frequency.setValueAtTime(frequency, time);
        filter.Q.value = q;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        src.start(time);
        src.stop(time + duration + 0.02);
        return gain;
    }

    function tonalBurst(ctx, destination, time, velocity, frequency, decay, type = 'triangle', gainScale = 0.4) {
        const osc = ctx.createOscillator();
        const gain = createGainEnvelope(ctx, time, 0.001, velocity * gainScale, decay);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, time);
        return connectAndStop(osc, gain, destination, time, time + decay + 0.02);
    }

    function kick(ctx, destination, time, velocity, options = {}) {
        const tone = options.tone || 1;
        clickBody(ctx, destination, time, velocity, 140 * tone, 42 * tone, 0.24, 'sine', 1.1);
        tonalBurst(ctx, destination, time + 0.002, velocity, 65 * tone, 0.12, 'triangle', 0.25);
        return filteredNoise(ctx, destination, time, velocity * 0.32, 0.03, 'lowpass', 240 * tone, 0.3, 0.35);
    }

    function snare(ctx, destination, time, velocity, options = {}) {
        const snap = options.snap || 1;
        filteredNoise(ctx, destination, time, velocity, 0.15, 'bandpass', 1900 * snap, 0.9, 0.92);
        return clickBody(ctx, destination, time, velocity * 0.52, 260 * snap, 170 * snap, 0.1, 'triangle', 0.65);
    }

    function clap(ctx, destination, time, velocity, spread = 0) {
        let last = null;
        [0, 0.011 + spread, 0.024 + spread].forEach((offset, idx) => {
            last = filteredNoise(ctx, destination, time + offset, velocity * (1 - idx * 0.15), 0.065, 'highpass', 1500, 0.7, 0.75);
        });
        return last;
    }

    function hat(ctx, destination, time, velocity, tone = 1) {
        return filteredNoise(ctx, destination, time, velocity, 0.05, 'highpass', 7200 * tone, 0.2, 0.42);
    }

    function tom(ctx, destination, time, velocity, tone = 1) {
        clickBody(ctx, destination, time, velocity, 220 * tone, 112 * tone, 0.2, 'sine', 0.96);
        return tonalBurst(ctx, destination, time + 0.003, velocity * 0.7, 180 * tone, 0.08, 'triangle', 0.18);
    }

    function shaker(ctx, destination, time, velocity, spread = 0) {
        let last = null;
        [0, 0.012 + spread, 0.025 + spread].forEach((offset, idx) => {
            last = filteredNoise(ctx, destination, time + offset, velocity * (0.72 - idx * 0.08), 0.03, 'highpass', 5200, 0.3, 0.28);
        });
        return last;
    }

    function dum(ctx, destination, time, velocity, tone = 1) {
        clickBody(ctx, destination, time, velocity, 128 * tone, 52 * tone, 0.28, 'sine', 1.25);
        tonalBurst(ctx, destination, time + 0.004, velocity, 82 * tone, 0.11, 'triangle', 0.22);
        return filteredNoise(ctx, destination, time, velocity * 0.18, 0.02, 'lowpass', 420 * tone, 0.2, 0.18);
    }

    function tek(ctx, destination, time, velocity, brightness = 1) {
        filteredNoise(ctx, destination, time, velocity, 0.085, 'bandpass', 2800 * brightness, 1.35, 0.82);
        return clickBody(ctx, destination, time, velocity * 0.35, 980 * brightness, 540 * brightness, 0.05, 'triangle', 0.33);
    }

    function ka(ctx, destination, time, velocity, brightness = 1) {
        return filteredNoise(ctx, destination, time, velocity, 0.045, 'highpass', 3700 * brightness, 0.9, 0.48);
    }

    function roll(ctx, destination, time, velocity) {
        let last = null;
        [0, 0.016, 0.031].forEach((offset, idx) => {
            last = filteredNoise(ctx, destination, time + offset, velocity * (0.84 - idx * 0.1), 0.035, 'bandpass', 2400 + idx * 300, 1.1, 0.46);
        });
        return last;
    }

    function flutter(ctx, destination, time, velocity) {
        let last = null;
        [0, 0.014, 0.027, 0.04].forEach((offset, idx) => {
            last = filteredNoise(ctx, destination, time + offset, velocity * (0.65 - idx * 0.08), 0.025, 'highpass', 3200, 0.8, 0.32);
        });
        return last;
    }

    function jing(ctx, destination, time, velocity, tone = 1) {
        filteredNoise(ctx, destination, time, velocity, 0.08, 'highpass', 6500 * tone, 0.25, 0.42);
        return tonalBurst(ctx, destination, time + 0.002, velocity * 0.7, 4200 * tone, 0.07, 'triangle', 0.12);
    }

    function bayan(ctx, destination, time, velocity, tone = 1) {
        clickBody(ctx, destination, time, velocity, 170 * tone, 72 * tone, 0.3, 'sine', 1.08);
        return tonalBurst(ctx, destination, time + 0.003, velocity, 95 * tone, 0.1, 'triangle', 0.2);
    }

    function dayan(ctx, destination, time, velocity, tone = 1) {
        clickBody(ctx, destination, time, velocity, 540 * tone, 330 * tone, 0.15, 'triangle', 0.68);
        return filteredNoise(ctx, destination, time, velocity * 0.16, 0.02, 'bandpass', 2400 * tone, 1.5, 0.22);
    }

    function naStroke(ctx, destination, time, velocity) {
        filteredNoise(ctx, destination, time, velocity, 0.035, 'highpass', 3400, 0.6, 0.34);
        return clickBody(ctx, destination, time, velocity * 0.46, 1250, 730, 0.03, 'square', 0.16);
    }

    function tin(ctx, destination, time, velocity, tone = 1) {
        clickBody(ctx, destination, time, velocity, 800 * tone, 470 * tone, 0.16, 'triangle', 0.6);
        return tonalBurst(ctx, destination, time + 0.004, velocity, 1220 * tone, 0.08, 'sine', 0.08);
    }

    function handTap(ctx, destination, time, velocity) {
        return filteredNoise(ctx, destination, time, velocity, 0.025, 'bandpass', 1200, 0.8, 0.24);
    }

    function khartal(ctx, destination, time, velocity, tone = 1) {
        filteredNoise(ctx, destination, time, velocity, 0.06, 'highpass', 7100 * tone, 0.2, 0.5);
        return tonalBurst(ctx, destination, time + 0.002, velocity * 0.6, 5000 * tone, 0.05, 'square', 0.08);
    }

    global.UniversalPercussionEngine = UniversalPercussionEngine;
})(window);
