/* =========================================
   SUPABASE CLIENT BRIDGE (js/supabase-client.js)
   ========================================= */

// 1. ΑΣΦΑΛΗΣ ΛΗΨΗ ΚΛΕΙΔΙΩΝ ΑΠΟ ΤΟ CONFIG.JS
if (typeof CONFIG === 'undefined') {
    console.error("❌ CRITICAL: Το αρχείο js/config.js δεν βρέθηκε ή έχει λάθος!");
    alert("System Error: Configuration file missing (js/config.js).");
}

// Χρήση των κλειδιών από το αρχείο ρυθμίσεων
const SUPABASE_URL = CONFIG.SUPABASE_URL; 
const SUPABASE_KEY = CONFIG.SUPABASE_KEY; 

let supabaseClient = null;
var currentUser = null; // Global variable

// Initialization
if (typeof window.supabase !== 'undefined') {
    // Δημιουργία του Client
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Έλεγχος αν υπάρχει ήδη συνδεδεμένος χρήστης
    supabaseClient.auth.getUser().then(response => {
        if(response.data.user) {
            currentUser = response.data.user;
            console.log("✅ Logged in:", currentUser.email);
            updateAuthUI(true);
            // Αν είναι ήδη συνδεδεμένος κατά το φόρτωμα, τρέξε την αρχικοποίηση
            if (typeof initUserData === 'function') initUserData();
        }
    });
} else {
    console.error("❌ Supabase Library not loaded! Check index.html");
}

// --- AUTH FUNCTIONS ---

async function doLogin() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    if (!email || !password) {
        msg.innerText = (typeof t === 'function') ? t('msg_title_body_req') : "Παρακαλώ συμπληρώστε Email και Κωδικό.";
        return;
    }

    console.log(`[AUTH] Προσπάθεια εισόδου για το email: ${email}`);
    msg.innerText = "Connecting... / Φόρτωση..."; 

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        currentUser = data.user;
        console.log(`[AUTH] Επιτυχής είσοδος. User ID: ${currentUser.id}`);
        
        document.getElementById('authModal').style.display = 'none';
        msg.innerText = ""; 
        showToast("Επιτυχής σύνδεση! 🎉");
        
        // ✨ ΔΙΕΓΡΑΦΗ: Το UI(true) αφαιρέθηκε για να μην προκαλέσει ReferenceError.
        
        if (typeof initUserData === 'function') initUserData(); 
        
    } catch (err) {
        console.error("[AUTH ERROR] Σφάλμα Εισόδου:", err.message);
        msg.innerText = "Λάθος στοιχεία ή το προφίλ δεν υπάρχει.";
        showToast("Αποτυχία σύνδεσης", "error");
    }
}

async function doSignUp() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    if (!email || !password) {
        msg.innerText = "Παρακαλώ συμπληρώστε Email και Κωδικό.";
        return;
    }

    if (password.length < 6) {
        msg.innerText = "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.";
        return;
    }

    console.log(`[AUTH] Προσπάθεια εγγραφής νέου χρήστη: ${email}`);
    msg.innerText = "Creating account... / Δημιουργία λογαριασμού...";

    try {
        // ✨ Η ΔΙΟΡΘΩΣΗ ΓΙΑ ΤΟ EMAIL: Παίρνουμε το καθαρό URL
        const cleanUrl = window.location.origin + window.location.pathname;
        console.log(`[AUTH] Το email redirect ορίστηκε στο: ${cleanUrl}`);

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            // ✨ Ενημερώνουμε τη Supabase πού να επιστρέψει τον χρήστη
            options: {
                emailRedirectTo: cleanUrl
            }
        });

        if (error) throw error;

        console.log("[AUTH] Επιτυχής Εγγραφή. Δεδομένα Supabase:", data);
        document.getElementById('authModal').style.display = 'none';
        msg.innerText = ""; 
        
        // Έλεγχος αν απαιτείται επιβεβαίωση email
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            console.warn(`[AUTH] Το email ${email} χρησιμοποιείται ήδη.`);
            showToast("Αυτό το email χρησιμοποιείται ήδη.", "error");
            msg.innerText = "Το email χρησιμοποιείται ήδη.";
        } else if (data.session) {
            showToast("Η εγγραφή ολοκληρώθηκε! Καλώς ήρθατε! 🎉");
        } else {
            showToast("Επιτυχία! Ελέγξτε το email σας για επιβεβαίωση 📩", "info");
        }
    } catch (err) {
        console.error("[AUTH ERROR] Σφάλμα Εγγραφής:", err.message);
        msg.innerText = "Σφάλμα: " + err.message;
    }
}

