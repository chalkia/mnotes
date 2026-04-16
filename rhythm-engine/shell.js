(function () {
  'use strict';

  const DEFAULT_BEAT_COUNT = 4;
  const DEFAULT_STEPS_PER_BEAT = 4;
  const DEFAULT_ASSET_NAME = 'Untitled Rhythm';
  const DEFAULT_AUTHOR_ID = 'local-shell';
  const VOICES = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
  const UI_VOICE_ORDER = ['v6', 'v5', 'v4', 'v3', 'v2', 'v1'];
  const VOICE_COLORS = { v1:'#e74c3c', v2:'#2ecc71', v3:'#3498db', v4:'#f1c40f', v5:'#9b59b6', v6:'#95a5a6' };

  const state = {
    bpm: 100,
    currentKit: 'standard',
    beatCount: DEFAULT_BEAT_COUNT,
    stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
    assetId: generateAssetId(),
    assetName: DEFAULT_ASSET_NAME,
    voiceSettings: createDefaultVoiceSettings(),
    metricAccent: { enabled: true, strength: 0.55 },
    pattern: createEmptyPattern(DEFAULT_BEAT_COUNT * DEFAULT_STEPS_PER_BEAT)
  };

  function $(id) { return document.getElementById(id); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function generateAssetId() { return `rthm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
  function createDefaultVoiceSettings() {
    return {
      v1: { gain: 1.00, decay: 0.95 }, v2: { gain: 0.95, decay: 0.90 }, v3: { gain: 0.90, decay: 0.90 },
      v4: { gain: 1.00, decay: 1.15 }, v5: { gain: 0.85, decay: 1.25 }, v6: { gain: 0.80, decay: 1.60 }
    };
  }
  function getStepCount() { return state.beatCount * state.stepsPerBeat; }
  function getMeterLabel() { return `${state.beatCount}/${state.stepsPerBeat === 4 ? '4' : '8'}`; }
  function createEmptyPattern(stepCount) {
    const pattern = {};
    VOICES.forEach(v => { pattern[v] = Array.from({ length: stepCount }, () => ({ on: false })); });
    return pattern;
  }

  function showToast(message, type='info') {
    const host = $('toast-host'); if (!host) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`; toast.textContent = message;
    host.appendChild(toast); setTimeout(() => toast.remove(), 2200);
  }
  window.showToast = showToast;

  function addLog(message, type='info') {
    const box = $('event-log'); if (!box) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const ts = new Date().toLocaleTimeString('el-GR', { hour12: false });
    line.textContent = `[${ts}] ${message}`;
    box.prepend(line);
  }

  function buildGrid() {
    const stepHeader = $('grid-header');
    const voiceRows = $('voice-rows');
    const stepCount = getStepCount();
    stepHeader.innerHTML = ''; voiceRows.innerHTML = '';
    stepHeader.style.gridTemplateColumns = `260px repeat(${stepCount}, minmax(34px, 1fr))`;

    const empty = document.createElement('div'); empty.className = 'voice-label muted'; empty.textContent = 'VOICES'; stepHeader.appendChild(empty);
    for (let step = 0; step < stepCount; step++) {
      const label = document.createElement('div'); label.className = 'step-label';
      if (step % state.stepsPerBeat === 0) label.classList.add('beat-start');
      label.textContent = step + 1; stepHeader.appendChild(label);
    }

    UI_VOICE_ORDER.forEach(voiceId => {
      const row = document.createElement('div'); row.className = 'voice-row'; row.dataset.voice = voiceId;
      row.style.gridTemplateColumns = `260px repeat(${stepCount}, minmax(34px, 1fr))`;
      const label = document.createElement('div');
      label.className = 'voice-label voice-strip';
      label.innerHTML = `
        <div class="voice-strip-head"><strong id="label-${voiceId}">${voiceId.toUpperCase()}</strong><span>${voiceId}</span></div>
        <div class="voice-controls">
          <label class="voice-control"><span>Level</span><input type="range" min="0" max="200" value="${Math.round(state.voiceSettings[voiceId].gain * 100)}" data-role="gain" data-voice="${voiceId}"><output id="gain-out-${voiceId}">${Math.round(state.voiceSettings[voiceId].gain * 100)}</output></label>
          <label class="voice-control"><span>Tail</span><input type="range" min="20" max="300" value="${Math.round(state.voiceSettings[voiceId].decay * 100)}" data-role="decay" data-voice="${voiceId}"><output id="decay-out-${voiceId}">${Math.round(state.voiceSettings[voiceId].decay * 100)}</output></label>
        </div>`;
      row.appendChild(label);
      for (let step = 0; step < stepCount; step++) {
        const cell = document.createElement('div'); cell.className = 'cell';
        if (step % state.stepsPerBeat === 0) cell.classList.add('beat-start');
        cell.dataset.voice = voiceId; cell.dataset.step = String(step);
        cell.style.setProperty('--active-color', VOICE_COLORS[voiceId]);
        cell.addEventListener('click', () => toggleCell(voiceId, step, cell));
        row.appendChild(cell);
      }
      voiceRows.appendChild(row);
    });
    bindVoiceControls();
  }

  function bindVoiceControls() {
    document.querySelectorAll('.voice-control input[data-role="gain"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const voiceId = inp.dataset.voice; const value = clamp(Number(inp.value) / 100, 0, 2);
        state.voiceSettings[voiceId].gain = value; $(`gain-out-${voiceId}`).textContent = String(Math.round(value * 100));
        window.AudioBridge.engine?.setVoiceGain?.(voiceId, value); syncPreview();
      });
    });
    document.querySelectorAll('.voice-control input[data-role="decay"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const voiceId = inp.dataset.voice; const value = clamp(Number(inp.value) / 100, 0.2, 3);
        state.voiceSettings[voiceId].decay = value; $(`decay-out-${voiceId}`).textContent = String(Math.round(value * 100));
        window.AudioBridge.engine?.setVoiceDecay?.(voiceId, value); syncPreview();
      });
    });
  }

  function toggleCell(voiceId, stepIndex, cell) {
    const current = state.pattern[voiceId][stepIndex] || { on: false };
    const next = !current.on;
    state.pattern[voiceId][stepIndex] = next ? { on: true, velocity: 0.8, offset: 0, chance: 1.0 } : { on: false };
    cell.classList.toggle('active', next); pushPattern();
  }

  function withSettings(pattern) {
    const cloned = clone(pattern); cloned.voiceSettings = clone(state.voiceSettings); cloned.metricAccent = clone(state.metricAccent); return cloned;
  }
  function countActiveCells() { return VOICES.reduce((sum, v) => sum + state.pattern[v].filter(s => s.on).length, 0); }

  function syncPreview() {
    $('pattern-preview').textContent = JSON.stringify(getCurrentAsset(), null, 2);
    $('status-bpm').textContent = String(state.bpm);
    $('status-kit').textContent = state.currentKit;
    $('status-meter').textContent = getMeterLabel();
    $('status-steps').textContent = String(getStepCount());
    $('status-active-cells').textContent = String(countActiveCells());
    $('status-accent').textContent = state.metricAccent.enabled ? `${Math.round(state.metricAccent.strength * 100)}%` : 'OFF';
    $('badge-grid').textContent = `Grid: 6 voices × ${getStepCount()} steps`;
    $('badge-meter').textContent = `Meter: ${getMeterLabel()}`;
  }

  function applyPatternToGrid(pattern) {
    VOICES.forEach(voiceId => {
      for (let step = 0; step < getStepCount(); step++) {
        const cell = document.querySelector(`.cell[data-voice="${voiceId}"][data-step="${step}"]`);
        if (cell) cell.classList.toggle('active', !!pattern[voiceId]?.[step]?.on);
      }
    });
    syncPreview();
  }

  function resizePattern(newStepCount) {
    const resized = createEmptyPattern(newStepCount);
    VOICES.forEach(v => { for (let i = 0; i < Math.min(newStepCount, state.pattern[v].length); i++) resized[v][i] = clone(state.pattern[v][i]); });
    state.pattern = resized;
  }

  function setMeter(beats, stepsPerBeat) {
    state.beatCount = Math.max(1, Math.min(16, Number(beats) || DEFAULT_BEAT_COUNT));
    state.stepsPerBeat = [2, 3, 4].includes(Number(stepsPerBeat)) ? Number(stepsPerBeat) : DEFAULT_STEPS_PER_BEAT;
    resizePattern(getStepCount()); buildGrid(); applyPatternToGrid(state.pattern); pushPattern();
    addLog(`Grid updated to ${getMeterLabel()} (${getStepCount()} steps).`, 'success');
  }

  function activateSteps(pattern, voiceId, indices, velocity = 0.8) {
    const stepCount = getStepCount();
    indices.forEach(i => { if (i >= 0 && i < stepCount) pattern[voiceId][i] = { on: true, velocity, offset: 0, chance: 1 }; });
  }

  function loadDemoPattern(name) {
    const stepCount = getStepCount();
    const beatStarts = Array.from({ length: state.beatCount }, (_, i) => i * state.stepsPerBeat);
    const pattern = createEmptyPattern(stepCount);
    if (name === 'standard') {
      activateSteps(pattern, 'v1', beatStarts, 0.92);
      if (state.beatCount >= 2) activateSteps(pattern, 'v2', beatStarts.filter((_, i) => i % 2 === 1), 0.82);
      const hats = []; for (let beat = 0; beat < state.beatCount; beat++) { const half = beat * state.stepsPerBeat + Math.floor(state.stepsPerBeat / 2); if (half < stepCount) hats.push(half); }
      activateSteps(pattern, 'v4', hats, 0.65);
    } else if (name === 'eastern' || name === 'eastern-real-v1') {
      const strong = beatStarts.filter((_, i) => i === 0 || i === 2 || i === state.beatCount - 1);
      const edge = beatStarts.map(s => s + Math.max(1, state.stepsPerBeat - 1)).filter(i => i < stepCount);
      const ghosts = beatStarts.map(s => s + 1).filter(i => i < stepCount);
      const rolls = beatStarts.filter((_, i) => i % 2 === 1).map(s => s + Math.floor(state.stepsPerBeat / 2)).filter(i => i < stepCount);
      activateSteps(pattern, 'v1', strong, 0.95); activateSteps(pattern, 'v2', edge, 0.82); activateSteps(pattern, 'v3', ghosts, 0.55); activateSteps(pattern, 'v4', rolls, 0.68);
      if (name === 'eastern-real-v1') state.currentKit = 'eastern-real-v1';
    } else {
      activateSteps(pattern, 'v1', beatStarts.filter((_, i) => i % 2 === 0), 0.95);
      activateSteps(pattern, 'v2', beatStarts.filter((_, i) => i % 2 === 1), 0.86);
      activateSteps(pattern, 'v3', beatStarts.map(s => s + Math.max(0, Math.floor(state.stepsPerBeat / 2) - 1)).filter(i => i < stepCount), 0.72);
      activateSteps(pattern, 'v4', beatStarts.map(s => s + Math.max(1, state.stepsPerBeat - 1)).filter(i => i < stepCount), 0.68);
      activateSteps(pattern, 'v6', beatStarts.map(s => s + Math.max(1, state.stepsPerBeat - 1)).filter(i => i < stepCount), 0.62);
    }
    state.pattern = pattern;
    $('kit-select').value = state.currentKit;
    $('asset-name').value = `${name} ${getMeterLabel()}`;
    applyPatternToGrid(state.pattern); pushPattern(); addLog(`Loaded demo pattern: ${name} for ${getMeterLabel()}.`, 'success');
  }

  function sanitizeFileName(value) {
    const safe = String(value || DEFAULT_ASSET_NAME).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return safe || 'untitled-rhythm';
  }
  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function getCurrentAsset() {
    return { assetType: 'mGroove', schemaVersion: 2, metadata: { id: state.assetId, name: state.assetName || DEFAULT_ASSET_NAME, authorId: DEFAULT_AUTHOR_ID, timeSignature: getMeterLabel(), defaultBpm: state.bpm, preferredKit: state.currentKit }, pattern: { stepCount: getStepCount(), voiceSettings: clone(state.voiceSettings), metricAccent: clone(state.metricAccent), voices: clone(state.pattern) } };
  }
  function exportCurrentAsset() {
    const asset = getCurrentAsset(); const filename = `${sanitizeFileName(asset.metadata.name)}.mnr`;
    downloadTextFile(filename, JSON.stringify(asset, null, 2), 'application/x-mnotes-rhythm+json');
    addLog(`Exported asset: ${filename}`, 'success'); showToast(`Exported ${filename}`, 'success');
  }

  function mergeVoiceSettingsLocal(extra) {
    if (!extra || typeof extra !== 'object') return;
    for (const v of VOICES) {
      if (!extra[v]) continue;
      state.voiceSettings[v].gain = clamp(Number(extra[v].gain ?? state.voiceSettings[v].gain), 0, 2);
      state.voiceSettings[v].decay = clamp(Number(extra[v].decay ?? state.voiceSettings[v].decay), 0.2, 3);
    }
  }

  async function importAssetFile(file) {
    const text = await file.text(); const asset = JSON.parse(text);
    if (!asset || asset.assetType !== 'mGroove' || !asset.pattern || !asset.pattern.voices) throw new Error('Invalid .mnr asset');
    const stepCount = Number(asset.pattern.stepCount); if (!Number.isInteger(stepCount) || stepCount <= 0) throw new Error('Invalid stepCount');
    const sig = String(asset.metadata?.timeSignature || '').trim(); const m = sig.match(/^(\d+)\/(\d+)$/);
    if (m) {
      state.beatCount = Number(m[1]); state.stepsPerBeat = Number(m[2]) === 4 ? 4 : 2;
      const inferred = Math.round(stepCount / state.beatCount); if ([2,3,4].includes(inferred)) state.stepsPerBeat = inferred;
    }
    resizePattern(stepCount);
    VOICES.forEach(v => {
      const arr = asset.pattern.voices[v]; if (!Array.isArray(arr)) throw new Error(`Missing voice ${v}`);
      state.pattern[v] = Array.from({ length: stepCount }, (_, i) => {
        const s = arr[i]; if (!s || typeof s !== 'object') return { on: false };
        return { on: !!s.on, velocity: typeof s.velocity === 'number' ? clamp(s.velocity, 0, 1) : 0.8, offset: typeof s.offset === 'number' ? s.offset : 0, chance: typeof s.chance === 'number' ? clamp(s.chance, 0, 1) : 1 };
      });
    });
    state.assetId = String(asset.metadata?.id || generateAssetId());
    state.assetName = String(asset.metadata?.name || DEFAULT_ASSET_NAME);
    state.bpm = Number(asset.metadata?.defaultBpm) > 0 ? Number(asset.metadata.defaultBpm) : 100;
    if (asset.metadata?.preferredKit) state.currentKit = String(asset.metadata.preferredKit);
    mergeVoiceSettingsLocal(asset.pattern.voiceSettings);
    if (asset.pattern.metricAccent) { state.metricAccent.enabled = !!asset.pattern.metricAccent.enabled; state.metricAccent.strength = clamp(Number(asset.pattern.metricAccent.strength) || 0, 0, 1); }
    $('kit-select').value = state.currentKit; $('rng-bpm').value = String(state.bpm); $('bpm-output').value = String(state.bpm); $('beat-count').value = String(state.beatCount); $('steps-per-beat').value = String(state.stepsPerBeat); $('asset-name').value = state.assetName; $('accent-enabled').checked = state.metricAccent.enabled; $('accent-strength').value = String(Math.round(state.metricAccent.strength * 100)); $('accent-strength-out').textContent = `${Math.round(state.metricAccent.strength * 100)}%`;
    buildGrid(); applyPatternToGrid(state.pattern); await window.AudioBridge.loadKit(state.currentKit); window.AudioBridge.engine?.setVoiceSettings?.(state.voiceSettings); window.AudioBridge.engine?.setMetricAccentState?.(state.metricAccent); pushPattern(); addLog(`Imported asset: ${file.name}`, 'success');
  }

  function pushPattern() { window.AudioBridge.loadPattern(withSettings(state.pattern)); syncPreview(); }

  function wireControls(engine) {
    $('btn-play').addEventListener('click', () => window.AudioBridge.play());
    $('btn-stop').addEventListener('click', () => window.AudioBridge.stop());
    $('btn-clear').addEventListener('click', () => { state.pattern = createEmptyPattern(getStepCount()); applyPatternToGrid(state.pattern); pushPattern(); });
    $('btn-load-demo').addEventListener('click', () => loadDemoPattern($('demo-select').value));
    $('btn-push-pattern').addEventListener('click', pushPattern);
    $('btn-reset-engine').addEventListener('click', async () => {
      engine.stop(); await window.AudioBridge.loadKit($('kit-select').value); engine.setVoiceSettings?.(state.voiceSettings); engine.setMetricAccentState?.(state.metricAccent); pushPattern(); addLog('Engine reset sequence completed.', 'warn');
    });
    $('btn-export-mnr-top').addEventListener('click', exportCurrentAsset);
    $('btn-import-mnr').addEventListener('click', () => $('file-import-mnr').click());
    $('file-import-mnr').addEventListener('change', async () => {
      const file = $('file-import-mnr').files && $('file-import-mnr').files[0]; if (!file) return;
      try { await importAssetFile(file); } catch (err) { console.error(err); showToast(err.message || 'Import failed', 'error'); addLog(err.message || 'Import failed', 'error'); } finally { $('file-import-mnr').value = ''; }
    });
    $('asset-name').addEventListener('input', () => { state.assetName = $('asset-name').value.trim() || DEFAULT_ASSET_NAME; syncPreview(); });
    $('rng-bpm').addEventListener('input', () => { state.bpm = Number($('rng-bpm').value); $('bpm-output').value = String(state.bpm); window.AudioBridge.setBpm(state.bpm); syncPreview(); });
    $('kit-select').addEventListener('change', async () => { state.currentKit = $('kit-select').value; await window.AudioBridge.loadKit(state.currentKit); if (engine.getVoiceSettings) state.voiceSettings = engine.getVoiceSettings(); buildGrid(); applyPatternToGrid(state.pattern); pushPattern(); });
    $('btn-apply-grid').addEventListener('click', () => setMeter($('beat-count').value, $('steps-per-beat').value));
    document.querySelectorAll('.preset-meter').forEach(btn => { btn.addEventListener('click', () => { $('beat-count').value = String(btn.dataset.beats); $('steps-per-beat').value = String(btn.dataset.steps); setMeter(btn.dataset.beats, btn.dataset.steps); }); });
    $('accent-enabled').addEventListener('change', () => { state.metricAccent.enabled = $('accent-enabled').checked; engine.setMetricAccentEnabled?.(state.metricAccent.enabled); syncPreview(); });
    $('accent-strength').addEventListener('input', () => { state.metricAccent.strength = clamp(Number($('accent-strength').value) / 100, 0, 1); $('accent-strength-out').textContent = `${Math.round(state.metricAccent.strength * 100)}%`; engine.setMetricAccentStrength?.(state.metricAccent.strength); syncPreview(); });
  }

  function bindEngineEvents(engine) {
    engine.on('ready', ({ engineVersion }) => { $('status-engine').textContent = `UniversalPercussionEngine ${engineVersion}`; addLog(`Engine ready (${engineVersion}).`, 'success'); });
    engine.on('playbackStarted', ({ bpm }) => { $('status-playing').textContent = 'YES'; addLog(`Playback started at ${bpm} BPM.`, 'success'); });
    engine.on('playbackStopped', () => { $('status-playing').textContent = 'NO'; addLog('Playback stopped.', 'warn'); });
    engine.on('bpmChanged', ({ bpm }) => { $('status-bpm').textContent = String(bpm); });
    engine.on('kitLoaded', ({ kitId, voiceSettings }) => { $('status-kit').textContent = kitId; if (voiceSettings) state.voiceSettings = clone(voiceSettings); addLog(`Kit loaded: ${kitId}.`, 'success'); });
    engine.on('patternLoaded', ({ stepCount, metricAccent }) => { $('status-steps').textContent = String(stepCount); if (metricAccent) state.metricAccent = clone(metricAccent); syncPreview(); });
    engine.on('voiceSettingsChanged', ({ all }) => { if (all) state.voiceSettings = clone(all); });
    engine.on('metricAccentChanged', (accent) => { if (accent) { state.metricAccent = clone(accent); $('accent-enabled').checked = state.metricAccent.enabled; $('accent-strength').value = String(Math.round(state.metricAccent.strength * 100)); $('accent-strength-out').textContent = `${Math.round(state.metricAccent.strength * 100)}%`; } syncPreview(); });
    engine.on('error', ({ message }) => { addLog(message || 'Engine error', 'error'); showToast(message || 'Engine error', 'error'); });
  }

  async function bootstrap() {
    buildGrid();
    const EngineCtor = globalThis.UniversalPercussionEngine || globalThis.DrumMachine;
    if (!EngineCtor) throw new Error('Audio engine constructor not found.');
    const engine = new EngineCtor(() => ({ beatCount: state.beatCount, stepsPerBeat: state.stepsPerBeat, stepCount: getStepCount() }));
    window.AudioBridge = new MNotesAudioBridge(engine);
    bindEngineEvents(engine); wireControls(engine);
    $('status-engine').textContent = 'UniversalPercussionEngine (booting...)'; $('status-bpm').textContent = String(state.bpm); $('status-kit').textContent = state.currentKit; $('status-meter').textContent = getMeterLabel(); $('status-steps').textContent = String(getStepCount()); $('status-active-cells').textContent = '0';
    await engine.init(); await window.AudioBridge.loadKit(state.currentKit); engine.setMetricAccentState?.(state.metricAccent); buildGrid(); pushPattern(); addLog('Fixed standalone shell initialized.', 'success');
  }

  document.addEventListener('DOMContentLoaded', () => { bootstrap().catch(err => { console.error(err); showToast(err.message || 'Bootstrap failed', 'error'); }); });
})();
