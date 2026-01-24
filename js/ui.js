/* =========================================
   UI & APP LOGIC (js/ui.js)
   ========================================= */

if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;
var visiblePlaylist = [];

window.onload = function() {
    loadSavedTheme(); // Φόρτωση θέματος
    loadLibrary();
    setupEvents();
};

/* --- THEMES --- */
function loadSavedTheme() {
    var th = localStorage.getItem('mnotes_theme') || 'theme-dark';
    document.body.className = th;
}

function cycleTheme() {
    var b = document.body;
    if (b.classList.contains('theme-dark')) {
        b.className = 'theme-slate';
    } else if (b.classList.contains('theme-slate')) {
        b.className = 'theme-light';
    } else {
        b.className = 'theme-dark';
    }
    localStorage.setItem('mnotes_theme', b.className);
}

/* --- LIBRARY --- */
function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    // Πάντα να υπάρχει το Demo αν η λίστα είναι άδεια ή αν λείπει
    var demoExists = library.some(s => s.id === "demo_instruction");
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        library.unshift(DEFAULT_DATA[0]); // Βάλτο στην αρχή
        saveData();
    }

    library = library.map(ensureSongStructure);
    visiblePlaylist = [...library];
    renderSidebar();

    if(!currentSongId) currentSongId = library[0].id;
    loadSong(currentSongId);
}

function clearLibrary() {
    if(confirm("⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα τραγούδια (εκτός από το Demo). Είστε σίγουροι;")) {
        // Κρατάμε μόνο το Demo
        library = [DEFAULT_DATA[0]]; 
        saveData();
        visiblePlaylist = [...library];
        renderSidebar();
        loadSong("demo_instruction");
    }
}

/* --- PLAYER --- */
function loadSong(id) {
    currentSongId = id;
    var s = library.find(x => x.id === id);
    if(!s) return;
    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    renderSidebar(); 
    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-key').innerText = getNote(s.key, state.t);
    
    // Notes
    var notesBtn = "";
    if (s.notes && s.notes.trim() !== "") {
        notesBtn = `<button onclick="toggleNotes()" style="margin-left:10px; background:none; border:none; color:var(--accent); cursor:pointer; font-size:1rem;"><i class="fas fa-sticky-note"></i></button>`;
        document.getElementById('notes-area').innerHTML = s.notes;
        document.getElementById('notes-container').style.display = 'none'; // reset hidden
    } else {
        document.getElementById('notes-container').style.display = 'none';
    }
    
    // Header Buttons update
    var container = document.getElementById('header-actions');
    container.innerHTML = notesBtn + `<button onclick="cycleTheme()" style="margin-left:10px; background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-adjust"></i></button>`;

    // Info
    var infoHtml = "";
    if(s.intro) infoHtml += `<div class="info-row"><span class="meta-label">INTRO</span><span class="info-chord">${renderChordsLine(s.intro)}</span></div>`;
    if(s.interlude) infoHtml += `<div class="info-row"><span class="meta-label">INTER</span><span class="info-chord">${renderChordsLine(s.interlude)}</span></div>`;
    document.querySelector('.info-bar').innerHTML = infoHtml;

    document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('val-c').innerText = state.c;

    var parts = (s.body || "").split(/\n\s*\n/);
    renderArea('fixed-container', parts[0] || "");
    renderArea('scroll-container', parts.slice(1).join("\n\n"));
}

function toggleNotes() {
    var el = document.getElementById('notes-container');
    el.style.display = (el.style.display === 'none') ? 'block' : 'none';
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
    var d = document.createElement('div'); d.className = 'token';
    d.innerHTML = `<span class="chord">${c}</span><span class="lyric">${l}</span>`; return d;
}
function renderChordsLine(str) {
    return str.replace(/!([A-G][#b]?[a-zA-Z0-9/]*)/g, (m, c) => `<span style="margin-right:8px;">${getNote(c, state.t - state.c)}</span>`);
}

function renderSidebar() {
    var list = document.getElementById('songList'); list.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length;
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.onclick = () => loadSong(s.id);
        li.innerHTML = `<div class="song-title">${s.title}</div><div class="song-meta">${s.key}</div>`;
        list.appendChild(li);
    });
}

/* --- EDITOR --- */
function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
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
    } else { createNewSong(); }
    document.getElementById('sidebar').classList.remove('open');
}

function createNewSong() {
    currentSongId = null; 
    ['inpTitle','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => document.getElementById(id).value = "");
    switchToEditor();
}

function cancelEdit() { loadSong(currentSongId || "demo_instruction"); }
function saveEdit() { saveSong(); }

/* --- ACTIONS --- */
function changeTranspose(n) { state.t += n; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function setupEvents() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    const newSongs = Array.isArray(imported) ? imported : [imported];
                    let added = 0;
                    newSongs.forEach(s => { if (!library.some(ex => ex.id === s.id)) { library.push(ensureSongStructure(s)); added++; }});
                    if(added>0) { saveData(); visiblePlaylist=[...library]; renderSidebar(); alert("Imported "+added); }
                    fileInput.value = '';
                } catch(err) { alert("Error"); }
            }; reader.readAsText(file);
        });
    }
}
function selectImport(type) { if(type==='file') document.getElementById('hiddenFileInput').click(); }
