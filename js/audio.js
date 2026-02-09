/* =========================================
   AUDIO ENGINE & UPLOAD HANDLER (js/audio.js)
   ========================================= */

// --- PART A: PERCUSSION ENGINE & DYNAMIC GRID ---

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1, 
    lookahead: 25.0,
    noiseBuffer: null, // Για τα πιατίνια (Hats)
    
    // Grid Configuration (Δυναμικό)
    beats: 4,         // Ξεκινάμε με 4 μέτρα (16 steps)
    stepsPerBeat: 4,  // 16th notes
    bpm: 100,

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.createNoiseBuffer(); // Δημιουργία 'θορύβου' για τα πιατίνια
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // Βοηθητικό για τον ήχο "Zilia/Hat"
    createNoiseBuffer: function() {
        const bufferSize = this.ctx.sampleRate * 2.0; 
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
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
        this.nextNoteTime += 0.25 * secondsPerBeat; 
        
        this.currentStep++;
        // Το loop εξαρτάται από το πόσα beats έχει ορίσει ο χρήστης
        const totalSteps = this.beats * this.stepsPerBeat;
        if (this.currentStep >= totalSteps) { 
            this.currentStep = 0;
        }
    },

    scheduleNote: function(stepNumber, time) {
        // 1. Visual Highlight & Auto-Scroll
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            const activeCells = document.querySelectorAll(`.cell[data-step="${stepNumber}"]`); 
            activeCells.forEach(c => c.classList.add('highlight'));
            
            // Αν το πλέγμα είναι μεγάλο, κάνε scroll για να φαίνεται η μπάρα
            if (activeCells.length > 0 && activeCells[0]) {
                activeCells[0].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
        }, drawTime > 0 ? drawTime : 0);

        // 2. Sound Logic (Percussion)
        const allCells = document.querySelectorAll('.cell');
        if(allCells.length === 0) return;
        
        // Υπολογισμός μήκους γραμμής (Beats * 4)
        const rowLength = this.beats * 4;

        // ΣΕΙΡΑ (Από πάνω προς τα κάτω στο HTML):
        // Row 0: HATS (Top)
        // Row 1: RIM
        // Row 2: TOM
        // Row 3: KICK (Bottom)

        // Hats (Zilia)
        if (allCells[stepNumber] && allCells[stepNumber].classList.contains('active')) {
            this.playPercussion(time, 'hat'); 
        }
        
        // Rim (Ksylo)
        if (allCells[rowLength + stepNumber] && allCells[rowLength + stepNumber].classList.contains('active')) {
            this.playPercussion(time, 'rim'); 
        }

        // Tom (Bendir)
        if (allCells[(rowLength*2) + stepNumber] && allCells[(rowLength*2) + stepNumber].classList.contains('active')) {
            this.playPercussion(time, 'tom'); 
        }

        // Kick (Daouli - Bottom)
        if (allCells[(rowLength*3) + stepNumber] && allCells[(rowLength*3) + stepNumber].classList.contains('active')) {
            this.playPercussion(time, 'kick'); 
        }
    },

    playPercussion: function(time, type) {
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);

        if (type === 'kick') { 
            // Deep Kick (Νταούλι)
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.frequency.setValueAtTime(120, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.5); 
            
            gain.gain.setValueAtTime(1.0, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            
            osc.start(time); osc.stop(time + 0.5);
        } 
        else if (type === 'tom') { 
            // Tom (Μπεντίρ - Βαθύ αλλά πιο μαλακό)
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = 'triangle'; 
            osc.frequency.setValueAtTime(100, time);
            osc.frequency.linearRampToValueAtTime(60, time + 0.3);
            
            gain.gain.setValueAtTime(0.7, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
            
            osc.start(time); osc.stop(time + 0.35);
        }
        else if (type === 'rim') { 
            // Rim (Ξύλο/Στεφάνι)
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, time);
            
            gain.gain.setValueAtTime(0.6, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05); // Πολύ κοφτό
            
            osc.start(time); osc.stop(time + 0.06);
        }
        else if (type === 'hat') { 
            // Hat (Ζίλια - Θόρυβος + Φίλτρο)
            const bufferSource = this.ctx.createBufferSource();
            bufferSource.buffer = this.noiseBuffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = "highpass";
            filter.frequency.value = 4000; // Μόνο πρίμα
            
            bufferSource.connect(filter);
            filter.connect(gain);
            
            gain.gain.setValueAtTime(0.4, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05); 
            
            bufferSource.start(time); bufferSource.stop(time + 0.06);
        }
    },

    setBpm: function(val) {
        this.bpm = val;
        const disp = document.getElementById('dispBpm');
        if(disp) disp.innerText = val;
    },
    
    // Αλλαγή αριθμού Beats (Δυναμικό Grid)
    setBeats: function(newBeats) {
        if(newBeats < 1) return;
        if(newBeats > 16) return; // Όριο για να μην κρασάρει το UI
        this.beats = newBeats;
        
        // Αν το UI είναι ανοιχτό, το ξαναζωγραφίζουμε
        const container = document.getElementById('sequencer-rows');
        if(container) {
            container.innerHTML = '';
            generateGridRows(container);
        }
        
        // Update display
        const countSpan = document.getElementById('beat-count-display');
        if(countSpan) countSpan.innerText = this.beats;
    },

    // --- SAVE / LOAD HELPERS ---
    getPattern: function() {
        const allCells = document.querySelectorAll('.cell');
        if(allCells.length === 0) return { beats: 4, grid: [] };
        
        // Αποθηκεύουμε ΚΑΙ τα beats ΚΑΙ το μοτίβο
        const gridData = Array.from(allCells).map(c => c.classList.contains('active') ? 1 : 0);
        return {
            beats: this.beats,
            grid: gridData
        };
    },

    setPattern: function(data) {
        if (!data) return;
        
        // Compatibility: Χειρισμός παλιών δεδομένων (array) vs νέων (object)
        let patternGrid = [];
        if (Array.isArray(data)) {
            patternGrid = data; 
            this.beats = 4;
        } else if (data.grid) {
            patternGrid = data.grid;
            this.beats = data.beats || 4;
        }

        // 1. Εξασφάλιση UI
        if (!document.getElementById('sequencer-modal')) {
             if(typeof createSequencerModal === 'function') {
                 createSequencerModal();
                 document.getElementById('sequencer-modal').style.display = 'none';
             } else return;
        } 
        
        // 2. Ενημέρωση μεγέθους Grid
        const container = document.getElementById('sequencer-rows');
        if(container) {
            container.innerHTML = '';
            generateGridRows(container);
        }
        const countSpan = document.getElementById('beat-count-display');
        if(countSpan) countSpan.innerText = this.beats;

        // 3. Εφαρμογή Μοτίβου (Dots)
        const cells = document.querySelectorAll('.cell');
        cells.forEach(c => { 
            c.classList.remove('active'); 
            c.style.backgroundColor = '#333'; 
            c.style.boxShadow='none';
            c.style.borderColor='#444';
        });

        const rowLength = this.beats * 4;
        patternGrid.forEach((val, i) => {
            if (val === 1 && cells[i]) {
                cells[i].classList.add('active');
                
                // Color Logic
                const row = Math.floor(i / rowLength);
                const colors = ["#f1c40f", "#3498db", "#2ecc71", "#e74c3c"];
                if(colors[row]) {
                    cells[i].style.backgroundColor = colors[row];
                    cells[i].style.boxShadow = `0 0 8px ${colors[row]}`;
                    cells[i].style.borderColor = colors[row];
                }
            }
        });
    }
};

