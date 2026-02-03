/* ===========================================================
   mNotes Pro UI Logic v15.1 (Fixed & Full Integration)
   =========================================================== */

// Global Timer variables
let navHideTimer = null;
let editorTags = []; // Για τα tags στον Editor

// --- INITIALIZATION ---
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v15.1 Loaded");
    
    // 1. Basic Setup
    if(typeof applyTheme === 'function') applyTheme(); 
    loadLibrary(); 
    setupEvents();
    
    // 2. Mobile Priority: Αν είναι κινητό, ξεκίνα στο "Εκτέλεση" (Stage)
    if (window.innerWidth <= 1024) { 
        switchMobileTab('stage'); 
    }

    // 3. Rhythm Init
    initRhythmUI();
});

// --- HELPER FUNCTIONS (Που έλειπαν) ---

function applyTheme() {
    // Απλή λογική θέματος (αν θες κάτι πιο σύνθετο το αλλάζουμε)
    if (window.innerWidth <= 1024) {
        document.body.classList.add('theme-slate');
    } else {
        document.body.classList.remove('theme-slate');
    }
}

function switchSidebarTab(tabName) {
    // Tabs της Sidebar (Library / Setlist)
    document.getElementById('tab-library').classList.remove('active');
    document.getElementById('tab-setlist').classList.remove('active');
    
    if (tabName === 'library') {
        document.getElementById('tab-library').classList.add('active');
        renderLibrary(library); // Επαναφορά λίστας
    } else {
        document.getElementById('tab-setlist').classList.add('active');
        // Εδώ θα μπει η λογική setlist αν υπάρχει
        document.getElementById('songList').innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Setlists Coming Soon</div>';
    }
}

function createNewSong() {
    currentSongId = null;
    document.getElementById('view-player').classList.remove('active-view');
    document.getElementById('view-editor').classList.add('active-view');
    
    // Καθαρισμός πεδίων
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
    // Αν δεν υπάρχει τραγούδι, καθάρισε τον player
    if (!currentSongId) {
        document.querySelector('.player-header-container').innerHTML = '';
        document.getElementById('fixed-container').innerHTML = '';
        document.getElementById('scroll-container').innerHTML = '';
    }
}

function fixTrailingChords(text) {
    // Βοηθητική για να φτιάχνει τη σύνταξη των συγχορδιών
    if (!text) return "";
    return text.replace(/!([A-Za-z0-9#\/]+)\s/g, "!$1");
}

// --- TAGS HANDLING ---
function handleTagInput(input) {
    // Απλή λογική για autocomplete αν χρειάζεται
}

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

    // A. ΚΑΘΑΡΙΣΜΟΣ & TΙΤΛΟΣ
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
    if (s.rhythm && s.rhythm.bpm) { 
        updateBpmUI(s.rhythm.bpm);
    }
}

// --- STICKY NOTES LOGIC ---
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
        } else {
            condText.style.display = 'none';
        }
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

    if (s.audioRec && (!s.recordings || s.recordings.length === 0)) {
        s.recordings = [{ url: s.audioRec, label: "Original Rec", date: 0 }];
    }

    if (!s.recordings || s.recordings.length === 0) {
        box.style.display = 'none';
        return;
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

// --- EDITOR LOGIC (LOAD & SAVE) ---
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
