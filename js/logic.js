/* =========================================
   CORE LOGIC & PARSING (js/logic.js) - v2.1
   ========================================= */

// --- Global State ---
let userProfile = null;
let lastSaveTimestamp= 0;
let myGroups = [];
let isSyncing = false; // ΝΕΟ: Φρένο συγχρονισμού           
let currentGroupId = 'personal'; 
let currentRole = 'owner';   
let isOffline = !navigator.onLine;
let lastImportedIds = new Set(); // Κρατάει τα IDs μόνο της τελευταίας εισαγωγής για τη συνεδρία
let showingOriginal = false; // False = My View (Default), True = Band View
let originalSongSnapshot = null; // Για σύγκριση αλλαγών κατά το Save

// --- TIER CONFIGURATION (FINAL STRICT & ENTERPRISE MODEL) ---
const TIER_CONFIG = {
    solo_free: { 
        label: "Free",
        billing: "Free",
        canCloudSync: false, 
        useSupabase: false, 
        useDrive: false, 
        canJoinBands: false,       
        maxBandsOwned: 0,
        maxBandsJoined: 0,
        maxSetlists: 0, 
        canSaveAttachments: false,
        use_audio: true,
        use_sequencer: false,    
        hasAdvancedDrums: false,   
        canPrint: false,           
        storageLimitMB: 0,
        includedBandMates: 0,
        // ✨ ΝΕΟ: Όρια Επισκέπτη (Guest)
        maxGuestSongs: 5,        
        canGuestExport: false 
    },
    solo_plus: { 
        label: "Plus",
        billing: "Premium",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        canJoinBands: false,       
        maxBandsOwned: 0,
        maxBandsJoined: 0,
        maxSetlists: 10, 
        canSaveAttachments: true,
        use_audio: true,
        use_sequencer: false,
        hasAdvancedDrums: true,    
        canPrint: true,            
        storageLimitMB: 50,
        includedBandMates: 0
    },
    band_mate: { 
        label: "Mate",
        billing: "Premium",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        canJoinBands: true,        
        maxBandsOwned: 1,        // ✨ Μπορεί να ιδρύσει 1 μπάντα
        maxBandsJoined: 2,       // ✨ Μπορεί να συμμετέχει σε έως 2
        maxSetlists: 20, 
        canSaveAttachments: true,
        use_audio: true,
        use_sequencer: false,
        hasAdvancedDrums: true,    
        canPrint: true,            
        storageLimitMB: 200,     
        includedBandMates: 0
    },
    band_maestro: { 
        label: "Maestro",
        billing: "Premium",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        canJoinBands: true,        
        maxBandsOwned: 5,        
        maxBandsJoined: 10,
        maxSetlists: 999, 
        canSaveAttachments: true,
        use_audio: true,
        use_sequencer: false,
        hasAdvancedDrums: true,    
        canPrint: true,            
        storageLimitMB: 4500,
        includedBandMates: 0
    },
    ensemble: { 
        label: "Ensemble",
        billing: "Enterprise",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        canJoinBands: true,        
        maxBandsOwned: 15,       
        maxBandsJoined: 20,
        maxSetlists: 999, 
        canSaveAttachments: true,
        use_audio: true,
        use_sequencer: false,
        hasAdvancedDrums: true,    
        canPrint: true,            
        storageLimitMB: 15000,
        includedBandMates: 10
    }
};
// --- ΥΠΟΛΟΓΙΣΜΟΣ ΠΡΑΓΜΑΤΙΚΩΝ ΟΡΙΩΝ (Βάση Πακέτου + Add-ons) ---
function getUserLimits() {
    let tierKey = 'solo_free';
    
    if (typeof userProfile !== 'undefined' && userProfile && userProfile.subscription_tier) {
        tierKey = userProfile.subscription_tier;
    } else if (typeof currentTier !== 'undefined' && currentTier) {
        tierKey = currentTier;
    }

      const tierMapping = {
           'free': 'solo_free',
           'solo': 'solo_plus',
           'plus': 'solo_plus',
           'pro': 'solo_plus',      
           'solo_pro': 'solo_plus', 
           'member': 'band_mate',
           // ✨ Οι παλιοί leaders γίνονται αυτόματα maestro
           'owner': 'band_maestro',
           'leader': 'band_maestro',
           'band_leader': 'band_maestro',
           'maestro': 'band_maestro',
           'ensemble': 'ensemble'
       };
   // };  --> Μήπως χρειάζεται?

    if (tierMapping[tierKey]) tierKey = tierMapping[tierKey];
    if (!TIER_CONFIG || !TIER_CONFIG[tierKey]) tierKey = 'solo_free';

    const baseConfig = TIER_CONFIG[tierKey];

    // 🚀 Διαβάζουμε τα Add-ons του χρήστη (αν υπάρχουν)
    const unlocks = (typeof userProfile !== 'undefined' && userProfile && userProfile.special_unlocks) ? userProfile.special_unlocks : {};
    
    const extraStorage = parseInt(unlocks.extra_storage_mb || 0, 10);
    const extraBands = parseInt(unlocks.extra_bands || 0, 10);
    const extraMates = parseInt(unlocks.extra_band_mates || 0, 10);

    // Επιστρέφουμε το τελικό, δυναμικό αντικείμενο
    return {
        ...baseConfig,
        storageLimitMB: baseConfig.storageLimitMB + extraStorage,
        maxBandsOwned: baseConfig.maxBandsOwned + extraBands,
        includedBandMates: (baseConfig.includedBandMates || 0) + extraMates
    };
}

// --- Ο ΠΟΡΤΙΕΡΗΣ (Ελεγκτής Δικαιωμάτων) v2.2 --- Ισως ΧΡΕΙΑΖΕΤΑΙ ΠΡΟΣΘΗΚΗ ΤΟΥ ΕΝSEMBLE
function canUserPerform (action, currentCount=0) {
    const limits = getUserLimits();

    switch(action) {
        // --- ΥΠΑΡΧΟΝΤΑ ΔΙΚΑΙΩΜΑΤΑ (Διατηρούνται ανέπαφα) ---
        case 'USE_SUPABASE':
        case 'CLOUD_SYNC':
            return limits.canCloudSync;
        case 'JOIN_BANDS': // Ελέγχει γενικά αν του επιτρέπεται (boolean)
            return limits.canJoinBands;
        case 'SAVE_ATTACHMENTS':
            return limits.canSaveAttachments;
        case 'USE_SEQUENCER':          
             return limits.use_sequencer;
        case 'ADVANCED_DRUMS':
             return limits.hasAdvancedDrums;
        case 'PRINT':
            return limits.canPrint;
        case 'DELEGATE_ADMIN':
            return limits.allowsDelegatedAdmin || false;
        case 'CREATE_SETLIST':
            return currentCount < limits.maxSetlists;
        case 'CREATE_BAND':
            return currentCount < (limits.maxBandsOwned || 0); 
        case 'ADD_BAND_MATE':
            return currentCount < limits.includedBandMates; 
        case 'USE_RHYTHMS':
            return limits.useRhythms;  
        case 'USE_MSTUDIO':
            return limits.useMStudio;  
          
        // --- ✨ ΝΕΑ ΔΙΚΑΙΩΜΑΤΑ (Guest & Όρια Μπάντας) ---
        
        case 'JOIN_BAND_LIMIT': 
            // 🌟 ΝΕΟ: Ελέγχει αν έχει ξεπεράσει τον αριθμό των bands που μπορεί να συμμετέχει (π.χ. 2 για Mate)
            return currentCount < (limits.maxBandsJoined || 0);

        case 'CREATE_GUEST_SONG': 
            // 🌟 ΝΕΟ: Ελέγχει αν ο επισκέπτης ξεπέρασε τα 5 δωρεάν τραγούδια
            if (typeof currentUser !== 'undefined' && currentUser) return true;
            return currentCount < (limits.maxGuestSongs || 5);
            
        case 'GUEST_EXPORT': 
            // 🌟 ΝΕΟ: Απαγορεύει την εξαγωγή αν δεν είναι συνδεδεμένος
            if (typeof currentUser !== 'undefined' && currentUser) return true;
            return limits.canGuestExport || false;

        default:
            return false;
    }
}

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

    // --- 0. ΑΚΑΡΙΑΙΑ ΦΟΡΤΩΣΗ ΑΠΟ CACHE (Για αποφυγή του "Free" flash) ---
    const cacheKey = `mnotes_user_profile_${currentUser.id}`;
    const cachedProfile = localStorage.getItem(cacheKey);
    
    if (cachedProfile) {
        try {
            userProfile = JSON.parse(cachedProfile);
            // Ενημερώνουμε το UI αμέσως, πριν καν ρωτήσουμε τη βάση!
            if (typeof refreshUIByTier === 'function') refreshUIByTier();
        } catch(e) { 
            console.warn("⚠️ Σφάλμα ανάγνωσης cache προφίλ", e); 
        }
    }

    try {
        // 1. Προφίλ & Tier (Επιβεβαίωση στο παρασκήνιο)
        const { data: profile, error: pError } = await supabaseClient
            .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

        if (pError && pError.code !== 'PGRST116') throw pError;

        let isTierChanged = false;
        
        if (profile) {
            // 1. Κανονικοποίηση (Normalization)
            let rawTier = profile.subscription_tier.toLowerCase().trim();
            
            // 2. Εμπλουτισμένο mapping για να πιάνει κάθε πιθανή γραφή από τη βάση
      
            const tierMap = { 
                 'free': 'solo_free', 'solo_free': 'solo_free',
                 'solo': 'solo_plus', 'plus': 'solo_plus', 'soloplus': 'solo_plus', 'solo_plus': 'solo_plus', 'pro': 'solo_plus', 'solo_pro': 'solo_plus',
                 'member': 'band_mate', 'bandmate': 'band_mate', 'band_mate': 'band_mate',
                 // ✨ Οι παλιοί leaders γίνονται αυτόματα maestro
                 'owner': 'band_maestro', 'leader': 'band_maestro', 'bandleader': 'band_maestro', 'band_leader': 'band_maestro',
                 'maestro': 'band_maestro', 'bandmaestro': 'band_maestro', 'band_maestro': 'band_maestro',
                 'ensemble': 'ensemble'
             };
            const fetchedTier = tierMap[rawTier] || 'solo_free';

            if (!userProfile || userProfile.subscription_tier !== fetchedTier) {
                isTierChanged = true;
            }
            userProfile = profile;
            userProfile.subscription_tier = fetchedTier;
            // ✨ Ο ΚΟΡΙΟΣ (DEBUGGER) ΞΕΚΙΝΑΕΙ ΕΔΩ ✨
             console.log("====================================");
             console.log("🕵️‍♂️ [GOD MODE DETECTOR] Ας δούμε την αλήθεια:");
             console.log("1. Το κείμενο στη Βάση Δεδομένων (profiles):", profile.subscription_tier);
             console.log("2. Πώς το 'μετέφρασε' το app (Tier Key):", fetchedTier);
             console.log("3. Τα MB που σου δίνει (getUserLimits):", typeof getUserLimits === 'function' ? getUserLimits().storageLimitMB : 'Άγνωστο');
             console.log("4. Ο Ρόλος σου (currentRole):", currentRole);
             console.log("====================================");
             // ✨ ΤΕΛΟΣ ΚΟΡΙΟΥ ✨

        } else {
            // Δεν βρέθηκε προφίλ. Δημιουργία νέου μέσω JS με UPSERT
            const newProfile = { id: currentUser.id, email: currentUser.email, subscription_tier: 'solo_free' };
            await supabaseClient.from('profiles').upsert([newProfile], { onConflict: 'id' });
            userProfile = newProfile;
            isTierChanged = true;
        }

        // Αποθήκευση για την επόμενη φορά
        localStorage.setItem(cacheKey, JSON.stringify(userProfile));

        if (isTierChanged || !cachedProfile) {
            if (typeof refreshUIByTier === 'function') refreshUIByTier();
        }

        // 📢 ΕΝΔΕΙΞΗ ΣΥΝΔΕΣΗΣ: Διαβάζει κατευθείαν το καθαρό Label από το TIER_CONFIG
        if (typeof showToast === 'function') {
            const tierLabel = TIER_CONFIG[userProfile.subscription_tier]?.label || "User";
            showToast(`Σύνδεση ως ${tierLabel} ✅`);
        }

        // 2. Groups (Bands) - Με σωστό Join και Error Handling
        const { data: groups, error: gError } = await supabaseClient
            .from('group_members')
            .select(`group_id, role, groups!group_members_group_id_fkey (name, owner_id)`)
            .eq('user_id', currentUser.id);

        if (gError) {
            const { data: simpleGroups } = await supabaseClient
                .from('group_members') .select('group_id, role') .eq('user_id', currentUser.id);
            myGroups = simpleGroups || [];
        } else {
            myGroups = groups || [];
        }

        // Ενημέρωση UI Dropdown
        if (typeof updateGroupDropdown === 'function') updateGroupDropdown();

        // 3. Αρχικοποίηση Context (Προσωπική Βιβλιοθήκη)
        await switchContext('personal');

    } catch (err) {
        console.error("❌ Critical Init Error:", err);
        if (typeof showToast === 'function') showToast("Λειτουργία Offline.", "error");
    }
}
/**
 * Εναλλαγή περιβάλλοντος εργασίας (Personal vs Band) με έλεγχο Πορτιέρη
 */
