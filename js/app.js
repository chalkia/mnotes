/* =========================================
   MAIN APPLICATION LOGIC - mNotes v2.0 (Clean)
   ========================================= */
var hasUnsavedChanges = false;
window.mRhythm = null;
window.isRhythmPlaying = false;

window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v2.1 Initializing...");
    if (typeof requestWakeLock === 'function') requestWakeLock();
    if (typeof applyTheme === 'function') applyTheme();
    
    window.addEventListener('online', () => {
        if (typeof processSyncQueue === 'function') processSyncQueue();
    });

    // ✨ Ενεργοποιεί το Import και τα κλικ της οθόνης
    if (typeof setupEvents === 'function') setupEvents();

    setupDirtyListeners();

    if (typeof setupGestures === 'function') setupGestures();
   
    // 🥁 ΑΡΧΙΚΟΠΟΙΗΣΗ ΡΥΘΜΩΝ (Απευθείας μέσα στο load)
    if (typeof MNotesRhythmRuntime !== 'undefined') {
        window.mRhythm = new MNotesRhythmRuntime();
        console.log("🥁 [RHYTHM] Το mNotes Rhythm Runtime φορτώθηκε επιτυχώς.");
        
        // Συνδέουμε τα events για να ξέρουμε πότε παίζει και πότε σταματάει
        window.mRhythm.onPlaybackStarted = () => { window.isRhythmPlaying = true; };
        window.mRhythm.onPlaybackStopped = () => { window.isRhythmPlaying = false; };
        
        // ΣΗΜΕΙΩΣΗ: Αν η μηχανή χρειάζεται init(), μπορείς να το καλέσεις εδώ, 
        // αν και συχνά το AudioContext απαιτεί κλικ από τον χρήστη πρώτα.
        // Αν χρειαστεί, βάζεις: window.mRhythm.init().catch(e => console.warn(e));

    } else {
        console.warn("⚠️ [RHYTHM] Το MNotesRhythmRuntime δεν βρέθηκε. Ελέγξτε τη σειρά των <script>.");
    }
   
   // Ασφαλής εκκίνηση των Resizers (Προστασία από καθυστερήσεις της Cache/Login)
    if (typeof initResizers === 'function') {
        initResizers();
    } else {
        console.warn("⚠️ initResizers delayed: Function not loaded yet.");
        // Σε περίπτωση που αργήσει, το δοκιμάζουμε ξανά με μικρή καθυστέρηση
        setTimeout(() => {
            if (typeof initResizers === 'function') initResizers();
        }, 500);
    } console.log("✅ App Ready");
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

