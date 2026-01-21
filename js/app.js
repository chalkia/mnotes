/* =========================================
   MAIN APPLICATION LOGIC
   ========================================= */

var hasUnsavedChanges = false;

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
    
    setupDirtyListeners();

    if(library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(true); 
    } else {
        toEditor();
    }
};

function setupDirtyListeners() {
    var inputs = document.querySelectorAll('#editor-view input, #editor-view textarea');
    inputs.forEach(el => {
        el.addEventListener('input', () => { hasUnsavedChanges = true; });
    });
}

// --- NAVIGATION ---
function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    
    if(currentSongId === null) {
        clearInputs();
        hasUnsavedChanges = false;
    } else { 
        var s = library.find(x => x.id === currentSongId); 
        if(s) {
            loadInputsFromSong(s);
            hasUnsavedChanges = false;
        }
    }
}

function toViewer(skipCheck) {
    if(!skipCheck && hasUnsavedChanges) {
        if(confirm("Έχεις μη αποθηκευμένες αλλαγές. Θέλεις να τις αποθηκεύσεις;")) {
            var saved = saveSong(); 
            if(!saved) return; 
        } else {
            hasUnsavedChanges = false; 
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
            // ΔΙΑΒΑΣΜΑ ΡΥΘΜΙΣΕΩΝ LIVE ΑΠΟ ΤΟΝ EDITOR
            var liveCapo = parseInt(document.getElementById('inpCapo').value) || 0;
            var liveTrans = parseInt(document.getElementById('inpTrans').value) || 0;

            // Περνάμε τις τιμές στο State για να φανούν τα badges
            state.c = liveCapo;
            state.t = liveTrans;

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
    var currentKey = document.getElementById('inpKey').value.trim();
    
    // Έλεγχος Transpose για μόνιμη αποθήκευση
    var transVal = parseInt(document.getElementById('inpTrans').value) || 0;
    
    if(!t) { alert("⚠️ Παρακαλώ συμπληρώστε τον Τίτλο!"); return false; }
    if(!b) { alert("⚠️ Παρακαλώ συμπληρώστε τους Στίχους!"); return false; }

    var finalBody = b;
    var finalKey = currentKey;

    // ΑΝ ΕΧΕΙ ΓΙΝΕΙ TRANSPOSE, ΕΦΑΡΜΟΣΕ ΤΟ ΜΟΝΙΜΑ
    if(transVal !== 0) {
        if(confirm("Έχεις αλλάξει τον τόνο (Transpose " + (transVal>0?"+":"") + transVal + ").\nΝα αποθηκευτεί μόνιμα η αλλαγή στο τραγούδι;")) {
            // 1. Υπολογισμός νέου κλειδιού
            finalKey = getNote(currentKey, transVal);
            // 2. Μετατροπή όλου του κειμένου
            finalBody = transposeSongBody(b, transVal);
            // 3. Μηδενισμός του Transpose input (αφού ενσωματώθηκε)
            document.getElementById('inpTrans').value = 0;
            document.getElementById('inpKey').value = finalKey;
            document.getElementById('inpBody').value = finalBody;
        } else {
            // Αν πει όχι, απλά σώζουμε ως έχει και κρατάμε το transpose ως ρύθμιση UI;
            // Η οδηγία λέει "αν θέλει αποθηκεύει το τρανσπόρτο". 
            // Εδώ υποθέτουμε ότι αν πατάει Save, θέλει να σώσει την κατάσταση.
            // Αν ακυρώσει, απλά δεν εφαρμόζουμε μόνιμη αλλαγή, αλλά σώζουμε τα υπόλοιπα.
        }
    }

    var tags = document.getElementById('inpTags').value.split(',').map(x => x.trim()).filter(x => x.length > 0);
    
    var s = {
        id: currentSongId || Date.now().toString(),
        title: t,
        key: finalKey,
        // CAPO: Δεν αποθηκεύεται πλέον
        notes: document.getElementById('inpNotes').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: finalBody,
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
    hasUnsavedChanges = false; 
    alert("Αποθηκεύτηκε! ✅");
    return true; 
}

function deleteCurrentSong() {
    if(currentSongId && confirm("Διαγραφή τραγουδιού;")) {
        library = library.filter(x => x.id !== currentSongId); 
        currentSongId = null; hasUnsavedChanges = false;
        saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); clearInputs(); toEditor();
    }
}

function clearLibrary() { 
    if(confirm("Προσοχή! Διαγραφή ΟΛΩΝ των τραγουδιών;")) { 
        library = []; visiblePlaylist = []; currentSongId = null; hasUnsavedChanges = false;
        saveToLocal(); updatePlaylistDropdown(); renderSidebar(); clearInputs(); toEditor(); 
    } 
}

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

function nextSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i < visiblePlaylist.length - 1) { currentSongId = visiblePlaylist[i + 1].id; toViewer(true); renderSidebar(); } }
function prevSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i > 0) { currentSongId = visiblePlaylist[i - 1].id; toViewer(true); renderSidebar(); } }
