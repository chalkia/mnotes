/* =========================================
   UI LOGIC v14.0 (BoomBoom Integrated)
   ========================================= */

// ... (Οι μεταβλητές αρχικοποίησης παραμένουν) ...

window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v14 Loaded");
    applyTheme(); loadLibrary(); setupEvents(); 
    
    // RHYTHM GRID INIT
    if(typeof updateGridSize === 'function') updateGridSize();
    
    // MOBILE PRIORITY: Αν είναι κινητό, πάνε κατευθείαν στο Stage
    if (window.innerWidth <= 1024) { 
        switchMobileTab('stage'); 
    }
});

function renderPlayer(s) {
    if (!s) return;

    // 1. Sidebar Recordings
    renderSideRecordings(s);

    // 2. VIDEO ΣΤΟ SIDEBAR (Κάτω δεξιά)
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

    // 3. Header Clean
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

    // 4. STICKY NOTES
    const stickyArea = document.getElementById('stickyNotesArea');
    const condText = document.getElementById('conductorNoteText');
    const persText = document.getElementById('personalNoteText');
    
    // Personal Notes (από LocalStorage)
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const myNote = personalNotesMap[s.id] || "";

    if (s.conductorNotes || myNote) {
        stickyArea.style.display = 'block';
        condText.style.display = s.conductorNotes ? 'block' : 'none';
        condText.innerText = s.conductorNotes || "";
        
        persText.style.display = myNote ? 'block' : 'none';
        persText.innerText = myNote ? "My Notes: " + myNote : "";
    } else {
        stickyArea.style.display = 'none';
    }

    // 5. Lyrics & Transpose
    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;
    var split = splitSongBody(s.body || ""); renderArea('fixed-container', split.fixed); renderArea('scroll-container', split.scroll);
    
    // Rhythm & BPM Load
    if (s.rhythm) {
        if (s.rhythm.bpm) { 
            const rng = document.getElementById('rngBpm'); 
            if(rng) { rng.value = s.rhythm.bpm; updateBpm(s.rhythm.bpm); }
        }
        // Εδώ θα μπορούσαμε να φορτώσουμε και το Pattern αν το είχαμε σώσει
    }
}

// EDITOR SAVE (Ενημερωμένο με Notes)
function saveEdit() {
    let bodyArea = document.getElementById('inpBody');
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value);
    
    // Αποθήκευση
    saveSong(); 
    
    // Ειδική αποθήκευση για Personal Notes (Local)
    if (currentSongId) {
        const pNote = document.getElementById('inpPersonalNotes').value;
        const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
        if (pNote.trim()) {
            map[currentSongId] = pNote.trim();
        } else {
            delete map[currentSongId];
        }
        localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));
    }

    populateTags(); applyFilters();
}

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
            
            // Notes
            document.getElementById('inpConductorNotes').value = s.conductorNotes || "";
            // Personal Notes Load
            const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
            document.getElementById('inpPersonalNotes').value = map[s.id] || "";

            editorTags = s.playlists ? [...s.playlists] : []; 
            if(typeof renderTagChips === 'function') renderTagChips(); 
        } 
    } else { 
        createNewSong(); 
    }
}

function saveSong() {
    // ... (Κώδικας αποθήκευσης όπως πριν) ...
    // ΑΛΛΑ ΠΡΟΣΘΕΣΕ:
    // s.conductorNotes = document.getElementById('inpConductorNotes').value;
    // s.video = document.getElementById('inpVideo').value;
    // s.rhythm = { bpm: parseInt(document.getElementById('rngBpm').value) };
    
    // (Επειδή είναι μεγάλο το saveSong, βεβαιώσου ότι έχεις αυτά τα πεδία στο αντικείμενο s)
    // Παράδειγμα:
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
    
    // Save Rhythm Meta
    if(!s.rhythm) s.rhythm = {};
    s.rhythm.bpm = parseInt(document.getElementById('rngBpm').value);

    saveData();
    loadSong(currentSongId);
}

// ... (Τα υπόλοιπα Side Recordings, Mobile Nav κλπ παραμένουν ίδια) ...
