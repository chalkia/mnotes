/* =========================================
   LOGIC & DATA MANAGEMENT
   ========================================= */

// --- DEMO SONG DATA ---
const DEMO_SONG = {
    id: "demo_fixed_001",
    title: "Welcome to mNotes (Demo)",
    key: "C",
    intro: "C!G!Am!F!c!g", 
    interlude: "",
    body: "C G Am F\nWelcome to mNotes!\nC G Am F\nThis is a template song.\n\n[Chorus]\nAm G F C\nIt cannot be deleted.\nAm G F G\nIt is always here for you!",
    notes: "This song is an example. Press Edit to see how chords are written.",
    playlists: ["Demo"],
    isLocked: false,     
    isImmutable: true    
};

// --- LOAD & SAVE ---
function loadData() {
    var stored = localStorage.getItem('mnotes_data');
    if (stored) {
        try { library = JSON.parse(stored); } catch(e) { library = []; }
    } else { library = []; }
    
    ensureDemoSong();

    // --- FIX: INITIALIZE VIEW ---
    // 1. Γεμίζουμε τη λίστα που βλέπει ο χρήστης
    visiblePlaylist = library;

    // 2. Αν δεν υπάρχει επιλεγμένο τραγούδι, επιλέγουμε το πρώτο (Demo)
    if (!currentSongId && library.length > 0) {
        currentSongId = library[0].id;
    }
}

function saveData() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function ensureDemoSong() {
    const demoExists = library.some(s => s.id === DEMO_SONG.id);
    if (!demoExists) {
        library.unshift(JSON.parse(JSON.stringify(DEMO_SONG)));
        saveData();
    }
}

function getSongById(id) {
    return library.find(s => s.id === id);
}

// --- MUSIC ENGINE (Notes & Parser) ---
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = {"Db":"C#", "Eb":"D#", "Gb":"F#", "Ab":"G#", "Bb":"A#", "db":"c#", "eb":"d#", "gb":"f#", "ab":"g#", "bb":"a#"};

function getNote(note, shift) {
    if (!note) return "";
    let n = note.trim();
    let isLower = (n[0] === n[0].toLowerCase());
    let root = n.toUpperCase();
    if (FLATS[root]) root = FLATS[root]; 
    let idx = NOTES.indexOf(root);
    if (idx === -1) return note; 
    let newIdx = (idx + shift) % 12;
    if (newIdx < 0) newIdx += 12;
    let out = NOTES[newIdx];
    return isLower ? out.toLowerCase() : out;
}

function parseSong(song) {
    state.t = 0; state.c = 0; state.meta = song; state.parsedChords = [];
    if (!song.body) return;
    let lines = song.body.split('\n');
    lines.forEach(line => {
        if (isChordLine(line)) {
            state.parsedChords.push({ type: 'mixed', tokens: parseChordLine(line) });
        } else {
            state.parsedChords.push({ type: 'lyricOnly', text: line });
        }
    });
}