async function doLogout() {
    try {
        console.log("🚪 [AUTH] Εκκίνηση αποσύνδεσης...");
        
        // Ζητάμε από τη Supabase να κλείσει το session
        await supabaseClient.auth.signOut();
        
        // Ο Κεντρικός Ελεγκτής (onAuthStateChange) θα πιάσει το SIGNED_OUT
        // Αλλά για απόλυτη ασφάλεια και άδειασμα της μνήμης (cache/variables),
        // κάνουμε ένα σκληρό reload της σελίδας.
        window.location.reload(); 
        
    } catch (err) {
        console.error("❌ Logout Error:", err);
    }
}
//   Password Recovery Functions
// 1. Στέλνει το Email ανάκτησης
async function sendPasswordReset() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
        showToast("Παρακαλώ γράψτε το email σας στο πεδίο πάνω και ξαναπατήστε το.", "warning");
        return;
    }

    const cleanUrl = window.location.origin + window.location.pathname;
    
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: cleanUrl,
        });
        if (error) throw error;
        
        showToast("Σας στείλαμε email με οδηγίες επαναφοράς! 📩", "info");
        document.getElementById('authModal').style.display = 'none';
    } catch (err) {
        console.error("Reset Error:", err);
        showToast("Σφάλμα: " + err.message, "error");
    }
}

// 2. Αποθηκεύει τον νέο κωδικό
async function updateNewPassword() {
    const newPass = document.getElementById('newAuthPass').value;
    if (newPass.length < 6) {
        document.getElementById('resetMsg').innerText = "Τουλάχιστον 6 χαρακτήρες.";
        return;
    }

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPass });
        if (error) throw error;

        showToast("Ο κωδικός σας άλλαξε επιτυχώς! ✅");
        document.getElementById('resetPasswordModal').style.display = 'none';
    } catch (err) {
        console.error("Update Pass Error:", err);
        document.getElementById('resetMsg').innerText = "Σφάλμα: " + err.message;
    }
}

function updateAuthUI(isLoggedIn) {
    // ΔΙΟΡΘΩΣΗ: Προστέθηκε το 'btnAuthDrawer' για το κινητό
    const buttonIDs = ['btnAuth', 'btnAuthBottom', 'btnAuthDrawer'];

    buttonIDs.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return; 

        if (isLoggedIn) {
            // ΣΥΝΔΕΔΕΜΕΝΟΣ
            btn.innerHTML = '<i class="fas fa-user-check"></i> Account';
            btn.style.color = 'var(--accent)';
            btn.onclick = function() { 
                if (typeof openAccountModal === 'function') openAccountModal();
            };
        } else {
            // ΑΠΟΣΥΝΔΕΔΕΜΕΝΟΣ
            btn.innerHTML = '<i class="fas fa-user"></i> Account';
            btn.style.color = 'var(--text-muted)'; // ή 'inherit'
            btn.onclick = function() { 
                document.getElementById('authModal').style.display = 'flex'; 
            };
        }
    });
}

