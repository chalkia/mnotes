/* =========================================
   CORE LOGIC & PARSING (js/logic.js) - v2.1
   ========================================= */

// --- Global State ---
let userProfile = null;      
let myGroups = [];           
let currentGroupId = 'personal'; 
let currentRole = 'owner';   
let isOffline = !navigator.onLine;
let lastImportedIds = new Set(); // Κρατάει τα IDs μόνο της τελευταίας εισαγωγής για τη συνεδρία
let showingOriginal = false; // False = My View (Default), True = Band View
let originalSongSnapshot = null; // Για σύγκριση αλλαγών κατά το Save

// --- TIER CONFIGURATION ---
const TIER_CONFIG = {
    free: { label: "Free Mode", canCloudSync: false, canPrint: true, maxBands: 0 },
    solo: { label: "Solo Pro", canCloudSync: true, canPrint: true, maxBands: 0 },
    maestro: { label: "Maestro", canCloudSync: true, canPrint: true, maxBands: 5 },
    band_admin: { label: "Band Leader", canCloudSync: true, canPrint: true, maxBands: 1 }
};

// Helper translation function
if (typeof window.t === 'undefined') {
    window.t = function(key) {
        if (typeof TRANSLATIONS !== 'undefined' && typeof currentLang !== 'undefined') {
            return TRANSLATIONS[currentLang][key] || key;
        }
        return key;
    };
}

/* =========================================
   USER & CONTEXT MANAGEMENT
   ========================================= */
async function initUserData() {
    if (!currentUser) return;

    try {
        // 1. Προφίλ & Tier (Όπως το είχες)
        const { data: profile, error: pError } = await supabaseClient
            .from('profiles').select('*').eq('id', currentUser.id).single();

        if (pError && pError.code !== 'PGRST116') throw pError;

        if (profile) {
            userProfile = profile;
        } else {
            const newProfile = { id: currentUser.id, email: currentUser.email, subscription_tier: 'free' };
            await supabaseClient.from('profiles').insert([newProfile]);
            userProfile = newProfile;
        }

        // 2. Groups (Bands) - ΔΙΟΡΘΩΜΕΝΟ JOIN ΓΙΑ ΑΠΟΦΥΓΗ 500 ERROR
        const { data: groups, error: gError } = await supabaseClient
            .from('group_members')
            .select(`
                group_id, 
                role, 
                groups!group_members_group_id_fkey (
                    name, 
                    owner_id
                )
            `)
            .eq('user_id', currentUser.id);

        if (gError) {
            console.warn("⚠️ Join failed, trying simple fetch...");
            // Αν το Join βγάλει 500, φέρνουμε μόνο τα IDs για να δουλέψει η εφαρμογή
            const { data: simpleGroups } = await supabaseClient
                .from('group_members')
                .select('group_id, role')
                .eq('user_id', currentUser.id);
            
            myGroups = simpleGroups || [];
        } else {
            myGroups = groups || [];
            console.log(`🎸 Συνδέθηκαν ${myGroups.length} μπάντες.`);
        }

        updateGroupDropdown();

        // 3. Αρχικοποίηση Context
        await switchContext('personal');

        if (typeof refreshUIByTier === 'function') refreshUIByTier();

        if (typeof showToast === 'function') {
            const tierName = TIER_CONFIG[userProfile.subscription_tier]?.label || "Free";
            showToast(`Σύνδεση ως ${tierName}`);
        }

    } catch (err) {
        console.error("❌ Critical Init Error:", err);
        showToast("Database connection issue. Working locally.", "error");
    }
}


/**
 * Εναλλαγή περιβάλλοντος εργασίας (Personal vs Band)
 */
async function switchContext(targetId) {
    currentGroupId = targetId;
    
    if (targetId === 'personal') {
        currentRole = 'owner';
        document.body.classList.remove('band-mode');
        document.body.classList.add('personal-mode');
    } else {
        const memberInfo = myGroups.find(g => g.group_id === targetId);
        currentRole = memberInfo ? memberInfo.role : 'member';
        document.body.classList.remove('personal-mode');
        document.body.classList.add('band-mode');
    }

    await loadContextData();
    updateUIForRole();
   if (typeof renderBandManager === 'function') {
        renderBandManager();
    }
}