// Global Hooks
function togglePlay() { AudioEngine.togglePlay(); }
function updateBpm(val) { AudioEngine.setBpm(val); }

// Global function exposed for HTML buttons
window.changeBeats = function(delta) {
    let current = AudioEngine.beats;
    AudioEngine.setBeats(current + delta);
};


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
            .storage.from('audio_files')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: { publicUrl } } = supabaseClient
            .storage.from('audio_files').getPublicUrl(fileName);

        if(uploadText) uploadText.innerText = "Saving...";
        if(progressBar) progressBar.style.width = "100%";

        const newRecording = {
            id: Date.now(), name: file.name, url: publicUrl, date: new Date().toISOString()
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


// --- PART C: DYNAMIC SEQUENCER UI ---

window.toggleSequencerUI = function() {
    let modal = document.getElementById('sequencer-modal');
    if (!modal) {
        createSequencerModal();
        modal = document.getElementById('sequencer-modal');
    }
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
    
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
        <div style="background:#1a1a1a; padding:20px; border-radius:12px; border:1px solid #444; width:95%; max-width:850px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display:flex; flex-direction:column; max-height:90vh;">
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                <div style="display:flex; align-items:center; gap:20px;">
                    <h3 style="margin:0; color:#fff; font-family:sans-serif;">🥁 Percussion Grid</h3>
                    
                    <div style="background:#333; padding:5px 12px; border-radius:20px; display:flex; align-items:center; gap:10px;">
                        <button onclick="changeBeats(-1)" style="background:none; border:none; color:#f39c12; cursor:pointer; font-weight:bold; font-size:1.1rem;">-</button>
                        <span style="color:#fff; font-size:0.9rem; min-width:60px; text-align:center;"><span id="beat-count-display">4</span> Beats</span>
                        <button onclick="changeBeats(1)" style="background:none; border:none; color:#f39c12; cursor:pointer; font-weight:bold; font-size:1.1rem;">+</button>
                    </div>
                </div>
                
                <button onclick="document.getElementById('sequencer-modal').style.display='none'" style="background:none; border:none; color:#999; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div style="overflow-x: auto; padding-bottom: 10px; width:100%;">
                <div id="sequencer-rows" style="display:flex; flex-direction:column; gap:8px; min-width: max-content;">
                    </div>
            </div>

            <div style="text-align:right; margin-top:15px; pt:10px; border-top:1px solid #333;">
                 <button onclick="AudioEngine.setPattern({beats:AudioEngine.beats, grid:[]})" 
                    style="font-size:0.8rem; background:#444; color:#ccc; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">
                    Clear Pattern
                 </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(div);
    
    const style = document.createElement('style');
    style.innerHTML = `
        .cell.highlight {
            border: 1px solid #fff !important;
            filter: brightness(1.5);
            transform: scale(0.95);
        }
        ::-webkit-scrollbar { height: 8px; }
        ::-webkit-scrollbar-track { background: #222; }
        ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
    `;
    document.head.appendChild(style);

    generateGridRows(div.querySelector('#sequencer-rows'));
    document.getElementById('beat-count-display').innerText = AudioEngine.beats;
}

function generateGridRows(container) {
    // ΣΕΙΡΑ ΕΜΦΑΝΙΣΗΣ: Πρώτο στο Array = Πάνω στο HTML
    // Tablature logic: Πρίμα πάνω (Hats), Μπάσα κάτω (Kick)
    const tracks = [
        { name: "HATS",  color: "#f1c40f" }, // Top Row
        { name: "RIM",   color: "#3498db" },
        { name: "TOM",   color: "#2ecc71" },
        { name: "KICK",  color: "#e74c3c" }  // Bottom Row
    ];

    const totalSteps = AudioEngine.beats * 4; // Δυναμικό μήκος

    tracks.forEach((track, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = "display:grid; grid-template-columns: 60px 1fr; gap:10px; align-items:center;";

        const label = document.createElement('div');
        label.innerText = track.name;
        label.style.cssText = `color:${track.color}; font-weight:bold; font-size:0.75rem; text-align:right; letter-spacing:1px;`;
        rowDiv.appendChild(label);

        const stepsContainer = document.createElement('div');
        stepsContainer.style.cssText = "display:flex; gap:4px;";
        
        for (let i = 0; i < totalSteps; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.step = i; 
            
            // Fixed size cells so they don't squash
            cell.style.cssText = `
                width: 30px; height: 30px; 
                background:#333; border:1px solid #444; border-radius:3px; 
                cursor:pointer; flex-shrink:0; 
            `;

            // Διαχωριστικό κάθε Beat (κάθε 4ο κουτί)
            if ((i + 1) % 4 === 0) {
                cell.style.marginRight = "12px"; 
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