// --- ΓΕΝΙΚΗ ΣΥΝΑΡΤΗΣΗ UPLOAD (Για Ήχο, PDF, Εικόνες κλπ) ---
async function uploadFileToCloud(fileBlob, filename, bucketName = 'user_assets') {
    if (!currentUser) {
        alert("Παρακαλώ συνδεθείτε για να ανεβάσετε αρχεία!");
        document.getElementById('authModal').style.display = 'flex';
        return null;
    }

    // Το Λουκέτο του Πορτιέρη για τα συνημμένα
    if (typeof canUserPerform === 'function' && !canUserPerform('SAVE_ATTACHMENTS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Cloud Storage');
        return null;
    }

    showToast("Ανέβασμα αρχείου... ☁️");

    // Αποθηκεύουμε τα αρχεία στον ατομικό φάκελο του χρήστη
    const filePath = `${currentUser.id}/${filename}`;
    
    // Ανεβάζουμε στο δυναμικό Bucket (προεπιλογή: user_assets)
    const { data, error } = await supabaseClient.storage
        .from(bucketName)
        .upload(filePath, fileBlob, {
            cacheControl: '3600',
            upsert: true
        });

    if (error) {
        alert("Το ανέβασμα απέτυχε: " + error.message);
        console.error(error);
        return null;
    }

    // Παίρνουμε το Public Link
    const { data: urlData } = supabaseClient.storage
        .from(bucketName)
        .getPublicUrl(filePath);

    return urlData.publicUrl;
}
// --- OAUTH LOGINS (Google, Apple, Facebook, Spotify) ---
// Μία έξυπνη συνάρτηση για όλους τους παρόχους
async function loginWith(providerName) {
    try {
        // Παίρνουμε το καθαρό URL της εφαρμογής (χωρίς το τεράστιο #hash)
        const cleanUrl = window.location.origin + window.location.pathname;
        
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: providerName,
            options: {
                redirectTo: cleanUrl // Επιβάλλουμε την επιστροφή στο καθαρό URL
            }
        });

        if (error) throw error;
        
    } catch (err) {
        console.error(`${providerName} Auth Error:`, err);
        const msgBox = document.getElementById('authMsg');
        if (msgBox) msgBox.innerText = "Σφάλμα: " + err.message;
    }
}

// Διατηρούμε την παλιά συνάρτηση για να μην "σπάσει" το παλιό κουμπί στο HTML (αν δεν το έχεις αλλάξει ακόμα)
function loginWithGoogle() {
    loginWith('google');
}

// --- GLOBAL AUTH STATE LISTENER ---
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("Auth Event:", event);
   
   if (event === 'PASSWORD_RECOVERY') {
        // Κλείνουμε τυχόν άλλα modals και ανοίγουμε αυτό της επαναφοράς
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('resetPasswordModal').style.display = 'flex';
        return;
    }

    if (session) {
        currentUser = session.user;
        updateAuthUI(true);
        // Τρέχει μόνο αν δεν έχει ήδη τρέξει από το doLogin
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (typeof initUserData === 'function') initUserData();
        }
    } else {
        // Καθαρισμός ταυτότητας → υποβάθμιση σε Guest
        currentUser = null;
        userProfile = null;
        myGroups = [];
        currentGroupId = 'personal';
        updateAuthUI(false);
        
        // Περικοπή βιβλιοθήκης στο Guest όριο (5) + διαγραφή band lists
        // Καλύπτει: manual logout, token expiry, kick από άλλη συσκευή
        if (typeof trimLibraryToGuestLimit === 'function') trimLibraryToGuestLimit();
        
        // Επαναφορά UI στα Guest δικαιώματα (κρύβει premium features)
        if (typeof refreshUIByTier === 'function') refreshUIByTier();
        
        // Επιστροφή στα τοπικά δεδομένα (Guest mode)
        if (typeof loadContextData === 'function') loadContextData();
    }
});

