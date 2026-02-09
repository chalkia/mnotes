/* =========================================
   AUDIO ENGINE & UPLOAD HANDLER (js/audio.js)
   ========================================= */

// --- PART A: METRONOME & RHYTHM ENGINE (4 TRACKS) ---

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1, 
    lookahead: 25.0,
    
    // Grid: 4 Rows x 16 Steps (Total 64 cells)
    beats: 4,
    stepsPerBeat: 4,
    bpm: 100,

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => console.log("Audio Context Resumed"));
        }
    },

    togglePlay: function() {
        this.init(); 
        this.isPlaying = !this.isPlaying;
        
        const btn = document.getElementById('btnPlayRhythm');
        if (this.isPlaying) {
            this.currentStep = 0;
            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this.scheduler();
            if(btn) btn.innerHTML = '<i class="fas fa-stop"></i>';
        } else {
            window.clearTimeout(this.timerID);
            if(btn) btn.innerHTML = '<i class="fas fa-play"></i>';
            // Clear visuals
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
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
        if (this.currentStep >= 16) { // Loop after 16 steps
            this.currentStep = 0;
        }
    },

    scheduleNote: function(stepNumber, time) {
        // 1. Visual Highlight
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            // Remove old highlights
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            
            // Highlight current step in all rows
            const activeCells = document.querySelectorAll(`.cell[data-step="${stepNumber}"]`); 
            activeCells.forEach(c => c.classList.add('highlight'));
        }, drawTime > 0 ? drawTime : 0);

        // 2. Sound Logic
        // We find all cells globally. The UI generates them in order:
        // 0-15 (Bass), 16-31 (Chord), 32-47 (5th), 48-63 (Arp)
        const allCells = document.querySelectorAll('.cell');
        if(allCells.length === 0) return; // UI not created yet
        
        // Row 0: BASS (Red)
        if (allCells[stepNumber] && allCells[stepNumber].classList.contains('active')) {
            this.playTone(time, 'bass'); 
        }
        
        // Row 1: CHORD (Blue)
        if (allCells[16 + stepNumber] && allCells[16 + stepNumber].classList.contains('active')) {
            this.playTone(time, 'chord'); 
        }

        // Row 2: 5TH (Green)
        if (allCells[32 + stepNumber] && allCells[32 + stepNumber].classList.contains('active')) {
            this.playTone(time, 'fifth'); 
        }

        // Row 3: ARP (Yellow)
        if (allCells[48 + stepNumber] && allCells[48 + stepNumber].classList.contains('active')) {
            this.playTone(time, 'arp'); 
        }
    },

    playTone: function(time, type) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain); 
        gain.connect(this.ctx.destination);
        
        if (type === 'bass') { 
            osc.type = 'square'; 
            osc.frequency.setValueAtTime(55, time); // A1
            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
            osc.start(time); osc.stop(time + 0.3);
        } 
        else if (type === 'chord') { 
            osc.disconnect(); 
            [220, 277, 329].forEach((freq) => { // A Major Triad
                let o = this.ctx.createOscillator();
                let g = this.ctx.createGain();
                o.type = 'triangle';
                o.frequency.value = freq;
                o.connect(g); g.connect(this.ctx.destination);
                g.gain.setValueAtTime(0.1, time);
                g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
                o.start(time); o.stop(time + 0.4);
            });
        } 
        else if (type === 'fifth') { 
            osc.type = 'sine'; 
            osc.frequency.setValueAtTime(329.6, time); // E
            gain.gain.setValueAtTime(0.2, time);
            gain.gain.linearRampToValueAtTime(0.0, time + 0.5);
            osc.start(time); osc.stop(time + 0.5);
        }
        else if (type === 'arp') { 
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(440, time); // A4
            // Filter for pluck sound
            const filter = this.ctx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = 1000;
            osc.disconnect(); osc.connect(filter); filter.connect(gain);
            
            gain.gain.setValueAtTime(0.1, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            osc.start(time); osc.stop(time + 0.2);
        }
    },

    setBpm: function(val) {
        this.bpm = val;
        const disp = document.getElementById('dispBpm');
        if(disp) disp.innerText = val;
    },

    // --- SAVE / LOAD HELPERS ---
    
    getPattern: function() {
        // Returns array of 0s and 1s
        const allCells = document.querySelectorAll('.cell');
        if(allCells.length === 0) return [];
        return Array.from(allCells).map(c => c.classList.contains('active') ? 1 : 0);
    },

    setPattern: function(pattern) {
        // Force create UI if missing (hidden)
        if (!document.getElementById('sequencer-modal')) {
             if(typeof createSequencerModal === 'function') {
                 createSequencerModal();
                 document.getElementById('sequencer-modal').style.display = 'none';
             } else return;
        }
        
        const cells = document.querySelectorAll('.cell');
        // Reset
        cells.forEach(c => { 
            c.classList.remove('active'); 
            c.style.backgroundColor = '#333'; 
            c.style.boxShadow='none';
            c.style.borderColor='#444';
        });

        // Apply
        if (pattern && Array.isArray(pattern)) {
            pattern.forEach((val, i) => {
                if (val === 1 && cells[i]) {
                    cells[i].classList.add('active');
                    // Manually apply color based on row index (0-3)
                    const row = Math.floor(i / 16);
                    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];
                    if(colors[row]) {
                        cells[i].style.backgroundColor = colors[row];
                        cells[i].style.boxShadow = `0 0 8px ${colors[row]}`;
                        cells[i].style.borderColor = colors[row];
                    }
                }
            });
        }
    }
};

