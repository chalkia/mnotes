/* =========================================
   CORE LOGIC & PARSING
   ========================================= */

// Κύρια συνάρτηση που "διαβάζει" το τραγούδι
function parseSongLogic(song) {
    state.meta = song;
    state.parsedChords = [];

    if (!song.body) return;

    var blocks = song.body.split('\n');
    blocks.forEach(line => {
        line = line.trimEnd(); // Καθαρισμός κενών στο τέλος
        if (line.trim() === "") {
            state.parsedChords.push({ type: 'br' });
        } else if (line.indexOf('!') === -1) {
            // Στίχος χωρίς συγχορδίες
            state.parsedChords.push({ type: 'lyricOnly', text: line });
        } else {
            // Γραμμή με συγχορδίες
            var parts = line.split('!');
            var tokens = [];
            
            // Κείμενο πριν την πρώτη συγχορδία
            if (parts[0].length > 0) {
                tokens.push({ c: "", t: parts[0] });
            }

            for (var i = 1; i < parts.length; i++) {
                var p = parts[i];
                var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                if (m) {
                    tokens.push({ c: m[1], t: m[2] || "" });
                } else {
                    tokens.push({ c: "", t: "!" + p }); // Ασφάλεια
                }
            }
            state.parsedChords.push({ type: 'mixed', tokens: tokens });
        }
    });
}

// Υπολογισμός Νέας Νότας (Transpose)
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

// Smart Capo Logic
function calculateSmartCapo() {
    var allChords = [];
    // Μαζεύουμε όλες τις συγχορδίες
    state.parsedChords.forEach(line => {
        if(line.tokens) {
            line.tokens.forEach(tk => { if(tk.c) allChords.push(tk.c); });
        }
    });
    
    if(state.meta.intro) extractChordsFromStr(state.meta.intro, allChords);
    if(state.meta.interlude) extractChordsFromStr(state.meta.interlude, allChords);

    if (allChords.length === 0) return { best: 0, msg: "No chords!" };

    var bestCapo = 0;
    var maxOpenChords = -1;

    for (var capo = 0; capo < 10; capo++) {
        var openCount = 0;
        for (var i = 0; i < allChords.length; i++) {
            var playedChord = getNote(allChords[i], -capo);
            if (isOpenChord(playedChord)) openCount++;
        }
        if (openCount > maxOpenChords) {
            maxOpenChords = openCount;
            bestCapo = capo;
        }
    }
    return { best: bestCapo, msg: "Best Capo: " + bestCapo };
}

function extractChordsFromStr(str, arr) {
    var parts = str.split('!');
    parts.forEach(p => {
        var m = p.match(/^([A-G][#b]?[a-zA-Z0-9]*)/);
        if(m) arr.push(m[1]);
    });
}

function isOpenChord(c) {
    var root = c.split('/')[0];
    return OPEN_CHORDS.includes(root);
}

// Μετατροπή κειμένου (Save Tone)
function transposeSongBody(body, semitones) {
    if (!body) return "";
    var lines = body.split('\n');
    return lines.map(line => {
        if (line.indexOf('!') === -1) return line;
        var parts = line.split('!');
        var newLine = parts[0];
        for (var i = 1; i < parts.length; i++) {
            var m = parts[i].match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
            if (m) newLine += "!" + getNote(m[1], semitones) + m[2];
            else newLine += "!" + parts[i];
        }
        return newLine;
    }).join('\n');
}
