/* =========================================
   SUPABASE CLIENT BRIDGE
   ========================================= */
// !!! ΠΡΟΣΟΧΗ: ΒΑΛΕ ΤΑ ΔΙΚΑ ΣΟΥ ΚΛΕΙΔΙΑ ΕΔΩ !!!
const SUPABASE_URL = 'https://ihrckneywnzgkxantrvm.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocmNrbmV5d256Z2t4YW50cnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTU4NzAsImV4cCI6MjA4NTY5MTg3MH0.Gj7UdQebw8Jg6XbpfZxehPgyikhoUGG1MRd181EXztw'; 

let supabase = null;
let currentUser = null;

if (typeof createClient !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Check if user is logged in
    supabase.auth.getUser().then(response => {
        if(response.data.user) {
            currentUser = response.data.user;
            console.log("✅ Logged in:", currentUser.email);
            updateAuthUI(true);
        }
    });
} else {
    console.error("Supabase Library not loaded!");
}

// --- AUTH FUNCTIONS ---
async function doLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');
    msg.innerText = "Connecting...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { msg.innerText = "Error: " + error.message; } else { currentUser = data.user; document.getElementById('authModal').style.display = 'none'; showToast("Welcome! 👋"); updateAuthUI(true); }
}

async function doSignUp() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPass').value;
    const msg = document.getElementById('authMsg');
    msg.innerText = "Creating account...";
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { msg.innerText = "Error: " + error.message; } else { msg.innerText = "Success! Check your email."; }
}

async function doLogout() { await supabase.auth.signOut(); currentUser = null; updateAuthUI(false); showToast("Logged out"); }

function updateAuthUI(isLoggedIn) {
    const btn = document.getElementById('btnAuth'); if(!btn) return;
    if(isLoggedIn) { btn.innerHTML = '<i class="fas fa-user-check"></i>'; btn.style.color = 'var(--accent)'; btn.onclick = function() { if(confirm("Log out?")) doLogout(); }; } 
    else { btn.innerHTML = '<i class="fas fa-user"></i>'; btn.style.color = 'var(--text-muted)'; btn.onclick = function() { document.getElementById('authModal').style.display = 'flex'; }; }
}

// --- UPLOAD FUNCTION ---
async function uploadAudioToCloud(audioBlob, filename) {
    if (!currentUser) { alert("Please Login to upload!"); document.getElementById('authModal').style.display = 'flex'; return null; }
    showToast("Uploading... ☁️");
    const filePath = `${currentUser.id}/${filename}`;
    const { data, error } = await supabase.storage.from('recordings').upload(filePath, audioBlob, { upsert: true });
    if (error) { alert("Upload Failed: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(filePath);
    return urlData.publicUrl;
}
