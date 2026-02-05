/* =========================================
   CORE LOGIC & PARSING (js/logic.js) - FINAL v7
   ========================================= */

// Global State
let userProfile = null;   // { id, subscription_tier: 'free'/'basic'... }
let myGroups = [];        // Λίστα με τα groups που ανήκω
let currentGroupId = 'personal'; // 'personal' ή UUID του group
let currentRole = 'owner'; // 'owner' (αν είναι personal) ή 'admin'/'viewer' (αν είναι group)

// Helper translation function (safe check)
if (typeof window.t === 'undefined') {
    window.t = function(key) {
        if (typeof TRANSLATIONS !== 'undefined' && typeof currentLang !== 'undefined') {
            return TRANSLATIONS[currentLang][key] || key;
        }
        return key;
    };
}

/* =========================================
   USER & GROUP MANAGEMENT
   ========================================= */

async function initUserData() {
    if (!currentUser) return;

    // 1. Φόρτωση Προφίλ (Συνδρομή)
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (profile) {
        userProfile = profile;
        console.log("👤 Profile Loaded:", userProfile.subscription_tier);
    } else {
        // Αν δεν υπάρχει προφίλ, φτιάχνουμε ένα Free αυτόματα
        await supabaseClient.from('profiles').insert([{ id: currentUser.id, email: currentUser.email }]);
        userProfile = { id: currentUser.id, subscription_tier: 'free' };
    }

    // 2. Φόρτωση Groups
    await fetchMyGroups();

    // 3. Φόρτωση Τραγουδιών (Initial Load)
    await loadLibrarySongs();
}

async function fetchMyGroups() {
    const { data: memberships, error } = await supabaseClient
        .from('group_members')
        .select('role, group_id, groups(id, name, owner_id)');
        
    if (error) {
        console.error("Error fetching groups:", error);
        return;
    }

    // Καθαρισμός δεδομένων
    myGroups = memberships.map(m => ({
        id: m.groups.id,
        name: m.groups.name,
        role: m.role,
        ownerId: m.groups.owner_id
    }));

    updateGroupDropdown();
}

function updateGroupDropdown() {
    const sel = document.getElementById('selGroup');
    if (!sel) return;

    // Καθαρισμός (κρατάμε μόνο το Personal)
    sel.innerHTML = '<option value="personal">My Personal Library</option>';

    // Προσθήκη Groups
    myGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = `${g.name} (${g.role})`;
        sel.appendChild(opt);
    });
    
    // Set active
    sel.value = currentGroupId;
}

async function switchGroup(groupId) {
    currentGroupId = groupId;
    
    if (groupId === 'personal') {
        currentRole = 'owner';
        showToast("Switched to Personal Library");
    } else {
        // Βρες τον ρόλο μου στο Group
        const group = myGroups.find(g => g.id === groupId);
        if (group) {
            currentRole = group.role;
            showToast(`Switched to Group: ${group.name}`);
        }
    }
    
    // Φόρτωση δεδομένων βάσει επιλογής
    await loadLibrarySongs();

    // Ενημέρωση UI ανάλογα με τον ρόλο
    updateUIForRole();
}

function updateUIForRole() {
    const btnDel = document.getElementById('btnDelSetlist'); 
    const btnAdd = document.getElementById('btnAddSong');

    // Αν είσαι Viewer σε Group -> Κρύψε τα Add/Delete
    if (currentGroupId !== 'personal' && currentRole === 'viewer') {
        if(btnDel) btnDel.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
    } else {
        if(btnDel) btnDel.style.display = 'inline-block';
        if(btnAdd) btnAdd.style.display = 'flex';
    }
}

