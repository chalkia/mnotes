/* =========================================
   MAIN APPLICATION LOGIC - mNotes v2.0 (Clean)
   ========================================= */

var hasUnsavedChanges = false;
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v2.1 Initializing...");

    if (typeof applyTheme === 'function') applyTheme();
    
    window.addEventListener('online', () => {
        if (typeof processSyncQueue === 'function') processSyncQueue();
    });

    // ✨ ΑΥΤΟ ΕΛΕΙΠΕ! Ενεργοποιεί το Import και τα κλικ της οθόνης
    if (typeof setupEvents === 'function') setupEvents();

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
    console.log("⏳ Starting Super User Timer...");
    pressTimer = setTimeout(async () => {
        // --- ΝΕΑ ΑΣΠΙΔΑ ΑΣΦΑΛΕΙΑΣ ---
        // 1. Έλεγχος αν υπάρχει συνδεδεμένος χρήστης
        if (typeof currentUser === 'undefined' || !currentUser) {
            console.log("God Mode: Access denied (Not logged in)");
            return; 
        }
        
        // 2. Έλεγχος αν το email είναι το δικό σου (ΒΑΛΕ ΕΔΩ ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΣΟΥ EMAIL!)
        if (currentUser.email !== 'chalkia.duck@gmail.com') {
            console.log("God Mode: Access denied (Unauthorized email)");
            return; 
        }
        // ------------------------------

        const pass = prompt("🔐 SUPER USER ACCESS\nEnter Password:");
        if (!pass) return; // Αν πατήσει ακύρωση, σταματάμε

        try {
            // Ρωτάμε τη Supabase (το Backend) αν ο κωδικός είναι σωστός
            const { data: isCorrect, error } = await supabaseClient.rpc('verify_god_mode', { pass_attempt: pass });
            
            if (error) throw error;

            if (isCorrect) {
                activateGodMode();
            } else {
                alert("Access Denied");
            }
        } catch (err) {
            console.error("Auth Error:", err);
            alert("Σφάλμα επαλήθευσης! Έχει δημιουργηθεί το RPC 'verify_god_mode' στη Supabase;");
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

        <hr style="border-color:#555; margin:15px 0 10px 0;">
        <h5 style="margin:0 0 10px 0; color:#28a745;"><i class="fas fa-gift"></i> PROMO GENERATOR</h5>
        
        <input type="text" id="adminPromoCode" placeholder="Όνομα Κωδικού (π.χ. SUMMER26)" class="debug-select" style="margin-bottom:5px; width:100%; box-sizing:border-box;">
        
        <select id="adminPromoType" class="debug-select" style="margin-bottom:5px; width:100%; box-sizing:border-box;">
            <option value="tier_upgrade">Tier Upgrade (solo ή maestro)</option>
            <option value="extra_bands">Extra Bands (αριθμός)</option>
            <option value="extra_storage">Extra Storage MB (αριθμός)</option>
            <option value="rhythm_credits">Rhythm Credits (αριθμός)</option>
        </select>
        
        <input type="text" id="adminPromoValue" placeholder="Αξία (π.χ. solo ή 50)" class="debug-select" style="margin-bottom:10px; width:100%; box-sizing:border-box;">
        
        <button onclick="generatePromoCode()" class="debug-btn" style="background:#28a745; margin-bottom:15px;">ΔΗΜΙΟΥΡΓΙΑ ΚΩΔΙΚΟΥ</button>

        <button onclick="applySimulation()" class="debug-btn">APPLY & RELOAD</button>
        <button onclick="document.getElementById('debugPanel').style.display='none'" class="debug-btn" style="background:#555; margin-top:5px;">CLOSE</button>
    `;
    document.body.appendChild(div);
}

function activateGodMode() {
    let panel = document.getElementById('debugPanel');
    // Αν δεν υπάρχει, κάλεσε τη δημιουργία (Bypass)
    if (!panel) {
        createDebugPanel(); 
        panel = document.getElementById('debugPanel');
    }

    if (panel) {
        panel.style.display = 'block';
        showToast("🔓 SUPER USER ACCESS GRANTED");
        console.log("🚀 God Mode Panel is now visible in the center of the screen.");
    }
}
function setupEvents() {
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        console.log("✅ Event Listener attached to #hiddenFileInput");
        
        fileInput.addEventListener('change', function(e) {
            console.log("📂 File selected from disk!");
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(ex) {
                try {
                    console.log("📄 Reading file content...");
                    const imported = JSON.parse(ex.target.result);
                    
                    // ✨ ΕΔΩ ΕΙΝΑΙ Η ΑΛΛΑΓΗ: Καλούμε ρητά τη συνάρτηση του logic.js μέσω window
                    if (typeof window.processImportedData === 'function') {
                        console.log("🚀 Calling window.processImportedData...");
                        await window.processImportedData(imported);
                    } else if (typeof processImportedData === 'function') {
                        console.log("🚀 Calling local processImportedData...");
                        await processImportedData(imported);
                    } else {
                        console.error("❌ ERROR: processImportedData NOT FOUND ANYWHERE!");
                        alert("Σφάλμα: Η λειτουργία εισαγωγής δεν βρέθηκε.");
                    }

                    const modal = document.getElementById('importChoiceModal');
                    if(modal) modal.style.display = 'none';
                } catch(err) {
                    console.error("❌ JSON PARSE ERROR:", err);
                    alert("Το αρχείο δεν είναι έγκυρο mNotes format.");
                }
            };
            reader.readAsText(file);
            fileInput.value = ''; // Reset για επόμενη χρήση
        });
    } else {
        console.error("❌ CRITICAL: #hiddenFileInput NOT FOUND IN DOM!");
    }

    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.tag-wrapper');
        var sugg = document.getElementById('tagSuggestions');
        if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) {
            sugg.style.display = 'none';
        }
    });
}
async function generatePromoCode() {
    let codeInp = document.getElementById('adminPromoCode').value.trim().toUpperCase();
    const typeInp = document.getElementById('adminPromoType').value;
    const valInp = document.getElementById('adminPromoValue').value.trim();

    // Αν δεν έγραψες κωδικό, ο God φτιάχνει έναν τυχαίο επαγγελματικό κωδικό!
    if (!codeInp) {
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Προθέματα ανάλογα με το δώρο
        if (valInp === 'solo') codeInp = `SOLO-${randomString}`;
        else if (valInp === 'maestro') codeInp = `MAESTRO-${randomString}`;
        else codeInp = `GIFT-${randomString}`; 
    }

    if (!valInp) {
        alert("⚠️ Συμπλήρωσε την Αξία του δώρου (π.χ. 'solo', 'maestro' ή '5')!");
        return;
    }

    try {
        const { error } = await supabaseClient.from('gift_codes').insert([{
            code: codeInp,
            reward_type: typeInp,
            reward_value: valInp
        }]);

        if (error) throw error;

        // Εμφανίζει παράθυρο για πανεύκολη αντιγραφή (Copy)
        prompt("✅ Ο κωδικός δημιουργήθηκε επιτυχώς!\nΑντέγραψέ τον και στείλε τον στον χρήστη:", codeInp);
        
        document.getElementById('adminPromoCode').value = ''; // Καθαρίζουμε το πεδίο
        document.getElementById('adminPromoValue').value = ''; // Καθαρίζουμε την αξία
        
    } catch (err) {
        console.error("Generator Error:", err);
        alert("❌ Σφάλμα: " + err.message);
    }
}
