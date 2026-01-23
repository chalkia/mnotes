/* =========================================
   LOGIC & DATA MANAGEMENT
   ========================================= */

// --- DEMO SONG DATA (READ ONLY) ---
const DEMO_SONG = {
    id: "demo_fixed_001",
    title: "Welcome to mNotes (Demo)",
    key: "C",
    intro: "C!Start G!Here",
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

// --- SAVE SONG (WITH LIMITS) ---
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
        // --- NEW SONG ---
        const userUnlocked = library.filter(s => !s.isLocked && s.id !== DEMO_SONG.id).length;
        const shouldLock = (!USER_STATUS.isPremium) && (userUnlocked >= USER_STATUS.freeLimit);

        var newSong = {
            id: Date.now().toString(),
            title: title,
            key: key,
            body: body,
            intro: intro,
            interlude: interlude,
            notes: notes,
            playlists: playlists,
            isLocked: shouldLock,
            isImmutable: false
        };

        library.push(newSong);
        currentSongId = newSong.id;

        if (isEditingDemo) showToast("Demo saved as copy!");
        else if (shouldLock) alert("Free Limit Reached (5). Saved in Mic Mode.");
        else showToast("Saved!");

    } else {
        // --- UPDATE ---
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

// --- DELETE ---
function deleteCurrentSong() {
    if (currentSongId === DEMO_SONG.id) {
        alert("⛔ The Demo song cannot be deleted.");
        return;
    }
    if(confirm("Delete this song permanently?")) {
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

// --- CLEAR LIBRARY ---
function clearLibrary() {
    if (library.length === 1 && library[0].id === DEMO_SONG.id) {
        showToast("Library is already empty.");
        return;
    }
    if (confirm("WARNING: Delete ALL custom songs?\nOnly Demo will remain.")) {
        library = [JSON.parse(JSON.stringify(DEMO_SONG))];
        currentSongId = DEMO_SONG.id;
        saveData();
        renderSidebar();
        if(typeof toViewer === 'function') toViewer();
        showToast("Reset complete!");
    }
}

// --- FILTER & EXPORT ---
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

// --- IMPORT ---
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

// --- GITHUB SYNC ---
async function syncWithGitHub() {
    // Η δικιά σου διεύθυνση GitHub
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

// --- HELPER: PROCESS SONGS ---
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
