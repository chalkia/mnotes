/* =========================================
   AUDIO ENGINE & UPLOAD HANDLER (js/audio.js)
   ========================================= */
// --- PART A: METRONOME & RHYTHM ENGINE ---

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1, // sec
    lookahead: 25.0, // ms
    
    // Grid Data
    beats: 4,
    stepsPerBeat: 4,
    grid: new Array(64).fill(0),
    bpm: 100,

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    togglePlay: function() {
        this.init();
        this.isPlaying = !this.isPlaying;
        
        const btn = document.getElementById('btnPlayRhythm');
        if (this.isPlaying) {
            this.currentStep = 0;
            this.nextNoteTime = this.ctx.currentTime + 0.05;
            this.scheduler();
            if(btn) btn.innerHTML = '<i class="fas fa-stop"></i>';
        } else {
            window.clearTimeout(this.timerID);
            if(btn) btn.innerHTML = '<i class="fas fa-play"></i>';
            // Clear highlights visual
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
        }
    },

    scheduler: function() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentStep, this.nextNoteTime);
            this.nextStep();
        }
        this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    },

    nextStep: function() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        
        this.currentStep++;
        const totalSteps = this.beats * this.stepsPerBeat;
        if (this.currentStep >= totalSteps) {
            this.currentStep = 0;
        }
    },

    scheduleNote: function(stepNumber, time) {
        // 1. Visual Highlight (Queued for exact sync)
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            // Remove old highlights
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            
            // Highlight current step cells (εφόσον το popup είναι ανοιχτό)
            // Χρησιμοποιούμε το data-step attribute που θα έχουν τα κελιά
            const activeCells = document.querySelectorAll(`.cell[data-step="${stepNumber}"]`); 
            activeCells.forEach(c => c.classList.add('highlight'));
        }, drawTime > 0 ? drawTime : 0);

        // 2. Sound Logic
        const container = document.getElementById('rhythm-grid');
        // Αν το Sequencer UI δεν έχει ανοίξει ποτέ, το container ίσως είναι null, οπότε δεν παίζει ήχο
        if(!container) return; 
        
        const cells = Array.from(container.children);
        const totalSteps = this.beats * 4;
        
        // Row 0: Bass (Kick)
        if (cells[stepNumber] && cells[stepNumber].classList.contains('active')) {
            this.playTone(time, 1); 
        }
        
        // Row 1: Snare/Chord
        if (cells[totalSteps + stepNumber] && cells[totalSteps + stepNumber].classList.contains('active')) {
            this.playTone(time, 2); 
        }

        // Row 2: HiHat/Alt
        if (cells[(totalSteps*2) + stepNumber] && cells[(totalSteps*2) + stepNumber].classList.contains('active')) {
            this.playTone(time, 3); 
        }
    },

    playTone: function(time, type) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        
        if (type === 1) { // BASS (Sawtooth Kick)
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(110, time);
            filter.frequency.setValueAtTime(1500, time);
            filter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.8, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
            osc.start(time); osc.stop(time + 0.5);
        } 
        else if (type === 3) { // ALT (HiHat/Perc)
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(82, time);
            filter.frequency.setValueAtTime(1500, time);
            filter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.6, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            osc.start(time); osc.stop(time + 0.3);
        } 
        else if (type === 2) { // CHORD (Strum)
            // Σβήνουμε τον αρχικό osc γιατί εδώ φτιάχνουμε 3 δικούς μας
            osc.disconnect(); 
            [196, 246, 329].forEach((f, i) => { // G major chord parts
                const sOsc = this.ctx.createOscillator();
                const sGain = this.ctx.createGain();
                sOsc.type = 'triangle'; 
                sOsc.frequency.value = f;
                sOsc.connect(sGain); sGain.connect(this.ctx.destination);
                
                let t = time + (i*0.015); // Strum effect
                sGain.gain.setValueAtTime(0, t);
                sGain.gain.linearRampToValueAtTime(0.3, t+0.01);
                sGain.gain.exponentialRampToValueAtTime(0.001, t+0.2);
                sOsc.start(t); sOsc.stop(t+0.25);
            });
        }
    },

    setBpm: function(val) {
        this.bpm = val;
        // Update UI Display immediately
        const disp = document.getElementById('dispBpm');
        if(disp) disp.innerText = val;
    }
};

// --- PART B: CLOUD UPLOAD LOGIC ---

