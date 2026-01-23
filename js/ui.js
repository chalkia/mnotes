/* =========================================
   MAIN APPLICATION LOGIC & UI RENDERING
   ========================================= */
var hasUnsavedChanges = false;
var library = []; 
var currentSongId = null;
var visiblePlaylist = [];
var currentFilter = "ALL";

// Global State (αν δεν υπάρχει στο data.js)
var state = {
    t: 0, // Transpose
    c: 0, // Capo
    meta: {},
    parsedChords: []
};

window.onload = function() {
    // Φόρτωση ρυθμίσεων
    var savedTheme = localStorage.getItem('mnotes_theme') || 'theme-dark';
    document.body.className = savedTheme;
    
    // Φόρτωση Δεδομένων
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            var parsed = JSON.parse(savedData);
            // Χρήση της ensureSongStructure αν υπάρχει, αλλιώς raw
            library = Array.isArray(parsed) ? parsed : [];
            visiblePlaylist = [...library]; // Αρχικό γέμισμα
            updatePlaylistDropdown();
            renderSidebar();
        } catch(e) { console.error("Data Load Error", e); }
    }

    setupDirtyListeners();
    setupSidebarEvents(); // Swipe κλπ

    // Έλεγχος URL ή τελευταίου τραγουδιού
    if(library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        toViewer(true); 
    } else { 
        toEditor(); 
    }
};

function setupDirtyListeners() {
    var inputs = document.querySelectorAll('#editor-view input, #editor-view textarea');
    inputs.forEach(el => { el.addEventListener('input', () => { hasUnsavedChanges = true; }); });
}

/* --- NAVIGATION --- */

function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    
    // Toggle active state in sidebar buttons (optional styling)
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    if(currentSongId === null) { 
        clearInputs(); 
        hasUnsavedChanges = false; 
    } else { 
        var s = library.find(x => x.id === currentSongId); 
        if(s) { 
            loadInputsFromSong(s); 
            hasUnsavedChanges = false; 
        } 
    }
}

function toViewer(skipCheck) {
    if(!skipCheck && hasUnsavedChanges) {
        if(confirm("Έχεις μη αποθηκευμένες αλλαγές. Θέλεις να τις αποθηκεύσεις;")) {
            saveSong(); 
            return; 
        } else {
            hasUnsavedChanges = false; 
            // Επαναφορά δεδομένων αν ακύρωσε τις αλλαγές
            if(currentSongId) { 
                var s = library.find(x => x.id === currentSongId); 
                if(s) loadInputsFromSong(s); 
            }
        }
    }

    try {
        if(library.length === 0) { toEditor(); return; }
        
        // Αν το ID δεν υπάρχει πια, πάρε το πρώτο
        if(!library.find(x => x.id === currentSongId)) { 
            currentSongId = library[0].id; 
        }
        
        var s = library.find(x => x.id === currentSongId);
        
        if(s) {
            // Reset Transpose/Capo όταν μπαίνουμε στο τραγούδι
            state.t = 0;
            state.c = 0; 
            
            // ΚΛΗΣΗ ΛΟΓΙΚΗΣ (Από logic.js)
            if(typeof parseSongLogic === 'function') {
                parseSongLogic(s); 
            }
            
            // RENDER (Η συνάρτηση που έλειπε!)
            render(s);         
            
            document.getElementById('editor-view').style.display = 'none';
            document.getElementById('viewer-view').style.display = 'flex';
            
            // Κλείσιμο Sidebar σε κινητά
            if(window.innerWidth < 768) {
                document.getElementById('sidebar').classList.remove('active');
            }
        } else { 
            toEditor(); 
        }
    } catch(e) { 
        console.error("Viewer Error:", e); 
        toEditor(); 
    }
}

/* --- RENDERING (ΤΟ ΚΟΜΜΑΤΙ ΠΟΥ ΕΛΕΙΠΕ) --- */

