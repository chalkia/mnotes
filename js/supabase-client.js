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
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "Connecting...";
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        currentUser = data.user;
        document.getElementById('authModal').style.display = 'none';
        showToast("Welcome! 👋");
        updateAuthUI(true);
        // Κλήση αρχικοποίησης
        if (typeof initUserData === 'function') initUserData(); 
    }
}

async function doSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    msg.innerText = "Creating account...";
    
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        msg.innerText = "Success! Check your email.";
    }
}
async function doLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    userProfile = null;      // Reset profile
    myGroups = [];           // Reset bands
    currentGroupId = 'personal'; 
    currentRole = 'owner';
    
    updateAuthUI(false);
    showToast("Logged out");
    
    // Φόρτωση των τοπικών δεδομένων ξανά
    if (typeof loadContextData === 'function') loadContextData();
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
                if(confirm(`Log out from ${currentUser.email}?`)) doLogout(); 
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

// --- UPLOAD FUNCTION (LEGACY / HELPER) ---
// Σημείωση: Η κύρια λειτουργία upload είναι πλέον στο audio.js
async function uploadAudioToCloud(audioBlob, filename) {
    if (!currentUser) {
        alert("Please Login to upload!");
        document.getElementById('authModal').style.display = 'flex';
        return null;
    }

    showToast("Uploading... ☁️");

    const filePath = `${currentUser.id}/${filename}`;
    
    // ΔΙΟΡΘΩΣΗ: Χρήση του σωστού bucket name 'audio_files'
    const { data, error } = await supabaseClient.storage
        .from('audio_files')
        .upload(filePath, audioBlob, {
            cacheControl: '3600',
            upsert: true
        });

    if (error) {
        alert("Upload Failed: " + error.message);
        console.error(error);
        return null;
    }

    // Λήψη του Public URL
    const { data: urlData } = supabaseClient.storage
        .from('audio_files')
        .getPublicUrl(filePath);

    return urlData.publicUrl;
}

// --- GOOGLE AUTH ---

async function loginWithGoogle() {
    if (!supabaseClient) {
        alert("System Error: Database connection failed.");
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.href 
        }
    });
    
    if (error) {
        alert("Google Login Error: " + error.message);
    }
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
   // --- DTO & SANITIZATION ΓΙΑ TH SUPABASE ---
// Κρατάει ΜΟΝΟ τις στήλες που περιμένει η βάση, αποτρέποντας τα Error 400.
window.sanitizeForDatabase = function(song, userId, groupId = null) {
    return {
        id: song.id,
        title: song.title || "Untitled",
        artist: song.artist || "",
        key: song.key || "",
        body: song.body || "",
        intro: song.intro || "",
        // Πιάνει και το "inter" και το "interlude"
        interlude: song.interlude || song.inter || "", 
        // Πιάνει και το "conductorNotes"
        notes: song.notes || song.conductorNotes || "", 
        video: song.video || "",
        // Εξασφαλίζει ότι τα tags είναι Array (και σώζει τα παλιά playlists)
        tags: Array.isArray(song.tags) ? song.tags : (Array.isArray(song.playlists) ? song.playlists : []),
        recordings: Array.isArray(song.recordings) ? song.recordings : [],
        attachments: Array.isArray(song.attachments) ? song.attachments : [],
        user_id: userId,
        group_id: groupId,
        updated_at: new Date().toISOString()
    };
};
});