async function switchContext(targetId) {
    console.log(`🔄 [CONTEXT] Αίτημα αλλαγής σε: ${targetId}`);

    // --- ΝΕΟΣ ΕΛΕΓΧΟΣ: ΕΙΣΙΤΗΡΙΑ, BLACKLIST & VIEWERS (PORTIER LOGIC) ---
    if (targetId !== 'personal') {
        const groupData = typeof myGroups !== 'undefined' ? myGroups.find(g => g.group_id === targetId) : null;
        
        if (groupData) {
            const role = groupData.role;
            const isSponsored = groupData.is_sponsored === true; 
            const isBanned = groupData.is_banned === true;
            const personalTier = (typeof userProfile !== 'undefined' && userProfile) ? (userProfile.subscription_tier || 'solo_free') : 'solo_free';

            // 1. Έλεγχος Blacklist
            if (isBanned) {
                console.log(`🚫 [BANNED] Απαγόρευση εισόδου. Ο χρήστης είναι στη Μαύρη Λίστα.`);
                if (typeof showToast === 'function') {
                    showToast(typeof currentLang !== 'undefined' && currentLang === 'en' ? "Access Denied: You have been banned from this group." : "Απαγόρευση Πρόσβασης: Έχετε αποβληθεί από αυτή την ομάδα.", "error");
                }
                const sel = document.getElementById('contextSelector');
                if (sel) sel.value = 'personal';
                targetId = 'personal'; // Εξαναγκασμός σε Personal
            } 
            // 2. Έλεγχος Viewer Mode (Free χωρίς εισιτήριο και δεν είναι Admin/Owner)
            else if (personalTier === 'solo_free' && !isSponsored && role !== 'owner' && role !== 'admin') {
                console.log(`👁️ [VIEWER MODE] Ο Free χρήστης μπαίνει σε κατάσταση ανάγνωσης.`);
                if (typeof showToast === 'function') {
                    showToast(typeof currentLang !== 'undefined' && currentLang === 'en' ? "Viewer Mode: You can only read setlists." : "Viewer Mode: Βλέπετε μόνο τα Setlists της μπάντας.", "warning");
                }
                groupData.role = 'viewer'; // Προσωρινή αλλαγή ρόλου για το Session
            } else {
                console.log(`✅ [ACCESS GRANTED] Είσοδος επιτράπηκε.`);
            }
        }
    }
    // -------------------------------------------------------------

    currentGroupId = targetId;
    
    // Αλλαγή CSS Κλάσεων & Ορισμός Ρόλου
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

    // ✨ ΠΡΟΣΘΗΚΗ: Φόρτωση λιστών πριν τα δεδομένα, ώστε να εμφανίζεται η σωστή!
    if (typeof initSetlists === 'function') await initSetlists();

    await loadContextData();
    updateUIForRole();
    
    if (typeof loadBandDashboard === 'function') {
        loadBandDashboard();
    }
   // Αυτόματος συγχρονισμός ρεπερτορίου στο background
    if (targetId !== 'personal' && typeof autoImportBandSongs === 'function') {
        autoImportBandSongs(targetId);
    }
}

/**
 * Ενημέρωση ορατότητας στοιχείων βάσει ρόλου και context
 */