// --- DTO & SANITIZATION ΓΙΑ TH SUPABASE ---
window.sanitizeForDatabase = function(song, userId, groupId = null) {
    return {
        id: song.id,
        title: song.title || "Untitled",
        artist: song.artist || "",
        key: song.key || "",
        body: song.body || "",
        intro: song.intro || "",
        interlude: song.interlude || song.inter || "", 
        
        notes: song.notes || "", 
        // ✨ Η ΤΕΛΙΚΗ ΔΙΟΡΘΩΣΗ: Κάνουμε map το camelCase του JS στο snake_case της SQL
        conductor_notes: song.conductorNotes || song.conductor_notes || "", 
        
        video: song.video || "",
        tags: Array.isArray(song.tags) ? song.tags : (Array.isArray(song.playlists) ? song.playlists : []),
        recordings: Array.isArray(song.recordings) ? song.recordings : [],
        attachments: Array.isArray(song.attachments) ? song.attachments : [],
        user_id: userId,
        group_id: (groupId === 'personal') ? null : (groupId || null),
        
        is_clone: !!song.is_clone,
        parent_id: song.parent_id || null,
        is_deleted: !!song.is_deleted,
        
        updated_at: new Date().toISOString()
    };
};
async function updateStorageUI() {
    if (!currentUser) return;

    const storageText = document.getElementById('storageText');
    const storageBar = document.getElementById('storageBar');
    
    if (storageText) storageText.innerText = "Υπολογισμός... ⏳";

    try {
        // 1. Παίρνουμε το όριο του χρήστη από την TIER_CONFIG
        const limits = typeof getUserLimits === 'function' ? getUserLimits() : { storageLimitMB: 0 };
        const maxMB = limits.storageLimitMB;

        // 2. Αν είναι Free και έχει 0 όριο
        if (maxMB === 0) {
            if (storageText) storageText.innerText = "0 MB / 0 MB (Αναβαθμίστε)";
            if (storageBar) storageBar.style.width = '0%';
            return;
        }

        // 3. Διαβάζουμε τα αρχεία του από το Bucket (στον προσωπικό του φάκελο)
        const { data: files, error } = await supabaseClient.storage
            .from('user_assets') // Βάλε το σωστό bucket αν το έχεις αλλάξει
            .list(currentUser.id, {
                limit: 1000,
                offset: 0
            });

        if (error) throw error;

        // 4. Υπολογισμός μεγέθους σε Bytes
        let totalBytes = 0;
        if (files && files.length > 0) {
            files.forEach(file => {
                // To metadata.size επιστρέφει bytes (αγνοούμε τυχόν κενούς φακέλους)
                if (file.metadata && file.metadata.size) {
                    totalBytes += file.metadata.size;
                }
            });
        }

        // Μετατροπή σε Megabytes (με 1 δεκαδικό)
        const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);

        // 5. Ενημέρωση του UI
        if (storageText) {
            storageText.innerText = `${usedMB} MB / ${maxMB} MB`;
        }
        
        if (storageBar) {
            let percent = (usedMB / maxMB) * 100;
            if (percent > 100) percent = 100; // Για να μην βγει η μπάρα έξω από το div!
            
            storageBar.style.width = `${percent}%`;
            
            // Αλλάζουμε χρώμα ανάλογα με την πληρότητα
            if (percent > 90) {
                storageBar.style.background = '#ff4444'; // Κόκκινο (Κίνδυνος)
            } else if (percent > 75) {
                storageBar.style.background = '#ffbb33'; // Κίτρινο/Πορτοκαλί (Προειδοποίηση)
            } else {
                storageBar.style.background = 'var(--accent)'; // Κανονικό χρώμα
            }
        }

    } catch (err) {
        console.error("❌ Σφάλμα υπολογισμού χώρου:", err);
        if (storageText) storageText.innerText = "Σφάλμα υπολογισμού";
    }
}
// ===========================================================
// CONCURRENCY MONITOR (1 Mobile + 1 Desktop Limit)
// ===========================================================
const myDeviceInstanceId = Math.random().toString(36).substring(2, 15);
const myConnectionTime = Date.now();

// Έξυπνος έλεγχος αν είναι Κινητό/Tablet ή Υπολογιστής
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const myDeviceType = isMobileDevice ? 'mobile' : 'desktop';

let userPresenceChannel = null;

function startConcurrencyMonitor() {
    if (typeof currentUser === 'undefined' || !currentUser || !supabaseClient) return;

    if (userPresenceChannel) {
        supabaseClient.removeChannel(userPresenceChannel);
    }

    userPresenceChannel = supabaseClient.channel('presence_' + currentUser.id);

    userPresenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = userPresenceChannel.presenceState();
            let allDevices = [];

            // Συλλέγουμε όλες τις συσκευές που βρίσκονται στο "δωμάτιο"
            for (const key in state) {
                allDevices.push(...state[key]);
            }

            // Φιλτράρουμε για να δούμε πόσες είναι του ΙΔΙΟΥ τύπου με εμάς
            const myTypeDevices = allDevices.filter(d => d.device_type === myDeviceType);

            // Αν υπάρχουν πάνω από 1 (π.χ. 2 κινητά ή 2 υπολογιστές)
            if (myTypeDevices.length > 1) {
                // Βρίσκουμε ποια μπήκε τελευταία (βάσει του online_at)
                myTypeDevices.sort((a, b) => b.online_at - a.online_at);
                const newestDevice = myTypeDevices[0];

                // Αν ΕΓΩ ΔΕΝ είμαι η νεότερη συσκευή, τρώω μπλοκ!
                if (newestDevice.device_id !== myDeviceInstanceId) {
                    showConcurrencyBlocker(myDeviceType);
                } else {
                    // Εγώ είμαι ο νέος, άρα παίζω κανονικά
                    hideConcurrencyBlocker();
                }
            } else {
                hideConcurrencyBlocker();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Δηλώνουμε την παρουσία μας και τον τύπο της συσκευής μας
                await userPresenceChannel.track({
                    device_id: myDeviceInstanceId,
                    device_type: myDeviceType,
                    online_at: myConnectionTime
                });
            }
        });
}

