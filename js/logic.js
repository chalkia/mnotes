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

// --- TIER CONFIGURATION (UPDATED) ---
const TIER_CONFIG = {
    free: { 
        label: "Free Mode",
        billing: "Free",
        canCloudSync: false, 
        useSupabase: false, 
        useDrive: false, 
        canJoinBands: false, 
        maxBandsOwned: 0,
        canSaveAttachments: false, // 🔒 Όχι αρχεία/ήχοι
        hasAdvancedDrums: false,   // 🔒 Μόνο απλός μετρονόμος
        canPrint: false,            // 🔒 Όχι εκτύπωση/PDF
        storageLimitMB: 0
    },
    solo: { 
        label: "Solo Pro",
        billing: "One-Time",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false, 
        canJoinBands: false, 
        maxBandsOwned: 0,
        canSaveAttachments: true,  // ✅ Ναι
        hasAdvancedDrums: false,    
        canPrint: true,             // ✅ Ναι
        storageLimitMB:50
    },
    member: { 
        label: "Band Member",
        billing : " Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false, 
        canJoinBands: true, 
        maxBandsOwned: 0,
        canSaveAttachments: true, 
        hasAdvancedDrums: true, // ✅ Πλήρες Sequencer/MIDI
        canPrint: true,
        storageLimitMB:500 
    },
    owner: { 
        label: "Band Owner",
        billing: "Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false, 
        canJoinBands: true, 
        maxBandsOwned: 1,
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB:1500 
    },
    maestro: { 
        label: "Maestro",
        billing: "Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false, 
        canJoinBands: true, 
        maxBandsOwned: 5,
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB:4500
    }
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
   USER & CONTEXT MANAGEMENT (CLEANED)
   ========================================= */

async function initUserData() {
    if (!currentUser) return;
    try {
        // 1. Προφίλ & Tier
        const { data: profile, error: pError } = await supabaseClient
            .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

        if (pError && pError.code !== 'PGRST116') throw pError;

        if (profile) {
            userProfile = profile;
            // Σιγουρευόμαστε ότι το tier είναι μικρά γράμματα
            userProfile.subscription_tier = profile.subscription_tier.toLowerCase();
        } else {
            const newProfile = { id: currentUser.id, email: currentUser.email, subscription_tier: 'free' };
            await supabaseClient.from('profiles').insert([newProfile]);
            userProfile = newProfile;
        }

        // 2. Groups (Bands) - Με σωστό Join και Error Handling
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
            const { data: simpleGroups } = await supabaseClient
                .from('group_members')
                .select('group_id, role')
                .eq('user_id', currentUser.id);
            myGroups = simpleGroups || [];
        } else {
            myGroups = groups || [];
            console.log(`🎸 Συνδέθηκαν ${myGroups.length} μπάντες.`);
        }

        // Ενημέρωση UI
        updateGroupDropdown();

        // 3. Αρχικοποίηση Context (Προσωπική Βιβλιοθήκη)
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

/**
 * Ενημέρωση ορατότητας στοιχείων βάσει ρόλου και context
 */
function updateUIForRole() {
    const btnDel = document.getElementById('btnDelSetlist'); 
    const btnAdd = document.getElementById('btnAddSong');
    const btnClone = document.getElementById('btnCloneToPersonal');

    // 1. Έλεγχος για το κουμπί Clone (Αντιγραφή στα Προσωπικά)
    if (btnClone) {
        btnClone.style.display = (currentGroupId !== 'personal' && currentSongId) ? 'inline-block' : 'none';
    }

    // 2. Έλεγχος για δικαιώματα διαχείρισης (Viewer vs Admin)
    if (currentGroupId !== 'personal' && currentRole === 'viewer') {
        if(btnDel) btnDel.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
    } else {
        if(btnDel) btnDel.style.display = 'inline-block';
        if(btnAdd) btnAdd.style.display = 'flex';
    }
    
    // 3. Ενημέρωση του Header (Τίτλος Μπάντας vs My Songs)
    if (typeof refreshHeaderUI === 'function') refreshHeaderUI();
}



/* =========================================
   DATA LOADING & SYNC
   ========================================= */
async function loadContextData() {
   console.log("🔍 [DEBUG SYNC] Ξεκινάει επαναφόρτωση. library length:", window.library ? window.library.length : 'undefined');
    //library = [];
    const listEl = document.getElementById('songList');
    if(listEl) listEl.innerHTML = '<div class="loading-msg">Loading Library...</div>';

    try {
        if (currentGroupId === 'personal') {
            // 1. Προσπάθεια για Cloud αν είναι Maestro/Solo
            if (canUserPerform('CLOUD_SAVE')) {
                const cloudSongs = await fetchPrivateSongs();
                if (cloudSongs && cloudSongs.length > 0) library = cloudSongs;
            }
            
            // 2. Fallback στο LocalStorage αν το Cloud είναι άδειο (ή αν είναι Free)
            if (library.length === 0) {
                const localData = localStorage.getItem('mnotes_data');
                if (localData) {
                    const parsed = JSON.parse(localData);
                    library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
                }
            }
        } else {
            // Context Μπάντας
            library = await fetchBandSongs(currentGroupId);
            
            // Φόρτωση προσωπικών overrides (σημειώσεις, transpose)
            const { data: overrides } = await supabaseClient
                .from('personal_overrides')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('group_id', currentGroupId);

            library = library.map(song => {
                const userOverride = overrides?.find(o => o.song_id === song.id);
                if (userOverride) {
                    song.personal_notes = userOverride.personal_notes;
                    song.personal_transpose = userOverride.local_transpose || 0;
                    song.has_override = true;
                }
                return song;
            });
        }

        if (typeof renderSidebar === 'function') renderSidebar();
              
        // 🚀 ΔΙΟΡΘΩΣΗ: Αυτόματη επιλογή τραγουδιού ΜΕ διατήρηση μνήμης
        if (library.length > 0) {
            // Ψάχνουμε αν το τραγούδι που βλέπαμε ήδη, υπάρχει ακόμα στη νέα λίστα
            const songStillExists = currentSongId ? library.find(s => s.id === currentSongId) : null;
            
            if (!songStillExists) {
                // Μόνο αν ΔΕΝ υπάρχει (π.χ. μόλις το διαγράψαμε), πάμε στο 1ο της λίστας
                currentSongId = library[0].id;
            }
            // Αν υπάρχει, το currentSongId μένει ως έχει!
            
            if (typeof toViewer === 'function') toViewer(true);
        } else {
            if (typeof toEditor === 'function') toEditor();
        }
    } catch (err) {
        console.error("❌ Load Context Error:", err);
        if (typeof showToast === 'function') showToast("Error loading context", "error");
    }
   console.log("🔍 [DEBUG SYNC] Τέλος επαναφόρτωσης. Νέο library length:", window.library ? window.library.length : 'undefined');
    console.log("🔍 [DEBUG SYNC] Το currentSongId μετά το sync είναι:", currentSongId);
}


// --- Ο ΠΟΡΤΙΕΡΗΣ (Ελεγκτής Δικαιωμάτων) v2.2 ---
function canUserPerform(action) {
    // Διαβάζουμε το tier. Αν δεν υπάρχει, by default είναι 'free'
    const tier = (userProfile && userProfile.subscription_tier) ? userProfile.subscription_tier : 'free';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
    
    switch(action) {
        case 'CLOUD_SYNC': 
        case 'CLOUD_SAVE': 
            return config.canCloudSync;
            
        // ✨ ΠΡΟΣΘΗΚΗ: Τώρα ο πορτιέρης ξέρει τι σημαίνουν αυτά!
        case 'USE_SUPABASE':
            return config.useSupabase;
        case 'USE_DRIVE':
            return config.useDrive;
            
        case 'USE_AUDIO': 
            return config.canUseAudio; // Κόβει τους Free από το να παίζουν ήχους
            
        case 'SAVE_ATTACHMENTS': 
        case 'ATTACHMENTS':
            return config.canSaveAttachments;
            
        case 'USE_SEQUENCER': 
        case 'ADVANCED_DRUMS': 
            return config.hasAdvancedDrums;
            
        case 'PRINT': 
            return config.canPrint; 
            
        case 'JOIN_BANDS': 
        case 'JOIN_BAND':
            return config.canJoinBands;
            
        case 'CREATE_BAND': 
        case 'OWN_BAND':
            // Συνδυάζει το όριο του Tier με τα έξτρα δώρα (slots) από το God Mode!
            const baseBands = config.maxBandsOwned || 0;
            const extraBands = (userProfile && userProfile.special_unlocks && userProfile.special_unlocks.extra_bands) 
                                ? userProfile.special_unlocks.extra_bands 
                                : 0;
            return (baseBands + extraBands) > 0;
            
        default: 
            return false;
    }
}

// ==========================================
// IMPORT ΛΕΙΤΟΥΡΓΙΑ (SMART MERGE ΜΕ ΕΓΚΡΙΣΗ ΧΡΗΣΤΗ)
// ==========================================

window.processImportedData = async function(data) {
    console.log("📥 Import Started (Interactive Merge Mode)...");
    if (!data) return;
    
    let newSongs = Array.isArray(data) ? data : (data.songs ? data.songs : [data]);
    let importCount = 0;
    let updateCount = 0;

    if (!window.library) window.library = [];

    // Context switch στα προσωπικά
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
        if (typeof switchContext === 'function') await switchContext('personal');
    }

    for (let song of newSongs) {
        let cleanSong = typeof ensureSongStructure === 'function' ? ensureSongStructure(song) : song;
        
        // Αν το τραγούδι δεν έχει ID από το αρχείο (σπάνιο αλλά πιθανό), του δίνουμε ένα προσωρινό
        if (!cleanSong.id || String(cleanSong.id).startsWith('demo')) {
            cleanSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
        }

        const existingIndex = window.library.findIndex(s => s.id === cleanSong.id);

        if (existingIndex !== -1) {
            // --- ΣΥΓΚΡΟΥΣΗ ΒΡΕΘΗΚΕ: ΕΛΕΓΧΟΣ ΗΜΕΡΟΜΗΝΙΩΝ ---
            const existingSong = window.library[existingIndex];
            const importedTime = new Date(cleanSong.updated_at || 0).getTime();
            const localTime = new Date(existingSong.updated_at || 0).getTime();

            // Αν είναι ακριβώς το ίδιο αρχείο, το προσπερνάμε αθόρυβα 
            if (importedTime === localTime) {
                console.log(`⏭️ Παράβλεψη: Το "${cleanSong.title}" είναι ακριβώς το ίδιο.`);
                continue; 
            }

            // Καθορισμός του λεκτικού (Νεότερη/Παλαιότερη)
            const ageStatus = importedTime > localTime ? "ΝΕΟΤΕΡΗ" : "ΠΑΛΑΙΟΤΕΡΗ";
            
            // Το μήνυμα που θα δει ο χρήστης
            const confirmMsg = `Στη βιβλιοθήκη σας βρέθηκε μια ${ageStatus} έκδοση του τραγουδιού με τίτλο "${cleanSong.title}" που προσπαθείτε να εισάγετε.\n\nΝα γίνει αντικατάσταση; (OK = Ναι, Ακύρωση = Όχι)`;
            
            // Ερώτηση στον χρήστη
            const userAgrees = confirm(confirmMsg);

            if (userAgrees) {
                console.log(`🔄 Εγκρίθηκε: Αντικατάσταση για το "${cleanSong.title}".`);
                
                // Πάντρεμα (Smart Merge): Κρατάμε ηχητικά/αρχεία από το παλιό
                cleanSong.recordings = existingSong.recordings || [];
                cleanSong.attachments = existingSong.attachments || [];
                
                window.library[existingIndex] = cleanSong;
                updateCount++;
                
                // Cloud Sync (Με await για να μην κοπεί στη μέση!)
                if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && currentUser) {
                    if (typeof window.sanitizeForDatabase === 'function') {
                        const safePayload = window.sanitizeForDatabase(cleanSong, currentUser.id, existingSong.group_id);
                        if (typeof supabaseClient !== 'undefined') {
                            await supabaseClient.from('songs').upsert(safePayload);
                        }
                    }
                }
            } else {
                console.log(`🚫 Ακυρώθηκε: Απορρίφθηκε η αντικατάσταση για το "${cleanSong.title}".`);
            }

        } else {
            // --- ΝΕΟ ΤΡΑΓΟΥΔΙ ---
            console.log(`✨ Προσθήκη νέου: "${cleanSong.title}"`);
            
            // Παράγουμε ΠΑΝΤΑ νέο ID για τα εντελώς νέα τραγούδια (Ασπίδα Μπάντας)
            cleanSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
            if (!cleanSong.updated_at) cleanSong.updated_at = new Date().toISOString();

            window.library.push(cleanSong);
            importCount++;
            
            // Cloud Sync (Με await)
            if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && currentUser) {
                if (typeof window.sanitizeForDatabase === 'function') {
                    const safePayload = window.sanitizeForDatabase(cleanSong, currentUser.id, null);
                    if (typeof supabaseClient !== 'undefined') {
                        await supabaseClient.from('songs').upsert(safePayload);
                    }
                }
            }
        }
    }

    // --- ΤΕΛΙΚΗ ΕΝΗΜΕΡΩΣΗ UI ---
    let finalTargetId = null; // ✨ Δηλώνεται ΕΞΩ από το if για να μην "χάνεται" στα logs

    if (importCount > 0 || updateCount > 0) {
        // Ενημερώνουμε την τοπική αναφορά
        library = window.library; 
        
        if (typeof saveData === 'function') saveData(); 
        if (typeof renderSidebar === 'function') renderSidebar();
        
        let msg = "";
        if (importCount > 0) msg += `${importCount} Νέα ✅ `;
        if (updateCount > 0) msg += `${updateCount} Ενημερώθηκαν 🔄`;
        if (typeof showToast === 'function') showToast(msg.trim());
        
        // Βρίσκουμε το ID του τραγουδιού
        if (newSongs.length > 0) {
             finalTargetId = newSongs[newSongs.length - 1].id; 
        } else if (window.library.length > 0) {
             finalTargetId = window.library[window.library.length - 1].id;
        }

        if (finalTargetId && typeof loadSong === 'function') {
            currentSongId = finalTargetId;
            loadSong(finalTargetId);
            if (typeof switchView === 'function') switchView('view-details');
        }
    } else {
        console.log("ℹ️ Η εισαγωγή ολοκληρώθηκε χωρίς αλλαγές.");
        if (typeof showToast === 'function') showToast("Δεν έγιναν νέες εισαγωγές ή αντικαταστάσεις.");
    }

    console.log("🔍 [DEBUG IMPORT] Ολοκληρώθηκε η εισαγωγή.");
    console.log("🔍 [DEBUG IMPORT] Τελευταίο ID που εισήχθη/φορτώθηκε:", finalTargetId);
    console.log("🔍 [DEBUG IMPORT] Τρέχον currentSongId:", currentSongId);
    console.log("🔍 [DEBUG IMPORT] Σύνολο τραγουδιών:", window.library.length);
};
// --- AUDIO & ATTACHMENT RECORDING SAVING ---
async function addRecordingToCurrentSong(newRec) {
    if (!currentSongId || typeof currentUser === 'undefined' || !currentUser) return;
    
    let saveToGlobal = false;
    if (currentGroupId === 'personal') {
        saveToGlobal = true; 
    } else if (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro') {
        // ΠΡΟΣΘΗΚΗ ΠΟΥ ΕΛΕΙΠΕ: Κλήση του Custom Modal
        const choice = await askVisibilityRole();
        if (!choice) return;
        saveToGlobal = (choice === 'public');
    }

    if (saveToGlobal) {
        const { data: songData } = await supabaseClient.from('songs').select('recordings').eq('id', currentSongId).single();
        let recs = (songData && songData.recordings) ? songData.recordings : [];
        recs.push(newRec);
        const { error } = await supabaseClient.from('songs').update({ recordings: recs }).eq('id', currentSongId);
        if (error) alert("Σφάλμα κεντρικής αποθήκευσης: " + error.message);
    } else {
        const { data } = await supabaseClient.from('personal_overrides').select('id, recordings').eq('user_id', currentUser.id).eq('song_id', currentSongId).eq('group_id', currentGroupId).maybeSingle();
        let recs = (data && data.recordings) ? data.recordings : [];
        recs.push(newRec);
        if (data) {
            await supabaseClient.from('personal_overrides').update({ recordings: recs }).eq('id', data.id);
        } else {
            await supabaseClient.from('personal_overrides').insert([{ user_id: currentUser.id, song_id: currentSongId, group_id: currentGroupId, recordings: recs }]);
        }
    }
   // await loadContextData();
   const s = library.find(x => x.id === currentSongId);
    if (s) {
        if (!s.recordings) s.recordings = [];
        if (!s.recordings.find(r => r.id === newRec.id)) s.recordings.push(newRec);
    }
}

