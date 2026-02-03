/* ===========================================================
   mNotes Pro UI Logic v15.2 (Full Integration + Recorder Fixed)
   =========================================================== */

// Global Variables
let navHideTimer = null;
let editorTags = []; 
let mediaRecorder = null;
let audioChunks = [];
let currentRecordedBlob = null;
let recTimerInterval = null;

// --- INITIALIZATION ---
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v15.2 Loaded");
    
    // 1. Basic Setup
    if(typeof applyTheme === 'function') applyTheme(); 
    loadLibrary(); 
    setupEvents();
    
    // 2. Mobile Priority
    if (window.innerWidth <= 1024) { 
        switchMobileTab('stage'); 
    }

    // 3. Rhythm Init
    initRhythmUI();
});

// --- HELPER FUNCTIONS ---

function applyTheme() {
    if (window.innerWidth <= 1024) {
        document.body.classList.add('theme-slate');
    } else {
        document.body.classList.remove('theme-slate');
    }
}

function switchSidebarTab(tabName) {
    document.getElementById('tab-library').classList.remove('active');
    document.getElementById('tab-setlist').classList.remove('active');
    
    if (tabName === 'library') {
        document.getElementById('tab-library').classList.add('active');
        renderLibrary(library); 
    } else {
        document.getElementById('tab-setlist').classList.add('active');
        document.getElementById('songList').innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Setlists Coming Soon</div>';
    }
}

function createNewSong() {
    currentSongId = null;
    document.getElementById('view-player').classList.remove('active-view');
    document.getElementById('view-editor').classList.add('active-view');
    
    // Clear Fields
    document.getElementById('inpTitle').value = "";
    document.getElementById('inpArtist').value = "";
    document.getElementById('inpVideo').value = "";
    document.getElementById('inpKey').value = "";
    document.getElementById('inpBody').value = "";
    document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = "";
    document.getElementById('inpConductorNotes').value = "";
    document.getElementById('inpPersonalNotes').value = "";
    
    editorTags = [];
    renderTagChips();
}

function deleteCurrentSong() {
    if (!currentSongId) return;
    if (confirm("Are you sure you want to delete this song?")) {
        library = library.filter(s => s.id !== currentSongId);
        saveData();
        currentSongId = null;
        exitEditor();
        loadLibrary();
    }
}

function exitEditor() {
    document.getElementById('view-editor').classList.remove('active-view');
    document.getElementById('view-player').classList.add('active-view');
    if (!currentSongId) {
        document.querySelector('.player-header-container').innerHTML = '';
        document.getElementById('fixed-container').innerHTML = '';
        document.getElementById('scroll-container').innerHTML = '';
    }
}

function fixTrailingChords(text) {
    if (!text) return "";
    return text.replace(/!([A-Za-z0-9#\/]+)\s/g, "!$1");
}

// --- RECORDER & CLOUD LOGIC (RESTORATION) ---

async function toggleRecording() {
    const btn = document.getElementById('btnRecord');
    const timerDisplay = document.getElementById('recTimer');
    const preview = document.getElementById('audioPreview');
    const btnLink = document.getElementById('btnLinkRec');

    // STOP RECORDING
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.classList.remove('recording-pulse');
        clearInterval(recTimerInterval);
        
        // Εμφάνιση εργαλείων
        if(preview) preview.style.display = 'block';
        if(btnLink) btnLink.style.display = 'inline-block';
        return;
    }

    // START RECORDING
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            currentRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(currentRecordedBlob);
            if(preview) preview.src = audioUrl;
            
            // Setup Download Link
            const dlBtn = document.getElementById('btnDownloadRec');
            if(dlBtn) {
                dlBtn.href = audioUrl;
                dlBtn.download = `recording_${Date.now()}.webm`;
                dlBtn.style.opacity = '1';
                dlBtn.style.pointerEvents = 'auto';
            }
        };

        mediaRecorder.start();
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        btn.classList.add('recording-pulse');
        
        // Timer Logic
        let sec = 0;
        timerDisplay.innerText = "00:00";
        recTimerInterval = setInterval(() => {
            sec++;
            let m = Math.floor(sec / 60).toString().padStart(2,'0');
            let s = (sec % 60).toString().padStart(2,'0');
            timerDisplay.innerText = `${m}:${s}`;
        }, 1000);

    } catch (err) {
        alert("Microphone access denied: " + err);
    }
}