// --- ΟΠΤΙΚΟ ΜΠΛΟΚΑΡΙΣΜΑ (Προσαρμοσμένο) ---
function showConcurrencyBlocker(deviceType) {
    let blocker = document.getElementById('concurrencyBlocker');
    const typeText = deviceType === 'mobile' ? 'άλλη κινητή συσκευή/tablet' : 'άλλον υπολογιστή';
    
    if (!blocker) {
        blocker = document.createElement('div');
        blocker.id = 'concurrencyBlocker';
        blocker.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; text-align:center; padding:20px; backdrop-filter: blur(10px);';
        document.body.appendChild(blocker);
    }
    
    blocker.innerHTML = `
        <i class="fas fa-ban" style="font-size:4rem; color:var(--danger, #ff4444); margin-bottom:20px;"></i>
        <h2 style="margin-bottom:10px;">Όριο Συσκευών</h2>
        <p style="max-width:400px; color:#aaa; line-height:1.5; margin-bottom:30px;">
            Εντοπίσαμε ότι συνδεθήκατε από <b>${typeText}</b>.<br><br>
            Το mNotes Pro επιτρέπει ταυτόχρονη χρήση μόνο σε 1 Υπολογιστή και 1 Κινητό/Tablet.<br><br>
            Η συνεδρία σε αυτή τη συσκευή τέθηκε σε αναμονή.
        </p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: var(--accent); color: #000; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem;">
            <i class="fas fa-sync-alt"></i> Επανασύνδεση Εδώ
        </button>
    `;
    blocker.style.display = 'flex';
}

function hideConcurrencyBlocker() {
    const blocker = document.getElementById('concurrencyBlocker');
    if (blocker) blocker.style.display = 'none';
}
// ===========================================================
// mNotes - DEVICE LOCK & ANTI-FRAUD SYSTEM
// Αρχείο: deviceAuth.js
// ===========================================================

const DEVICE_KEY = 'mnotes_device_id';

// 1. Εντοπισμός τύπου συσκευής (βάσει πλάτους οθόνης, όπως κάνουμε στο UI)
function getDeviceType() {
    return window.innerWidth <= 1024 ? 'mobile' : 'desktop';
}

// 2. Ανάκτηση ή Δημιουργία Μοναδικού ID Συσκευής
function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        // Δημιουργία τυχαίου αλφαριθμητικού (π.χ. dev_a8f9b2_171300000)
        id = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem(DEVICE_KEY, id);
        console.log(`🔒 [Device Auth] Δημιουργήθηκε νέο Device ID: ${id}`);
    }
    return id;
}