function isChordLine(line) {
    const clean = line.trim();
    if(clean.length === 0) return false;
    const tokens = line.split(/\s+/);
    const chordPattern = /^[a-gA-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*$/; 
    let chordCount = 0;
    tokens.forEach(t => { if(chordPattern.test(t)) chordCount++; });
    return (chordCount > 0 && chordCount >= tokens.length / 2); 
}

function parseChordLine(line) {
    let tokens = [];
    let parts = line.split(/(\s+)/); 
    parts.forEach(p => {
        if (!p) return;
        const noteRegex = /^([a-gA-G][#b]?)(.*)/;
        let m = p.match(noteRegex);
        if(m && isChordLine(p)) { 
            tokens.push({ c: m[1], t: m[2] });
        } else {
            tokens.push({ c: "", t: p });
        }
    });
    return tokens;
}

// --- SAVE / DELETE / IMPORT UTILS ---

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    var key = document.getElementById('inpKey').value;
    var notes = document.getElementById('inpNotes').value;
    var intro = document.getElementById('inpIntro').value;
    var interlude = document.getElementById('inpInter').value;
    var body = document.getElementById('inpBody').value;
    var tags = document.getElementById('inpTags').value;

    if(!title || !body) { alert("Title and Lyrics are required!"); return; }

    var playlists = tags.split(',').map(t => t.trim()).filter(t => t !== "");
    let isEditingDemo = (currentSongId === DEMO_SONG.id);
    
    if (!currentSongId || isEditingDemo) {
        const userUnlocked = library.filter(s => !s.isLocked && s.id !== DEMO_SONG.id).length;
        const shouldLock = (!USER_STATUS.isPremium) && (userUnlocked >= USER_STATUS.freeLimit);

        var newSong = {
            id: Date.now().toString(),
            title: title, key: key, body: body,
            intro: intro, interlude: interlude, notes: notes, playlists: playlists,
            isLocked: shouldLock, isImmutable: false
        };
        library.push(newSong);
        currentSongId = newSong.id;
        
        if (isEditingDemo) showToast("Demo saved as copy!");
        else if (shouldLock) alert("Free Limit Reached. Saved in Mic Mode.");
        else showToast("Saved!");
    } else {
        var song = getSongById(currentSongId);
        if(song) {
            if (song.isImmutable) { alert("Error: Demo is Read-Only."); return; }
            song.title = title; song.key = key; song.body = body;
            song.intro = intro; song.interlude = interlude;
            song.notes = notes; song.playlists = playlists;
            showToast("Updated!");
        }
    }
    saveData();
    renderSidebar();
    if(typeof toViewer === 'function') toViewer();
}

function deleteCurrentSong() {
    if (currentSongId === DEMO_SONG.id) { alert("⛔ Cannot delete Demo."); return; }
    if(confirm("Delete this song?")) {
        var index = library.findIndex(s => s.id === currentSongId);
        if(index > -1) {
            library.splice(index, 1);
            saveData();
            ensureDemoSong(); 
            let demo = library.find(s => s.id === DEMO_SONG.id);
            currentSongId = demo ? demo.id : library[0].id;
            renderSidebar();
            if(typeof toViewer === 'function') toViewer();
            showToast("Deleted.");
        }
    }
}

function clearLibrary() {
    if (library.length === 1 && library[0].id === DEMO_SONG.id) { showToast("Already empty."); return; }
    if (confirm("Delete ALL custom songs?")) {
        library = [JSON.parse(JSON.stringify(DEMO_SONG))];
        currentSongId = DEMO_SONG.id;
        saveData();
        renderSidebar();
        if(typeof toViewer === 'function') toViewer();
        showToast("Reset complete!");
    }
}

function filterPlaylist() {
    var txt = document.getElementById('searchBox').value.toLowerCase();
    visiblePlaylist = library.filter(s => s.title.toLowerCase().includes(txt));
    renderSidebar();
}

function exportJSON() {
    const dataStr = JSON.stringify(visiblePlaylist, null, 2);
    const fileName = `mNotes_Backup_${new Date().toISOString().slice(0,10)}.mnote`;
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
}

function importJSON() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.mnote, .json';
    input.onchange = e => { 
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var content = e.target.result;
                var data = JSON.parse(content);
                if (!Array.isArray(data)) data = [data]; 
                processImportedSongs(data);
            } catch (err) { alert("File error."); }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function syncWithGitHub() {
    const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/chalkia/mnotes/main/library.json';
    try {
        showToast("Checking GitHub...");
        const response = await fetch(GITHUB_RAW_URL);
        if (!response.ok) { alert("GitHub file not found."); return; }
        const remoteData = await response.json();
        if (!Array.isArray(remoteData)) { alert("Invalid data."); return; }
        let added = processImportedSongs(remoteData, true); 
        if(added > 0) showToast(`Synced ${added} songs!`);
        else showToast("Up to date.");
    } catch (error) { alert("Sync Error."); }
}

function processImportedSongs(dataList, silent = false) {
    var importedCount = 0;
    var lockedCount = 0;
    dataList.forEach(s => {
        if (s.id === DEMO_SONG.id) return;
        var existingIndex = library.findIndex(ex => ex.id === s.id);
        const userUnlocked = library.filter(x => !x.isLocked && x.id !== DEMO_SONG.id).length;
        const shouldLock = (!USER_STATUS.isPremium) && (userUnlocked >= USER_STATUS.freeLimit);
        var songToSave = {
            ...s,
            id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
            isLocked: s.isLocked || shouldLock,
            isImmutable: false 
        };
        if (existingIndex > -1) {
            songToSave.isLocked = library[existingIndex].isLocked || songToSave.isLocked;
            library[existingIndex] = songToSave;
        } else {
            library.push(songToSave);
            importedCount++;
            if(songToSave.isLocked) lockedCount++;
        }
    });
    ensureDemoSong(); 
    saveData();
    renderSidebar(); 
    if (!silent) {
        let msg = `Imported ${importedCount} songs.`;
        if (lockedCount > 0) msg += `\n🔒 ${lockedCount} locked due to Free limit.`;
        alert(msg);
    }
    return importedCount;
}
