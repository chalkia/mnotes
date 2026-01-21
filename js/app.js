/* =========================================
   MAIN APPLICATION LOGIC
   ========================================= */

var hasUnsavedChanges = false; // Flag για αλλαγές

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
    
    // Προσθήκη Listeners για ανίχνευση αλλαγών (Dirty Check)
    setupDirtyListeners();

    if(library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(true); // true = skip check on first load
    } else {
        toEditor();
    }
};

function setupDirtyListeners() {
    // Βρίσκουμε όλα τα inputs και textareas στον editor
    var inputs = document.querySelectorAll('#editor-view input, #editor-view textarea');
    inputs.forEach(el => {
        el.addEventListener('input', () => {
            hasUnsavedChanges = true;
        });
    });
}

// --- NAVIGATION ---
function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    
    if(currentSongId === null) {
        clearInputs();
        hasUnsavedChanges = false; // Νέο τραγούδι, καθαρή κατάσταση
    } else { 
        var s = library.find(x => x.id === currentSongId); 
        if(s) {
            loadInputsFromSong(s);
            hasUnsavedChanges = false; // Φορτώθηκε, άρα καθαρό
        }
    }
}

function toViewer(skipCheck) {
    // 1. Έλεγχος για μη αποθηκευμένες αλλαγές
    if(!skipCheck && hasUnsavedChanges) {
        if(confirm("Έχεις μη αποθηκευμένες αλλαγές. Θέλεις να τις αποθηκεύσεις πριν φύγεις;")) {
            var saved = saveSong(); // Προσπαθούμε να σώσουμε
            if(!saved) return; // Αν απέτυχε η αποθήκευση (π.χ. κενά πεδία), μένουμε εδώ
        } else {
            // Ο χρήστης επέλεξε "Όχι", άρα αγνοούμε τις αλλαγές
            hasUnsavedChanges = false; 
            // Αν υπάρχει τραγούδι, επαναφέρουμε τα inputs στην αρχική τιμή για να μην μπερδευτεί μετά
            if(currentSongId) {
                 var s = library.find(x => x.id === currentSongId);
                 if(s) loadInputsFromSong(s);
            }
        }
    }

    try {
        if(library.length === 0) { toEditor(); return; }
        if(!library.find(x => x.id === currentSongId)) { currentSongId = library[0].id; }
        var s = library.find(x => x.id === currentSongId);
        if(s) {
            parseSongLogic(s); 
            render(s);         
            document.getElementById('editor-view').style.display = 'none';
            document.getElementById('viewer-view').style.display = 'flex';
        } else { toEditor(); }
    } catch(e) { console.error("Viewer Error:", e); toEditor(); }
}

// --- ACTIONS ---
function saveSong() {
    var t = document.getElementById('inpTitle').value.trim();
    var b = document.getElementById('inpBody').value.trim();

    // 2. Έλεγχος Υποχρεωτικών Πεδίων
    if(!t) { alert("⚠️ Παρακαλώ συμπληρώστε τον Τίτλο!"); return false; }
    if(!b) { alert("⚠️ Παρακαλώ συμπληρώστε τους Στίχους!"); return false; }

    var tags = document.getElementById('inpTags').value.split(',').map(x => x.trim()).filter(x => x.length > 0);
    
    var s = {
        id: currentSongId || Date.now().toString(),
        title: t,
        key: document.getElementById('inpKey').value,
        notes: document.getElementById('inpNotes').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: b,
        playlists: tags
    };

    if(currentSongId) { 
        var i = library.findIndex(x => x.id === currentSongId); 
        if(i !== -1) library[i] = s; 
    } else { 
        library.push(s); 
        currentSongId = s.id; 
    }
    
    saveToLocal(); 
    updatePlaylistDropdown(); 
    filterPlaylist(); 
    
    hasUnsavedChanges = false; // Reset flag μετά την αποθήκευση
    alert("Αποθηκεύτηκε! ✅");
    return true; // Επιστρέφει true για να ξέρει το toViewer ότι πέτυχε
}

function deleteCurrentSong() {
    if(currentSongId && confirm("Διαγραφή τραγουδιού;")) {
        library = library.filter(x => x.id !== currentSongId); 
        currentSongId = null;
        hasUnsavedChanges = false;
        saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); clearInputs(); toEditor();
    }
}

function clearLibrary() { 
    if(confirm("Προσοχή! Διαγραφή ΟΛΩΝ των τραγουδιών;")) { 
        library = []; visiblePlaylist = []; currentSongId = null; hasUnsavedChanges = false;
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
    var result = calculateSmartCapo(); 
    if(result.msg === "No chords!") { alert(result.msg); return; }
    state.c = result.best;
    render(library.find(x=>x.id===currentSongId));
    showToast(result.msg);
}

function nextSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i < visiblePlaylist.length - 1) { currentSongId = visiblePlaylist[i + 1].id; toViewer(true); renderSidebar(); } }
function prevSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i > 0) { currentSongId = visiblePlaylist[i - 1].id; toViewer(true); renderSidebar(); } }
