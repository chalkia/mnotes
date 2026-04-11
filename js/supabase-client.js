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
    
    if (session) {
        currentUser = session.user;
        updateAuthUI(true);
        // Τρέχει μόνο αν δεν έχει ήδη τρέξει από το doLogin
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (typeof initUserData === 'function') initUserData();
        }
    } else {
        // Καθαρισμός ταυτότητας
        currentUser = null;
        userProfile = null;
        myGroups = [];
        currentGroupId = 'personal';
        updateAuthUI(false);
        
        // Επιστροφή στα τοπικά δεδομένα (Free mode)
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
        group_id: groupId,
        
        is_clone: !!song.is_clone,
        parent_id: song.parent_id || null,
        is_deleted: !!song.is_deleted,
        
        updated_at: new Date().toISOString()
    };
};
