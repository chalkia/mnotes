/* =========================================
   MAIN APPLICATION LOGIC - mNotes v2.0 (Clean)
   ========================================= */

var hasUnsavedChanges = false;

window.addEventListener('load', function() {
    // 1. Αρχικοποίηση UI & Theme
    if (typeof loadSavedTheme === 'function') loadSavedTheme();
    if (typeof setupSidebarSwipe === 'function') setupSidebarSwipe();
    
    // 2. Φόρτωση Τοπικών Δεδομένων (Cache/Free Tier)
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            var parsed = JSON.parse(savedData);
            // Χρησιμοποιούμε την ensureSongStructure από το storage.js για ασφάλεια
            library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            
            if (typeof updatePlaylistDropdown === 'function') updatePlaylistDropdown();
            if (typeof filterPlaylist === 'function') filterPlaylist();
        } catch(e) { 
            console.error("Data Load Error", e); 
        }
    }

    // 3. Listeners για μη αποθηκευμένες αλλαγές
    setupDirtyListeners();

    // 4. Αρχική Προβολή (Viewer αν υπάρχει βιβλιοθήκη, αλλιώς Editor)
    if(library && library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        if (typeof toViewer === 'function') toViewer(true); 
    } else { 
        if (typeof toEditor === 'function') toEditor(); 
    }

    console.log("🚀 mNotes App Loaded & Cleaned");
});

/**
 * Παρακολουθεί τα inputs του editor για αλλαγές
 */
function setupDirtyListeners() {
    var inputs = document.querySelectorAll('#editor-view input, #editor-view textarea');
    inputs.forEach(el => { 
        el.addEventListener('input', () => { 
            hasUnsavedChanges = true; 
        });
    });
}

/**
 * Ενημερώνει το dropdown με τις λίστες (Playlists)
 */
function updatePlaylistDropdown() {
    var s = document.getElementById('playlistSelect');
    if(!s) return;
    
    var o = s.value;
    var all = new Set();
    
    library.forEach(x => {
        if(x.playlists && Array.isArray(x.playlists)) {
            x.playlists.forEach(t => all.add(t));
        }
    });

    s.innerHTML = '<option value="ALL">📂 Όλα</option>';
    all.forEach(t => { 
        var op = document.createElement('option');
        op.value = t;
        op.innerText = "💿 " + t;
        s.appendChild(op);
    });

    s.value = o;
    if(s.value !== o) s.value = "ALL";
}

/**
 * Μουσικά Εργαλεία (Transpose & Capo)
 */
function addTrans(n) { 
    state.t += n; 
    var s = library.find(x => x.id === currentSongId);
    if(s && typeof render === 'function') render(s); 
}

function addCapo(n) { 
    if(state.c + n >= 0) { 
        state.c += n; 
        var s = library.find(x => x.id === currentSongId);
        if(s && typeof render === 'function') render(s); 
    } 
}

/**
 * Υπολογισμός και εφαρμογή του Smart Capo
 */
function findSmartCapo() { 
    if (typeof calculateSmartCapo !== 'function') return;
    
    var result = calculateSmartCapo(); 
    if(result.msg === "No chords!") { 
        alert(result.msg); 
        return; 
    } 
    
    state.c = result.best; 
    var s = library.find(x => x.id === currentSongId);
    if(s && typeof render === 'function') render(s); 
    if (typeof showToast === 'function') showToast(result.msg); 
}

/**
 * Πλοήγηση Τραγουδιών
 */
function nextSong() { 
    if(!visiblePlaylist || visiblePlaylist.length === 0) return; 
    var i = visiblePlaylist.findIndex(s => s.id === currentSongId); 
    if(i < visiblePlaylist.length - 1) { 
        currentSongId = visiblePlaylist[i + 1].id; 
        if (typeof toViewer === 'function') toViewer(true); 
        if (typeof renderSidebar === 'function') renderSidebar(); 
    } 
}

function prevSong() { 
    if(!visiblePlaylist || visiblePlaylist.length === 0) return; 
    var i = visiblePlaylist.findIndex(s => s.id === currentSongId); 
    if(i > 0) { 
        currentSongId = visiblePlaylist[i - 1].id; 
        if (typeof toViewer === 'function') toViewer(true); 
        if (typeof renderSidebar === 'function') renderSidebar(); 
    } 
}
