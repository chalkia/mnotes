/* =========================================
   CORE LOGIC & PARSING (js/logic.js)
   ========================================= */

function ensureSongStructure(song) {
    if (!song) song = {};
    if (!song.id) song.id = "s_" + Date.now();
    if (!song.title) song.title = "Untitled";
    if (!song.artist) song.artist = ""; // ΝΕΟ
    if (!song.key) song.key = "-";
    if (!song.body) song.body = "";
    if (!song.intro) song.intro = "";
    if (!song.interlude) song.interlude = "";
    if (!song.notes) song.notes = "";
    if (!song.playlists) song.playlists = [];
    if (song.tags && Array.isArray(song.tags)) song.playlists = song.tags;
    return song;
}

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
            if (parts[0].length > 0) tokens.push({ c: "", t: parts[0] });

            for (var i = 1; i < parts.length; i++) {
                var p = parts[i];
                var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                if (m) {
                    tokens.push({ c: m[1], t: m[2] || "" });
                } else {
                    tokens.push({ c: "", t: "!" + p });
                }
            }
            state.parsedChords.push({ type: 'mixed', tokens: tokens });
        }
    });
}

// SMART SPLIT FUNCTION: Βρίσκει πού τελειώνουν οι συγχορδίες
function splitSongBody(body) {
    var blocks = body.split(/\n\s*\n/); // Χωρισμός σε παραγράφους
    var lastChordIndex = -1;

    // Βρες την τελευταία παράγραφο που έχει '!'
    blocks.forEach((b, i) => {
        if (b.includes('!')) lastChordIndex = i;
    });

    // Αν δεν έχει συγχορδίες, όλα κάτω
    if (lastChordIndex === -1) return { fixed: "", scroll: body };

    // Όλα μέχρι και το lastChordIndex πάνε πάνω
    var fixed = blocks.slice(0, lastChordIndex + 1).join("\n\n");
    var scroll = blocks.slice(lastChordIndex + 1).join("\n\n");
    return { fixed: fixed, scroll: scroll };
}

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

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    var artist = document.getElementById('inpArtist').value; // ΝΕΟ
    var key = document.getElementById('inpKey').value;
    var tagsInput = document.getElementById('inpTags').value;
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var notes = document.getElementById('inpNotes').value;
    var body = document.getElementById('inpBody').value;

    if(!title || !body) { alert("Title and Body required!"); return; }
    var tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

    var newSongObj = {
        title: title, artist: artist, key: key, body: body,
        intro: intro, interlude: interlude, notes: notes, playlists: tagsArray
    };

    if (!currentSongId) {
        // NEW
        var s = ensureSongStructure(newSongObj);
        library.push(s);
        currentSongId = s.id;
    } else {
        // UPDATE -> CHANGE ID RULE
        // Διαγράφουμε το παλιό με το παλιό ID
        var oldIdx = library.findIndex(s => s.id === currentSongId);
        
        // Διατήρηση τυχόν extra πεδίων που δεν πειράξαμε
        var existingExtras = {};
        if (oldIdx > -1) {
            existingExtras = JSON.parse(JSON.stringify(library[oldIdx]));
            library.splice(oldIdx, 1); // Delete old
        }
        
        // Δημιουργία νέου με νέο ID
        var finalSong = ensureSongStructure(newSongObj);
        finalSong.id = "s_" + Date.now(); // FORCE NEW ID
        
        // Merge extras (ώστε να μην χάσουμε άγνωστα πεδία)
        for (var k in existingExtras) {
            if (!finalSong.hasOwnProperty(k)) finalSong[k] = existingExtras[k];
        }

        library.push(finalSong);
        currentSongId = finalSong.id;
    }

    if(typeof saveData === 'function') saveData();
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof loadSong === 'function') loadSong(currentSongId);
    
    // alert("Saved with new ID!"); // Προαιρετικό
}

function deleteCurrentSong() {
    if (!currentSongId) return;
    if (currentSongId.includes("demo")) { alert("Demo cannot be deleted."); return; }
    if(confirm("Delete song?")) {
        var idx = library.findIndex(s => s.id === currentSongId);
        if(idx > -1) {
            library.splice(idx, 1);
            saveData();
            currentSongId = library.length > 0 ? library[0].id : null;
            if(!currentSongId) { /* Handle empty */ }
            if(typeof loadSong === 'function' && currentSongId) loadSong(currentSongId);
            else if (typeof createNewSong === 'function') createNewSong();
            if(typeof renderSidebar === 'function') renderSidebar();
        }
    }
}
