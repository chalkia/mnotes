/* =========================================
   CORE LOGIC & PARSING (js/logic.js)
   ========================================= */

// --- SMART CAPO CONSTANTS ---
const OPEN_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "Cmaj7", "A7", "E7", "D7", "B7", "Fmaj7"];
const HARD_CHORDS = ["C#", "D#", "F#", "G#", "A#", "Db", "Eb", "Gb", "Ab", "Bb", "B", "F"];

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

// --- PARSING ---
function parseSongLogic(song) {
    state.meta = song;
    state.parsedChords = [];
    if (!song.body) return;

    var lines = song.body.split('\n');
    lines.forEach(line => {
        line = line.trimEnd(); 
        if (line.trim() === "") { state.parsedChords.push({ type: 'br' }); return; }
        if (line.indexOf('!') === -1) { state.parsedChords.push({ type: 'lyricOnly', text: line }); return; }

        var tokens = []; var buffer = ""; var i = 0;
        while (i < line.length) {
            var char = line[i];
            if (char === '!') {
                if (buffer.length > 0) { tokens.push({ c: "", t: buffer }); buffer = ""; }
                i++; var chordBuf = ""; var stopChord = false;
                while (i < line.length && !stopChord) {
                    var c = line[i];
                    var isBang = (c === '!'); var isSpace = (c === ' ');
                    var isGreek = (c >= '\u0370' && c <= '\u03FF') || (c >= '\u1F00' && c <= '\u1FFF');
                    if (isBang) { i++; stopChord = true; } 
                    else if (isSpace || isGreek) { stopChord = true; } 
                    else { chordBuf += c; i++; }
                }
                tokens.push({ c: chordBuf, t: "" });
            } else { buffer += char; i++; }
        }
        if (buffer.length > 0) {
            if (tokens.length > 0 && tokens[tokens.length-1].t === "") tokens[tokens.length-1].t = buffer;
            else tokens.push({ c: "", t: buffer });
        }
        state.parsedChords.push({ type: 'mixed', tokens: tokens });
    });
}

function getNote(note, semitones) {
    if (!note) return "";
    var firstChar = note.charAt(0);
    var isLowerCase = (firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase());
    var noteProper = firstChar.toUpperCase() + note.slice(1);
    var match = noteProper.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return note; 
    var root = match[1]; var suffix = match[2];
    var idx = NOTES.indexOf(root);
    if (idx === -1) idx = NOTES_FLAT.indexOf(root);
    if (idx === -1) return note;
    var newIdx = (idx + semitones + 12000) % 12;
    var newRoot = NOTES[newIdx];
    if (isLowerCase) newRoot = newRoot.toLowerCase();
    return newRoot + suffix;
}

// --- SMART CAPO ---
function calculateOptimalCapo(songBody) {
    let chordsFound = new Set();
    // Προστασία αν το songBody είναι undefined
    if (!songBody) return 0;
    
    let tokens = songBody.split(/\s+/);
    const chordPattern = /^[a-gA-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*$/;
    
    tokens.forEach(tk => {
        let clean = tk.replace('!', '').replace(/[.,;:]/g, '');
        if(chordPattern.test(clean)) chordsFound.add(clean);
    });

    if (chordsFound.size === 0) return 0;
    let bestCapo = 0; let maxScore = -1000;

    for (let c = 0; c < 12; c++) {
        let score = 0;
        chordsFound.forEach(originalChord => {
            let playedChord = getNote(originalChord, -c);
            let root = playedChord.split('/')[0];
            if (OPEN_CHORDS.includes(root)) score += 2;
            else if (HARD_CHORDS.includes(root)) score -= 2;
            else if (root.includes("#") || root.includes("b")) score -= 1;
        });
        if (score > maxScore) { maxScore = score; bestCapo = c; }
    }
    return bestCapo;
}

// --- DATA MANAGEMENT ---
function saveSong() {
    var title = document.getElementById('inpTitle').value;
    var artist = document.getElementById('inpArtist').value;
    var key = document.getElementById('inpKey').value;
    var tagsInput = document.getElementById('inpTags') ? document.getElementById('inpTags').value : ""; 
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var notes = document.getElementById('inpNotes').value;
    var body = document.getElementById('inpBody').value;

    if(!title || !body) { alert(t('msg_title_body_req')); return; }
    var tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

    var newSongObj = { title, artist, key, body, intro, interlude, notes, playlists: tagsArray };

    if (!currentSongId) {
        var s = ensureSongStructure(newSongObj);
        library.push(s); currentSongId = s.id;
    } else {
        var oldIdx = library.findIndex(s => s.id === currentSongId);
        var existingExtras = {};
        if (oldIdx > -1) {
            existingExtras = JSON.parse(JSON.stringify(library[oldIdx]));
            library.splice(oldIdx, 1);
        }
        var finalSong = ensureSongStructure(newSongObj);
        finalSong.id = "s_" + Date.now(); 
        for (var k in existingExtras) { if (!finalSong.hasOwnProperty(k)) finalSong[k] = existingExtras[k]; }
        if(finalSong.capo) delete finalSong.capo;
        library.push(finalSong); currentSongId = finalSong.id;
    }

    if(typeof saveData === 'function') saveData();
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof loadSong === 'function') loadSong(currentSongId);
}

function deleteCurrentSong() {
    if (!currentSongId) return;
    if (currentSongId.includes("demo")) { alert(t('msg_demo_delete')); return; }
    if(confirm(t('msg_delete_confirm'))) {
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

// --- ΝΕΟ: QR Helper (που έλειπε) ---
function processQRScan(decodedText) {
    try {
        let song = JSON.parse(decodedText);
        // Υποστήριξη compressed format (t, b, k)
        if (song.t && song.b) {
            return {
                title: song.t, key: song.k || "", body: song.b,
                intro: song.i || "", interlude: song.n || ""
            };
        }
        return song;
    } catch(e) { return null; }
}