async function uploadAudioToCloud(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    if (!currentUser) {
        showToast("Please login to upload audio!", "error");
        return;
    }

    // UI Updates (Progress Bar)
    const progressBox = document.getElementById('uploadProgressBox');
    const progressBar = document.getElementById('uploadBar');
    const uploadText = document.getElementById('uploadText');
    const btnLabel = document.querySelector('.upload-btn-styled');
    
    if(progressBox) progressBox.style.display = 'block';
    if(btnLabel) btnLabel.style.opacity = '0.5';
    if(uploadText) uploadText.innerText = "Uploading 0%";

    try {
        // 1. Δημιουργία Μοναδικού Ονόματος
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${currentUser.id}/${Date.now()}_${safeName}`;

        // 2. Upload στο Supabase (Bucket: audio_files)
        const { data, error } = await supabaseClient
            .storage
            .from('audio_files') // <--- ΣΩΣΤΟ BUCKET NAME
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // 3. Λήψη του Public Link
        const { data: { publicUrl } } = supabaseClient
            .storage
            .from('audio_files')
            .getPublicUrl(fileName);

        if(uploadText) uploadText.innerText = "Saving to library...";
        if(progressBar) progressBar.style.width = "100%";

        // 4. Αποθήκευση στη Βάση (Πίνακας personal_overrides)
        const newRecording = {
            id: Date.now(),
            name: file.name,
            url: publicUrl,
            date: new Date().toISOString()
        };

        // Καλούμε τη συνάρτηση αποθήκευσης στο logic.js
        if (typeof addRecordingToCurrentSong === 'function') {
            await addRecordingToCurrentSong(newRecording);
        } else {
            console.error("addRecordingToCurrentSong function missing in logic.js");
        }

        showToast("Audio uploaded successfully! ☁️");
        inputElement.value = ""; // Καθαρισμός input

    } catch (err) {
        console.error("Upload failed:", err);
        showToast("Upload failed: " + err.message, "error");
    } finally {
        // Απόκρυψη μπάρας μετά από λίγο
        if(progressBox) setTimeout(() => progressBox.style.display = 'none', 2000);
        if(btnLabel) btnLabel.style.opacity = '1';
    }
}

// COMPATIBILITY BRIDGE
// Επειδή στο HTML μπορεί να έχει μείνει το 'importAudioFile' αντί για 'uploadAudioToCloud'
window.importAudioFile = uploadAudioToCloud;


// --- PART C: SEQUENCER UI (POPUP LOGIC) ---

// Αυτή η συνάρτηση καλείται από το κουμπί "Open Drum Machine"
window.toggleSequencerUI = function() {
    let modal = document.getElementById('sequencer-modal');

    // 1. Αν δεν υπάρχει το Modal, το δημιουργούμε τώρα (Lazy Creation)
    if (!modal) {
        createSequencerModal();
        modal = document.getElementById('sequencer-modal');
    }

    // 2. Toggle εμφάνισης
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
    }
};

// Βοηθητική συνάρτηση που φτιάχνει το HTML του Sequencer
function createSequencerModal() {
    const div = document.createElement('div');
    div.id = 'sequencer-modal';
    
    // Στυλ για το Overlay (μαύρο φόντο)
    div.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(5px);
    `;

    // Το εσωτερικό παράθυρο
    div.innerHTML = `
        <div style="background:var(--bg-secondary, #222); padding:20px; border-radius:12px; border:1px solid var(--border-color, #444); width:95%; max-width:500px; text-align:center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:var(--text-primary, #fff);"><i class="fas fa-drum"></i> Drum Machine</h3>
                <button onclick="document.getElementById('sequencer-modal').style.display='none'" style="background:none; border:none; color:#999; font-size:1.2rem; cursor:pointer;">&times;</button>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#888; margin-bottom:5px; padding:0 2px;">
                <span>KICK</span><span>SNARE</span><span>HIHAT</span>
            </div>

            <div id="rhythm-grid" style="
                display:grid; 
                grid-template-columns: repeat(16, 1fr); 
                gap: 3px; 
                margin-bottom: 20px;
                padding: 10px;
                background: #111;
                border-radius: 6px;
            ">
                </div>

            <div style="text-align:right;">
                 <button onclick="AudioEngine.grid.fill(0); document.querySelectorAll('.cell.active').forEach(c=>c.classList.remove('active'))" 
                    style="font-size:0.8rem; background:#333; color:#ccc; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    Clear Pattern
                 </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(div);

    // 3. Γέμισμα του Grid (3 γραμμές x 16 στήλες)
    const gridContainer = div.querySelector('#rhythm-grid');
    const totalCells = 16 * 3; // 48 κουτάκια
    
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        
        // Υπολογισμός στήλης (0-15) για το highlight effect
        const colIndex = i % 16; 
        cell.dataset.step = colIndex; 

        // Βασικό Στυλ κουτιού
        cell.style.cssText = `
            aspect-ratio: 1;
            background: #333;
            border-radius: 2px;
            cursor: pointer;
            transition: background 0.1s;
        `;

        // Διαχωριστικό κάθε 4 steps (για να φαίνεται το μέτρο)
        if (colIndex % 4 === 0 && colIndex !== 0) {
            cell.style.borderLeft = '1px solid #666';
        }

        // Click Handler: Toggle Active Class
        cell.onclick = function() {
            this.classList.toggle('active');
            updateCellStyle(this);
        };

        gridContainer.appendChild(cell);
    }
}

// Helper για να αλλάζει χρώμα το κουτάκι
function updateCellStyle(cell) {
    if (cell.classList.contains('active')) {
        cell.style.backgroundColor = 'var(--accent, #f39c12)';
        cell.style.boxShadow = '0 0 5px var(--accent, #f39c12)';
    } else {
        cell.style.backgroundColor = '#333';
        cell.style.boxShadow = 'none';
    }
}

// CSS Style Injection για το 'highlight' class (για να φωτίζει όταν παίζει)
const style = document.createElement('style');
style.innerHTML = `
    .cell.highlight {
        border: 1px solid #fff !important;
        opacity: 0.8;
    }
`;
document.head.appendChild(style);
