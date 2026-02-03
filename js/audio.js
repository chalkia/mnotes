/* =========================================
   mNotes AUDIO ENGINE v2 (Grid Editor)
   ========================================= */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isPlaying = false;
let currentStep = 0;
let nextNoteTime = 0.0;
let timerID = null;
let tempo = 120;
let stepsPerBeat = 2; // 2 steps = 1 beat (όγδοα) ή 4 steps (δέκατα έκτα)
// Grid Data: Array of Objects { b: bool, s: bool, h: bool }
// b=Bass, s=Snare, h=HiHat
let gridPattern = []; 
let totalSteps = 16; 

// --- 1. BETTER SOUND SYNTHESIS ---

function playKick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // Πιο "σφιχτό" Kick drum
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    osc.start(time);
    osc.stop(time + 0.5);
}

function playSnare(time) {
    // White Noise με Bandpass Filter για πιο φυσικό "ΤAΚ"
    const bufferSize = audioCtx.sampleRate * 0.1; // Short burst
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noise.start(time);
}

function playHiHat(time) {
    // "ΤΙΚ" - Υψηλές συχνότητες, πολύ σύντομο
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Χρησιμοποιούμε τετραγωνικό κύμα για μεταλλική χροιά
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, time); 
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 4000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
}

// --- 2. GRID LOGIC ---

function initGrid(steps) {
    totalSteps = steps;
    gridPattern = [];
    const container = document.getElementById('rhythm-grid');
    if(!container) return;
    
    container.innerHTML = "";
    container.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;

    for(let i=0; i<steps; i++) {
        // Data Init
        gridPattern.push({ bass: false, snare: false, hihat: false });

        // DOM Init
        const col = document.createElement('div');
        col.className = 'step-col';
        col.id = `col-${i}`;

        // Bass Cell (Top)
        const cellB = createCell(i, 'bass');
        // Snare Cell (Middle)
        const cellS = createCell(i, 'snare');
        // HiHat Cell (Bottom)
        const cellH = createCell(i, 'hihat');

        col.appendChild(cellH); // Tik πάνω (ή κάτω ανάλογα πως το θες)
        col.appendChild(cellS); // Tak μέση
        col.appendChild(cellB); // Doum κάτω
        
        container.appendChild(col);
    }
}

function createCell(index, type) {
    const div = document.createElement('div');
    div.className = `cell ${type}`;
    div.onclick = function() {
        // Toggle Logic
        const isActive = div.classList.toggle('active');
        gridPattern[index][type] = isActive;
    };
    return div;
}

function updateGridSize() {
    const val = document.getElementById('beatCount').value;
    let steps = 16; // default 4/4 (16 δεκατα εκτα)
    
    if(val === "9") steps = 18; // 9/8 (18 όγδοα ή δέκατα έκτα ανάλογα την ταχύτητα)
    if(val === "7") steps = 14; // 7/8 (14 δεκατα εκτα)
    
    // Stop if playing
    if(isPlaying) togglePlay();
    
    initGrid(steps);
}

function clearGrid() {
    gridPattern.forEach(p => { p.bass = false; p.snare = false; p.hihat = false; });
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('active'));
}

// --- 3. PRESETS (Τα "Σωστά" Μοτίβα) ---
// Εδώ ορίζεις τα Presets ώστε να γεμίζουν το Grid αυτόματα
const PRESETS = {
    // 9/8 Ζεϊμπέκικο (18 βήματα)
    // Δομή: D . . T . . D . . T . . D . . T . .
    zeibekiko: {
        steps: 18,
        data: [
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:0,h:1}, // 1
            {b:0,s:1,h:0}, {b:0,s:0,h:0}, {b:0,s:0,h:1}, // 2
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:0,h:1}, // 3
            {b:0,s:1,h:0}, {b:0,s:0,h:0}, {b:0,s:0,h:1}, // 4
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:0,h:1}, // 5...
            {b:0,s:0,h:0}, {b:0,s:1,h:0}, {b:0,s:0,h:0} 
        ]
    },
    // 4/4 Χασάπικο (16 βήματα) -> D . T . D . T .
    chasapiko: {
        steps: 16,
        data: [
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:1,h:0}, {b:0,s:0,h:0},
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:1,h:0}, {b:0,s:0,h:1}, // Fill
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:1,h:0}, {b:0,s:0,h:0},
            {b:1,s:0,h:0}, {b:0,s:0,h:0}, {b:0,s:1,h:0}, {b:0,s:0,h:0}
        ]
    }
};

function loadPreset(name) {
    if(!PRESETS[name]) return;
    const p = PRESETS[name];
    
    // Set Dropdown
    const sel = document.getElementById('beatCount');
    if(p.steps === 18) sel.value = "9";
    else if(p.steps === 14) sel.value = "7";
    else sel.value = "4";
    
    initGrid(p.steps);
    
    // Fill Grid
    for(let i=0; i<p.steps && i<p.data.length; i++) {
        const step = p.data[i];
        if(step.b) { gridPattern[i].bass = true; document.querySelector(`#col-${i} .bass`).classList.add('active'); }
        if(step.s) { gridPattern[i].snare = true; document.querySelector(`#col-${i} .snare`).classList.add('active'); }
        if(step.h) { gridPattern[i].hihat = true; document.querySelector(`#col-${i} .hihat`).classList.add('active'); }
    }
}

// --- 4. SCHEDULER ENGINE ---

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    const secondsPerStep = secondsPerBeat / 4; // Υποθέτουμε 16ths (4 steps per beat)
    
    nextNoteTime += secondsPerStep;
    currentStep++;
    if (currentStep >= totalSteps) {
        currentStep = 0;
    }
}

function scheduleNote(stepNumber, time) {
    // Visual Feedback
    requestAnimationFrame(() => {
        document.querySelectorAll('.step-col').forEach(c => c.classList.remove('playing'));
        const activeCol = document.getElementById(`col-${stepNumber}`);
        if(activeCol) activeCol.classList.add('playing');
    });

    // Audio Playback
    if(!gridPattern[stepNumber]) return;
    
    if (gridPattern[stepNumber].bass) playKick(time);
    if (gridPattern[stepNumber].snare) playSnare(time);
    if (gridPattern[stepNumber].hihat) playHiHat(time);
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(currentStep, nextNoteTime);
        nextNote();
    }
    timerID = setTimeout(scheduler, 25);
}

// --- 5. CONTROLS ---

function togglePlay() {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    isPlaying = !isPlaying;
    const btn = document.getElementById('btnPlayRhythm');

    if (isPlaying) {
        if(btn) { btn.innerHTML = '<i class="fas fa-stop"></i>'; btn.classList.add('playing'); }
        currentStep = 0;
        nextNoteTime = audioCtx.currentTime;
        scheduler();
    } else {
        if(btn) { btn.innerHTML = '<i class="fas fa-play"></i>'; btn.classList.remove('playing'); }
        clearTimeout(timerID);
        document.querySelectorAll('.step-col').forEach(c => c.classList.remove('playing'));
    }
}

function updateBpm(val) {
    tempo = val;
    const disp = document.getElementById('dispBpm');
    if(disp) disp.innerText = val;
}

// Init on Load
window.addEventListener('load', () => {
    initGrid(16); // Default 4/4
});
