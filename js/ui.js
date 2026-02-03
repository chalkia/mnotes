/* ===========================================================
   mNotes Pro UI Logic v15.0 (Full Integration)
   =========================================================== */

// Global Timer variables
let navHideTimer = null;

// --- INITIALIZATION ---
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v15 Loaded");
    
    // 1. Basic Setup
    applyTheme(); 
    loadLibrary(); 
    setupEvents();
    
    // 2. Mobile Priority: Αν είναι κινητό, ξεκίνα στο "Εκτέλεση" (Stage)
    if (window.innerWidth <= 1024) { 
        switchMobileTab('stage'); 
    }

    // 3. Rhythm Init
    initRhythmUI();
});

// --- PLAYER VIEW RENDERING ---
function renderPlayer(s) {
    if (!s) return;

    // A. ΚΑΘΑΡΙΣΜΟΣ & TΙΤΛΟΣ
    // Καθαρίζουμε το header από παλιά κουμπιά rec κλπ
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header">
            <h1 id="p-title" class="song-h1">${s.title}</h1>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span class="meta-label">${s.artist || ""}</span>
                <span class="key-badge">${getNote(s.key || "-", state.t)}</span>
            </div>
        </div>`;
    }

    // B. VIDEO (Μεταφορά στη δεξιά στήλη)
    const vidBox = document.getElementById('video-sidebar-container');
    const embedBox = document.getElementById('video-embed-box');
    if (vidBox && embedBox) {
        if (s.video) {
            const ytId = getYoutubeId(s.video);
            if (ytId) {
                embedBox.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0;"></iframe>`;
                vidBox.style.display = 'block';
            } else {
                vidBox.style.display = 'none';
            }
        } else {
            vidBox.style.display = 'none';
        }
    }

    // C. SIDEBAR RECORDINGS (Δεξιά Στήλη)
    renderSideRecordings(s);

    // D. STICKY NOTES (Χαρτάκι)
    renderStickyNotes(s);

    // E. LYRICS & TRANSPOSE
    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;
    
    var split = splitSongBody(s.body || ""); 
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);
    
    // F. RHYTHM PRESET LOAD
    // Αν το τραγούδι έχει σωσμένο BPM, το φορτώνουμε
    if (s.rhythm && s.rhythm.bpm) { 
        updateBpmUI(s.rhythm.bpm);
    }
}

// --- STICKY NOTES LOGIC ---
function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea');
    const condText = document.getElementById('conductorNoteText');
    const persText = document.getElementById('personalNoteText');
    
    // 1. Φόρτωση Προσωπικών Σημειώσεων από LocalStorage
    // Κλειδί: mnotes_personal_notes -> { songId: "text", ... }
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const myNote = personalNotesMap[s.id] || "";

    // 2. Έλεγχος αν υπάρχει κάτι να δείξουμε
    if (s.conductorNotes || myNote) {
        stickyArea.style.display = 'block';
        
        // Μαέστρος (Public)
        if (s.conductorNotes) {
            condText.style.display = 'block';
            condText.innerHTML = `<b><i class="fas fa-bullhorn"></i> Info:</b> ${s.conductorNotes}`;
        } else {
            condText.style.display = 'none';
        }

        // Προσωπικά (Private)
        if (myNote) {
            persText.style.display = 'block';
            persText.innerHTML = `<b><i class="fas fa-user-secret"></i> My Notes:</b> ${myNote}`;
        } else {
            persText.style.display = 'none';
        }
    } else {
        stickyArea.style.display = 'none';
    }
}

