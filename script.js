/* =========================================
   1. CONFIG & GLOBALS
   ========================================= */
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
// Ακόρντα που θεωρούνται "εύκολα" για το Smart Capo
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

var library = [];
var visiblePlaylist = [];
var currentSongId = null;
var currentFilter = "ALL";
var state = { t: 0, c: 0, parsedChords: [], parsedLyrics: [], meta: {} };
var html5QrcodeScanner = null;

/* =========================================
   2. STARTUP
   ========================================= */
window.onload = function() {
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            var parsed = JSON.parse(savedData);
            library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            updatePlaylistDropdown();
            filterPlaylist(); // Αρχικό φιλτράρισμα
        } catch(e) { console.error("Data Load Error", e); }
    }
    
    if(library.length > 0) {
        // Αν υπάρχει ιστορικό, άνοιξε το τελευταίο ή το πρώτο
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(); 
    } else {
        // Αν είναι άδειο, πήγαινε στον Editor
        toEditor();
    }
};

function ensureSongStructure(s) {
    return {
        id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
        title: s.title || "Untitled",
        key: s.key || "",
        notes: s.notes || "",
        intro: s.intro || "",
        interlude: s.interlude || "",
        body: s.body || "",
        playlists: s.playlists || []
    };
}

/* =========================================
   3. MOBILE & UI
   ========================================= */
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('active'); 
}

function toggleTools() {
    var panel = document.getElementById('toolsPanel');
    if(panel.style.display === 'flex') panel.style.display = 'none';
    else panel.style.display = 'flex';
}

/* =========================================
   4. NAVIGATION
   ========================================= */
function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    
    // Απόκρυψη εργαλείων Viewer
    document.getElementById('navControls').style.display = 'none';
    document.getElementById('btnTools').style.display = 'none';
    document.getElementById('toolsPanel').style.display = 'none';
    
    if(currentSongId === null) clearInputs();
    else { 
        var s = library.find(x => x.id === currentSongId); 
        if(s) loadInputsFromSong(s); 
    }
}

function toViewer() {
    try {
        if(library.length === 0) { toEditor(); return; }
        
        // Αν το τρέχον ID δεν υπάρχει πια, πάρε το πρώτο διαθέσιμο
        if(!library.find(x => x.id === currentSongId)) currentSongId = library[0].id;

        var s = library.find(x => x.id === currentSongId);
        if(s) {
            parseAndRender(s); 
            document.getElementById('editor-view').style.display = 'none';
            document.getElementById('viewer-view').style.display = 'flex';
            
            // Εμφάνιση εργαλείων Viewer
            document.getElementById('navControls').style.display = 'flex';
            document.getElementById('btnTools').style.display = 'block';
            
            // Ενημέρωση Τίτλου Header
            document.getElementById('headerTitle').innerText = s.title;
        } else { toEditor(); }
    } catch(e) { console.error("Viewer Error:", e); toEditor(); }
}

// Λειτουργία Ακύρωσης Επεξεργασίας
function cancelEdit() {
    if(library.length > 0) {
        toViewer();
    } else {
        // Αν δεν υπάρχει κανένα τραγούδι, καθάρισε απλά τα πεδία
        clearInputs();
    }
}

function toggleNotes() {
    var box = document.getElementById('displayNotes');
    var btn = document.getElementById('btnToggleNotes');
    if(box.style.display === 'none') {
        box.style.display = 'block';
        btn.classList.add('active');
    } else {
        box.style.display = 'none';
        btn.classList.remove('active');
    }
}

/* =========================================
   5. LIBRARY LOGIC & IMPORT
   ========================================= */
function saveToLocal() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function importJSON(el) { 
    var r = new FileReader(); 
    r.onload = e => { 
        try { 
            var raw = e.target.result;
            var d = JSON.parse(raw); 
            if(Array.isArray(d)) sanitizeAndLoad(d, false);
            else sanitizeAndLoad([d], true);
        } catch(er) { alert("Error reading file."); } 
    }; 
    r.readAsText(el.files[0]); 
}

function sanitizeAndLoad(data, append) {
    var cleanData = data.map(song => ensureSongStructure(song));
    if(append) {
        cleanData.forEach(s => library.push(s));
        currentSongId = cleanData[cleanData.length - 1].id;
    } else {
        library = cleanData;
        if(library.length > 0) currentSongId = library[0].id;
    }
    finalizeImport();
}

function finalizeImport() { 
    saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); closeQR(); 
    setTimeout(() => toViewer(), 100); 
    alert("Επιτυχία!"); 
}

// QR Stuff
function startQR() {
    document.getElementById('qrModal').style.display = "flex";
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
        (decodedText) => {
            try {
                var data = JSON.parse(decodedText);
                if(Array.isArray(data)) sanitizeAndLoad(data, false);
                else sanitizeAndLoad([data], true);
            } catch(e) { console.log("Not JSON"); }
        }
    ).catch(err => console.error(err));
}
function closeQR() { 
    if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => { html5QrcodeScanner.clear(); document.getElementById('qrModal').style.display = "none"; }); 
    else document.getElementById('qrModal').style.display = "none"; 
}