function updateUIForRole() {
    const btnDel = document.getElementById('btnDelSetlist'); 
    const btnAdd = document.getElementById('btnAddSong');

    if (currentGroupId !== 'personal' && currentRole === 'viewer') {
        if(btnDel) btnDel.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
    } else {
        if(btnDel) btnDel.style.display = 'inline-block';
        if(btnAdd) btnAdd.style.display = 'flex';
    }
}

/* =========================================
   DATA LOADING & SYNC
   ========================================= */
async function loadContextData() {
    library = [];
    const listEl = document.getElementById('songList');
    if(listEl) listEl.innerHTML = '<div class="loading-msg">Loading...</div>';

    try {
        if (currentGroupId === 'personal') {
            // --- PERSONAL CONTEXT ---
            if (canUserPerform('CLOUD_SAVE')) {
                library = await fetchPrivateSongs();
            } else {
                const localData = localStorage.getItem('mnotes_data');
                if (localData) {
                    const parsed = JSON.parse(localData);
                    library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
                }
            }
            
            // Εξασφαλίζουμε ότι υπάρχει πάντα ο πίνακας recordings στα προσωπικά τραγούδια
            library.forEach(song => {
                if (!song.recordings) song.recordings = [];
            });
            
        } else {
            // --- BAND CONTEXT ---
            // 1. Φέρνουμε τα τραγούδια της μπάντας
            const songs = await fetchBandSongs(currentGroupId);
            
            // 2. Φέρνουμε τα προσωπικά Overrides του χρήστη για αυτή την μπάντα
            const { data: overrides } = await supabaseClient
                .from('personal_overrides')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('group_id', currentGroupId);

            // 3. Merge: Ενσωματώνουμε τα overrides στο αντικείμενο του τραγουδιού
            library = songs.map(song => {
                const cleanSong = ensureSongStructure(song);
                const userOverride = overrides?.find(o => o.song_id === song.id);
                
                if (userOverride) {
                    // Προσθέτουμε τα overrides ως ιδιότητες
                    cleanSong.personal_key = userOverride.personal_key; 
                    cleanSong.personal_notes = userOverride.personal_notes;
                    cleanSong.personal_transpose = userOverride.local_transpose || 0;
                    
                    // --- ΔΙΟΡΘΩΣΗ 1: Φέρνουμε τις εγγραφές/uploads από τα overrides ---
                    cleanSong.recordings = userOverride.recordings || [];
                    
                    cleanSong.has_override = true; // Flag για το UI
                } else {
                    // Αν δεν έχει override, βάζουμε κενό πίνακα για να μην κρασάρει το push()
                    if (!cleanSong.recordings) cleanSong.recordings = [];
                }
                return cleanSong;
            });
        }

        // Refresh UI
        if (typeof renderSidebar === 'function') renderSidebar();
        
        // Auto-load first song
        if (library.length > 0) {
            currentSongId = library[0].id;
            if (typeof toViewer === 'function') toViewer(true);
        } else {
            if (typeof toEditor === 'function') toEditor();
        }
    } catch (err) {
        console.error("❌ Load Context Error:", err);
        showToast("Error loading library", "error");
    }
}

function canUserPerform(action) {
    const tier = (userProfile && userProfile.subscription_tier) ? userProfile.subscription_tier : 'free';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
    switch(action) {
        case 'CLOUD_SAVE': return config.canCloudSync;
        case 'PRINT': return config.canPrint;
        default: return false;
    }
}

// --- AUDIO RECORDING SAVING ---
async function addRecordingToCurrentSong(recordingObj) {
    if (!currentSongId || !currentUser) return;

    const { data: existingData } = await supabaseClient
        .from('personal_overrides')
        .select('recordings')
        .eq('song_id', currentSongId)
        .eq('user_id', currentUser.id)
        .maybeSingle();

    let currentRecs = existingData?.recordings || [];
    currentRecs.push(recordingObj);

    await supabaseClient.from('personal_overrides').upsert({
        user_id: currentUser.id,
        song_id: currentSongId,
        recordings: currentRecs
    }, { onConflict: 'user_id, song_id' });

    if (typeof renderRecordingsList === 'function') renderRecordingsList(currentRecs);
}
/**
 * Ανάκτηση προσωπικών τραγουδιών από το Cloud (Solo/Maestro/Admin)
 */