function render(song) {
    // 1. Header Info
    document.getElementById('displayTitle').innerText = song.title;
    
    // Υπολογισμός οπτικού κλειδιού (Key + Transpose)
    var visualKey = song.key;
    if(state.t !== 0 && typeof getNote === 'function') {
        visualKey = getNote(song.key, state.t);
    }
    document.getElementById('visualKey').innerText = visualKey;

    // Ενημέρωση αριθμών στα κουμπιά
    document.getElementById('t-val').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('c-val').innerText = state.c;

    // 2. Intro / Pinned Info
    var pinnedHTML = "";
    if(song.intro) {
        pinnedHTML += `<div class="intro-block"><strong>INTRO:</strong> ${renderChordsLine(song.intro)}</div>`;
    }
    if(song.interlude) {
        pinnedHTML += `<div class="compact-interlude"><strong>INTER:</strong> ${renderChordsLine(song.interlude)}</div>`;
    }
    if(song.notes) {
        pinnedHTML += `<div style="font-size:0.8em; color:var(--text-light); margin-top:5px;">📝 ${song.notes}</div>`;
    }
    document.getElementById('pinnedContainer').innerHTML = pinnedHTML;

    // 3. Main Body Rendering
    var container = document.getElementById('outputContent');
    container.innerHTML = ""; // Καθαρισμός

    if(state.parsedChords && state.parsedChords.length > 0) {
        state.parsedChords.forEach(line => {
            if(line.type === 'br') {
                container.appendChild(document.createElement('br'));
            } 
            else if (line.type === 'lyricOnly') {
                var div = document.createElement('div');
                div.className = 'line-row';
                div.innerHTML = `<span class="lyric">${line.text}</span>`;
                container.appendChild(div);
            }
            else if (line.type === 'mixed') {
                var rowDiv = document.createElement('div');
                rowDiv.className = 'line-row';
                
                line.tokens.forEach(token => {
                    var tokenDiv = document.createElement('div');
                    tokenDiv.className = 'token';
                    
                    // Υπολογισμός Συγχορδίας (Transpose - Capo)
                    var finalChord = token.c;
                    if(finalChord && typeof getNote === 'function') {
                        // Visual Chord = Key + Transpose - Capo
                        finalChord = getNote(finalChord, state.t - state.c);
                    }

                    var chordSpan = document.createElement('span');
                    chordSpan.className = 'chord';
                    chordSpan.innerText = finalChord || ""; // Αν είναι κενό, κρατάει τον χώρο
                    
                    var lyricSpan = document.createElement('span');
                    lyricSpan.className = 'lyric';
                    lyricSpan.innerText = token.t;

                    tokenDiv.appendChild(chordSpan);
                    tokenDiv.appendChild(lyricSpan);
                    rowDiv.appendChild(tokenDiv);
                });
                container.appendChild(rowDiv);
            }
        });
    }
}

// Βοηθητική για render Intro/Interlude (που είναι string)
function renderChordsLine(str) {
    if(!str) return "";
    // Απλή αντικατάσταση των !Am με spans, λαμβάνοντας υπόψη το transpose
    // Σημείωση: Εδώ κάνουμε μια απλή προσέγγιση.
    var parts = str.split('!');
    var html = "";
    parts.forEach((p, index) => {
        if(index === 0 && p === "") return; // Skip empty start
        
        // Έλεγχος αν είναι συγχορδία
        var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
        if(m) {
            var ch = m[1];
            var rest = m[2];
            if(typeof getNote === 'function') ch = getNote(ch, state.t - state.c);
            html += `<span class="chord" style="display:inline; margin-right:5px;">${ch}</span>${rest}`;
        } else {
            html += p;
        }
    });
    return html;
}

/* --- SIDEBAR & LISTS --- */

function renderSidebar() {
    var listEl = document.getElementById('playlistContainer');
    listEl.innerHTML = "";
    
    // Ανανέωση μετρητή
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";

    visiblePlaylist.forEach(song => {
        var div = document.createElement('div');
        div.className = `playlist-item ${song.id === currentSongId ? 'active' : ''}`;
        div.onclick = function() {
            currentSongId = song.id;
            toViewer(true);
            renderSidebar(); // Για να αλλάξει το active class
        };
        
        div.innerHTML = `
            <div style="flex:1">
                <div style="font-weight:600;">${song.title}</div>
                <div style="font-size:0.8em; opacity:0.7;">${song.key}</div>
            </div>
            ${song.isLocked ? '<i class="fas fa-lock" style="font-size:10px; opacity:0.5;"></i>' : ''}
        `;
        listEl.appendChild(div);
    });
}