async function addAttachmentToCurrentSong(newDoc) {
    if (!currentSongId || typeof currentUser === 'undefined' || !currentUser) return;
    
    let saveToGlobal = false;
    if (currentGroupId === 'personal') {
        saveToGlobal = true;
    } else if (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro') {
        // ΠΡΟΣΘΗΚΗ ΠΟΥ ΕΛΕΙΠΕ: Κλήση του Custom Modal
        const choice = await askVisibilityRole();
        if (!choice) return;
        saveToGlobal = (choice === 'public');
    }

    if (saveToGlobal) {
        const { data: songData } = await supabaseClient.from('songs').select('attachments').eq('id', currentSongId).single();
        let docs = (songData && songData.attachments) ? songData.attachments : [];
        docs.push(newDoc);
        const { error } = await supabaseClient.from('songs').update({ attachments: docs }).eq('id', currentSongId);
        if (error) alert("Σφάλμα κεντρικής αποθήκευσης: " + error.message);
    } else {
        const { data } = await supabaseClient.from('personal_overrides').select('id, attachments').eq('user_id', currentUser.id).eq('song_id', currentSongId).eq('group_id', currentGroupId).maybeSingle();
        let docs = (data && data.attachments) ? data.attachments : [];
        docs.push(newDoc);
        if (data) {
            await supabaseClient.from('personal_overrides').update({ attachments: docs }).eq('id', data.id);
        } else {
            await supabaseClient.from('personal_overrides').insert([{ user_id: currentUser.id, song_id: currentSongId, group_id: currentGroupId, attachments: docs }]);
        }
    }
    // await loadContextData();
   const s = library.find(x => x.id === currentSongId);
    if (s) {
        if (!s.attachments) s.attachments = [];
        if (!s.attachments.find(a => a.id === newDoc.id)) s.attachments.push(newDoc);
    }
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
        group_id: currentGroupId,
        local_transpose: state.t || 0,
        local_capo: state.c || 0,
        // ΔΙΟΡΘΩΣΗ: Διαβάζει πλέον από το νέο πεδίο της δεξιάς μπάρας!
        personal_notes: document.getElementById('sidePersonalNotes')?.value || "" 
    };

    const { error } = await supabaseClient
        .from('personal_overrides')
        .upsert(payload, { onConflict: 'user_id, song_id, group_id' });

    if (error) {
        console.error("Override Save Error:", error);
        throw error;
    }
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
    console.log(`📝 [SAVE] Ξεκινάει η αποθήκευση. SongID: ${currentSongId || 'NEW'}, Context: ${currentGroupId}`);

    // 1. Ασφαλής ανάγνωση και επικύρωση βασικών πεδίων
    const titleInp = document.getElementById('inpTitle');
    const bodyInp = document.getElementById('inpBody');
    
    const title = titleInp ? titleInp.value.trim() : "";
    const body = bodyInp ? bodyInp.value.trim() : "";
    
    if (!title || !body) { 
        showToast(typeof t === 'function' ? t('msg_title_body_req') : "Απαιτείται τίτλος και περιεχόμενο", "error"); 
        return; 
    }

    // 2. Εξασφάλιση μόνιμου ID
    if (!currentSongId || currentSongId === 'null') {
        currentSongId = "s_" + Date.now() + Math.random().toString(16).slice(2);
        console.log(`✨ [SAVE] Δημιουργήθηκε νέο ID: ${currentSongId}`);
    }

    // 3. Συλλογή και καθαρισμός δεδομένων (Sanitization)
    const publicBandNotes = document.getElementById('inpConductorNotes')?.value.trim() || "";
    const tagsRaw = document.getElementById('inpTags')?.value || "";
    const tagsArray = tagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

    const songData = {
        id: currentSongId,
        title: title,
        artist: document.getElementById('inpArtist')?.value.trim() || "",
        key: document.getElementById('inpKey')?.value.trim() || "",
        body: body,
        intro: document.getElementById('inpIntro')?.value.trim() || "",
        interlude: document.getElementById('inpInter')?.value.trim() || "",
        conductorNotes: publicBandNotes, // Για το UI Player
        notes: publicBandNotes,          // Για το Supabase Database
        video: document.getElementById('inpVideo')?.value.trim() || "",
        tags: tagsArray,
        updated_at: new Date().toISOString()
    };
   
    try {
        // ==========================================
        // ΣΕΝΑΡΙΟ Α: ΠΡΟΣΩΠΙΚΗ ΒΙΒΛΙΟΘΗΚΗ
        // ==========================================
        if (currentGroupId === 'personal') {
            console.log("🔒 [SAVE] Αποθήκευση στην Προσωπική Βιβλιοθήκη");
            
            if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
                await saveToCloud(songData, null);
                showToast("Αποθηκεύτηκε στο Cloud! ☁️");
            } 
            else if (typeof canUserPerform === 'function' && canUserPerform('USE_DRIVE')) {
                if (typeof saveToLocalStorage === 'function') saveToLocalStorage(songData); 
                if (typeof saveToDrive === 'function') await saveToDrive(library);
                showToast("Αποθηκεύτηκε στο Google Drive! 📂");
            } 
            else {
                if (typeof saveToLocalStorage === 'function') saveToLocalStorage(songData);
                showToast("Αποθηκεύτηκε Τοπικά! 💾");
            }
        } 
        // ==========================================
        // ΣΕΝΑΡΙΟ Β: ΜΠΑΝΤΑ (Band Context)
        // ==========================================
        else {
            console.log("🎸 [SAVE] Αποθήκευση σε Περιβάλλον Μπάντας");
            
            // Χρήση της κεντρικής συνάρτησης δικαιωμάτων! (Βάλε το σωστό Action Key)
            const canEditBand = (currentRole === 'admin' || currentRole === 'owner');

            if (canEditBand) {
                console.log("✅ [SAVE] Ο χρήστης έχει δικαίωμα επεξεργασίας ρεπερτορίου μπάντας.");
                await saveToCloud(songData, currentGroupId);
                showToast("Η βιβλιοθήκη της μπάντας ενημερώθηκε! 🎸");
            } else {
                console.log("⚠️ [SAVE] Απλό μέλος - Αποθήκευση μόνο ως Override.");
                if (typeof saveAsOverride === 'function') {
                    await saveAsOverride({ ...songData });
                }
                showToast("Οι προσωπικές ρυθμίσεις αποθηκεύτηκαν! 👤");
            }
        }
         
        // ==========================================
        // UI & NAVIGATION (Επιστροφή στον Viewer)
        // ==========================================
        const targetId = currentSongId;
        
        // Φρεσκάρισμα της λίστας με τα νέα δεδομένα
        if (typeof loadContextData === 'function') await loadContextData(); 

        // Εμφάνιση του τραγουδιού
        if (typeof displaySong === 'function') {
            displaySong(targetId); 
        } else if (typeof toViewer === 'function') {
            toViewer(true);
        }

        // Οπτική μετάβαση
        if (typeof switchView === 'function') {
            switchView('view-details');
        }

        console.log("🏁 [SAVE] Η διαδικασία αποθήκευσης ολοκληρώθηκε επιτυχώς.");

    } catch (err) {
        console.error("❌ [SAVE ERROR] Αποτυχία αποθήκευσης:", err);
        showToast("Σφάλμα κατά την αποθήκευση", "error");
    }
}