function updateUIForRole() {
    const btnDel = document.getElementById('btnDelSetlist'); 
    const btnAdd = document.getElementById('btnAddSong');
    const btnClone = document.getElementById('btnCloneToPersonal');
    const btnTabLibrary = document.getElementById('btnTabLibrary');

    // 1. Έλεγχος για το κουμπί Clone (Αντιγραφή στα Προσωπικά)
    if (btnClone) {
        btnClone.style.display = (currentGroupId !== 'personal' && typeof currentSongId !== 'undefined' && currentSongId) ? 'inline-block' : 'none';
    }

    const isLeader = (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');
    const isViewer = (currentRole === 'viewer');

    // 2. Περιορισμοί του Viewer (Βλέπει ΜΟΝΟ Setlists)
    if (isViewer) {
        if (btnTabLibrary) btnTabLibrary.style.display = 'none';
        if (typeof switchSidebarTab === 'function') switchSidebarTab('setlist');
    } else {
        if (btnTabLibrary) btnTabLibrary.style.display = 'inline-block';
    }

    // 3. Δικαιώματα διαγραφής Setlist (Μόνο Leaders στα Bands, ή στα Προσωπικά)
    if (btnDel) {
        if (currentGroupId === 'personal' || isLeader) {
            btnDel.style.display = 'inline-block';
        } else {
            btnDel.style.display = 'none'; // Απλά μέλη/viewers δεν σβήνουν λίστες της μπάντας
        }
    }

    // 4. ΝΕΟΣ ΚΑΝΟΝΑΣ: Το "+" (Νέο Τραγούδι) εμφανίζεται ΑΥΣΤΗΡΑ ΚΑΙ ΜΟΝΟ στα Προσωπικά
    if (btnAdd) {
        if (currentGroupId === 'personal') {
            btnAdd.style.display = ''; // Εμφανίζεται κανονικά
        } else {
            btnAdd.style.display = 'none'; // Εξαφανίζεται μέσα στη μπάντα για ΟΛΟΥΣ
        }
    }
    
    // 5. Ενημέρωση του Header (Τίτλος Μπάντας vs My Songs) & Dashboard
    if (typeof refreshHeaderUI === 'function') refreshHeaderUI();
    
    if (typeof loadBandDashboard === 'function') {
        loadBandDashboard();
    }
}
/* =========================================
   DATA LOADING & SYNC (OFFLINE-FIRST)
   ========================================= */
/* =========================================
   DATA LOADING & SYNC (OFFLINE-FIRST + DELTA SYNC)
   ========================================= */
async function loadContextData() {
   if (isSyncing) {
        console.warn("⏳ [SYNC] Ήδη σε εξέλιξη. Ακύρωση διπλής κλήσης.");
        return; 
    }
    isSyncing = true; // Κλείδωμα
    console.log(`🔍 [SYNC] Εκκίνηση Delta Sync για Context: ${currentGroupId}`);
    const listEl = document.getElementById('songList');
    if (typeof showLoader === 'function') showLoader('syncing_data', 'Συγχρονισμός...');

    try {
        let currentLibrary = []; 
        let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : `mnotes_band_${currentGroupId}`;
        let syncTimeKey = `mnotes_last_sync_${currentGroupId}`; // ✨ Το ρολόι συγχρονισμού

        // --- ΒΗΜΑ 1: ΦΟΡΤΩΣΗ ΚΑΙ ΚΑΘΑΡΙΣΜΟΣ ΤΟΠΙΚΗΣ ΜΝΗΜΗΣ ---
        const localDataRaw = localStorage.getItem(storageKey);
        if (localDataRaw) {
            let parsed = JSON.parse(localDataRaw);
            currentLibrary = parsed.filter(s => {
                if (currentGroupId === 'personal') return !s.group_id; 
                return s.group_id === currentGroupId; 
            }).map(ensureSongStructure);
        }

        // --- ΒΗΜΑ 2: CLOUD SYNC (DELTA) ---
        if (navigator.onLine && typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            if (typeof processSyncQueue === 'function') await processSyncQueue();

            // Διαβάζουμε πότε κάναμε τελευταία φορά επιτυχές sync
            const lastSyncISO = localStorage.getItem(syncTimeKey) || null;
            const syncAttemptTime = new Date().toISOString(); 

            if (currentGroupId === 'personal') {
                // ==========================================
                // ΠΡΟΣΩΠΙΚΟ ΣΥΓΧΡΟΝΙΣΜΟ (ΔΙΑΦΟΡΕΣ)
                // ==========================================
                const cloudDeltas = await fetchPrivateSongs(lastSyncISO);
                
                if (cloudDeltas.length > 0) {
                    console.log(`🔄 [SYNC] Βρέθηκαν ${cloudDeltas.length} αλλαγές στην Προσωπική Βιβλιοθήκη.`);
                    const localMap = new Map(currentLibrary.map(s => [s.id, s]));

                    for (const cloudSong of cloudDeltas) {
                        if (cloudSong.is_deleted) {
                            localMap.delete(cloudSong.id); 
                        } else {
                            const localSong = localMap.get(cloudSong.id);
                            // Κρατάμε το πιο πρόσφατο
                            if (!localSong || new Date(cloudSong.updated_at).getTime() > new Date(localSong.updated_at || 0).getTime()) {
                                localMap.set(cloudSong.id, cloudSong);
                            } else if (localSong && new Date(localSong.updated_at).getTime() > new Date(cloudSong.updated_at).getTime()) {
                                // Αν το τοπικό μας είναι πιο φρέσκο, το στέλνουμε!
                                await supabaseClient.from('songs').upsert(window.sanitizeForDatabase(localSong, currentUser.id, null));
                            }
                        }
                    }
                    currentLibrary = Array.from(localMap.values());
                }

            } else {
                // ==========================================
                // ΣΥΓΧΡΟΝΙΣΜΟΣ ΜΠΑΝΤΑΣ (ΔΙΑΦΟΡΕΣ + ΔΙΑΣΩΣΗ)
                // ==========================================
                const cloudDeltas = await fetchBandSongs(currentGroupId, lastSyncISO);
                
                // Τα Overrides τα φέρνουμε πάντα, είναι ελάχιστα δεδομένα
                const { data: overrides } = await supabaseClient
                    .from('personal_overrides')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .eq('group_id', currentGroupId);

                if (cloudDeltas.length > 0) {
                    console.log(`🔄 [SYNC] Βρέθηκαν ${cloudDeltas.length} αλλαγές στη Μπάντα.`);
                    const localMap = new Map(currentLibrary.map(s => [s.id, s]));
                    let myPersonalData = JSON.parse(localStorage.getItem('mnotes_data') || "[]");
                    let personalDataChanged = false;

                    // ✨ Ο ΝΕΟΣ ΑΣΦΑΛΗΣ ΜΗΧΑΝΙΣΜΟΣ ΔΙΑΣΩΣΗΣ
                    for (const cloudSong of cloudDeltas) {
                        if (cloudSong.is_deleted) {
                            // Η Μπάντα το διέγραψε! Ενεργοποιούμε τη διάσωση ΜΟΝΟ γι' αυτό
                            if (!String(cloudSong.id).startsWith('demo') && localMap.has(cloudSong.id)) {
                                let existingClone = myPersonalData.find(s => s.parent_id === cloudSong.id);
                                let existingIndependent = myPersonalData.find(s => s.title === cloudSong.title && s.parent_id !== cloudSong.id);

                                if (existingClone) {
                                    if (confirm(`📢 Η μπάντα διέγραψε το "${cloudSong.title}".\nΈχεις ήδη έναν Κλώνο στα Προσωπικά σου.\nΘέλεις να τον ενημερώσεις με την τελευταία έκδοση;`)) {
                                        existingClone.body = cloudSong.body; existingClone.key = cloudSong.key; existingClone.updated_at = new Date().toISOString();
                                        personalDataChanged = true;
                                        await supabaseClient.from('songs').upsert(window.sanitizeForDatabase(existingClone, currentUser.id, null));
                                    }
                                } else if (existingIndependent) {
                                    if (confirm(`📢 Η μπάντα διέγραψε το "${cloudSong.title}".\nΒρέθηκε ίδιο στα Προσωπικά. Να αντικατασταθούν οι στίχοι σου;`)) {
                                        existingIndependent.body = cloudSong.body; existingIndependent.key = cloudSong.key; existingIndependent.updated_at = new Date().toISOString();
                                        personalDataChanged = true;
                                        await supabaseClient.from('songs').upsert(window.sanitizeForDatabase(existingIndependent, currentUser.id, null));
                                    }
                                } else {
                                    if (confirm(`📢 Διεγράφη το "${cloudSong.title}". Θέλετε να κρατήσετε ένα προσωπικό αντίγραφο;`)) {
                                        const personalCopy = { ...cloudSong, id: "s_" + Date.now() + Math.random().toString(16).slice(2), group_id: null, user_id: currentUser.id, is_clone: true, parent_id: cloudSong.id, conductorNotes: "", is_deleted: false, updated_at: new Date().toISOString() };
                                        myPersonalData.push(personalCopy);
                                        personalDataChanged = true;
                                        await supabaseClient.from('songs').insert([window.sanitizeForDatabase(personalCopy, currentUser.id, null)]);
                                    }
                                }
                            }
                            localMap.delete(cloudSong.id); // Το αφαιρούμε από τα τοπικά της μπάντας
                        } else {
                            localMap.set(cloudSong.id, cloudSong); // Το προσθέτουμε/ενημερώνουμε
                        }
                    }
                    currentLibrary = Array.from(localMap.values());
                    if (personalDataChanged) localStorage.setItem('mnotes_data', JSON.stringify(myPersonalData));
                }

                // Εφαρμογή των Overrides (όπως το είχες, άθικτο)
                currentLibrary = currentLibrary.map(song => {
                    const userOverride = overrides?.find(o => o.song_id === song.id);
                    if (userOverride) {
                        song.personal_notes = userOverride.personal_notes;
                        song.personal_transpose = userOverride.local_transpose || 0;
                        song.personal_capo = userOverride.local_capo || 0; 
                        song.has_override = true;
                    }
                    return song;
                });
            }
            
            // ⏱️ Ανανεώνουμε το Ρολόι Συγχρονισμού μόνο αν όλα πήγαν καλά!
            localStorage.setItem(syncTimeKey, syncAttemptTime);
        }

        // --- ΒΗΜΑ 3: ΑΠΟΘΗΚΕΥΣΗ ΚΑΙ ΑΝΑΝΕΩΣΗ UI ---
        localStorage.setItem(storageKey, JSON.stringify(currentLibrary));
        window.library = currentLibrary;
        library = window.library;

        if (typeof applySortAndRender === 'function') {
            applySortAndRender(); 
        } else if (typeof renderSidebar === 'function') {
            renderSidebar();
        }
              
        if (library.length > 0) {
            const songStillExists = currentSongId ? library.find(s => s.id === currentSongId) : null;
            if (!songStillExists) currentSongId = library[0].id;
            
            if (window.innerWidth > 1024) {
                if (typeof toViewer === 'function') toViewer(true);
            } else {
                if (typeof switchDrawerTab === 'function') {
                    switchDrawerTab('library');
                } else {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.add('active');
                }
            }
        } else {
            if (typeof toEditor === 'function') toEditor();
        }
        
    } catch (err) { 
        console.error("❌ [SYNC FATAL ERROR]:", err);
    } finally {
        setTimeout(() => { isSyncing = false; }, 500); 
        if (typeof hideLoader === 'function') hideLoader(); 
    }
}
// ==========================================
// IMPORT ΛΕΙΤΟΥΡΓΙΑ (SMART MERGE ΜΕ ΕΓΚΡΙΣΗ ΧΡΗΣΤΗ)
// ==========================================


window.processImportedData = async function(data) {
       console.log("📥 Import Started (Forced Personal Context)...");
       if (!data) return;
       
       let newSongs = Array.isArray(data) ? data : (data.songs ? data.songs : [data]);
   
       // ✨ ΝΕΟ: ΕΛΕΓΧΟΣ ΟΡΙΟΥ GUEST ΓΙΑ ΤΟ IMPORT (Το παραθυράκι έκλεισε!)
       if (typeof currentUser === 'undefined' || !currentUser) {
           const userSongs = (window.library || []).filter(s => !String(s.id).includes('demo'));
           const guestLimit = typeof getUserLimits === 'function' ? (getUserLimits().maxGuestSongs || 5) : 5;
           
           // Ελέγχουμε αν το άθροισμα (αυτά που έχει + αυτά που φέρνει) ξεπερνάει το 5
           if (userSongs.length + newSongs.length > guestLimit) {
               if (typeof showToast === 'function') showToast("Η εισαγωγή ξεπερνάει το όριο επισκεπτών! (5/5)", "warning");
               
               const authMsg = document.getElementById('authMsg');
               if (authMsg) authMsg.innerText = "Δημιουργήστε έναν ΔΩΡΕΑΝ λογαριασμό για να εισάγετε απεριόριστα τραγούδια!";
               
               const authModal = document.getElementById('authModal');
               if (authModal) authModal.style.display = 'flex';
               
               return; // ⛔ Μπλοκάρουμε το Import!
           }
       }
   
       // 1. ΕΠΙΒΟΛΗ CONTEXT (ΓΙΑ ΟΛΟΥΣ)
       if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
           console.log("🔄 Context Switch: Μεταφορά στην Προσωπική Βιβλιοθήκη για την εισαγωγή.");
           if (typeof switchContext === 'function') await switchContext('personal');
       }
   
       if (typeof switchSidebarTab === 'function') switchSidebarTab('library');
       
       let importCount = 0;
       let updateCount = 0;
   
       if (!window.library) window.library = [];
   
       // ✨ 2. ΚΑΛΑΘΙΑ ΟΜΑΔΙΚΟΥ UPLOAD (BATCHING)
       let batchCloudPayloads = []; 
       let batchOfflineQueue = [];
   
       for (let song of newSongs) {
           let cleanSong = typeof ensureSongStructure === 'function' ? ensureSongStructure(song) : song;
           
           if (!cleanSong.id || String(cleanSong.id).startsWith('demo')) {
               cleanSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
           }
   
           const existingIndex = window.library.findIndex(s => s.id === cleanSong.id);
           let needsSync = false;
   
           if (existingIndex !== -1) {
               // --- ΣΥΓΚΡΟΥΣΗ ΒΡΕΘΗΚΕ ---
               const existingSong = window.library[existingIndex];
               const importedTime = new Date(cleanSong.updated_at || 0).getTime();
               const localTime = new Date(existingSong.updated_at || 0).getTime();
   
               if (importedTime === localTime) {
                   console.log(`| Skip: ${cleanSong.title} (Same version)`);
                   continue; 
               }
   
               const ageStatus = importedTime > localTime ? "ΝΕΟΤΕΡΗ" : "ΠΑΛΑΙΟΤΕΡΗ";
               const userAgrees = confirm(`Στη βιβλιοθήκη σας βρέθηκε μια ${ageStatus} έκδοση του τραγουδιού με τίτλο "${cleanSong.title}".\n\nΝα γίνει αντικατάσταση;`);
   
               if (userAgrees) {
                   cleanSong.recordings = existingSong.recordings || [];
                   cleanSong.attachments = existingSong.attachments || [];
                   window.library[existingIndex] = cleanSong;
                   updateCount++;
                   needsSync = true;
               }
           } else {
               // --- ΝΕΟ ΤΡΑΓΟΥΔΙ ---
               if (!cleanSong.updated_at) cleanSong.updated_at = new Date().toISOString();
               window.library.push(cleanSong);
               importCount++;
               needsSync = true;
           }
   
           // ✨ 3. Προσθήκη στο καλάθι (Αντί για 1-1 upload)
           if (needsSync && typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && currentUser) {
               const safePayload = typeof window.sanitizeForDatabase === 'function' ? window.sanitizeForDatabase(cleanSong, currentUser.id, null) : cleanSong;
               if (navigator.onLine) {
                   batchCloudPayloads.push(safePayload);
               } else {
                   batchOfflineQueue.push(safePayload);
               }
           }
       }
   
       // ✨ 4. ΟΜΑΔΙΚΟ UPLOAD ΣΤΗ SUPABASE (Εκτός της λούπας!)
       if (batchCloudPayloads.length > 0 && typeof supabaseClient !== 'undefined') {
           console.log(`☁️ Ομαδικό ανέβασμα ${batchCloudPayloads.length} τραγουδιών...`);
           try {
               await supabaseClient.from('songs').upsert(batchCloudPayloads);
           } catch (err) {
               console.error("Batch Upsert Error:", err);
           }
       }
       
       if (batchOfflineQueue.length > 0 && typeof addToSyncQueue === 'function') {
           batchOfflineQueue.forEach(payload => addToSyncQueue('SAVE_SONG', payload));
       }
   
       // --- ΤΕΛΙΚΗ ΕΝΗΜΕΡΩΣΗ UI ---
       let finalTargetId = null;
   
       if (importCount > 0 || updateCount > 0) {
           library = window.library; 
           if (typeof saveData === 'function') saveData(); 
           if (typeof applySortAndRender === 'function') applySortAndRender(); 
           
           let msg = "";
           if (importCount > 0) msg += `${importCount} Νέα ✅ `;
           if (updateCount > 0) msg += `${updateCount} Ενημερώθηκαν 🔄`;
           if (typeof showToast === 'function') showToast(msg.trim());
           
           if (newSongs.length > 0) finalTargetId = newSongs[newSongs.length - 1].id; 
           else if (window.library.length > 0) finalTargetId = window.library[window.library.length - 1].id;
   
           if (finalTargetId && typeof loadSong === 'function') {
               currentSongId = finalTargetId;
               loadSong(finalTargetId);
               if (window.innerWidth > 1024) {
                   if (typeof toViewer === 'function') toViewer(true);
               } else {
                   if (typeof switchDrawerTab === 'function') switchDrawerTab('stage'); 
               }
           }
       } else {
           if (typeof showToast === 'function') showToast("Δεν έγιναν νέες εισαγωγές ή αντικαταστάσεις.");
       }
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

    let s = window.library.find(x => x.id === currentSongId);

    // Διαβάζουμε από τον Editor, ή (αν είναι κλειστός) κρατάμε τις παλιές σημειώσεις
    const pNotesEl = document.getElementById('inpPersonalNotes');
    const pNotes = (pNotesEl && pNotesEl.offsetParent !== null) ? pNotesEl.value.trim() : (s ? s.personal_notes || s.notes || "" : "");
    
    const pTrans = state.t || 0;
    
    // ✨ Ο ΚΟΦΤΗΣ ΤΟΥ CAPO: Ελέγχει τα settings πριν το αποθηκεύσει
    let pCapo = 0;
    const currentSettings = JSON.parse(localStorage.getItem('mnotes_settings') || "{}");
    if (currentSettings.autoSaveCapo === true) {
        pCapo = state.c || 0;
    } 
    
    // 1. OFFLINE FIRST: Ενημέρωση της τρέχουσας βιβλιοθήκης και αποθήκευση τοπικά!
    if (s) {
        s.personal_transpose = pTrans;
        s.personal_capo = pCapo;
        s.personal_notes = pNotes;
        s.has_override = true;
        
        let bandLocalKey = 'mnotes_band_' + currentGroupId;
        localStorage.setItem(bandLocalKey, JSON.stringify(window.library));
    }

    // 2. CLOUD SYNC: Αποστολή στο Supabase
    const payload = {
        user_id: currentUser.id,
        song_id: currentSongId,
        // ✨ ΔΙΟΡΘΩΣΗ 1: Αν είμαστε στα προσωπικά στέλνουμε NULL, όχι τη λέξη 'personal'
        group_id: currentGroupId === 'personal' ? null : currentGroupId,
        local_transpose: pTrans,
        local_capo: pCapo,
        personal_notes: pNotes 
    };

    if (navigator.onLine) {
        // ✨ ΔΙΟΡΘΩΣΗ 2: Χρήση του σωστού UNIQUE constraint της βάσης
        const { error } = await supabaseClient
            .from('personal_overrides')
            .upsert(payload, { onConflict: 'user_id, song_id' });

        if (error) {
            console.error("Override Save Error:", error);
            throw error;
        }
    } else {
        // Αν είμαστε offline, το βάζουμε στην ουρά για όταν έρθει το ίντερνετ
        addToSyncQueue('SAVE_OVERRIDE', payload);
        console.log("✈️ Είστε Offline. Οι ρυθμίσεις αποθηκεύτηκαν τοπικά.");
    }
}

