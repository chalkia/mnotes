/* =========================================
   CORE LOGIC & PARSING (js/logic.js) - v2.1
   ========================================= */

// --- Global State ---
let userProfile = null;      
let myGroups = [];           
let currentGroupId = 'personal'; 
let currentRole = 'owner';   

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
        // 1. Προφίλ & Tier
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

        // 2. Groups (Bands)
        const { data: groups, error: gError } = await supabaseClient
            .from('group_members')
            .select('group_id, role, groups(name, owner_id)')
            .eq('user_id', currentUser.id);

        if (!gError) {
            myGroups = groups;
            console.log(`🎸 Συνδέθηκαν ${myGroups.length} μπάντες.`);
            updateGroupDropdown();
        }

        // 3. Αρχικοποίηση Context
        await switchContext('personal');

        if (typeof refreshUIByTier === 'function') refreshUIByTier();

        if (typeof showToast === 'function') {
            const tierName = TIER_CONFIG[userProfile.subscription_tier]?.label || "Free";
            showToast(`Σύνδεση ως ${tierName}`);
        }

    } catch (err) {
        console.error("❌ Init Error:", err);
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
    if(listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Loading...</div>';

    if (currentGroupId === 'personal') {
        if (canUserPerform('CLOUD_SAVE')) {
            // TODO: library = await fetchPrivateSongs();
            console.log("Fetching from Cloud Personal...");
        } else {
            const localData = localStorage.getItem('mnotes_data');
            if (localData) {
                const parsed = JSON.parse(localData);
                library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
            }
        }
    } else {
        // TODO: library = await fetchBandSongs(currentGroupId);
        console.log("Fetching from Band Cloud...");
    }

    if (typeof renderSidebar === 'function') renderSidebar();
    
    if (library.length > 0) {
        currentSongId = library[0].id;
        if (typeof toViewer === 'function') toViewer(true);
    } else {
        if (typeof toEditor === 'function') toEditor();
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
    // 1. Συλλογή Δεδομένων από το UI (Editor)
    const title = document.getElementById('inpTitle').value;
    const body = convertBracketsToBang(document.getElementById('inpBody').value);
    
    if (!title || !body) {
        if (typeof showToast === 'function') showToast(t('msg_title_body_req'), "error");
        else alert("Title and Body are required!");
        return;
    }

    const songData = {
        title: title,
        artist: document.getElementById('inpArtist').value,
        key: document.getElementById('inpKey').value,
        body: body,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        notes: document.getElementById('inpNotes')?.value || "",
        video: document.getElementById('inpVideo')?.value || "",
        playlists: document.getElementById('inpTags')?.value.split(',').map(t => t.trim()).filter(t => t !== "") || [],
        updated_at: new Date().toISOString()
    };

    try {
        // ΠΕΡΙΠΤΩΣΗ Α: ΠΡΟΣΩΠΙΚΗ ΒΙΒΛΙΟΘΗΚΗ (Personal Context)
        if (currentGroupId === 'personal') {
            if (canUserPerform('CLOUD_SAVE')) {
                // SOLO/MAESTRO/ADMIN -> Αποθήκευση στο Cloud (Private)
                console.log("Saving to Personal Cloud...");
                await saveToCloud(songData, null); 
            } else {
                // FREE -> Αποθήκευση στο Local Storage
                console.log("Saving to Local Storage...");
                saveToLocalStorage(songData);
            }
        } 
        // ΠΕΡΙΠΤΩΣΗ Β: ΜΠΑΝΤΑ (Band Context)
        else {
            if (currentRole === 'admin' || currentRole === 'owner') {
                // ADMIN/OWNER -> Αποθήκευση στα κοινά της μπάντας
                console.log("Saving to Band Cloud...");
                await saveToCloud(songData, currentGroupId);
            } else {
                // MEMBER/VIEWER -> Αποθήκευση ως Personal Override (Layer)
                // Θα υλοποιηθεί στη Φάση "The Layer Logic"
                showToast("You don't have permission to edit band songs. Save as override coming soon.");
                return;
            }
        }

        if (typeof showToast === 'function') showToast("Saved successfully! ✅");
        
        // Ανανέωση δεδομένων και επιστροφή στον Viewer
        await loadContextData();
        if (typeof toViewer === 'function') toViewer(true);

    } catch (err) {
        console.error("❌ Save failed:", err);
        if (typeof showToast === 'function') showToast("Error during save", "error");
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
        group_id: groupId // null για personal cloud, UUID για μπάντα
    };

    // Αν υπάρχει ήδη currentSongId, κάνουμε update (upsert)
    // Προσοχή: Στο cloud χρησιμοποιούμε το UUID, στο local το s_timestamp
    const { error } = await supabaseClient
        .from('songs')
        .upsert(currentSongId && !currentSongId.startsWith('s_') ? { ...payload, id: currentSongId } : payload);

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


/* =========================================
   HELPER FUNCTIONS & PARSING
   ========================================= */

function ensureSongStructure(song) {
    if (!song) song = {};
    if (!song.id) song.id = "s_" + Date.now() + Math.random().toString(16).slice(2); 
    if (!song.updatedAt) song.updatedAt = Date.now();
    if (!song.title) song.title = "Untitled";
    if (!song.body) song.body = "";
    if (!song.playlists) song.playlists = [];
    if (song.tags && Array.isArray(song.tags)) song.playlists = song.tags; 
    return song;
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
// ... Διατηρούνται οι splitSongBody, getNote, convertBracketsToBang, κλπ ...