async function uploadAndLinkCurrent() {
    // 1. Checks
    if (!currentRecordedBlob) { showToast("No recording found!"); return; }
    if (!currentSongId) { showToast("Select a song first!"); return; }
    if (!currentUser) { document.getElementById('authModal').style.display='flex'; return; }

    // 2. Song Info
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    // 3. CONFIRMATION
    const choice = confirm(`Save recording to song:\n\n"${s.title}"\n\nFile will be uploaded to Cloud.`);
    if (!choice) return;

    // 4. UI Loading
    const btnLink = document.getElementById('btnLinkRec');
    const originalIcon = btnLink.innerHTML;
    btnLink.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btnLink.style.opacity = '0.7'; 
    
    // 5. Filename
    if (!s.recordings) s.recordings = [];
    const takeNum = s.recordings.length + 1;
    const filename = `Song_${currentSongId}_Take${takeNum}_${Date.now()}.webm`;

    // 6. Upload to Supabase (Recordings Bucket)
    // ΠΡΟΣΟΧΗ: Καλεί το function από το supabase-client.js
    // Βεβαιώσου ότι το Bucket λέγεται 'Recordings' (Case Sensitive)
    const cloudUrl = await uploadAudioToCloud(currentRecordedBlob, filename);

    if (cloudUrl) {
        s.recordings.push({
            url: cloudUrl,
            label: `Take ${takeNum}`,
            date: Date.now()
        });
        
        saveData();
        showToast(`Take ${takeNum} Saved! ☁️`);
        
        btnLink.style.display = 'none'; 
        renderPlayer(s); // Refresh UI to show the new take
    } else {
        btnLink.innerHTML = originalIcon;
        btnLink.style.opacity = '1';
        showToast("Upload Failed.");
    }
}

function deleteRecording(songId, index) {
    const s = library.find(x => x.id === songId);
    if(s && s.recordings && s.recordings[index]) {
        if(confirm("Delete this recording? (This only removes the link, not the file from cloud)")) {
            s.recordings.splice(index, 1);
            saveData();
            renderSideRecordings(s);
        }
    }
}

// --- TAGS HANDLING ---
function handleTagInput(input) { /* Autocomplete logic if needed */ }

function handleTagKey(e) {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) {
            if (!editorTags.includes(val)) {
                editorTags.push(val);
                renderTagChips();
            }
            e.target.value = '';
        }
    }
}

function renderTagChips() {
    const container = document.getElementById('tagChips');
    if (!container) return;
    container.innerHTML = '';
    editorTags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag-chip';
        span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')"></i>`;
        container.appendChild(span);
    });
}

function removeTag(tag) {
    editorTags = editorTags.filter(t => t !== tag);
    renderTagChips();
}

// --- PLAYER VIEW RENDERING ---
function renderPlayer(s) {
    if (!s) return;

    // Header
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

    // Video Sidebar
    const vidBox = document.getElementById('video-sidebar-container');
    const embedBox = document.getElementById('video-embed-box');
    if (vidBox && embedBox) {
        if (s.video) {
            const ytId = getYoutubeId(s.video);
            if (ytId) {
                embedBox.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0;"></iframe>`;
                vidBox.style.display = 'block';
            } else { vidBox.style.display = 'none'; }
        } else { vidBox.style.display = 'none'; }
    }

    renderSideRecordings(s);
    renderStickyNotes(s);

    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;
    
    var split = splitSongBody(s.body || ""); 
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);
    
    if (s.rhythm && s.rhythm.bpm) { 
        updateBpmUI(s.rhythm.bpm);
    }
}