/**
 * Ανάκτηση κοινών τραγουδιών (Master) ΚΑΙ των δικών σου Κλώνων για τη Μπάντα
 */
async function fetchBandSongs(groupId, lastSyncISO) {
    console.log(`📥 [FETCH] Ανάκτηση τραγουδιών μπάντας: ${groupId} ${lastSyncISO ? '(Μόνο Αλλαγές)' : '(Πλήρης)'}`);
    
    let query = supabaseClient
        .from('songs')
        .select('*')
        .eq('group_id', groupId)
        .order('title', { ascending: true });

    // ✨ Η ΝΕΑ ΠΡΟΣΘΗΚΗ: Αν υπάρχει ρολόι, φέρε μόνο τα πιο πρόσφατα!
    if (lastSyncISO) {
        query = query.gt('updated_at', lastSyncISO);
    }

    const { data, error } = await query;

    if (error) {
        console.error("❌ Error fetching band songs:", error);
        return [];
    }

    // ✨ ΦΙΛΤΡΑΡΙΣΜΑ ΑΣΦΑΛΕΙΑΣ: Κρατάμε τα Master ΚΑΙ μόνο τους δικούς ΜΑΣ κλώνους (ΑΘΙΚΤΟ!)
    const filteredData = data.filter(s => {
        if (!s.is_clone) return true; // Είναι Master, το κρατάμε
        if (s.is_clone && s.user_id === currentUser.id) return true; // Είναι δικός μου κλώνος, το κρατάμε
        return false; // Είναι κλώνος αλλουνού, το κόβουμε!
    });

    console.log(`📥 [FETCH] Βρέθηκαν ${filteredData.length} τραγούδια/αλλαγές για τη μπάντα (Master + Οι κλώνοι μου)`);
    return filteredData.map(s => ensureSongStructure(s));
}
/**
 * Κεντρική συνάρτηση αποθήκευσης τραγουδιού
 */
  async function saveSong() {
    console.log(`📝 [SAVE] Ξεκινάει η αποθήκευση. SongID: ${currentSongId || 'NEW'}, Context: ${currentGroupId}`);

    const titleInp = document.getElementById('inpTitle');
    const bodyInp = document.getElementById('inpBody');
    
    const title = titleInp ? titleInp.value.trim() : "";
    const body = bodyInp ? bodyInp.value.trim() : "";
    
    if (!title || !body) { 
        showToast(typeof t === 'function' ? t('msg_title_body_req') : "Απαιτείται τίτλος και περιεχόμενο", "error"); 
        return; 
    }

    const isNewSong = !currentSongId || currentSongId === 'null';
    if (isNewSong) {
        currentSongId = "s_" + Date.now() + Math.random().toString(16).slice(2);
    }

    const personalNotes = document.getElementById('inpPersonalNotes')?.value.trim() || "";
    const tagsRaw = document.getElementById('inpTags')?.value || "";
    const tagsArray = tagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

    const existingSong = library.find(x => x.id === currentSongId);
    const preservedConductorNotes = existingSong ? (existingSong.conductorNotes || "") : "";

    const songData = {
        id: currentSongId,
        title: title,
        artist: document.getElementById('inpArtist')?.value.trim() || "",
        key: document.getElementById('inpKey')?.value.trim() || "",
        body: body,
        intro: document.getElementById('inpIntro')?.value.trim() || "",
        interlude: document.getElementById('inpInter')?.value.trim() || "",
        conductorNotes: preservedConductorNotes, 
        notes: personalNotes,                    
        video: document.getElementById('inpVideo')?.value.trim() || "",
        tags: tagsArray,
        updated_at: new Date().toISOString()
    };

    try {
        if (currentGroupId === 'personal') {
            // ==========================================
            // 🏠 ΣΕΝΑΡΙΟ Α: ΠΡΟΣΩΠΙΚΗ ΒΙΒΛΙΟΘΗΚΗ
            // ==========================================
            if (typeof saveToLocalStorage === 'function') saveToLocalStorage(songData);
            if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && navigator.onLine) {
                await saveToCloud(songData, null);
                showToast("Αποθηκεύτηκε στο Cloud! ☁️");
            } else {
                showToast("Αποθηκεύτηκε Τοπικά! 💾");
            }
        } 
        else {
            // ==========================================
            // 🎸 ΣΕΝΑΡΙΟ Β: ΒΙΒΛΙΟΘΗΚΗ ΜΠΑΝΤΑΣ
            // ==========================================
            
            if (isNewSong) {
                // ΚΑΝΟΝΑΣ 1: ΑΠΑΓΟΡΕΥΕΤΑΙ Η ΔΗΜΙΟΥΡΓΙΑ ΝΕΟΥ ΤΡΑΓΟΥΔΙΟΥ ΣΤΗ ΜΠΑΝΤΑ (Ακόμα και για τον Owner)
                showToast("Τα νέα τραγούδια δημιουργούνται στην Προσωπική Βιβλιοθήκη και μετά κοινοποιούνται στη Μπάντα.", "error");
                return; // Σταματάμε την αποθήκευση
            }

            const hasBaseChanges = checkBaseChanges(songData, existingSong);
         
            if (hasBaseChanges) {
                // ΚΑΝΟΝΑΣ 2: Οποιαδήποτε αλλαγή στον "κορμό", πάει σε Κλώνο (χωρίς ερωτήσεις)
                await createOrUpdateClone(songData, existingSong);
            } else {
                // ΚΑΝΟΝΑΣ 3: Αλλαγή μόνο σε Τόνο/Σημειώσεις, πάει σε Overrides
                if (typeof saveAsOverride === 'function') await saveAsOverride({ ...songData });
                showToast("Προσωπικές ρυθμίσεις αποθηκεύτηκαν.");
            }
        }
         
        // --- UI & NAVIGATION REFRESH ---
        const targetId = currentSongId; 
        if (typeof loadContextData === 'function') await loadContextData(); 

        if (typeof displaySong === 'function') displaySong(targetId); 
        else if (typeof toViewer === 'function') toViewer(true);

        if (typeof switchView === 'function') switchView('view-details');
        
        lastSaveTimestamp = Date.now();
        console.log("🏁 [SAVE] Επιτυχής ολοκλήρωση.");

    } catch (err) {
        console.error("❌ [SAVE ERROR]:", err);
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
 * Υποστηρικτική: Αποθήκευση στο κλασικό LocalStorage (Οffline - First)
 */
function saveToLocalStorage(songData) {
    // ✨ ΝΕΟΣ, ΑΣΦΑΛΗΣ ΕΛΕΓΧΟΣ: Δεν κοιτάμε πώς μοιάζει το ID, 
    // απλά ψάχνουμε αν το έχουμε ήδη στη μνήμη μας!
    const existingIdx = library.findIndex(s => s.id === currentSongId);

    if (existingIdx > -1) {
        // Το βρήκαμε! Απλά το ενημερώνουμε (δεν του αλλάζουμε ID)
        library[existingIdx] = { ...library[existingIdx], ...songData, id: currentSongId };
        console.log(`[LOCAL STORAGE] Ενημερώθηκε το υπάρχον τραγούδι: ${currentSongId}`);
    } else {
        // Δεν υπάρχει! Είναι εντελώς νέο τραγούδι.
        const newSong = ensureSongStructure(songData);
        library.push(newSong);
        currentSongId = newSong.id;
        console.log(`[LOCAL STORAGE] Αποθηκεύτηκε νέο τραγούδι: ${currentSongId}`);
    }
    
    // Αποθήκευση της ανανεωμένης λίστας
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

/**
 * Αντιγράφει ένα τραγούδι στην Προσωπική Βιβλιοθήκη (Πολιτική Ιδιοκτησίας).
 * Τα mp3, pdf και οι σημειώσεις του leader ΔΕΝ μεταφέρονται.
 */
async function cloneToPersonal() {
    let sourceSong = library.find(s => s.id === currentSongId);
    
    if (!sourceSong) {
        showToast(typeof t === 'function' ? t('msg_song_not_found') : "Δεν βρέθηκε το τραγούδι", "error");
        return;
    }

    if (!currentUser) {
        showToast("Πρέπει να είστε συνδεδεμένος", "error");
        return;
    }

    let songToClone = { ...sourceSong };
    let isMasterChosen = false;

    // 1. Έλεγχος αν ο χρήστης έχει κάνει δικές του παρεμβάσεις
    const isClone = sourceSong.is_clone || !!sourceSong.parent_id;
    const hasOverrides = sourceSong.has_override || 
                         (sourceSong.personal_transpose && sourceSong.personal_transpose !== 0) || 
                         (sourceSong.personal_notes && sourceSong.personal_notes.trim() !== "");

    // 2. Ερώτηση στον χρήστη
    if (isClone || hasOverrides) {
        const wantsPersonal = confirm("Βρέθηκαν προσωπικές ρυθμίσεις/στίχοι για αυτό το τραγούδι.\n\n[ΟΚ] = Αντιγραφή της ΔΙΚΗΣ ΣΟΥ εκδοχής\n[ΑΚΥΡΩΣΗ] = Αντιγραφή του ΚΟΙΝΟΥ Master της μπάντας");
        
        if (!wantsPersonal) {
            isMasterChosen = true;
            console.log("📥 [CLONE TO PERSONAL] Ο χρήστης επέλεξε το Master της μπάντας.");
            
            if (isClone && sourceSong.parent_id) {
                let master = window.library.find(x => x.id === sourceSong.parent_id);
                if (!master && navigator.onLine && typeof supabaseClient !== 'undefined') {
                    try {
                        const { data } = await supabaseClient.from('songs').select('*').eq('id', sourceSong.parent_id).single();
                        if (data) master = typeof ensureSongStructure === 'function' ? ensureSongStructure(data) : data;
                    } catch (e) { console.error("❌ Σφάλμα ανάκτησης Master:", e); }
                }
                if (master) songToClone = { ...master };
            }
        } else {
            console.log("📥 [CLONE TO PERSONAL] Ο χρήστης επέλεξε τη Δική του εκδοχή.");
        }
    } else {
        isMasterChosen = true; // Αν δεν έχει κάνει αλλαγές, παίρνει by default τον κορμό της μπάντας
    }

    // 3. Προετοιμασία του Προσωπικού Τραγουδιού (Εφαρμογή Πολιτικής)
    const newId = "s_" + Date.now() + Math.random().toString(16).slice(2);
    
    // ✨ ΕΔΩ ΕΙΝΑΙ Η ΠΟΛΙΤΙΚΗ ΜΑΣ: 
    // Οι σημειώσεις του Leader ΔΙΑΓΡΑΦΟΝΤΑΙ. Ο BandMate κρατάει ΜΟΝΟ τις δικές του (αν επέλεξε το My Version).
    const finalNotes = isMasterChosen ? "" : (sourceSong.personal_notes || "");
    const titleSuffix = isMasterChosen ? " (Band Master)" : " (My Version)";
    // Αν το sourceSong είναι ήδη κλώνος, το DNA του είναι το parent_id. 
    // Αν είναι το Master της μπάντας, το DNA του είναι το δικό του id.
    const originalBandSongId = sourceSong.parent_id || sourceSong.id;
    const clonedSong = {
           id: newId,
        title: songToClone.title + titleSuffix, 
        artist: songToClone.artist,
        body: songToClone.body,
        key: songToClone.key,
        intro: songToClone.intro,
        interlude: songToClone.interlude,
        video: songToClone.video || "", 
        tags: songToClone.tags || [],
        user_id: currentUser.id,
        group_id: null,        
        conductorNotes: "",   // ✨ ΝΕΟ: Καθαρίζουμε τις οδηγίες του Μαέστρου (IP Protection)
        notes: finalNotes,    // ✅ Οι δικές σου σημειώσεις
        recordings: [],       
        attachments: [],      
        is_clone: true,      
        parent_id: originalBandSongId
    };

    // 4. Αποθήκευση
    try {
        if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            const safePayload = typeof window.sanitizeForDatabase === 'function' ? window.sanitizeForDatabase(clonedSong, currentUser.id, null) : clonedSong;
           
           // 🚨 Η ΠΑΓΙΔΑ ΜΑΣ ΕΔΩ:
            console.log("🚨 [ΠΑΓΙΔΑ - CLONE] Πάω να ανεβάσω τον κλώνο:", clonedSong.title); 
            console.trace("🔍 Ιχνηλάτηση κλήσης Clone:");
           
           const { error } = await supabaseClient.from('songs').insert([safePayload]);
            if (error) throw error;
        } else {
            let localData = JSON.parse(localStorage.getItem('mnotes_data') || "[]");
            localData.push(clonedSong);
            localStorage.setItem('mnotes_data', JSON.stringify(localData));
        }

        showToast("Το τραγούδι προστέθηκε στα Προσωπικά σας! 🏠");
        
        if (confirm("Το τραγούδι αντιγράφηκε επιτυχώς! Θέλετε να μεταβείτε στην Προσωπική σας Βιβλιοθήκη τώρα;")) {
            if (typeof switchContext === 'function') await switchContext('personal');
        }

    } catch (err) {
        console.error("❌ [CLONE ERROR]:", err);
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
        
        // ✨ Πιάνει είτε το παλιό είτε το νέο, και κρατάει το ISO format
        updated_at: song.updated_at || song.updatedAt || new Date().toISOString(), 
        
        group_id: song.group_id || null,
        parent_id: song.parent_id || null,
        is_clone: !!song.is_clone,
        is_deleted: !!song.is_deleted, 
        conductorNotes: song.conductorNotes || "", 
        recordings: Array.isArray(song.recordings) ? song.recordings : [],
        attachments: Array.isArray(song.attachments) ? song.attachments : [],
        
        //  Διατήρηση των Overrides της Μπάντας (Offline Mode)
        personal_notes: song.personal_notes || "",
        personal_transpose: song.personal_transpose || 0,
        personal_capo: song.personal_capo || 0,
        has_override: !!song.has_override
    };
    
    // Δίνουμε πίσω ΚΑΙ το camelCase 
    // σε περίπτωση που κάποιο παλιό σου script στο UI ψάχνει ακόμα το "updatedAt"
    cleaned.updatedAt = cleaned.updated_at; 

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

         // 🚨 Η ΠΑΓΙΔΑ ΜΑΣ
        console.log(`🚨 [SYNC QUEUE] Επαναφορά/Ανέβασμα τραγουδιού από την ουρά:`, item.data.title || item.data.id);            
           
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

    // ✨ Νέο ID (σε περίπτωση που είναι απλή αντιγραφή/νέο τραγούδι)
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

    // --- ✨ ΝΕΑ ΛΟΓΙΚΗ: ΕΛΕΓΧΟΣ ΓΙΑ ΑΝΤΙΚΑΤΑΣΤΑΣΗ MASTER ---
    
    // 1. Βρίσκουμε τον ΠΡΑΓΜΑΤΙΚΟ ρόλο μας στη μπάντα-στόχο
    const targetBandInfo = typeof myGroups !== 'undefined' ? myGroups.find(g => g.group_id === targetContext) : null;
    const roleInTargetBand = targetBandInfo ? targetBandInfo.role : 'member';
    const isGodInTarget = ['admin', 'owner', 'maestro'].includes(roleInTargetBand);

    // 2. Αν είμαστε Θεοί στη μπάντα-στόχο ΚΑΙ το τραγούδι είναι κλώνος (έχει parent_id)
    if (targetContext !== 'personal' && isGodInTarget && sourceSong.parent_id) {
        
        // Ψάχνουμε στα "συρτάρια" της μπάντας να βρούμε τον "Πατέρα" (Master)
        const bandSongs = JSON.parse(localStorage.getItem(`mnotes_band_${targetContext}`) || "[]");
        const existingMaster = bandSongs.find(s => s.id === sourceSong.parent_id && !s.is_clone);

        if (existingMaster) {
            // Ρωτάμε τον Θεό αν θέλει να το πατήσει
            if (confirm(`Το τραγούδι "${sourceSong.title}" υπάρχει ήδη ως κεντρικό (Master) στη μπάντα.\n\nΘέλετε να το ΑΝΤΙΚΑΤΑΣΤΗΣΕΤΕ με τη δική σας προσωπική έκδοση;`)) {
                
                // Το "κόλπο": Δίνουμε στο νέο τραγούδι το ID του παλιού!
                newSongData.id = existingMaster.id; 
                console.log("🔄 [TRANSFER] Επιλέχθηκε αντικατάσταση Master.");
            }
        }
    }
    // --------------------------------------------------------

    try {
        // Χρησιμοποιούμε τον πραγματικό ρόλο για να δούμε αν θα πάει για Proposal
        if (targetContext !== 'personal' && !isGodInTarget) {
            await submitProposal(newSongData, targetContext);
            showToast("Η πρόταση στάλθηκε στον Maestro! 📩");
        } else {
            // ✨ ΑΛΛΑΓΗ: Βάζουμε upsert αντί για insert!
            // Γιατί; Αν έχει νέο ID (νέο τραγούδι) θα λειτουργήσει σαν insert. 
            // Αν του δώσαμε το ID του Master, θα κάνει update (overwrite) χωρίς να χτυπήσει error η βάση!
            const { error } = await supabaseClient.from('songs').upsert([newSongData]);
            if (error) throw error;
            
            await migrateAttachmentsToOverrides(sourceSong, targetContext);
            showToast(newSongData.id === newId ? "Αντιγράφηκε επιτυχώς στη Μπάντα! ✅" : "Το κεντρικό τραγούδι της μπάντας ενημερώθηκε! 🔄");
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

// --- ACTIONS ---
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

        // ✨ 1. ΕΛΕΓΧΟΣ ΑΝ ΕΧΕΙ ΛΗΞΕΙ ΤΟ ΙΔΙΟ ΤΟ ΚΟΥΠΟΝΙ ΗΜΕΡΟΛΟΓΙΑΚΑ
        if (codeObj.expires_at) {
            const codeExpiration = new Date(codeObj.expires_at);
            const now = new Date();
            if (now > codeExpiration) {
                alert("Λυπούμαστε, αυτός ο κωδικός προσφοράς έχει λήξει!");
                return;
            }
        }

        let currentUnlocks = userProfile.special_unlocks || {};

        if (codeObj.reward_type === 'extra_bands') {
            const currentExtra = currentUnlocks.extra_bands || 0;
            currentUnlocks.extra_bands = currentExtra + parseInt(codeObj.reward_value, 10);
            if (typeof showToast === 'function') showToast(`Συγχαρητήρια! Κερδίσατε δικαίωμα για +${codeObj.reward_value} μπάντα! 🎉`);
        } 
        else if (codeObj.reward_type === 'tier_upgrade') {
            // ✨ 2. ΔΙΧΤΥ ΑΣΦΑΛΕΙΑΣ ΓΙΑ ΠΑΛΙΟΥΣ ΚΩΔΙΚΟΥΣ (solo_pro -> solo_plus)
            let upgradedTier = codeObj.reward_value;
            if (upgradedTier === 'solo_pro' || upgradedTier === 'pro') {
                upgradedTier = 'solo_plus';
                console.log("♻️ [PROMO] Ο παλιός (ή λάθος) κωδικός μετατράπηκε αυτόματα σε solo_plus.");
            }

            userProfile.subscription_tier = upgradedTier;
            let updatePayload = { subscription_tier: upgradedTier };

            // ✨ 3. ΕΛΕΓΧΟΣ ΗΜΕΡΟΜΗΝΙΑΣ ΛΗΞΗΣ ΤΟΥ ΠΑΚΕΤΟΥ (Time-limited Promos)
            if (codeObj.duration_days && parseInt(codeObj.duration_days, 10) > 0) {
                 let expDate = new Date();
                 expDate.setDate(expDate.getDate() + parseInt(codeObj.duration_days, 10)); // Προσθέτει τις μέρες
                 updatePayload.tier_expires_at = expDate.toISOString();
                 console.log(`⏱️ [PROMO] Το πακέτο θα λήξει στις: ${expDate.toLocaleDateString()}`);
            } else {
                 // Μόνιμο δώρο, καθαρίζουμε τυχόν παλιά ημερομηνία λήξης που είχε ο χρήστης
                 updatePayload.tier_expires_at = null;
            }

            // Αποθηκεύουμε το νέο tier (και τη λήξη του) στη Supabase
            await supabaseClient.from('profiles').update(updatePayload).eq('id', currentUser.id);
            
            // Ενημερώνουμε τον χρήστη ανάλογα με τον τύπο του δώρου!
            if (typeof showToast === 'function') {
                if (codeObj.duration_days && parseInt(codeObj.duration_days, 10) > 0) {
                    showToast(`Το προφίλ σας αναβαθμίστηκε σε ${upgradedTier} για ${codeObj.duration_days} ημέρες! ⏱️`);
                } else {
                    showToast(`Συγχαρητήρια! Το προφίλ σας αναβαθμίστηκε σε ${upgradedTier}! 🚀`);
                }
            }
        }
        else if (codeObj.reward_type === 'extra_storage') {
            const currentStorage = currentUnlocks.extra_storage_mb || 0;
            currentUnlocks.extra_storage_mb = currentStorage + parseInt(codeObj.reward_value, 10);
            if (typeof showToast === 'function') showToast(`Κερδίσατε +${codeObj.reward_value}MB έξτρα χώρο στο Cloud! 💾`);
        }
        else if (codeObj.reward_type === 'rhythm_credits') {
            const currentCredits = currentUnlocks.rhythm_credits || 0;
            currentUnlocks.rhythm_credits = currentCredits + parseInt(codeObj.reward_value, 10);
            if (typeof showToast === 'function') showToast(`Κερδίσατε ${codeObj.reward_value} δωρεάν ρυθμούς (Beats) για το Drum Store! 🥁`);
        }

        // Αποθήκευση των νέων unlocks στο προφίλ του χρήστη (αν υπήρχαν)
        await supabaseClient.from('profiles').update({ special_unlocks: currentUnlocks }).eq('id', currentUser.id);
        
        // Σήμανση του κωδικού ως χρησιμοποιημένου
        await supabaseClient.from('gift_codes').update({ 
            is_used: true, 
            used_by: currentUser.id, 
            used_at: new Date().toISOString() 
        }).eq('id', codeObj.id);
        
        // Ενημέρωση της τοπικής μνήμης και του UI
        userProfile.special_unlocks = currentUnlocks;
        if (typeof updateUIForRole === 'function') updateUIForRole();

    } catch (err) {
        console.error("Gift Code Error:", err);
        alert("Προέκυψε σφάλμα κατά την εξαργύρωση.");
    }
}
/**
 * Καθαρή διαγραφή: Soft-delete στο Cloud, Hard-delete τοπικά.
 */
async function deleteCurrentSong() {
    if (!currentSongId) return;
   
    // Πρώτα βρίσκουμε το τραγούδι για να ξέρουμε τι είναι (Master ή Clone)
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    // --- ΑΝΑΓΝΩΡΙΣΗ ΚΑΤΑΣΤΑΣΗΣ & ΡΟΛΩΝ ---
    const isMyClone = s.is_clone && s.user_id === currentUser?.id;
    const isBandMaster = currentGroupId !== 'personal' && !s.is_clone;
    // Θεωρούμε "God" τον owner, admin και τον maestro
    const isGod = currentRole === 'owner' || currentRole === 'admin' || currentRole === 'maestro';

    // --- 1. ΕΛΕΓΧΟΣ ΔΙΚΑΙΩΜΑΤΩΝ ---
    if (isBandMaster && !isGod) {
        showToast("Δεν έχετε δικαίωμα διαγραφής του κεντρικού τραγουδιού.", "error");
        return;
    }
    if (currentGroupId !== 'personal' && s.is_clone && !isMyClone) {
        showToast("Δεν μπορείτε να διαγράψετε τον κλώνο άλλου χρήστη.", "error");
        return;
    }
    
    // --- 2. ΔΥΝΑΜΙΚΑ ΜΗΝΥΜΑΤΑ ΕΠΙΒΕΒΑΙΩΣΗΣ ---
    let confirmMsg = `Οριστική διαγραφή του "${s.title}";`;
    
    if (isBandMaster) {
        // Η κρίσιμη προειδοποίηση για τους God Users!
        confirmMsg = `⚠️ ΚΡΙΣΙΜΗ ΠΡΟΕΙΔΟΠΟΙΗΣΗ ⚠️\n\nΠρόκειται να διαγράψετε το κεντρικό τραγούδι "${s.title}" από την ΚΟΙΝΗ βιβλιοθήκη της Μπάντας!\n\nΑυτό θα αφαιρέσει το τραγούδι από όλα τα μέλη. Είστε ΑΠΟΛΥΤΑ σίγουροι;`;
    } else if (isMyClone) {
        confirmMsg = `Οριστική διαγραφή του προσωπικού σας κλώνου για το "${s.title}";`;
    }

    if (!confirm(confirmMsg)) return;

    // --- 3. ΕΚΤΕΛΕΣΗ ΔΙΑΓΡΑΦΗΣ (Ο δικός σου κώδικας, άθικτος) ---
    try {
        console.log(`🗑️ [DELETE] Εκκίνηση διαγραφής για: ${s.title}`);

        // 1. Ενημέρωση Cloud (Soft Delete)
        if (canUserPerform('USE_SUPABASE') && !String(currentSongId).startsWith('demo')) {
             const payload = { is_deleted: true, updated_at: new Date().toISOString() };
             
             if (navigator.onLine) {
                 await supabaseClient.from('songs').update(payload).eq('id', currentSongId);
                 await supabaseClient.from('personal_overrides').delete().eq('song_id', currentSongId);
             } else {
                 // Αν είμαστε offline, μπαίνει στην ουρά για να διαγραφεί όταν συνδεθούμε!
                 addToSyncQueue('SAVE_SONG', { id: currentSongId, ...payload });
             }
        }

        // 2. Τοπική Διαγραφή (Hard Delete)
        let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : 'mnotes_band_' + currentGroupId;
        window.library = window.library.filter(x => x.id !== currentSongId);
        localStorage.setItem(storageKey, JSON.stringify(window.library));

        currentSongId = null;
        renderSidebar(); 
        
        // Ενημερώνουμε το Toast ανάλογα με το τι σβήσαμε
        showToast(isBandMaster ? "Το κεντρικό τραγούδι διαγράφηκε από τη μπάντα." : "Το τραγούδι διαγράφηκε.");

        if (library.length > 0) loadSong(library[0].id);
        else if (typeof toEditor === 'function') toEditor();

    } catch (err) {
        console.error("❌ [DELETE ERROR]:", err);
        showToast("Σφάλμα κατά τη διαγραφή", "error");
    }
}
// ==========================================
// 🛡️ ΑΣΠΙΔΑ EDITOR (Για αποφυγή απώλειας δεδομένων)
// ==========================================

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const editorEl = document.getElementById('view-editor');
        
        // 1. Αν είμαστε σε Editor, ΜΗΝ κάνεις sync.
        if (editorEl && editorEl.classList.contains('active-view')) {
            console.log("🛡️ Auto-Sync Blocked: Ο χρήστης επεξεργάζεται τραγούδι.");
            return;
        } 
        
        // 2. Αν σώσαμε κάτι πριν από λιγότερο από 5 δευτερόλεπτα, ΜΗΝ κάνεις sync (αποφυγή λούπας).
        if (Date.now() - lastSaveTimestamp < 5000) {
            console.log("🛡️ Auto-Sync Blocked: Πρόσφατη αποθήκευση.");
            return;
        }

        console.log("🔄 Auto-Sync: Φόρτωση νέων δεδομένων από Cloud...");
        if (typeof loadContextData === 'function') loadContextData();
    }
});
// Ελέγχει αν έχουν γίνει πραγματικές αλλαγές στον "κορμό" του τραγουδιού
function checkBaseChanges(newData, oldData) {
    if (!oldData) return true;
    
    // ✨ ΚΑΘΑΡΙΣΜΟΣ: Αγνοεί αόρατα κενά και διαφορές στις αλλαγές γραμμής (Windows vs Mac)
    const normalize = (str) => (str || "").replace(/\r\n/g, '\n').trim();
    
    return normalize(newData.body) !== normalize(oldData.body) || 
           normalize(newData.title) !== normalize(oldData.title) || 
           normalize(newData.key) !== normalize(oldData.key);
}

