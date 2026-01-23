/* =========================================
   UI & APP LOGIC (js/ui.js) - IMPROVED 32/1 9.20μμ
   ========================================= */

// Global Init
if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;
var visiblePlaylist = [];

window.onload = function() {
    loadLibrary();
    setupEvents();
};

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) {
        try { library = JSON.parse(saved); } catch(e) { library = []; }
    }
    
    // Load Defaults if empty
    if (library.length === 0 && typeof DEFAULT_DATA !== 'undefined') {
        library = JSON.parse(JSON.stringify(DEFAULT_DATA));
        saveData();
    }

    library = library.map(ensureSongStructure);
    visiblePlaylist = [...library];
    
    renderSidebar();

    if (library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        loadSong(currentSongId);
    } else {
        createNewSong();
    }
}

/* --- RENDER PLAYER --- */
function loadSong(id) {
    currentSongId = id;
    var s = library.find(x => x.id === id);
    if(!s) return;

    state.t = 0; state.c = 0; // Reset Transpose
    parseSongLogic(s); // Logic parsing
    renderPlayer(s);
    
    // Switch View
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    
    renderSidebar(); 
    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-key').innerText = getNote(s.key, state.t);

    // 1. NOTES (Top, Toggleable)
    var notesBtnHtml = "";
    var notesBoxHtml = "";
    
    if (s.notes && s.notes.trim() !== "") {
        // Κουμπί δίπλα στο κλειδί
        notesBtnHtml = `<button onclick="toggleNotes()" style="margin-left:10px; background:none; border:1px solid #555; color:#ff9800; padding:2px 8px; border-radius:10px; cursor:pointer; font-size:0.8rem;">
                            <i class="fas fa-sticky-note"></i> Notes
                        </button>`;
        
        // Το κουτί των σημειώσεων
        notesBoxHtml = `<div id="notes-area" class="notes-container">
                            <div class="notes-text">${s.notes}</div>
                        </div>`;
    }
    
    // Εισαγωγή του κουμπιού στο Header
    var headerRow = document.querySelector('.header-row');
    // Καθαρίζουμε παλιά κουμπιά αν υπάρχουν
    var oldBtn = document.getElementById('btn-notes-toggle');
    if(oldBtn) oldBtn.remove();
    
    if(notesBtnHtml) {
        var btnSpan = document.createElement('span');
        btnSpan.id = 'btn-notes-toggle';
        btnSpan.innerHTML = notesBtnHtml;
        headerRow.appendChild(btnSpan);
    }

    // 2. INTRO / INTERLUDE (Vertical Stack)
    var infoHtml = "";
    
    // Προσθέτουμε τις σημειώσεις πρώτα (κρυφές ή φανερές)
    infoHtml += notesBoxHtml;

    if(s.intro) {
        infoHtml += `<div class="info-row">
                        <span class="meta-label">INTRO</span>
                        <span class="info-chord">${renderChordsLine(s.intro)}</span>
                     </div>`;
    }
    if(s.interlude) {
        infoHtml += `<div class="info-row">
                        <span class="meta-label">INTER</span>
                        <span class="info-chord">${renderChordsLine(s.interlude)}</span>
                     </div>`;
    }

    // Αντικατάσταση του περιεχομένου του info-bar
    document.querySelector('.info-bar').innerHTML = infoHtml;

    // Values Update
    document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('val-c').innerText = state.c;

    // Body Splitting
    var parts = (s.body || "").split(/\n\s*\n/);
    renderArea('fixed-container', parts[0] || "");
    renderArea('scroll-container', parts.slice(1).join("\n\n"));
}

function toggleNotes() {
    var el = document.getElementById('notes-area');
    if(el) {
        el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
    }
}

function renderArea(elemId, text) {
    var container = document.getElementById(elemId);
    container.innerHTML = "";
    var lines = text.split('\n');
    lines.forEach(line => {
        var row = document.createElement('div');
        row.className = 'line-row';
        if (line.indexOf('!') === -1) {
            row.innerHTML = `<span class="lyric">${line}</span>`;
        } else {
            var parts = line.split('!');
            if(parts[0]) row.appendChild(createToken("", parts[0]));
            for(var i=1; i<parts.length; i++) {
                var m = parts[i].match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                if(m) {
                    var chord = getNote(m[1], state.t - state.c);
                    row.appendChild(createToken(chord, m[2]));
                } else {
                    row.appendChild(createToken("", "!" + parts[i]));
                }
            }
        }
        container.appendChild(row);
    });
}

