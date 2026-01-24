/* =========================================
   CORE LOGIC & PARSING (js/logic.js)
   ========================================= */

function ensureSongStructure(song) {
    if (!song) song = {};
    if (!song.id) song.id = "s_" + Date.now();
    if (!song.title) song.title = "Untitled";
    if (!song.artist) song.artist = "";
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

// --- NEW ROBUST SPLIT FUNCTION (LINE BASED) ---
function splitSongBody(body) {
    if (!body) return { fixed: "", scroll: "" };

    var lines = body.split('\n');
    var lastChordLineIndex = -1;
    // Regex που πιάνει συγχορδίες τύπου !Am, !G, !D7
    var chordRegex = /![A-G][b#]?[a-zA-Z0-9\/]*/;

    // 1. Βρες την ΤΕΛΕΥΤΑΙΑ γραμμή που έχει συγχορδία
    for (var i = 0; i < lines.length; i++) {
        if (chordRegex.test(lines[i])) {
            lastChordLineIndex = i;
        }
    }

    // 2. Αν δεν υπάρχει καμία συγχορδία, όλα στο Scroll
    if (lastChordLineIndex === -1) {
        return { fixed: "", scroll: body };
    }

    // 3. Βρες πού τελειώνει η στροφή στην οποία ανήκει η τελευταία συγχορδία.
    // Ψάχνουμε την επόμενη κενή γραμμή μετά το lastChordLineIndex
    var splitPoint = lastChordLineIndex;
    for (var j = lastChordLineIndex; j < lines.length; j++) {
        if (lines[j].trim() === "") {
            splitPoint = j;
            break; // Βρήκαμε το τέλος της στροφής
        }
        splitPoint = j; // Αν φτάσουμε στο τέλος του αρχείου
    }

    // 4. Κόψιμο
    // Σταθερό: Από αρχή μέχρι το splitPoint
    var fixedLines = lines.slice(0, splitPoint + 1);
    // Κυλιόμενο: Από το splitPoint και μετά
    var scrollLines = lines.slice(splitPoint + 1);

    return { 
        fixed: fixedLines.join('\n'), 
        scroll: scrollLines.join('\n') 
    };
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
    var artist = document.getElementById('inpArtist').value;
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
        var s = ensureSongStructure(newSongObj);
        library.push(s);
        currentSongId = s.id;
    } else {
        var oldIdx = library.findIndex(s => s.id === currentSongId);
        var existingExtras = {};
        if (oldIdx > -1) {
            existingExtras = JSON.parse(JSON.stringify(library[oldIdx]));
            library.splice(oldIdx, 1);
        }
        var finalSong = ensureSongStructure(newSongObj);
        finalSong.id = "s_" + Date.now(); 
        for (var k in existingExtras) {
            if (!finalSong.hasOwnProperty(k)) finalSong[k] = existingExtras[k];
        }
        library.push(finalSong);
        currentSongId = finalSong.id;
    }

    if(typeof saveData === 'function') saveData();
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof loadSong === 'function') loadSong(currentSongId);
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
            if(typeof loadSong === 'function' && currentSongId) loadSong(currentSongId);
            else if (typeof createNewSong === 'function') createNewSong();
            if(typeof renderSidebar === 'function') renderSidebar();
        }
    }
}
