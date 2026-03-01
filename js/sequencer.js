/* ===========================================================
   SEQUENCER & RHYTHM UI (Standalone Module)
   =========================================================== */

// 1. ΕΚΚΙΝΗΣΗ / ΕΜΦΑΝΙΣΗ
function toggleSequencerUI() {
    let p = document.getElementById('sequencer-panel');
    // Δημιουργία του παραθύρου αν δεν υπάρχει
    if (!p) { createSequencerPanel(); p = document.getElementById('sequencer-panel'); }
    
    if (p.style.display === 'none' || p.style.display === '') {
        p.style.display = 'flex';
        // Αρχικοποίηση Ήχου (από το audio.js)
        if(typeof AudioEngine !== 'undefined') AudioEngine.init();
        
        // Αν το Grid είναι άδειο, το ζωγραφίζουμε
        if(document.getElementById('rhythm-tracks').innerHTML === "") {
             generateGridRows(document.getElementById('rhythm-tracks'));
        }
    } else {
        p.style.display = 'none';
        // Stop αν κλείσει
        if(typeof AudioEngine !== 'undefined') AudioEngine.togglePlay(); 
    }
}

// 2. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ HTML (Panel)
function createSequencerPanel() {
    const div = document.createElement('div');
    div.id = 'sequencer-panel';
    div.className = 'sequencer-box';
    div.style.display = 'none';

    // Helper για μεταφράσεις
    const safeT = (k, def) => (typeof t === 'function' ? t(k) : def);
    const currentBeats = (typeof AudioEngine !== 'undefined' && AudioEngine.beats) ? AudioEngine.beats : 4;

    div.innerHTML = `
        <div class="seq-header">
            <h3 style="margin:0; color:var(--accent); font-size:1.2rem;">
                <i class="fas fa-drum"></i> ${safeT('title_rhythm_composer', 'Rhythm Composer')}
            </h3>
            <button onclick="toggleSequencerUI()" class="icon-btn" style="font-size:1.2rem;"><i class="fas fa-times"></i></button>
        </div>

        <div class="seq-toolbar">
            
            <div class="toolbar-group">
                <button id="btnPlaySeq" onclick="AudioEngine.togglePlay()" class="icon-btn accent" title="Play">
                    <i class="fas fa-play"></i> ${safeT('btn_play', 'PLAY')}
                </button>
                <button onclick="if(confirm('${safeT('msg_confirm_clear', 'Clear grid?')}')) AudioEngine.clearGrid()" class="icon-btn danger" title="Clear">
                    <i class="fas fa-trash"></i>
                </button>
            </div>

            <div class="toolbar-group" style="min-width: 120px; justify-content: center;">
                <span style="color:#888; font-size:0.7rem; font-weight:bold; margin-right:5px;">${safeT('lbl_beats', 'BEATS')}:</span>
                <button onclick="AudioEngine.setBeats(AudioEngine.beats - 1)" class="round-btn" style="width:28px; height:28px; font-size:0.8rem; background:#333; border:1px solid #555;"><i class="fas fa-minus"></i></button>
                <span id="beat-count-display" style="font-weight:bold; min-width:25px; text-align:center; font-size:1.1rem; color:#fff;">${currentBeats}</span>
                <button onclick="AudioEngine.setBeats(AudioEngine.beats + 1)" class="round-btn" style="width:28px; height:28px; font-size:0.8rem; background:#333; border:1px solid #555;"><i class="fas fa-plus"></i></button>
            </div>

            <div class="toolbar-group">
                <i class="fas fa-tachometer-alt" style="color:#888;"></i>
                <input type="range" id="rngBpm" min="40" max="200" value="100" style="width:80px;" oninput="AudioEngine.setBpm(this.value)">
                <span id="seq-bpm-val" style="font-size:0.8rem; width:30px;">100</span>
            </div>

            <div class="toolbar-group">
                <select id="selDrumKit" class="inp" style="width:110px; font-size:0.8rem; padding:4px;" onchange="AudioEngine.loadDrumKit(this.value)">
                    <option value="synth" selected>🤖 Retro Synth</option>
                    <option value="standard">🥁 Standard Kit</option>
                    <option value="acoustic">🪘 Acoustic Kit</option>
                </select>
                <label style="font-size:0.75rem; color:#ccc; display:flex; align-items:center; gap:5px; margin-left:5px;">
                    <input type="checkbox" onchange="AudioEngine.toggleMidi(this.checked)"> MIDI Out
                </label>
            </div>

            <button id="btnSoundLab" onclick="toggleSoundLab()" class="icon-btn" style="border:1px solid #555; padding:5px 15px;">
                <i class="fas fa-sliders-h"></i> ${safeT('btn_sound_lab', 'Sound Lab')}
            </button>
        </div>

        <div class="seq-grid-area">
            <div id="rhythm-tracks"></div>
        </div>

        <div class="seq-footer">
            <span id="seq-current-name" style="margin-right:auto; align-self:center; color:#666; font-style:italic;">
                ${safeT('msg_no_rhythm', 'No rhythm loaded')}
            </span>
            
            <button onclick="AudioEngine.openLoadModal()" class="modal-btn">
                <i class="fas fa-folder-open"></i> ${safeT('btn_load', 'Load')}
            </button>
            <button onclick="AudioEngine.openSaveModal()" class="modal-btn">
                <i class="fas fa-save"></i> ${safeT('btn_save_simple', 'Save')}
            </button>
            <button onclick="AudioEngine.linkRhythmToSong()" class="modal-btn accent">
                <i class="fas fa-link"></i> ${safeT('btn_link', 'Link')}
            </button>
        </div>
    `;

    document.body.appendChild(div);
}