// Global Hooks
function togglePlay() { AudioEngine.togglePlay(); }
function updateBpm(val) { AudioEngine.setBpm(val); }


// --- PART B: CLOUD UPLOAD LOGIC ---

async function uploadAudioToCloud(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    if (!currentUser) {
        showToast("Please login to upload audio!", "error");
        return;
    }

    const progressBox = document.getElementById('uploadProgressBox');
    const progressBar = document.getElementById('uploadBar');
    const uploadText = document.getElementById('uploadText');
    const btnLabel = document.querySelector('.upload-btn-styled');
    
    if(progressBox) progressBox.style.display = 'block';
    if(btnLabel) btnLabel.style.opacity = '0.5';
    if(uploadText) uploadText.innerText = "Uploading 0%";

    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${currentUser.id}/${Date.now()}_${safeName}`;

        const { data, error } = await supabaseClient
            .storage
            .from('audio_files')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: { publicUrl } } = supabaseClient
            .storage
            .from('audio_files')
            .getPublicUrl(fileName);

        if(uploadText) uploadText.innerText = "Saving...";
        if(progressBar) progressBar.style.width = "100%";

        const newRecording = {
            id: Date.now(),
            name: file.name,
            url: publicUrl,
            date: new Date().toISOString()
        };

        if (typeof addRecordingToCurrentSong === 'function') {
            await addRecordingToCurrentSong(newRecording);
        } else {
            console.error("addRecordingToCurrentSong missing");
        }

        showToast("Audio uploaded successfully! ☁️");
        inputElement.value = ""; 

    } catch (err) {
        console.error("Upload failed:", err);
        showToast("Upload failed: " + err.message, "error");
    } finally {
        if(progressBox) setTimeout(() => progressBox.style.display = 'none', 2000);
        if(btnLabel) btnLabel.style.opacity = '1';
    }
}
window.importAudioFile = uploadAudioToCloud;


// --- PART C: SEQUENCER UI (COLORED 4-TRACK POPUP) ---

window.toggleSequencerUI = function() {
    let modal = document.getElementById('sequencer-modal');
    if (!modal) {
        createSequencerModal();
        modal = document.getElementById('sequencer-modal');
    }
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
    
    // Resume context on interaction (Browsers block audio otherwise)
    if(AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
        AudioEngine.ctx.resume();
    }
};

function createSequencerModal() {
    const div = document.createElement('div');
    div.id = 'sequencer-modal';
    div.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(5px);
    `;

    div.innerHTML = `
        <div style="background:#1a1a1a; padding:20px; border-radius:12px; border:1px solid #444; width:95%; max-width:600px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0; color:#fff; font-family:sans-serif;">🎹 Rhythm Composer</h3>
                <button onclick="document.getElementById('sequencer-modal').style.display='none'" style="background:none; border:none; color:#999; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div style="display:grid; grid-template-columns: 60px 1fr; gap:10px; margin-bottom:5px; font-size:0.8rem; color:#aaa;">
                <div></div>
                <div style="display:flex; justify-content:space-between; padding-right:2px;">
                    <span>1</span><span>2</span><span>3</span><span>4</span>
                </div>
            </div>

            <div id="sequencer-rows" style="display:flex; flex-direction:column; gap:8px;"></div>

            <div style="text-align:right; margin-top:20px;">
                 <button onclick="AudioEngine.setPattern([])" 
                    style="font-size:0.8rem; background:#333; color:#ccc; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">
                    Clear All
                 </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(div);
    
    // Inject CSS for the playhead animation
    const style = document.createElement('style');
    style.innerHTML = `
        .cell.highlight {
            border: 1px solid #fff !important;
            opacity: 0.8;
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);

    generateGridRows(div.querySelector('#sequencer-rows'));
}

function generateGridRows(container) {
    const tracks = [
        { name: "BASS",  color: "#e74c3c" }, // Red
        { name: "CHORD", color: "#3498db" }, // Blue
        { name: "5TH",   color: "#2ecc71" }, // Green
        { name: "ARP",   color: "#f1c40f" }  // Yellow
    ];

    tracks.forEach((track, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = "display:grid; grid-template-columns: 60px 1fr; gap:10px; align-items:center;";

        const label = document.createElement('div');
        label.innerText = track.name;
        label.style.cssText = `color:${track.color}; font-weight:bold; font-size:0.75rem; text-align:right; letter-spacing:1px;`;
        rowDiv.appendChild(label);

        const stepsContainer = document.createElement('div');
        stepsContainer.style.cssText = "display:flex; gap:4px;";
        
        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.step = i; 
            
            cell.style.cssText = `
                flex:1; aspect-ratio:1; 
                background:#333; border:1px solid #444; border-radius:3px; 
                cursor:pointer; transition: 0.1s;
            `;

            if (i === 3 || i === 7 || i === 11) {
                cell.style.marginRight = "12px"; // Gap between beats
            }

            cell.onclick = function() {
                this.classList.toggle('active');
                if (this.classList.contains('active')) {
                    this.style.backgroundColor = track.color;
                    this.style.boxShadow = `0 0 8px ${track.color}`;
                    this.style.borderColor = track.color;
                } else {
                    this.style.backgroundColor = '#333';
                    this.style.boxShadow = 'none';
                    this.style.borderColor = '#444';
                }
            };
            stepsContainer.appendChild(cell);
        }
        rowDiv.appendChild(stepsContainer);
        container.appendChild(rowDiv);
    });
}
