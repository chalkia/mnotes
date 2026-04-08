/* ===========================================================
   mNotes Pro UI Logic v17.6 (FINAL VERIFIED)..
   =========================================================== */
// ===========================================================
// 1. GLOBALS & INITIALIZATION (CLEANED UP)

if (typeof window.library === 'undefined') window.library = [];
window.library = window.library || [];
var library = window.library; 

if (typeof window.state === 'undefined') window.state = { t: 0, c: 0, meta: {}, parsedChords: [] };
var state = window.state;

var currentSongId = window.currentSongId || null;
var visiblePlaylist = []; // <--- ΚΡΑΤΑΜΕ ΜΟΝΟ ΑΥΤΗ
var sortableInstance = null;
var editorTags = [];
var viewMode = 'library'; 
var isLyricsMode = false; 
var wakeLock = null; 
var introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;

// Audio Globals
var mediaRecorder = null;
var audioChunks = [];
var currentRecordedBlob = null;
var recTimerInterval = null;
var recStartTime = 0;

// Global μεταβλητή για να ξέρουμε τι παίζει
window.activeRhythmType = 'metronome'; 

// Setlists Global
var liveSetlist = JSON.parse(localStorage.getItem('mnotes_setlist')) || [];
var allSetlists = {}; 

// Settings Default (ΑΦΑΙΡΕΘΗΚΕ ΤΟ backupReminder)
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50, maxCapo: 12, hideDemo: false, theme: 'theme-slate', introScale: 0, keepScreenOn: false, sortMethod: 'alpha',
    chordSize: 1, chordDist: 0, chordColor: 'default',
   customColors: { '--bg-main': '#000000', '--bg-panel': '#222222', '--text-main': '#ffffff', '--accent': '#00ff00', '--chord-color': '#ffff00' }
};
var tempIntroScale = 0; 

function toggleLanguage() { currentLang = (currentLang === 'en') ? 'el' : 'en'; localStorage.setItem('mnotes_lang', currentLang); applyTranslations(); renderSidebar(); populateTags(); if(currentSongId && currentSongId.includes('demo')) loadSong(currentSongId); }
function applyTranslations() { if(typeof TRANSLATIONS === 'undefined') return; document.querySelectorAll('[data-i18n]').forEach(el => { var key = el.getAttribute('data-i18n'); if (TRANSLATIONS[currentLang][key]) el.innerText = TRANSLATIONS[currentLang][key]; }); var btn = document.getElementById('btnLang'); if(btn) btn.innerHTML = (currentLang === 'en') ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> EL'; }
function applyTheme() { 
    // 1. Εφαρμογή της κλάσης του θέματος
    document.body.className = userSettings.theme || 'theme-slate'; 
    
    if (window.innerWidth <= 1024 && userSettings.theme === 'theme-dark') { 
        document.body.classList.add('theme-slate'); 
    } 
    
    // 2. ✨ ΚΑΘΑΡΙΣΜΟΣ: Σβήνουμε οριστικά τυχόν παλιά "ορφανά" custom χρώματα
    const root = document.documentElement; 
    ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => root.style.removeProperty(k)); 

    // 3. Υπολογισμός μεγεθών (Intro/Chords)
    var newSize = 1.1 + ((userSettings.introScale || 0) * 0.11); 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem"); 
    document.body.style.setProperty('--chord-scale', userSettings.chordSize || 1);
    document.body.style.setProperty('--chord-mb', (userSettings.chordDist || 0) + "px");
    
    if (userSettings.chordColor && userSettings.chordColor !== 'default') {
        document.body.style.setProperty('--chord-color', userSettings.chordColor);
    } else {
        document.body.style.removeProperty('--chord-color'); 
    }
}

// ===========================================================
// 2. LIBRARY & SIDEBAR (FIXED & CLEANED)
// ===========================================================
function loadLibrary() {
    initSetlists();
    populateTags();
    
    // 1. Συγχρονισμός με το window
    library = window.library;

    // 2. Αν η library έχει ήδη δεδομένα από το logic.js (Cloud), εμφάνισέ τα
    if (library && library.length > 0) {
        renderSidebar();
        return;
    }

    // 3. Έλεγχος LocalStorage αν η library είναι άδεια
    const saved = localStorage.getItem('mnotes_data');
    if (saved !== null) {
        const parsed = JSON.parse(saved);
        window.library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
        library = window.library;
    } else {
        // ΠΡΩΤΗ ΦΟΡΑ: Inject Demos
        if (typeof DEFAULT_DEMO_SONGS !== 'undefined') {
            window.library = DEFAULT_DEMO_SONGS.map((ds, idx) => ({ ...ds, id: "demo_" + Date.now() + idx }));
            library = window.library;
            saveData();
        }
    }

    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    renderSidebar();
}
function populateTags() {
    const select = document.getElementById('tagFilter');
    if(!select) return;
    const currentVal = select.value;
    
    // Μετάφραση για το "All Tags"
    const allTagsText = (typeof TRANSLATIONS !== 'undefined' && typeof t === 'function') ? t('opt_all_tags') : "All Tags";
    
    select.innerHTML = `<option value="">${allTagsText}</option><option value="__no_demo">No Demo</option>`;
    
    const allTags = new Set();
    
    library.forEach(s => {
        let sTags = [];
        
        // ✨ ΕΛΕΓΧΟΣ 1: Είναι σωστό Array (νέο σύστημα)
        if (s.tags && Array.isArray(s.tags)) {
            sTags = s.tags;
        } 
        // ✨ ΕΛΕΓΧΟΣ 2: Είναι παλιό String με κόμματα (bug από παλιά saves - ΔΙΟΡΘΩΣΗ)
        else if (s.tags && typeof s.tags === 'string' && s.tags.trim() !== '') {
            sTags = s.tags.split(',').map(tag => tag.trim());
        } 
        // ✨ ΕΛΕΓΧΟΣ 3: Είναι παλιό σύστημα playlists
        else if (s.playlists && Array.isArray(s.playlists)) {
            sTags = s.playlists;
        }

        sTags.forEach(t => {
            if(t) allTags.add(t);
        });
    });
    
    // Debugging: Βλέπουμε στην κονσόλα αν τα διαβάζει σωστά
    console.log(`🏷️ [Tags] Βρέθηκαν ${allTags.size} μοναδικά tags στη βιβλιοθήκη.`);
    
    Array.from(allTags).sort().forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = tag;
        select.appendChild(opt);
    });
    
    select.value = currentVal;
}


function applyFilters() {
    renderSidebar();
}

function sortLibrary(method) {
    if (!method) method = 'alpha';
    
    if (method === 'alpha') {
        // Ασφαλής Ελληνική Ταξινόμηση (αγνοεί τόνους και κεφαλαία/μικρά)
        library.sort((a, b) => String(a.title).localeCompare(String(b.title), 'el', { sensitivity: 'base' }));
    } 
    else if (method === 'created') {
        // Υβριδικός έλεγχος: Πρώτα Supabase, μετά το ID τρικ
        library.sort((a, b) => {
            let timeA = a.created_at ? new Date(a.created_at).getTime() : (parseInt(String(a.id).split('_')[1]) || 0);
            let timeB = b.created_at ? new Date(b.created_at).getTime() : (parseInt(String(b.id).split('_')[1]) || 0);
            return timeB - timeA;
        });
    } 
    else if (method === 'modified') {
        //  Έλεγχος updated_at
        library.sort((a, b) => {
            let timeA = new Date(a.updated_at || a.updatedAt || 0).getTime();
            let timeB = new Date(b.updated_at || b.updatedAt || 0).getTime();
            return timeB - timeA;
        });
    }
    
    // Αποθήκευση και Ανανέωση UI
    if (typeof userSettings !== 'undefined') {
        userSettings.sortMethod = method;
        localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    }
    
    if (typeof renderSidebar === 'function') renderSidebar();
}
    

function applySortAndRender() {
    const sortSel = document.getElementById('sortFilter');
    if(sortSel) sortLibrary(sortSel.value);
}

