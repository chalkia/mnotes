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

// ... Διατηρούνται οι splitSongBody, getNote, convertBracketsToBang, κλπ ...
