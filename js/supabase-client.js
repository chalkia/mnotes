/* =========================================
   SUPABASE CLIENT BRIDGE
   ========================================= */
// !!! ΠΡΟΣΟΧΗ: ΒΑΛΕ ΤΑ ΔΙΚΑ ΣΟΥ ΚΛΕΙΔΙΑ ΕΔΩ !!!
const SUPABASE_URL = 'https://ihrckneywnzgkxantrvm.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocmNrbmV5d256Z2t4YW50cnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTU4NzAsImV4cCI6MjA4NTY5MTg3MH0.Gj7UdQebw8Jg6XbpfZxehPgyikhoUGG1MRd181EXztw'; 

// ΑΛΛΑΓΗ ΟΝΟΜΑΤΟΣ: Από 'supabase' σε 'supabaseClient' για να μην τσακώνεται με τη βιβλιοθήκη
let supabaseClient = null;
var currentUser = null; // Χρησιμοποιούμε var για να είναι ορατό παντού (global)

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
}

function updateAuthUI(isLoggedIn) {
    const btn = document.getElementById('btnAuth');
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
        .from('recordings')
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
        .from('recordings')
        .getPublicUrl(filePath);

    return urlData.publicUrl;
}
async function loginWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Αυτό ξαναφέρνει τον χρήστη στη σελίδα σου μετά το login
            redirectTo: window.location.href 
        }
    });
    
    if (error) {
        alert("Google Login Error: " + error.message);
    }
    // Σημείωση: Δεν χρειάζεται "else" εδώ. 
    // Ο χρήστης θα φύγει από τη σελίδα για να πάει στην Google και θα γυρίσει αυτόματα.
}