function clearLibrary() {
    if(confirm(window.t ? t('msg_confirm_clear') : "Διαγραφή όλων των δεδομένων;")) {
        // Επαναφορά όλων των Demos από το data.js με φρέσκα IDs
        library = DEFAULT_DEMO_SONGS.map((ds, idx) => ({ ...ds, id: "s_" + Date.now() + idx }));
        liveSetlist = [];
        
        localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
        
        if (typeof canUserPerform === 'function' && !canUserPerform('USE_SUPABASE')) {
            saveData(); 
        }
        
        document.getElementById('searchInp').value = "";
        applyFilters();
        loadSong(library[0].id);
        showToast("Η βιβλιοθήκη καθαρίστηκε και επανήλθαν τα Demos.");
    }
}
/* ===========================================================
   RENDER SIDEBAR (FINAL THEME-DRIVEN VERSION)
   =========================================================== */
   function renderSidebar() {
    var list = document.getElementById('songList');
    if(!list) return;
    
    list.innerHTML = "";
    visiblePlaylist = [];

    // ✨ ΒΡΙΣΚΟΥΜΕ ΤΑ ID ΤΩΝ MASTER ΠΟΥ ΕΧΟΥΝ ΚΛΩΝΟ, ΓΙΑ ΝΑ ΤΑ ΚΡΥΨΟΥΜΕ ΑΠΟ ΤΗ ΛΙΣΤΑ!
    const myCloneParentIds = library
        .filter(s => s.group_id === currentGroupId && s.is_clone && s.user_id === currentUser?.id)
        .map(s => s.parent_id);

    // --- 1. FILTERING LOGIC ---
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = library.find(x => x.id === id);
            if (s) visiblePlaylist.push(s);
        });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            // ΦΙΛΤΡΟ CONTEXT
            if (currentGroupId === 'personal') {
                if (s.group_id) return false; // Στα προσωπικά ΜΟΝΟ τα δικά μου
            } else {
                if (s.group_id !== currentGroupId) return false; // Στη μπάντα ΜΟΝΟ της μπάντας
                if (s.is_clone && s.user_id !== currentUser?.id) return false; 
                
                // ✨ ΜΑΓΕΙΑ: Κρύβουμε το Master αν έχουμε φτιάξει δικό μας Κλώνο γι' αυτό!
                if (!s.is_clone && myCloneParentIds.includes(s.id)) {
                    return false; 
                }
            }

            // Απόκρυψη Demo
            if (userSettings.hideDemo && String(s.id).includes("demo") && library.length > 1) return false;
            
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) || 
                           (s.key && s.key.toLowerCase() === txt);
            
            var sTags = (s.tags && s.tags.length > 0) ? s.tags : (s.playlists || []);
            var matchTag = (tag === "__no_demo") ? !String(s.id).includes("demo") : (tag === "" || sTags.includes(tag));
            
            return matchTxt && matchTag;
        });
    }

    // Update Song Count
    const countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;

    // --- 2. RENDERING LIST ITEMS ---
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        
        // A. Classification Logic (Personal / Band / Proposal)
        let originClass = '';
        if (s.is_proposal) {
            originClass = 'proposal-item'; // Dashed Border
        } else if (s.group_id) {
            originClass = 'band-cloud';    // Muted/Orange Border + Icon via CSS
        } else {
            originClass = 'personal-cloud'; // Accent Border
        }

        // B. New Import Highlight
        let isNew = (typeof lastImportedIds !== 'undefined' && lastImportedIds.has(s.id));
        
        // C. Construct Class String
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''} ${originClass} ${isNew ? 'new-import' : ''}`;
        
        li.className = itemClass;
        li.setAttribute('data-id', s.id);

       // D. Click Event
        li.onclick = (e) => {
            // Αν πατήσουμε το κυκλάκι ή το κουμπί του τόνου, δεν ανοίγει το τραγούδι
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-badge')) return;
            
            if (typeof loadSong === 'function') loadSong(s.id);
            
            // ✨ ΝΕΟ 1: Αλλαγή "φωτισμού" στη Δεξιά Μπάρα (Από Library -> Stage)
            // (Θα χρειαστεί να βάλεις τα σωστά ID των κουμπιών σου εδώ αν διαφέρουν)
            const btnLibrary = document.getElementById('btnTabLibrary'); // Βάλε το ID του κουμπιού Library
            const btnStage = document.getElementById('btnTabStage');     // Βάλε το ID του κουμπιού Stage
            
            if (btnLibrary) btnLibrary.classList.remove('active');
            if (btnStage) btnStage.classList.add('active');
            
            // Κλείσιμο Drawer σε κινητά
            if(window.innerWidth <= 1024) {
                // ✨ ΝΕΟ 2: Διόρθωσα το rightDrawer σε leftDrawer (Η λίστα συνήθως είναι αριστερά!)
                const leftDrawer = document.getElementById('leftDrawer'); 
                if(leftDrawer && leftDrawer.classList.contains('open') && typeof toggleLeftDrawer === 'function') {
                    toggleLeftDrawer();
                }
                
                // Αν έχεις και δεξί συρτάρι που θες να κλείνει:
                const rightDrawer = document.getElementById('rightDrawer');
                if(rightDrawer && rightDrawer.classList.contains('open') && typeof toggleRightDrawer === 'function') {
                    toggleRightDrawer();
                }
            }
        };
        // E. Display Variables
        var displayTitle = s.title;
        var displayKey = s.key || "-";
        
       // F. Setlist Action Icon
        var actionIcon = "far fa-circle";
        if (viewMode === 'setlist') {
            actionIcon = "fas fa-minus-circle"; // Κόκκινο μείον για αφαίρεση
        } else if (liveSetlist.includes(s.id)) {
            actionIcon = "fas fa-check-circle in-setlist"; // Πράσινο τικ αν υπάρχει ήδη
        }
      // G. SMART CLONE BADGES (STAGE-READY)
        let badgesHTML = '';

        // 1. ☁️ Συννεφάκι (Cloud): Δείχνει ότι το τραγούδι είναι συγχρονισμένο
        if (!String(s.id).includes('demo')) {
             if (s.group_id || (typeof canUserPerform === 'function' && canUserPerform('CLOUD_SYNC'))) {
                  badgesHTML += `<i class="fas fa-cloud badge-cloud" title="Στο Cloud" style="margin-left:8px; font-size:0.75rem; opacity:0.4;"></i>`;
             }
        }

        // 2. 🎵 Νότα (Music): Δείχνει ότι έχεις επέμβει στον τόνο (Transpose)
        if (s.personal_transpose && s.personal_transpose !== 0) {
            badgesHTML += `<i class="fas fa-music" title="Αλλαγμένος Τόνος" style="margin-left:8px; font-size:0.75rem; color:var(--accent);"></i>`;
        }

        // 3. 👤✏️ Ανθρωπάκι με Μολύβι (User Edit): Δείχνει ότι είναι δικός σου Κλώνος (Μέσα στη Μπάντα)
        if (s.is_clone || !!s.parent_id) {
            badgesHTML += `<i class="fas fa-user-edit" title="Προσωπικός Κλώνος" style="margin-left:8px; font-size:0.75rem; color:#ff4444;"></i>`;
        }

        // ✨ ΔΗΜΙΟΥΡΓΙΑ TAGS ΓΙΑ ΤΗ ΛΙΣΤΑ (ΝΕΟ)
        let tagsDisplay = "";
        if (s.tags && Array.isArray(s.tags) && s.tags.length > 0) {
            let displayTags = s.tags.slice(0, 3).join(', '); // Εμφανίζει έως 3 tags
            let extra = s.tags.length > 3 ? "..." : "";
            tagsDisplay = `<div style="font-size:0.7rem; color:var(--accent); margin-top:4px; font-style:italic;">${displayTags}${extra}</div>`;
        }

        // H. HTML Injection
        li.innerHTML = `
            <i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>
            <div class="song-info">
                <div class="song-title" style="display:flex; align-items:center;">
                     <span style="flex-grow:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayTitle}</span>
                     <span style="white-space:nowrap;">${badgesHTML}</span>
                </div>
                <div class="song-meta-row">
                    <span class="song-artist">${s.artist || "-"}</span>
                    <span class="song-key-badge" onclick="filterByKey(event, '${displayKey}')">${displayKey}</span>
                </div>
                ${tagsDisplay} </div>
            ${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}
        `;
        list.appendChild(li);  

    });
    // --- 3. SORTABLE JS RE-INIT ---
    if (sortableInstance) sortableInstance.destroy();
    if(typeof Sortable !== 'undefined') {
        sortableInstance = new Sortable(list, {
            animation: 150,
            handle: '.song-handle', 
            disabled: (viewMode !== 'setlist'), 
            onEnd: function (evt) {
                if (viewMode === 'setlist') {
                    // 1. Πιάνουμε ΜΟΝΟ τα πραγματικά τραγούδια (αγνοούμε τα ghost elements του Sortable)
                    const items = list.querySelectorAll('.song-item');
                    const newOrder = Array.from(items).map(item => item.getAttribute('data-id'));
                    
                    // 2. ✨ ΤΟ ΚΛΕΙΔΙ: Αλλάζουμε τα περιεχόμενα του πίνακα ΧΩΡΙΣ να τον σπάσουμε
                    liveSetlist.splice(0, liveSetlist.length, ...newOrder);
                    
                    // 3. Αποθηκεύουμε μόνιμα στη βάση και το LocalStorage
                    if (typeof saveSetlists === 'function') saveSetlists();
                    
                    // 4. Εξαναγκάζουμε τη λίστα να "κλειδώσει" οπτικά με βάση τη μνήμη
                    setTimeout(() => {
                        renderSidebar();
                    }, 50);
                }
            }
        });
       // --- 4. AUTO-LOAD ΤΡΑΓΟΥΔΙΟΥ (Αν η Σκηνή είναι άδεια) ---
        if (visiblePlaylist.length > 0) {
            // Ελέγχουμε αν βρισκόμαστε σε κατάσταση επεξεργασίας
            const isEditing = document.getElementById('view-editor')?.classList.contains('active-view');
            
            // Ελέγχουμε αν το Τρέχον Τραγούδι υπάρχει μέσα στην ΟΡΑΤΗ λίστα
            const isCurrentVisible = visiblePlaylist.find(s => s.id === currentSongId);
            
            // Αν δεν είναι στον Editor, ΚΑΙ (δεν έχει επιλέξει τίποτα Ή το επιλεγμένο δεν φαίνεται πια)
            if (!isEditing && (!currentSongId || !isCurrentVisible)) {
                
                // ✨ ΝΕΟ: Ψάχνουμε αν υπάρχει αποθηκευμένο προηγούμενο τραγούδι
                const lastSavedId = localStorage.getItem('mnotes_last_song');
                const isLastSavedVisible = lastSavedId ? visiblePlaylist.find(s => s.id === lastSavedId) : null;

                if (isLastSavedVisible) {
                    // Φορτώνει αυτό που είχες αφήσει ανοιχτό πριν το Refresh
                    loadSong(lastSavedId);
                } else {
                    // Fallback: Αν έχει διαγραφεί ή δεν υπάρχει, φορτώνει το πρώτο
                    loadSong(visiblePlaylist[0].id);
                }
            }
        }
    }
 }

// ===========================================================
// 3. UI HELPERS & GESTURES
// ===========================================================

function initResizers() {
    const d = document; 
    const leftResizer = d.getElementById('dragMeLeft'); 
    const rightResizer = d.getElementById('dragMeRight'); 
    
    if(leftResizer) { 
        leftResizer.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            d.addEventListener('mousemove', onMouseMoveLeft); 
            d.addEventListener('mouseup', onMouseUpLeft); 
        }); 
    }
    
    if(rightResizer) { 
        rightResizer.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            d.addEventListener('mousemove', onMouseMoveRight); 
            d.addEventListener('mouseup', onMouseUpRight); 
        }); 
    } 

    function onMouseMoveLeft(e) { 
        let newWidth = e.clientX; 
        if(newWidth < 200) newWidth = 200; 
        if(newWidth > 500) newWidth = 500; 
        d.documentElement.style.setProperty('--nav-width', newWidth + 'px'); 
    }
    
    function onMouseMoveRight(e) { 
        let newWidth = window.innerWidth - e.clientX; 
        if(newWidth < 250) newWidth = 250; 
        if(newWidth > 600) newWidth = 600; 
        d.documentElement.style.setProperty('--tools-width', newWidth + 'px'); 
    }
    
    function onMouseUpLeft() { 
        d.removeEventListener('mousemove', onMouseMoveLeft); 
        d.removeEventListener('mouseup', onMouseUpLeft); 
    }
    
    function onMouseUpRight() { 
        d.removeEventListener('mousemove', onMouseMoveRight); 
        d.removeEventListener('mouseup', onMouseUpRight); 
    }
}
//GESTURES
function setupGestures() { 
    var startDist = 0; 
    var startSize = 1.3; 
    
    // Καρφώνουμε τον Listener στο document
    document.addEventListener('touchstart', function(e) { 
        // Ελέγχουμε αν είναι 2 δάχτυλα ΚΑΙ αν η αφή έγινε κάπου μέσα στη σκηνή
        if(e.touches.length === 2 && e.target.closest('.col-stage')) { 
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); 
            startSize = parseFloat(val) || 1.3; 
            console.log(`[GESTURES] Start pinch. Init size: ${startSize}rem`);
        }
    }, {passive: false}); // Το passive: false είναι υποχρεωτικό εδώ
    
    document.addEventListener('touchmove', function(e) { 
        if(e.touches.length === 2 && e.target.closest('.col-stage')) { 
            // ΕΔΩ ΜΠΛΟΚΑΡΟΥΜΕ ΤΟ ΖΟΟΜ ΤΟΥ ΚΙΝΗΤΟΥ 100%
            e.preventDefault(); 
            
            var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            if(startDist > 0) { 
                var scale = dist / startDist; 
                var newSize = startSize * scale; 
                
                // Κρατάμε τα όρια
                if(newSize < 0.8) newSize = 0.8; 
                if(newSize > 3.0) newSize = 3.0; 
                
                document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); 
                console.log(`[GESTURES] Zooming: ${newSize.toFixed(2)}rem`);
            }
        }
    }, {passive: false});

document.addEventListener('touchend', function(e) {
        if(e.touches.length < 2) {
            startDist = 0;
            // ✨ Προσθήκη: Ελέγχουμε αν μετά το ζουμάρισμα χρειάζεται πλέον scroll
            if (typeof applyScrollBtnVisibility === 'function') {
                applyScrollBtnVisibility();
            }
        }
    });

    console.log("✅ [GESTURES] Ενεργοποιήθηκαν με Global Delegation!");
}
// ===========================================================
// 4. IMPORT / EXPORT (CLEANED - NO QR)
// ===========================================================

function selectImport(type) { 
    const modal = document.getElementById('importChoiceModal'); 
    if(modal) modal.style.display = 'none'; 
    
    if(type === 'file') { 
        const fi = document.getElementById('hiddenFileInput'); 
        if(fi) fi.click(); 
    } else if(type === 'url') { 
        importFromURL(); 
    } 
    // QR option removed
}

async function importFromURL() { 
    const url = prompt(window.t ? t('ph_url_import') : "Enter URL:"); 
    if (!url) return; 
    try { 
        const res = await fetch(url); 
        if(!res.ok) throw new Error("Network Error"); 
        const data = await res.json(); 
        processImportedData(data); 
    } catch (err) { 
        showToast("Import Failed: " + err.message, "error"); 
    } 
}

// ===========================================================
// 5. PLAYER LOGIC
// ===========================================================

function loadSong(id) {
   // ✨ ΝΕΟ: Σταματάμε τον ρυθμό (ή τον μετρονόμο) του προηγούμενου τραγουδιού
    if (window.mRhythm && window.isRhythmPlaying) {
        window.mRhythm.stop();
        console.log("[Player] Ο ρυθμός σταμάτησε λόγω αλλαγής τραγουδιού.");
    }
    if (typeof BasicMetronome !== 'undefined' && BasicMetronome.isPlaying) {
        BasicMetronome.toggle();
    }

    // Επαναφορά του εικονιδίου Play/Stop
    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }

    // Επαναφορά της ταμπέλας του ρυθμού στο προεπιλεγμένο
    window.activeRhythmType = 'metronome';
    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = (typeof t === 'function') ? t('metronome') : "Metronome";
        nameDisplay.style.color = "var(--text-muted)";
    }
    // 1. Σταμάτημα Auto Scroll αν τρέχει
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll();
    
    // Κλείσιμο του συρταριού σημειώσεων στο Live View - Άνοιγμα των συγχορδιών
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = false;
    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = true; 
    
    // 2.1 Εύρεση Τραγουδιού
    currentSongId = id; 
   // ✨ Αποθηκεύουμε το ID του τραγουδιού τοπικά στον browser
    localStorage.setItem('mnotes_last_song', id);
   // ✨ Κλείσιμο του Floating Viewer (PDF) αν αλλάξαμε τραγούδι!
    if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen && FloatingTools.boundSongId !== id) {
        if (typeof FloatingTools.close === 'function') FloatingTools.close();
    }
    var s = library.find(x => x.id === id); 
    if(!s) return;
    
   // 2.2✨ ΑΝΟΙΓΕΙΣ ΤΟ MASTER ΜΕΣΑ ΑΠΟ SETLIST ΑΛΛΑ ΕΧΕΙΣ ΚΛΩΝΟ; ΦΟΡΤΩΣΕ ΤΟΝ ΚΛΩΝΟ ΣΟΥ!
    if (!s.is_clone && currentGroupId !== 'personal') {
        const myClone = library.find(c => c.parent_id === s.id && c.is_clone && c.user_id === currentUser?.id);
        if (myClone) {
            console.log(`[ROUTER] Το Master ζητήθηκε, αλλά βρέθηκε Κλώνος. Φόρτωση Κλώνου: ${myClone.title}`);
            s = myClone;
            currentSongId = myClone.id;
        }
    }

    // 3.1 Reset Transpose/Capo
    state.t = 0; 
    state.c = 0; 
    
    //3.2 Προετοιμασία συγχορδιών
    if(typeof parseSongLogic === 'function') parseSongLogic(s);
    
    // 4. Εμφάνιση Στίχων & Header
    renderPlayer(s);
    
    // 5. ΣΥΓΧΡΟΝΙΣΜΟΣ ΜΕΤΡΟΝΟΜΟΥ / RHYTHM (ΤΑ ΦΑΝΤΑΣΜΑΤΑ ΕΦΥΓΑΝ!)
    if (s.rhythm && s.rhythm.bpm) {
        if (typeof BasicMetronome !== 'undefined') {
            BasicMetronome.setBpm(s.rhythm.bpm);
            
            // Συγχρονίζουμε και τα γραφικά στοιχεία (Slider & Κείμενο) στο UI
            const rngBpm = document.getElementById('rngBpm');
            const dispBpm = document.getElementById('dispBpm');
            if (rngBpm) rngBpm.value = s.rhythm.bpm;
            if (dispBpm) dispBpm.innerText = s.rhythm.bpm;
        }
    }

    // 6. Αλλαγή Προβολής (View)
    const viewState = localStorage.getItem('mnotes_view_state');
    if (viewState === 'editor') {
        switchToEditor();
    } else {
        document.getElementById('view-player').classList.add('active-view'); 
        document.getElementById('view-editor').classList.remove('active-view');
    }
    
    // 7. Highlight στη λίστα
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active')); 
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); 
    if(activeItem) activeItem.classList.add('active');
    
    // 8. Wake Lock (Να μην σβήνει η οθόνη)
    if(typeof requestWakeLock === 'function') requestWakeLock();

    // 9. Mobile Sync (Για κινητά)
    if (window.innerWidth <= 1024 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }

    // ✨ 10. ΕΛΕΓΧΟΣ ΓΙΑ ΕΜΦΑΝΙΣΗ ΚΟΥΜΠΙΟΥ AUTO-SCROLL
    // Περιμένουμε 150ms για να προλάβει το renderPlayer να γεμίσει το container
    if (typeof applyScrollBtnVisibility === 'function') {
        setTimeout(applyScrollBtnVisibility, 150);
    }
}

function navVisiblePlaylist(dir) {
    if (!visiblePlaylist || visiblePlaylist.length === 0) return;
    
    let currentIndex = visiblePlaylist.findIndex(s => s.id === currentSongId);
    let newIndex = currentIndex + dir;
    
    if (newIndex >= 0 && newIndex < visiblePlaylist.length) {
        loadSong(visiblePlaylist[newIndex].id);
    } else {
        showToast(dir > 0 ? "Τέλος Λίστας" : "Αρχή Λίστας");
    }
}
/* --- ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΤΗΣ ΣΥΝΑΡΤΗΣΗΣ renderPlayer --- */
function renderPlayer(s) {
    if (!s) return;
    
    window.introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;
    const sizeClass = `intro-size-${window.introSizeLevel}`; 
    
    let metaHtml = ""; 
    
    // ==========================================
    // ✨ SMART OVERLAY ΣΗΜΕΙΩΣΕΩΝ (BAND HUB & PERSONAL)
    // ==========================================
    let pNote = s.notes || ""; 
    const bNote = s.conductorNotes || "";
    
    // ✨ ΜΑΓΕΙΑ: Αν παίζει τραγούδι Μπάντας (Master), ψάχνουμε τον Κλώνο σου για να φέρουμε τα δικά σου λόγια!
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
        let myClone = library.find(x => x.is_clone && x.parent_id === s.id && x.user_id === currentUser?.id);
        if (myClone && myClone.notes && myClone.notes.trim() !== "") {
            pNote = myClone.notes; 
        }
    }

    const hasNotes = (bNote.trim().length > 0) || (pNote.trim().length > 0);

    // A. Ενημέρωση της Δεξιάς Μπάρας (Band Hub)
    const txtBandNotes = document.getElementById('sideBandNotes');
    const dispBandNotes = document.getElementById('sideBandNotesDisplay');
    
    if (txtBandNotes) txtBandNotes.value = bNote;
    if (dispBandNotes) dispBandNotes.innerText = bNote !== "" ? bNote : "Δεν υπάρχουν οδηγίες.";

    // B. Ενημέρωση του Sticky Note (Πάνω από τους στίχους)
    const stickyArea = document.getElementById('stickyNotesArea');
    const cNoteText = document.getElementById('conductorNoteText');
    const pNoteText = document.getElementById('personalNoteText');
    
    if (stickyArea) {
        if (hasNotes) {
            stickyArea.style.display = 'none';
            if (cNoteText) cNoteText.innerText = bNote ? "📢 Μαέστρος: " + bNote : "";
            if (pNoteText) pNoteText.innerText = pNote ? "📝 Εγώ: " + pNote : "";
        } else {
            stickyArea.style.display = 'none';
        }
    }

    // Γ. Ρυθμίζουμε τα δικαιώματα (Ποιος βλέπει τι στο Band Hub)
    if (typeof updateBandHubUI === 'function') updateBandHubUI();

    // --- ΛΟΓΙΚΗ INTRO / INTERLUDE ---
    const btnHtml = `<button id="btnIntroToggle" onclick="cycleIntroSize()" class="size-toggle-btn" title="Change Text Size"><i class="fas fa-text-height"></i></button>`;
    const introText = s.intro;
    const interText = s.inter || s.interlude; 

    if (introText || interText) {
        metaHtml += `<div class="meta-info-box">`;
        if (introText) {
            metaHtml += `<div class="meta-row ${sizeClass}">
                            ${btnHtml} <span><strong>Intro:</strong> ${parseMetaLine(introText)}</span>
                         </div>`;
        }
        if (interText) {
            const showBtnHere = (!introText) ? btnHtml : '<span class="spacer-btn"></span>'; 
            metaHtml += `<div class="meta-row ${sizeClass}">
                            ${showBtnHere} <span><strong>Inter:</strong> ${parseMetaLine(interText)}</span>
                         </div>`;
        }
        metaHtml += `</div>`;
    }
    
    // --- ΤΟ ΚΟΥΜΠΙ "ΠΙΝΕΖΑ" ΓΙΑ ΤΑ STICKY NOTES ---
    let noteBtnHtml = '';
    if (hasNotes) {
        noteBtnHtml = `
            <button onclick="toggleStickyNotes()" title="Εμφάνιση Σημειώσεων" style="background: #fbc02d; color: #000; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); margin-left: 12px; transform: translateY(-2px); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px) scale(1.1)'" onmouseout="this.style.transform='translateY(-2px) scale(1)'">
                <i class="fas fa-thumbtack" style="font-size:0.85rem;"></i>
            </button>`;
    }

      // ✨ ΧΤΙΣΙΜΟ TAGS ΓΙΑ ΤΟ PLAYER (Τώρα είναι Κουμπιά/Φίλτρα!)
          let tagsHtml = "";
          if (s.tags && Array.isArray(s.tags) && s.tags.length > 0) {
              tagsHtml = s.tags.map(t => `
                  <span onclick="filterByTag(event, '${t}')" 
                        title="Φιλτράρισμα με #${t}"
                        style="cursor:pointer; background:var(--accent); color:#000; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:bold; margin-right:5px; display:inline-block; margin-top:5px; box-shadow:0 2px 4px rgba(0,0,0,0.2); transition:transform 0.1s;" 
                        onmouseover="this.style.transform='scale(1.05)'" 
                        onmouseout="this.style.transform='scale(1)'">
                      #${t}
                  </span>`).join('');
          }
      // --- PLAYER HEADER ---
          const headerContainer = document.querySelector('.player-header-container');
          if (headerContainer) {
              headerContainer.innerHTML = `
              <div class="player-header" style="position: relative;">
                   
                   <div class="mobile-nav-buttons" style="position: absolute; top: 0; right: 0; display: flex; gap: 8px; z-index: 10;">
                       <button onclick="navSetlist(-1)" class="round-btn" style="width: 38px; height: 38px; font-size: 1rem; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><i class="fas fa-step-backward"></i></button>
                       <button onclick="navSetlist(1)" class="round-btn" style="width: 38px; height: 38px; font-size: 1rem; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><i class="fas fa-step-forward"></i></button>
                   </div>
      
                   <h2 id="mainAppTitle" style="margin:0 0 5px 0; font-size:1.2rem; color:var(--text-main); display:flex; align-items:center; flex-wrap:wrap; padding-right:95px;">
                         <span>${s.title} ${s.artist ? `<span style="font-size:0.9rem; opacity:0.6;">- ${s.artist}</span>` : ''}</span>
                         ${noteBtnHtml}
                   </h2>
                   
                   <div style="margin-bottom: 8px;">${tagsHtml}</div>
                   
                   <div style="display:flex; justify-content:space-between; align-items:center;">
                       <div style="display:flex; align-items:center; gap: 10px;">
                          <span class="key-badge" style="color: var(--accent); font-size: 1.8rem; font-weight: 900; text-shadow: 0 2px 5px rgba(0,0,0,0.4); border: 2px solid var(--accent); padding: 4px 12px; border-radius: 8px; background: rgba(0,0,0,0.2);">${typeof getNote === 'function' ? getNote(s.key || "-", state.t) : s.key}</span>
                           
                           <span id="stageCapoInfo" style="display:${state.c > 0 ? 'inline-block' : 'none'}; background-color:#e74c3c; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.8rem; font-weight:bold; letter-spacing: 0.5px;">CAPO ${state.c}</span>
                           
                           <button id="btnToggleView" onclick="toggleViewMode()"></button>
                       </div>
                  </div>
                  ${metaHtml}
              </div>`;
          }

    // --- EXTRAS (Video, Audio, Attachments) ---
    const vidBox = document.getElementById('video-sidebar-container');
    const embedBox = document.getElementById('video-embed-box');
    if (vidBox && embedBox) {
        if (s.video && s.video.trim() !== '') {
            embedBox.innerHTML = getMediaEmbedHtml(s.video);
            vidBox.style.display = 'block';
        } else { 
            vidBox.style.display = 'none'; 
        }
    }

    if(typeof renderRecordingsList === 'function') renderRecordingsList(s.recordings || [], []); 
    if(typeof renderAttachmentsList === 'function') renderAttachmentsList(s.attachments || []);
   
    const dValT = document.getElementById('val-t'); const dValC = document.getElementById('val-c');
    if(dValT) dValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(dValC) dValC.innerText = state.c;
    const mValT = document.getElementById('drawer-val-t'); const mValC = document.getElementById('drawer-val-c');
    if(mValT) mValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(mValC) mValC.innerText = state.c;

    // --- ΕΞΥΠΝΟ SPLIT (Ακυρώνεται στο Lyrics Mode) ---
    var split = { fixed: "", scroll: s.body || "" }; 
    
    if (!isLyricsMode && typeof splitSongBody === 'function') {
        split = splitSongBody(s.body || "");
    }
    
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);  
    
    const fixedEl = document.getElementById('fixed-container');
    if (fixedEl) {
        fixedEl.style.display = split.fixed ? 'block' : 'none';
    }
    updateToggleButton(s); 
    if (typeof GuitarChordsUI !== 'undefined') {
        GuitarChordsUI.scanAndRender();
    }
}
// --- Συνάρτηση που αναγνωρίζει την πηγή και φτιάχνει τον σωστό Player ---
function getMediaEmbedHtml(url) {
       if (!url) return '';
   
       // 1. Έλεγχος για YouTube
       if (typeof getYoutubeId === 'function') {
           const ytId = getYoutubeId(url);
           if (ytId) {
               return `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0; border-radius: 8px;"></iframe>`;
           }
       }
   
       // 2. Έλεγχος για Spotify (Τραγούδι, Album ή Playlist)
       const spotifyRegex = /spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
       const spotMatch = url.match(spotifyRegex);
       if (spotMatch) {
           const type = spotMatch[1];
           const id = spotMatch[2];
           return `<iframe src="https://open.spotify.com/embed/${type}/${id}" width="100%" height="100%" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: 8px; position:absolute; top:0; left:0;"></iframe>`;
       }
   
       // 3. Έλεγχος για SoundCloud (Ιδανικό για Demos & Πρόβες)
       if (url.includes('soundcloud.com')) {
           const encodedUrl = encodeURIComponent(url);
           // Το visual=true δίνει το μεγάλο όμορφο player με το εξώφυλλο
           return `<iframe width="100%" height="100%" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodedUrl}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=true" style="border-radius: 8px; position:absolute; top:0; left:0;"></iframe>`;
       }
   
       // 4.  Έλεγχος για Apple Music
       if (url.includes('music.apple.com')) {
           const appleUrl = url.replace('music.apple.com', 'embed.music.apple.com');
           return `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="100%" style="width:100%; overflow:hidden; background:transparent; border-radius:8px; position:absolute; top:0; left:0;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${appleUrl}"></iframe>`;
       }
   
       // 5. Fallback: Αν είναι απλό/άγνωστο Link, φτιάχνουμε το δικό μας όμορφο κουμπί
       return `
           <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; position:absolute; top:0; left:0; background:rgba(0,0,0,0.2); border-radius:8px; border: 1px dashed var(--border-color);">
               <a href="${url}" target="_blank" style="color:var(--accent); text-decoration:none; font-weight:bold; font-size: 0.9rem; padding: 10px 20px; border: 1px solid var(--accent); border-radius: 20px; transition: 0.2s transform;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                   <i class="fas fa-external-link-alt"></i> Άνοιγμα Εξωτερικού Σύνδεσμου
               </a>
           </div>
       `;
   }

// ===========================================================
// CUSTOM AUDIO PLAYER LOGIC
// ===========================================================
function toggleCustomPlayer() {
    const audioCore = document.getElementById('masterAudio');
    const icon = document.getElementById('cpPlayIcon');
    if (!audioCore) return;
    
    if (audioCore.paused) {
        audioCore.play();
        if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-pause'); }
    } else {
        audioCore.pause();
        if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
    }
}

   function seekCustomPlayer(val) {
          const audioCore = document.getElementById('masterAudio');
          if (!audioCore || !audioCore.duration) return;
          audioCore.currentTime = audioCore.duration * (val / 100);
      }
      
      // Αυτόματη ενημέρωση μπάρας & χρόνου
      document.addEventListener('DOMContentLoaded', () => {
          const audioCore = document.getElementById('masterAudio');
          if (audioCore) {
              audioCore.addEventListener('timeupdate', () => {
                  const seekbar = document.getElementById('cpSeekbar');
                  const currTime = document.getElementById('cpCurrentTime');
                  if (audioCore.duration && seekbar) seekbar.value = (audioCore.currentTime / audioCore.duration) * 100;
                  const mins = Math.floor(audioCore.currentTime / 60);
                  const secs = Math.floor(audioCore.currentTime % 60).toString().padStart(2, '0');
                  if (currTime) currTime.innerText = `${mins}:${secs}`;
              });
              audioCore.addEventListener('loadedmetadata', () => {
                  const durTime = document.getElementById('cpDuration');
                  const mins = Math.floor(audioCore.duration / 60);
                  const secs = Math.floor(audioCore.duration % 60).toString().padStart(2, '0');
                  if (durTime) durTime.innerText = `${mins}:${secs}`;
              });
              audioCore.addEventListener('ended', () => {
                  const icon = document.getElementById('cpPlayIcon');
                  const seekbar = document.getElementById('cpSeekbar');
                  if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
                  if (seekbar) seekbar.value = 0;
              });
          }
      });
      
   function renderArea(elemId, text) { 
          var container = document.getElementById(elemId); 
          if (!container) return; 
          
          container.innerHTML = ""; 
          if (!text) return;
      
          const chordRx = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
          text = text.replace(new RegExp(`\\[${chordRx}\\]`, 'g'), "!$1 ");
          text = text.replace(new RegExp(`!${chordRx}!`, 'g'), "!$1 ");
      
          var lines = text.split('\n'); 
          
          lines.forEach((line, index) => { 
              var row = document.createElement('div'); 
              
              if (line.trim() === '') {
                  row.className = 'line-row'; 
                  row.innerHTML = `<span class="lyric">&nbsp;</span>`;
                  container.appendChild(row);
                  return;
              }
      
              // --- Η ΜΑΓΕΙΑ ΞΕΚΙΝΑΕΙ ΕΔΩ ---
              // Αφαιρούμε τα ακόρντα για να δούμε τι μένει ως "στίχος"
              let rawLyrics = line.replace(new RegExp(`!${chordRx}!?`, 'g'), '');
              
              // Ελέγχουμε αν έχουν μείνει καθόλου Γράμματα (\p{L}) ή Αριθμοί (\p{N})
              let hasText = /[\p{L}]/u.test(rawLyrics); 
              let isChordsOnly = !hasText; // Αν είναι true, η γραμμή έχει μόνο σύμβολα ( | - { } κενά)
              
              row.className = isChordsOnly ? 'line-row chords-only-row' : 'line-row';
      
              if (line.indexOf('!') === -1 || (typeof isLyricsMode !== 'undefined' && isLyricsMode)) { 
                  let pureText = line;
                  if (typeof isLyricsMode !== 'undefined' && isLyricsMode) {
                      pureText = rawLyrics.replace(/\s{2,}/g, ' ').trim(); 
                  }
                  
                  // Προστασία όλων των κενών με &nbsp; για να μην καταρρέουν
                  let safeText = pureText.replace(/ /g, '&nbsp;');
                  row.innerHTML = `<span class="lyric">${(safeText && safeText.length > 0) ? safeText : "&nbsp;"}</span>`; 
              } else { 
                  var parts = line.split('!'); 
                  if (parts[0]) row.appendChild(createToken("", parts[0], isChordsOnly)); 
                  
                  for (var i = 1; i < parts.length; i++) { 
                      var m = parts[i].match(new RegExp(`^${chordRx}\\s?(.*)`)); 
                      
                      if (m) {
                          let chordRaw = m[1];
                          let lyricsRaw = m[2] || ""; 
                          let noteDisp = chordRaw;
                          
                          try {
                              if (typeof getNote === 'function' && typeof state !== 'undefined') {
                                  noteDisp = getNote(chordRaw, state.t - state.c);
                              }
                          } catch (err) {
                              console.error(`[RENDER] Σφάλμα στο transpose (Γραμμή ${index+1})`);
                          }
                          
                          row.appendChild(createToken(noteDisp, lyricsRaw, isChordsOnly)); 
                      } else {
                          row.appendChild(createToken("", parts[i] || "", isChordsOnly)); 
                      }
                  } 
              } 
              container.appendChild(row); 
          }); 
      }

