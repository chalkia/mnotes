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
        label: "Solo Free",
        billing: "Free",
        canCloudSync: false, 
        useSupabase: false, 
        useDrive: false, 
        canJoinBands: false,       // 🔒 Μόνο ως Viewer σε Ensemble
        maxBandsOwned: 0,
        maxSetlists: 0, 
        canSaveAttachments: false, 
        hasAdvancedDrums: false,   
        canPrint: false,           
        storageLimitMB: 0
    },
    solo_pro: { 
        label: "Solo Pro",
        billing: "One-Time",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        maxSetlists: 1, 
        canJoinBands: false,       // 🔒 Αποκλειστικά Solo
        maxBandsOwned: 0,          
        canSaveAttachments: true,  
        hasAdvancedDrums: true,    
        canPrint: true,            
        storageLimitMB: 50         
    },
    band_mate: { 
        label: "BandMate",
        billing: "Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        maxSetlists: 50, 
        canJoinBands: true,        // ✅ Μπαίνει παντού ελεύθερα
        maxBandsOwned: 0,          
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB: 500        
    },
    band_leader: { 
        label: "BandLeader",
        billing: "Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        maxSetlists: 150, 
        canJoinBands: true, 
        maxBandsOwned: 1,          
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB: 1500 
    },
    band_maestro: { 
        label: "BandMaestro",
        billing: "Quarterly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false,
        maxSetlists: 500, 
        canJoinBands: true, 
        maxBandsOwned: 5,          
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB: 4500
    },
    ensemble: { 
        label: "Ensemble",
        billing: "Yearly",
        canCloudSync: true, 
        useSupabase: true, 
        useDrive: false, 
        canJoinBands: true, 
        maxBandsOwned: 1,
        maxSetlists: 1000,
        canSaveAttachments: true, 
        hasAdvancedDrums: true, 
        canPrint: true,
        storageLimitMB: 4500,
        // --- ENSEMBLE SPECIFIC LIMITS ---
        allowsDelegatedAdmin: true, // ✅ Επιτρέπει σε άλλον να είναι ο Μαέστρος
        includedBandMates: 9,       // ✅ 9 προπληρωμένες θέσεις Premium (συν τον Admin = 10)
        allowsFreeViewers: true     // ✅ Επιτρέπει Solo Free χρήστες
    }
};