//  APP VERSION FETCH
// ==========================================
window.getAppVersion = async function() {
    try {
        const response = await fetch('./sw.js?_=' + Date.now());
        const text = await response.text();
        const match = text.match(/v(\d+\.\d+)/i);
        return match ? `v${match[1]}` : 'Unknown';
    } catch (err) {
        console.error("❌ Σφάλμα ανάγνωσης sw.js:", err);
        return 'N/A';
    }
};

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
    // Αν υπάρχει ήδη, μην το ξαναφτιάξεις
    if(document.getElementById('debugPanel')) return;

    const div = document.createElement('div');
    div.id = "debugPanel";
    div.className = "debug-panel";
    div.style.display = "none"; // ΠΡΟΣΘΗΚΗ: Κρύψιμο κατευθείαν από τη JS
    
    // Το υπόλοιπο HTML ανανεωμένο με τα νέα Tiers & Roles!
    div.innerHTML = `
        <h4>🛠️ GOD MODE</h4>
        
        <div class="debug-row">
            <label>Subscription Tier:</label>
            <select id="debugTier" class="debug-select">
                <option value="solo_free">Solo Free</option>
                <option value="solo_pro">Solo Pro</option>
                <option value="band_leader">BandLeader</option>
                <option value="band_maestro">BandMaestro</option>
                <option value="ensemble">Ensemble</option>
            </select>
        </div>

        <div class="debug-row">
            <label>Current Role (Context):</label>
            <select id="debugTier" class="debug-select">
                <option value="solo_free">Solo Free</option>
                <option value="solo_pro">Solo Pro</option>
                <option value="band_mate">BandMate</option>
                <option value="band_leader">BandLeader</option>
                <option value="band_maestro">BandMaestro</option>
                <option value="ensemble">Ensemble</option>
             </select>
        </div>

        <hr style="border-color:#555; margin:15px 0 10px 0;">
        <h5 style="margin:0 0 10px 0; color:#28a745;"><i class="fas fa-gift"></i> PROMO GENERATOR</h5>
        
        <input type="text" id="adminPromoCode" placeholder="Όνομα (άστο κενό για τυχαίο)" class="debug-select" style="margin-bottom:8px; width:100%; box-sizing:border-box; text-align:center;">
        
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px dashed #555;">
            <label style="display:block; font-size:0.75rem; color:#aaa; margin-bottom:5px; text-transform:uppercase;">Κατηγορια Δωρου:</label>
            <select id="adminPromoType" class="debug-select" style="margin-bottom:12px; width:100%; box-sizing:border-box;" onchange="updatePromoPlaceholder()">
                <optgroup label="👑 Συνδρομές">
                    <option value="tier_upgrade">Αναβάθμιση Πακέτου (Tier)</option>
                </optgroup>
                <optgroup label="🎸 Επεκτάσεις (Add-ons)">
                    <option value="extra_bands">Επιπλέον Μπάντες (+Slots)</option>
                    <option value="extra_storage">Επιπλέον Χώρος (+Cloud MB)</option>
                </optgroup>
                <optgroup label="🥁 Ρυθμοί & Ήχοι">
                    <option value="rhythm_credits">Μονάδες Ρυθμών (Credits)</option>
                </optgroup>
            </select>
            
            <label style="display:block; font-size:0.75rem; color:#aaa; margin-bottom:5px; text-transform:uppercase;">Αξια Δωρου:</label>
            <input type="text" id="adminPromoValue" placeholder="solo_pro, band_leader ή ensemble" class="debug-select" style="margin-bottom:5px; width:100%; box-sizing:border-box; text-align:center; font-weight:bold; color:var(--accent);">
        </div>
        
        <button onclick="generatePromoCode()" class="debug-btn" style="background:#28a745; margin-bottom:15px; font-weight:bold;">ΔΗΜΙΟΥΡΓΙΑ ΚΩΔΙΚΟΥ</button>

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
        // ΠΡΟΣΘΗΚΗ: Βάζουμε το !important μέσω JS για να είμαστε 100% σίγουροι
        panel.style.setProperty('display', 'block', 'important'); 
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
    if (valInp === 'solo_pro') codeInp = `SOLO-${randomString}`;
    else if (valInp === 'band_maestro') codeInp = `MAESTRO-${randomString}`;
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
// ===========================================================
// PAYWALL / UPGRADE PROMPT
// ===========================================================
window.promptUpgrade = function(featureName) {
    const pModal = document.getElementById('pricingModal');
    if (pModal) {
        // 1. Εμφανίζουμε το παράθυρο με τις τιμές/πακέτα
        pModal.style.display = 'flex';
        
        // 2. Πετάμε και ένα ωραίο μήνυμα για να ξέρει τι έγινε
        if (typeof showToast === 'function') {
            const lang = localStorage.getItem('mnotes_lang') || 'el';
            const msg = lang === 'el' 
                ? `Το εργαλείο "${featureName}" απαιτεί αναβάθμιση λογαριασμού!` 
                : `The feature "${featureName}" requires a premium account!`;
            showToast(msg);
        }
    } else {
        // Ασφάλεια αν για κάποιο λόγο λείπει το HTML του modal
        alert("Απαιτείται αναβάθμιση λογαριασμού για: " + featureName);
    }
};