// Προσθέσαμε την παράμετρο isChordsOnly 
function createToken(c, l, isChordsOnly) { 
    var d = document.createElement('div'); 
    d.className = 'token'; 
    
    // Μετατρέπουμε τα κενά του χρήστη σε &nbsp; για να διατηρηθούν ακριβώς όπως τα πληκτρολόγησε
    let safeLyric = l ? l.replace(/ /g, '&nbsp;') : "";
    
    if (isChordsOnly) {
        // Η ΠΡΟΣΓΕΙΩΣΗ: Δεν φτιάχνουμε καν span για lyrics! 
        // Βάζουμε το σύμβολο (π.χ. " | ") μέσα στο ίδιο κουτί με τη συγχορδία.
        // Έτσι παίρνει το ίδιο χρώμα και κάθεται στο ίδιο ύψος!
        d.innerHTML = `<span class="chord inline-chord">${c || ""}${safeLyric}</span>`;
    } else {
        // Κανονικό, διώροφο layout (Ακόρντο πάνω, στίχος κάτω)
        let chordHtml = (c && c.trim() !== "") ? `<span class="chord">${c}</span>` : `<span class="chord empty">&nbsp;</span>`;
        let lyricHtml = `<span class="lyric">${safeLyric !== "" ? safeLyric : "&nbsp;"}</span>`;
        
        d.innerHTML = chordHtml + lyricHtml; 
    }
    
    return d; 
}
function toggleLyricsMode() {
    // 1. Αλλαγή της κατάστασης (True/False)
    isLyricsMode = !isLyricsMode;
    
    // 2. Ενημέρωση του CSS (Προσθέτουμε κλάση στο body)
    if (isLyricsMode) {
        document.body.classList.add('lyrics-only');
        if(typeof showToast === 'function') showToast("Lyrics Only: ON");
    } else {
        document.body.classList.remove('lyrics-only');
        if(typeof showToast === 'function') showToast("Lyrics Only: OFF");
    }

    // 3. Οπτική Ενημέρωση του Κουμπιού (Highlight)
    var btn = document.getElementById('btnLyrics');
    if (btn) {
        if (isLyricsMode) btn.classList.add('active-btn'); 
        else btn.classList.remove('active-btn');
    }

    // 4. Αναγκαστικό Render για να ενοποιηθούν οι στίχοι!
    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s) renderPlayer(s);
    }
}
// ===========================================================
// SMART CAPO (COMPLETE & AUTONOMOUS)


function autoCapo() {
    console.log("💡 Smart Capo Triggered");

    // 1. Έλεγχος αν υπάρχει τραγούδι
    if (typeof currentSongId === 'undefined' || !currentSongId) {
        showToast("Open a song first!");
        return;
    }
    
    // 2. Βρίσκουμε το τραγούδι
    var s = library.find(x => x.id === currentSongId);
    if (!s) {
        showToast("Error: Song not found in library.");
        return;
    }

    // 3. Υπολογισμός (Εσωτερική λογική για σιγουριά)
    var bestCapo = calculateOptimalCapo_Safe(s.body);
    console.log("💡 Calculated Best Capo:", bestCapo);

    // 4. Εφαρμογή
    if (bestCapo > 0) {
        state.c = bestCapo; 
        state.t = 0; // Reset Transpose
        
        // Ανανέωση UI
        if (typeof refreshPlayerUI === 'function') refreshPlayerUI();
        else if (typeof renderPlayer === 'function') renderPlayer(s);
        
        // Ενημέρωση αριθμών
        var dValC = document.getElementById('val-c');
        if (dValC) dValC.innerText = state.c;

        showToast("Smart Capo: " + bestCapo + " (Easy Chords)");
    } else {
        showToast("Standard tuning is already best.");
    }
}

// --- ΒΟΗΘΗΤΙΚΗ: ΥΠΟΛΟΓΙΣΜΟΣ (SAFE VERSION) ---
function calculateOptimalCapo_Safe(bodyText) {
    if (!bodyText) return 0;

    var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var openShapes = ["C", "A", "G", "E", "D", "Am", "Em", "Dm"];
    
    // Εύρεση συγχορδιών (Απλοποιημένο Regex)
    var chordsInSong = [];
    var regex = /!([A-G][b#]?)/g; 
    var match;
    while ((match = regex.exec(bodyText)) !== null) {
        var c = match[1].replace("Bb", "A#").replace("Eb", "D#").replace("Ab", "G#").replace("Db", "C#").replace("Gb", "F#");
        chordsInSong.push(c);
    }

    if (chordsInSong.length === 0) return 0;

    var bestCapo = 0;
    var maxScore = -9999;

    for (var capo = 0; capo <= 6; capo++) {
        var currentScore = 0;
        chordsInSong.forEach(function(chord) {
            var idx = NOTES.indexOf(chord);
            if (idx === -1) return;
            
            var newIdx = (idx - capo);
            if (newIdx < 0) newIdx += 12;
            var shape = NOTES[newIdx];

            if (openShapes.includes(shape)) currentScore += 2;
            else if (shape.includes("#")) currentScore -= 2;
        });

        if (currentScore > maxScore) {
            maxScore = currentScore;
            bestCapo = capo;
        }
    }
    return bestCapo;
}

// PDF / PRINT FUNCTION (FINAL PRO STYLE + LOGO + TOKEN SYSTEM + CAPO)
function printSetlistPDF() {
    // 🔒 Έλεγχος Δικαιώματος
    if (typeof canUserPerform === 'function' && !canUserPerform('PRINT')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Εκτύπωση Setlist σε PDF');
        return; 
    }

    if (!liveSetlist || liveSetlist.length === 0) {
        if (typeof showToast === 'function') showToast("Η λίστα είναι άδεια!", "warning");
        return;
    }

    var fullHtmlBody = "";
    const chordRxForTranspose = new RegExp("([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])", "g");

    // Κάνουμε Loop σε όλα τα τραγούδια της τρέχουσας λίστας
    liveSetlist.forEach((item, index) => {
        let songId = typeof item === 'object' ? item.id : item;
        let s = library.find(x => x.id === songId);
        
        if (!s) return; 

        var title = s.title || "Untitled";
        var artist = s.artist || "";
        var bodyRaw = s.body || "";
        
        // 🎵 Τονικότητα
        var key = s.key || "-";
        var transposeVal = s.personal_transpose || 0;
        
        if (typeof getNote === 'function' && key !== "-") {
            key = getNote(key, transposeVal); 
        }
        
         // ✨ Επεξεργασία Intro/Interlude (Απλό κείμενο, όχι ChordPro)
        var introRaw = s.intro || "";
        var interRaw = s.interlude || "";
        var introSectionHtml = "";

        // Νέα, έξυπνη συνάρτηση που καθαρίζει τα ! και [] ΚΑΙ κάνει transpose
        function formatIntroText(text) {
            if (!text) return "";
            
            const chordRxStr = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
            
            // 1. Ομογενοποίηση: Κάνουμε τα [Am] -> !Am για να τα πιάσουμε όλα μαζί
            const bracketRegex = new RegExp(`\\[${chordRxStr}\\]`, 'g');
            text = text.replace(bracketRegex, "!$1 ");

            // 2. Εντοπισμός !Am, Transpose και καθαρισμός συμβόλου
            const bangRegex = new RegExp(`!${chordRxStr}`, 'g');
            return text.replace(bangRegex, (match, chord) => {
                let noteDisp = chord;
                if (transposeVal !== 0 && typeof getNote === 'function') {
                    try { noteDisp = getNote(chord, transposeVal); } catch(e) {}
                }
                // Επιστρέφουμε τη συγχορδία καθαρή, χωρίς σύμβολα
                return `<span class="chord inline-chord" style="margin-right: 5px;">${noteDisp}</span>`;
            });
        }

        if (introRaw.trim() !== "") {
            introSectionHtml += `<div class="intro-line"><strong>Intro:</strong> ${formatIntroText(introRaw)}</div>`;
        }
        if (interRaw.trim() !== "") {
            introSectionHtml += `<div class="intro-line"><strong>Interlude:</strong> ${formatIntroText(interRaw)}</div>`;
        }
        
        let introBlock = introSectionHtml !== "" ? `<div class="intro-section">${introSectionHtml}</div>` : "";

        title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        // 3. Προετοιμασία κειμένου (ChordPro)
        const chordRx = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
        bodyRaw = bodyRaw.replace(new RegExp(`\\[${chordRx}\\]`, 'g'), "!$1 ");
        bodyRaw = bodyRaw.replace(new RegExp(`!${chordRx}!`, 'g'), "!$1 ");

        var lines = bodyRaw.split('\n');
        var htmlBody = "";

        // 4. Χτίσιμο των γραμμών
        lines.forEach(function(line) {
            if (line.trim() === '') {
                htmlBody += '<div class="print-row empty-row">&nbsp;</div>';
                return;
            }

            let rawLyrics = line.replace(new RegExp(`!${chordRx}!?`, 'g'), '');
            let hasText = /[\p{L}]/u.test(rawLyrics); 
            let isChordsOnly = !hasText;
            
            let rowClass = isChordsOnly ? 'print-row chords-only-row' : 'print-row';
            var rowHtml = `<div class="${rowClass}">`;

            if (line.indexOf('!') === -1 || (typeof isLyricsMode !== 'undefined' && isLyricsMode)) { 
                let pureText = line;
                if (typeof isLyricsMode !== 'undefined' && isLyricsMode) {
                    pureText = rawLyrics.replace(/\s{2,}/g, ' ').trim(); 
                }
                let safeText = pureText.replace(/ /g, '&nbsp;'); 
                rowHtml += `<div class="token"><div class="lyric-only">${(safeText && safeText.length > 0) ? safeText : "&nbsp;"}</div></div>`; 
            } else { 
                var parts = line.split('!'); 
                if (parts[0]) {
                    let safeLyric = parts[0].replace(/ /g, '&nbsp;');
                    rowHtml += `<div class="token"><div class="chord empty">&nbsp;</div><div class="lyric">${safeLyric}</div></div>`;
                }
                
                for (var i = 1; i < parts.length; i++) { 
                    var m = parts[i].match(new RegExp(`^${chordRx}\\s?(.*)`)); 
                    if (m) {
                        let chordRaw = m[1];
                        let lyricsRaw = m[2] || ""; 
                        let noteDisp = chordRaw;
                        
                        try {
                            if (typeof getNote === 'function') {
                                noteDisp = getNote(chordRaw, transposeVal);
                            }
                        } catch (err) {}
                        
                        let safeLyric = lyricsRaw ? lyricsRaw.replace(/ /g, '&nbsp;') : "";
                        
                        if (isChordsOnly) {
                            rowHtml += `<div class="token"><div class="chord inline-chord">${noteDisp}${safeLyric}</div></div>`;
                        } else {
                            rowHtml += `<div class="token">
                                            <div class="chord">${noteDisp}</div>
                                            <div class="lyric">${safeLyric !== "" ? safeLyric : "&nbsp;"}</div>
                                        </div>`;
                        }
                    } else {
                        let safePart = parts[i] ? parts[i].replace(/ /g, '&nbsp;') : "&nbsp;";
                        rowHtml += `<div class="token"><div class="chord empty">&nbsp;</div><div class="lyric">${safePart}</div></div>`;
                    }
                } 
            }
            rowHtml += '</div>';
            htmlBody += rowHtml;
        });

        // ✨ 5. Σύνθεση του τραγουδιού
        let pageBreakClass = index < liveSetlist.length - 1 ? 'page-break' : '';
        
        fullHtmlBody += `
            <div class="song-page ${pageBreakClass}">
                <img src="icon-192.png" class="logo" alt="Logo">
                <h1>${title}</h1>
                <h2>${artist}</h2>
                
                <div class="meta-container">
                    <div class="meta">Key: ${key}</div>
                </div>
                
                ${introBlock}
                
                <div class="content">${htmlBody}</div>
            </div>
        `;
    });

    var currentSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {};
    
    // ✨ Αν είναι Lyrics Only, κρύβουμε τις συγχορδίες κλπ.
    var lyricsOnlyCSS = currentSettings.printLyricsOnly ? `
        .chord { display: none !important; }
        .chords-only-row { display: none !important; }
        .meta-container { display: none !important; } 
        .intro-section { display: none !important; } 
    ` : "";

    var css = `
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #111; }
        .song-page { position: relative; padding: 40px; box-sizing: border-box; }
        .page-break { page-break-after: always; break-after: page; }
        .logo { position: absolute; top: 20px; right: 30px; width: 50px; height: auto; opacity: 0.9; z-index: 10; }
        h1 { font-size: 26px; margin: 0 0 5px 0; border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; margin-right: 60px; }
        h2 { font-size: 16px; color: #444; margin: 0 0 20px 0; font-weight: normal; font-style: italic; }
        .meta-container { margin-bottom: 15px; display: flex; gap: 10px; flex-wrap: wrap; }
        .meta { font-size: 13px; color: #333; font-weight: bold; border: 1px solid #ddd; display: inline-block; padding: 4px 8px; border-radius: 4px; }
        .intro-section { margin-bottom: 20px; font-size: 15px; font-family: monospace; font-weight: bold; background: #f5f5f5; padding: 10px; border-left: 3px solid #ccc; border-radius: 4px; }
        .intro-line { margin-bottom: 4px; }
        .intro-line:last-child { margin-bottom: 0; }
        .intro-line strong { color: #555; font-family: 'Arial', sans-serif; }
        .print-row { display: flex; flex-wrap: wrap; align-items: flex-end; margin-bottom: 6px; page-break-inside: avoid; }
        .empty-row { height: 15px; }
        .chords-only-row { align-items: center; } 
        .token { display: flex; flex-direction: column; align-items: flex-start; margin-right: 0; }
        .chord { font-weight: 800; font-size: 13px; color: #000; height: 16px; line-height: 16px; margin-bottom: 1px; font-family: 'Arial', sans-serif; }
        .inline-chord { display: inline-block; height: auto; margin-bottom: 0; }
        .lyric { font-size: 15px; line-height: 1.2; color: #222; font-family: 'Arial', sans-serif; }
        .lyric-only { font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
        @media print {
            @page { margin: 1.5cm; }
            button { display: none; }
            body { padding: 0; }
            .song-page { padding: 0; margin-bottom: 2cm; }
        }
    `;

    // ⚠️ ΑΦΑΙΡΕΘΗΚΕ ΤΟ ΕΝΣΩΜΑΤΩΜΕΝΟ <script> ΑΠΟ ΤΟ HTML
    var htmlContent = `
        <html>
        <head>
            <title>Setlist Print</title>
            <style>
                ${css}
                ${lyricsOnlyCSS}
            </style>
        </head>
        <body>
            ${fullHtmlBody}
        </body>
        </html>
    `;

    // --- ΕΞΥΠΝΗ ΕΚΤΥΠΩΣΗ (MOBILE VS DESKTOP) ---
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        console.log("[PRINT] Ανιχνεύτηκε κινητό. Χρήση κρυφού iframe.");
        var iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();

        iframe.onload = function() {
            setTimeout(function() {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => document.body.removeChild(iframe), 3000);
            }, 500);
        };
    } else {
        console.log("[PRINT] Ανιχνεύτηκε Desktop. Χρήση νέου παραθύρου.");
        var win = window.open('', '', 'width=900,height=1000');
        if (win) {
            win.document.write(htmlContent);
            win.document.close();
            
            // ⚠️ Η ΕΚΤΥΠΩΣΗ ΕΚΤΕΛΕΙΤΑΙ ΜΕΣΑ ΑΠΟ ΤΗ JAVASCRIPT ΤΩΡΑ
            setTimeout(function() {
                win.focus();
                win.print();
                win.close();
            }, 500);
        } else {
            if (typeof showToast === 'function') showToast("Τα αναδυόμενα παράθυρα είναι μπλοκαρισμένα!", "error");
        }
    }
}

// ===========================================================
// 6. EDITOR LOGIC
// ===========================================================