// --- SIDEBAR RECORDINGS LOGIC ---
function renderSideRecordings(s) {
    const box = document.getElementById('sideRecordingsBox');
    const list = document.getElementById('sideRecList');
    
    if (!box || !list) return;

    // Migration logic (παλιά data)
    if (s.audioRec && (!s.recordings || s.recordings.length === 0)) {
        s.recordings = [{ url: s.audioRec, label: "Original Rec", date: 0 }];
    }

    // Αν δεν υπάρχουν, κρύψε το κουτί
    if (!s.recordings || s.recordings.length === 0) {
        box.style.display = 'none';
        return;
    }

    // Εμφάνιση
    box.style.display = 'block';
    list.innerHTML = "";

    s.recordings.forEach((rec, index) => {
        let timeStr = "";
        if (rec.date > 0) {
            const d = new Date(rec.date);
            timeStr = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
        }

        const div = document.createElement('div');
        div.className = 'side-rec-item';
        div.innerHTML = `
            <div class="side-rec-meta">
                <span class="side-rec-label">${rec.label}</span>
                <span>${timeStr}</span>
            </div>
            <audio controls src="${rec.url}" preload="none" style="width:100%; height:30px; margin-top:5px;"></audio>
            <div style="text-align:right; margin-top:2px;">
                <button onclick="deleteRecording('${s.id}', ${index})" style="background:none; border:none; color:var(--danger); font-size:0.8rem; cursor:pointer;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- EDITOR LOGIC (LOAD & SAVE) ---
function switchToEditor() {
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view');
    
    if (currentSongId) { 
        var s = library.find(x => x.id === currentSongId); 
        if (s) { 
            // Βασικά πεδία
            document.getElementById('inpTitle').value = s.title || ""; 
            document.getElementById('inpArtist').value = s.artist || ""; 
            document.getElementById('inpVideo').value = s.video || ""; 
            document.getElementById('inpKey').value = s.key || ""; 
            document.getElementById('inpBody').value = s.body || ""; 
            document.getElementById('inpIntro').value = s.intro || ""; 
            document.getElementById('inpInter').value = s.interlude || ""; 
            
            // Conductor Notes (Public)
            document.getElementById('inpConductorNotes').value = s.conductorNotes || "";
            
            // Personal Notes (Private - LocalStorage)
            const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
            document.getElementById('inpPersonalNotes').value = map[s.id] || "";

            editorTags = s.playlists ? [...s.playlists] : []; 
            renderTagChips(); 
        } 
    } else { 
        createNewSong(); 
    }
}

function saveEdit() {
    // 1. Fix Chords Syntax
    let bodyArea = document.getElementById('inpBody');
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value);
    
    const title = document.getElementById('inpTitle').value;
    if(!title) { alert("Title required"); return; }

    // 2. Find or Create Song Object
    let s;
    if(currentSongId) {
        s = library.find(x => x.id === currentSongId);
        s.updatedAt = Date.now();
    } else {
        s = { id: Date.now().toString(), createdAt: Date.now(), updatedAt: Date.now() };
        library.push(s);
        currentSongId = s.id;
    }
    
    // 3. Update Public Fields
    s.title = title;
    s.artist = document.getElementById('inpArtist').value;
    s.key = document.getElementById('inpKey').value;
    s.body = document.getElementById('inpBody').value;
    s.intro = document.getElementById('inpIntro').value;
    s.interlude = document.getElementById('inpInter').value;
    s.video = document.getElementById('inpVideo').value; // YouTube Link
    s.conductorNotes = document.getElementById('inpConductorNotes').value; // Public Note
    s.playlists = [...editorTags];
    
    // Rhythm Meta (Αποθηκεύουμε το BPM)
    if(!s.rhythm) s.rhythm = {};
    const bpmVal = document.getElementById('rngBpm').value;
    s.rhythm.bpm = parseInt(bpmVal);

    // 4. Save Personal Notes (LOCALLY ONLY)
    const pNote = document.getElementById('inpPersonalNotes').value;
    const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    if (pNote.trim()) {
        map[currentSongId] = pNote.trim();
    } else {
        delete map[currentSongId]; // Αν το έσβησε, το αφαιρούμε
    }
    localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));

    // 5. Commit & Render
    saveData();
    populateTags(); 
    applyFilters();
    loadSong(currentSongId); // Επιστροφή στον Player
}

// --- RHYTHM UI (BOOMBOOM INTERFACE) ---
function initRhythmUI() {
    // Σύνδεση Slider BPM
    const slider = document.getElementById('rngBpm');
    if(slider) {
        slider.addEventListener('input', function(e) {
            updateBpmUI(e.target.value);
        });
    }

    // Σύνδεση Play Button
    const btn = document.getElementById('btnPlayRhythm');
    if(btn) {
        btn.onclick = function() { togglePlay(); }; // Καλεί το audio.js
    }

    // Αρχικό Grid Render (16 steps)
    renderRhythmGrid(16);
}

function updateBpmUI(val) {
    const disp = document.getElementById('dispBpm');
    const rng = document.getElementById('rngBpm');
    if(disp) disp.innerText = val;
    if(rng) rng.value = val;
    
    // Κλήση στο audio.js
    if(typeof updateBpm === 'function') updateBpm(val);
}

function renderRhythmGrid(steps) {
    const container = document.getElementById('rhythm-grid');
    if(!container) return;

    container.innerHTML = '';
    
    // CSS Grid Setup: Steps στήλες
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
    container.style.gap = '2px';

    // Δημιουργία 3 γραμμών (Bass, Snare, HiHat) x Steps στήλες
    // Total Cells = 3 * steps
    // Row 1: Bass (0 - steps-1)
    // Row 2: Chord (steps - 2*steps-1)
    // Row 3: Alt (2*steps - 3*steps-1)

    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            
            // Styling ανάλογα τη γραμμή
            if (row === 0) cell.classList.add('bass');
            if (row === 1) cell.classList.add('snare'); // Chord
            if (row === 2) cell.classList.add('hihat'); // Alt

            // Data attributes για το Audio Engine
            cell.dataset.row = row; 
            cell.dataset.col = i;

            // Click Handler
            cell.onclick = function() {
                this.classList.toggle('active');
                // Εδώ το AudioEngine θα διαβάζει απευθείας το DOM (active class)
                // όπως ορίσαμε στο audio.js
            };

            container.appendChild(cell);
        }
    }
}

function updateGridSize() {
    const inp = document.getElementById('beatCount');
    if(inp) {
        let val = parseInt(inp.value);
        if(val < 4) val = 4;
        if(val > 64) val = 64;
        renderRhythmGrid(val);
        // Ενημέρωση Audio Engine Beats
        if(typeof AudioEngine !== 'undefined') {
            AudioEngine.beats = val / 4; 
        }
    }
}

function clearGrid() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('active'));
}

// --- MOBILE NAVIGATION (AUTO HIDE) ---
function switchMobileTab(tabName) {
    if (window.innerWidth > 1024) return; // Μόνο για mobile

    // 1. UI Updates (Active Buttons)
    document.querySelectorAll('.tab-btn-mob').forEach(btn => btn.classList.remove('active'));
    
    const btns = document.querySelectorAll('.tab-btn-mob');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active'); 
    if(tabName === 'stage' && btns[1]) btns[1].classList.add('active'); 
    if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    // 2. Show/Hide Columns
    var navCol = document.querySelector('.col-nav'); 
    var stageCol = document.querySelector('.col-stage'); 
    var toolsCol = document.querySelector('.col-tools');

    if(navCol) navCol.classList.remove('mobile-view-active'); 
    if(stageCol) stageCol.classList.remove('mobile-view-active'); 
    if(toolsCol) toolsCol.classList.remove('mobile-view-active');

    if(tabName === 'library' && navCol) navCol.classList.add('mobile-view-active'); 
    if(tabName === 'stage' && stageCol) stageCol.classList.add('mobile-view-active'); 
    if(tabName === 'tools' && toolsCol) toolsCol.classList.add('mobile-view-active');

    // 3. AUTO HIDE LOGIC
    showMobileNav(); // Πάντα εμφανίζουμε το μενού μόλις πατήσεις

    // Αν είμαστε στην "Εκτέλεση" (Stage), ξεκίνα χρονόμετρο για να κρυφτεί
    if (tabName === 'stage') {
        if (navHideTimer) clearTimeout(navHideTimer);
        navHideTimer = setTimeout(() => {
            hideMobileNav();
        }, 3000); // 3 δευτερόλεπτα
    }
}

function hideMobileNav() {
    const nav = document.querySelector('.mobile-nav');
    const trigger = document.getElementById('navTrigger');
    if (nav) nav.classList.add('hidden');
    if (trigger) trigger.style.display = 'block'; // Ενεργοποίηση της ζώνης αφής κάτω
}

function showMobileNav() {
    const nav = document.querySelector('.mobile-nav');
    const trigger = document.getElementById('navTrigger');
    
    if (nav) nav.classList.remove('hidden');
    if (trigger) trigger.style.display = 'none'; // Απόκρυψη ζώνης αφής
    
    // Reset timer αν είμαστε στο Stage
    const stageBtn = document.querySelectorAll('.tab-btn-mob')[1];
    if (stageBtn && stageBtn.classList.contains('active')) {
        if (navHideTimer) clearTimeout(navHideTimer);
        navHideTimer = setTimeout(() => {
            hideMobileNav();
        }, 4000); 
    }
}

// --- UTILS (Helpers) ---
function getYoutubeId(url) {
    if (!url) return null;
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function toggleLyricsMode() {
    state.lyricsOnly = !state.lyricsOnly;
    // Απλά ξανακαλούμε το render για να σβήσει/δείξει τα chords
    loadSong(currentSongId);
}
