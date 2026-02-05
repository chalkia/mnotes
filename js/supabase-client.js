/* =========================================
   SUPABASE CLIENT BRIDGE (FULL VERSION)
   ========================================= */

// 1. Έλεγχος CONFIG 
if (typeof CONFIG === 'undefined') {
    console.error("CRITICAL: Το αρχείο js/config.js λείπει ή έχει λάθος σύνταξη.");
    alert("System Error: Configuration file missing.");
}

// 2. Μεταβλητές (Global)
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;

// Ορίζουμε τον client global για να τον βλέπουν όλοι
var supabaseClient = null; 
var currentUser = null; 

// 3. Αρχικοποίηση (Initialization)
if (typeof window.supabase !== 'undefined') {
    // Δημιουργία Client
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Ακροατής αλλαγής κατάστασης (Σημαντικό για το Google Login Redirect)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            console.log("✅ Auth State Change: Logged in as", currentUser.email);
            updateAuthUI(true);
        } else {
            currentUser = null;
            console.log("💤 Auth State Change: Logged out");
            updateAuthUI(false);
        }
    });

} else {
    console.error("❌ Supabase Library not loaded! Check index.html");
    alert("Supabase library missing.");
}


/* =========================================
   AUTH FUNCTIONS
   ========================================= */

// --- GOOGLE LOGIN (FIXED) ---
async function loginWithGoogle() {
    if (!supabaseClient) return;
    
    console.log("Attempting Google Login...");
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Χρησιμοποιούμε origin για να αποφύγουμε παραμέτρους URL που μπερδεύουν
            redirectTo: window.location.origin 
        }
    });
    
    if (error) {
        alert("Google Login Error: " + error.message);
        console.error(error);
    }
}

// --- EMAIL / PASSWORD LOGIN ---
async function doLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "Connecting...";
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        // Το onAuthStateChange θα αναλάβει τα υπόλοιπα
        document.getElementById('authModal').style.display = 'none';
        showToast("Welcome back! 👋");
    }
}

// --- SIGN UP ---
async function doSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    msg.innerText = "Creating account...";
    
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        msg.innerText = "Success! Check your email to confirm.";
    }
}

// --- LOGOUT ---
async function doLogout() {
    await supabaseClient.auth.signOut();
    // Το onAuthStateChange θα καθαρίσει το UI
    showToast("Logged out");
    // Προαιρετικά κάνουμε reload για να καθαρίσουν όλα τελείως
    setTimeout(() => window.location.reload(), 500);
}

// --- UI UPDATER ---
function updateAuthUI(isLoggedIn) {
    const btn = document.getElementById('btnAuth'); // Το κουμπί στο sidebar-footer ή tools-footer
    if(!btn) return;
    
    // Ενημέρωση και του εικονιδίου στο Sidebar (αν υπάρχει ξεχωριστά)
    const sidebarIcon = document.querySelector('.fa-user'); 
    
    if(isLoggedIn) {
        // Κουμπί Sidebar
        btn.innerHTML = '<i class="fas fa-user-check"></i>';
        btn.style.color = 'var(--accent)';
        btn.title = `Logged in as ${currentUser.email}`;
        btn.onclick = function() { if(confirm(`Log out from ${currentUser.email}?`)) doLogout(); };
        
        // Αν υπάρχει άλλο εικονίδιο user κάπου αλλού
        if(sidebarIcon) sidebarIcon.style.color = 'var(--accent)';
        
    } else {
        btn.innerHTML = '<i class="fas fa-user"></i> Account'; // Ή σκέτο εικονίδιο αν δεν χωράει
        btn.style.color = 'var(--text-muted)';
        btn.title = "Login / Sign up";
        btn.onclick = function() { document.getElementById('authModal').style.display = 'flex'; };
        
        if(sidebarIcon) sidebarIcon.style.color = 'inherit';
    }
}


/* =========================================
   STORAGE / UPLOAD FUNCTIONS
   ========================================= */

async function uploadAudioToCloud(audioBlob, filename) {
    if (!currentUser) {
        alert("Please Login to upload!");
        document.getElementById('authModal').style.display = 'flex';
        return null;
    }

    showToast("Uploading... ☁️");

    // Δημιουργία μοναδικού ονόματος για να μην έχουμε conflicts
    // φάκελος_χρήστη/timestamp_όνομα
    const filePath = `${currentUser.id}/${Date.now()}_${filename}`;
    
    const { data, error } = await supabaseClient.storage
        .from('Recordings') // Βεβαιώσου ότι το Bucket λέγεται 'Recordings' στο Supabase
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