function switchToEditor() {
    // Αποθήκευση κατάστασης: Είμαστε στον Editor
   localStorage.setItem('mnotes_view_state', 'editor');
   
   // ✨ ΕΛΕΓΧΟΣ ΔΙΚΑΙΩΜΑΤΩΝ
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal' && currentSongId) {
        let s = library.find(x => x.id === currentSongId);
        
        if (s && !s.is_clone) {
            const existingClone = library.find(c => c.is_clone && c.parent_id === s.id && c.user_id === currentUser?.id);
            if (existingClone) {
                alert("Υπάρχει ήδη προσωπικός κλώνος για αυτό το τραγούδι.\nΘα μεταφερθείτε αυτόματα σε αυτόν για επεξεργασία.");
                currentSongId = existingClone.id; // 🎯 Αλλάζουμε στόχο στον κλώνο
            } else {
                alert("ΠΡΟΣΟΧΗ: Επεξεργάζεστε το κοινό τραγούδι της μπάντας.\n\nΟποιαδήποτε αλλαγή αποθηκευτεί, θα δημιουργήσει αυτόματα έναν 'Προσωπικό Κλώνο' σας, αφήνοντας το αρχικό τραγούδι άθικτο.");
            }
        }
    }
    
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view');
   
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = true;
    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = false; 
    
    if (typeof applyEditorPlaceholders === 'function') applyEditorPlaceholders();

    if (currentSongId) { 
        var s = library.find(x => x.id === currentSongId); 
        if (s) { 
            refreshSyncButtonVisibility(s);
            let editBody = s.body || "";
            let editIntro = s.intro || "";
            let editInter = s.interlude || "";
            let newKey = s.key || "";
            
            let netTranspose = parseInt(state.t || 0, 10); 
            
            if (netTranspose !== 0 && typeof getNote === 'function') {
                
                // ✨ Η ΕΠΙΣΗΜΗ REGEX ΤΗΣ ΕΦΑΡΜΟΓΗΣ ΣΟΥ (Από renderArea / printSetlistPDF)
                const chordRxStr = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
                
                // 1. Σάρωση για Αγκύλες [Am]
                const bracketRx = new RegExp(`\\[${chordRxStr}\\]`, 'g');
                editBody = editBody.replace(bracketRx, (match, chord) => {
                    // Προστασία λέξεων (π.χ. [Chorus])
                    if (chord.toLowerCase().includes('horus') || chord.toLowerCase().includes('erse')) return match;
                    try { return `[${getNote(chord, netTranspose)}]`; } 
                    catch(e) { return match; }
                });

                // 2. Σάρωση για Θαυμαστικά !Am
                const bangRx = new RegExp(`!${chordRxStr}`, 'g');
                editBody = editBody.replace(bangRx, (match, chord) => {
                    try { return `!${getNote(chord, netTranspose)}`; } 
                    catch(e) { return match; }
                });

                // 3. Σάρωση για Intro/Interlude (Ακριβώς όπως στην εκτύπωση)
                const plainRx = new RegExp(chordRxStr, 'g');
                editIntro = editIntro.replace(plainRx, (match) => {
                    try { return getNote(match, netTranspose); } catch(e) { return match; }
                });
                editInter = editInter.replace(plainRx, (match) => {
                    try { return getNote(match, netTranspose); } catch(e) { return match; }
                });

                // Αλλάζουμε το Key
                if (newKey && newKey !== "-") {
                    try { newKey = getNote(newKey, netTranspose); } catch(e) {}
                }
                
                // Μηδενισμός του τρανσπόρτου για να μη σωθεί διπλά
                state.t = 0;
                if (typeof updateTransDisplay === 'function') updateTransDisplay();
            } 
            
           // --- ΑΝΑΚΤΗΣΗ DRAFT (Αν υπάρχει) ---
            const savedDraftStr = localStorage.getItem('mnotes_draft_' + s.id);
            let draft = null;
            try { if (savedDraftStr) draft = JSON.parse(savedDraftStr); } catch(e){}

            // Πέρασμα στα πεδία (Αν υπάρχει draft, παίρνει το draft, αλλιώς το κανονικό)
            document.getElementById('inpTitle').value = draft ? draft.title : (s.title || ""); 
            document.getElementById('inpArtist').value = draft ? draft.artist : (s.artist || ""); 
            document.getElementById('inpVideo').value = draft ? draft.video : (s.video || ""); 
            document.getElementById('inpKey').value = draft ? draft.key : newKey; 
            document.getElementById('inpBody').value = draft ? draft.body : editBody; 
            document.getElementById('inpIntro').value = draft ? draft.intro : editIntro; 
            document.getElementById('inpInter').value = draft ? draft.inter : editInter; 
            
            if (draft && typeof showToast === 'function') {
                showToast("Ανάκτηση μη αποθηκευμένων αλλαγών (Draft) 📝");
            }
            
            // ✨ ΔΙΟΡΘΩΣΗ 1: Φορτώνουμε τις ΠΡΟΣΩΠΙΚΕΣ Σημειώσεις στον Editor (όχι του Μαέστρου)
            const inpPersonal = document.getElementById('inpPersonalNotes');
            if (inpPersonal) inpPersonal.value = s.notes || ""; 
                                                       
            // ✨ ΔΙΟΡΘΩΣΗ 2: Σωστή ονομασία συνάρτησης & ασφαλής μεταφορά των tags
            editorTags = Array.isArray(s.tags) ? [...s.tags] : []; 
            if(typeof renderTags === 'function') {
                renderTags(); 
            } else {
                console.warn("[Editor] Σφάλμα: Η συνάρτηση renderTags() δεν βρέθηκε!");
            }
        } 
    } else { 
        createNewSong(); 
    }
}
 function renderSidebar() {
    var list = document.getElementById('songList');
    if(!list) return;
    
    list.innerHTML = "";
    visiblePlaylist = [];

    // ✨ Ζητάμε να χτιστεί το Dropdown με τα Tags κάθε φορά που φορτώνει η λίστα
    if (typeof populateTags === 'function') populateTags();

    // ✨ ΒΡΙΣΚΟΥΜΕ ΤΑ ID ΤΩΝ MASTER ΠΟΥ ΕΧΟΥΝ ΚΛΩΝΟ, ΓΙΑ ΝΑ ΤΑ ΚΡΥΨΟΥΜΕ ΑΠΟ ΤΗ ΛΙΣΤΑ!
    const myCloneParentIds = library
        .filter(s => s.group_id === currentGroupId && s.is_clone && s.user_id === currentUser?.id)
        .map(s => s.parent_id);

    // --- 1. FILTERING LOGIC ---
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = library.find(x => x.id === id);
            if (s) visiblePlaylist.push(s);
        });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            // ΦΙΛΤΡΟ CONTEXT
            if (currentGroupId === 'personal') {
                if (s.group_id) return false; // Στα προσωπικά ΜΟΝΟ τα δικά μου
            } else {
                if (s.group_id !== currentGroupId) return false; // Στη μπάντα ΜΟΝΟ της μπάντας
                if (s.is_clone && s.user_id !== currentUser?.id) return false; 
                
                // ✨ ΜΑΓΕΙΑ: Κρύβουμε το Master αν έχουμε φτιάξει δικό μας Κλώνο γι' αυτό!
                if (!s.is_clone && myCloneParentIds.includes(s.id)) {
                    return false; 
                }
            }

            // Απόκρυψη Demo
            if (userSettings.hideDemo && String(s.id).includes("demo") && library.length > 1) return false;
            
            // Έλεγχος Τίτλου / Καλλιτέχνη / Τόνου
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) || 
                           (s.key && s.key.toLowerCase() === txt);
            
            // ✨ ΝΕΟΣ, ΑΛΕΞΙΣΦΑΙΡΟΣ ΕΛΕΓΧΟΣ TAGS
            let matchTag = true;
            if (tag === "__no_demo") {
                matchTag = !String(s.id).includes("demo");
            } else if (tag !== "") {
                let sTags = [];
                if (Array.isArray(s.tags)) sTags = s.tags;
                else if (typeof s.tags === 'string') sTags = s.tags.split(',').map(t => t.trim());
                else if (Array.isArray(s.playlists)) sTags = s.playlists;
                
                matchTag = sTags.includes(tag);
            }
            
            return matchTxt && matchTag;
        });
    }

    // Update Song Count
    const countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;

    // --- 2. RENDERING LIST ITEMS ---
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        
        // A. Classification Logic (Personal / Band / Proposal)
        let originClass = '';
        if (s.is_proposal) {
            originClass = 'proposal-item'; // Dashed Border
        } else if (s.group_id) {
            originClass = 'band-cloud';    // Muted/Orange Border + Icon via CSS
        } else {
            originClass = 'personal-cloud'; // Accent Border
        }

        // B. New Import Highlight
        let isNew = (typeof lastImportedIds !== 'undefined' && lastImportedIds.has(s.id));
        
        // C. Construct Class String
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''} ${originClass} ${isNew ? 'new-import' : ''}`;
        
        li.className = itemClass;
        li.setAttribute('data-id', s.id);

        // D. Click Event
        li.onclick = (e) => {
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-badge')) return;
            if (typeof loadSong === 'function') loadSong(s.id);
            if(window.innerWidth <= 1024) {
                const d = document.getElementById('rightDrawer');
                if(d && d.classList.contains('open') && typeof toggleRightDrawer === 'function') {
                    toggleRightDrawer();
                }
            }
        };

        // E. Display Variables
        var displayTitle = s.title;
        var displayKey = s.key || "-";
        
        // F. Setlist Action Icon
        var actionIcon = "far fa-circle";
        if (viewMode === 'setlist') {
            actionIcon = "fas fa-minus-circle"; 
        } else if (liveSetlist.includes(s.id)) {
            actionIcon = "fas fa-check-circle in-setlist"; 
        }
        
        // G. SMART CLONE BADGES (STAGE-READY)
        let badgesHTML = '';

        if (!String(s.id).includes('demo')) {
             if (s.group_id || (typeof canUserPerform === 'function' && canUserPerform('CLOUD_SYNC'))) {
                  badgesHTML += `<i class="fas fa-cloud badge-cloud" title="Στο Cloud" style="margin-left:8px; font-size:0.75rem; opacity:0.4;"></i>`;
             }
        }
        if (s.personal_transpose && s.personal_transpose !== 0) {
            badgesHTML += `<i class="fas fa-music" title="Αλλαγμένος Τόνος" style="margin-left:8px; font-size:0.75rem; color:var(--accent);"></i>`;
        }
        if (s.is_clone || !!s.parent_id) {
            badgesHTML += `<i class="fas fa-user-edit" title="Προσωπικός Κλώνος" style="margin-left:8px; font-size:0.75rem; color:#ff4444;"></i>`;
        }

        // ✨ ΔΗΜΙΟΥΡΓΙΑ TAGS ΓΙΑ ΤΗ ΛΙΣΤΑ (ΝΕΟ)
        let tagsDisplay = "";
        if (s.tags && Array.isArray(s.tags) && s.tags.length > 0) {
            let displayTags = s.tags.slice(0, 3).join(', '); // Εμφανίζει έως 3 tags
            let extra = s.tags.length > 3 ? "..." : "";
            tagsDisplay = `<div style="font-size:0.7rem; color:var(--accent); margin-top:4px; font-style:italic;">${displayTags}${extra}</div>`;
        }

        // H. HTML Injection (Λίγο πιο τακτοποιημένο)
        li.innerHTML = `
            <i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>
            <div class="song-info">
                <div class="song-title" style="display:flex; align-items:center;">
                     <span style="flex-grow:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayTitle}</span>
                     <span style="white-space:nowrap;">${badgesHTML}</span>
                </div>
                <div class="song-meta-row">
                    <span class="song-artist">${s.artist || "-"}</span>
                    <span class="song-key-badge" onclick="filterByKey(event, '${displayKey}')">${displayKey}</span>
                </div>
                ${tagsDisplay}
            </div>
            ${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}
        `;
        list.appendChild(li);  
    });

    // --- 3. SORTABLE JS RE-INIT ---
    if (sortableInstance) sortableInstance.destroy();
    if(typeof Sortable !== 'undefined') {
        sortableInstance = new Sortable(list, {
            animation: 150,
            handle: '.song-handle', 
            disabled: (viewMode !== 'setlist'), 
            onEnd: function (evt) {
                if (viewMode === 'setlist') {
                    const items = list.querySelectorAll('.song-item');
                    const newOrder = Array.from(items).map(item => item.getAttribute('data-id'));
                    liveSetlist.splice(0, liveSetlist.length, ...newOrder);
                    if (typeof saveSetlists === 'function') saveSetlists();
                    setTimeout(() => { renderSidebar(); }, 50);
                }
            }
        });
    }
}
function refreshSyncButtonVisibility(song) {
    const btnSync = document.getElementById('btnSyncFromBand');
    if (!btnSync) return;

    btnSync.style.display = 'none';
    // Εμφάνιση ΜΟΝΟ αν είμαστε στη Μπάντα ΚΑΙ το τραγούδι είναι Κλώνος
    if (currentGroupId !== 'personal' && song && song.is_clone) {
        btnSync.style.display = 'inline-block';
        btnSync.title = "Συγχρονισμός Κλώνου με Προσωπική Βιβλιοθήκη 🏠";
    }
}

// Σώζει αυτόματα ένα προσωρινό αντίγραφο καθώς πληκτρολογείς
function autoSaveDraft() {
    if (!currentSongId) return;
    
    const draft = {
        title: document.getElementById('inpTitle')?.value || "",
        artist: document.getElementById('inpArtist')?.value || "",
        video: document.getElementById('inpVideo')?.value || "",
        key: document.getElementById('inpKey')?.value || "",
        body: document.getElementById('inpBody')?.value || "",
        intro: document.getElementById('inpIntro')?.value || "",
        inter: document.getElementById('inpInter')?.value || "",
        notes: document.getElementById('inpPersonalNotes')?.value || ""
    };
    
    localStorage.setItem('mnotes_draft_' + currentSongId, JSON.stringify(draft));
    console.log(`[Auto-Save] Το draft για το ${currentSongId} ενημερώθηκε (Size: ${JSON.stringify(draft).length} bytes)`);
}
async function saveEdit() { 
    let bodyArea = document.getElementById('inpBody'); 
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value); 
    
    let oldId = currentSongId; // Κρατάμε το "DNA" πριν το Save

    await saveSong(); // Η logic.js αναλαμβάνει όλη τη μαγεία!
    
    if (typeof populateTags === 'function') populateTags(); 
    
    // Σκουπίζουμε το draft και του Master (oldId) και του Κλώνου (αν άλλαξε το currentSongId)
    if (oldId) localStorage.removeItem('mnotes_draft_' + oldId);
    if (currentSongId) localStorage.removeItem('mnotes_draft_' + currentSongId);
    console.log("[SaveEdit] Τα προσωρινά Drafts καθαρίστηκαν.");
}
function fixTrailingChords(text) { let lines = text.split('\n'); return lines.map(line => { const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; if (line.match(trailingChordRegex)) return line.trimEnd() + "    "; return line; }).join('\n'); }
function createNewSong() { 
    // 1. Καθαρισμός δεδομένων
    currentSongId = null; 
    document.querySelectorAll('.inp').forEach(e => e.value = ""); 
    editorTags = []; 
    if (typeof renderTags === 'function') renderTags(); // Ή renderTagChips ανάλογα πώς την έχεις ονομάσει
    
    // 2. Εναλλαγή προβολής από Player σε Editor
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view'); 
    
    if (typeof applyEditorPlaceholders === 'function') {
        applyEditorPlaceholders();
    }

    // ✨ ΝΕΟ 3: Οπτική μεταφορά στη Σκηνή για τα κινητά!
    if (window.innerWidth <= 1024 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
        console.log("📱 [Mobile] Αυτόματη μεταφορά στον Editor (Stage)");
    }
}
function exitEditor() { 
   // 0. Αποθήκευση κατάστασης: Γυρίσαμε στον Player
    localStorage.setItem('mnotes_view_state', 'player');
    // 0.5 Καθαρίζουμε τυχόν "μισοτελειωμένα" drafts αφού βγήκαμε
    localStorage.removeItem('mnotes_draft_' + currentSongId);
    // 1. Κλείνουμε το συρτάρι των Σημειώσεων (δεν το χρειαζόμαστε ανοιχτό στο Stage)
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = false;

    // 2. Ανοίγουμε το συρτάρι των Συγχορδιών (το χρειαζόμαστε ανοιχτό στο Stage)
    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = true;

    // 3. Η κλασική λογική επιστροφής στον Viewer
    if (currentSongId) {
        loadSong(currentSongId); 
    } else if (library.length > 0) {
        loadSong(library[0].id); 
    } else { 
        // Αν η βιβλιοθήκη είναι εντελώς άδεια
        document.getElementById('view-editor').classList.remove('active-view'); 
        document.getElementById('view-player').classList.add('active-view'); 
    } 
}

// ===========================================================
// TAG SYSTEM & AUTOCOMPLETE (EDITOR)
// ===========================================================

// Παγκόσμια μεταβλητή για τα tags του editor
var editorTags = [];

// 1. Όταν γράφει ο χρήστης (Autocomplete Logic)
function handleTagInput(input) {
    const val = input.value.toLowerCase().trim();
    const suggestionsBox = document.getElementById('tagSuggestions');
    
    // Αν είναι κενό, κρύψε τις προτάσεις
    if (!val) {
        if(suggestionsBox) suggestionsBox.style.display = 'none';
        return;
    }

    // Μαζεύουμε ΟΛΑ τα tags από τη βιβλιοθήκη
    const allTags = new Set();
    if (typeof library !== 'undefined') {
        library.forEach(s => {
            // ✨ ΔΙΟΡΘΩΣΗ: Πιάνουμε Array, Strings και το παλιό σύστημα Playlists
            let sTags = [];
            if (Array.isArray(s.tags)) sTags = s.tags;
            else if (typeof s.tags === 'string') sTags = s.tags.split(',').map(t => t.trim());
            else if (Array.isArray(s.playlists)) sTags = s.playlists;

            sTags.forEach(t => {
                if(t && t.trim() !== '') allTags.add(t.trim());
            });
        });
    }

    // Φιλτράρουμε: Να ταιριάζει με αυτό που γράφεις & Να μην το έχεις ήδη βάλει
    const matches = Array.from(allTags).filter(t => 
        t.toLowerCase().includes(val) && !editorTags.includes(t)
    );

    // Εμφάνιση λίστας
    if (suggestionsBox) {
        suggestionsBox.innerHTML = '';
        if (matches.length > 0) {
            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'tag-suggestion-item'; 
                div.innerText = match;
                div.onclick = () => {
                    addTag(match);
                    input.value = '';
                    suggestionsBox.style.display = 'none';
                    input.focus();
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    }
}

// 2. Όταν πατάει πλήκτρα (Enter ή Κόμμα)
function handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(',', '');
        if (val) {
            addTag(val);
            e.target.value = '';
            const sb = document.getElementById('tagSuggestions');
            if(sb) sb.style.display = 'none';
        }
    }
}

// 3. Προσθήκη Tag στη μνήμη και εμφάνιση
function addTag(tag) {
    if (!tag) return;
    if (!editorTags.includes(tag)) {
        editorTags.push(tag);
        renderTags();
    }
}

// 4. Αφαίρεση Tag
function removeTag(tag) {
    editorTags = editorTags.filter(t => t !== tag);
    renderTags();
}

// 5. Ζωγράφισμα των Tags (Chips)
function renderTags() {
    const container = document.getElementById('tagChips');
    const hiddenInp = document.getElementById('inpTags');
    
    if (container) {
        container.innerHTML = '';
        editorTags.forEach(t => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `${t} <i class="fas fa-times" onclick="removeTag('${t}')"></i>`;
            container.appendChild(chip);
        });
    }
    
    // Ενημέρωση του κρυφού πεδίου για την αποθήκευση
    if (hiddenInp) {
        hiddenInp.value = editorTags.join(',');
    }
}

// Βοηθητικό: Κλείσιμο μενού αν κάνω κλικ αλλού
document.addEventListener('click', function(e) {
    const sb = document.getElementById('tagSuggestions');
    const inp = document.getElementById('tagInput');
    if (sb && e.target !== inp && e.target !== sb) {
        sb.style.display = 'none';
    }
});

// ===========================================================
// 7. RECORDING (AUDIO & CLOUD)
// ===========================================================
async function toggleRecording() {
    // 🔒 Έλεγχος Δικαιώματος
    if (typeof canUserPerform === 'function' && !canUserPerform('SAVE_ATTACHMENTS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Εγγραφή & Αποθήκευση Ήχου');
        return; 
    }

    const btn = document.getElementById('btnRecord');
    const timer = document.getElementById('recTimer');
    const btnLink = document.getElementById('btnLinkRec');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.classList.remove('recording-active');
        timer.style.color = "var(--text-muted)";
        clearInterval(recTimerInterval);
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = []; currentRecordedBlob = null;
        if(btnLink) btnLink.style.display = 'none';

        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
        mediaRecorder.onstop = () => {
            // 1. Δημιουργία του αρχείου
            currentRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // ✨ ΝΕΟ 2: Προβολή στον Master Player για προεπισκόπηση!
            const audioUrl = URL.createObjectURL(currentRecordedBlob);
            const masterPlayer = document.getElementById('masterAudio');
            if (masterPlayer) {
                masterPlayer.src = audioUrl;
                const customUI = document.getElementById('customPlayerUI');
                if (customUI) customUI.style.display = 'flex'; 
            }

            // ✨ ΝΕΟ 3: Εμφάνιση Κουμπιών (Upload & Κάδος)
            const btnLink = document.getElementById('btnLinkRec');
            const btnDiscard = document.getElementById('btnDiscardRec');
            
            // Το Upload εμφανίζεται μόνο αν είμαστε σε τραγούδι και logged in (η παλιά σου λογική)
            if (currentSongId && typeof currentUser !== 'undefined' && currentUser) { 
                if (btnLink) btnLink.style.display = 'flex'; 
            }
            
            // Ο Κάδος εμφανίζεται πάντα, ώστε να μπορείς να πετάξεις την εγγραφή
            if (btnDiscard) btnDiscard.style.display = 'flex';
        };
        mediaRecorder.start();
        btn.classList.add('recording-active'); btn.innerHTML = '<i class="fas fa-stop"></i>'; timer.style.color = "var(--danger)"; 
        recStartTime = Date.now(); recTimerInterval = setInterval(() => { const diff = Math.floor((Date.now() - recStartTime) / 1000); const m = Math.floor(diff / 60).toString().padStart(2,'0'); const s = (diff % 60).toString().padStart(2,'0'); timer.innerText = `${m}:${s}`; }, 1000);
    } catch (err) { alert("Microphone Error: " + err.message); }
}

// --- ΑΚΥΡΩΣΗ & ΚΑΘΑΡΙΣΜΟΣ ΕΓΓΡΑΦΗΣ ---
function discardCurrentRecording() {
    // 1. Καθαρίζουμε τον Player
    const masterPlayer = document.getElementById('masterAudio');
    if (masterPlayer) {
        masterPlayer.src = "";
        }
       const customUI = document.getElementById('customPlayerUI');
       if (customUI) customUI.style.display = 'none';
    
    // 2. Κρύβουμε τα κουμπιά
    const btnLink = document.getElementById('btnLinkRec');
    const btnDiscard = document.getElementById('btnDiscardRec');
    if (btnLink) btnLink.style.display = 'none';
    if (btnDiscard) btnDiscard.style.display = 'none';
    
    // 3. Μηδενίζουμε το Timer
    const recTimer = document.getElementById('recTimer');
    if (recTimer) recTimer.innerText = "00:00";
    
    // 4. Αδειάζουμε τη μνήμη
    if (typeof audioChunks !== 'undefined') {
        audioChunks = [];
    }
    currentRecordedBlob = null;
    
    if (typeof showToast === 'function') showToast("Η εγγραφή ακυρώθηκε. Δεν ανέβηκε τίποτα.");
}
// Ανέβασμα στο Cloud
async function uploadAndLinkCurrent() {
    if (!currentRecordedBlob) { showToast("No recording!"); return; }
    if (!currentSongId) { showToast("Select song!"); return; }
    if (typeof currentUser === 'undefined' || !currentUser) { document.getElementById('authModal').style.display='flex'; return; }
    
    // --- 1. Η ΣΦΡΑΓΙΔΑ ---
    const targetSongId = currentSongId;
    const s = library.find(x => x.id === targetSongId);
    if (!s) return;

    if (!confirm(`Save to "${s.title}" in Cloud?`)) return;
    
    const btnLink = document.getElementById('btnLinkRec');
    btnLink.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    btnLink.style.opacity = '0.7';
    
    if (!s.recordings) s.recordings = [];
    const takeNum = s.recordings.length + 1;
    
    // Δίνουμε ένα όνομα που θα έχει νόημα μέσα στο γενικό Media Library
    const assetLibraryName = `Mic Take ${takeNum} - ${s.title}`;
    const filename = `Mic_${targetSongId}_Take${takeNum}_${Date.now()}.webm`;

    try {
        // Βήμα Α: Upload στο Storage
        const { data, error } = await supabaseClient.storage.from('audio_files').upload(`${currentUser.id}/${filename}`, currentRecordedBlob);
        if (error) throw error; 

        const { data: { publicUrl } } = supabaseClient.storage.from('audio_files').getPublicUrl(`${currentUser.id}/${filename}`);
        
        // --- 2. ΝΕΟ: Αποθήκευση στον πίνακα user_assets (Media Library) ---
        const { error: dbErr } = await supabaseClient
            .from('user_assets')
            .insert([{
                user_id: currentUser.id,
                custom_name: assetLibraryName,
                file_url: publicUrl,
                file_type: 'audio'
            }]);
        if (dbErr) console.warn("Asset Library Warning:", dbErr); // Δεν διακόπτουμε το save αν απλά απέτυχε η βιβλιοθήκη

        // Βήμα Β: Σύνδεση με το τραγούδι
        const newRec = { id: Date.now(), name: `Take ${takeNum}`, url: publicUrl, date: Date.now() };
        
        if (typeof addRecordingToCurrentSong === 'function') {
             await addRecordingToCurrentSong(newRec);
        } else {
             if (typeof saveData === 'function') saveData(); 
        }
        
        showToast(`Take ${takeNum} Saved! ☁️`);
        btnLink.style.display = 'none'; 
        
        // --- 3. Αποφυγή του AbortError ---
        // Ανανεώνουμε ΜΟΝΟ τη λίστα ηχητικών και ΜΟΝΟ αν ο χρήστης βλέπει ακόμα αυτό το τραγούδι
        if (currentSongId === targetSongId && typeof renderRecordingsList === 'function') {
            renderRecordingsList(s.recordings, []);
        }

    } catch(e) {
         console.error("Upload Error:", e);
         showToast("Upload Error: " + e.message, "error");
         btnLink.style.opacity = '1'; 
         btnLink.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
    } finally {
        // Καθαρίζουμε το μνήμη από το Blob για να είναι έτοιμο για επόμενη εγγραφή
        currentRecordedBlob = null;
        btnLink.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
        btnLink.style.opacity = '1';
        
       // Κρύβουμε τον Κάδο και καθαρίζουμε τον Player μετά από επιτυχές (ή αποτυχημένο) upload
        const btnDiscard = document.getElementById('btnDiscardRec');
        if (btnDiscard) btnDiscard.style.display = 'none';
        
        const masterPlayer = document.getElementById('masterAudio');
        if (masterPlayer) {
            masterPlayer.src = "";
            const customUI = document.getElementById('customPlayerUI');
            if (customUI) customUI.style.display = 'none';
        }
    }
}
// ===========================================================
// 8. SETLIST MANAGER (CONTEXT AWARE & CLOUD SYNC)
// ===========================================================

function getSetlistStorageKey() {
    return currentGroupId === 'personal' ? 'mnotes_personal_setlists' : `mnotes_band_setlists_${currentGroupId}`;
}

function getActiveSetlistNameKey() {
    return currentGroupId === 'personal' ? 'mnotes_active_personal_setlist' : `mnotes_active_band_setlist_${currentGroupId}`;
}

async function initSetlists() {
    console.log(`[SETLISTS] Αρχικοποίηση λιστών για context: ${currentGroupId}`);
    const storageKey = getSetlistStorageKey();
    
    // 1. OFFLINE FIRST: Άμεση φόρτωση από την τοπική μνήμη
    allSetlists = JSON.parse(localStorage.getItem(storageKey)) || {};
    
    // 2. CLOUD SYNC: Ανάκτηση από τη βάση αν υπάρχει σύνδεση
    if (typeof currentUser !== 'undefined' && currentUser && navigator.onLine) {
        try {
            if (currentGroupId === 'personal') {
                const { data } = await supabaseClient.from('profiles').select('setlists').eq('id', currentUser.id).maybeSingle();
                if (data && data.setlists && Object.keys(data.setlists).length > 0) {
                    allSetlists = data.setlists;
                    localStorage.setItem(storageKey, JSON.stringify(allSetlists));
                    console.log("[SETLISTS] Οι προσωπικές λίστες συγχρονίστηκαν από το Cloud.");
                }
            } else {
                const { data } = await supabaseClient.from('groups').select('setlists').eq('id', currentGroupId).maybeSingle();
                if (data && data.setlists && Object.keys(data.setlists).length > 0) {
                    allSetlists = data.setlists;
                    localStorage.setItem(storageKey, JSON.stringify(allSetlists));
                    console.log(`[SETLISTS] Οι λίστες της μπάντας (${currentGroupId}) συγχρονίστηκαν από το Cloud.`);
                }
            }
        } catch (err) { 
            console.error("[SETLISTS] Σφάλμα κατά το συγχρονισμό:", err); 
        }
    }

    // 3. Δημιουργία προεπιλεγμένης λίστας αν όλα είναι άδεια
    if (Object.keys(allSetlists).length === 0) { 
        allSetlists["Default Setlist"] = { type: 'local', songs: [] }; 
    }
    
    Object.keys(allSetlists).forEach(key => { 
        if (Array.isArray(allSetlists[key])) allSetlists[key] = { type: 'local', songs: allSetlists[key] }; 
    });
    
    const activeNameKey = getActiveSetlistNameKey();
    var currentSetlistName = localStorage.getItem(activeNameKey) || Object.keys(allSetlists)[0];
    if (!allSetlists[currentSetlistName]) currentSetlistName = Object.keys(allSetlists)[0];
    
    // ✨ ΔΙΟΡΘΩΣΗ & ΚΑΘΑΡΙΣΜΟΣ SETLIST: 
    // Μετατρέπουμε τυχόν παλιά αποθηκευμένα objects σε καθαρά IDs (Strings)
    let rawSongs = allSetlists[currentSetlistName].songs || [];
    liveSetlist = rawSongs.map(item => {
        if (typeof item === 'object' && item !== null) {
            console.log(`🧹 [SETLIST CLEANUP] Διορθώθηκε αντικείμενο σε καθαρό ID: ${item.id}`);
            return item.id;
        }
        return item; // Αν είναι ήδη string (ID), το αφήνει ως έχει
    }).filter(Boolean); // Φιλτράρει τυχόν null/undefined
    
    if (typeof updateSetlistDropdown === 'function') updateSetlistDropdown();
}

function updateSetlistDropdown() {
    const sel = document.getElementById('selSetlistName'); 
    if(!sel) return; 
    sel.innerHTML = "";
    
    var currentSetlistName = localStorage.getItem(getActiveSetlistNameKey());
    Object.keys(allSetlists).forEach(name => {
        const listObj = allSetlists[name];
        const opt = document.createElement('option'); opt.value = name;
        const icon = (currentGroupId !== 'personal') ? '👥' : '📝';
        opt.innerText = `${icon} ${name} (${listObj.songs.length})`;
        if(name === currentSetlistName) opt.selected = true;
        sel.appendChild(opt);
    });
    updateSetlistButtons();
}

function updateSetlistButtons() {
    const isBandViewer = (currentGroupId !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner');
    const btnDel = document.getElementById('btnDelSetlist'); 
    const btnRen = document.getElementById('btnRenSetlist');
    
    if(btnDel) { btnDel.disabled = isBandViewer; btnDel.style.opacity = isBandViewer ? '0.3' : '1'; }
    if(btnRen) { btnRen.disabled = isBandViewer; btnRen.style.opacity = isBandViewer ? '0.3' : '1'; }
}

function switchSetlist(name) {
    if(!allSetlists[name]) return;
    liveSetlist = allSetlists[name].songs || [];
    localStorage.setItem(getActiveSetlistNameKey(), name);
    renderSidebar(); 
    updateSetlistButtons();
}

function createSetlist() {
    // 1. Έλεγχος Δικαιωμάτων Μπάντας (αν είμαστε σε μπάντα)
    const isBandViewer = (currentGroupId !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner');
    if (isBandViewer) {
        showToast("Μόνο οι διαχειριστές μπορούν να φτιάξουν λίστες για τη μπάντα.", "error");
        return;
    }

    // ✨ 2. ΕΛΕΓΧΟΣ ΟΡΙΩΝ PAYWALL (Μόνο για την Προσωπική Βιβλιοθήκη)
    if (currentGroupId === 'personal') {
        // Υπολογίζουμε πόσες CUSTOM λίστες έχει (αφαιρούμε 1 για τη "Default Setlist" που έχουν όλοι)
        const customListsCount = Object.keys(allSetlists).length - 1; 
        
        // Ρωτάμε τον Πορτιέρη αν δικαιούται κι άλλη (χρησιμοποιώντας το νέο όνομα currentCount)
        if (typeof canUserPerform === 'function' && !canUserPerform('CREATE_SETLIST', customListsCount)) {
            if (typeof promptUpgrade === 'function') {
                promptUpgrade('Δημιουργία πολλαπλών Playlists');
            } else {
                alert("Έχετε φτάσει το όριο λιστών για το τρέχον πακέτο σας.");
            }
            return; 
        }
    }

    // 3. Κανονική Ροή δημιουργίας
    const name = prompt(typeof t === 'function' ? t('msg_new_setlist') : "Όνομα νέας λίστας:");
    if (name && !allSetlists[name]) {
        allSetlists[name] = { type: 'local', songs: [] }; 
        liveSetlist = []; 
        switchSetlist(name);
        saveSetlists(name);
    } else if (allSetlists[name]) {
        alert("Υπάρχει ήδη λίστα με αυτό το όνομα!");
    }
}

function renameSetlist() {
    var currentSetlistName = localStorage.getItem(getActiveSetlistNameKey());
    const newName = prompt(typeof t === 'function' ? t('msg_rename_setlist') : "Μετονομασία σε:", currentSetlistName);
    if (newName && newName !== currentSetlistName && !allSetlists[newName]) {
        allSetlists[newName] = allSetlists[currentSetlistName]; 
        delete allSetlists[currentSetlistName];
        localStorage.setItem(getActiveSetlistNameKey(), newName); 
        saveSetlists(newName); 
        updateSetlistDropdown();
    }
}

function deleteSetlist() {
    var currentSetlistName = localStorage.getItem(getActiveSetlistNameKey());
    if (Object.keys(allSetlists).length <= 1) { 
        showToast("Δεν μπορείτε να διαγράψετε την τελευταία λίστα."); 
        return; 
    }
    if (confirm(`Διαγραφή της λίστας "${currentSetlistName}";`)) {
        delete allSetlists[currentSetlistName]; 
        const fallbackName = Object.keys(allSetlists)[0];
        switchSetlist(fallbackName); 
        saveSetlists(fallbackName); 
        updateSetlistDropdown();
    }
}

async function saveSetlists(activeName) {
    const activeNameKey = getActiveSetlistNameKey();
    var name = activeName || localStorage.getItem(activeNameKey);
    if(allSetlists[name]) allSetlists[name].songs = liveSetlist;
    
    // 1. Τοπική αποθήκευση (ακαριαία)
    localStorage.setItem(getSetlistStorageKey(), JSON.stringify(allSetlists));
    if (activeName) localStorage.setItem(activeNameKey, activeName);
    
    // 2. Συγχρονισμός με Supabase (στο παρασκήνιο)
    if (typeof currentUser !== 'undefined' && currentUser && navigator.onLine) {
        if (currentGroupId === 'personal') {
            supabaseClient.from('profiles').update({ setlists: allSetlists }).eq('id', currentUser.id).then(({error}) => {
                if (error) console.error("[SETLISTS] Cloud Setlist Update Error:", error);
                else console.log("[SETLISTS] Προσωπικές λίστες αποθηκεύτηκαν στο Cloud.");
            });
        } else {
            const isGod = (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');
            if (isGod) {
                supabaseClient.from('groups').update({ setlists: allSetlists }).eq('id', currentGroupId).then(({error}) => {
                    if (error) console.error("[SETLISTS] Band Setlist Update Error:", error);
                    else console.log(`[SETLISTS] Λίστες μπάντας αποθηκεύτηκαν στο Cloud.`);
                });
            }
        }
    }
}

function toggleSetlistSong(e, id) { 
    e.stopPropagation(); 
    
    const isBandViewer = (currentGroupId !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner');
    if (isBandViewer) {
        showToast("Μόνο οι διαχειριστές μπορούν να επεξεργαστούν τη λίστα της μπάντας.", "error");
        return;
    }

    var i = liveSetlist.indexOf(id); 
    if(i > -1) liveSetlist.splice(i,1); else liveSetlist.push(id); 
    saveSetlists(); 
    renderSidebar(); 
    if(viewMode === 'setlist') updateSetlistDropdown(); 
}

function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${mode}`).classList.add('active');
    if (mode === 'setlist') {
        document.getElementById('library-controls').style.display = 'none';
        const setCtrl = document.getElementById('setlist-controls'); if(setCtrl) { setCtrl.style.display = 'flex'; updateSetlistDropdown(); }
    } else {
        document.getElementById('library-controls').style.display = 'flex';
        const setCtrl = document.getElementById('setlist-controls'); if(setCtrl) setCtrl.style.display = 'none';
    }
    renderSidebar();
}