// --- NEW: CLOUD LOADING LOGIC ---
async function loadLibrarySongs() {
    const listEl = document.getElementById('songList');
    // Δείχνουμε loading indicator
    if(listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Loading...</div>';
    
    let query = supabaseClient
        .from('songs')
        .select('id, title, artist, group_id, user_id, updated_at')
        .order('title', { ascending: true });

    if (currentGroupId === 'personal') {
        // Φέρε ΜΟΝΟ τα δικά μου που ΔΕΝ ανήκουν σε group
        query = query.is('group_id', null).eq('user_id', currentUser.id);
    } else {
        // Φέρε τα τραγούδια του Group
        query = query.eq('group_id', currentGroupId);
    }

    const { data: songs, error } = await query;

    if (error) {
        console.error("Error fetching songs:", error);
        if(listEl) listEl.innerHTML = '<div style="color:var(--danger)">Error loading songs</div>';
        return;
    }

    // Ενημέρωση της τοπικής λίστας (library) για να δουλεύει το Search/Filter
    library = songs.map(s => ensureSongStructure(s));

    // Κλήση της UI function για εμφάνιση
    if (typeof renderSongList === 'function') {
        // Χρησιμοποιούμε renderSidebar ή renderSongList ανάλογα με το τι έχεις στο ui.js
        // Εδώ υποθέτουμε ότι το applyFilters/renderSidebar κάνει τη δουλειά
        if (typeof applyFilters === 'function') applyFilters(); 
        else renderSongList(library);
    }
}

// --- NEW: AUDIO RECORDING SAVING ---
async function addRecordingToCurrentSong(recordingObj) {
    if (!currentSongId) {
        showToast("No active song selected!", "error");
        return;
    }

    // 1. Φέρνουμε τα υπάρχοντα overrides
    const { data: existingData } = await supabaseClient
        .from('personal_overrides')
        .select('personal_recordings')
        .eq('song_id', currentSongId)
        .eq('user_id', currentUser.id)
        .maybeSingle();

    let currentRecs = existingData?.personal_recordings || [];
    
    // Προσθήκη νέου
    currentRecs.push(recordingObj);

    // 2. Upsert στη βάση
    const { error } = await supabaseClient
        .from('personal_overrides')
        .upsert({
            user_id: currentUser.id,
            song_id: currentSongId,
            personal_recordings: currentRecs
        }, { onConflict: 'user_id, song_id' });

    if (error) {
        console.error("DB Save Error:", error);
        throw error;
    }
    
    // Ενημέρωση UI λίστας
    if (typeof renderRecordingsList === 'function') {
        renderRecordingsList(currentRecs);
    }
}

/* =========================================
   HELPER FUNCTIONS & PARSING
   ========================================= */

// MERGED & FIXED ensureSongStructure
function ensureSongStructure(song) {
    if (!song) song = {};
    
    // ID Generation
    if (!song.id) song.id = "s_" + Date.now() + Math.random().toString(16).slice(2); 
    
    if (!song.updatedAt) song.updatedAt = Date.now();
    if (!song.title) song.title = "Untitled";
    if (!song.artist) song.artist = "";
    if (!song.key) song.key = "-";
    if (!song.body) song.body = "";
    if (!song.intro) song.intro = "";
    if (!song.interlude) song.interlude = "";
    if (!song.notes) song.notes = "";
    
    // Tags / Playlists normalization
    if (!song.playlists) song.playlists = [];
    if (song.tags && Array.isArray(song.tags)) song.playlists = song.tags; 
    
    return song;
}

// --- STRICT TOKENIZER PARSING ---
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
                if (buffer.length > 0) {
                    tokens.push({ c: "", t: buffer });
                    buffer = "";
                }

                i++; 
                var chordBuf = "";
                var stopChord = false;

                while (i < line.length && !stopChord) {
                    var c = line[i];
                    var isBang = (c === '!');     
                    var isSpace = (c === ' ');   
                    var isGreek = (c >= '\u0370' && c <= '\u03FF') || (c >= '\u1F00' && c <= '\u1FFF');

                    if (isBang) {
                        stopChord = true; 
                    } else if (isSpace || isGreek) {
                        stopChord = true;
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

// SMART CAPO
function calculateOptimalCapo(currentKey, songBody) {
    var chordsFound = new Set();
    var chordRegex = /!([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)/g;
    var match;
    while ((match = chordRegex.exec(songBody)) !== null) {
        chordsFound.add(match[1]);
    }
    
    if (chordsFound.size === 0) return 0;
    var openChords = ["C", "A", "G", "E", "D", "Am", "Em", "Dm"];
    var bestCapo = 0;
    var maxScore = -1000;

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
    var videoUrl = document.getElementById('inpVideo') ? document.getElementById('inpVideo').value : "";
    var tagsInput = document.getElementById('inpTags') ? document.getElementById('inpTags').value : ""; 
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var notes = document.getElementById('inpNotes') ? document.getElementById('inpNotes').value : "";
    
    var rawBody = document.getElementById('inpBody').value;
    var body = convertBracketsToBang(rawBody); 

    if(!title || !body) { alert(t('msg_title_body_req')); return; }
    var tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

    var newSongObj = {
        title: title, artist: artist, key: key, body: body,
        intro: intro, interlude: interlude, notes: notes, playlists: tagsArray,
        video: videoUrl,
        updatedAt: Date.now()
    };
     
     if (!currentSongId) {
        var s = ensureSongStructure(newSongObj);
        library.push(s); currentSongId = s.id;
    } else {
        var oldIdx = library.findIndex(s => s.id === currentSongId);
        if (oldIdx > -1) {
            library[oldIdx] = { ...library[oldIdx], ...newSongObj, id: currentSongId };
        }
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

// --- SMART EXPORT ---
async function exportJSON() {
    if (!library || library.length === 0) {
        alert("Library is empty!");
        return;
    }

    localStorage.setItem('mnotes_last_backup', Date.now()); 

    const jsonStr = JSON.stringify(library, null, 2);
    const date = new Date().toISOString().slice(0,10);
    const fileName = "mNotes_backup_" + date + ".mnote";

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

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// --- SORTING LOGIC ---
function sortLibrary(method) {
    if (!library) return;

    library.sort((a, b) => {
        if (method === 'created') {
            let timeA = parseInt(a.id.split('_')[1]) || 0;
            let timeB = parseInt(b.id.split('_')[1]) || 0;
            return timeB - timeA; 
            
        } else if (method === 'modified') {
            let timeA = a.updatedAt || parseInt(a.id.split('_')[1]) || 0;
            let timeB = b.updatedAt || parseInt(b.id.split('_')[1]) || 0;
            return timeB - timeA; 
            
        } else {
            return a.title.localeCompare(b.title, 'el', { sensitivity: 'base' });
        }
    });
}

function transposeBodyText(body, semitones) {
    if (semitones === 0 || !body) return body;
    return body.replace(/!([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)/g, function(match, chord) {
        return "!" + getNote(chord, semitones);
    });
}