// Δημιουργεί ή ενημερώνει τον μοναδικό Προσωπικό Κλώνο ΜΕΣΑ στη Μπάντα
async function createOrUpdateClone(songData, originalSong) {
    console.log(`[CLONE] Δημιουργία ή ενημέρωση κλώνου για τη μπάντα: ${currentGroupId}`);
    
    // 1. ✨ ΕΞΥΠΝΟΣ ΕΛΕΓΧΟΣ: Βρίσκουμε αν υπάρχει ΗΔΗ κλώνος για αυτό το Master
    let existingClone = null;
    if (originalSong.is_clone) {
        existingClone = originalSong; // Είμαστε ήδη πάνω στον κλώνο, κάνουμε Update
    } else {
        // Είμαστε στο Master. Ψάχνουμε στη βιβλιοθήκη αν έχουμε ΦΤΙΑΞΕΙ ήδη κλώνο στο παρελθόν!
        existingClone = library.find(s => s.is_clone && s.parent_id === originalSong.id && s.user_id === currentUser?.id);
    }

    // Αν υπάρχει κλώνος κρατάμε το ID του (για Update), αλλιώς φτιάχνουμε ΕΝΑ νέο.
    let cloneId = existingClone ? existingClone.id : "s_" + Date.now() + Math.random().toString(16).slice(2);
    let parentId = existingClone ? existingClone.parent_id : originalSong.id;

    const clonedSong = {
        ...songData,
        id: cloneId,
        group_id: currentGroupId, 
        parent_id: parentId,
        is_clone: true,
        user_id: currentUser.id,  
        updated_at: new Date().toISOString() 
    };

    // 2. Τοπική Αποθήκευση
    let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : 'mnotes_band_' + currentGroupId;
    let localData = JSON.parse(localStorage.getItem(storageKey) || "[]");
    
    let existingIdx = localData.findIndex(s => s.id === cloneId);
    if (existingIdx > -1) localData[existingIdx] = clonedSong;
    else localData.push(clonedSong);
    
    localStorage.setItem(storageKey, JSON.stringify(localData));
    window.library = localData; 
    library = window.library;

    // 3. ✨ AWAIT CLOUD SYNC: Περιμένουμε ΥΠΟΧΡΕΩΤΙΚΑ να σωθεί, για να μην το διαγράψει το Auto-Sync
    if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && currentUser) {
        const safePayload = window.sanitizeForDatabase(clonedSong, currentUser.id, currentGroupId);
        safePayload.parent_id = parentId;
        safePayload.is_clone = true;

        if (navigator.onLine) {
            // Προστέθηκε το 'await' !
            const { error } = await supabaseClient.from('songs').upsert(safePayload);
            if (error) console.error("❌ [CLONE] Cloud Sync Failed:", error);
            else console.log("☁️ [CLONE] Αποθηκεύτηκε επιτυχώς στο Cloud της μπάντας.");
        } else {
            addToSyncQueue('SAVE_SONG', safePayload);
        }
    }

    currentSongId = cloneId;

    // 4. Ανανέωση UI
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof loadSong === 'function') loadSong(cloneId);
    
    showToast(typeof t === 'function' ? t('msg_clone_created') : "Η προσωπική σας εκδοχή αποθηκεύτηκε! 🧬");
}
/**
 * Διαγράφει τον προσωπικό κλώνο και επιστρέφει στο αρχικό τραγούδι της μπάντας
 */