function saveSong() {
    var t = document.getElementById('inpTitle').value;
    if(!t) { alert("Βάλε Τίτλο!"); return; }
    
    // Χωρισμός Tags με κόμμα
    var tags = document.getElementById('inpTags').value.split(',').map(x => x.trim()).filter(x => x.length > 0);
    
    var s = {
        id: currentSongId || Date.now().toString(),
        title: t,
        key: document.getElementById('inpKey').value,
        notes: document.getElementById('inpNotes').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value,
        playlists: tags
    };

    if(currentSongId) { 
        var i = library.findIndex(x => x.id === currentSongId); 
        if(i !== -1) library[i] = s; 
    } else { 
        library.push(s); 
        currentSongId = s.id; 
    }
    
    saveToLocal(); 
    updatePlaylistDropdown(); 
    filterPlaylist(); 
    
    // ΑΥΤΟΜΑΤΗ ΕΠΙΣΤΡΟΦΗ ΣΤΟ VIEWER
    toViewer();
}

function deleteCurrentSong() {
    if(currentSongId && confirm("Διαγραφή;")) {
        library = library.filter(x => x.id !== currentSongId); 
        currentSongId = null;
        saveToLocal(); 
        updatePlaylistDropdown(); 
        filterPlaylist(); 
        clearInputs(); 
        toEditor();
    }
}

// --- FILTER & SEARCH ---
function filterPlaylist() {
    var catValue = document.getElementById('playlistSelect').value;
    currentFilter = catValue;

    // Λήψη κειμένου αναζήτησης και normalisation (αφαίρεση τόνων)
    var rawSearch = document.getElementById('searchInput').value.toLowerCase();
    var searchVal = rawSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    visiblePlaylist = library.filter(s => {
        // Έλεγχος Tag
        var matchTag = (catValue === "ALL") || (s.playlists && s.playlists.includes(catValue));
        
        // Έλεγχος Αναζήτησης (Τίτλος)
        var normalizedTitle = (s.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var matchSearch = (searchVal === "") || normalizedTitle.includes(searchVal);

        return matchTag && matchSearch;
    });

    renderSidebar();
}

function updatePlaylistDropdown() {
    var s = document.getElementById('playlistSelect'), o = s.value, all = new Set();
    library.forEach(x => x.playlists.forEach(t => all.add(t)));
    s.innerHTML = '<option value="ALL">📂 Όλα τα τραγούδια</option>';
    all.forEach(t => { 
        var op = document.createElement('option'); 
        op.value = t; 
        op.innerText = "💿 " + t; 
        s.appendChild(op); 
    });
    s.value = o; 
    if(s.value !== o) s.value = "ALL";
}

function renderSidebar() {
    var c = document.getElementById('playlistContainer'); 
    c.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    
    if(visiblePlaylist.length === 0) { 
        c.innerHTML = '<div class="empty-msg" style="text-align:center; padding:10px; color:#999;">Δεν βρέθηκαν τραγούδια</div>'; 
        return; 
    }

    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); 
        d.className = 'playlist-item';
        if(s.id === currentSongId) d.classList.add('active');
        d.innerText = (i + 1) + ". " + s.title;
        d.onclick = () => { 
            currentSongId = s.id; 
            toViewer(); 
            renderSidebar(); 
            // Κλείσιμο sidebar μόνο αν είναι κινητό
            if(window.innerWidth <= 768) toggleSidebar(); 
        };
        c.appendChild(d);
    });
}

function loadInputsFromSong(s) {
    document.getElementById('inpTitle').value = s.title;
    document.getElementById('inpKey').value = s.key;
    document.getElementById('inpNotes').value = s.notes || "";
    document.getElementById('inpIntro').value = s.intro || "";
    document.getElementById('inpInter').value = s.interlude || "";
    document.getElementById('inpBody').value = s.body;
    document.getElementById('inpTags').value = (s.playlists || []).join(", ");
    document.getElementById('btnDelete').style.display = 'inline-block';
}

function clearInputs() {
    document.getElementById('inpTitle').value = ""; document.getElementById('inpKey').value = "";
    document.getElementById('inpNotes').value = ""; document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = ""; document.getElementById('inpBody').value = "";
    document.getElementById('inpTags').value = ""; currentSongId = null;
    document.getElementById('btnDelete').style.display = 'none';
}

/* =========================================
   6. RENDER ENGINE (Parser)
   ========================================= */
function parseAndRender(s) {
    state.parsedChords = []; state.parsedLyrics = [];
    var safeBody = s.body || ""; 
    state.meta = { title: s.title, key: s.key, notes: s.notes, intro: s.intro, interlude: s.interlude };
    state.t = 0; state.c = 0;

    var blocks = safeBody.split(/\n\s*\n/);
    var isScrolling = false;
    blocks.forEach(b => {
        if(!b.trim()) return;
        if(!isScrolling) {
            // Αν περιέχει ! (ακόρντο) ή | (μέτρο), είναι Pinned
            if(b.includes('!') || b.includes('|')) {
                var p = parseBlock(b);
                state.parsedChords.push(...p); state.parsedChords.push({type:'br'});
            } else { isScrolling = true; state.parsedLyrics.push(b); }
        } else state.parsedLyrics.push(b);
    });
    render(s); 
}

function parseBlock(text) {
    var out = [], lines = text.split('\n');
    for(var i = 0; i < lines.length; i++) {
        var l = lines[i].trimEnd();
        if(!l) continue;
        var parts = l.split('!'), tokens = [];
        // Χειρισμός πρώτου κομματιού (στίχος πριν το πρώτο ακόρντο)