async function fetchPrivateSongs() {
    const { data, error } = await supabaseClient
        .from('songs')
        .select('*')
        .is('group_id', null) // Μόνο προσωπικά
        .eq('user_id', currentUser.id)
        .order('title', { ascending: true });

    if (error) {
        console.error("❌ Error fetching private songs:", error);
        return [];
    }
    return data.map(s => ensureSongStructure(s));
}

/**
 * Ανάκτηση κοινών τραγουδιών μιας μπάντας
 * @param {string} groupId - Το UUID της μπάντας
 */
async function fetchBandSongs(groupId) {
    const { data, error } = await supabaseClient
        .from('songs')
        .select('*')
        .eq('group_id', groupId)
        .order('title', { ascending: true });

    if (error) {
        console.error("❌ Error fetching band songs:", error);
        return [];
    }
    return data.map(s => ensureSongStructure(s));
}
/**
 * Κεντρική συνάρτηση αποθήκευσης τραγουδιού
 * Διαχειρίζεται αυτόματα Local Storage, Personal Cloud και Band Cloud.
 */
async function saveSong() {
    // 1. Συλλογή δεδομένων από τον Editor
    const title = document.getElementById('inpTitle').value;
    const body = convertBracketsToBang(document.getElementById('inpBody').value);
    
    if (!title || !body) { showToast(t('msg_title_body_req'), "error"); return; }

    const songData = {
        title: title,
        artist: document.getElementById('inpArtist').value,
        key: document.getElementById('inpKey').value,
        body: body,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        notes: document.getElementById('inpConductorNotes')?.value || "", // Public Notes
        video: document.getElementById('inpVideo')?.value || "",
        tags: document.getElementById('inpTags')?.value.split(',').map(t => t.trim()).filter(t => t !== "") || [],
        updated_at: new Date().toISOString()
    };

    const personalNotesVal = document.getElementById('inpPersonalNotes')?.value || "";

    try {
        // --- ΣΕΝΑΡΙΟ Α: ΠΡΟΣΩΠΙΚΗ ΒΙΒΛΙΟΘΗΚΗ ---
        if (currentGroupId === 'personal') {
            if (canUserPerform('CLOUD_SAVE')) {
                // Σώζουμε και τα personal notes στο metadata αν είναι προσωπικό
                // (Σε προσωπικό τραγούδι, το πεδίο notes παίζει τον ρόλο του personal)
                songData.notes = personalNotesVal || songData.notes; 
                await saveToCloud(songData, null);
            } else {
                saveToLocalStorage(songData);
            }
            showToast("Saved to My Songs! 💾");
            await loadContextData(); // Reload για να φανεί
            if (typeof toViewer === 'function') toViewer(true);
        
        } else {
            // --- ΣΕΝΑΡΙΟ Β: ΜΠΑΝΤΑ (Band Context) ---
            
            // B1. Είμαι ADMIN/OWNER -> Push to Everyone
            if (currentRole === 'admin' || currentRole === 'owner') {
                console.log("Saving to Band Cloud (Admin)...");
                await saveToCloud(songData, currentGroupId);
                showToast("Band Library Updated! 🎸");
                await loadContextData();
                if (typeof toViewer === 'function') toViewer(true);
            } 
            // B2. Είμαι MEMBER -> Έλεγχος Αλλαγών
            else {
                // Βρίσκουμε το αρχικό τραγούδι για σύγκριση
                const original = library.find(s => s.id === currentSongId);
                
                // Έλεγχος ΔΟΜΙΚΩΝ αλλαγών
                const bodyChanged = original && (original.body !== songData.body);
                const chordsChanged = original && (original.key !== songData.key); // Αν άλλαξε το Base Key

                if (bodyChanged || chordsChanged) {
                    // ΕΡΩΤΗΣΗ: Clone ή Proposal;
                    showActionModal(songData); 
                    return; // Σταματάμε εδώ
                }

                // Αν άλλαξε ΜΟΝΟ Metadata (Notes, Transpose) -> Save Override
                console.log("Saving Personal Override...");
                await saveAsOverride({
                    ...songData,
                    personal_notes: personalNotesVal
                });
                showToast("Personal settings saved! (Local Override) 👤");
                await loadContextData();
                if (typeof toViewer === 'function') toViewer(true);
            }
        }

    } catch (err) {
        console.error("❌ Save failed:", err);
        showToast("Error during save", "error");
    }
}