// --- Ο ΠΟΡΤΙΕΡΗΣ (Ελεγκτής Δικαιωμάτων) v2.2 --- Ισως ΧΡΕΙΑΖΕΤΑΙ ΠΡΟΣΘΗΚΗ ΤΟΥ ΕΝSEMBLE
function canUserPerform (action, currentCount=0) {
    let tierKey = 'solo_free';
    
    if (typeof userProfile !== 'undefined' && userProfile && userProfile.subscription_tier) {
        tierKey = userProfile.subscription_tier;
    } else if (typeof currentTier !== 'undefined' && currentTier) {
        tierKey = currentTier;
    }

    const tierMapping = {
        'free': 'solo_free',
        'solo': 'solo_pro',
        'member': 'band_mate',
        'owner': 'band_leader',
        'maestro': 'band_maestro'
    };

    if (tierMapping[tierKey]) {
        tierKey = tierMapping[tierKey];
    }

    if (!TIER_CONFIG || !TIER_CONFIG[tierKey]) {
        tierKey = 'solo_free';
    }

    const tierData = TIER_CONFIG[tierKey];

    switch(action) {
        case 'USE_SUPABASE':
        case 'CLOUD_SYNC':
            return tierData.canCloudSync;
        case 'JOIN_BANDS':
            return tierData.canJoinBands;
        case 'SAVE_ATTACHMENTS':
            return tierData.canSaveAttachments;
        case 'ADVANCED_DRUMS':
            return tierData.hasAdvancedDrums;
        case 'PRINT':
            return tierData.canPrint;
        case 'DELEGATE_ADMIN':
            return tierData.allowsDelegatedAdmin || false;
        case 'CREATE_SETLIST':
            // Το currentCount θα είναι ο αριθμός των CUSTOM λιστών που έχει ήδη φτιάξει ο χρήστης
            return currentCount < tierData.maxSetlists;
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
    try {
        // 1. Προφίλ & Tier
        const { data: profile, error: pError } = await supabaseClient
            .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

        if (pError && pError.code !== 'PGRST116') throw pError;

        if (profile) {
            userProfile = profile;
            userProfile.subscription_tier = profile.subscription_tier.toLowerCase();
        } else {
            const newProfile = { id: currentUser.id, email: currentUser.email, subscription_tier: 'free' };
            await supabaseClient.from('profiles').insert([newProfile]);
            userProfile = newProfile;
        }

        // ✨ ΜΕΤΑΚΙΝΗΣΗ ΕΔΩ: Ενημερώνουμε το UI και βγάζουμε το Toast ΑΜΕΣΩΣ μόλις μάθουμε το Tier
        // Πριν ξεκινήσει ο βαρύς συγχρονισμός δεδομένων.
        if (typeof refreshUIByTier === 'function') refreshUIByTier();

        if (typeof showToast === 'function') {
            const tierName = TIER_CONFIG[userProfile.subscription_tier]?.label || "Free";
            showToast(`Σύνδεση ως ${tierName} ✅`);
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

        // Ενημέρωση UI Dropdown
        updateGroupDropdown();

        // 3. Αρχικοποίηση Context (Προσωπική Βιβλιοθήκη)
        // Αυτό θα καλέσει τη loadContextData και θα ξεκινήσει το Sync
        await switchContext('personal');

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

    // ✨ ΠΡΟΣΘΗΚΗ: Φόρτωση λιστών πριν τα δεδομένα, ώστε να εμφανίζεται η σωστή!
    if (typeof initSetlists === 'function') await initSetlists();

    await loadContextData();
    updateUIForRole();
    
    if (typeof loadBandDashboard === 'function') {
        loadBandDashboard();
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
      if (currentGroupId !== 'personal' && (currentRole !== 'admin' && currentRole !== 'owner')) {
        console.log("🔒 [UI] Περιορισμός Δικαιωμάτων: Απόκρυψη κουμπιών Add/Delete για το απλό μέλος.");
        if(btnDel) btnDel.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
       } else {
        if(btnDel) btnDel.style.display = 'inline-block';
        if(btnAdd) btnAdd.style.display = 'flex'; // ή inline-block ανάλογα με το αρχικό σου CSS
       }
    
    // 3. Ενημέρωση του Header (Τίτλος Μπάντας vs My Songs)
    if (typeof refreshHeaderUI === 'function') refreshHeaderUI();
}


/* =========================================
   DATA LOADING & SYNC (OFFLINE-FIRST)
   ========================================= */
async function loadContextData() {
   if (isSyncing) {
        console.warn("⏳ [SYNC] Ήδη σε εξέλιξη. Ακύρωση διπλής κλήσης.");
        return; 
    }
    isSyncing = true; // Κλείδωμα
    console.log(`🔍 [SYNC] Εκκίνηση συγχρονισμού για Context: ${currentGroupId}`);
    const listEl = document.getElementById('songList');
    if(listEl) listEl.innerHTML = '<div class="loading-msg">Συγχρονισμός...</div>';

    try {
        let currentLibrary = []; 
        let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : `mnotes_band_${currentGroupId}`;

        // --- ΒΗΜΑ 1: ΦΟΡΤΩΣΗ ΚΑΙ ΚΑΘΑΡΙΣΜΟΣ ΤΟΠΙΚΗΣ ΜΝΗΜΗΣ ---
        const localDataRaw = localStorage.getItem(storageKey);
        if (localDataRaw) {
            let parsed = JSON.parse(localDataRaw);
            
            // STRICT ISOLATION: Κρατάμε μόνο όσα ανήκουν πραγματικά σε αυτό το context
            currentLibrary = parsed.filter(s => {
                if (currentGroupId === 'personal') return !s.group_id; // Στα προσωπικά ΔΕΝ έχει group_id
                return s.group_id === currentGroupId; // Στη μπάντα ΠΡΕΠΕΙ να έχει ΑΥΤΟ το group_id
            }).map(ensureSongStructure);
        }

        // --- ΒΗΜΑ 2: CLOUD SYNC ---
        if (navigator.onLine && typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            if (typeof processSyncQueue === 'function') await processSyncQueue();

            if (currentGroupId === 'personal') {
                // ==========================================
                // ΛΟΓΙΚΗ ΠΡΟΣΩΠΙΚΟΥ ΣΥΓΧΡΟΝΙΣΜΟΥ (SSOT)
                // ==========================================
                const cloudSongs = await fetchPrivateSongs();
                const cloudMap = new Map(cloudSongs.map(s => [s.id, s]));
                const localMap = new Map(currentLibrary.map(s => [s.id, s]));
                const resolvedMap = new Map();

                // Φάση Α: Επεξεργασία δεδομένων Cloud εναντίον Τοπικών
                for (const [id, cloudSong] of cloudMap) {
                    if (cloudSong.is_deleted) {
                        localMap.delete(id); // Αν το έχουμε τοπικά, το πετάμε.
                        continue; 
                    }

                    const localSong = localMap.get(id);
                    if (localSong) {
                        // Επίλυση σύγκρουσης με βάση το Timestamp
                        const localTime = new Date(localSong.updated_at || 0).getTime();
                        const cloudTime = new Date(cloudSong.updated_at || 0).getTime();

                        if (localTime > cloudTime) {
                            // Τοπικό πιο νέο (το στέλνουμε στο Cloud)
                            resolvedMap.set(id, localSong);
                            await supabaseClient.from('songs').upsert(window.sanitizeForDatabase(localSong, currentUser.id, null));
                            console.log(`⬆️ [SYNC] Ενημέρωση Cloud: ${localSong.title}`);
                        } else {
                            // Cloud πιο νέο ή ίδιο (το κρατάμε)
                            resolvedMap.set(id, cloudSong);
                        }
                        localMap.delete(id); // Το επεξεργαστήκαμε, το βγάζουμε από τη λίστα
                    } else {
                        // Υπάρχει στο Cloud αλλά όχι τοπικά -> Κατέβασμα
                        resolvedMap.set(id, cloudSong);
                    }
                }

                // Φάση Β: Όσα τοπικά ΔΕΝ υπήρχαν καν στο Cloud (Νέα offline τραγούδια)
                for (const [id, localSong] of localMap) {
                    if (String(id).startsWith('demo')) {
                        resolvedMap.set(id, localSong);
                        continue;
                    }
                    // Αφού δεν υπάρχει στο Cloud και δεν είναι Demo, είναι ολοκαίνουργιο τοπικό
                    resolvedMap.set(id, localSong);
                    await supabaseClient.from('songs').upsert(window.sanitizeForDatabase(localSong, currentUser.id, null));
                    console.log(`🚀 [SYNC] Ανέβασμα νέου: ${localSong.title}`);
                }

                currentLibrary = Array.from(resolvedMap.values());

            } else {
                // ==========================================
                // ΛΟΓΙΚΗ ΣΥΓΧΡΟΝΙΣΜΟΥ ΜΠΑΝΤΑΣ
                // ==========================================
                const cloudBandSongs = await fetchBandSongs(currentGroupId);
                const { data: overrides } = await supabaseClient
                    .from('personal_overrides')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .eq('group_id', currentGroupId);

                if (cloudBandSongs) {
                    const activeCloudSongs = cloudBandSongs.filter(s => !s.is_deleted);
                    const activeCloudIds = activeCloudSongs.map(s => s.id);

                    // Μηχανισμός Διάσωσης
                    for (let localSong of currentLibrary) {
                        if (!activeCloudIds.includes(localSong.id) && !String(localSong.id).startsWith('demo')) {
                            const wantsToKeep = confirm(`📢 Ο διαχειριστής διέγραψε το τραγούδι "${localSong.title}".\nΘέλετε να κρατήσετε ένα καθαρό αντίγραφο στα Προσωπικά σας;`);
                            if (wantsToKeep) {
                                const personalCopy = { 
                                    ...localSong,
                                    id: "s_" + Date.now() + Math.random().toString(16).slice(2),
                                    group_id: null,
                                    user_id: currentUser.id,
                                    is_clone: false,
                                    parent_id: null,
                                    conductorNotes: "", recordings: [], attachments: [], is_deleted: false,
                                    updated_at: new Date().toISOString()
                                };
                                
                                let myData = JSON.parse(localStorage.getItem('mnotes_data') || "[]");
                                myData.push(personalCopy);
                                localStorage.setItem('mnotes_data', JSON.stringify(myData));
                                supabaseClient.from('songs').insert([window.sanitizeForDatabase(personalCopy, currentUser.id, null)]);
                            }
                        }
                    }

                    // Εφαρμογή των Overrides στα ενεργά τραγούδια
                    currentLibrary = activeCloudSongs.map(song => {
                        const userOverride = overrides?.find(o => o.song_id === song.id);
                        if (userOverride) {
                            song.personal_notes = userOverride.personal_notes;
                            song.personal_transpose = userOverride.local_transpose || 0;
                            song.has_override = true;
                        }
                        return song;
                    });
                }
            }
        }

        // --- ΒΗΜΑ 3: ΑΠΟΘΗΚΕΥΣΗ ΚΑΙ ΑΝΑΝΕΩΣΗ UI ---
        localStorage.setItem(storageKey, JSON.stringify(currentLibrary));
        window.library = currentLibrary;
        library = window.library;

        if (typeof renderSidebar === 'function') renderSidebar();
              
        if (library.length > 0) {
            const songStillExists = currentSongId ? library.find(s => s.id === currentSongId) : null;
            if (!songStillExists) currentSongId = library[0].id;
            
            if (window.innerWidth > 1024) {
                if (typeof toViewer === 'function') toViewer(true);
            } else {
                const leftDrawer = document.getElementById('leftDrawer');
                if (leftDrawer && typeof toggleLeftDrawer === 'function' && !leftDrawer.classList.contains('open')) {
                    toggleLeftDrawer();
                }
            }
        } else {
            if (typeof toEditor === 'function') toEditor();
        }
        
    } catch (err) { 
        console.error("❌ [SYNC FATAL ERROR]:", err);
    } finally {
        // ✨ ΞΕΚΛΕΙΔΩΜΑ: Είτε πετύχει, είτε αποτύχει, ελευθερώνουμε το φρένο
        setTimeout(() => { isSyncing = false; }, 500); // 500ms cooldown
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
            //cleanSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
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

    let s = window.library.find(x => x.id === currentSongId);

    //  Διαβάζουμε από τον Editor, ή (αν είναι κλειστός) κρατάμε τις παλιές σημειώσεις
    const pNotesEl = document.getElementById('inpPersonalNotes');
    const pNotes = (pNotesEl && pNotesEl.offsetParent !== null) ? pNotesEl.value.trim() : (s ? s.personal_notes || s.notes || "" : "");
    
    const pTrans = state.t || 0;
    const pCapo = state.c || 0;

       //  1. OFFLINE FIRST: Ενημέρωση της τρέχουσας βιβλιοθήκης και αποθήκευση τοπικά!
    
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
        group_id: currentGroupId,
        local_transpose: pTrans,
        local_capo: pCapo,
        personal_notes: pNotes 
    };

    if (navigator.onLine) {
        const { error } = await supabaseClient
            .from('personal_overrides')
            .upsert(payload, { onConflict: 'user_id, song_id, group_id' });

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
 * Ανάκτηση προσωπικών τραγουδιών από το Cloud.
 * Φέρνει ΚΑΙ τα is_deleted για να ενημερώσει σωστά την τοπική μνήμη.
 */
async function fetchPrivateSongs() {
    console.log("📥 [FETCH] Ανάκτηση Προσωπικής Βιβλιοθήκης από το Cloud...");
    
    // Φέρνουμε ΜΟΝΟ τα προσωπικά (group_id is null) του χρήστη. 
    const { data, error } = await supabaseClient
        .from('songs')
        .select('*')
        .eq('user_id', currentUser.id)
        .is('group_id', null);

    if (error) {
        console.error("❌ [FETCH ERROR]:", error);
        return [];
    }

    return data.map(s => ensureSongStructure(s));
}
/**
 * Ανάκτηση κοινών τραγουδιών (Master) ΚΑΙ των δικών σου Κλώνων για τη Μπάντα
 */
async function fetchBandSongs(groupId) {
    console.log(`📥 [FETCH] Ανάκτηση τραγουδιών μπάντας: ${groupId}`);
    const { data, error } = await supabaseClient
        .from('songs')
        .select('*')
        .eq('group_id', groupId)
        .order('title', { ascending: true });

    if (error) {
        console.error("❌ Error fetching band songs:", error);
        return [];
    }

    // ✨ ΦΙΛΤΡΑΡΙΣΜΑ ΑΣΦΑΛΕΙΑΣ: Κρατάμε τα Master ΚΑΙ μόνο τους δικούς ΜΑΣ κλώνους
    const filteredData = data.filter(s => {
        if (!s.is_clone) return true; // Είναι Master, το κρατάμε
        if (s.is_clone && s.user_id === currentUser.id) return true; // Είναι δικός μου κλώνος, το κρατάμε
        return false; // Είναι κλώνος αλλουνού, το κόβουμε!
    });

    console.log(`📥 [FETCH] Βρέθηκαν ${filteredData.length} τραγούδια για τη μπάντα (Master + Οι κλώνοι μου)`);
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
            if (typeof saveToLocalStorage === 'function') saveToLocalStorage(songData);
            if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
                await saveToCloud(songData, null);
                showToast("Αποθηκεύτηκε στο Cloud! ☁️");
            } else {
                showToast("Αποθηκεύτηκε Τοπικά! 💾");
            }
        }
        else {
            const safeRole = String(currentRole).toLowerCase();
            const isGod = ['admin', 'owner', 'maestro'].includes(safeRole);
            const hasBaseChanges = isNewSong || checkBaseChanges(songData, existingSong);
         
            if (hasBaseChanges) {
                const saveMasterToBand = async () => {
                    let bandLocalKey = 'mnotes_band_' + currentGroupId;
                    let localBandData = JSON.parse(localStorage.getItem(bandLocalKey) || "[]");
                    let idx = localBandData.findIndex(s => s.id === currentSongId);
                    if (idx > -1) localBandData[idx] = songData;
                    else localBandData.push(songData);
                    localStorage.setItem(bandLocalKey, JSON.stringify(localBandData));
                    await saveToCloud(songData, currentGroupId);
                    showToast("Η βιβλιοθήκη της μπάντας ενημερώθηκε! 🎸");
                };

                if (isNewSong) {
                    if (isGod) await saveMasterToBand();
                    else await createOrUpdateClone(songData, existingSong);
                } else if (existingSong && existingSong.is_clone) {
                    await createOrUpdateClone(songData, existingSong);
                } else {
                    if (isGod) {
                        if (confirm("Ενημέρωση ΚΟΙΝΟΥ τραγουδιού μπάντας; [OK]\nΑποθήκευση ως Προσωπικού Κλώνου; [Cancel]")) {
                            await saveMasterToBand();
                        } else {
                            await createOrUpdateClone(songData, existingSong);
                        }
                    } else {
                        await createOrUpdateClone(songData, existingSong);
                    }
                }
            } else {
                if (typeof saveAsOverride === 'function') await saveAsOverride({ ...songData });
                showToast("Προσωπικές ρυθμίσεις αποθηκεύτηκαν.");
            }
        }
         
        // UI & NAVIGATION REFRESH
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
        is_clone: false,      
        parent_id: null
    };

    // 4. Αποθήκευση
    try {
        if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            const safePayload = typeof window.sanitizeForDatabase === 'function' ? window.sanitizeForDatabase(clonedSong, currentUser.id, null) : clonedSong;
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
/**
 * Καθαρή διαγραφή: Soft-delete στο Cloud, Hard-delete τοπικά.
 */
async function deleteCurrentSong() {
    if (!currentSongId) return;
   
    if (currentGroupId !== 'personal' && (currentRole !== 'owner' && currentRole !== 'admin')) {
        showToast("Δεν έχετε δικαίωμα διαγραφής σε αυτή τη μπάντα.", "error");
        return;
    }
    
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    if (!confirm(`Οριστική διαγραφή του "${s.title}";`)) return;

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
        showToast("Το τραγούδι διαγράφηκε.");

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
    if (currentGroupId !== 'personal' || !currentSongId) {
        showToast("Ο συγχρονισμός αφορά τραγούδια μπάντας στην προσωπική βιβλιοθήκη.", "info");
        return;
    }

    try {
        showToast("Αναζήτηση ενημερώσεων στη Μπάντα... 🔍");

        // 1. Αναζήτηση του Master στη Supabase (σε οποιοδήποτε group)
        const { data: masterSong, error } = await supabaseClient
            .from('songs')
            .select('*')
            .eq('id', currentSongId)
            .not('group_id', 'is', null)
            .maybeSingle();

        if (error || !masterSong) {
            showToast("Δεν βρέθηκε πηγή συγχρονισμού στη Μπάντα.", "error");
            return;
        }

        // 2. Σύγκριση Timestamps
        const localSong = library.find(s => s.id === currentSongId);
        const localTime = new Date(localSong?.updated_at || 0).getTime();
        const masterTime = new Date(masterSong.updated_at).getTime();

        let confirmMsg = `🔄 Βρέθηκε έκδοση στη Μπάντα. Θέλετε να τη φορτώσετε στον Editor;`;
        
        if (localTime > masterTime) {
            confirmMsg = `⚠️ ΠΡΟΣΟΧΗ: Το δικό σου τραγούδι είναι πιο πρόσφατο.\n\nΕίσαι σίγουρος ότι θέλεις να το αντικαταστήσεις με την έκδοση της Μπάντας;`;
        }

        if (!confirm(confirmMsg)) return;

        // 3. ΕΝΗΜΕΡΩΣΗ ΠΕΔΙΩΝ EDITOR (Χωρίς Save)
        // Επιτρέπουμε στον χρήστη να δει τις αλλαγές πριν τις οριστικοποιήσει
        document.getElementById('inpTitle').value = masterSong.title;
        document.getElementById('inpArtist').value = masterSong.artist || "";
        document.getElementById('inpKey').value = masterSong.key || "";
        document.getElementById('inpBody').value = masterSong.body || "";
        document.getElementById('inpIntro').value = masterSong.intro || "";
        document.getElementById('inpInter').value = masterSong.interlude || "";
        
        showToast("Τα δεδομένα φορτώθηκαν! Πατήστε Αποθήκευση για να οριστικοποιηθούν. ✅");

    } catch (err) {
        console.error("❌ Sync Editor Error:", err);
        showToast("Σφάλμα κατά τον συγχρονισμό", "error");
    }
}