async function revertClone(cloneSong) {
    if (!confirm(typeof t === 'function' ? t('msg_confirm_revert') : "Είστε σίγουροι; Οι δικοί σας στίχοι/συγχορδίες θα διαγραφούν και θα επιστρέψετε στην κοινή έκδοση της μπάντας.")) return;

    try {
        if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            // Εδώ το hard delete είναι σωστό, γιατί είναι απλά ένας κλώνος (δεν επηρεάζει άλλους)
            await supabaseClient.from('songs').delete().eq('id', cloneSong.id);
        }

        // ✨ ΔΙΟΡΘΩΣΗ: Πρέπει να σβηστεί από το ΣΩΣΤΟ storage (της Μπάντας), όχι πάντα από τα Προσωπικά!
        let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : 'mnotes_band_' + currentGroupId;
        let localData = JSON.parse(localStorage.getItem(storageKey) || "[]");
        
        localData = localData.filter(s => s.id !== cloneSong.id);
        localStorage.setItem(storageKey, JSON.stringify(localData));
        
        window.library = localData;
        library = window.library;

        showToast(typeof t === 'function' ? t('msg_clone_reverted') : "Ο κλώνος ακυρώθηκε. Επιστροφή στο κοινό.");
        
        if (cloneSong.parent_id) {
            currentSongId = cloneSong.parent_id;
            await switchContext(currentGroupId); 
        } else {
            currentSongId = null;
            if (typeof toViewer === 'function') toViewer(true);
        }
    } catch (err) {
        console.error("Revert Error:", err);
        showToast("Σφάλμα κατά την ακύρωση.", "error");
    }
}
/**
 * ΜΟΝΟΔΡΟΜΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ: Band -> Personal Editor
 * Φορτώνει τα δεδομένα της Μπάντας στον Editor του χρήστη για έλεγχο.
 */
