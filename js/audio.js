/* =========================================
   AUDIO ENGINE v2.3 (Final: Vertical Grid & Volume)
   ========================================= */

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1,
    lookahead: 25.0,
    noiseBuffer: null,
    
    // Rhythm Settings
    beats: 4,          
    bpm: 100,
    currentRhythmId: null,

    // SOUND LAB CONFIG (Final Settings)
    soundConfig: {
        kick: { startFreq: 54,  endFreq: 12,   decay: 0.25, vol: 1.0 },
        tom:  { freq: 85,       decay: 0.2,    type: 'sine', vol: 0.7 },
        rim:  { freq: 260,      decay: 0.03,   type: 'square', vol: 0.4 },
        hat:  { freq: 2200,     decay: 0.06,   vol: 0.3 }
    },

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.createNoiseBuffer();
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

    togglePlay: function() {
        this.init();
        this.isPlaying = !this.isPlaying;
        
        // Update Buttons
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
        }
    },

    setBpm: function(val) {
        this.bpm = parseInt(val);
        if(document.getElementById('dispBpm')) document.getElementById('dispBpm').innerText = this.bpm;
        if(document.getElementById('seq-bpm-val')) document.getElementById('seq-bpm-val').innerText = this.bpm;
        if(document.getElementById('rngBpm')) document.getElementById('rngBpm').value = this.bpm;
    },

    setBeats: function(n) {
        if(n < 1 || n > 32) return;
        this.beats = n;
        
        const disp = document.getElementById('beat-count-display');
        if(disp) disp.innerText = n;
        
        // Redraw Vertical Grid
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
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.currentStep++;
        if (this.currentStep >= this.beats * 4) this.currentStep = 0;
    },

    scheduleNote: function(stepNumber, time) {
        // Visual Feedback
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
            const activeCells = document.querySelectorAll(`.cell[data-step="${stepNumber}"]`);
            activeCells.forEach(c => c.classList.add('highlight'));
        }, drawTime > 0 ? drawTime : 0);

        // Audio Trigger (Checks DOM classes row-KICK, row-HAT etc.)
        const checkInstrument = (rowClass, type) => {
            const cell = document.querySelector(`.${rowClass} .cell[data-step="${stepNumber}"]`);
            if (cell && cell.classList.contains('active')) this.playPercussion(time, type);
        };

        checkInstrument('row-HAT', 'hat');
        checkInstrument('row-RIM', 'rim');
        checkInstrument('row-TOM', 'tom');
        checkInstrument('row-KICK', 'kick');
    },

    playPercussion: function(time, type) {
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        const cfg = this.soundConfig[type];

        if (type === 'kick') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.frequency.setValueAtTime(cfg.startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(cfg.endFreq, time + cfg.decay);
            gain.gain.setValueAtTime(cfg.vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay);
        } else if (type === 'tom') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = cfg.type;
            osc.frequency.setValueAtTime(cfg.freq, time);
            osc.frequency.linearRampToValueAtTime(cfg.freq * 0.8, time + cfg.decay);
            gain.gain.setValueAtTime(cfg.vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay + 0.05);
        } else if (type === 'rim') { 
            const osc = this.ctx.createOscillator();
            osc.connect(gain);
            osc.type = cfg.type;
            osc.frequency.setValueAtTime(cfg.freq, time);
            gain.gain.setValueAtTime(cfg.vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            osc.start(time); osc.stop(time + cfg.decay + 0.01);
        } else if (type === 'hat') { 
            const bs = this.ctx.createBufferSource();
            bs.buffer = this.noiseBuffer;
            const f = this.ctx.createBiquadFilter();
            f.type = "highpass";
            f.frequency.value = cfg.freq;
            bs.connect(f); f.connect(gain);
            gain.gain.setValueAtTime(cfg.vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + cfg.decay);
            bs.start(time); bs.stop(time + cfg.decay + 0.01);
        }
    },

    clearGrid: function() {
        document.querySelectorAll('.cell.active').forEach(c => {
            c.classList.remove('active');
            c.style.backgroundColor = '#333';
        });
        this.currentRhythmId = null;
        if(document.getElementById('seq-current-name')) 
            document.getElementById('seq-current-name').innerText = "No rhythm loaded";
    },

    getGridState: function() {
        let state = { HAT: [], RIM: [], TOM: [], KICK: [] };
        ['HAT', 'RIM', 'TOM', 'KICK'].forEach(inst => {
            document.querySelectorAll(`.row-${inst} .cell.active`).forEach(c => {
                state[inst].push(parseInt(c.dataset.step));
            });
        });
        return state;
    },

    loadGridState: function(state) {
        if(!state) return;
        ['HAT', 'RIM', 'TOM', 'KICK'].forEach(inst => {
            if(state[inst]) {
                state[inst].forEach(step => {
                    const cell = document.querySelector(`.row-${inst} .cell[data-step="${step}"]`);
                    if(cell) {
                        cell.classList.add('active');
                        const colors = {HAT:"#f1c40f", RIM:"#3498db", TOM:"#2ecc71", KICK:"#e74c3c"};
                        cell.style.backgroundColor = colors[inst];
                    }
                });
            }
        });
    },

    // --- DATABASE OPERATIONS ---

    openSaveModal: function() {
        if(!currentUser) { alert("Please login to save rhythms!"); return; }
        document.getElementById('rhythmSaveModal').style.display = 'flex';
    },

    saveRhythm: async function() {
        const name = document.getElementById('saveRhythmName').value;
        const tagsInput = document.getElementById('saveRhythmTags').value;
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];
        
        if(!name) return alert("Please enter a name");

        const rhythmData = {
            beats: this.beats,
            soundConfig: this.soundConfig,
            grid: this.getGridState()
        };

        const payload = {
            name: name,
            owner_id: currentUser.id,
            bpm: this.bpm,
            tags: tags,
            is_public: false,
            data: rhythmData
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
        const query = document.getElementById('searchRhythm').value;
        const resContainer = document.getElementById('rhythmResults');
        resContainer.innerHTML = 'Loading...';

        let rpc = supabaseClient.from('rhythms').select('*');
        if(currentUser) {
            rpc = rpc.or(`is_public.eq.true,owner_id.eq.${currentUser.id}`);
        } else {
            rpc = rpc.eq('is_public', true);
        }

        if(query) rpc = rpc.ilike('name', `%${query}%`);

        const { data, error } = await rpc.order('created_at', { ascending: false }).limit(20);

        if(error) {
            resContainer.innerHTML = 'Error fetching rhythms'; return;
        }

        resContainer.innerHTML = '';
        if(!data || data.length === 0) {
            resContainer.innerHTML = '<div style="padding:10px; color:#666;">No rhythms found.</div>'; return;
        }

        data.forEach(r => {
            const rBeats = (r.data && r.data.beats) ? r.data.beats : 4;
            const div = document.createElement('div');
            div.style.cssText = "padding:10px; border-bottom:1px solid #444; cursor:pointer; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `
                <div>
                    <span style="font-weight:bold; color:var(--text-main);">${r.name}</span>
                    <div style="font-size:0.75rem; color:#888;">${r.bpm} BPM • ${rBeats}/4 • ${r.is_public ? 'Public' : 'Private'}</div>
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
        document.getElementById('seq-current-name').innerText = r.name;
        this.setBpm(r.bpm);
        if(r.data) {
            if(r.data.beats) this.setBeats(r.data.beats);
            if(r.data.soundConfig) this.soundConfig = r.data.soundConfig;
            this.clearGrid();
            if(r.data.grid) this.loadGridState(r.data.grid);
        }
    },

    linkRhythmToSong: function() {
        if(!currentSongId) { alert("No song selected!"); return; }
        if(!this.currentRhythmId) { alert("Save the rhythm first!"); return; }
        const song = library.find(s => s.id === currentSongId);
        if(song) {
            song.rhythmId = this.currentRhythmId;
            saveData(); alert(`Linked rhythm to song: ${song.title}`);
        }
    },
    
    checkLinkedRhythm: async function(song) {
        if(song.rhythmId) {
            const { data } = await supabaseClient.from('rhythms').select('*').eq('id', song.rhythmId).single();
            if(data) {
                this.loadRhythm(data);
                console.log("Auto-loaded linked rhythm:", data.name);
            }
        }
    }
};
