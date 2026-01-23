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
            // Γραμμή με συγχορδίες (Mixed)
            var parts = line.split('!');
            var tokens = [];
            
            // 1. Κείμενο πριν την πρώτη συγχορδία (π.χ. "Hello " στο "Hello !Am")
            if (parts[0].length > 0) {
                tokens.push({ c: "", t: parts[0] });
            }

            // Flag για να ξέρουμε αν η προηγούμενη συγχορδία "έκλεισε" με !
            // Π.χ. στο !Am! text -> το parts[1] είναι "Am" (pure).
            var previousWasPureChord = false;

            for (var i = 1; i < parts.length; i++) {
                var p = parts[i];
                
                // Regex: Ψάχνει αν ξεκινάει με συγχορδία (A-G...)
                var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                
                if (m) {
                    // ΒΡΕΘΗΚΕ ΣΥΓΧΟΡΔΙΑ
                    tokens.push({ c: m[1], t: m[2] || "" });
                    
                    // Αν το m[2] είναι κενό, σημαίνει ότι το part ήταν ΜΟΝΟ συγχορδία.
                    // Άρα το ! που προκάλεσε το split ήταν "κλεισίματος".
                    previousWasPureChord = (m[2] === ""); 
                } else {
                    // ΔΕΝ ΕΙΝΑΙ ΣΥΓΧΟΡΔΙΑ (είναι κείμενο ή σκέτο !)
                    if (previousWasPureChord) {
                        // Αν η προηγούμενη ήταν "Pure" (π.χ. !Am!), τότε αυτό το κομμάτι 
                        // είναι απλά η συνέχεια του κειμένου. Δεν βάζουμε ! μπροστά.
                        tokens.push({ c: "", t: p });
                    } else {
                        // Αν η προηγούμενη ΔΕΝ ήταν pure, τότε το ! ήταν του κειμένου (π.χ. "Run!")
                        // ή απλά δεν ήταν συγχορδία, οπότε επαναφέρουμε το !
                        tokens.push({ c: "", t: "!" + p });
                    }
                    previousWasPureChord = false;
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

// --- SAVING LOGIC (WITH FREE/PREMIUM LIMITS) ---
function saveSong() {
    // 1. Διάβασμα τιμών από τα πεδία
    var title = document.getElementById('inpTitle').value;
    var key = document.getElementById('inpKey').value;
    var notes = document.getElementById('inpNotes').value;
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var body = document.getElementById('inpBody').value;
    var tags = document.getElementById('inpTags').value;

    // Έλεγχος υποχρεωτικών πεδίων
    if(!title || !body) { 
        alert("Ο τίτλος και το κυρίως τραγούδι είναι υποχρεωτικά!"); 
        return; 
    }

    // Καθαρισμός Tags (χωρισμένα με κόμμα)
    var playlists = tags.split(',').map(t => t.trim()).filter(t => t !== "");

    if (!currentSongId) {
        // --- ΔΗΜΙΟΥΡΓΙΑ ΝΕΟΥ ΤΡΑΓΟΥΔΙΟΥ (NEW) ---
        
        // Α. Υπολογισμός αν πρέπει να κλειδωθεί (Born Locked)
        // Μετράμε πόσα "καθαρά" (ξεκλείδωτα) τραγούδια υπάρχουν ήδη
        const unlockedCount = library.filter(s => !s.isLocked).length;

        // Αν ο χρήστης είναι FREE και έχει φτάσει το όριο (5), το επόμενο κλειδώνει
        const shouldLock = (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) 
                           && (unlockedCount >= USER_STATUS.freeLimit);

        var newSong = {
            id: Date.now().toString(),
            title: title,
            key: key,
            body: body,
            intro: intro,
            interlude: interlude,
            notes: notes,
            playlists: playlists,
            isLocked: shouldLock // <--- ΕΔΩ ΜΠΑΙΝΕΙ Η "ΣΦΡΑΓΙΔΑ"
        };

        // Β. Αποθήκευση
        library.push(newSong);
        currentSongId = newSong.id;

        // Μήνυμα στον χρήστη
        if(shouldLock) {
            alert("Το τραγούδι αποθηκεύτηκε σε Mic Mode (Όριο Free Πακέτου).");
        } else {
            showToast("Το τραγούδι δημιουργήθηκε!");
        }

    } else {
        // --- ΕΝΗΜΕΡΩΣΗ ΥΠΑΡΧΟΝΤΟΣ (UPDATE) ---
        var song = getSongById(currentSongId);
        if(song) {
            song.title = title;
            song.key = key;
            song.body = body;
            song.intro = intro;
            song.interlude = interlude;
            song.notes = notes;
            song.playlists = playlists;
            
            // ΣΗΜΑΝΤΙΚΟ: Δεν πειράζουμε το isLocked εδώ!
            // Αν ήταν κλειδωμένο, παραμένει. Αν ήταν ανοιχτό, παραμένει.
            
            showToast("Οι αλλαγές αποθηκεύτηκαν!");
        }
    }

    // Γενική Αποθήκευση & Ανανέωση UI
    saveData();      // Αποθήκευση στο localStorage
    renderSidebar(); // Ενημέρωση της λίστας
    hasUnsavedChanges = false;
}
// Μετατροπή κειμένου (Save Tone) - ΔΙΟΡΘΩΜΕΝΟ ΓΙΑ !Asus!
function transposeSongBody(body, semitones) {
    if (!body) return "";
    var lines = body.split('\n');
    return lines.map(line => {
        if (line.indexOf('!') === -1) return line;
        
        var parts = line.split('!');
        var newLine = parts[0];
        
        // Flag για να ξέρουμε αν το προηγούμενο ήταν συγχορδία που "έκλεισε"
        var previousWasPure = false;

        for (var i = 1; i < parts.length; i++) {
            var p = parts[i];
            var m = p.match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
            
            if (m) {
                // Είναι συγχορδία -> Την αλλάζουμε τόνο
                var newChord = getNote(m[1], semitones);
                var suffix = m[2];
                
                // Ξαναφτιάχνουμε το κομμάτι
                newLine += "!" + newChord + suffix;
                
                // Αν δεν έχει suffix (είναι π.χ. "Am" σκέτο), άρα το επόμενο ! είναι κλεισίματος
                previousWasPure = (suffix === "");
            } else {
                // Δεν είναι συγχορδία
                if(previousWasPure) {
                    // Αν η προηγούμενη ήταν !Am!, τότε αυτό το ! είναι το κλείσιμο.
                    // Το προσθέτουμε στο κείμενο (ώστε να διατηρηθεί η δομή !Am!)
                    newLine += "!" + p;
                } else {
                    // Είναι απλό κείμενο με θαυμαστικό (π.χ. Run!)
                    newLine += "!" + p;
                }
                previousWasPure = false;
            }
        }
        return newLine;
    }).join('\n');
}
