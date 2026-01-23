/* =========================================
   UI & APP LOGIC (js/ui.js)
   ========================================= */

// Global Init
if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;
var visiblePlaylist = [];
var html5QrCode; 

window.onload = function() {
    loadLibrary();
    setupEvents();
};

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    
    if (saved) {
        // Περίπτωση 1: Υπάρχουν δεδομένα στη μνήμη
        try { library = JSON.parse(saved); } catch(e) { library = []; }
        finalizeInit();
    } else {
        // Περίπτωση 2: Πρώτη φορά -> Φόρτωσε το library.json από το root
        console.log("Fetching library.json...");
        fetch('./library.json')
            .then(response => {
                if (!response.ok) throw new Error("JSON not found");
                return response.json();
            })
            .then(data => {
                // Έλεγχος αν είναι array ή single object
                library = Array.isArray(data) ? data : [data];
                saveData(); // Αποθήκευση για την επόμενη φορά
                finalizeInit();
            })
            .catch(err => {
                console.error("Load Error:", err);
                // Αν αποτύχει, ξεκίνα με άδεια λίστα
                library = [];
                finalizeInit();
            });
    }
}

function finalizeInit() {
    // Βεβαιώσου ότι όλα τα τραγούδια έχουν τη σωστή δομή
    library = library.map(ensureSongStructure);
    visiblePlaylist = [...library];
    
    renderSidebar();

    // Άνοιγμα του πρώτου τραγουδιού
    if (library.length > 0) {
        loadSong(library[0].id);
    } else {
        switchToEditor();
    }
}

/* --- RENDER FUNCTIONS --- */
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
            <div class="song-meta">${s.artist || "Unknown Artist"} • ${s.key}</div>
        `;
        list.appendChild(li);
    });
}

function loadSong(id) {
    currentSongId = id;
    var s = library.find(x => x.id === id);
    if(!s) return;

    state.t = 0; state.c = 0; // Reset Transpose
    parseSongLogic(s); // logic.js
    renderPlayer(s);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    
    renderSidebar(); 
    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    
    var visualKey = getNote(s.key, state.t); 
    document.getElementById('p-key').innerText = visualKey;

    document.getElementById('p-intro').innerHTML = renderChordsLine(s.intro);
    document.getElementById('p-inter').innerHTML = renderChordsLine(s.interlude);

    document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('val-c').innerText = state.c;

    // Split Body
    var parts = (s.body || "").split(/\n\s*\n/);
    var fixedTxt = parts[0] || "";
    var scrollTxt = parts.slice(1).join("\n\n");

    renderArea('fixed-container', fixedTxt);
    renderArea('scroll-container', scrollTxt);
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
                var p = parts[i];
                var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                if(m) {
                    var chord = getNote(m[1], state.t - state.c);
                    row.appendChild(createToken(chord, m[2]));
                } else {
                    row.appendChild(createToken("", "!" + p));
                }
            }
        }
        container.appendChild(row);
    });
}

function createToken(chord, lyric) {
    var div = document.createElement('div');
    div.className = 'token';
    div.innerHTML = `<span class="chord">${chord}</span><span class="lyric">${lyric}</span>`;
    return div;
}

function renderChordsLine(str) {
    if(!str) return "";
    return str.replace(/!([A-G][#b]?[a-zA-Z0-9/]*)/g, function(match, c) {
        return `<span class="info-chord">${getNote(c, state.t - state.c)}</span>`;
    });
}

/* --- ACTIONS --- */
function changeTranspose(n) { state.t += n; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0) state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    // Clear inputs logic here if needed
}

function cancelEdit() { loadSong(currentSongId); }
function saveEdit() { saveSong(); } // logic.js handles DOM reading

function setupEvents() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    // Import Listener
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
                    newSongs.forEach(s => library.push(ensureSongStructure(s)));
                    saveData();
                    finalizeInit();
                    alert(`Imported ${newSongs.length} songs!`);
                } catch(err) { alert("Error reading file"); }
            };
            reader.readAsText(file);
        });
    }
}

function selectImport(type) {
    document.getElementById('importChoiceModal').style.display = 'none';
    if(type==='file') document.getElementById('hiddenFileInput').click();
    // QR Logic...
}
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }
