/* =========================================
   SUPABASE CLIENT BRIDGE
   ========================================= */

// 1. ΡΥΘΜΙΣΕΙΣ (Αντικατέστησε τα παρακάτω με τα δικά σου από το Settings -> API)
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co'; // <-- Βάλε το Project URL σου
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // <-- Βάλε το anon public key σου

// 2. Initialization
let supabase = null;
let currentUser = null;

if (typeof createClient !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Έλεγχος αν υπάρχει ήδη συνδεδεμένος χρήστης
    supabase.auth.getUser().then(response => {
        if(response.data.user) {
            currentUser = response.data.user;
            console.log("✅ Logged in as:", currentUser.email);
            updateAuthUI(true);
        }
    });
} else {
    console.error("Supabase Library not loaded!");
}

// 3. AUTH FUNCTIONS
async function doLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "Connecting...";
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        currentUser = data.user;
        document.getElementById('authModal').style.display = 'none';
        showToast("Welcome back! 👋");
        updateAuthUI(true);
    }
}

async function doSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');

    msg.innerText = "Creating account...";

    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) {
        msg.innerText = "Error: " + error.message;
    } else {
        msg.innerText = "Success! Check your email to confirm.";
    }
}

async function doLogout() {
    await supabase.auth.signOut();
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

// 4. STORAGE UPLOAD FUNCTION (Η καρδιά της ηχογράφησης)
async function uploadAudioToCloud(audioBlob, filename) {
    if (!currentUser) {
        alert("Πρέπει να συνδεθείτε (Login) για να ανεβάσετε αρχεία!");
        document.getElementById('authModal').style.display = 'flex';
        return null;
    }

    showToast("Uploading to Cloud... ☁️");

    // Upload στο bucket 'recordings'
    // Φάκελος: user_id / filename
    const filePath = `${currentUser.id}/${filename}`;
    
    const { data, error } = await supabase.storage
        .from('recordings')
        .upload(filePath, audioBlob, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        console.error("Upload Error:", error);
        alert("Upload Failed: " + error.message);
        return null;
    }

    // Λήψη του Public URL για να το αποθηκεύσουμε
    const { data: urlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(filePath);

    console.log("File Uploaded:", urlData.publicUrl);
    showToast("Upload Complete! ✅");
    
    return urlData.publicUrl;
}