function updatePlaylistDropdown() { 
    // Αν έχεις dropdown φίλτρων (δεν υπήρχε στο HTML που έστειλες, αλλά υπήρχε στον παλιό κώδικα)
    // Εδώ απλά το αφήνουμε κενό ή το προσαρμόζεις αν προσθέσεις <select>
}

function filterPlaylist() {
    var txt = document.getElementById('searchBox').value.toLowerCase().trim();
    
    visiblePlaylist = library.filter(s => {
        var matchTxt = (txt === "") || s.title.toLowerCase().includes(txt) || (s.tags && s.tags.join(' ').toLowerCase().includes(txt));
        return matchTxt;
    });
    renderSidebar();
}

function clearLibrary() { 
    if(confirm("Προσοχή! Διαγραφή ΟΛΩΝ των τραγουδιών;")) { 
        library = []; 
        visiblePlaylist = []; 
        currentSongId = null; 
        hasUnsavedChanges = false; 
        saveData(); // Πρέπει να υπάρχει στο logic.js ή storage.js
        renderSidebar(); 
        clearInputs(); 
        toEditor(); 
    } 
}

/* --- EDITOR HELPERS --- */

function clearInputs() {
    document.getElementById('inpTitle').value = "";
    document.getElementById('inpKey').value = "";
    document.getElementById('inpTags').value = "";
    document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = "";
    document.getElementById('inpNotes').value = "";
    document.getElementById('inpBody').value = "";
}

function loadInputsFromSong(s) {
    document.getElementById('inpTitle').value = s.title || "";
    document.getElementById('inpKey').value = s.key || "";
    document.getElementById('inpTags').value = s.playlists ? s.playlists.join(', ') : ""; // Tags -> Playlists στον παλιό κώδικα
    document.getElementById('inpIntro').value = s.intro || "";
    document.getElementById('inpInter').value = s.interlude || "";
    document.getElementById('inpNotes').value = s.notes || "";
    document.getElementById('inpBody').value = s.body || "";
}

/* --- CONTROLS & UTILS --- */

function changeKey(delta) {
    state.t += delta;
    render(library.find(s => s.id === currentSongId));
}

function changeCapo(delta) {
    state.c += delta;
    if(state.c < 0) state.c = 0;
    render(library.find(s => s.id === currentSongId));
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function cycleTheme() {
    var body = document.body;
    if(body.classList.contains('theme-dark')) {
        body.className = 'theme-cream';
    } else if(body.classList.contains('theme-cream')) {
        body.className = 'theme-slate';
    } else {
        body.className = 'theme-dark';
    }
    localStorage.setItem('mnotes_theme', body.className);
}

function toggleKaraoke() {
    document.body.classList.toggle('lyrics-only');
}

function showImportMenu() {
    document.getElementById('importChoiceModal').style.display = 'flex';
}
function closeImportChoice() {
    document.getElementById('importChoiceModal').style.display = 'none';
}
function closeQR() {
    document.getElementById('qrModal').style.display = 'none';
    if(window.html5QrCode) {
        window.html5QrCode.stop().catch(err => console.error(err));
    }
}

// Αποθήκευση LocalStorage (Σε περίπτωση που λείπει από το storage.js)
function saveData() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

// Event Listeners for Sidebar Swipe (Simple version)
function setupSidebarEvents() {
    // Μπορείς να προσθέσεις touch events εδώ αν θες
}

// Η συνάρτηση που καλείται από το logic.js όταν σώζεις
function getSongById(id) {
    return library.find(s => s.id === id);
}

function showToast(msg) {
    // Απλό alert ή custom toast
    // alert(msg); 
    // Προτιμότερο: Ένα μικρό div που εμφανίζεται και εξαφανίζεται
    var toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'var(--accent)';
    toast.style.color = '#000';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '20px';
    toast.style.zIndex = '3000';
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 2000);
}

// Σύνδεση με το Save Tone του παλιού κώδικα
function saveTone() {
    if(typeof saveToneChange === 'function') {
        saveToneChange();
    } else {
        // Fallback logic αν δεν υπάρχει στο logic.js
        if(state.t === 0) return;
        var s = library.find(x => x.id === currentSongId);
        if(confirm("Αποθήκευση νέου τόνου;")) {
            // Logic handled usually in logic.js or here
            alert("Λειτουργία υπό κατασκευή στο logic.js");
        }
    }
}