/**
 * Υποστηρικτική: Αποθήκευση στη Supabase (Πίνακας 'songs')
 */
async function saveToCloud(songData, groupId) {
    if (!currentUser) return;

    const payload = {
        ...songData,
        user_id: currentUser.id,
        group_id: groupId,
        id: (currentSongId && !currentSongId.startsWith('s_')) ? currentSongId : undefined
    };

    // Έλεγχος αν είμαστε Offline
    if (!navigator.onLine) {
        console.warn("🌐 Offline mode: Adding to sync queue");
        addToSyncQueue('SAVE_SONG', payload);
        showToast("Offline: Saved locally, will sync when online 📶", "warning");
        return;
    }

    const { error } = await supabaseClient.from('songs').upsert(payload);
    if (error) throw error;
}

/**
 * Υποστηρικτική: Αποθήκευση στο κλασικό LocalStorage (για Free χρήστες)
 */
function saveToLocalStorage(songData) {
    if (!currentSongId || !currentSongId.startsWith('s_')) {
        const newSong = ensureSongStructure(songData);
        library.push(newSong);
        currentSongId = newSong.id;
    } else {
        const idx = library.findIndex(s => s.id === currentSongId);
        if (idx > -1) {
            library[idx] = { ...library[idx], ...songData, id: currentSongId };
        }
    }
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}
/**
 * Αποθήκευση προσωπικών ρυθμίσεων πάνω σε κοινό τραγούδι μπάντας (Layer)
 */
async function saveAsOverride(songData) {
    if (!currentSongId || !currentUser) return;

    console.log("💾 Saving personal override layer...");

    const payload = {
        user_id: currentUser.id,
        song_id: currentSongId,
        // Σώζουμε τα προσωπικά στοιχεία που διαφέρουν ανά μουσικό
        local_transpose: state.t || 0,
        local_capo: state.c || 0,
        personal_notes: document.getElementById('inpPersonalNotes')?.value || ""
    };

    // Χρήση upsert: αν υπάρχει ήδη override το ενημερώνει, αλλιώς το δημιουργεί
    const { error } = await supabaseClient
        .from('personal_overrides')
        .upsert(payload, { onConflict: 'user_id, song_id' });

    if (error) {
        console.error("Override Save Error:", error);
        throw error;
    }
}

/* =========================================
   HELPER FUNCTIONS & PARSING
   ========================================= */
function ensureSongStructure(song) {
    if (!song) song = {};
    // Δημιουργία ID αν λείπει
    if (!song.id) song.id = "s_" + Date.now() + Math.random().toString(16).slice(2); 
    
    // Μεταφορά παλιών πεδίων στα νέα
    const cleaned = {
        id: song.id,
        title: song.title || "Untitled",
        artist: song.artist || "",
        key: song.key || "",
        body: song.body || "",
        intro: song.intro || "",
        interlude: song.interlude || "",
        video: song.video || "",
        // Εδώ η κρίσιμη αλλαγή για το αρχείο που έστειλες:
        tags: Array.isArray(song.playlists) ? song.playlists : (song.tags || []),
        notes: song.notes || "",
        updatedAt: song.updatedAt || Date.now()
    };
    return cleaned;
}