// 3. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ GRID
function generateGridRows(container) {
    container.innerHTML = '';
    
    const instruments = [
        {c:"#f1c40f", rowId:"row-HAT"}, // Κίτρινο
        {c:"#3498db", rowId:"row-RIM"}, // Μπλε
        {c:"#2ecc71", rowId:"row-TOM"}, // Πράσινο
        {c:"#e74c3c", rowId:"row-KICK"} // Κόκκινο
    ];

    const currentBeats = (typeof AudioEngine !== 'undefined' ? AudioEngine.beats : 4);

    for (let b = 0; b < currentBeats; b++) {
        const block = document.createElement('div');
        block.className = 'beat-block';
        
        const num = document.createElement('div');
        num.className = 'beat-number';
        num.innerText = b + 1;
        block.appendChild(num);

        instruments.forEach(inst => {
            const row = document.createElement('div');
            row.className = `inst-row ${inst.rowId}`;
            
            const stepsDiv = document.createElement('div');
            stepsDiv.className = 'steps-group';
            
            for (let s = 0; s < 4; s++) {
                const globalStep = (b * 4) + s;
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.step = globalStep;
                
                // Περνάμε το χρώμα στο CSS Variable
                cell.style.setProperty('--active-color', inst.c);
              
                cell.onclick = function() {
                    // 1. Άναψε/Σβήσε το φωτάκι στο UI
                    this.classList.toggle('active');
                    
                    // 2. Πάρε το όνομα του οργάνου (HAT, RIM κλπ)
                    const instId = inst.rowId.replace('row-', '');
                    const stepIdx = parseInt(this.dataset.step);
                    const isActive = this.classList.contains('active');

                    // 3. Ενημέρωσε τη μηχανή ήχου για να το παίξει
                    if (typeof AudioEngine !== 'undefined') {
                        AudioEngine.toggleStepData(instId, stepIdx, isActive);
                        
                        // Αν το άναψες, παίξε τον ήχο για επιβεβαίωση
                        if (isActive) {
                            AudioEngine.playPercussion(AudioEngine.ctx.currentTime, instId.toLowerCase());
                        }
                    }
                    
                    // 4. Χρώμα (Για σιγουριά)
                    this.style.backgroundColor = isActive ? inst.c : 'rgba(255,255,255,0.1)';
                };          
                stepsDiv.appendChild(cell);
            }
            row.appendChild(stepsDiv);
            block.appendChild(row);
        });

        container.appendChild(block);
    }
}

// 4. SOUND LAB (MODAL)
function toggleSoundLab() {
    let m = document.getElementById('sound-lab-modal');
    if(!m) { createSoundLabModal(); m = document.getElementById('sound-lab-modal'); }
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}