// --- STICKY NOTES ---
function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea');
    const condText = document.getElementById('conductorNoteText');
    const persText = document.getElementById('personalNoteText');
    
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const myNote = personalNotesMap[s.id] || "";

    if (s.conductorNotes || myNote) {
        stickyArea.style.display = 'block';
        if (s.conductorNotes) {
            condText.style.display = 'block';
            condText.innerHTML = `<b><i class="fas fa-bullhorn"></i> Info:</b> ${s.conductorNotes}`;
        } else { condText.style.display = 'none'; }
        
        if (myNote) {
            persText.style.display = 'block';
            persText.innerHTML = `<b><i class="fas fa-user-secret"></i> My Notes:</b> ${myNote}`;
        } else { persText.style.display = 'none'; }
    } else {
        stickyArea.style.display = 'none';
    }
}

// --- SIDE RECORDINGS ---
function renderSideRecordings(s) {
    const box = document.getElementById('sideRecordingsBox');
    const list = document.getElementById('sideRecList');
    if (!box || !list) return;

    if (s.audioRec && (!s.recordings || s.recordings.length === 0)) {
        s.recordings = [{ url: s.audioRec, label: "Original Rec", date: 0 }];
    }

    if (!s.recordings || s.recordings.length === 0) {
        box.style.display = 'none'; return;
    }

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

// --- EDITOR SAVE ---
function switchToEditor() {
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view');
    
    if (currentSongId) { 
        var s = library.find(x => x.id === currentSongId); 
        if (s) { 
            document.getElementById('inpTitle').value = s.title || ""; 
            document.getElementById('inpArtist').value = s.artist || ""; 
            document.getElementById('inpVideo').value = s.video || ""; 
            document.getElementById('inpKey').value = s.key || ""; 
            document.getElementById('inpBody').value = s.body || ""; 
            document.getElementById('inpIntro').value = s.intro || ""; 
            document.getElementById('inpInter').value = s.interlude || ""; 
            document.getElementById('inpConductorNotes').value = s.conductorNotes || "";
            
            const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
            document.getElementById('inpPersonalNotes').value = map[s.id] || "";

            editorTags = s.playlists ? [...s.playlists] : []; 
            renderTagChips(); 
        } 
    } else { createNewSong(); }
}

function saveEdit() {
    let bodyArea = document.getElementById('inpBody');
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value);
    
    const title = document.getElementById('inpTitle').value;
    if(!title) { alert("Title required"); return; }

    let s;
    if(currentSongId) {
        s = library.find(x => x.id === currentSongId);
        s.updatedAt = Date.now();
    } else {
        s = { id: Date.now().toString(), createdAt: Date.now(), updatedAt: Date.now() };
        library.push(s);
        currentSongId = s.id;
    }
    
    s.title = title;
    s.artist = document.getElementById('inpArtist').value;
    s.key = document.getElementById('inpKey').value;
    s.body = document.getElementById('inpBody').value;
    s.intro = document.getElementById('inpIntro').value;
    s.interlude = document.getElementById('inpInter').value;
    s.video = document.getElementById('inpVideo').value; 
    s.conductorNotes = document.getElementById('inpConductorNotes').value;
    s.playlists = [...editorTags];
    
    if(!s.rhythm) s.rhythm = {};
    const bpmVal = document.getElementById('rngBpm').value;
    s.rhythm.bpm = parseInt(bpmVal);

    const pNote = document.getElementById('inpPersonalNotes').value;
    const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    if (pNote.trim()) {
        map[currentSongId] = pNote.trim();
    } else {
        delete map[currentSongId];
    }
    localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));

    saveData();
    populateTags(); 
    applyFilters();
    loadSong(currentSongId);
}

// --- RHYTHM UI (BOOMBOOM) ---
function initRhythmUI() {
    const slider = document.getElementById('rngBpm');
    if(slider) {
        slider.addEventListener('input', function(e) { updateBpmUI(e.target.value); });
    }
    const btn = document.getElementById('btnPlayRhythm');
    if(btn) {
        btn.onclick = function() { togglePlay(); };
    }
    renderRhythmGrid(16);
}