function createToken(c, l) {
    var d = document.createElement('div');
    d.className = 'token';
    d.innerHTML = `<span class="chord">${c}</span><span class="lyric">${l}</span>`;
    return d;
}

function renderChordsLine(str) {
    if(!str) return "";
    return str.replace(/!([A-G][#b]?[a-zA-Z0-9/]*)/g, (m, c) => 
        `<span style="margin-right:8px;">${getNote(c, state.t - state.c)}</span>`
    );
}

function renderSidebar() {
    var list = document.getElementById('songList');
    list.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length;

    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.onclick = () => loadSong(s.id);
        
        li.innerHTML = `
            <div class="song-title">${s.title}</div>
            <div class="song-meta">${s.key}</div>
        `;
        list.appendChild(li);
    });
}

/* --- EDITOR LOGIC (FIXED) --- */

function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    
    // ΕΔΩ ΗΤΑΝ ΤΟ ΛΑΘΟΣ: Πρέπει να γεμίζουμε τα πεδία!
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            document.getElementById('inpTitle').value = s.title;
            document.getElementById('inpKey').value = s.key;
            document.getElementById('inpTags').value = (s.playlists || []).join(', ');
            document.getElementById('inpIntro').value = s.intro;
            document.getElementById('inpInter').value = s.interlude;
            document.getElementById('inpNotes').value = s.notes;
            document.getElementById('inpBody').value = s.body;
        }
    } else {
        clearEditorFields();
    }
    
    // Κλείσιμο Sidebar αν είναι ανοιχτό
    document.getElementById('sidebar').classList.remove('open');
}

function createNewSong() {
    currentSongId = null; // Reset ID για να καταλάβει το save ότι είναι νέο
    clearEditorFields();
    switchToEditor();
}

function clearEditorFields() {
    ['inpTitle','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => {
        document.getElementById(id).value = "";
    });
}

function cancelEdit() { 
    if(currentSongId && library.find(s=>s.id===currentSongId)) {
        loadSong(currentSongId);
    } else if(library.length > 0) {
        loadSong(library[0].id);
    } else {
        // Αν δεν υπάρχει τίποτα, μείνε στο editor αλλά καθάρισε
        createNewSong();
    }
}

function saveEdit() { 
    // Καλούμε την saveSong από το logic.js
    // Αφού σωθεί, ξαναφορτώνουμε τον Player
    saveSong(); 
}

/* --- ACTIONS --- */
function changeTranspose(n) { state.t += n; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function setupEvents() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    
    // Import Logic (FIXED DUPLICATE CHECK)
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    const newSongs = Array.isArray(imported) ? imported : [imported];
                    
                    let addedCount = 0;
                    newSongs.forEach(s => {
                        // Έλεγχος αν υπάρχει ήδη το ID
                        if (!library.some(exist => exist.id === s.id)) {
                            library.push(ensureSongStructure(s));
                            addedCount++;
                        }
                    });
                    
                    if (addedCount > 0) {
                        saveData();
                        visiblePlaylist = [...library];
                        renderSidebar();
                        alert(`Imported ${addedCount} new songs! (Duplicates skipped)`);
                        // Αν φορτώθηκαν νέα και δεν βλέπαμε κάτι, άνοιξε το πρώτο νέο
                        if(!currentSongId) loadSong(newSongs[0].id);
                    } else {
                        alert("No new songs found (all IDs exist).");
                    }
                    
                    document.getElementById('importChoiceModal').style.display = 'none';
                    
                } catch(err) { alert("Error reading file"); }
            };
            reader.readAsText(file);
            // Reset input για να ξαναδουλέψει αν επιλέξουμε το ίδιο αρχείο
            fileInput.value = ''; 
        });
    }
}

function selectImport(type) {
    if(type==='file') {
        document.getElementById('hiddenFileInput').click();
    }
}
