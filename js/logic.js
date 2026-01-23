/* =========================================
   LOGIC & DATA MANAGEMENT (DEMO SONG & LIMITS)
   ========================================= */

// --- DEMO SONG DATA (READ ONLY) ---
const DEMO_SONG = {
    id: "demo_fixed_001", // Fixed ID to recognize it
    title: "Welcome to mNotes (Demo)",
    key: "C",
    intro: "C!Start G!Here",
    interlude: "",
    body: "C G Am F\nWelcome to mNotes!\nC G Am F\nThis is a template song.\n\n[Chorus]\nAm G F C\nIt cannot be deleted.\nAm G F G\nIt is always here for you!",
    notes: "This song is an example. Press Edit to see how chords are written.",
    playlists: ["Demo"],
    isLocked: false,     // Always unlocked
    isImmutable: true    // Flag: Never changes
};

// --- LOAD DATA ---
function loadData() {
    var stored = localStorage.getItem('mnotes_data');
    if (stored) {
        library = JSON.parse(stored);
    } else {
        library = [];
    }
    
    // CHECK: Does Demo exist? If not, inject it!
    ensureDemoSong();
}

function ensureDemoSong() {
    // Check if demo already exists
    const demoExists = library.some(s => s.id === DEMO_SONG.id);
    
    if (!demoExists) {
        // Add it to the top
        library.unshift(JSON.parse(JSON.stringify(DEMO_SONG)));
        saveData();
    }
}

function saveData() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function getSongById(id) {
    return library.find(s => s.id === id);
}

// --- SAVING LOGIC (WITH DEMO PROTECTION) ---
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

    // CHECK: Are we trying to edit the Demo?
    // If yes -> Force create NEW (Save As Copy)
    let isEditingDemo = (currentSongId === DEMO_SONG.id);
    
    if (!currentSongId || isEditingDemo) {
        // --- CREATE NEW (or SAVE COPY) ---
        
        // 1. Count USER'S unlocked songs (Exclude Demo and Locked ones)
        const userUnlocked = library.filter(s => !s.isLocked && s.id !== DEMO_SONG.id).length;
        
        // 2. Check Limit (5 User Songs)
        const shouldLock = (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) 
                           && (userUnlocked >= USER_STATUS.freeLimit);

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
            isImmutable: false // User songs are mutable
        };

        library.push(newSong);
        currentSongId = newSong.id;

        if (isEditingDemo) {
            showToast("Demo cannot be modified. Saved as a copy!");
        } else if (shouldLock) {
            alert("Free Limit Reached (5). Song saved in Mic Mode.");
        } else {
            showToast("Saved!");
        }

    } else {
        // --- UPDATE EXISTING (Only user songs) ---
        var song = getSongById(currentSongId);
        if(song) {
            // Safety Check
            if (song.isImmutable) {
                alert("Error: You cannot modify the Demo song.");
                return;
            }

            song.title = title;
            song.key = key;
            song.body = body;
            song.intro = intro;
            song.interlude = interlude;
            song.notes = notes;
            song.playlists = playlists;
            showToast("Updated!");
        }
    }

    saveData();
    renderSidebar();
    if(typeof toViewer === 'function') toViewer();
    hasUnsavedChanges = false;
}

// --- DELETE LOGIC (PROTECT DEMO) ---
function deleteCurrentSong() {
    // 1. PROTECT DEMO
    if (currentSongId === DEMO_SONG.id) {
        alert("⛔ The Demo song cannot be deleted.\nIt is required for the app template.");
        return;
    }

    if(confirm("Delete this song permanently?")) {
        var index = library.findIndex(s => s.id === currentSongId);
        if(index > -1) {
            library.splice(index, 1);
            saveData();
            
            // After delete, go to Demo (always exists) or previous
            ensureDemoSong(); 
            
            let demo = library.find(s => s.id === DEMO_SONG.id);
            currentSongId = demo ? demo.id : library[0].id;

            renderSidebar();
            if(typeof toViewer === 'function') toViewer();
            showToast("Deleted.");
        }
    }
}

// --- CLEAR LIBRARY (RESET TO DEMO ONLY) ---
function clearLibrary() {
    // If only Demo remains, do nothing
    if (library.length === 1 && library[0].id === DEMO_SONG.id) {
        showToast("Library is already empty.");
        return;
    }

    if (confirm("WARNING: This will delete ALL your custom songs.\nOnly the Demo will remain.\n\nAre you sure?")) {
        // Keep only Demo
        library = [JSON.parse(JSON.stringify(DEMO_SONG))];
        currentSongId = DEMO_SONG.id;
        
        saveData();
        renderSidebar();
        if(typeof toViewer === 'function') toViewer();
        showToast("Factory reset complete!");
    }
}

// --- FILTER & EXPORT UTILS ---
function filterPlaylist() {
    var txt = document.getElementById('searchBox').value.toLowerCase();
    
    // Always start with full library
    visiblePlaylist = library.filter(s => {
        return s.title.toLowerCase().includes(txt) || 
               (s.body && s.body.toLowerCase().includes(txt));
    });
}

function exportJSON() {
    const dataStr = JSON.stringify(visiblePlaylist, null, 2);
    const fileName = `mNotes_Backup_${new Date().toISOString().slice(0,10)}.mnote`;
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

// --- SECURE IMPORT (WITH LIMITS) ---
function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mnote, .json';
    
    input.onchange = e => { 
        var file = e.target.files[0];
        if (!file) return;
        
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var content = e.target.result;
                var data = JSON.parse(content);
                if (!Array.isArray(data)) data = [data]; 

                var importedCount = 0;
                var lockedCount = 0;

                data.forEach(s => {
                    // Ignore Demo if imported (we already have it)
                    if (s.id === DEMO_SONG.id) return;

                    var existingIndex = library.findIndex(ex => ex.id === s.id);
                    
                    // LOCK CALCULATION (Excluding Demo)
                    const userUnlocked = library.filter(x => !x.isLocked && x.id !== DEMO_SONG.id).length;
                    const shouldLock = (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) 
                                      && (userUnlocked >= USER_STATUS.freeLimit);

                    var songToSave = {
                        ...s,
                        id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
                        isLocked: s.isLocked || shouldLock,
                        isImmutable: false // Imported songs are never immutable
                    };

                    if (existingIndex > -1) {
                        // Update (Keep strict lock)
                        songToSave.isLocked = library[existingIndex].isLocked || songToSave.isLocked;
                        library[existingIndex] = songToSave;
                    } else {
                        // New Insert
                        library.push(songToSave);
                        importedCount++;
                        if(songToSave.isLocked) lockedCount++;
                    }
                });

                ensureDemoSong(); 
                
                saveData();
                renderSidebar();
                
                let msg = `Imported ${importedCount} songs.`;
                if (lockedCount > 0) msg += `\n🔒 ${lockedCount} locked due to Free limit.`;
                alert(msg);

            } catch (err) {
                console.error(err);
                alert("File error / Invalid format.");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