function navSetlist(dir) {
    // Κοιτάμε τη λίστα που βλέπει ΠΡΑΓΜΑΤΙΚΑ ο χρήστης (Βιβλιοθήκη, Φίλτρα, ή Setlist)
    if (!visiblePlaylist || visiblePlaylist.length === 0) { 
        if (typeof showToast === 'function') showToast("Η λίστα είναι άδεια!"); 
        return; 
    }
    
    // Βρίσκουμε πού βρισκόμαστε αυτή τη στιγμή μέσα στη λίστα
    let currentIndex = visiblePlaylist.findIndex(s => s.id === currentSongId);
    let newIndex = currentIndex + dir;
    
    // Αν υπάρχει επόμενο/προηγούμενο, το φορτώνουμε
    if (newIndex >= 0 && newIndex < visiblePlaylist.length) { 
        loadSong(visiblePlaylist[newIndex].id); 
    } else { 
        // Αλλιώς βγάζουμε μήνυμα ότι φτάσαμε στο τέρμα
        if (typeof showToast === 'function') {
            showToast(dir > 0 ? "Τέλος Λίστας" : "Αρχή Λίστας"); 
        }
    }
}

// ===========================================================
// 10. VISUAL HELPERS (Sticky, Audio List)
// ===========================================================

function cycleIntroSize() {
    // Σιγουρευόμαστε ότι διαβάζει αριθμό
    window.introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;
    
    // Αλλαγή: 0 -> 1 -> 2 -> 0
    window.introSizeLevel = (window.introSizeLevel + 1) % 3;
    localStorage.setItem('mnotes_intro_size', window.introSizeLevel);
    
    // Ξαναφορτώνουμε τον Player
    if (typeof currentSongId !== 'undefined' && currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            renderPlayer(s);
        }
    }
}
// ===========================================================
// ΕΝΙΑΙΑ ΔΙΑΓΡΑΦΗ ΜΕΣΩΝ ΚΑΙ ΑΡΧΕΙΩΝ (CLOUD & LOCAL)
// ===========================================================
// ===========================================================
// ΕΝΙΑΙΑ ΑΠΟΣΥΝΔΕΣΗ ΜΕΣΩΝ ΚΑΙ ΑΡΧΕΙΩΝ (DETACH)
// ===========================================================
window.deleteMediaItem = async function(songId, type, itemIndex) {
    const s = library.find(x => x.id === songId);
    if (!s || !s[type] || !s[type][itemIndex]) return;

    const item = s[type][itemIndex];
    const isPrivate = (item.origin === 'private' || !item.origin);

    // Δίγλωσσο μήνυμα αποσύνδεσης
    if (!confirm(`Αποσύνδεση του "${item.name || 'αρχείου'}" από το τραγούδι; (Θα παραμείνει στη Βιβλιοθήκη σας) \n\nDetach file from song? (It will remain in your Library)`)) return;

    // 1. Αφαίρεση από το UI (χωρίς να σκοτώνουμε τον player)
    s[type].splice(itemIndex, 1);
    
    if (type === 'recordings' && typeof renderRecordingsList === 'function') {
        renderRecordingsList(s.recordings, []);
    } else if (type === 'attachments' && typeof renderAttachmentsList === 'function') {
        renderAttachmentsList(s.attachments);
    }

    // 2. Αποκλειστικός Συγχρονισμός με το Cloud (Supabase)
    try {
        if (currentGroupId === 'personal') {
            await supabaseClient.from('songs').update({ [type]: s[type] }).eq('id', songId);
        } else {
            // BAND CONTEXT
            if (isPrivate) {
                // Διαγραφή από τα προσωπικά Overrides
                const { data: myOverride } = await supabaseClient.from('personal_overrides')
                    .select(`id, ${type}`).eq('user_id', currentUser.id).eq('song_id', songId).eq('group_id', currentGroupId).maybeSingle();
                
                if (myOverride) {
                    let updatedArray = (myOverride[type] || []).filter(i => i.url !== item.url);
                    await supabaseClient.from('personal_overrides').update({ [type]: updatedArray }).eq('id', myOverride.id);
                }
            } else {
                // Διαγραφή από τα Κοινά (Public)
                const { data: globalSong } = await supabaseClient.from('songs').select(type).eq('id', songId).maybeSingle();
                if (globalSong) {
                    let updatedArray = (globalSong[type] || []).filter(i => i.url !== item.url);
                    await supabaseClient.from('songs').update({ [type]: updatedArray }).eq('id', songId);
                }
            }
        }
        showToast("Αποσυνδέθηκε επιτυχώς. / Successfully detached.");
    } catch(e) {
        console.error("Detach Error:", e);
        showToast("Σφάλμα συγχρονισμού / Sync error", "error");
    }
};

// --- ΕΜΦΑΝΙΣΗ ΗΧΗΤΙΚΩΝ ΑΡΧΕΙΩΝ ---