// 3. Εγγραφή της συσκευής & Έλεγχος Συγκρούσεων κατά την είσοδο
async function registerDevice(userId) {
    if (!userId || !navigator.onLine) return;
    
    const deviceId = getOrCreateDeviceId();
    const deviceType = getDeviceType();
    const column = deviceType === 'mobile' ? 'active_mobile_id' : 'active_desktop_id';

    try {
        // ΒΗΜΑ Α: Ελέγχουμε ποιος είναι ήδη συνδεδεμένος στη βάση
        const { data: profile, error: fetchErr } = await supabaseClient
            .from('profiles').select(column).eq('id', userId).single();

        if (fetchErr) throw fetchErr;

        // Αν υπάρχει ΗΔΗ άλλο ID καταχωρημένο, σημαίνει ότι κάποιος άλλος (ή εσύ από αλλού) είναι μέσα
        if (profile && profile[column] && profile[column] !== deviceId) {
            
            // Ρωτάμε τον χρήστη τι θέλει να κάνει
            const confirmMsg = typeof t === 'function' 
                ? t('msg_device_in_use', "Ο λογαριασμός σας χρησιμοποιείται ήδη σε άλλη συσκευή. Θέλετε να την αποσυνδέσετε για να μπείτε εσείς;")
                : "Ο λογαριασμός σας χρησιμοποιείται ήδη σε άλλη συσκευή. Θέλετε να την αποσυνδέσετε για να μπείτε εσείς;";
                
            const stealSession = confirm(confirmMsg);

            if (!stealSession) {
                // Ο χρήστης πάτησε Ακύρωση. Τον πετάμε ΑΜΕΣΩΣ από το νέο παράθυρο.
                console.warn("🛑 [Device Auth] Είσοδος ακυρώθηκε από τον χρήστη. Γίνεται Logout.");
                if (typeof handleLogout === 'function') {
                    handleLogout();
                } else {
                    await supabaseClient.auth.signOut();
                    window.location.reload();
                }
                return; // Σταματάμε τον κώδικα εδώ!
            }
        }

        // ΒΗΜΑ Β: Αν ήταν κενό Ή αν ο χρήστης πάτησε "ΟΚ (Κλέψε τη συνεδρία)"
        const { error: updateErr } = await supabaseClient
            .from('profiles')
            .update({ [column]: deviceId })
            .eq('id', userId);

        if (updateErr) throw updateErr;
        console.log(`🔒 [Device Auth] Η συσκευή (${deviceType}) πήρε τον έλεγχο επιτυχώς!`);
        
    } catch (err) {
        console.error("❌ [Device Auth] Σφάλμα κατά την εγγραφή της συσκευής:", err);
    }
}

// 4. Έλεγχος Νομιμότητας Συσκευής
async function checkDeviceLock(userId) {
    if (!userId || !navigator.onLine) return true; // Offline λειτουργία: τον αφήνουμε να παίξει

    const deviceId = getOrCreateDeviceId();
    const deviceType = getDeviceType();
    const column = deviceType === 'mobile' ? 'active_mobile_id' : 'active_desktop_id';

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select(column)
            .eq('id', userId)
            .single();

        if (error) throw error;

        // Αν υπάρχει ID στη βάση και ΔΕΝ ταιριάζει με το δικό μας...
        if (data && data[column] !== null && data[column] !== deviceId) {
            console.warn(`🚨 [Device Auth] ΑΝΙΧΝΕΥΤΗΚΕ ΣΥΓΚΡΟΥΣΗ! DB: ${data[column]} !== Local: ${deviceId}`);
            return false; 
        }

        return true; // Είμαστε νόμιμοι
    } catch (err) {
        console.error("❌ [Device Auth] Σφάλμα ελέγχου κλειδώματος:", err);
        return true; // Fallback ασφαλείας σε περίπτωση σφάλματος δικτύου
    }
}

// 5. Το Heartbeat (Σφυγμός) που τρέχει αθόρυβα
let heartbeatInterval = null;

function startDeviceHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    console.log("⏱️ [Device Auth] Ο έλεγχος συσκευών ξεκίνησε.");
    
    heartbeatInterval = setInterval(async () => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            
            const isAuthorized = await checkDeviceLock(currentUser.id);
            
            if (!isAuthorized) {
                console.error("🛑 [Device Auth] ΑΠΟΒΟΛΗ: Έγινε σύνδεση από άλλη συσκευή της ίδιας κατηγορίας.");
                clearInterval(heartbeatInterval); // Σταματάμε το heartbeat
                
                alert(typeof t === 'function' ? t('msg_device_conflict', "Ο λογαριασμός σας συνδέθηκε σε άλλη συσκευή. Αποσυνδέεστε για λόγους ασφαλείας.") : "Ο λογαριασμός σας συνδέθηκε σε άλλη συσκευή.");
                
                // Πέταγμα έξω (Προϋποθέτει ότι υπάρχει συνάρτηση logout στο auth.js/logic.js)
                if (typeof handleLogout === 'function') {
                    handleLogout();
                } else if (typeof supabaseClient !== 'undefined') {
                    await supabaseClient.auth.signOut();
                    window.location.reload();
                }
            }
        }
    }, 60000); // Έλεγχος κάθε 1 λεπτό (60000 ms)
}