function parseSongLogic(song) {
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
        var tokens = [], buffer = "", i = 0;
        while (i < line.length) {
            var char = line[i];
            if (char === '!') {
                if (buffer.length > 0) { tokens.push({ c: "", t: buffer }); buffer = ""; }
                i++; var chordBuf = "", stopChord = false;
                while (i < line.length && !stopChord) {
                    var c = line[i];
                    if (c === '!' || c === ' ' || (c >= '\u0370' && c <= '\u03FF')) {
                        stopChord = true; if (c === ' ') i++; 
                    } else { chordBuf += c; i++; }
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
/**
 * Μετατρέπει συγχορδίες σε στυλ [Am] σε στυλ !Am για εσωτερική χρήση
 */
function convertBracketsToBang(text) {
    if (!text) return "";
    // Αντικαθιστά το [Chord] με !Chord
    return text.replace(/\[([a-zA-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)\]/g, "!$1");
}
async function loadContextData() {
    library = [];
    const listEl = document.getElementById('songList');
    if(listEl) listEl.innerHTML = '<div class="loading-msg">Loading songs...</div>';

    if (currentGroupId === 'personal') {
        if (canUserPerform('CLOUD_SAVE')) {
            library = await fetchPrivateSongs();
        } else {
            const localData = localStorage.getItem('mnotes_data');
            if (localData) {
                const parsed = JSON.parse(localData);
                library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            }
        }
    } else {
        library = await fetchBandSongs(currentGroupId);
    }

    // Refresh UI
    if (typeof renderSidebar === 'function') renderSidebar();
    
    // Auto-load first song
    if (library.length > 0) {
        currentSongId = library[0].id;
        if (typeof toViewer === 'function') toViewer(true);
    } else {
        if (typeof toEditor === 'function') toEditor();
    }
}
/**
 * Ενημερώνει το dropdown επιλογής περιβάλλοντος (Personal/Band)
 */
function updateGroupDropdown() {
    const sel = document.getElementById('selGroup'); // Το ID του <select> στο HTML σου
    if (!sel) return;

    // Καθαρισμός και προσθήκη της σταθερής επιλογής "Personal"
    sel.innerHTML = '<option value="personal">🏠 My Personal Library</option>';

    // Προσθήκη των Groups από το global state 'myGroups'
    myGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.group_id;
        // Το g.groups.name έρχεται από το join query στην initUserData
        opt.innerText = `🎸 ${g.groups?.name || 'Unknown Band'} (${g.role})`;
        sel.appendChild(opt);
    });
    
    // Επιλογή του τρέχοντος context
    sel.value = currentGroupId;

    // Listener για την εναλλαγή
    sel.onchange = (e) => switchContext(e.target.value);
}
// --- OFFLINE SYNC SYSTEM ---
function addToSyncQueue(type, data) {
    let queue = JSON.parse(localStorage.getItem('mnotes_sync_queue') || "[]");
    queue.push({ type, data, timestamp: Date.now() });
    localStorage.setItem('mnotes_sync_queue', JSON.stringify(queue));
}

async function processSyncQueue() {
    if (!navigator.onLine) return;
    let queue = JSON.parse(localStorage.getItem('mnotes_sync_queue') || "[]");
    if (queue.length === 0) return;

    console.log(`♻️ Syncing ${queue.length} pending changes...`);
    for (const item of queue) {
        if (item.type === 'SAVE_SONG') {
            await supabaseClient.from('songs').upsert(item.data);
        }
    }
    localStorage.removeItem('mnotes_sync_queue');
    showToast("All changes synced with cloud! ☁️");
    await loadContextData();
}

// --- SONG TRANSFER & PROPOSALS ---
async function transferSong(targetContext) {
    if (!canUserPerform('CLOUD_SAVE')) {
        showToast("Copy/Transfer is a Pro feature! 🚀", "warning");
        return;
    }
    const sourceSong = library.find(s => s.id === currentSongId);
    if (!sourceSong) return;

    const newSongData = {
        title: sourceSong.title,
        artist: sourceSong.artist,
        body: sourceSong.body,
        key: sourceSong.key,
        intro: sourceSong.intro,
        interlude: sourceSong.interlude,
        notes: (targetContext === 'personal') ? "" : sourceSong.notes,
        user_id: currentUser.id,
        group_id: (targetContext === 'personal') ? null : targetContext
    };

    if (targetContext !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner') {
        await submitProposal(newSongData, targetContext);
    } else {
        await supabaseClient.from('songs').insert([newSongData]);
        showToast("Song transferred! ✅");
        await loadContextData();
    }
}

async function submitProposal(songData, groupId) {
    const { error } = await supabaseClient.from('proposals').insert([{
        ...songData,
        proposed_by: currentUser.id,
        group_id: groupId,
        status: 'pending'
    }]);
    if (error) throw error;
    showToast("Proposal sent to Admin! 📩");
}
function applyEditorPlaceholders() {
    const fields = [
        { id: 'inpTitle', key: 'placeholder_title' },
        { id: 'inpArtist', key: 'placeholder_artist' },
        { id: 'inpKey', key: 'placeholder_key' },
        { id: 'tagInput', key: 'placeholder_tags' },
        { id: 'inpIntro', key: 'placeholder_intro' },
        { id: 'inpInter', key: 'placeholder_inter' },
        { id: 'inpBody', key: 'placeholder_body' },
        { id: 'inpConductorNotes', key: 'placeholder_notes_pub' },
        { id: 'inpPersonalNotes', key: 'placeholder_notes_priv' }
    ];

    fields.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.placeholder = t(f.key);
    });
   /**
 * Επεξεργασία δεδομένων που εισάγονται από αρχείο ή URL
 */
function processImportedData(data) {
    if (!data) return;
    
    // 1. Καθαρισμός προηγούμενων μαρκαρισμάτων (μόνο για αυτή τη συνεδρία)
    lastImportedIds.clear(); 
    
    // Μετατροπή σε πίνακα αν είναι ένα τραγούδι
    let newSongs = Array.isArray(data) ? data : (data.songs ? data.songs : [data]);
    let hasNew = false;

    newSongs.forEach(song => {
        let cleanSong = ensureSongStructure(song);
        
        // Έλεγχος αν υπάρχει ήδη
        const exists = library.find(s => 
            s.title.toLowerCase() === cleanSong.title.toLowerCase() && 
            (s.artist || "").toLowerCase() === (cleanSong.artist || "").toLowerCase()
        );

        if (!exists) {
            library.push(cleanSong);
            lastImportedIds.add(cleanSong.id); // Μαρκάρισμα ως νέο για το UI
            hasNew = true;
        }
    });

    if (hasNew) {
        saveToLocalStorage(); // Ενημέρωση LocalStorage
        if (typeof renderSidebar === 'function') renderSidebar(); 

        // 2. Αυτόματη πλοήγηση στο πρώτο νέο τραγούδι (βάσει ταξινόμησης)
        // Η visiblePlaylist είναι ενημερωμένη από τη renderSidebar
        const firstNew = visiblePlaylist.find(s => lastImportedIds.has(s.id));
        if (firstNew) {
            loadSong(firstNew.id);
        }
        
        showToast(t('msg_imported') || "Import Successful!");
    } else {
        showToast("No new songs found.");
    }
}
}
/**
 * UI για την επιλογή δράσης (Clone vs Proposal)
 */
function showActionModal(songData) {
    // Φάση 1: Proposal
    if (confirm("Δεν έχετε δικαίωμα απευθείας αλλαγής στίχων στην Μπάντα.\n\nΘέλετε να στείλετε ΠΡΟΤΑΣΗ (Proposal) στον Μαέστρο;")) {
        submitProposal(songData, currentGroupId);
        return;
    }

    // Φάση 2: Clone
    if (confirm("Θέλετε να αποθηκεύσετε τις αλλαγές ως ΠΡΟΣΩΠΙΚΟ ΑΝΤΙΓΡΑΦΟ (Clone) στη δική σας βιβλιοθήκη;")) {
        importToPersonalLibraryFromData(songData);
    }
}

/**
 * Δημιουργία καθαρού αντιγράφου από δεδομένα (Clone)
 */
async function importToPersonalLibraryFromData(data) {
    const cleanCopy = {
        ...data,
        user_id: currentUser.id,
        group_id: null, // Γίνεται Personal
        id: undefined   // Νέο ID
    };

    const { error } = await supabaseClient.from('songs').insert([cleanCopy]);
    
    if (!error) {
        showToast("Saved copy to My Library! 🏠");
        // Προαιρετικά: switchContext('personal');
    } else {
        showToast("Error copying song", "error");
    }
}
/**
 * Εφαρμογή των ρυθμίσεων του God Mode
 */
async function applySimulation() {
    const simTier = document.getElementById('debugTier').value;
    const simRole = document.getElementById('debugRole').value;
   /* =========================================
   BAND MANAGER LOGIC
   ========================================= */

async function renderBandManager() {
    const container = document.getElementById('bandManagerContent');
    if (!container) return;

    // --- ΣΕΝΑΡΙΟ 1: PERSONAL CONTEXT (Δημιουργία) ---
    if (currentGroupId === 'personal') {
        container.innerHTML = `
            <div style="text-align:center; padding:20px 10px;">
                <p style="font-size:0.9rem; color:#aaa; margin-bottom:15px;">
                    Διαχειριστείτε τις μπάντες σας ή δημιουργήστε καινούργια.
                </p>
                <button onclick="createNewBandUI()" class="footer-btn" style="width:100%; justify-content:center; background:var(--accent); color:#000; font-weight:bold;">
                    <i class="fas fa-plus-circle"></i> Create New Band
                </button>
            </div>
        `;
        return;
    }

    // --- ΣΕΝΑΡΙΟ 2: BAND CONTEXT (Διαχείριση) ---
    container.innerHTML = '<div class="loading-placeholder">Loading Band Data...</div>';

    // 1. Φέρνουμε τα μέλη
    const { data: members, error } = await supabaseClient
        .from('group_members')
        .select('role, user_id, profiles(email)') // Join με profiles
        .eq('group_id', currentGroupId);

    if (error) {
        container.innerHTML = `<div class="error">Error loading members</div>`;
        return;
    }

    const isOwner = (currentRole === 'owner' || currentRole === 'admin');
    
    // 2. Χτίζουμε το HTML
    let html = `<div class="band-stat">MEMBERS: ${members.length} / 5</div>`;
    html += `<div class="member-list">`;
    
    members.forEach(m => {
        // Fallback αν το email δεν φορτώσει
        let displayEmail = m.profiles?.email ? m.profiles.email.split('@')[0] : "User " + m.user_id.slice(0,4);
        const roleIcon = m.role === 'owner' ? '👑' : '🎸';
        const isMe = m.user_id === currentUser.id;
        
        html += `
            <div class="member-item ${m.role}">
                <div style="overflow:hidden; text-overflow:ellipsis;">
                    <span title="${m.role}">${roleIcon}</span> 
                    ${isMe ? '<strong>You</strong>' : displayEmail}
                </div>
                ${isOwner && !isMe ? 
                    `<button onclick="kickMember('${m.user_id}')" class="icon-btn danger" title="Kick Member" style="padding:2px 6px; font-size:0.8rem;"><i class="fas fa-times"></i></button>` 
                    : ''}
            </div>`;
    });
    html += `</div>`; // Κλείσιμο λίστας

    // 3. Εργαλεία Admin (Invite Code)
    if (isOwner) {
        html += `
            <div class="invite-box">
                <div style="font-size:0.8rem; text-transform:uppercase;">INVITE CODE</div>
                <span class="invite-code-display" id="invCodeDisp">...</span>
                <button onclick="copyInviteCode()" class="footer-btn small" style="margin:0 auto;">
                    <i class="far fa-copy"></i> Copy Link
                </button>
            </div>
            <button onclick="deleteBand()" class="footer-btn danger-v2" style="width:100%;">
                <i class="fas fa-bomb"></i> DISBAND GROUP
            </button>
        `;
        // Async call για φόρτωση κωδικού
        setTimeout(fetchInviteCode, 100); 
    } else {
        // Εργαλεία Μέλους
        html += `
            <button onclick="leaveBand()" class="footer-btn danger-v2" style="width:100%;">
                <i class="fas fa-sign-out-alt"></i> LEAVE BAND
            </button>
        `;
    }

    container.innerHTML = html;
}

// --- ACTIONS ---

async function createNewBandUI() {
    const name = prompt("Όνομα νέας μπάντας:");
    if(!name) return;

    // Έλεγχος: Αν είσαι Solo Pro και έχεις ήδη Owner role σε group
    const myOwnedGroups = myGroups.filter(g => g.role === 'owner');
    // ΠΡΟΣΟΧΗ: Εδώ ελέγχουμε το userProfile.subscription_tier
    const tier = userProfile?.subscription_tier || 'free';
    
    if (tier === 'solo' && myOwnedGroups.length >= 1) {
        alert("Ως Solo Pro, μπορείτε να είστε ιδιοκτήτης μόνο σε 1 μπάντα.");
        return;
    }
    if (tier === 'free') {
        alert("Αναβαθμίστε σε Solo Pro για να δημιουργήσετε μπάντα!");
        return;
    }

    // Insert Group
    const { data, error } = await supabaseClient
        .from('groups')
        .insert([{ name: name, owner_id: currentUser.id }])
        .select();

    if(error) { 
        console.error(error); 
        showToast("Error creating band", "error"); 
        return; 
    }

    const newGroupId = data[0].id;

    // Insert Member (Owner)
    await supabaseClient
        .from('group_members')
        .insert([{ group_id: newGroupId, user_id: currentUser.id, role: 'owner' }]);

    showToast("Band Created! 🎉");
    
    // Refresh για να φανεί παντού
    window.location.reload(); 
}

async function fetchInviteCode() {
    const { data, error } = await supabaseClient
        .from('groups')
        .select('invite_code')
        .eq('id', currentGroupId)
        .single();
        
    if(data) {
        let code = data.invite_code;
        // Αν δεν υπάρχει, γεννάμε έναν
        if(!code) {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
            await supabaseClient.from('groups').update({ invite_code: code }).eq('id', currentGroupId);
        }
        const el = document.getElementById('invCodeDisp');
        if(el) el.innerText = code;
    }
}

function copyInviteCode() {
    const code = document.getElementById('invCodeDisp').innerText;
    // Φτιάχνουμε ένα υποθετικό link (θα το υλοποιήσουμε μετά στο routing)
    const link = `${window.location.origin}?join=${code}`;
    navigator.clipboard.writeText(link);
    showToast("Invite Link Copied! 📋");
}

async function kickMember(uid) {
    if(!confirm("Είστε σίγουροι ότι θέλετε να απομακρύνετε αυτό το μέλος;")) return;
    await supabaseClient.from('group_members').delete().eq('group_id', currentGroupId).eq('user_id', uid);
    renderBandManager(); // Refresh list
    showToast("Member removed.");
}

async function leaveBand() {
    if(!confirm("Θέλετε να αποχωρήσετε από την μπάντα;")) return;
    await supabaseClient.from('group_members').delete().eq('group_id', currentGroupId).eq('user_id', currentUser.id);
    window.location.reload();
}

async function deleteBand() {
    const conf = prompt("ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα δεδομένα.\nΓράψτε 'DELETE' για επιβεβαίωση:");
    if(conf === 'DELETE') {
        // Λόγω Foreign Keys, συνήθως πρέπει να σβήσεις πρώτα τα members/songs
        // Αλλά αν έχεις βάλει ON DELETE CASCADE στη βάση, αρκεί αυτό:
        await supabaseClient.from('groups').delete().eq('id', currentGroupId);
        window.location.reload();
    }
}

    console.log(`🧪 SIMULATING: Tier=${simTier}, Role=${simRole}`);

    // 1. Override User Profile (Memory Only)
    if (!userProfile) userProfile = { id: 'sim_user' };
    userProfile.subscription_tier = simTier;

    // 2. Override Current Role
    currentRole = simRole;

    // 3. Ειδική μεταχείριση για το Context
    // Αν επιλέξουμε 'owner', υποθέτουμε Personal Context
    if (simRole === 'owner') {
        currentGroupId = 'personal';
        document.body.classList.remove('band-mode');
        document.body.classList.add('personal-mode');
    } else {
        // Αν επιλέξουμε admin/member, υποθέτουμε ότι είμαστε σε μπάντα
        // (Αν δεν υπάρχει μπάντα, φτιάχνουμε μια ψεύτικη ID για να δουλέψει το UI)
        if (currentGroupId === 'personal') currentGroupId = 'simulated_band_id';
        
        document.body.classList.remove('personal-mode');
        document.body.classList.add('band-mode');
    }

    // 4. Update UI
    updateUIForRole(); // Εμφάνιση/Απόκρυψη κουμπιών
    
    // Ανανέωση Sidebar (για να πάρει τα νέα χρώματα)
    if (typeof renderSidebar === 'function') renderSidebar();
    
    // Ανανέωση Player (για να κρύψει/δείξει notes κλπ)
    if (currentSongId) {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') renderPlayer(s);
    }

    showToast(`Simulation Applied: ${simTier.toUpperCase()} / ${simRole.toUpperCase()}`);
}