function renderRecordingsList(recs = []) {
    const listEl = document.getElementById('sideRecList'); 
    if (!listEl) return;
    
    listEl.innerHTML = ''; 
    let hasItems = false;
    
    recs.forEach((rec, index) => {
        const el = document.createElement('div'); 
        el.className = 'track-item'; 
        
        const isPrivate = (rec.origin === 'private' || !rec.origin);
        const colorVar = isPrivate ? '#ffb74d' : '#4db6ac'; // Πορτοκαλί για private, Τιρκουάζ για public
        const iconClass = isPrivate ? 'fas fa-lock' : 'fas fa-globe';
        const tooltip = isPrivate ? 'Private Track' : 'Public Band Track';
        
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${colorVar};`;
        
        const safeObjStr = encodeURIComponent(JSON.stringify(rec));
        
        // Κουμπί Share/Propose για ήχους
        let promoteBtnHtml = '';
        if (isPrivate && typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
            promoteBtnHtml = `<button onclick="promoteItem('${currentSongId}', 'recordings', &quot;${safeObjStr}&quot;)" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px; font-size:1.1rem;" title="Share / Propose"><i class="fas fa-bullhorn"></i></button>`;
        }

        // Έλεγχος αν επιτρέπεται η διαγραφή
        const isOwnerOrAdmin = (typeof currentRole !== 'undefined' && (currentRole === 'owner' || currentRole === 'admin'));
        const canDelete = isPrivate || currentGroupId === 'personal' || isOwnerOrAdmin;

        let deleteBtnHtml = '';
        if (canDelete) {
            deleteBtnHtml = `<button onclick="deleteMediaItem('${currentSongId}', 'recordings', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="Delete"><i class="fas fa-times"></i></button>`;
        }
         
        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${rec.url}', '${rec.name || rec.label}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="Download"><i class="fas fa-download"></i></button>`;
        
       el.innerHTML = `
            <div onclick="playAudio('${rec.url}')" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="${tooltip}">
                <i class="${iconClass}" style="color:${colorVar}; margin-right:8px;"></i>
                <span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rec.name || rec.label}</span>
            </div>
            <div style="display:flex; align-items:center;">
                ${downloadBtnHtml}
                ${promoteBtnHtml}
                ${deleteBtnHtml}
            </div>
        `;
        listEl.appendChild(el); 
        hasItems = true;
    });
    
    if (!hasItems) listEl.innerHTML = '<div class="empty-state">No recordings yet</div>';
}
// --- ΕΜΦΑΝΙΣΗ ΑΡΧΕΙΩΝ & ΠΑΡΤΙΤΟΥΡΩΝ ---

function renderAttachmentsList(docs = []) {
    const listEl = document.getElementById('list-sheets'); 
    if (!listEl) return;
    
    listEl.innerHTML = ''; 
    let hasItems = false;
    
    docs.forEach((doc, index) => {
        const el = document.createElement('div'); 
        el.className = 'track-item'; 
        
        // Οπτικός διαχωρισμός Private (Πορτοκαλί) vs Public (Μωβ)
        const isPrivate = (doc.origin === 'private' || !doc.origin);
        const borderColor = isPrivate ? '#ffb74d' : '#9c27b0';
        const tooltip = isPrivate ? 'Private (Μόνο για σένα)' : 'Public (Κοινό της μπάντας)';
        
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${borderColor};`;
        
        const iconClass = (doc.type && doc.type.includes('image')) ? 'fas fa-image' : 'fas fa-file-pdf';
        
        // Κωδικοποίηση για να περάσει το αντικείμενο με ασφάλεια στη συνάρτηση
        const safeObjStr = encodeURIComponent(JSON.stringify(doc));

        // Κουμπί Share/Propose
        let promoteBtnHtml = '';
        if (isPrivate && typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
            promoteBtnHtml = `<button onclick="promoteItem('${currentSongId}', 'attachments', &quot;${safeObjStr}&quot;)" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px; font-size:1.1rem;" title="Share / Propose"><i class="fas fa-bullhorn"></i></button>`;
        }

        // Έλεγχος αν επιτρέπεται η διαγραφή
        const isOwnerOrAdmin = (typeof currentRole !== 'undefined' && (currentRole === 'owner' || currentRole === 'admin'));
        const canDelete = isPrivate || currentGroupId === 'personal' || isOwnerOrAdmin;

        let deleteBtnHtml = '';
        if (canDelete) {
            deleteBtnHtml = `<button onclick="deleteMediaItem('${currentSongId}', 'attachments', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="Delete"><i class="fas fa-times"></i></button>`;
        }

        // ✨ ΔΙΟΡΘΩΣΗ: Ορισμός του τύπου αρχείου μία φορά
        const docFileType = (doc.type && doc.type.toLowerCase().includes('image')) ? 'image' : 'pdf';
        
        // Κουμπί Download
        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${doc.url}', '${doc.name}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="Download"><i class="fas fa-download"></i></button>`;

        el.innerHTML = `
            <div onclick="FloatingTools.loadContent('${doc.url}', '${docFileType}')" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="${tooltip}">
                <i class="${iconClass}" style="color:${borderColor}; margin-right:8px;"></i>
                <span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${doc.name}</span>
            </div>
            <div style="display:flex; align-items:center;">
                ${downloadBtnHtml}
                ${promoteBtnHtml}
                ${deleteBtnHtml}
            </div>
        `;
        listEl.appendChild(el);
        hasItems = true;
    });

    if (!hasItems) {
        listEl.innerHTML = '<div class="empty-state" data-i18n="msg_no_attachments">No attachments</div>';
    }
}
function playAudio(url) { const audio = document.getElementById('masterAudio'); if(audio) { audio.src = url; audio.play(); } }

function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea'); 
    const condText = document.getElementById('conductorNoteText'); 
    const persText = document.getElementById('personalNoteText');
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}'); 
    const myNote = personalNotesMap[s.id] || "";
    
    // Στυλ πραγματικού Post-it + Cursor Pointer + Onclick για κλείσιμο
    stickyArea.style.cssText = "display:none; position:absolute; top:70px; left:15px; right:15px; background:#fff9c4; color:#000; border:1px solid #fbc02d; padding:15px; border-radius:4px; z-index:100; box-shadow:0 10px 25px rgba(0,0,0,0.5); cursor:pointer;";
    stickyArea.title = "Πατήστε πάνω στη σημείωση για να κλείσει";
    stickyArea.onclick = toggleStickyNotes; // Κλείνει με κλικ!
    
    if (s.conductorNotes) { 
        condText.style.display = 'block'; 
        condText.innerHTML = `<b style="color:#c62828;"><i class="fas fa-bullhorn"></i> Band Notes:</b><br><span style="color:#111; white-space:pre-wrap; font-size:0.95rem;">${s.conductorNotes}</span>`; 
    } else { 
        condText.style.display = 'none'; 
    }
    
    if (myNote) { 
        persText.style.display = 'block'; 
        persText.style.marginTop = s.conductorNotes ? "12px" : "0"; // Απόσταση αν υπάρχουν και τα δύο
        persText.innerHTML = `<b style="color:#1565c0;"><i class="fas fa-user-edit"></i> My Notes:</b><br><span style="color:#111; white-space:pre-wrap; font-size:0.95rem;">${myNote}</span>`; 
    } else { 
        persText.style.display = 'none'; 
    }
}

function toggleStickyNotes() { 
    const area = document.getElementById('stickyNotesArea'); 
    if (area) { 
        area.style.display = (area.style.display === 'none' || area.style.display === '') ? 'block' : 'none'; 
    } 
}
async function savePerformanceNotes() {
    if (!currentSongId) {
        showToast("Επιλέξτε τραγούδι πρώτα!", "error");
        return;
    }
    
    const bNotesVal = document.getElementById('sideBandNotes')?.value.trim() || "";
    const pNotesVal = document.getElementById('sidePersonalNotes')?.value.trim() || "";
    
    // 1. Σώζουμε τα Personal Notes Τοπικά (Για offline/γρήγορη πρόσβαση)
    const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    if (pNotesVal) map[currentSongId] = pNotesVal;
    else delete map[currentSongId];
    localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));
    
    // 2. Ενημέρωση μνήμης
    const s = library.find(x => x.id === currentSongId);
    if (s) {
        s.conductorNotes = bNotesVal;
        s.personal_notes = pNotesVal;
    }

    // 3. Συγχρονισμός Cloud
    if (currentGroupId !== 'personal') {
        const canEditBand = (currentRole === 'admin' || currentRole === 'owner');
        
        // Αν είναι Admin/Owner, σώζει τα Band Notes στον πίνακα 'songs'
        if (canEditBand && typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            try {
                await supabaseClient.from('songs').update({ notes: bNotesVal }).eq('id', currentSongId);
            } catch(e) { console.error("Notes Sync Error:", e); }
        }
        
        // Όλοι (και οι Members) σώζουν τα δικά τους Personal Notes στα Overrides!
        if (typeof saveAsOverride === 'function') {
            await saveAsOverride(s);
        }
    }

    showToast("Οι σημειώσεις αποθηκεύτηκαν! 📌");
    
    // Refresh τον Player για να εμφανιστεί/κρυφτεί το κουμπί
    if (s) renderPlayer(s); 
}
// ===========================================================
// 11. MOBILE NAVIGATION & DRAWER
// ===========================================================

// --- PERSISTENT DRAWERS UI LOGIC ---

function setupDrawerPersistence() {
    // 1. Επαναφορά από τη μνήμη κατά την εκκίνηση
    const savedStates = getSavedDrawerStates(); // Κλήση από storage.js
    
    document.querySelectorAll('details.tool-group').forEach(details => {
        const id = details.id;
        // Αν υπάρχει σωσμένη κατάσταση, την εφαρμόζουμε
        if (id && savedStates[id] !== undefined) {
            details.open = savedStates[id];
        }

        // 2. Παρακολούθηση αλλαγών (Toggle Event)
        details.addEventListener('toggle', () => {
            if (details.id) {
                saveDrawerState(details.id, details.open); // Κλήση από storage.js
            }
        });
    });
}
// --- ΔΙΑΧΕΙΡΙΣΗ ΚΑΤΑΣΤΑΣΗΣ DRAWERS ---

function saveDrawerState(drawerId, isOpen) {
    const states = JSON.parse(localStorage.getItem('mnotes_drawer_states')) || {};
    states[drawerId] = isOpen;
    localStorage.setItem('mnotes_drawer_states', JSON.stringify(states));
    console.log(`💾 [Storage] Κατάσταση ${drawerId}: ${isOpen ? 'Ανοιχτό' : 'Κλειστό'}`);
}

function getSavedDrawerStates() {
    return JSON.parse(localStorage.getItem('mnotes_drawer_states')) || {};
}
function setupEvents() {
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        console.log("✅ Event Listener attached to #hiddenFileInput");
        
        fileInput.addEventListener('change', function(e) {
            console.log("📂 File selected from disk!");
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(ex) {
                try {
                    console.log("📄 Reading file content...");
                    const imported = JSON.parse(ex.target.result);
                    
                    // ✨ ΕΔΩ ΕΙΝΑΙ Η ΑΛΛΑΓΗ: Καλούμε ρητά τη συνάρτηση του logic.js μέσω window
                    if (typeof window.processImportedData === 'function') {
                        console.log("🚀 Calling window.processImportedData...");
                        await window.processImportedData(imported);
                    } else if (typeof processImportedData === 'function') {
                        console.log("🚀 Calling local processImportedData...");
                        await processImportedData(imported);
                    } else {
                        console.error("❌ ERROR: processImportedData NOT FOUND ANYWHERE!");
                        alert("Σφάλμα: Η λειτουργία εισαγωγής δεν βρέθηκε.");
                    }

                    const modal = document.getElementById('importChoiceModal');
                    if(modal) modal.style.display = 'none';
                } catch(err) {
                    console.error("❌ JSON PARSE ERROR:", err);
                    alert("Το αρχείο δεν είναι έγκυρο mNotes format.");
                }
            };
            reader.readAsText(file);
            fileInput.value = ''; // Reset για επόμενη χρήση
        });
    } else {
        console.error("❌ CRITICAL: #hiddenFileInput NOT FOUND IN DOM!");
    }

    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.tag-wrapper');
        var sugg = document.getElementById('tagSuggestions');
        if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) {
            sugg.style.display = 'none';
        }
    });
}

function switchMobileTab(tabName) {
    const map = { 'library': 'sidebar', 'stage': 'mainZone', 'tools': 'rhythmTools' };
    ['sidebar', 'mainZone', 'rhythmTools'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.classList.remove('mobile-view-active'); 
    });
    
    const targetId = map[tabName]; 
    const targetEl = document.getElementById(targetId);
    if (targetEl) { targetEl.classList.add('mobile-view-active'); }
    
    const btns = document.querySelectorAll('.tab-btn-mob'); 
    btns.forEach(b => b.classList.remove('active'));
    if (tabName === 'library' && btns[0]) btns[0].classList.add('active');
    if (tabName === 'stage' && btns[1]) btns[1].classList.add('active');
    if (tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    // ✨ ΠΡΟΣΘΗΚΗ 1: Συγχρονισμός των κουμπιών του Μενού (Drawer)!
    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));
    const drawerBtn = document.querySelector(`.drawer-btn[onclick*="'${tabName}'"]`);
    if (drawerBtn) drawerBtn.classList.add('active');
    
    // ✨ ΠΡΟΣΘΗΚΗ 2: Εμφάνιση/Απόκρυψη των Player Controls (Transpose, κλπ) μέσα στο Drawer
    const controlsDiv = document.getElementById('drawer-player-controls');
    if (controlsDiv) {
        controlsDiv.style.display = (tabName === 'stage') ? 'block' : 'none';
    }

    // ✨ ΠΡΟΣΘΗΚΗ 3: Κρύβουμε το PDF όταν φεύγουμε από το Stage στα κινητά!
    if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen) {
        const fw = document.getElementById('floating-viewer');
        if (fw) {
            // Αν πάμε πίσω στο stage, το εμφανίζουμε, αλλιώς το κρύβουμε
            fw.style.display = (tabName === 'stage') ? 'flex' : 'none';
        }
    }
}
function toggleRightDrawer() {
    const d = document.getElementById('rightDrawer'); if(!d) return;
    const isOpen = d.classList.contains('open');
    
    if (isOpen) { 
        d.classList.remove('open');
        document.removeEventListener('click', closeDrawerOutside); 
        
        // ✨ ΠΡΟΣΘΗΚΗ: Επαναφορά του PDF όταν κλείνει το συρτάρι (αν είμαστε στο Stage)
        if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen) {
            const isStageActive = document.getElementById('mainZone')?.classList.contains('mobile-view-active') || window.innerWidth > 1024;
            document.getElementById('floating-viewer').style.display = isStageActive ? 'flex' : 'none';
        }
    } 
    else { 
        d.classList.add('open'); 
        setTimeout(() => { document.addEventListener('click', closeDrawerOutside); }, 100); 
        setupDrawerListeners(d); 
        
        // ✨ ΠΡΟΣΘΗΚΗ: Κρύβουμε το PDF για να μη μας ενοχλεί όσο είναι ανοιχτό το μενού
        if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen) {
            document.getElementById('floating-viewer').style.display = 'none';
        }
    }
}
function closeDrawerOutside(e) {
    const d = document.getElementById('rightDrawer'); const h = document.getElementById('drawerHandle');
    if (d && d.classList.contains('open') && !d.contains(e.target) && !h.contains(e.target)) { toggleRightDrawer(); }
}

function setupDrawerListeners(drawer) {
    let touchStartX = 0; let touchStartY = 0;
    drawer.ontouchstart = (e) => {  touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; };
    drawer.ontouchend = (e) => {
        let touchEndX = e.changedTouches[0].screenX; let touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX; const diffY = touchEndY - touchStartY;
        if (Math.abs(diffX) > Math.abs(diffY) && diffX > 50) { toggleRightDrawer(); }
    };
}
function switchDrawerTab(tabName) {
    if (window.innerWidth > 1024) return;

    // ✨ ΝΕΟ: Αν πατήσουμε να πάμε στο Stage και η οθόνη είναι άδεια, 
    // "αρπάζουμε" το τρέχον τραγούδι και το ζωγραφίζουμε!
    if (tabName === 'stage' && typeof currentSongId !== 'undefined' && currentSongId) {
        const titleEl = document.getElementById('mainAppTitle');
        // Αν δεν υπάρχει τίτλος, πάει να πει ότι η σκηνή είναι άδεια
        if (!titleEl || titleEl.innerText.trim() === '') {
            if (typeof loadSong === 'function') loadSong(currentSongId);
        }
    }

    // Καλούμε την switchMobileTab που πλέον κάνει ΟΛΗ τη δουλειά 
    // (συγχρονισμό χρωμάτων μενού, Player Controls και απόκρυψη PDF)
    if (typeof switchMobileTab === 'function') {
        switchMobileTab(tabName);
    }

    // Κλείσιμο του Drawer για να αποκαλυφθεί η οθόνη
    if (typeof toggleRightDrawer === 'function') {
        toggleRightDrawer();
    }
    
    console.log(`📱 Mobile View Switched to: ${tabName}`);
}

// ===========================================================
// 12. UTILS & MUSIC THEORY (FINAL CORRECTED VERSION)
// ===========================================================

function getYoutubeId(url) { 
    if (!url) return null; 
    // Προσθέσαμε υποστήριξη και για τα Shorts!
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/; 
    var match = url.match(regExp); 
    return (match && match[2].length === 11) ? match[2] : null; 
}
function saveData() {
    if (Array.isArray(window.library)) {
        localStorage.setItem('mnotes_data', JSON.stringify(window.library));
        console.log("💾 LocalStorage Updated. Songs count:", window.library.length);
    }
}
function filterByTag(e, tag) { 
    e.stopPropagation(); 
    const tagSelect = document.getElementById('tagFilter'); 
        if(tagSelect) { 
        console.log(`🏷️ [TAG CLICK] Εφαρμογή φίλτρου για το tag: ${tag}`);
        tagSelect.value = tag; 
        // Σιγουρευόμαστε ότι είμαστε στο "Library" view της μπάρας και όχι στο "Setlist"
        if (typeof switchSidebarTab === 'function') switchSidebarTab('library');
             applyFilters(); 
        if (typeof showToast === 'function') showToast("Φίλτρο: #" + tag); 
        // Αν είμαστε σε κινητό, γυρνάμε αμέσως στην προβολή της Λίστας!
        if (window.innerWidth <= 1024 && typeof switchDrawerTab === 'function') {
            switchDrawerTab('library');
        }
    } else {
        console.warn("⚠️ [TAG CLICK] Δεν βρέθηκε το dropdown των Tags!");
    }
}
function filterByKey(e, key) { e.stopPropagation(); var inp = document.getElementById('searchInp'); if(inp) { inp.value = key; applyFilters(); showToast("Filter: " + key); } }


/* --- ΔΙΟΡΘΩΜΕΝΟ SPLIT (Smart Split βάσει συγχορδιών) --- */
function splitSongBody(body) {
    if (!body) return { fixed: "", scroll: "" };
    
    // 1. Έλεγχος για Ενιαία Οθόνη (από τα Settings)
    if (typeof userSettings !== 'undefined' && userSettings.disableSplit) {
        return { fixed: "", scroll: body }; 
    }
    
    // 2. Χωρισμός σε στροφές
    const stanzas = body.split(/\n\s*\n/);
    let splitIndex = -1;

    // 3. Εντοπισμός της τελευταίας στροφής με συγχορδίες (ψάχνει [ ή !)
    for (let i = 0; i < stanzas.length; i++) {
        if (stanzas[i].includes('[') || stanzas[i].includes('!')) {
            splitIndex = i;
        }
    }

    // 4. Διαχωρισμός
    if (splitIndex === -1) {
        return { fixed: "", scroll: body };
    } else {
        const fixedPart = stanzas.slice(0, splitIndex + 1).join('\n\n');
        const scrollPart = stanzas.slice(splitIndex + 1).join('\n\n');

        return { 
            fixed: fixedPart.trim(), 
            scroll: scrollPart.trim() 
        };
    }
}

/* ΔΙΟΡΘΩΣΗ: Χρήση των μεταβλητών όπως ορίζονται στο data.js 
   NOTES = Διέσεις
   NOTES_FLAT = Υφέσεις
*/
function getNote(note, semitones) {
    if (!note || note === "-" || note === "") return note;
    if (semitones === 0) return note;

    const transposePart = (part) => {
        // Τώρα η μηχανή επιτρέπει και μικρά a-g στην αρχή
        let match = part.match(/^[A-Ga-g][#b]?/);
        if (!match) return part; 
        
        let root = match[0];
        let suffix = part.substring(root.length);
        
        // 1. Κρατάμε "σημείωση" αν ο χρήστης έγραψε μικρό γράμμα
        let isLower = (root === root.toLowerCase());
        
        // 2. Το κάνουμε προσωρινά κεφαλαίο μόνο για την αναζήτηση στους πίνακες
        let searchRoot = root.toUpperCase();
        
        const SHARP = (typeof NOTES !== 'undefined') ? NOTES : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const FLAT  = (typeof NOTES_FLAT !== 'undefined') ? NOTES_FLAT : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
        
        let index = SHARP.indexOf(searchRoot);
        if (index === -1) index = FLAT.indexOf(searchRoot);
        
        if (index === -1) {
            console.warn(`[TRANSPOSE] Άγνωστη ρίζα: ${root}`);
            return part; 
        }
        
        let newIndex = (index + semitones) % 12;
        if (newIndex < 0) newIndex += 12;
        
        let outScale = (semitones < 0) ? FLAT : SHARP;
        let transposedNote = outScale[newIndex];
        
        // 3. Αν η αρχική νότα ήταν μικρή, επιστρέφουμε μικρή νότα!
        if (isLower) transposedNote = transposedNote.toLowerCase();
        
        return transposedNote + suffix;
    };

    if (note.includes('/')) {
        let parts = note.split('/');
        return `${transposePart(parts[0])}/${transposePart(parts[1])}`;
    }

    return transposePart(note);
}
//function parseSongLogic(s) { /* Logic to prepare chords */ }

//function calculateOptimalCapo(originalKey, body) {
  //  const difficultChords = ["F", "Bm", "Bb", "Cm", "C#", "F#", "G#", "D#m", "G#m", "A#m"];
  //  let bestCapo = 0; let minDiff = 1000;
  //  for (let i = 0; i <= 5; i++) {
  //      let currentDiff = 0;
  //      let newKey = getNote(originalKey, -i); 
  //      if (difficultChords.includes(newKey)) currentDiff += 10;
  //      if (newKey.includes("#") || newKey.includes("b")) currentDiff += 2;
  //      if (currentDiff < minDiff) { minDiff = currentDiff; bestCapo = i; }
  //  }
  //  return bestCapo;
// }
function parseMetaLine(text) {
    if (!text) return "";
    
   // 🚀 Μετατροπή ChordPro on-the-fly για τα Intro/Interlude
    text = text.replace(/\[([a-zA-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)\]/g, "!$1 ");
   
   // Regex που δέχεται και μικρά [a-zA-G]
    return text.replace(/!([a-zA-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)/g, (match, chord) => {
        
        // 1. Προσωρινό κεφαλαίο για τον υπολογισμό
        let firstChar = chord.charAt(0).toUpperCase();
        let restOfChord = chord.slice(1);
        let calculationChord = firstChar + restOfChord;

        // 2. Transpose (χρησιμοποιεί την getNote που ήδη έχεις)
        let translated = (typeof getNote === 'function') ? getNote(calculationChord, state.t - state.c) : chord;
        
        // 3. Αν το αρχικό ήταν μικρό (π.χ. am), ξανακάνε το αποτέλεσμα μικρό (π.χ. bm)
        if (chord.charAt(0) === chord.charAt(0).toLowerCase()) {
            translated = translated.charAt(0).toLowerCase() + translated.slice(1);
        }

       // Επιστροφή με την κλάση .chord και αναγκαστικό χρώμα από τις ρυθμίσεις!
return `<span class="chord" style="display:inline; position:static; font-size:inherit; color: var(--chord-color);">${translated}</span>`;
    });
}

// ===========================================================
// 13. SETTINGS & MODAL LOGIC (ADD THIS TO THE END)
// ===========================================================
function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    // 1. Εξασφάλιση ότι τα userSettings υπάρχουν στη μνήμη
    if (typeof userSettings === 'undefined' || !userSettings) {
        userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || { theme: 'theme-slate', lang: 'el' };
    }

    // 2. Ενημέρωση Checkboxes (On/Off)
    // Εδώ βάζουμε όλα τα πεδία που είναι τύπου checkbox
    const checkboxes = {
        'setWakeLock': userSettings.wakeLock,
        'setDisableSplit': userSettings.disableSplit,
        'setPrintLyricsOnly': userSettings.printLyricsOnly,
        'chkAutoSaveCapo': userSettings.autoSaveCapo,
        'setShowScrollBtn': (typeof userSettings.showScrollBtn !== 'undefined') ? userSettings.showScrollBtn : true
    };

    for (let id in checkboxes) {
        const el = document.getElementById(id);
        if (el) el.checked = checkboxes[id] || false;
    }

    // 3. Ενημέρωση Τιμών (Dropdowns, Sliders, Text)
    const values = {
        'setTheme': userSettings.theme || 'theme-dark',
        'langSelect': userSettings.lang || 'el',
        'setChordSize': userSettings.chordSize || 1,
        'setChordDist': userSettings.chordDist || 0,
        'setScrollSpeed': userSettings.scrollSpeed || 50
    };

    for (let id in values) {
        const el = document.getElementById(id);
        if (el) el.value = values[id];
    }

    // ✨ ΤΟ ΣΚΟΥΠΙΣΜΑ: 
    // Αφαιρέθηκε όλο το μπλοκ if(colInp && chkDef) { ... } 
    // Πλέον η εφαρμογή δεν ασχολείται με μεμονωμένα χρώματα συγχορδιών.

    modal.style.display = 'flex';
    console.log("⚙️ [SETTINGS] Clean Settings Modal Opened.");
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
}
async function saveSettings() {
    // 1. Checkboxes (Booleans)
    userSettings.wakeLock = document.getElementById('setWakeLock')?.checked || false;
    userSettings.disableSplit = document.getElementById('setDisableSplit')?.checked || false;
    userSettings.printLyricsOnly = document.getElementById('setPrintLyricsOnly')?.checked || false;
    userSettings.autoSaveCapo = document.getElementById('chkAutoSaveCapo')?.checked || false;
    
    const btnChk = document.getElementById('setShowScrollBtn');
    if (btnChk) userSettings.showScrollBtn = btnChk.checked;

    // 2. Wake Lock Trigger
    if (typeof requestWakeLock === 'function') requestWakeLock();

    // 3. Theme & Language
    const themeSel = document.getElementById('setTheme');
    if (themeSel) {
        userSettings.theme = themeSel.value;
    }

    const langSel = document.getElementById('langSelect');
    if (langSel) {
        const newLang = langSel.value;
        if (typeof toggleLanguage === 'function' && userSettings.lang !== newLang) {
            userSettings.lang = newLang;
            localStorage.setItem('mnotes_lang', newLang);
            toggleLanguage(); // Αυτή η συνάρτηση συνήθως κάνει reload/apply translations
        } else {
            userSettings.lang = newLang;
        }
    }

    // 4. Numeric Values (Sizes & Speeds)
    const sizeInp = document.getElementById('setChordSize');
    const distInp = document.getElementById('setChordDist');
    const speedInp = document.getElementById('setScrollSpeed');

    if (sizeInp) userSettings.chordSize = parseFloat(sizeInp.value);
    if (distInp) userSettings.chordDist = parseInt(distInp.value);
    if (speedInp) userSettings.scrollSpeed = parseInt(speedInp.value);

    // ✨ ΤΟ ΣΚΟΥΠΙΣΜΑ: Αφαιρέθηκε όλο το logic για chkDef και colInp.
    // Πλέον δεν αποθηκεύουμε custom χρώματα συγχορδιών.

    // 5. Finalize & Save
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));

    // 6. UI Updates
    if (typeof applyTheme === 'function') applyTheme();
    if (typeof applyScrollBtnVisibility === 'function') applyScrollBtnVisibility();
    
    closeSettings();

    // 7. Refresh View
    if (typeof applySortAndRender === 'function') applySortAndRender();

    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') renderPlayer(s);
    }

    if (typeof showToast === 'function') {
        showToast(userSettings.lang === 'el' ? "Οι ρυθμίσεις αποθηκεύτηκαν" : "Settings saved");
    }
}

// ===========================================================
// 14. TRANSPOSITION & CAPO CONTROLS (THE MISSING LINK)
// ===========================================================

function transUp() {
    // Έλεγχος αν υπάρχει το state (από το logic.js)
    if (typeof state === 'undefined') return;
    
    // Αλλαγή της τιμής
    state.t = (state.t || 0) + 1;
    
    // Ενημέρωση
    refreshPlayerUI();
}

function transDown() {
    if (typeof state === 'undefined') return;
    state.t = (state.t || 0) - 1;
    refreshPlayerUI();
}

function capoUp() {
    if (typeof state === 'undefined') return;
    // Παίρνουμε το όριο από τις ρυθμίσεις (αν υπάρχουν)
    const max = (typeof userSettings !== 'undefined' && userSettings.maxCapo) ? parseInt(userSettings.maxCapo) : 12;
    
    if (state.c < max) {
        state.c = (state.c || 0) + 1;
        refreshPlayerUI();
    }
}

function capoDown() {
    if (typeof state === 'undefined') return;
    if (state.c > 0) {
        state.c = (state.c || 0) - 1;
        refreshPlayerUI();
    }
}

// Βοηθητική συνάρτηση που κάνει Refresh τον Player και τα Νούμερα
function refreshPlayerUI() {
    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') {
            renderPlayer(s);
            // ✨ Προσθήκη: Έλεγχος αν το ύψος άλλαξε μετά το transpose
            applyScrollBtnVisibility();
        }
    }
    updateTransDisplay();
}

function updateTransDisplay() {
    const dValT = document.getElementById('val-t'); // Desktop Transpose Value
    const dValC = document.getElementById('val-c'); // Desktop Capo Value
    const mValT = document.getElementById('drawer-val-t'); // Mobile Drawer Value (αν υπάρχει)
    const mValC = document.getElementById('drawer-val-c'); // Mobile Drawer Value (αν υπάρχει)

    // Φτιάχνουμε το κείμενο (π.χ. "+2" ή "-1")
    const tTxt = (state.t > 0 ? "+" : "") + state.t;
    
    if (dValT) dValT.innerText = tTxt;
    if (mValT) mValT.innerText = tTxt;
    
    if (dValC) dValC.innerText = state.c;
    if (mValC) mValC.innerText = state.c;
}
// ===========================================================
// FORCE VISIBLE TOAST MESSAGE
// ===========================================================

function showToast(msg) {
    // 1. Δημιουργία του κουτιού
    var div = document.createElement("div");
    
    // 2. Το κείμενο (με εικονίδιο για στυλ)
    div.innerHTML = '<span style="font-size:20px; vertical-align:middle; margin-right:10px;">ℹ️</span>' + msg;
    
    // 3. Στυλ "Nuclear" (Για να φανεί οπωσδήποτε)
    div.style.position = "fixed";
    div.style.bottom = "100px";         // Αρκετά ψηλά για να μην το κρύβει το footer
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)"; // Κεντράρισμα
    
    div.style.backgroundColor = "#222"; // Σκούρο φόντο
    div.style.color = "#fff";           // Λευκά γράμματα
    div.style.padding = "15px 25px";    // Μεγάλο γέμισμα
    div.style.borderRadius = "50px";    // Στρογγυλεμένες άκρες
    div.style.fontSize = "16px";
    div.style.fontWeight = "bold";
    div.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)"; // Έντονη σκιά
    
    // ΤΟ ΠΙΟ ΣΗΜΑΝΤΙΚΟ: Z-INDEX
    div.style.zIndex = "9000";   // Το ανώτατο επίπεδο ειδοποιήσεων βάσει της νέας αρχιτεκτονικής 
    
    // Animation εμφάνισης
    div.style.opacity = "0";
    div.style.transition = "opacity 0.3s ease-in-out, transform 0.3s";
    
    document.body.appendChild(div);

    // Εμφάνιση (μικρή καθυστέρηση για το animation)
    requestAnimationFrame(() => {
        div.style.opacity = "1";
        div.style.transform = "translateX(-50%) translateY(-10px)";
    });

    // 4. Αυτοκαταστροφή μετά από 3 δευτερόλεπτα
    setTimeout(function() {
        div.style.opacity = "0";
        div.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(function() {
            if (div.parentNode) div.parentNode.removeChild(div);
        }, 300);
    }, 3000);
}
/**
 * Ενημερώνει τα οπτικά στοιχεία του Header βάσει του Context
 */
function refreshHeaderUI() {
    const titleEl = document.getElementById('mainAppTitle'); // Ή όποιο ID έχεις για τον τίτλο
    if (!titleEl) return;

    if (currentGroupId === 'personal') {
        titleEl.innerText = "mNotes - My Songs";
        titleEl.style.color = "var(--accent)"; // Π.χ. Μπλε για τα προσωπικά
    } else {
        const group = myGroups.find(g => g.group_id === currentGroupId);
        titleEl.innerText = group?.groups?.name || "Band Workspace";
        titleEl.style.color = "#ff9800"; // Π.χ. Πορτοκαλί για την μπάντα
    }
}

// Alias για συμβατότητα με το logic.js
function toEditor() { switchToEditor(); }
function toViewer(shouldLoad = true) { 
       exitEditor(); 
   if (window.innerWidth <= 1024) {
           const drawerBtns = document.querySelectorAll('#rightDrawer .drawer-section .drawer-btn');
           if (drawerBtns.length > 0) {
               // Σβήνουμε το 'active' από όλα τα κουμπιά
               drawerBtns.forEach(btn => btn.classList.remove('active'));
               // Βρίσκουμε το κουμπί του Stage και το ανάβουμε
               const stageBtn = Array.from(drawerBtns).find(btn => 
                   btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'stage'")
               );
               if (stageBtn) stageBtn.classList.add('active');
           }
       }
   }


/* ===========================================================
   15. W.Y.S.I.W.Y.G. VIEW MODES (Band vs My View)
   =========================================================== */

function toggleViewMode() {
    // 1. Αλλαγή κατάστασης
    showingOriginal = !showingOriginal;
    
    // 2. Εύρεση τραγουδιού
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    // 3. Render
    renderPlayerWithOverrides(s);
    
    // 4. Ενημέρωση UI
    if (showingOriginal) {
        showToast("View: Band Original 🏛️");
        document.body.classList.add('viewing-original');
    } else {
        showToast("View: My Settings 👤");
        document.body.classList.remove('viewing-original');
    }
}

function renderPlayerWithOverrides(s) {
    if (!s) return;

    // Αποθήκευση της τρέχουσας κατάστασης μεταφοράς στο state.t
    // Αν βλέπουμε Original: Μηδενισμός
    if (showingOriginal) {
        state.t = 0; 
        state.c = 0;
    } 
    // Αν βλέπουμε My View ΚΑΙ υπάρχει override transpose: Εφαρμογή
    else if (s.personal_transpose || s.personal_transpose === 0) {
        state.t = s.personal_transpose;
        // Αν θέλεις να σώζεις και το capo στα overrides, κάντο εδώ:
        // state.c = s.personal_capo || 0; 
    }

    // Καλούμε την κανονική renderPlayer
    renderPlayer(s);
    
    // Ενημέρωση του Κουμπιού
    updateToggleButton(s);
}

function updateToggleButton(s) {
    const btn = document.getElementById('btnToggleView');
    if (!btn) return;

    // Κρύβουμε το κουμπί από προεπιλογή. Θα το εμφανίσουμε ΜΟΝΟ αν βρούμε διαφορές.
    btn.style.display = 'none'; 

    const isCloneObj = s.is_clone || !!s.parent_id;
    const isBandMaster = !!s.group_id && !isCloneObj;

    // Βοηθητική συνάρτηση για να σχεδιάσει/εμφανίσει το κουμπί
    const showButton = () => {
        btn.style.display = 'inline-flex';
        
        if (isCloneObj) {
            if (showingOriginal) {
                btn.innerHTML = `<i class="fas fa-user"></i> My Version`;
                btn.classList.add('active-mode');
                btn.style.background = "var(--accent)";
                btn.style.color = "#000";
            } else {
                btn.innerHTML = `<i class="fas fa-users"></i> Band Version`;
                btn.classList.remove('active-mode');
                btn.style.background = "transparent";
                btn.style.color = "var(--text-main)";
            }
            
            // Κουμπί Ακύρωσης Κλώνου (Κόκκινο σκουπιδάκι)
            let revertBtn = document.getElementById('btnRevertClone');
            if (!revertBtn && !showingOriginal) {
                revertBtn = document.createElement('button');
                revertBtn.id = 'btnRevertClone';
                revertBtn.innerHTML = `<i class="fas fa-trash-restore"></i>`;
                revertBtn.title = "Ακύρωση Κλώνου & Επιστροφή στο Κοινό";
                revertBtn.style.cssText = "margin-left:5px; background:var(--danger); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.9rem;";
                revertBtn.onclick = () => { if(typeof revertClone === 'function') revertClone(s); };
                btn.parentNode.appendChild(revertBtn);
            } else if (revertBtn && showingOriginal) {
                revertBtn.style.display = 'none';
            } else if (revertBtn) {
                revertBtn.style.display = 'inline-block';
            }
        } else {
            // Για απλά overrides της μπάντας (Transpose/Notes)
            const revertBtn = document.getElementById('btnRevertClone');
            if (revertBtn) revertBtn.style.display = 'none';

            if (showingOriginal) {
                btn.innerHTML = '<i class="fas fa-user"></i> My Settings';
                btn.classList.add('active-mode');
                btn.style.background = "var(--accent)";
                btn.style.color = "#000";
            } else {
                btn.innerHTML = '<i class="fas fa-users"></i> Band Version';
                btn.classList.remove('active-mode');
                btn.style.background = "transparent";
                btn.style.color = "var(--text-main)";
            }
        }
    };

    // --- ΠΕΡΙΠΤΩΣΗ Α: Τραγούδι Μπάντας με Transpose/Notes ---
    if (isBandMaster) {
        // Αν έχει βάλει Transpose ή Σημειώσεις, ΥΠΑΡΧΕΙ διαφορά, άρα το δείχνουμε.
        const hasOverrides = s.has_override || (s.personal_notes && s.personal_notes.trim() !== "") || (s.personal_transpose && s.personal_transpose !== 0);
        if (hasOverrides || showingOriginal) {
            showButton();
        }
        return;
    }

    // --- ΠΕΡΙΠΤΩΣΗ Β: Προσωπικός Κλώνος ---
    if (isCloneObj && s.parent_id) {
        // Αν το έχει ήδη πατήσει, ΠΡΕΠΕΙ να το βλέπει για να μπορεί να γυρίσει πίσω!
        if (showingOriginal) {
            showButton(); 
            return;
        }

        // Συνάρτηση σύγκρισης
        const compareWithMaster = (master) => {
            const isDifferent = (master.body !== s.body) || 
                                (master.title !== s.title) || 
                                (master.key !== s.key) || 
                                (master.notes !== s.notes);
            
            // Αν βρήκαμε έστω και μία διαφορά, εμφανίζουμε το κουμπί!
            if (isDifferent) showButton();
        };

        // 1. Ψάχνουμε το Master τραγούδι τοπικά (αν υπάρχει ήδη στη μνήμη)
        let master = window.library.find(x => x.id === s.parent_id);
        
        if (master) {
            compareWithMaster(master);
        } 
        // 2. Αν δεν υπάρχει τοπικά, το ρωτάμε αθόρυβα από το Cloud (Supabase)
        else if (navigator.onLine && typeof supabaseClient !== 'undefined') {
            supabaseClient.from('songs')
                .select('body, title, key, notes')
                .eq('id', s.parent_id)
                .maybeSingle()
                .then(({data}) => {
                    // Έλεγχος: Βεβαιωνόμαστε ότι ο χρήστης βλέπει ΑΚΟΜΑ αυτό το τραγούδι (δεν άλλαξε εν τω μεταξύ)
                    if (data && currentSongId === s.id) { 
                        compareWithMaster(data);
                    }
                })
                .catch(e => console.log("Αποτυχία σύγκρισης κλώνου:", e));
        }
    }
}
// --- CUSTOM MODAL ΓΙΑ ΔΙΑΧΩΡΙΣΜΟ PUBLIC/PRIVATE ---
function askVisibilityRole() {
    return new Promise((resolve) => {
        // Δημιουργία του μαύρου φόντου
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:5000;';
        
        // Δημιουργία του κουτιού
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-panel); padding:25px; border-radius:12px; max-width:350px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); border: 1px solid var(--border-color);';
        
        box.innerHTML = `
            <h3 style="margin-top:0; color:var(--text-main); font-size:1.2rem;">Πού να αποθηκευτεί;</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:20px;">Επιλέξτε αν αυτό το αρχείο θα είναι ορατό σε όλη την μπάντα ή μόνο σε εσάς.</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="btnPub" style="background:#4db6ac; color:#000; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;"><i class="fas fa-users"></i> Κοινόχρηστο (Μπάντα)</button>
                <button id="btnPriv" style="background:#ffb74d; color:#000; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;"><i class="fas fa-lock"></i> Ιδιωτικό (Μόνο εγώ)</button>
                <button id="btnCancel" style="background:transparent; color:var(--text-muted); padding:10px; border:1px solid var(--border-color); border-radius:8px; margin-top:5px; cursor:pointer;">Ακύρωση</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Λειτουργίες κουμπιών
        document.getElementById('btnPub').onclick = () => { document.body.removeChild(overlay); resolve('public'); };
        document.getElementById('btnPriv').onclick = () => { document.body.removeChild(overlay); resolve('private'); };
        document.getElementById('btnCancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
    });
}
// --- MODAL ΓΙΑ ΚΟΙΝΟΠΟΙΗΣΗ ΣΤΗ ΜΠΑΝΤΑ ---
function showTransferModal() {
    if (!currentSongId) return;
    
    // Βρίσκουμε σε ποιες μπάντες ανήκει ο χρήστης
    const availableBands = myGroups.filter(g => g.role === 'owner' || g.role === 'admin' || g.role === 'member');
    
    if (availableBands.length === 0) {
        alert("Δεν ανήκετε σε καμία μπάντα για να κοινοποιήσετε το τραγούδι.");
        return;
    }

    const currentSongTitle = library.find(s => s.id === currentSongId)?.title || "το τραγούδι";

    // Χτίζουμε τα κουμπιά για κάθε μπάντα
    let optionsHtml = availableBands.map(g => 
        `<button onclick="transferSong('${g.group_id}'); document.body.removeChild(this.closest('.modal-overlay'));" 
                 style="display:flex; align-items:center; justify-content:center; gap:10px; width:100%; margin-bottom:10px; padding:12px; background:var(--accent); color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:1rem;">
            <i class="fas fa-users"></i> Προς: ${g.groups?.name || 'Άγνωστη'}
        </button>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:5000;';
    
    overlay.innerHTML = `
        <div style="background:var(--bg-panel); padding:25px; border-radius:12px; width:320px; text-align:center; border: 1px solid var(--border-color);">
            <h3 style="margin-top:0; color:var(--text-main);">Κοινοποίηση Τραγουδιού</h3>
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:20px;">Επιλέξτε πού θέλετε να στείλετε <b>"${currentSongTitle}"</b>:</p>
            ${optionsHtml}
            <button onclick="document.body.removeChild(this.closest('.modal-overlay'));" style="margin-top:5px; padding:10px; width:100%; background:transparent; border:1px solid var(--border-color); color:var(--text-muted); border-radius:8px; cursor:pointer;">Ακύρωση</button>
        </div>
    `;
    document.body.appendChild(overlay);
}
window.processFileDirectly = async function(input) {
    console.log("🔥 DIRECT HTML TRIGGER: Αρχείο επιλέχθηκε!");
    
    const file = input.files[0];
    if (!file) {
        console.log("Δεν επιλέχθηκε αρχείο.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(ex) {
        try {
            console.log("📄 Διαβάζω τα δεδομένα του αρχείου...");
            const imported = JSON.parse(ex.target.result);
            
            if (typeof window.processImportedData === 'function') {
                console.log("🚀 Στέλνω τα δεδομένα στο logic.js...");
                await window.processImportedData(imported);
            } else {
                alert("Σφάλμα: Η συνάρτηση processImportedData λείπει!");
            }

            const modal = document.getElementById('importChoiceModal');
            if(modal) modal.style.display = 'none';
        } catch(err) {
            console.error("❌ Σφάλμα ανάγνωσης:", err);
            alert("Το αρχείο δεν είναι έγκυρο.");
        }
    };
    reader.readAsText(file);
    
    // Καθαρίζουμε το input για να μπορούμε να ξαναδιαλέξουμε το ίδιο αρχείο
    input.value = ''; 
};
// ===========================================================
// 16. AUTO-SCROLL & BLUETOOTH PAGE TURNER
// ===========================================================
var scrollTimer = null;
var scrollBtnTimeout = null;

function toggleAutoScroll(e) {
    if (e) e.stopPropagation(); 

    var container = document.getElementById('scroll-container');
    if (!container || container.scrollHeight <= container.clientHeight) {
        container = document.getElementById('mainZone');
    }
    if (!container) return;

    var btn = document.getElementById('floatingScrollBtn');
    var btnIcon = document.getElementById('scrollBtnIcon');
    var btnText = document.getElementById('scrollBtnText');

    // 1. ΣΤΑΜΑΤΗΜΑ (PAUSE)
    if (scrollTimer) {
        clearInterval(scrollTimer);
        scrollTimer = null;
        
        if (btn) {
            btn.classList.remove('hidden');
            if (btnIcon) btnIcon.className = "fas fa-play";
            // ✨ ΔΙΓΛΩΣΣΙΑ ΕΔΩ:
            if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_auto_scroll') : "Auto Scroll";
        }
            return;
    }

    // 2. ΕΚΚΙΝΗΣΗ (PLAY)
    var speedSetting = (typeof userSettings !== 'undefined' && userSettings.scrollSpeed) ? parseInt(userSettings.scrollSpeed) : 50;
    var intervalTime = 220 - speedSetting; 
    if (intervalTime < 10) intervalTime = 10;

    if (btn) {
        if (btnIcon) btnIcon.className = "fas fa-pause";
        // ✨ ΔΙΓΛΩΣΣΙΑ ΕΔΩ:
        if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_pause') : "Pause";
        btn.classList.add('hidden'); // Το κρύβουμε για να μη μας κόβει στίχους
    }
       scrollTimer = setInterval(function() {
        container.scrollTop += 1; 
        
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
            clearInterval(scrollTimer);
            scrollTimer = null;
            if (btn) {
                btn.classList.remove('hidden');
                if (btnIcon) btnIcon.className = "fas fa-play";
                // ✨ ΚΑΙ ΕΔΩ (όταν τερματίζει το τραγούδι):
                if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_auto_scroll') : "Auto Scroll";
            }
        }
    }, intervalTime);
}

// Εμφάνιση με κλικ στην οθόνη (όταν τρέχει)
document.addEventListener('click', function(e) {
    var btn = document.getElementById('floatingScrollBtn');
    if (scrollTimer && btn && !btn.contains(e.target)) {
        btn.classList.remove('hidden');
        clearTimeout(scrollBtnTimeout);
        scrollBtnTimeout = setTimeout(() => {
            if (scrollTimer) btn.classList.add('hidden');
        }, 3500); 
    }
});

// Bluetooth Page Turner Logic
function setupBluetoothPedals() {
    document.addEventListener('keydown', function(e) {
        // Όχι στον editor
        var editorView = document.getElementById('view-editor');
        if(editorView && editorView.classList.contains('active-view')) return;

        if (e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === ' ') {
            e.preventDefault();
            toggleAutoScroll();
            console.log(`[BLUETOOTH] Triggered Scroll via ${e.key}`);
        }
        if (e.key === 'ArrowRight' && typeof navVisiblePlaylist === 'function') navVisiblePlaylist(1);
        if (e.key === 'ArrowLeft' && typeof navVisiblePlaylist === 'function') navVisiblePlaylist(-1);
    });
}

// Βοηθητική συνάρτηση για την εμφάνιση/απόκρυψη από τα Settings & Βάσει Ύψους
function applyScrollBtnVisibility() {
    // Καθυστέρηση για να προλάβει ο browser να "ζωγραφίσει" τους στίχους
    setTimeout(function() {
        var btn = document.getElementById('floatingScrollBtn');
        if (!btn) return;

        // 1. Έλεγχος από τα Settings
        var wantsBtn = (typeof userSettings !== 'undefined' && typeof userSettings.showScrollBtn !== 'undefined') ? userSettings.showScrollBtn : true;
        
        if (!wantsBtn) {
            btn.style.display = 'none';
            console.log("[AutoScroll] Κουμπί κρυμμένο: Απενεργοποιημένο από τα Settings.");
            return;
        }

        // 2. Έλεγχος Ύψους (Χρειάζεται scroll;)
        var container = document.getElementById('scroll-container');
        if (!container || container.scrollHeight <= container.clientHeight + 5) {
            container = document.getElementById('mainZone');
        }
        
        var needsScroll = false;
        if (container) {
            console.log(`[AutoScroll] Ύψος κειμένου: ${container.scrollHeight}px | Ύψος οθόνης: ${container.clientHeight}px`);
            // Βάζουμε 10px αέρα για να μην εμφανίζεται οριακά
            if (container.scrollHeight > container.clientHeight + 10) {
                needsScroll = true;
            }
        }

        // 3. Τελική Εμφάνιση/Απόκρυψη
        btn.style.display = needsScroll ? 'flex' : 'none';
        if (!needsScroll) {
            console.log("[AutoScroll] Κουμπί κρυμμένο: Το τραγούδι χωράει ολόκληρο στην οθόνη.");
        }

    }, 150); // 150ms είναι υπεραρκετά για να κάνει render το DOM
}
// ✨ Αυτόματος έλεγχος κουμπιού scroll όταν αλλάζει το μέγεθος της οθόνης (π.χ. Rotation σε Tablet)
window.addEventListener('resize', function() {
    // Μικρή καθυστέρηση για να προλάβει ο browser να υπολογίσει τα νέα clientHeight
    setTimeout(applyScrollBtnVisibility, 250);
});
// ==========================================
// WAKE LOCK API (Έξυπνη Διαχείριση Οθόνης)
// ==========================================
var wakeLock = null;

async function requestWakeLock() {
    // 1. Ελέγχουμε αν το υποστηρίζει ο browser
    if (!('wakeLock' in navigator)) {
        console.warn("💡 [Wake Lock] Δεν υποστηρίζεται από αυτόν τον browser.");
        return;
    }

    // 2. Ελέγχουμε τη ρύθμιση του χρήστη
    if (!userSettings.wakeLock) {
        releaseWakeLock(); // Αν το έκλεισε, το απελευθερώνουμε
        return;
    }

    try {
        // Ζητάμε το κλείδωμα της οθόνης
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('💡 [Wake Lock] Ενεργοποιήθηκε. Η οθόνη θα μείνει ανοιχτή.');
        
        wakeLock.addEventListener('release', () => {
            console.log('💡 [Wake Lock] Απελευθερώθηκε (π.χ. λόγω αλλαγής καρτέλας ή ειδοποίησης).');
        });
    } catch (err) {
        console.error(`💡 [Wake Lock] Αποτυχία ενεργοποίησης: ${err.name}, ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { 
            wakeLock = null; 
            console.log('💡 [Wake Lock] Απενεργοποιήθηκε χειροκίνητα.');
        });
    }
}

