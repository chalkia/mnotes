/* =========================================
   SUPABASE CLIENT BRIDGE
   ========================================= */

// 1. ΑΣΦΑΛΗΣ ΛΗΨΗ ΚΛΕΙΔΙΩΝ ΑΠΟ ΤΟ CONFIG.JS
if (typeof CONFIG === 'undefined') {
    console.error("❌ CRITICAL: Το αρχείο js/config.js δεν βρέθηκε ή έχει λάθος!");
    alert("System Error: Configuration file missing (js/config.js).");
}

// Χρήση των κλειδιών από το αρχείο ρυθμίσεων
const SUPABASE_URL = CONFIG.SUPABASE_URL; 
const SUPABASE_KEY = CONFIG.SUPABASE_KEY; 

// ΑΛΛΑΓΗ ΟΝΟΜΑΤΟΣ: Από 'supabase' σε 'supabaseClient'
let supabaseClient = null;
var currentUser = null; // Global variable

// Initialization
if (typeof window.supabase !== 'undefined') {
    // Δημιουργία του Client με τα κλειδιά του Config
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Έλεγχος αν υπάρχει ήδη συνδεδεμένος χρήστης
    supabaseClient.auth.getUser().then(response => {
        if(response.data.user) {
            currentUser = response.data.user;
            console.log("✅ Logged in:", currentUser.email);
            updateAuthUI(true);
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
    
    // Χρήση του supabaseClient
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        currentUser = data.user;
        document.getElementById('authModal').style.display = 'none';
        showToast("Welcome! 👋");
        updateAuthUI(true);
    }
}

async function doSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    msg.innerText = "Creating account...";
    
    // Χρήση του supabaseClient
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        msg.innerText = "Success! Check your email.";
    }
}

async function doLogout() {
    // Χρήση του supabaseClient
    await supabaseClient.auth.signOut();
    currentUser = null;
    updateAuthUI(false);
    showToast("Logged out");
    // Προαιρετικά: Reload για πλήρη καθαρισμό
    // window.location.reload(); 
}

function updateAuthUI(isLoggedIn) {
    const btn = document.getElementById('btnAuth'); // Κουμπί στο footer (αν υπάρχει με αυτό το ID)
    // Αν έχεις το κουμπί στο sidebar-footer ή tools-footer, ίσως χρειάζεται προσαρμογή του selector
    // Αλλά αφήνω τον κώδικά σου όπως ήταν:
    if(!btn) return;
    
    if(isLoggedIn) {
        btn.innerHTML = '<i class="fas fa-user-check"></i>';
        btn.style.color = 'var(--accent)';
        btn.onclick = function() { if(confirm("Log out?")) doLogout(); };
    } else {
        btn.innerHTML = '<i class="fas fa-user"></i>';
        btn.style.color = 'var(--text-muted)';
        btn.onclick = function() { document.getElementById('authModal').style.display = 'flex'; };
    }
}

// --- UPLOAD FUNCTION ---

async function uploadAudioToCloud(audioBlob, filename) {
    if (!currentUser) {
        alert("Please Login to upload!");
        document.getElementById('authModal').style.display = 'flex';
        return null;
    }

    showToast("Uploading... ☁️");

    const filePath = `${currentUser.id}/${filename}`;
    
    // Χρήση του supabaseClient
    const { data, error } = await supabaseClient.storage
        .from('Recordings')
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
        .from('Recordings')
        .getPublicUrl(filePath);

    return urlData.publicUrl;
}

// --- GOOGLE AUTH ---

async function loginWithGoogle() {
    // Έλεγχος αν ο client έχει φορτώσει
    if (!supabaseClient) {
        alert("System Error: Database connection failed.");
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Κρατάμε το href όπως ζήτησες για να δουλεύει στο GitHub Pages
            redirectTo: window.location.href 
        }
    });
    
    if (error) {
        alert("Google Login Error: " + error.message);
    }
    // Δεν χρειάζεται else, φεύγει για Google
}
