/* =========================================
   mNotes AUDIO ENGINE (The BoomBoom Core)
   ========================================= */

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isPlaying = false;
let currentStep = 0;
let nextNoteTime = 0.0;
let timerID = null;
let tempo = 120;
let lookahead = 25.0; // ms
let scheduleAheadTime = 0.1; // sec
let currentRhythm = []; 

// --- 1. SOUND SYNTHESIS (Γεννήτριες Ήχου) ---

// KICK / DOUM (Βαθύ Μπάσο - Ελληνικό στυλ)
function playKick(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    osc.start(time);
    osc.stop(time + 0.5);
}

// SNARE / TAK (Οξύς Ήχος - Σαν τσίγκινο)
function playSnare(time) {
    const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800; // Λίγο πιο χαμηλά για όγκο
    
    const noiseEnvelope = audioCtx.createGain();
    noiseEnvelope.gain.setValueAtTime(0.6, time);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnvelope);
    noiseEnvelope.connect(audioCtx.destination);
    
    noise.start(time);
    noise.stop(time + 0.2);
}

// HIHAT / TIK (Για γεμίσματα)
function playHiHat(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, time);
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 10000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
}

// --- 2. RHYTHM VECTORS (Οι Ρυθμοί) ---
// 1 = Doum, 2 = Tak, 3 = Tik (fill), 0 = Silence
// Οι πίνακες είναι βασισμένοι σε δέκατα έκτα (1/16)
const RHYTHMS = {
    // 9/4 Ζεϊμέκικο (36 steps of 1/16) - Απλοποιημένη δομή για αρχή
    zeibekiko: [
        1,0,0,0, 2,0,0,0, 0,0,2,0, // 1-3
        1,0,0,0, 2,0,0,0, 0,0,2,0, // 4-6
        1,0,0,0, 2,0,0,0, 2,0,0,0  // 7-9
    ],
    
    // 7/8 Καλαματιανός (3-2-2) -> 14 steps of 1/16
    kalamatianos: [
        1,0,0,1,0,0, // 3
        2,0,0,2,     // 2
        2,0,0,2      // 2
    ],

    // 4/4 Χασάπικο (16 steps)
    chasapiko: [1, 0, 2, 0, 1, 0, 2, 3, 1, 0, 2, 0, 1, 0, 2, 0],

    // 4/4 Τσιφτετέλι (16 steps)
    tsifteteli: [1, 0, 0, 2, 0, 0, 1, 0, 2, 0, 0, 2, 0, 0, 2, 0]
};

// --- 3. SCHEDULER (Η Μηχανή Χρόνου) ---

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    // Υποθέτουμε ότι κάθε βήμα στον πίνακα είναι 1/16 (τέταρτο του beat)
    nextNoteTime += 0.25 * secondsPerBeat; 
    
    currentStep++;
    if (currentStep >= currentRhythm.length) {
        currentStep = 0;
    }
}

function scheduleNote(beatNumber, time) {
    // Visualizer Trigger (Draw on Canvas)
    requestAnimationFrame(() => drawVisualizer(beatNumber));

    // Audio Trigger
    const type = currentRhythm[beatNumber];
    if (type === 1) playKick(time);
    if (type === 2) playSnare(time);
    if (type === 3) playHiHat(time);
}

function scheduler() {
    // Όσο υπάρχουν νότες που πρέπει να παίξουν σύντομα...
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(currentStep, nextNoteTime);
        nextNote();
    }
    timerID = setTimeout(scheduler, lookahead);
}

// --- 4. CONTROLS (Σύνδεση με UI) ---

function togglePlay() {
    // Resume Audio Context (Browser requirement)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    isPlaying = !isPlaying;
    const btn = document.getElementById('btnPlayRhythm');

    if (isPlaying) {
        // Start
        if (btn) {
            btn.innerHTML = '<i class="fas fa-stop"></i>';
            btn.style.background = "#cf6679"; // Κόκκινο για Stop
            btn.style.color = "white";
        }
        
        // Load Rhythm
        const styleSelect = document.getElementById('selRhythm');
        const style = styleSelect ? styleSelect.value : 'zeibekiko';
        
        currentRhythm = RHYTHMS[style] || RHYTHMS['zeibekiko'];
        
        // Load Tempo
        const bpmInput = document.getElementById('rngBpm');
        if (bpmInput) tempo = parseInt(bpmInput.value);

        currentStep = 0;
        nextNoteTime = audioCtx.currentTime;
        scheduler();
    } else {
        // Stop
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.style.background = ""; // Επαναφορά (Accent color από CSS)
            btn.style.color = "";
        }
        clearTimeout(timerID);
    }
}

function updateBpm(val) {
    tempo = val;
    const disp = document.getElementById('dispBpm');
    if(disp) disp.innerText = val;
}

function changeRhythmStyle(styleKey) {
    if (RHYTHMS[styleKey]) {
        currentRhythm = RHYTHMS[styleKey];
        currentStep = 0; // Reset για να μην χαθεί το μέτρημα
    }
}

// --- 5. VISUALIZER (Canvas) ---
function drawVisualizer(stepIndex) {
    const canvas = document.getElementById('visualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Steps
    const stepWidth = canvas.width / currentRhythm.length;
    
    for (let i = 0; i < currentRhythm.length; i++) {
        let x = i * stepWidth;
        let noteType = currentRhythm[i];
        
        // Χρώματα
        if (i === stepIndex) {
            ctx.fillStyle = '#ffffff'; // Active Highlight (Άσπρο)
        } else if (noteType === 1) {
            ctx.fillStyle = '#ff5252'; // Kick (Κόκκινο)
        } else if (noteType === 2) {
            ctx.fillStyle = '#ffeb3b'; // Snare (Κίτρινο)
        } else if (noteType === 3) {
            ctx.fillStyle = '#448aff'; // HiHat (Μπλε)
        } else {
            ctx.fillStyle = '#222'; // Empty (Γκρι σκούρο)
        }

        // Ύψος μπάρας ανάλογα με τον ήχο
        let height = (noteType > 0) ? canvas.height : 4;
        let y = (canvas.height - height) / 2;
        
        // Λίγο κενό ανάμεσα στα κουτάκια (width - 1)
        ctx.fillRect(x, y, stepWidth - 1, height);
    }
}