// ✨ ΤΟ ΜΥΣΤΙΚΟ ΓΙΑ ΤΑ ΚΙΝΗΤΑ: 
// Όταν ο χρήστης βγαίνει από την εφαρμογή και επιστρέφει, το Wake Lock έχει χαθεί. Το ξαναζητάμε αυτόματα!
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && userSettings.wakeLock) {
        console.log('💡 [Wake Lock] Επιστροφή στην εφαρμογή. Επαναφορά...');
        await requestWakeLock();
    }
});
// ==========================================
// BAND HUB UI & ACTIONS
// ==========================================

function updateBandHubUI() {
    const isGod = (typeof currentRole !== 'undefined') && (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');
    const isBandContext = (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal');

    const txtBandNotes = document.getElementById('sideBandNotes'); 
    const dispBandNotes = document.getElementById('sideBandNotesDisplay'); 
    const btnSaveNotes = document.getElementById('btnSaveBandNotes');
    const bandHubGroup = document.getElementById('bandHubGroup');

    // Κρύβουμε εντελώς το Band Hub αν είμαστε στην Προσωπική Βιβλιοθήκη
    if (!isBandContext) {
        if(bandHubGroup) bandHubGroup.style.display = 'none';
        return;
    } else {
        if(bandHubGroup) bandHubGroup.style.display = 'block';
    }

    // Διαχωρισμός δικαιωμάτων
    if (isGod) {
        // Ο Μαέστρος βλέπει το Textarea και το κουμπί Save
        if(txtBandNotes) txtBandNotes.style.display = 'block';
        if(btnSaveNotes) btnSaveNotes.style.display = 'flex';
        if(dispBandNotes) dispBandNotes.style.display = 'none';
    } else {
        // Το Μέλος βλέπει ΜΟΝΟ το Read-Only κείμενο
        if(txtBandNotes) txtBandNotes.style.display = 'none';
        if(btnSaveNotes) btnSaveNotes.style.display = 'none';
        if(dispBandNotes) dispBandNotes.style.display = 'block';
    }
}

async function saveMaestroNotes() {
    if (!currentSongId) {
        if (typeof showToast === 'function') showToast("Επιλέξτε ένα τραγούδι πρώτα.", "warning");
        return;
    }

    const txtBox = document.getElementById('sideBandNotes');
    if (!txtBox) return;
    
    const notesValue = txtBox.value.trim();
    const songIndex = library.findIndex(s => s.id === currentSongId);
    
    if (songIndex === -1) return;

    // 1. Ενημερώνουμε τη μνήμη RAM (library)
    library[songIndex].conductorNotes = notesValue;
    window.library = library;

    // 2. Ενημερώνουμε την Τοπική Μνήμη της Μπάντας (Offline-first)
    let bandLocalKey = 'mnotes_band_' + currentGroupId;
    localStorage.setItem(bandLocalKey, JSON.stringify(window.library));

    // 3. Στέλνουμε απευθείας στο Cloud (χωρίς να ανοίξουμε τον Editor)
    if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && !isOffline) {
        try {
            const { error } = await supabaseClient
                .from('songs')
                .update({ conductorNotes: notesValue })
                .eq('id', currentSongId);
                
            if (error) throw error;
            if (typeof showToast === 'function') showToast("Η οδηγία καρφιτσώθηκε στο τραγούδι! 📌");
        } catch (err) {
            console.error("[Band Hub] Σφάλμα αποθήκευσης:", err);
            if (typeof showToast === 'function') showToast("Αποθηκεύτηκε τοπικά, αλλά απέτυχε ο συγχρονισμός.", "error");
        }
    } else {
        if (typeof showToast === 'function') showToast("Αποθηκεύτηκε Τοπικά! (Θα συγχρονιστεί όταν συνδεθείτε)");
        
        // Μπαίνει στην ουρά συγχρονισμού αν είμαστε offline
        if (typeof addToSyncQueue === 'function' && currentUser) {
           addToSyncQueue('SAVE_SONG', window.sanitizeForDatabase(library[songIndex], currentUser.id, currentGroupId));
        }
    }
    
    // Ανανέωση του Player για να δείξει το Sticky Note άμεσα
    if (typeof renderPlayer === 'function') renderPlayer(library[songIndex]);
}
/**
 * Ελέγχει αν πρέπει να εμφανιστεί το κουμπί Sync στον Editor
 */
function refreshSyncButtonVisibility(song) {
    const btnSync = document.getElementById('btnSyncFromBand');
    if (!btnSync) return;

    // Default: Κρυμμένο
    btnSync.style.display = 'none';

    // Προϋποθέσεις εμφάνισης:
    // 1. Είμαστε στην Προσωπική Βιβλιοθήκη
    // 2. Το τραγούδι υπάρχει (δεν είναι νέο)
    // 3. Το ID του τραγουδιού βρίσκεται σε κάποια από τις μπάντες μας
    if (currentGroupId === 'personal' && song && song.id) {
        let isShared = false;
        
        myGroups.forEach(g => {
            const bandData = JSON.parse(localStorage.getItem('mnotes_band_' + g.group_id) || "[]");
            if (bandData.some(s => s.id === song.id)) {
                isShared = true;
            }
        });

        if (isShared) {
            btnSync.style.display = 'inline-block';
            btnSync.title = t('Sync from Band') || "Συγχρονισμός από Μπάντα";
        }
    }
}
// --- 1. ΕΜΦΑΝΙΣΗ ΡΥΘΜΩΝ ΤΡΑΓΟΥΔΙΟΥ (Ζωγραφίζει τη λίστα) ---
function renderRhythmsList(rhythms = []) {
    const listEl = document.getElementById('list-rhythms'); 
    if (!listEl) return;
    
    listEl.innerHTML = ''; 
    let hasItems = false;
    
    rhythms.forEach((rhythm, index) => {
        const el = document.createElement('div'); 
        el.className = 'track-item'; 
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid var(--accent);`;
        
        const isOwnerOrAdmin = (typeof currentRole !== 'undefined' && (currentRole === 'owner' || currentRole === 'admin'));
        const canDelete = currentGroupId === 'personal' || isOwnerOrAdmin;
        
        let deleteBtnHtml = canDelete ? `<button onclick="handleDeleteRhythm('${currentSongId}', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="Delete"><i class="fas fa-times"></i></button>` : '';

        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${rhythm.url}', '${rhythm.name}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="Download"><i class="fas fa-download"></i></button>`;

        // ✨ ΝΕΟ 1: Εικονίδιο Δισκέτας (Save) για αποθήκευση του νέου BPM
        let updateBpmBtnHtml = canDelete ? `<button onclick="updateRhythmBpm('${currentSongId}', ${index})" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px;" title="Αποθήκευση Τρέχουσας Ταχύτητας (BPM)"><i class="fas fa-save"></i></button>` : '';

        // ✨ ΝΕΟ 2: Διαβάζουμε το σωσμένο BPM (ή βάζουμε 100 ως προεπιλογή)
        const savedBpm = rhythm.bpm || 100;

        // ✨ ΝΕΟ 3: Εμφανίζουμε το BPM κάτω από το όνομα και το περνάμε στην activateSongRhythm
        el.innerHTML = `
            <div onclick="activateSongRhythm('${rhythm.url}', '${rhythm.name}', ${savedBpm})" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="Φόρτωση ρυθμού">
                <i class="fas fa-drum" style="color:var(--accent); margin-right:8px;"></i>
                <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rhythm.name}</span>
                    <span style="font-size:0.65rem; color:var(--text-muted);"><i class="fas fa-tachometer-alt"></i> ${savedBpm} BPM</span>
                </div>
            </div>
            <div style="display:flex; align-items:center;">
                ${updateBpmBtnHtml}
                ${downloadBtnHtml}
                ${deleteBtnHtml}
            </div>
        `;
        listEl.appendChild(el); 
        hasItems = true;
    });
}

// ✨ ΝΕΑ ΣΥΝΑΡΤΗΣΗ: Ενημερώνει το αποθηκευμένο BPM ενός ρυθμού στο τραγούδι
function updateRhythmBpm(songId, rhythmIndex) {
    // 1. Βρίσκουμε το τραγούδι στη βιβλιοθήκη
    const targetSong = library.find(s => s.id === songId);
    if (!targetSong || !targetSong.rhythms || !targetSong.rhythms[rhythmIndex]) return;

    // 2. Παίρνουμε την τρέχουσα ταχύτητα από το slider
    const currentBpm = document.getElementById('rngBpm') ? parseInt(document.getElementById('rngBpm').value) : 100;
    
    // 3. Ανανεώνουμε την ταχύτητα στο αντικείμενο του ρυθμού
    targetSong.rhythms[rhythmIndex].bpm = currentBpm;
    
    // 4. Σώζουμε το τραγούδι και ξαναζωγραφίζουμε τη λίστα για να φανεί η αλλαγή
    if (typeof saveSong === 'function') saveSong(targetSong);
    renderRhythmsList(targetSong.rhythms); 
    
    if (typeof showToast === 'function') showToast(`Η ταχύτητα αποθηκεύτηκε στα ${currentBpm} BPM!`);
}
// ✨ ΝΕΑ ΣΥΝΑΡΤΗΣΗ: "Πιάνει" το κλικ διαγραφής, σταματάει τον ήχο και μετά διαγράφει το αρχείο
function handleDeleteRhythm(songId, index) {
    // 1. Σταματάμε τη μηχανή αν έπαιζε ο ρυθμός
    if (window.mRhythm && window.activeRhythmType === 'sequencer') {
        window.mRhythm.stop();
    }
    
    // 2. Επαναφέρουμε το UI στον Μετρονόμο
    window.activeRhythmType = 'metronome';
    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
    
    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = "Απλός Μετρονόμος (Tick)";
        nameDisplay.style.color = "var(--text-main)"; 
    }

    console.log("🧹 [RHYTHM] Ο ρυθμός σταμάτησε λόγω διαγραφής από τη λίστα.");

    // 3. Προχωράμε στην κανονική διαγραφή από τη βάση/λίστα χρησιμοποιώντας την έτοιμη υποδομή σου!
    if (typeof deleteMediaItem === 'function') {
        deleteMediaItem(songId, 'rhythms', index);
    }
}