function updateBpmUI(val) {
    const disp = document.getElementById('dispBpm');
    const rng = document.getElementById('rngBpm');
    if(disp) disp.innerText = val;
    if(rng) rng.value = val;
    if(typeof updateBpm === 'function') updateBpm(val);
}

function renderRhythmGrid(steps) {
    const container = document.getElementById('rhythm-grid');
    if(!container) return;
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
    container.style.gap = '2px';

    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (row === 0) cell.classList.add('bass');
            if (row === 1) cell.classList.add('snare'); 
            if (row === 2) cell.classList.add('hihat'); 
            cell.dataset.row = row; 
            cell.dataset.col = i;
            cell.onclick = function() { this.classList.toggle('active'); };
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
        if(typeof AudioEngine !== 'undefined') { AudioEngine.beats = val / 4; }
    }
}

function clearGrid() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('active'));
}

function loadPreset(type) {
    if(!type) return;
    // Εδώ μπορείς να βάλεις έτοιμα patterns.
    // Προς το παρόν απλά καθαρίζει και βάζει BPM
    clearGrid();
    if(type === 'zeibekiko') updateBpmUI(60); // 9/8 θέλει ειδική λογική
    if(type === 'kalamatianos') updateBpmUI(120);
    if(type === 'chasapiko') updateBpmUI(80);
    if(type === 'tsifteteli') updateBpmUI(110);
}

// --- MOBILE NAVIGATION ---
function switchMobileTab(tabName) {
    if (window.innerWidth > 1024) return;
    document.querySelectorAll('.tab-btn-mob').forEach(btn => btn.classList.remove('active'));
    
    const btns = document.querySelectorAll('.tab-btn-mob');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active'); 
    if(tabName === 'stage' && btns[1]) btns[1].classList.add('active'); 
    if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    var navCol = document.querySelector('.col-nav'); 
    var stageCol = document.querySelector('.col-stage'); 
    var toolsCol = document.querySelector('.col-tools');

    if(navCol) navCol.classList.remove('mobile-view-active'); 
    if(stageCol) stageCol.classList.remove('mobile-view-active'); 
    if(toolsCol) toolsCol.classList.remove('mobile-view-active');

    if(tabName === 'library' && navCol) navCol.classList.add('mobile-view-active'); 
    if(tabName === 'stage' && stageCol) stageCol.classList.add('mobile-view-active'); 
    if(tabName === 'tools' && toolsCol) toolsCol.classList.add('mobile-view-active');

    showMobileNav();
    if (tabName === 'stage') {
        if (navHideTimer) clearTimeout(navHideTimer);
        navHideTimer = setTimeout(() => { hideMobileNav(); }, 3000); 
    }
}

function hideMobileNav() {
    const nav = document.querySelector('.mobile-nav');
    const trigger = document.getElementById('navTrigger');
    if (nav) nav.classList.add('hidden');
    if (trigger) trigger.style.display = 'block'; 
}

function showMobileNav() {
    const nav = document.querySelector('.mobile-nav');
    const trigger = document.getElementById('navTrigger');
    if (nav) nav.classList.remove('hidden');
    if (trigger) trigger.style.display = 'none'; 
    const stageBtn = document.querySelectorAll('.tab-btn-mob')[1];
    if (stageBtn && stageBtn.classList.contains('active')) {
        if (navHideTimer) clearTimeout(navHideTimer);
        navHideTimer = setTimeout(() => { hideMobileNav(); }, 4000); 
    }
}

// --- UTILS ---
function getYoutubeId(url) {
    if (!url) return null;
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function toggleLyricsMode() {
    state.lyricsOnly = !state.lyricsOnly;
    loadSong(currentSongId);
}

function openSettings() {
    alert("Settings menu coming soon!");
}