/**
 * Υποστηρικτική: Αποθήκευση στη Supabase (Πίνακας 'songs')
 */
async function saveToCloud(songData, groupId) {
    if (!currentUser) return;

    // ✨ ΦΙΛΤΡΑΡΟΥΜΕ ΤΑ ΔΕΔΟΜΕΝΑ ΠΡΙΝ ΤΑ ΣΤΕΙΛΟΥΜΕ
    const safePayload = window.sanitizeForDatabase(songData, currentUser.id, groupId);

    if (!navigator.onLine) {
        addToSyncQueue('SAVE_SONG', safePayload);
        return;
    }

    const { error } = await supabaseClient.from('songs').upsert(safePayload);
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
 * Αντιγράφει ένα τραγούδι από τη βιβλιοθήκη της Μπάντας 
 * στην Προσωπική Βιβλιοθήκη του χρήστη.
 */
async function cloneToPersonal() {
    // 1. Βρίσκουμε το τραγούδι που βλέπει ο χρήστης αυτή τη στιγμή
    const sourceSong = library.find(s => s.id === currentSongId);
    if (!sourceSong) {
        showToast("Δεν βρέθηκε το τραγούδι", "error");
        return;
    }

    if (!currentUser) {
        showToast("Πρέπει να είστε συνδεδεμένος", "error");
        return;
    }

    // 2. Προετοιμασία του Κλώνου
    // Φτιάχνουμε νέο ID για να είναι ανεξάρτητο
    const newId = "s_" + Date.now() + Math.random().toString(16).slice(2);

    const clonedSong = {
        id: newId,
        title: sourceSong.title + " (Copy)", // Προσθήκη για να το ξεχωρίζει
        artist: sourceSong.artist,
        body: sourceSong.body,
        key: sourceSong.key,
        intro: sourceSong.intro,
        interlude: sourceSong.interlude,
        video: sourceSong.video || "",
        tags: sourceSong.tags || [],
        user_id: currentUser.id,
        group_id: null, // <--- ΕΔΩ ΕΙΝΑΙ ΤΟ ΚΛΕΙΔΙ: Γίνεται προσωπικό
        notes: sourceSong.personal_notes || sourceSong.notes || "", // Παίρνει τις προσωπικές του σημειώσεις αν υπάρχουν
        recordings: [], // Συνήθως δεν αντιγράφουμε τα αρχεία για λόγους χώρου, αλλά αν θες προσθέτεις sourceSong.recordings
        attachments: []
    };

    try {
        // 3. Αποθήκευση (Cloud αν είναι Solo/Maestro, αλλιώς Local)
        if (canUserPerform('CLOUD_SAVE')) {
            const { error } = await supabaseClient.from('songs').insert([clonedSong]);
            if (error) throw error;
        } else {
            // Για Free χρήστες που είναι σε μπάντα αλλά θέλουν το τραγούδι τοπικά
            let localData = JSON.parse(localStorage.getItem('mnotes_data') || "[]");
            localData.push(clonedSong);
            localStorage.setItem('mnotes_data', JSON.stringify(localData));
        }

        showToast("Αντιγράφηκε στην Προσωπική Βιβλιοθήκη! 🏠");
        
        // 4. Προαιρετικά: Ρωτάμε αν θέλει να μεταβεί εκεί για να το δει
        if (confirm("Το τραγούδι αντιγράφηκε! Θέλετε να μεταβείτε στην Προσωπική σας Βιβλιοθήκη;")) {
            await switchContext('personal');
        }

    } catch (err) {
        console.error("Clone Error:", err);
        showToast("Αποτυχία αντιγραφής", "error");
    }
}

/* =========================================
   HELPER FUNCTIONS & PARSING
   ========================================= */
function ensureSongStructure(song) {
    if (!song) song = {};
    if (!song.id) song.id = "s_" + Date.now() + Math.random().toString(16).slice(2); 
    
    const cleaned = {
        id: song.id,
        title: song.title || "Untitled",
        artist: song.artist || "",
        key: song.key || "",
        body: song.body || "",
        intro: song.intro || "",
        interlude: song.interlude || "",
        video: song.video || "",
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
        
        // Αν δεν έχει ούτε ! ούτε [, είναι σκέτος στίχος
        if (line.indexOf('!') === -1 && line.indexOf('[') === -1) {
            state.parsedChords.push({ type: 'lyricOnly', text: line });
            return;
        }
        
        var tokens = [], buffer = "", i = 0;
        while (i < line.length) {
            var char = line[i];
            
            // --- ΕΛΕΓΧΟΣ: Σύστημα ! ή απλό σημείο στίξης; ---
            if (char === '!') {
                // Κοιτάμε τον επόμενο χαρακτήρα (lookahead)
                var nextChar = (i + 1 < line.length) ? line[i+1] : '';
                
                // Είναι τέλος γραμμής (''), κενό (' '), ή άλλο σημείο στίξης;
                var isPunctuation = nextChar === '' || nextChar === ' ' || /^[.,;?!:'"\-]$/.test(nextChar);
                // Είναι ελληνικό γράμμα; (Αποκλείεται να είναι συγχορδία)
                var isGreek = nextChar >= '\u0370' && nextChar <= '\u03FF';

                if (isPunctuation || isGreek) {
                    // Αντιμετώπισέ το ως κανονικό κείμενο (σημείο στίξης)
                    buffer += char; 
                    i++;
                    continue; 
                }

                // --- ΛΕΙΤΟΥΡΓΙΑ 1: Το Δικό σου Σύστημα (!) ---
                if (buffer.length > 0) { tokens.push({ c: "", t: buffer }); buffer = ""; }
                i++; // Προσπερνάμε το '!' της συγχορδίας
                var chordBuf = "", stopChord = false;
                while (i < line.length && !stopChord) {
                    var c = line[i];
                    if (c === '!' || c === ' ' || c === '[' || (c >= '\u0370' && c <= '\u03FF')) {
                        stopChord = true; 
                        if (c === ' ') i++; // Καταπίνουμε το κενό μετά τη συγχορδία
                    } else { 
                        chordBuf += c; i++; 
                    }
                }
                tokens.push({ c: chordBuf, t: "" });
            } 
            // --- ΛΕΙΤΟΥΡΓΙΑ 2: Πρότυπο ChordPro ([...]) ---
            else if (char === '[') {
                if (buffer.length > 0) { tokens.push({ c: "", t: buffer }); buffer = ""; }
                i++; // Προσπερνάμε το '['
                var chordBuf = "", stopChord = false;
                while (i < line.length && !stopChord) {
                    var c = line[i];
                    if (c === ']') {
                        stopChord = true; i++; // Προσπερνάμε το ']'
                    } else { 
                        chordBuf += c; i++; 
                    }
                }
                tokens.push({ c: chordBuf, t: "" });
            } 
            // --- ΚΑΝΟΝΙΚΟ ΚΕΙΜΕΝΟ ---
            else { 
                buffer += char; i++; 
            }
        }
        
        if (buffer.length > 0) {
            if (tokens.length > 0 && tokens[tokens.length-1].t === "") tokens[tokens.length-1].t = buffer;
            else tokens.push({ c: "", t: buffer });
        }
        state.parsedChords.push({ type: 'mixed', tokens: tokens });
    });
}

// ΠΡΟΣΟΧΗ: Η convertBracketsToBang ΑΦΑΙΡΕΘΗΚΕ.

/**
 * Ενημερώνει το dropdown επιλογής περιβάλλοντος (Personal/Band)
 */
function updateGroupDropdown() {
    const sel = document.getElementById('selGroup'); 
    if (!sel) return;

    sel.innerHTML = '<option value="personal">🏠 My Personal Library</option>';

    myGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.group_id;
        opt.innerText = `🎸 ${g.groups?.name || 'Unknown Band'} (${g.role})`;
        sel.appendChild(opt);
    });
    
    sel.value = currentGroupId;
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
    if (!canUserPerform('USE_SUPABASE')) {
        promptUpgrade('Κοινοποίηση σε Μπάντα');
        return;
    }
    
    const sourceSong = library.find(s => s.id === currentSongId);
    if (!sourceSong) return;

    // ✨ Νέο ID για το αντίγραφο της μπάντας (για να μην "κλαπεί" το προσωπικό)
    const newId = "s_" + Date.now() + Math.random().toString(16).slice(2);

    const newSongData = {
        id: newId, 
        title: sourceSong.title,
        artist: sourceSong.artist,
        body: sourceSong.body,
        key: sourceSong.key,
        intro: sourceSong.intro,
        interlude: sourceSong.interlude,
        notes: (targetContext === 'personal') ? "" : sourceSong.notes,
        video: sourceSong.video || "",
        tags: sourceSong.tags || [],
        user_id: currentUser.id,
        group_id: (targetContext === 'personal') ? null : targetContext,
        recordings: [], 
        attachments: [] 
    };

    try {
        if (targetContext !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner') {
            await submitProposal(newSongData, targetContext);
            showToast("Η πρόταση στάλθηκε στον Maestro! 📩");
        } else {
            // Χρησιμοποιούμε insert αντί για upsert για απόλυτη ασφάλεια
            const { error } = await supabaseClient.from('songs').insert([newSongData]);
            if (error) throw error;
            
            await migrateAttachmentsToOverrides(sourceSong, targetContext);
            showToast("Αντιγράφηκε επιτυχώς στη Μπάντα! ✅");
        }
        await loadContextData(); // Επαναφόρτωση για να δεις το αποτέλεσμα
    } catch (err) {
        console.error("Transfer Error:", err);
        showToast("Σφάλμα κατά τη μεταφορά", "error");
    }
}