async function syncEditorFromBand() {
    if (currentGroupId !== 'personal' || !currentSongId) return;

    try {
        const localSong = library.find(s => s.id === currentSongId);
        if (!localSong) return;

        // ✨ DNA SEARCH: Ψάχνουμε τον "πατέρα" στη μπάντα, όχι το ID του κλώνου
        const searchId = localSong.parent_id || currentSongId;

        showToast("Αναζήτηση ενημερώσεων στη Μπάντα... 🔍");

        const { data: masterSong, error } = await supabaseClient
            .from('songs')
            .select('*')
            .eq('id', searchId)
            .not('group_id', 'is', null)
            .maybeSingle();

        if (error || !masterSong) {
            showToast("Δεν βρέθηκε πηγή συγχρονισμού στη Μπάντα.", "error");
            return;
        }

        // Σύγκριση & Φόρτωση (όπως το είχες, αλλά με το σωστό masterSong)
        const localTime = new Date(localSong.updated_at || 0).getTime();
        const masterTime = new Date(masterSong.updated_at).getTime();

        let confirmMsg = `🔄 Βρέθηκε νέα έκδοση στη Μπάντα. Θέλετε να τη φορτώσετε στον Editor;`;
        if (localTime > masterTime) {
            confirmMsg = `⚠️ ΠΡΟΣΟΧΗ: Το δικό σου τραγούδι είναι πιο πρόσφατο.\n\nΘέλεις να το αντικαταστήσεις με την έκδοση της Μπάντας;`;
        }

        if (!confirm(confirmMsg)) return;

        document.getElementById('inpTitle').value = masterSong.title;
        document.getElementById('inpArtist').value = masterSong.artist || "";
        document.getElementById('inpKey').value = masterSong.key || "";
        document.getElementById('inpBody').value = masterSong.body || "";
        document.getElementById('inpIntro').value = masterSong.intro || "";
        document.getElementById('inpInter').value = masterSong.interlude || "";
        
        showToast("Τα δεδομένα φορτώθηκαν! Πατήστε Αποθήκευση για οριστικοποίηση. ✅");

    } catch (err) {
        console.error("❌ Sync Editor Error:", err);
        showToast("Σφάλμα κατά τον συγχρονισμό", "error");
    }
}
/**
 * Μεταβιβάζει την ηγεσία της μπάντας και τα δικαιώματα των αρχείων στον νέο Leader.
 * @param {string} targetUserId - Το ID του μέλους που αναλαμβάνει.
 */