function createSoundLabModal() {
    const d = document.createElement('div');
    d.id = 'sound-lab-modal';
    d.className = 'modal-overlay'; 
    d.style.cssText = "display:none; z-index:2000; align-items:center; justify-content:center;";
    
    window.updateParam = (obj, prop, val) => {
        if(typeof AudioEngine !== 'undefined') {
            AudioEngine.soundConfig[obj][prop] = parseFloat(val);
            document.getElementById(`val-${obj}-${prop}`).innerText = val;
            AudioEngine.playPercussion(AudioEngine.ctx.currentTime, obj);
        }
    };

    const slider = (lbl, obj, prop, min, max, step, col) => `
        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:${col}; margin-bottom:2px;">
                <span>${lbl}</span><span id="val-${obj}-${prop}">${(typeof AudioEngine !== 'undefined' ? AudioEngine.soundConfig[obj][prop] : 0)}</span>
            </div>
            <input type="range" class="compact-range" min="${min}" max="${max}" step="${step}" 
                   value="${(typeof AudioEngine !== 'undefined' ? AudioEngine.soundConfig[obj][prop] : 0)}" 
                   oninput="updateParam('${obj}','${prop}',this.value)">
        </div>`;

    d.innerHTML = `
        <div class="modal-box" style="width:95%; max-width:400px; max-height:85vh; overflow-y:auto; background:#1a1a1a; padding:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h3 style="margin:0; font-size:1.1rem;"><i class="fas fa-sliders-h"></i> Sound Lab</h3>
                <button onclick="document.getElementById('sound-lab-modal').style.display='none'" class="text-btn" style="color:#fff;">&times;</button>
            </div>
            
            <div style="border-left:3px solid #e74c3c; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#e74c3c; margin:0 0 5px 0; font-size:0.8rem;">KICK DRUM</h4>
                ${slider('Start Freq', 'kick', 'startFreq', 50, 300, 1, '#e74c3c')}
                ${slider('End Freq', 'kick', 'endFreq', 10, 100, 1, '#e74c3c')}
                ${slider('Decay', 'kick', 'decay', 0.1, 1.0, 0.05, '#e74c3c')}
                ${slider('Volume', 'kick', 'vol', 0, 1.5, 0.1, '#e74c3c')}
            </div>

            <div style="border-left:3px solid #2ecc71; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#2ecc71; margin:0 0 5px 0; font-size:0.8rem;">TOM</h4>
                ${slider('Frequency', 'tom', 'freq', 50, 300, 1, '#2ecc71')}
                ${slider('Decay', 'tom', 'decay', 0.1, 1.0, 0.05, '#2ecc71')}
                ${slider('Volume', 'tom', 'vol', 0, 1.5, 0.1, '#2ecc71')}
                <select class="inp" style="width:100%; font-size:0.8rem; margin-top:5px;" onchange="AudioEngine.soundConfig.tom.type=this.value; AudioEngine.playPercussion(AudioEngine.ctx.currentTime,'tom')">
                    <option value="sine">Sine</option>
                    <option value="triangle" selected>Triangle</option>
                    <option value="square">Square</option>
                </select>
            </div>

            <div style="border-left:3px solid #3498db; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#3498db; margin:0 0 5px 0; font-size:0.8rem;">RIM SHOT</h4>
                ${slider('Frequency', 'rim', 'freq', 100, 1500, 10, '#3498db')}
                ${slider('Decay', 'rim', 'decay', 0.01, 0.3, 0.01, '#3498db')}
                ${slider('Volume', 'rim', 'vol', 0, 1.5, 0.1, '#3498db')}
            </div>

            <div style="border-left:3px solid #f1c40f; padding-left:10px;">
                <h4 style="color:#f1c40f; margin:0 0 5px 0; font-size:0.8rem;">HI-HATS</h4>
                ${slider('Filter Freq', 'hat', 'freq', 500, 5000, 50, '#f1c40f')}
                ${slider('Decay', 'hat', 'decay', 0.01, 0.3, 0.01, '#f1c40f')}
                ${slider('Volume', 'hat', 'vol', 0, 1.5, 0.1, '#f1c40f')}
            </div>
        </div>
    `;
    document.body.appendChild(d);
}

// =========================================
// 5. BRIDGE TO MAIN APP (Load Logic)
// =========================================

// Η συνάρτηση που καλείται από το ui.js (loadSong) όταν ανοίγεις ένα τραγούδι
async function syncSequencerToSong(s) {
    if (!s) return;
    if (typeof AudioEngine === 'undefined') return;

    // 1. Ψάχνουμε να δούμε αν το τραγούδι έχει συνδεδεμένο Ρυθμό (rhythmId) από τη βάση
    if (s.rhythmId && typeof supabaseClient !== 'undefined') {
        try {
            const { data, error } = await supabaseClient.from('rhythms').select('*').eq('id', s.rhythmId).maybeSingle();
            
            if (data) {
                // Φόρτωση ολόκληρου του ρυθμού (Grid, Kit, BPM, Beats)
                AudioEngine.loadRhythm(data);
                console.log("🥁 Auto-loaded linked rhythm:", data.name);
            }
        } catch (e) { 
            console.error("Error loading rhythm:", e); 
        }
    } 
    // 2. Fallback: Αν έχει μόνο ένα ξεκάρφωτο BPM (από παλιά αποθήκευση)
    else if (s.rhythm && s.rhythm.bpm) {
        AudioEngine.setBpm(s.rhythm.bpm);
        console.log(`🥁 Sequencer synced to: ${s.rhythm.bpm} BPM`);
    }

    // 3. Ενημέρωση των UI controls του Sequencer
    const seqRange = document.getElementById('rngBpm');
    const seqVal = document.getElementById('seq-bpm-val');
    
    if (seqRange) seqRange.value = AudioEngine.bpm;
    if (seqVal) seqVal.innerText = AudioEngine.bpm;
}