// --- 2. ΦΟΡΤΩΣΗ ΤΟΥ ΡΥΘΜΟΥ ΣΤΗ ΜΗΧΑΝΗ (PREMIUM FEATURE) ---

async function activateSongRhythm(url, name, savedBpm = null) {
    // 1. ΕΛΕΓΧΟΣ PAYWALL
    if (typeof canUserPerform === 'function' && !canUserPerform('USE_RHYTHMS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Επαγγελματικοί Ρυθμοί');
        else if (typeof showToast === 'function') showToast("Αυτή η λειτουργία απαιτεί Pro συνδρομή.", "warning");
        return;
    }

    // 2. ΑΜΕΣΟ INIT ΤΟΥ ΗΧΟΥ (Για να μην μας μπλοκάρει ο browser)
    if (window.mRhythm) {
        try {
            await window.mRhythm.init(); 
            window.mRhythm.stop();       
        } catch (e) {
            console.warn("[RHYTHM] Audio init warning:", e);
        }
    }

    // 3. ΑΣΦΑΛΗΣ ΕΛΕΓΧΟΣ ΜΕΤΡΟΝΟΜΟΥ
    if (typeof BasicMetronome !== 'undefined') {
        const isMetroPlaying = typeof BasicMetronome.isPlaying === 'function' ? BasicMetronome.isPlaying() : BasicMetronome.isPlaying;
        if (isMetroPlaying === true) {
            BasicMetronome.toggle(); 
        }
    }

    try {
        console.log(`[RHYTHM] Κατέβασμα αρχείου .mnr από: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Αποτυχία λήψης αρχείου");
        const rhythmData = await response.json();

        // 4. Ενημέρωση UI (Όνομα Ρυθμού)
        const nameDisplay = document.getElementById('seq-current-name');
        if (nameDisplay) {
            nameDisplay.innerText = name || rhythmData.metadata?.name || "Custom Rhythm";
            nameDisplay.style.color = "var(--accent)"; 
        }

        // 5: Εφαρμογή του αποθηκευμένου BPM στο Slider και στη Μηχανή
        if (savedBpm) {
            const rngBpm = document.getElementById('rngBpm');
            if (rngBpm) rngBpm.value = savedBpm;
            
            // Καλούμε τη συνάρτηση που φτιάξαμε για να ενημερωθεί το νούμερο οπτικά και η ταχύτητα!
            if (typeof changeRhythmBpm === 'function') changeRhythmBpm(savedBpm);
        }

        // 6. Φόρτωση στη Νέα Μηχανή
        if (window.mRhythm) {
            await window.mRhythm.loadFromObject(rhythmData);
            window.activeRhythmType = 'sequencer'; 
            
            // ΝΕΟ: Ενημέρωση του μηνύματος (Toast) για να δείχνει τη σωστή ταχύτητα
            if (typeof showToast === 'function') showToast(`Ο ρυθμός φορτώθηκε στα ${savedBpm || 100} BPM! 🥁`);
        } else {
            console.warn("[RHYTHM] Δεν βρέθηκε το window.mRhythm.");
            window.activeRhythmType = 'metronome';
        }
    } catch (error) {
        console.error("[RHYTHM ERROR]:", error);
        window.activeRhythmType = 'metronome'; 
        if (typeof showToast === 'function') showToast("Σφάλμα φόρτωσης ρυθμού.", "error");
    }
}
// --- ΤΟ ΕΞΥΠΝΟ PLAY/STOP BUTTON ---
function toggleMasterRhythm() {
    const icon = document.getElementById('iconPlayRhythm');
    const bpmSlider = document.getElementById('rngBpm');
    const currentBpm = bpmSlider ? parseInt(bpmSlider.value) : 100;

    // ΠΕΡΙΠΤΩΣΗ Α: Ο χρήστης είναι Pro και έχει φορτώσει ρυθμό (.mnr)
    if (window.activeRhythmType === 'sequencer' && window.mRhythm) {
        
        if (window.isRhythmPlaying) {
            // Σταματάμε τον ρυθμό
            window.mRhythm.stop();
            if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
        } else {
            // Πριν ξεκινήσουμε, βεβαιωνόμαστε ότι το BPM είναι συγχρονισμένο με το UI
            window.mRhythm.setBpm(currentBpm);
            
            // Ξεκινάμε τον ρυθμό
            window.mRhythm.play();
            if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-stop'); }
        }
        
    } 
    // ΠΕΡΙΠΤΩΣΗ Β: Free χρήστες Ή Pro χρήστες που δεν έχουν φορτώσει ρυθμό (Fallback Μετρονόμου)
    else {
        if (typeof BasicMetronome !== 'undefined') {
            // Συγχρονίζουμε το BPM και στον μετρονόμο (αν η κλάση σου έχει τέτοια μέθοδο)
            if (typeof BasicMetronome.setBpm === 'function') {
                BasicMetronome.setBpm(currentBpm);
            }
            
            BasicMetronome.toggle();
            
            // Αλλαγή εικονιδίου για τον μετρονόμο
            if (BasicMetronome.isPlaying) {
                if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-stop'); }
            } else {
                if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
            }
        } else {
            console.warn("⚠️ Προσοχή: Ο BasicMetronome δεν βρέθηκε.");
            if (typeof showToast === 'function') showToast("Ο μετρονόμος δεν είναι διαθέσιμος.", "error");
        }
    }
}
// --- ΑΛΛΑΓΗ ΕΝΤΑΣΗΣ (VOLUME) ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΧΡΟΝΟ ---
function changeRhythmVolume(value) {
    // Υποθέτουμε ότι το slider δίνει τιμές από 0 έως 100. Το μετατρέπουμε σε 0.0 έως 1.0
    const normalizedVol = parseInt(value) / 100;
    
    // 1. Ενημέρωση της νέας μηχανής (.mnr)
    if (window.mRhythm) {
        // Ελέγχουμε αν το wrapper έχει μέθοδο, αλλιώς "μιλάμε" κατευθείαν στην engine
        if (typeof window.mRhythm.setMasterVolume === 'function') {
            window.mRhythm.setMasterVolume(normalizedVol);
        } else if (window.mRhythm.engine) {
            window.mRhythm.engine.masterVolume = normalizedVol;
        }
    }
    
    // 2. Ενημέρωση του απλού μετρονόμου (Free έκδοση)
    if (typeof BasicMetronome !== 'undefined' && typeof BasicMetronome.setVolume === 'function') {
        BasicMetronome.setVolume(normalizedVol);
    }
}

// --- ΑΛΛΑΓΗ ΤΑΧΥΤΗΤΑΣ (BPM) ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΧΡΟΝΟ ---
function changeRhythmBpm(value) {
    const newBpm = parseInt(value);
    
    // 1. Οπτική ενημέρωση του νούμερου δίπλα στο slider (π.χ. 120)
    const dispBpm = document.getElementById('dispBpm');
    if (dispBpm) dispBpm.innerText = newBpm;

    // 2. Ενημέρωση της νέας μηχανής (.mnr)
    if (window.mRhythm) {
        window.mRhythm.setBpm(newBpm);
    }
    
    // 3. Ενημέρωση του απλού μετρονόμου
    if (typeof BasicMetronome !== 'undefined' && typeof BasicMetronome.setBpm === 'function') {
        BasicMetronome.setBpm(newBpm);
    }
}
// --- ΑΠΟΦΟΡΤΩΣΗ ΡΥΘΜΟΥ (ΕΠΙΣΤΡΟΦΗ ΣΕ ΜΕΤΡΟΝΟΜΟ) ---
function clearActiveRhythm() {
    // 1. Σταματάμε τη μηχανή αν παίζει
    if (window.mRhythm && window.activeRhythmType === 'sequencer') {
        window.mRhythm.stop();
    }
    
    // 2. Επαναφορά στο UI
    window.activeRhythmType = 'metronome';
    
    // Επαναφορά Κουμπιού Play/Stop
    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }

    // Επαναφορά Ταμπέλας Ονόματος
    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = "Απλός Μετρονόμος (Tick)";
        nameDisplay.style.color = "var(--text-main)"; 
    }

    console.log("🧹 [RHYTHM] Ο ρυθμός αποφορτώθηκε. Επιστροφή στον μετρονόμο.");
}
