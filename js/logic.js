/* =========================================
   CORE LOGIC & PARSING (js/logic.js)
   ========================================= */

// 1. Η ΣΥΝΑΡΤΗΣΗ ΠΟΥ ΕΛΕΙΠΕ (Πρέπει να είναι πρώτη)
function ensureSongStructure(song) {
    if (!song) song = {};
    if (!song.id) song.id = "s_" + Date.now() + Math.floor(Math.random() * 1000);
    if (!song.title) song.title = "Untitled";
    if (!song.key) song.key = "-";
    if (!song.body) song.body = "";
    if (!song.intro) song.intro = "";
    if (!song.interlude) song.interlude = "";
    if (!song.notes) song.notes = "";
    if (!song.playlists) song.playlists = [];
    
    // Compatibility check
    if (song.tags && Array.isArray(song.tags)) {
        song.playlists = song.tags;
    }
    
    return song;
}

// 2. PARSING LOGIC (Για τον Player)
function parseSongLogic(song) {
    state.meta = song;
    state.parsedChords = [];

    if (!song.body) return;

    var blocks = song.body.split('\n');
    blocks.forEach(line => {
        line = line.trimEnd(); 
        if (line.trim() === "") {
            state.parsedChords.push({ type: 'br' });
        } else if (line.indexOf('!') === -1) {
            state.parsedChords.push({ type: 'lyricOnly', text: line });
        } else {
            var parts = line.split('!');
            var tokens = [];
            
            // Κείμενο πριν την πρώτη συγχορδία
            if (parts[0].length > 0) tokens.push({ c: "", t: parts[0] });

            for (var i = 1; i < parts.length; i++) {
                var p = parts[i];
                // Regex για αναγνώριση συγχορδίας
                var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                
                if (m) {
                    tokens.push({ c: m[1], t: m[2] || "" });
                } else {
                    // Αν δεν είναι συγχορδία, είναι θαυμαστικό κειμένου
                    tokens.push({ c: "", t: "!" + p });
                }
            }
            state.parsedChords.push({ type: 'mixed', tokens: tokens });
        }
    });
}

// 3. TRANSPOSE MATH
function getNote(note, semitones) {
    if (!note) return "";
    var match = note.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return note;

    var root = match[1];
    var suffix = match[2];

    var idx = NOTES.indexOf(root);
    if (idx === -1) idx = NOTES_FLAT.indexOf(root);
    if (idx === -1) return note;

    var newIdx = (idx + semitones + 12000) % 12;
    return NOTES[newIdx] + suffix;
}

// 4. SAVE LOGIC (Διαβάζει από το DOM)
function saveSong() {
    var title = document.getElementById('inpTitle').value;
    var key = document.getElementById('inpKey').value;
    var tagsInput = document.getElementById('inpTags').value;
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var notes = document.getElementById('inpNotes').value;
    var body = document.getElementById('inpBody').value;

    if(!title || !body) { 
        alert("Title and Body are required!"); 
        return; 
    }

    var tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

    if (!currentSongId) {
        // Create New
        var newSong = ensureSongStructure({
            title: title, key: key, body: body,
            intro: intro, interlude: interlude, 
            notes: notes, playlists: tagsArray
        });
        library.push(newSong);
        currentSongId = newSong.id;
    } else {
        // Update Existing
        var song = library.find(s => s.id === currentSongId);
        if(song) {
            song.title = title; song.key = key; song.body = body;
            song.intro = intro; song.interlude = interlude;
            song.notes = notes; song.playlists = tagsArray;
        }
    }

    // Καλεί τη saveData του ui.js (ή global)
    if(typeof saveData === 'function') saveData();
    
    // Ανανέωση UI
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof loadSong === 'function') loadSong(currentSongId);
    
    alert("Saved!");
}
