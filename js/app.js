/* =========================================
   MAIN APPLICATION LOGIC
   ========================================= */

window.onload = function() {
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            var parsed = JSON.parse(savedData);
            library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) { console.error("Data Load Error", e); }
    }
    
    if(library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(); 
    } else {
        toEditor();
    }
};

// --- NAVIGATION ---
function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    if(currentSongId === null) clearInputs();
    else { 
        var s = library.find(x => x.id === currentSongId); 
        if(s) loadInputsFromSong(s); 
    }
}

function toViewer() {
    try {
        if(library.length === 0) { toEditor(); return; }
        if(!library.find(x => x.id === currentSongId)) { currentSongId = library[0].id; }
        var s = library.find(x => x.id === currentSongId);
        if(s) {
            parseSongLogic(s); // Καλούμε τη Logic
            render(s);         // Καλούμε το UI
            document.getElementById('editor-view').style.display = 'none';
            document.getElementById('viewer-view').style.display = 'flex';
        } else { toEditor(); }
    } catch(e) { console.error("Viewer Error:", e); toEditor(); }
}

// --- ACTIONS ---
function saveSong() {
    var t = document.getElementById('inpTitle').value;
    if(!t) { alert("Βάλε Τίτλο!"); return; }
    var tags = document.getElementById('inpTags').value.split(',').map(x => x.trim()).filter(x => x.length > 0);
    var s = {
        id: currentSongId || Date.now().toString(),
        title: t,
        key: document.getElementById('inpKey').value,
        notes: document.getElementById('inpNotes').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value,
        playlists: tags
    };
    if(currentSongId) { var i = library.findIndex(x => x.id === currentSongId); if(i !== -1) library[i] = s; }
    else { library.push(s); currentSongId = s.id; }
    saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); alert("Saved!");
}

function deleteCurrentSong() {
    if(currentSongId && confirm("Διαγραφή;")) {
        library = library.filter(x => x.id !== currentSongId); currentSongId = null;
        saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); clearInputs(); toEditor();
    }
}

function clearLibrary() { 
    if(confirm("Delete all songs?")) { 
        library = []; visiblePlaylist = []; currentSongId = null; 
        saveToLocal(); updatePlaylistDropdown(); renderSidebar(); clearInputs(); toEditor(); 
    } 
}

// --- FILTERS ---
function filterPlaylist() {
    var v = document.getElementById('playlistSelect').value; currentFilter = v;
    visiblePlaylist = (v === "ALL") ? library : library.filter(s => s.playlists.includes(v));
    renderSidebar();
}

function updatePlaylistDropdown() {
    var s = document.getElementById('playlistSelect'), o = s.value, all = new Set();
    library.forEach(x => x.playlists.forEach(t => all.add(t)));
    s.innerHTML = '<option value="ALL">📂 Όλα</option>';
    all.forEach(t => { var op = document.createElement('option'); op.value = t; op.innerText = "💿 " + t; s.appendChild(op); });
    s.value = o; if(s.value !== o) s.value = "ALL";
}

// --- PLAYBACK CONTROLS ---
function addTrans(n) { state.t += n; render(library.find(x=>x.id===currentSongId)); }
function addCapo(n) { if(state.c + n >= 0) { state.c += n; render(library.find(x=>x.id===currentSongId)); } }
function findSmartCapo() {
    var result = calculateSmartCapo(); // Κλήση Logic
    if(result.msg === "No chords!") { alert(result.msg); return; }
    state.c = result.best;
    render(library.find(x=>x.id===currentSongId));
    showToast(result.msg);
}

function nextSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i < visiblePlaylist.length - 1) { currentSongId = visiblePlaylist[i + 1].id; toViewer(); renderSidebar(); } }
function prevSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i > 0) { currentSongId = visiblePlaylist[i - 1].id; toViewer(); renderSidebar(); } }
