/* =========================================
   MAIN APPLICATION LOGIC - mNotes v2.0 (Clean)
   ========================================= */

var hasUnsavedChanges = false;

window.addEventListener('load', async function() {
    console.log("🚀 mNotes Pro v2.1 Initializing...");

    // 1. UI & Theme
    if (typeof applyTheme === 'function') applyTheme();
    
    // 2. Offline Resilience: Listener για επαναφορά σύνδεσης
    window.addEventListener('online', () => {
        if (typeof processSyncQueue === 'function') processSyncQueue();
    });

    // 3. Auth & Data Initialization
    // Ο έλεγχος χρήστη γίνεται αυτόματα από το supabase-client.js
    // Αν δεν υπάρχει χρήστης, η loadLibrary() του ui.js θα δείξει τα τοπικά
    if (typeof loadLibrary === 'function') loadLibrary();

    // 4. Listeners
    setupDirtyListeners();
    initResizers();

    console.log("✅ App Ready");
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
    if (typeof state === 'undefined') return;
    state.t += n; 
    
    const s = library.find(x => x.id === currentSongId);
    if (s && typeof renderPlayer === 'function') renderPlayer(s); 
    if (typeof updateTransDisplay === 'function') updateTransDisplay();
}

function addCapo(n) { 
    if (typeof state === 'undefined') return;
    if (state.c + n >= 0) { 
        state.c += n; 
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') renderPlayer(s); 
        if (typeof updateTransDisplay === 'function') updateTransDisplay();
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
    if(s && typeof renderPlayer === 'function') renderPlayer(s); 
    if (typeof updateTransDisplay === 'function') updateTransDisplay(); 
}

/**
 * Πλοήγηση Τραγουδιών
 */
function nextSong() { 
    if (!visiblePlaylist || visiblePlaylist.length === 0) return; 
    let i = visiblePlaylist.findIndex(s => s.id === currentSongId); 
    if (i < visiblePlaylist.length - 1) { 
        const nextId = visiblePlaylist[i + 1].id;
        if (typeof loadSong === 'function') loadSong(nextId);
        if (typeof renderSidebar === 'function') renderSidebar(); 
    } 
}

function prevSong() { 
    if (!visiblePlaylist || visiblePlaylist.length === 0) return; 
    let i = visiblePlaylist.findIndex(s => s.id === currentSongId); 
    if (i > 0) { 
        const prevId = visiblePlaylist[i - 1].id;
        if (typeof loadSong === 'function') loadSong(prevId);
        if (typeof renderSidebar === 'function') renderSidebar(); 
    } 
}