async function transferBandLeadership(targetUserId) {
    // 1. Βασικοί έλεγχοι
    if (currentRole !== 'leader' && currentRole !== 'owner') {
        showToast("Μόνο ο Leader μπορεί να μεταβιβάσει την ηγεσία.", "error");
        return;
    }

    const successor = bandMembers.find(m => m.user_id === targetUserId);
    if (!successor) {
        showToast("Ο διάδοχος πρέπει να είναι μέλος της μπάντας.", "error");
        return;
    }

    if (!confirm(`👑 ΜΕΤΑΒΙΒΑΣΗ ΗΓΕΣΙΑΣ\n\nΘα παραδώσετε την ηγεσία στον/στην ${successor.profiles.full_name}.\nΤα αρχεία σας θα παραμείνουν στη μπάντα υπό τη διαχείριση του νέου Leader.\n\nΕίστε σίγουροι;`)) return;

    try {
        showToast("Εκτέλεση μεταβίβασης...", "info");

        // Α. Ενημέρωση Ρόλων στη Βάση
        await supabaseClient.from('group_members').update({ role: 'leader' }).eq('group_id', currentGroupId).eq('user_id', targetUserId);
        await supabaseClient.from('group_members').update({ role: 'member' }).eq('group_id', currentGroupId).eq('user_id', currentUser.id);
        await supabaseClient.from('groups').update({ owner_id: targetUserId }).eq('id', currentGroupId);

        // Β. Μεταβίβαση "Κλειδιών" Αρχείων (Shared Ownership)
        // Παίρνουμε όλα τα αρχεία που έχει ο τρέχων Leader για αυτή τη μπάντα
        const { data: currentAssets } = await supabaseClient
            .from('user_assets')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('group_id', currentGroupId);

        if (currentAssets && currentAssets.length > 0) {
            // Δημιουργούμε νέες εγγραφές για τον διάδοχο που δείχνουν στα ΙΔΙΑ αρχεία
            const sharedAssets = currentAssets.map(asset => ({
                user_id: targetUserId,
                group_id: currentGroupId,
                custom_name: asset.custom_name,
                file_url: asset.file_url,
                file_type: asset.file_type
            }));

            const { error: assetErr } = await supabaseClient.from('user_assets').insert(sharedAssets);
            if (assetErr) console.error("Asset transfer error:", assetErr);
        }

        showToast("Η μεταβίβαση ολοκληρώθηκε! 🤝");
        setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
        console.error("Transfer error:", err);
        showToast("Σφάλμα κατά τη μεταβίβαση.", "error");
    }
}
