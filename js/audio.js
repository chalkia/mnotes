/* =========================================
   PRO AUDIO ENGINE v4.0 (Synth + Sampler + MIDI)
   ========================================= */

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1,
    lookahead: 25.0,
    
    // Grid Data & Settings
    gridData: { HAT: [], RIM: [], TOM: [], KICK: [] },
    beats: 4,          
    bpm: 100,
    currentRhythmId: null,

    // --- 1. SYNTH ENGINE (Η παλιά παραμετροποιήσιμη μηχανή) ---
    noiseBuffer: null,
    soundConfig: {
        kick: { startFreq: 54,  endFreq: 12,  decay: 0.25, vol: 1.0 },
        tom:  { freq: 85,       decay: 0.2,   type: 'sine', vol: 0.7 },
        rim:  { freq: 260,      decay: 0.03,  type: 'square', vol: 0.4 },
        hat:  { freq: 2200,     decay: 0.06,  vol: 0.3 }
    },

    // --- 2. SAMPLER ENGINE (Νέα αρχεία ήχου) ---
    currentKit: 'synth', // Προεπιλογή το Synth
    audioBuffers: { HAT: null, RIM: null, TOM: null, KICK: null },
    kits: {
        synth: {}, // Δεν χρειάζεται URLs, παράγεται δυναμικά
        standard: {
            KICK: 'assets/audio/kits/standard/kick.wav',
            TOM:  'assets/audio/kits/standard/snare.wav', 
            RIM:  'assets/audio/kits/standard/tom.wav',
            HAT:  'assets/audio/kits/standard/hihat.wav'
        },
        acoustic: {
            KICK: 'assets/audio/kits/acoustic/cajon_low.wav',
            TOM:  'assets/audio/kits/acoustic/cajon_high.wav',
            RIM:  'assets/audio/kits/acoustic/clap.wav',
            HAT:  'assets/audio/kits/acoustic/shaker.wav'
        }
    },

    // --- 3. MIDI ENGINE ---
    midiOutput: null,
    useMidi: false,
    // Στάνταρ νούμερα του General MIDI Drum Map (Channel 10)
    midiNotes: { KICK: 36, TOM: 38, RIM: 43, HAT: 42 },

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.createNoiseBuffer(); // Απαραίτητο για το Synth Hi-Hat
            this.initMidi();
            
            // Αν είχε επιλεγεί κάτι άλλο εκτός από synth, φορτώνουμε τα αρχεία
            if (this.currentKit !== 'synth') this.loadDrumKit(this.currentKit);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    createNoiseBuffer: function() {
        const bufferSize = this.ctx.sampleRate * 2.0;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
    },

    loadDrumKit: async function(kitName) {
        this.currentKit = kitName;
        
        // Αν επιλέξει το παλιό Synth, δεν φορτώνουμε αρχεία. Απλά δείχνουμε το Sound Lab.
        const btnLab = document.getElementById('btnSoundLab');
        if (kitName === 'synth') {
            if (btnLab) btnLab.style.display = 'inline-block';
            return;
        }

        // Κρύβουμε το Sound Lab για τα έτοιμα αρχεία (δεν έχει νόημα εκεί)
        if (btnLab) btnLab.style.display = 'none';
        console.log(`🥁 Loading Drum Kit: ${kitName}...`);

        const kitUrls = this.kits[kitName];
        for (const inst in kitUrls) {
            try {
                const response = await fetch(kitUrls[inst]);
                const arrayBuffer = await response.arrayBuffer();
                this.audioBuffers[inst] = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (err) {
                console.warn(`⚠️ Missing audio file for ${inst}.`);
                this.audioBuffers[inst] = null; 
            }
        }
    },

    initMidi: function() {
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(midiAccess => {
                const outputs = Array.from(midiAccess.outputs.values());
                if (outputs.length > 0) {
                    this.midiOutput = outputs[0];
                    console.log(`🎹 MIDI Connected: ${this.midiOutput.name}`);
                }
            }).catch(err => console.warn("MIDI Access Denied or Unavailable."));
        }
    },

    toggleMidi: function(enable) {
        this.useMidi = enable;
        if (enable && !this.midiOutput) {
            alert("Δεν βρέθηκε συσκευή MIDI. Παρακαλώ συνδέστε ένα MIDI interface και ανανεώστε τη σελίδα.");
            this.useMidi = false;
        }
    },
   togglePlay: function() {
        // 🔒 1. ΠΟΡΤΙΕΡΗΣ ΓΙΑ FREE: Απαγόρευση αναπαραγωγής ήχου
        if (typeof canUserPerform === 'function' && !canUserPerform('USE_AUDIO')) {
            if (typeof promptUpgrade === 'function') promptUpgrade('Μετρονόμος / Ήχος');
            return;
        }

        this.init();
        this.isPlaying = !this.isPlaying;
        
        const btn = document.getElementById('btnPlaySeq');
        if(btn) btn.innerHTML = this.isPlaying ? '<i class="fas fa-stop"></i> STOP' : '<i class="fas fa-play"></i> PLAY';
        const btnSide = document.getElementById('btnPlayRhythm');
        if(btnSide) btnSide.innerHTML = this.isPlaying ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';

        if (this.isPlaying) {
            this.currentStep = 0;
            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this.scheduler();
        } else {
            window.clearTimeout(this.timerID);
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            
            // "Κόψιμο" των MIDI νοτών αν πατηθεί Stop
            if (this.useMidi && this.midiOutput) {
                ['HAT', 'RIM', 'TOM', 'KICK'].forEach(type => {
                    this.midiOutput.send([0x89, this.midiNotes[type], 0]);
                });
            }
        }
    },

    setBpm: function(val) {
        // 🔒 2. ΠΟΡΤΙΕΡΗΣ ΓΙΑ FREE: Απαγόρευση αλλαγής ταχύτητας
        if (typeof canUserPerform === 'function' && !canUserPerform('USE_AUDIO')) {
            if (typeof promptUpgrade === 'function') promptUpgrade('Αλλαγή Ταχύτητας Μετρονόμου');
            // Επαναφέρουμε το slider στην προηγούμενη επιτρεπτή τιμή για να μην κουνιέται τσάμπα
            if(document.getElementById('rngBpm')) document.getElementById('rngBpm').value = this.bpm;
            return;
        }

        this.bpm = parseInt(val);
        if(document.getElementById('dispBpm')) document.getElementById('dispBpm').innerText = this.bpm;
        if(document.getElementById('seq-bpm-val')) document.getElementById('seq-bpm-val').innerText = this.bpm;
        if(document.getElementById('rngBpm')) document.getElementById('rngBpm').value = this.bpm;
    },

    scheduleNote: function(stepNumber, time) {
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            document.querySelectorAll(`.cell[data-step="${stepNumber}"]`).forEach(c => c.classList.add('highlight'));
        }, drawTime > 0 ? drawTime : 0);

        // --- ΕΛΕΓΧΟΣ ΔΙΚΑΙΩΜΑΤΩΝ ΓΙΑ SOLO vs PRO ---
        // Ελέγχουμε αν έχει το πλήρες Drum Machine (δηλαδή από Member και πάνω)
        const isAdvanced = (typeof canUserPerform === 'function' && canUserPerform('USE_SEQUENCER'));

        if (!isAdvanced) {
            // 🔒 3. SOLO TIER: Λειτουργία Απλού Μετρονόμου (Μόνο 1 χτύπημα ανά τέταρτο)
            // Το RIM ακούγεται πολύ πιο καθαρά σαν "κλικ" μετρονόμου σε σχέση με το KICK.
            if (stepNumber % 4 === 0) {
                let isFirstBeat = (stepNumber === 0);
                // Το πρώτο χτύπημα του μέτρου είναι πιο δυνατό (τονισμένο)
                this.playPercussion(time, 'RIM', isFirstBeat ? 1.0 : 0.4); 
            }
            return; // Σταματάμε εδώ, δεν διαβάζει το Grid
        }

        // 🌟 PRO/MAESTRO TIER: Λειτουργία Sequencer
        // Διαβάζει κανονικά ό,τι έχει ζωγραφιστεί στο Grid
        ['HAT', 'RIM', 'TOM', 'KICK'].forEach(type => {
            if (this.gridData[type] && this.gridData[type][stepNumber]) {
                this.playPercussion(time, type, 1.0);
            }
        });
    },

    setBeats: function(n) {
        if(n < 1 || n > 32) return;
        this.beats = n;
        const disp = document.getElementById('beat-count-display');
        if(disp) disp.innerText = n;
        
        const container = document.getElementById('rhythm-tracks');
        if(container && typeof generateGridRows === 'function') {
            const oldState = this.getGridState();
            container.innerHTML = '';
            generateGridRows(container);
            this.loadGridState(oldState);
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
        if (this.currentStep >= this.beats * 4) this.currentStep = 0;
    },

    toggleStepData: function(instId, stepIdx, isActive) {
        if (!this.gridData[instId]) this.gridData[instId] = [];
        this.gridData[instId][stepIdx] = isActive;
    },

    // Ο ΜΕΓΑΛΟΣ ΔΡΟΜΟΛΟΓΗΤΗΣ (Router)
    playPercussion: function(time, type, volumeMult = 1.0) {
        // 1. MIDI Output
        if (this.useMidi && this.midiOutput) {
            const note = this.midiNotes[type];
            const velocity = Math.floor(volumeMult * 127);
            const delayInMs = (time - this.ctx.currentTime) * 1000;
            setTimeout(() => {
                this.midiOutput.send([0x99, note, velocity]);
                setTimeout(() => this.midiOutput.send([0x89, note, 0]), 100);
            }, delayInMs > 0 ? delayInMs : 0);
            return; 
        }

        // 2. SYNTH Engine (Η παλιά μηχανή)
        if (this.currentKit === 'synth') {
            this.playSynth(time, type.toLowerCase(), volumeMult);
            return;
        }

        // 3. SAMPLER Engine (Πραγματικά .wav αρχεία)
        const buffer = this.audioBuffers[type];
        if (!buffer) return; 

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = volumeMult;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(time);
    },

    // Η παλιά παραμετροποιήσιμη μηχανή
    playSynth: function(time, type, volumeMult) {
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        const cfg = this.soundConfig[type];
        const finalVol = cfg.vol * volumeMult;

        if (type === 'kick') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.frequency.setValueAtTime(cfg.startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(cfg.endFreq, time + cfg.decay);
            gain.gain.setValueAtTime(finalVol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay);
        } else if (type === 'tom') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = cfg.type;
            osc.frequency.setValueAtTime(cfg.freq, time);
            osc.frequency.linearRampToValueAtTime(cfg.freq * 0.8, time + cfg.decay);
            gain.gain.setValueAtTime(finalVol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay + 0.05);
        } else if (type === 'rim') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = cfg.type;
            osc.frequency.setValueAtTime(cfg.freq, time);
            gain.gain.setValueAtTime(finalVol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay + 0.01);
        } else if (type === 'hat') { 
            if(!this.noiseBuffer) return;
            const bs = this.ctx.createBufferSource();
            bs.buffer = this.noiseBuffer;
            const f = this.ctx.createBiquadFilter();
            f.type = "highpass";
            f.frequency.value = cfg.freq;
            bs.connect(f); f.connect(gain);
            gain.gain.setValueAtTime(finalVol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            bs.start(time); bs.stop(time + cfg.decay + 0.01);
        }
    },

    clearGrid: function() {
        document.querySelectorAll('.cell.active').forEach(c => {
            c.classList.remove('active');
            c.style.backgroundColor = '#333';
        });
        this.gridData = { HAT: [], RIM: [], TOM: [], KICK: [] };
        this.currentRhythmId = null;
        if(document.getElementById('seq-current-name')) 
            document.getElementById('seq-current-name').innerText = "No rhythm loaded";
    },

    getGridState: function() {
        let state = { HAT: [], RIM: [], TOM: [], KICK: [] };
        ['HAT', 'RIM', 'TOM', 'KICK'].forEach(inst => {
            document.querySelectorAll(`.row-${inst} .cell.active`).forEach(c => {
                state[inst][parseInt(c.dataset.step)] = true;
            });
        });
        return state;
    },

    loadGridState: function(state) {
        if(!state) return;
        this.gridData = { HAT: [], RIM: [], TOM: [], KICK: [] };
        ['HAT', 'RIM', 'TOM', 'KICK'].forEach(inst => {
            if(state[inst]) {
                const isArrayOfIndexes = (state[inst].length > 0 && typeof state[inst][0] === 'number');
                if (isArrayOfIndexes) {
                    state[inst].forEach(step => {
                        this.gridData[inst][step] = true;
                        this.activateCellInUI(inst, step);
                    });
                } else {
                    for(let step = 0; step < state[inst].length; step++) {
                        if(state[inst][step]) {
                            this.gridData[inst][step] = true;
                            this.activateCellInUI(inst, step);
                        }
                    }
                }
            }
        });
    },

    activateCellInUI: function(inst, step) {
        const cell = document.querySelector(`.row-${inst} .cell[data-step="${step}"]`);
        if(cell) {
            cell.classList.add('active');
            const colors = {HAT:"#f1c40f", RIM:"#3498db", TOM:"#2ecc71", KICK:"#e74c3c"};
            cell.style.backgroundColor = colors[inst];
        }
    },

    // --- DATABASE OPERATIONS (Συγχρονισμένα με τον νέο πίνακα rhythms) ---
    openSaveModal: function() {
        if(!currentUser) { alert("Please login to save rhythms!"); return; }
        document.getElementById('rhythmSaveModal').style.display = 'flex';
    },

    saveRhythm: async function() {
        const name = document.getElementById('saveRhythmName').value;
        const tagsInput = document.getElementById('saveRhythmTags').value;
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];
        if(!name) return alert("Please enter a name");

        const rhythmId = this.currentRhythmId || ("r_" + Date.now());

        const payload = {
            id: rhythmId,
            name: name,
            beats: this.beats,
            default_bpm: this.bpm,
            default_kit: this.currentKit,
            pattern: this.getGridState(),
            tags: tags,
            owner_id: currentUser.id,
            is_public: false,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabaseClient.from('rhythms').upsert(payload).select();

        if(error) {
            alert("Error saving: " + error.message);
        } else {
            alert("Rhythm Saved!");
            this.currentRhythmId = data[0].id;
            document.getElementById('seq-current-name').innerText = data[0].name;
            document.getElementById('rhythmSaveModal').style.display = 'none';
        }
    },

    openLoadModal: function() {
        document.getElementById('rhythmLoadModal').style.display = 'flex';
        this.searchRhythms();
    },

    searchRhythms: async function() {
        const resContainer = document.getElementById('rhythmResults');
        resContainer.innerHTML = 'Loading...';

        let rpc = supabaseClient.from('rhythms').select('*');
        if(currentUser) { rpc = rpc.or(`is_public.eq.true,owner_id.eq.${currentUser.id}`); } 
        else { rpc = rpc.eq('is_public', true); }

        const { data, error } = await rpc.order('name', { ascending: true });

        if(error) { resContainer.innerHTML = 'Error fetching rhythms'; return; }
        resContainer.innerHTML = '';
        
        if(!data || data.length === 0) {
            resContainer.innerHTML = '<div style="padding:10px; color:#666;">No rhythms found.</div>'; return;
        }

        data.forEach(r => {
            const div = document.createElement('div');
            div.style.cssText = "padding:10px; border-bottom:1px solid #444; cursor:pointer; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `
                <div>
                    <span style="font-weight:bold; color:var(--text-main);">${r.name}</span>
                    <div style="font-size:0.75rem; color:#888;">${r.default_bpm} BPM • ${r.beats}/4 • Kit: ${r.default_kit || 'synth'}</div>
                </div>
                <i class="fas fa-play-circle" style="color:var(--accent);"></i>
            `;
            div.onclick = () => {
                AudioEngine.loadRhythm(r);
                document.getElementById('rhythmLoadModal').style.display = 'none';
            };
            resContainer.appendChild(div);
        });
    },

    loadRhythm: function(r) {
        this.currentRhythmId = r.id;
        if (document.getElementById('seq-current-name')) {
            document.getElementById('seq-current-name').innerText = r.name;
        }
        
        this.setBpm(r.default_bpm);
        this.setBeats(r.beats);
        
        const targetKit = r.default_kit || 'synth';
        if (targetKit !== this.currentKit) {
            this.loadDrumKit(targetKit);
            if(document.getElementById('selDrumKit')) document.getElementById('selDrumKit').value = targetKit;
        }

        this.clearGrid();
        if(r.pattern) this.loadGridState(r.pattern);
    },

    linkRhythmToSong: function() {
        if(!currentSongId) { alert("No song selected!"); return; }
        if(!this.currentRhythmId) { alert("Save the rhythm first!"); return; }
        const song = library.find(s => s.id === currentSongId);
        if(song) {
            song.rhythmId = this.currentRhythmId;
            if (typeof saveData === 'function') saveData(); 
            alert(`Linked rhythm to song: ${song.title}`);
        }
    }
};
