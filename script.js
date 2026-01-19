// --- 1. CONFIGURATION & GLOBALS ---
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

// App State
var library = [];            // Η λίστα με όλα τα τραγούδια
var visiblePlaylist = [];    // Η φιλτραρισμένη λίστα (π.χ. μόνο Λαϊκά)
var currentSongId = null;    // Το ID του τραγουδιού που βλέπουμε τώρα
var currentFilter = "ALL";
var state = { 
    t: 0, c: 0,              // Transpose, Capo
    parsedChords: [],        // Το πάνω μέρος (με συγχορδίες)
    parsedLyrics: [],        // Το κάτω μέρος (μόνο στίχοι)
    meta: {}                 // Τίτλος, Κλίμακα, Intro...
};

// Metronome State
var loadedRhythms = [];      // Εδώ θα αποθηκευτούν οι ρυθμοί από το JSON
var currentRhythmPattern = []; // Το μοτίβο που παίζει τώρα

// --- 2. STARTUP ---
window.onload = function() {
    // A. Φόρτωση Τραγουδιών από LocalStorage
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            library = JSON.parse(savedData);
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) {
            console.error("Error parsing saved data", e);
        }
    }

    // B. Αποφασίζουμε ποια οθόνη θα δείξουμε
    if(library.length > 0) {
        toViewer();
    } else {
        toEditor();
    }

    // C. Φόρτωση Ρυθμών από εξωτερικό αρχείο
    loadRhythms();
};

// --- 3. RHYTHM LOADER ---
function loadRhythms() {
    fetch('rhythms.json')
        .then(response => {
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return response.json();
        })
        .then(data => {
            loadedRhythms = data.rhythms;
            populateRhythmSelect();
            // Ορισμός του πρώτου ρυθμού ως προεπιλογή
            if(loadedRhythms.length > 0) {
                currentRhythmPattern = loadedRhythms[0].steps;
            }
        })
        .catch(err => {
            console.error("Failed to load rhythms:", err);
            // Fallback (ασφάλεια αν αποτύχει η φόρτωση)
            loadedRhythms = [{ 
                label: "4/4 (Default)", 
                steps: [{dur:1, strong:true}, {dur:1, strong:false}, {dur:1, strong:true}, {dur:1, strong:false}] 
            }];
            populateRhythmSelect();
            currentRhythmPattern = loadedRhythms[0].steps;
        });
}

function populateRhythmSelect() {
    var select = document.getElementById('rhythmSelect');
    select.innerHTML = ""; // Καθαρισμός
    
    loadedRhythms.forEach((r, index) => {
        var opt = document.createElement('option');
        opt.value = index; // Η τιμή είναι η θέση στον πίνακα (0, 1, 2...)
        opt.innerText = r.label;
        select.appendChild(opt);
    });
}

function updateRhythm() {
    var select = document.getElementById('rhythmSelect');
    var index = parseInt(select.value);
    
    if(loadedRhythms[index]) {
        currentRhythmPattern = loadedRhythms[index].steps;
        currentStep = 0; // Επαναφορά στην αρχή του μέτρου
    }
}

// --- 4. NAVIGATION ---
function toEditor(){
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('transUI').style.display = 'none';
    
    if(currentSongId === null) {
        clearInputs();
    } else {
        var song = library.find(s => s.id === currentSongId);
        if(song) loadInputsFromSong(song);
    }
}

function toViewer(){
    if(library.length === 0) { toEditor(); return; }
    
    // Αν δεν υπάρχει επιλεγμένο, διάλεξε το πρώτο της λίστας
    if(currentSongId === null && visiblePlaylist.length > 0) {
        currentSongId = visiblePlaylist[0].id;
    }

    if(currentSongId !== null) {
        var song = library.find(s => s.id === currentSongId);
        if(song) parseAndRender(song);
    }

    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'flex'; // Flex για το split layout
    document.getElementById('transUI').style.display = 'flex';
}

// --- 5. LIBRARY MANAGEMENT ---
function saveToLocal() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    if(!title) { alert("Δώσε έναν τίτλο!"); return; }

    var tagsStr = document.getElementById('inpTags').value;
    var tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    var songData = {
        id: currentSongId || Date.now().toString(),
        title: title,
        key: document.getElementById('inpKey').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value,
        playlists: tags
    };

    if(currentSongId) {
        var idx = library.findIndex(s => s.id === currentSongId);
        if(idx !== -1) library[idx] = songData;
    } else {
        library.push(songData);
        currentSongId = songData.id;
    }

    saveToLocal();
    updatePlaylistDropdown();
    filterPlaylist();
    alert("Αποθηκεύτηκε!");
}

function deleteCurrentSong() {
    if(!currentSongId) return;
    if(confirm("Διαγραφή τραγουδιού;")) {
        library = library.filter(s => s.id !== currentSongId);
        currentSongId = null;
        saveToLocal();
        updatePlaylistDropdown();
        filterPlaylist();
        clearInputs();
        toEditor();
    }
}

function filterPlaylist() {
    var select = document.getElementById('playlistSelect');
    currentFilter = select.value;
    
    if(currentFilter === "ALL") {
        visiblePlaylist = library;
    } else {
        visiblePlaylist = library.filter(s => s.playlists.includes(currentFilter));
    }
    renderSidebar();
}

function updatePlaylistDropdown() {
    var allTags = new Set();
    library.forEach(s => {
        if(s.playlists) s.playlists.forEach(t => allTags.add(t));
    });

    var select = document.getElementById('playlistSelect');
    var oldVal = select.value;
    
    select.innerHTML = '<option value="ALL">📂 Όλα τα τραγούδια</option>';
    
    allTags.forEach(tag => {
        var opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = "💿 " + tag;
        select.appendChild(opt);
    });

    select.value = oldVal;
    if(select.value !== oldVal) select.value = "ALL";
}

function renderSidebar() {
    var container = document.getElementById('playlistContainer');
    container.innerHTML = "";
    document