// ΠΡΟΣΘΗΚΗ ΠΟΥ ΕΛΕΙΠΕ
async function migrateAttachmentsToOverrides(sourceSong, newGroupId) {
    let recs = sourceSong.recordings || [];
    let docs = sourceSong.attachments || [];
    
    if (recs.length === 0 && docs.length === 0 && !sourceSong.personal_notes) return;

    const payload = {
        user_id: currentUser.id,
        song_id: sourceSong.id,
        group_id: newGroupId,
        recordings: recs.map(r => ({...r, origin: 'private'})),
        attachments: docs.map(d => ({...d, origin: 'private'})),
        local_transpose: state.t || 0,
        local_capo: state.c || 0,
        personal_notes: document.getElementById('inpPersonalNotes')?.value || ""
    };

    await supabaseClient.from('personal_overrides').upsert(payload, { onConflict: 'user_id, song_id, group_id' });
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
        { id: 'inpVideo', key: 'placeholder_video' }, // Προστέθηκε το πεδίο του YouTube!
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
}

/**
 * Εφαρμογή των ρυθμίσεων του God Mode
 */
async function applySimulation() {
    const simTier = document.getElementById('debugTier').value;
    const simRole = document.getElementById('debugRole').value;
   
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
} // <--- ΑΥΤΗ ΕΙΝΑΙ Η ΑΓΚΥΛΗ ΠΟΥ ΣΕ ΕΣΩΣΕ! ΚΛΕΙΝΕΙ ΤΟ APPLY SIMULATION.


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
// --- ΔΗΜΙΟΥΡΓΙΑ ΜΠΑΝΤΑΣ ---
async function createNewBandUI() {
    const tier = userProfile?.subscription_tier || 'free';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.free;

    const extraBandsAllowed = userProfile?.special_unlocks?.extra_bands || 0;
    const totalAllowedBands = config.maxBandsOwned + extraBandsAllowed;

    // 🔒 Αν δεν δικαιούται καμία μπάντα (Free / Solo)
    if (totalAllowedBands === 0) {
        promptUpgrade('Δημιουργία Μπάντας');
        return;
    }

    const myOwnedGroups = myGroups.filter(g => g.role === 'owner' || g.role === 'admin');
    
    // 🔒 Αν έχει φτάσει το όριο του πακέτου του
    if (myOwnedGroups.length >= totalAllowedBands) {
        promptUpgrade(`Όριο Μπαντών (${totalAllowedBands})`);
        return;
    }

    const name = prompt("Όνομα νέας μπάντας:");
    if(!name) return;

    const { data, error } = await supabaseClient.from('groups').insert([{ name: name, owner_id: currentUser.id }]).select();

    if(error) { 
        if (error.code === '23505') {
            alert("⚠️ Αυτό το όνομα μπάντας χρησιμοποιείται ήδη! Παρακαλώ επιλέξτε ένα άλλο.");
        } else {
            console.error(error); 
            showToast("Σφάλμα κατά τη δημιουργία μπάντας", "error"); 
        }
        return; 
    }

    const newGroupId = data[0].id;
    await supabaseClient.from('group_members').insert([{ group_id: newGroupId, user_id: currentUser.id, role: 'owner' }]);

    const bandDemoSongs = DEFAULT_DEMO_SONGS.map((ds, idx) => ({
        ...ds,
        id: "s_" + Date.now() + idx + Math.random().toString(16).slice(2),
        user_id: currentUser.id,
        group_id: newGroupId
    }));
    await supabaseClient.from('songs').insert(bandDemoSongs);

    showToast("Band Created! 🎉");
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
// --- ΚΕΝΤΡΙΚΗ ΣΥΝΑΡΤΗΣΗ ΠΡΟΑΓΩΓΗΣ / ΠΡΟΤΑΣΗΣ (Promote/Propose) ---

async function promoteItem(songId, itemType, itemObjStr) {
    if (!songId || !currentUser || currentGroupId === 'personal') return;

    const itemObj = JSON.parse(decodeURIComponent(itemObjStr));
    const isGod = (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');

    try {
        if (isGod) {
            // ΠΡΟΣΘΗΚΗ ΠΟΥ ΕΛΕΙΠΕ: maybeSingle() αντί για single()
            const { data: globalSong, error: fetchErr } = await supabaseClient.from('songs').select(itemType).eq('id', songId).maybeSingle();
            if (fetchErr) throw fetchErr;

            if (!globalSong) {
                alert("Το τραγούδι δεν υπάρχει στο Cloud της μπάντας. Πατήστε 'Save' στο τραγούδι πρώτα!");
                return;
            }

            let globalItems = (globalSong && globalSong[itemType]) ? globalSong[itemType] : [];
            
            if (!globalItems.find(i => i.id === itemObj.id)) {
                globalItems.push(itemObj);
                await supabaseClient.from('songs').update({ [itemType]: globalItems }).eq('id', songId);
            }

            const { data: myOverride } = await supabaseClient
                .from('personal_overrides')
                .select(`id, ${itemType}`)
                .eq('user_id', currentUser.id)
                .eq('song_id', songId)
                .eq('group_id', currentGroupId) 
                .maybeSingle();

            if (myOverride && myOverride[itemType]) {
                let personalItems = myOverride[itemType].filter(i => i.id !== itemObj.id);
                await supabaseClient.from('personal_overrides').update({ [itemType]: personalItems }).eq('id', myOverride.id);
            }

            showToast("Το αρχείο έγινε Δημόσιο για την μπάντα! 📢");

        } else {
            const proposalPayload = {
                group_id: currentGroupId,
                song_id: songId,
                proposed_by: currentUser.id,
                status: 'pending',
                title: `Νέο ${itemType === 'attachments' ? 'Αρχείο' : 'Ηχητικό'}: ${itemObj.name}`,
                notes: `PROPOSAL_ASSET|${itemType}|${JSON.stringify(itemObj)}`
            };

            const { error: propErr } = await supabaseClient.from('proposals').insert([proposalPayload]);
            if (propErr) throw propErr;

            showToast("Η πρόταση στάλθηκε στον Maestro! 📩");
        }
        
        await loadContextData();
        if (typeof toViewer === 'function') toViewer(true);

    } catch (error) {
        console.error("Promote Error:", error);
        alert("Σφάλμα κατά την αλλαγή δικαιωμάτων: " + error.message);
    }
}

// --- GIFT CODES & SPECIAL UNLOCKS ---
async function redeemGiftCode() {
    const codeInput = prompt("Εισάγετε τον κωδικό δώρου σας:");
    if (!codeInput || !currentUser) return;
    
    const cleanCode = codeInput.trim().toUpperCase();

    try {
        const { data: codeObj, error: findErr } = await supabaseClient
            .from('gift_codes').select('*').eq('code', cleanCode).eq('is_used', false).single();

        if (findErr || !codeObj) {
            alert("Ο κωδικός δεν βρέθηκε ή έχει ήδη εξαργυρωθεί.");
            return;
        }

        let currentUnlocks = userProfile.special_unlocks || {};

        if (codeObj.reward_type === 'extra_bands') {
            const currentExtra = currentUnlocks.extra_bands || 0;
            currentUnlocks.extra_bands = currentExtra + parseInt(codeObj.reward_value, 10);
            showToast(`Συγχαρητήρια! Κερδίσατε δικαίωμα για +${codeObj.reward_value} μπάντα! 🎉`);
        } 
        else if (codeObj.reward_type === 'tier_upgrade') {
            userProfile.subscription_tier = codeObj.reward_value;
            await supabaseClient.from('profiles').update({ subscription_tier: codeObj.reward_value }).eq('id', currentUser.id);
            showToast(`Συγχαρητήρια! Το προφίλ σας αναβαθμίστηκε σε ${codeObj.reward_value}! 🚀`);
        }
        else if (codeObj.reward_type === 'extra_storage') {
            const currentStorage = currentUnlocks.extra_storage_mb || 0;
            currentUnlocks.extra_storage_mb = currentStorage + parseInt(codeObj.reward_value, 10);
            showToast(`Κερδίσατε +${codeObj.reward_value}MB έξτρα χώρο στο Cloud! 💾`);
        }
        else if (codeObj.reward_type === 'rhythm_credits') {
            const currentCredits = currentUnlocks.rhythm_credits || 0;
            currentUnlocks.rhythm_credits = currentCredits + parseInt(codeObj.reward_value, 10);
            showToast(`Κερδίσατε ${codeObj.reward_value} δωρεάν ρυθμούς (Beats) για το Drum Store! 🥁`);
        }

        // Αποθήκευση των νέων unlocks στο προφίλ του χρήστη
        await supabaseClient.from('profiles').update({ special_unlocks: currentUnlocks }).eq('id', currentUser.id);
        
        // Σήμανση του κωδικού ως χρησιμοποιημένου
        await supabaseClient.from('gift_codes').update({ is_used: true, used_by: currentUser.id, used_at: new Date().toISOString() }).eq('id', codeObj.id);
        
        // Ενημέρωση της τοπικής μνήμης και του UI
        userProfile.special_unlocks = currentUnlocks;
        if (typeof updateUIForRole === 'function') updateUIForRole();

    } catch (err) {
        console.error("Gift Code Error:", err);
        alert("Προέκυψε σφάλμα κατά την εξαργύρωση.");
    }
}
async function deleteCurrentSong() {
    if (!currentSongId) return;
   
   // ✨ ΔΙΚΛΙΔΑ ΑΣΦΑΛΕΙΑΣ: Απαγόρευση διαγραφής αν είσαι viewer σε μπάντα!
    if (currentGroupId !== 'personal' && (currentRole !== 'owner' && currentRole !== 'admin')) {
        showToast("Δεν έχετε δικαίωμα διαγραφής σε αυτή τη μπάντα.", "error");
        return;
    }
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    if (!confirm(`Οριστική διαγραφή του "${s.title}";`)) return;

    try {
        // --- STEP 1: CLOUD DELETION (Αν αφορά το Tier) ---
        
        // A. Supabase (Maestro / Bands)
        if (canUserPerform('USE_SUPABASE') && !String(currentSongId).startsWith('demo')) {
             await supabaseClient.from('songs').delete().eq('id', currentSongId);
             await supabaseClient.from('personal_overrides').delete().eq('song_id', currentSongId);
        }
        
        // B. Google Drive (Solo Tier - αν υπάρχει η υλοποίηση)
        else if (canUserPerform('USE_DRIVE')) {
            // Εδώ θα καλούσες τη διαγραφή αρχείου από το Drive
        }

         // --- STEP 2: LOCAL DELETION ---
        window.library = window.library.filter(x => x.id !== currentSongId);
        
        // ✨ ΕΠΙΒΟΛΗ: Σώζουμε το άδειο ή φιλτραρισμένο array ΑΜΕΣΩΣ
        localStorage.setItem('mnotes_data', JSON.stringify(window.library));

        currentSongId = null;
        
        // Αντί για loadContextData, κάνουμε απευθείας render για ταχύτητα
        renderSidebar(); 
        showToast("Το τραγούδι διαγράφηκε.");

        // Δικλίδα Demos: Αν η λίστα άδειασε τελείως, η loadLibrary θα τα επαναφέρει στο επόμενο refresh
        if (window.library.length === 0) {
             console.log("Library is now empty.");
        }
        // Φόρτωση επόμενου ή Editor
        if (library.length > 0) loadSong(library[0].id);
        else if (typeof toEditor === 'function') toEditor();

    } catch (err) {
        console.error("Delete Error:", err);
        showToast("Σφάλμα κατά τη διαγραφή", "error");
    }
}
// ==========================================
// 🛡️ ΑΣΠΙΔΑ EDITOR (Για αποφυγή απώλειας δεδομένων)
// ==========================================
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const editorEl = document.getElementById('view-editor');
        // Αν ο Editor είναι ανοιχτός (active-view), ΜΗΝ κάνεις fetch από τη βάση!
        if (editorEl && editorEl.classList.contains('active-view')) {
            console.log("🛡️ Auto-Sync Blocked: Ο χρήστης επεξεργάζεται τραγούδι.");
        } else {
            console.log("🔄 Auto-Sync: Φόρτωση νέων δεδομένων από Cloud...");
            if (typeof loadContextData === 'function') loadContextData();
        }
    }
});
