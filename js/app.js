/* =========================================
   MAIN APPLICATION LOGIC
   ========================================= */
var hasUnsavedChanges = false;

window.onload = function() {
    loadSavedTheme();
    setupSidebarSwipe();
   setupAdminSwitch();
    checkPremiumUI();
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            var parsed = JSON.parse(savedData);
            library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) { console.error("Data Load Error", e); }
    }
    setupDirtyListeners();
    if(library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(true); 
    } else { toEditor(); }
// --- ΝΕΟ: Κλήση για συγχρονισμό με GitHub ---
    // Το καλούμε στο τέλος για να μην καθυστερήσει το άνοιγμα της εφαρμογής
    setTimeout(() => {
        syncWithGitHub();
    }, 1000); // Περιμένουμε 1 δευτερόλεπτο να φορτώσει η σελίδα

};

function setupDirtyListeners() {
    var inputs = document.querySelectorAll('#editor-view input, #editor-view textarea');
    inputs.forEach(el => { el.addEventListener('input', () => { hasUnsavedChanges = true; }); });
}

function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    if(currentSongId === null) { clearInputs(); hasUnsavedChanges = false; } 
    else { var s = library.find(x => x.id === currentSongId); if(s) { loadInputsFromSong(s); hasUnsavedChanges = false; } }
}

function toViewer(skipCheck) {
    if(!skipCheck && hasUnsavedChanges) {
        if(confirm("Έχεις μη αποθηκευμένες αλλαγές. Θέλεις να τις αποθηκεύσεις;")) {
            var saved = saveSong(); if(!saved) return; 
        } else {
            hasUnsavedChanges = false; 
            if(currentSongId) { var s = library.find(x => x.id === currentSongId); if(s) loadInputsFromSong(s); }
        }
    }
    try {
        if(library.length === 0) { toEditor(); return; }
        if(!library.find(x => x.id === currentSongId)) { currentSongId = library[0].id; }
        var s = library.find(x => x.id === currentSongId);
        if(s) {
            // Reset Transpose όταν μπαίνουμε στο τραγούδι
            state.t = 0;
            state.c = 0; // Reset Capo (default)
            parseSongLogic(s); 
            render(s);         
            document.getElementById('editor-view').style.display = 'none';
            document.getElementById('viewer-view').style.display = 'flex';
        } else { toEditor(); }
    } catch(e) { console.error("Viewer Error:", e); toEditor(); }
}

// ΝΕΑ ΣΥΝΑΡΤΗΣΗ: ΑΠΟΘΗΚΕΥΣΗ ΑΛΛΑΓΗΣ ΤΟΝΟΥ ΑΠΟ TON VIEWER
function saveToneChange() {
    if(state.t === 0) return;
    var s = library.find(x => x.id === currentSongId);
    if(!s) return;
    
    if(confirm("Θέλεις να αποθηκεύσεις μόνιμα το τραγούδι στον νέο τόνο (" + (state.t>0?"+":"") + state.t + ");")) {
        var newKey = getNote(s.key, state.t);
        var newBody = transposeSongBody(s.body, state.t);
        
        s.key = newKey;
        s.body = newBody;
        
        saveToLocal();
        state.t = 0; // Reset
        parseSongLogic(s);
        render(s);
        alert("Ο νέος τόνος αποθηκεύτηκε!");
    }
}
function clearLibrary() { if(confirm("Προσοχή! Διαγραφή ΟΛΩΝ των τραγουδιών;")) { library = []; visiblePlaylist = []; currentSongId = null; hasUnsavedChanges = false; saveToLocal(); updatePlaylistDropdown(); renderSidebar(); clearInputs(); toEditor(); } }
function filterPlaylist() {
    var cat = document.getElementById('playlistSelect').value;
    var txt = document.getElementById('searchInput').value.toLowerCase().trim();
    currentFilter = cat;
    visiblePlaylist = library.filter(s => {
        var matchCat = (cat === "ALL") || s.playlists.includes(cat);
        var matchTxt = (txt === "") || s.title.toLowerCase().includes(txt);
        return matchCat && matchTxt;
    });
    renderSidebar();
}
function updatePlaylistDropdown() { var s = document.getElementById('playlistSelect'), o = s.value, all = new Set(); library.forEach(x => x.playlists.forEach(t => all.add(t))); s.innerHTML = '<option value="ALL">📂 Όλα</option>'; all.forEach(t => { var op = document.createElement('option'); op.value = t; op.innerText = "💿 " + t; s.appendChild(op); }); s.value = o; if(s.value !== o) s.value = "ALL"; }
function addTrans(n) { state.t += n; render(library.find(x=>x.id===currentSongId)); }
function addCapo(n) { if(state.c + n >= 0) { state.c += n; render(library.find(x=>x.id===currentSongId)); } }
function findSmartCapo() { var result = calculateSmartCapo(); if(result.msg === "No chords!") { alert(result.msg); return; } state.c = result.best; render(library.find(x=>x.id===currentSongId)); showToast(result.msg); }
function nextSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i < visiblePlaylist.length - 1) { currentSongId = visiblePlaylist[i + 1].id; toViewer(true); renderSidebar(); } }
function prevSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i > 0) { currentSongId = visiblePlaylist[i - 1].id; toViewer(true); renderSidebar(); } }
// Καθαρίζει τα πεδία για να γράψουμε νέο τραγούδι
function startNewSong() {if(hasUnsavedChanges && !confirm("Έχεις μη αποθηκευμένες αλλαγές. Θέλεις να ξεκινήσεις νέο τραγούδι;")) { return;} currentSongId = null; clearInputs(); hasUnsavedChanges = false;document.getElementById('editor-view').scrollTop = 0;}
