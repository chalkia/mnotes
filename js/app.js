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
/* ===========================================================
   SUPER USER / GOD MODE LOGIC
   =========================================================== */

let pressTimer;
const SUPER_USER_PASS = "admin123"; // Ο κωδικός σου

// 1. Setup Listeners στο ξεκίνημα
document.addEventListener('DOMContentLoaded', () => {
    // Στοχεύουμε και το κάτω κουμπί της Sidebar και του Drawer
    const targets = ['btnAuthBottom', 'btnAuthDrawer'];
    
    targets.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            // Desktop/Mouse events
            btn.addEventListener('mousedown', startPressTimer);
            btn.addEventListener('mouseup', cancelPressTimer);
            btn.addEventListener('mouseleave', cancelPressTimer);
            
            // Mobile/Touch events
            btn.addEventListener('touchstart', startPressTimer);
            btn.addEventListener('touchend', cancelPressTimer);
        }
    });

    // Δημιουργία του Panel στο DOM (κρυφό)
    createDebugPanel();
});

function startPressTimer(e) {
    // Ακύρωση του default click για να μην ανοίξει το Auth Modal αμέσως
    // (Προαιρετικό, αλλά βοηθάει να μην πετάγεται το modal)
    
    console.log("⏳ Starting Super User Timer...");
    pressTimer = setTimeout(() => {
        const pass = prompt("🔐 SUPER USER ACCESS\nEnter Password:");
        if (pass === SUPER_USER_PASS) {
            activateGodMode();
        } else {
            if(pass !== null) alert("Access Denied");
        }
    }, 5000); // 5 δευτερόλεπτα
}

function cancelPressTimer() {
    clearTimeout(pressTimer);
}

function createDebugPanel() {
    const div = document.createElement('div');
    div.id = "debugPanel";
    div.className = "debug-panel";
    div.innerHTML = `
        <h4>🛠️ GOD MODE</h4>
        
        <div class="debug-row">
            <label>Subscription Tier:</label>
            <select id="debugTier" class="debug-select">
                <option value="free">Free User</option>
                <option value="solo">Solo Pro</option>
                <option value="maestro">Maestro</option>
            </select>
        </div>

        <div class="debug-row">
            <label>Current Role (Context):</label>
            <select id="debugRole" class="debug-select">
                <option value="owner">Owner (Personal)</option>
                <option value="admin">Band Admin/Leader</option>
                <option value="member">Band Member</option>
                <option value="viewer">Viewer (Read Only)</option>
            </select>
        </div>

        <button onclick="applySimulation()" class="debug-btn">APPLY & RELOAD</button>
        <button onclick="document.getElementById('debugPanel').style.display='none'" class="debug-btn" style="background:#555; margin-top:5px;">CLOSE</button>
    `;
    document.body.appendChild(div);
}

function activateGodMode() {
    const panel = document.getElementById('debugPanel');
    if (panel) {
        panel.style.display = 'block';
        
        // Φόρτωση τρεχουσών τιμών
        if (userProfile) {
            document.getElementById('debugTier').value = userProfile.subscription_tier || 'free';
        }
        document.getElementById('debugRole').value = currentRole || 'owner';
        
        showToast("🔓 God Mode Activated!");
    }
}
