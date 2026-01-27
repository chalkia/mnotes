/* =========================================
   CORE LOGIC & PARSING (js/logic.js) - FINAL v6
   ========================================= */

// Helper translation function (safe check)
if (typeof window.t === 'undefined') {
    window.t = function(key) {
        if (typeof TRANSLATIONS !== 'undefined' && typeof currentLang !== 'undefined') {
            return TRANSLATIONS[currentLang][key] || key;
        }
        return key;
    };
}

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

// --- STRICT TOKENIZER PARSING (FIXED SPACING) ---
function parseSongLogic(song) {
    // Βεβαίωση ότι το state υπάρχει
    if (typeof state === 'undefined') window.state = { t: 0, c: 0, meta: {}, parsedChords: [] };
    
    state.meta = song;
    state.parsedChords = [];
    if (!song.body) return;

    var lines = song.body.split('\n');
    
    lines.forEach(line => {
        line = line.trimEnd(); 
        if (line.trim() === "") {
            state.parsedChords.push({ type: 'br' });
            return;
        }
        
        if (line.indexOf('!') === -1) {
            state.parsedChords.push({ type: 'lyricOnly', text: line });
            return;
        }

        var tokens = [];
        var buffer = "";
        var i = 0;
        
        while (i < line.length) {
            var char = line[i];

            if (char === '!') {
                // Αν υπάρχει κείμενο πριν, αποθήκευσέ το
                if (buffer.length > 0) {
                    tokens.push({ c: "", t: buffer });
                    buffer = "";
                }

                i++; // Προσπερνάμε το '!'
                var chordBuf = "";
                var stopChord = false;

                while (i < line.length && !stopChord) {
                    var c = line[i];
                    var isBang = (c === '!');    
                    var isSpace = (c === ' ');  
                    var isGreek = (c >= '\u0370' && c <= '\u03FF') || (c >= '\u1F00' && c <= '\u1FFF');

                    if (isBang) {
                        stopChord = true; // Τερματισμός στο επόμενο !
                    } else if (isSpace || isGreek) {
                        stopChord = true;
                        // FIX: Αν σταματήσαμε λόγω κενού, το "τρώμε" (skip) ώστε να μην μπει στους στίχους
                        if (isSpace) i++; 
                    } else {
                        chordBuf += c;
                        i++;
                    }
                }
                
                tokens.push({ c: chordBuf, t: "" });

            } else {
                buffer += char;
                i++;
            }
        }
        
        if (buffer.length > 0) {
            if (tokens.length > 0 && tokens[tokens.length-1].t === "") {
                tokens[tokens.length-1].t = buffer;
            } else {
                tokens.push({ c: "", t: buffer });
            }
        }
        state.parsedChords.push({ type: 'mixed', tokens: tokens });
    });
}

function splitSongBody(body) {
    if (!body) return { fixed: "", scroll: "" };
    var cleanBody = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var blocks = cleanBody.split(/\n\s*\n/);
    var lastBlockWithChordIndex = -1;
    blocks.forEach((block, index) => { if (block.includes('!')) lastBlockWithChordIndex = index; });
    if (lastBlockWithChordIndex === -1) return { fixed: "", scroll: cleanBody };
    var fixedBlocks = blocks.slice(0, lastBlockWithChordIndex + 1);
    var scrollBlocks = blocks.slice(lastBlockWithChordIndex + 1);
    return { fixed: fixedBlocks.join("\n\n"), scroll: scrollBlocks.join("\n\n") };
}

function getNote(note, semitones) {
    if (!note) return "";
    if (typeof NOTES === 'undefined') return note;

    let isTagged = note.startsWith('!');
    let workingNote = isTagged ? note.substring(1) : note;

    let match = workingNote.match(/^([A-Ga-g][#b]?)(.*)$/);
    if (!match) return workingNote; 

    let root = match[1];
    let suffix = match[2];

    let rootUpper = root.toUpperCase().replace('Α','A').replace('Β','B').replace('Ε','E');
    
    let idx = NOTES.indexOf(rootUpper);
    if (idx === -1 && typeof NOTES_FLAT !== 'undefined') idx = NOTES_FLAT.indexOf(rootUpper);
    
    if (idx === -1) return workingNote;

    let newIdx = (idx + semitones + 12000) % 12;
    let newRoot = NOTES[newIdx];

    if (root === root.toLowerCase()) {
        newRoot = newRoot.toLowerCase();
    }

    return newRoot + suffix;
}

// SMART CAPO (Uses User Settings)
function calculateOptimalCapo(currentKey, songBody) {
    var chordsFound = new Set();
    var chordRegex = /!([A-G][#b]?)/g; 
    var match;
    while ((match = chordRegex.exec(songBody)) !== null) {
        chordsFound.add(match[1]);
    }
    
    if (chordsFound.size === 0) return 0;
    var openChords = ["C", "A", "G", "E", "D", "Am", "Em", "Dm"];
    var bestCapo = 0;
    var maxScore = -1000;

    // Load maxCapo from settings (default 12)
    var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {};
    var maxFret = (userSettings.maxCapo !== undefined) ? parseInt(userSettings.maxCapo) : 12;

    for (var c = 0; c <= maxFret; c++) {
        var score = 0;
        chordsFound.forEach(originalChord => {
            var playedChord = getNote(originalChord, -c).charAt(0).toUpperCase() + getNote(originalChord, -c).slice(1);
            
            if (openChords.includes(playedChord)) {
                score += 1;
            } else if (playedChord.includes("#") || playedChord.includes("b")) {
                score -= 0.5; 
            }
        });
        if (score > maxScore) {
            maxScore = score; bestCapo = c;
        }
    }
    return bestCapo;
}

function convertBracketsToBang(text) {
    if (!text) return "";
    return text.replace(/\[([^\]]+)\]/g, function(match, chord) {
        return "!" + chord + " "; 
    });
}

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    var artist = document.getElementById('inpArtist').value;
    var key = document.getElementById('inpKey').value;
    var tagsInput = document.getElementById('inpTags') ? document.getElementById('inpTags').value : ""; 
    
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var notes = document.getElementById('inpNotes').value;
    
    var rawBody = document.getElementById('inpBody').value;
    var body = convertBracketsToBang(rawBody); 

    if(!title || !body) { alert(t('msg_title_body_req')); return; }
    var tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

    var newSongObj = {
        title: title, artist: artist, key: key, body: body,
        intro: intro, interlude: interlude, notes: notes, playlists: tagsArray
    };

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

// --- SMART EXPORT (Share on Mobile, Download on Desktop) ---
async function exportJSON() {
    if (!library || library.length === 0) {
        alert("Library is empty!");
        return;
    }

    // Save timestamp for Reminder
    localStorage.setItem('mnotes_last_backup', Date.now()); 

    const jsonStr = JSON.stringify(library, null, 2);
    const date = new Date().toISOString().slice(0,10);
    const fileName = "mNotes_backup_" + date + ".mnote";

    // Try Share API (Mobile)
    try {
        const file = new File([jsonStr], fileName, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'mNotes Backup',
                text: 'Backup ' + date
            });
            return;
        }
    } catch (e) {
        console.log("Share API failed, falling back to download", e);
    }

    // Fallback: Download Link (Desktop)
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
