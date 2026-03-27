/* ===========================================================
   mNotes Pro UI Logic v17.6 (FINAL VERIFIED)
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
    document.body.className = userSettings.theme; 
    if (window.innerWidth <= 1024 && userSettings.theme === 'theme-dark') { document.body.classList.add('theme-slate'); }
    var root = document.documentElement; 
    if (userSettings.theme === 'theme-custom' && userSettings.customColors) { 
        for (var key in userSettings.customColors) { root.style.setProperty(key, userSettings.customColors[key]); } 
    } else { 
        ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => root.style.removeProperty(k)); 
    } 
    var newSize = 1.1 + ((userSettings.introScale || 0) * 0.11); 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem"); 
    document.body.style.setProperty('--chord-scale', userSettings.chordSize || 1);
    document.body.style.setProperty('--chord-mb', (userSettings.chordDist || 0) + "px");
    
   // Αν έχει επιλέξει 'default', σβήνουμε το custom χρώμα για να "ξυπνήσει" το χρώμα του Theme!
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
        if(s.playlists && Array.isArray(s.playlists)) {
            s.playlists.forEach(t => allTags.add(t));
        }
    });
    
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
    if(!method) method = 'alpha';
    
    if (method === 'alpha') {
        library.sort((a, b) => a.title.localeCompare(b.title));
    } 
    else if (method === 'created') {
        // Εξάγουμε το Timestamp (Date.now) κατευθείαν μέσα από το ID (π.χ. s_1700000000_xyz)
        library.sort((a, b) => {
            let timeA = parseInt(String(a.id).split('_')[1]) || 0;
            let timeB = parseInt(String(b.id).split('_')[1]) || 0;
            return timeB - timeA;
        });
    } 
    else if (method === 'modified') {
        // Μετατρέπουμε το ISO String του updated_at σε αριθμό για να κάνουμε την αφαίρεση
        library.sort((a, b) => {
            let timeA = new Date(a.updated_at || a.updatedAt || 0).getTime();
            let timeB = new Date(b.updated_at || b.updatedAt || 0).getTime();
            return timeB - timeA;
        });
    }
    
    userSettings.sortMethod = method;
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    renderSidebar();
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
            
            // Κλείσιμο Drawer σε κινητά
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
            actionIcon = "fas fa-minus-circle"; // Κόκκινο μείον για αφαίρεση
        } else if (liveSetlist.includes(s.id)) {
            actionIcon = "fas fa-check-circle in-setlist"; // Πράσινο τικ αν υπάρχει ήδη
        }
      // G. SMART CLONE BADGES (STAGE-READY)
        let badgesHTML = '';

        // 1. ☁️ Συννεφάκι (Cloud): Δείχνει ότι το τραγούδι είναι συγχρονισμένο (δεν είναι local/demo)
        // Ελέγχουμε αν ΔΕΝ είναι demo ΚΑΙ (είναι σε μπάντα Ή στα προσωπικά με δικαίωμα cloud)
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
            handle: '.song-handle', // Drag μόνο από το χερούλι (μόνο σε setlist mode)
            disabled: (viewMode !== 'setlist'), // Απενεργοποίηση στο Library View
            onEnd: function (evt) {
                if (viewMode === 'setlist') {
                    // Ενημέρωση του Array βάσει της νέας σειράς
                    var movedId = liveSetlist.splice(evt.oldIndex, 1)[0];
                    liveSetlist.splice(evt.newIndex, 0, movedId);
                    if (typeof saveSetlists === 'function') saveSetlists();
                }
            }
        });
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
    // 1. Σταμάτημα Auto Scroll αν τρέχει
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll();
   
    // Κλείσιμο του συρταριού σημειώσεων στο Live View - Άνοιγμα των συγχορδιών
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = false;
    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = true; 
   
    // 2.1 Εύρεση Τραγουδιού
    currentSongId = id; 
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
    
    // 5. ΣΥΓΧΡΟΝΙΣΜΟΣ RHYTHM / SEQUENCER
    if (typeof syncSequencerToSong === 'function') {
        syncSequencerToSong(s);
    } else if (s.rhythm && s.rhythm.bpm && typeof AudioEngine !== 'undefined') {
        AudioEngine.setBpm(s.rhythm.bpm);
    }

    // 6. Αλλαγή Προβολής (View)
    document.getElementById('view-player').classList.add('active-view'); 
    document.getElementById('view-editor').classList.remove('active-view');
    
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
    
    // --- ΛΟΓΙΚΗ ΣΗΜΕΙΩΣΕΩΝ (Διαβάζει τα δεδομένα) ---
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const pNote = personalNotesMap[s.id] || "";
    const bNote = s.conductorNotes || "";
    const hasNotes = (bNote.trim().length > 0) || (pNote.trim().length > 0);

    // Γεμίζουμε τα νέα πεδία της πλαϊνής μπάρας (αν υπάρχουν στο DOM)
    const sideB = document.getElementById('sideBandNotes');
    const sideP = document.getElementById('sidePersonalNotes');
    if (sideB) sideB.value = bNote;
    if (sideP) sideP.value = pNote;

    const btnHtml = `<button id="btnIntroToggle" onclick="cycleIntroSize()" class="size-toggle-btn" title="Change Text Size"><i class="fas fa-text-height"></i></button>`;

  // --- ΛΟΓΙΚΗ INTRO / INTERLUDE ---
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
    
    // --- ΤΟ ΝΕΟ ΚΟΥΜΠΙ "ΠΙΝΕΖΑ" (Αντικαθιστά το παλιό μεγάλο κουμπί) ---
    let noteBtnHtml = '';
    if (hasNotes) {
        noteBtnHtml = `
            <button onclick="toggleStickyNotes()" title="Εμφάνιση Σημειώσεων" style="background: #fbc02d; color: #000; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); margin-left: 12px; transform: translateY(-2px); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px) scale(1.1)'" onmouseout="this.style.transform='translateY(-2px) scale(1)'">
                <i class="fas fa-thumbtack" style="font-size:0.85rem;"></i>
            </button>`;
    }
    
    // --- PLAYER HEADER ---
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header">
             <h2 id="mainAppTitle" style="margin:0 0 5px 0; font-size:1.2rem; color:var(--text-main); display:flex; align-items:center; flex-wrap:wrap; position:relative; padding-right:85px;">
                   <span>${s.title} ${s.artist ? `<span style="font-size:0.9rem; opacity:0.6;">- ${s.artist}</span>` : ''}</span>
                    ${noteBtnHtml}
    
                   <div class="mobile-nav-buttons" style="position:absolute; right:0; top:50%; transform:translateY(-50%); display:flex; gap:6px;">
                       <button onclick="navVisiblePlaylist(-1)" style="background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); cursor:pointer;"><i class="fas fa-chevron-left"></i></button>
                       <button onclick="navVisiblePlaylist(1)" style="background:var(--bg-panel); border:1px solid var(--border-color); color:var(--text-main); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); cursor:pointer;"><i class="fas fa-chevron-right"></i></button>
                   </div>
               </h2>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span class="key-badge">${typeof getNote === 'function' ? getNote(s.key || "-", state.t) : s.key}</span>
                    <button id="btnToggleView" onclick="toggleViewMode()"></button>
                </div>
            </div>
            ${metaHtml}
        </div>`;
    }
    // --- EXTRAS (Video, Audio, Lyrics) ---
    const vidBox = document.getElementById('video-sidebar-container');
    const embedBox = document.getElementById('video-embed-box');
    if (vidBox && embedBox) {
        if (s.video) {
            const ytId = getYoutubeId(s.video);
            if (ytId) {
                embedBox.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0; border-radius: 8px;"></iframe>`;
                vidBox.style.display = 'block';
            } else { vidBox.style.display = 'none'; }
        } else { vidBox.style.display = 'none'; }
    }

    if(typeof renderStickyNotes === 'function') renderStickyNotes(s);
    if(typeof renderRecordingsList === 'function') renderRecordingsList(s.recordings || [], []); 
    if(typeof renderAttachmentsList === 'function') renderAttachmentsList(s.attachments || []);
   
    const dValT = document.getElementById('val-t'); const dValC = document.getElementById('val-c');
    if(dValT) dValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(dValC) dValC.innerText = state.c;
    const mValT = document.getElementById('drawer-val-t'); const mValC = document.getElementById('drawer-val-c');
    if(mValT) mValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(mValC) mValC.innerText = state.c;

    // --- ΕΞΥΠΝΟ SPLIT (Ακυρώνεται στο Lyrics Mode) ---
    var split = { fixed: "", scroll: s.body || "" }; 
    
    // Αν ΔΕΝ είμαστε σε lyrics mode, κάνε κανονικά το κόψιμο
    if (!isLyricsMode && typeof splitSongBody === 'function') {
        split = splitSongBody(s.body || "");
    }
    
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);  
    
    // Κρύβουμε εντελώς το fixed-container για να μην πιάνει άδειο χώρο
    const fixedEl = document.getElementById('fixed-container');
    if (fixedEl) {
        fixedEl.style.display = split.fixed ? 'block' : 'none';
    }
    updateToggleButton(s); 
    if (typeof GuitarChordsUI !== 'undefined') {
        GuitarChordsUI.scanAndRender();
    }
}

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
function printSongPDF() {
    // 🔒 Έλεγχος Δικαιώματος
    if (typeof canUserPerform === 'function' && !canUserPerform('PRINT')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Εκτύπωση σε PDF');
        return; 
    }

    // 1. Τραβάμε τα δεδομένα από το ΦΟΡΤΩΜΕΝΟ τραγούδι
    var s = null;
    if (typeof currentSongId !== 'undefined' && currentSongId && typeof library !== 'undefined') {
        s = library.find(x => x.id === currentSongId);
    }

    var title = (s ? s.title : document.getElementById('inpTitle').value) || "Untitled";
    var artist = (s ? s.artist : document.getElementById('inpArtist').value) || "";
    var bodyRaw = (s ? s.body : document.getElementById('inpBody').value) || "";
    var introRaw = (s ? s.intro : (document.getElementById('inpIntro') ? document.getElementById('inpIntro').value : "")) || "";
    var interRaw = (s ? s.interlude : (document.getElementById('inpInter') ? document.getElementById('inpInter').value : "")) || "";
    
    var extras = "";
    if (introRaw.trim() !== "") extras += "Intro: " + introRaw + "\n";
    if (interRaw.trim() !== "") extras += "Interlude: " + interRaw + "\n";
    if (extras !== "") bodyRaw = extras + "\n" + bodyRaw;
    
    // 2. Σωστή τονικότητα με υπολογισμό Transpose ΚΑΙ Capo!
    var key = s ? s.key : (document.getElementById('inpKey').value || "-");
    var capoHtml = ""; 
    
    if (typeof getNote === 'function' && typeof state !== 'undefined' && key !== "-") {
        let soundingKey = getNote(key, state.t); 
        key = soundingKey; 
        
        if (state.c > 0) {
            let playingKey = getNote(s.key, state.t - state.c); 
            capoHtml = `<div class="meta capo-meta">Capo: ${state.c} (Play as ${playingKey})</div>`;
        }
    }
    
    title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

    // 3. Προετοιμασία κειμένου (ChordPro & Κλειστά θαυμαστικά)
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
        let hasText = /[\p{L}]/u.test(rawLyrics); // Ψάχνει μόνο γράμματα
        let isChordsOnly = !hasText;
        
        let rowClass = isChordsOnly ? 'print-row chords-only-row' : 'print-row';
        var rowHtml = `<div class="${rowClass}">`;

        // Γραμμή χωρίς συγχορδίες Ή Lyrics Mode
        if (line.indexOf('!') === -1 || (typeof isLyricsMode !== 'undefined' && isLyricsMode)) { 
            let pureText = line;
            if (typeof isLyricsMode !== 'undefined' && isLyricsMode) {
                pureText = rawLyrics.replace(/\s{2,}/g, ' ').trim(); 
            }
            let safeText = pureText.replace(/ /g, '&nbsp;'); 
            rowHtml += `<div class="token"><div class="lyric-only">${(safeText && safeText.length > 0) ? safeText : "&nbsp;"}</div></div>`; 
        } else { 
            // Γραμμή με συγχορδίες
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
                        if (typeof getNote === 'function' && typeof state !== 'undefined') {
                            noteDisp = getNote(chordRaw, state.t - state.c);
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

    // 5. Στήσιμο του παραθύρου εκτύπωσης (CSS & Logo)
    var win = window.open('', '', 'width=900,height=1000');
    
    var css = `
        body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            padding: 40px; 
            color: #111;
            position: relative; 
        }
        .logo { position: absolute; top: 20px; right: 30px; width: 50px; height: auto; opacity: 0.9; z-index: 10; }
        h1 { font-size: 26px; margin: 0 0 5px 0; border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; margin-right: 60px; }
        h2 { font-size: 16px; color: #444; margin: 0 0 20px 0; font-weight: normal; font-style: italic; }
        
        .meta-container { margin-bottom: 25px; display: flex; gap: 10px; flex-wrap: wrap; }
        .meta { font-size: 13px; color: #333; font-weight: bold; border: 1px solid #ddd; display: inline-block; padding: 4px 8px; border-radius: 4px; }
        .capo-meta { background: #e0f7fa; border-color: #00bcd4; color: #006064; }

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
        }
    `;

    var htmlContent = `
        <html>
        <head>
            <title>${title} - Print</title>
            <style>${css}</style>
        </head>
        <body>
            <img src="icon-192.png" class="logo" alt="Logo">
            <h1>${title}</h1>
            <h2>${artist}</h2>
            
            <div class="meta-container">
                <div class="meta">Key: ${key}</div>
                ${capoHtml}
            </div>
            
            <div class="content">${htmlBody}</div>
            
            <script>
                window.onload = function() { 
                    setTimeout(function(){ 
                        window.print(); 
                        window.close(); 
                    }, 800); 
                }
            </script>
        </body>
        </html>
    `;

    win.document.write(htmlContent);
    win.document.close();
}

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

    // Κάνουμε Loop σε όλα τα τραγούδια της τρέχουσας λίστας
    liveSetlist.forEach((item, index) => {
        // Υποστηρίζει είτε string IDs είτε ολόκληρα objects στη λίστα
        let songId = typeof item === 'object' ? item.id : item;
        let s = library.find(x => x.id === songId);
        
        if (!s) return; // Αν για κάποιο λόγο δεν βρεθεί, προχωράμε στο επόμενο

       var title = (s ? s.title : document.getElementById('inpTitle').value) || "Untitled";
       var artist = (s ? s.artist : document.getElementById('inpArtist').value) || "";
       var bodyRaw = (s ? s.body : document.getElementById('inpBody').value) || "";
       var introRaw = (s ? s.intro : (document.getElementById('inpIntro') ? document.getElementById('inpIntro').value : "")) || "";
       var interRaw = (s ? s.interlude : (document.getElementById('inpInter') ? document.getElementById('inpInter').value : "")) || "";
    
    var extras = "";
    if (introRaw.trim() !== "") extras += "Intro: " + introRaw + "\n";
    if (interRaw.trim() !== "") extras += "Interlude: " + interRaw + "\n";
    if (extras !== "") bodyRaw = extras + "\n" + bodyRaw;
        
        // 🎵 Τονικότητα (Επειδή τυπώνουμε λίστα, χρησιμοποιούμε την αποθηκευμένη τονικότητα)
        var key = s.key || "-";
        var transposeVal = s.personal_transpose || 0;
        
        if (typeof getNote === 'function' && key !== "-") {
            key = getNote(key, transposeVal); 
        }
        
        title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        // 3. Προετοιμασία κειμένου (ChordPro)
        const chordRx = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
        bodyRaw = bodyRaw.replace(new RegExp(`\\[${chordRx}\\]`, 'g'), "!$1 ");
        bodyRaw = bodyRaw.replace(new RegExp(`!${chordRx}!`, 'g'), "!$1 ");

        var lines = bodyRaw.split('\n');
        var htmlBody = "";

        // 4. Χτίσιμο των γραμμών του τραγουδιού
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

        // ✨ 5. Σύνθεση του τραγουδιού και Page Break αν δεν είναι το τελευταίο
        let pageBreakClass = index < liveSetlist.length - 1 ? 'page-break' : '';
        
        fullHtmlBody += `
            <div class="song-page ${pageBreakClass}">
                <img src="icon-192.png" class="logo" alt="Logo">
                <h1>${title}</h1>
                <h2>${artist}</h2>
                
                <div class="meta-container">
                    <div class="meta">Key: ${key}</div>
                </div>
                
                <div class="content">${htmlBody}</div>
            </div>
        `;
    });

    // 6. Στήσιμο του τελικού παραθύρου εκτύπωσης
    var win = window.open('', '', 'width=900,height=1000');
    
    var css = `
        body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            padding: 0; margin: 0; color: #111;
        }
        .song-page {
            position: relative;
            padding: 40px; /* Εσωτερικό περιθώριο αντί για το body */
            box-sizing: border-box;
        }
        /* ✨ Εδώ κρύβεται η μαγεία για το PDF! */
        .page-break {
            page-break-after: always; 
            break-after: page;
        }
        .logo { position: absolute; top: 20px; right: 30px; width: 50px; height: auto; opacity: 0.9; z-index: 10; }
        h1 { font-size: 26px; margin: 0 0 5px 0; border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; margin-right: 60px; }
        h2 { font-size: 16px; color: #444; margin: 0 0 20px 0; font-weight: normal; font-style: italic; }
        
        .meta-container { margin-bottom: 25px; display: flex; gap: 10px; flex-wrap: wrap; }
        .meta { font-size: 13px; color: #333; font-weight: bold; border: 1px solid #ddd; display: inline-block; padding: 4px 8px; border-radius: 4px; }

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

    var htmlContent = `
        <html>
        <head>
            <title>Setlist Print</title>
            <style>${css}</style>
        </head>
        <body>
            ${fullHtmlBody}
            <script>
                window.onload = function() { 
                    setTimeout(function(){ 
                        window.print(); 
                        window.close(); 
                    }, 800); 
                }
            </script>
        </body>
        </html>
    `;

    win.document.write(htmlContent);
    win.document.close();
}
// ===========================================================
// 6. EDITOR LOGIC
// ===========================================================

function switchToEditor() {
   // ✨ ΕΛΕΓΧΟΣ ΔΙΚΑΙΩΜΑΤΩΝ: Μπλοκάρισμα του Editor σε απλά μέλη/θεατές της μπάντας
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
        if (typeof currentRole !== 'undefined' && currentRole !== 'admin' && currentRole !== 'owner') {
            showToast("Μόνο οι διαχειριστές μπορούν να επεξεργαστούν τα τραγούδια της μπάντας. Κάντε 'Clone' για δική σας χρήση!", "error");
            return; // Σταματάει εδώ, δεν ανοίγει ο Editor!
        }
    }
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view');
   
   // Άνοιγμα του συρταριού σημειώσεων - κλείσιμο συγχορδιών
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = true;
   let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = false; 
    
    
    // Ενεργοποίηση διγλωσσίας στα placeholders
    if (typeof applyEditorPlaceholders === 'function') applyEditorPlaceholders();

    if (currentSongId) { 
        var s = library.find(x => x.id === currentSongId); 
        if (s) { 
            document.getElementById('inpTitle').value = s.title || ""; 
            document.getElementById('inpArtist').value = s.artist || ""; 
            document.getElementById('inpVideo').value = s.video || ""; 
            document.getElementById('inpKey').value = s.key || ""; 
            document.getElementById('inpBody').value = s.body || ""; 
            document.getElementById('inpIntro').value = s.intro || ""; 
            document.getElementById('inpInter').value = s.interlude || ""; 
            document.getElementById('inpConductorNotes').value = s.conductorNotes || ""; 
                                   
            // Διόρθωση για να αναγνωρίζει και playlists και tags
            editorTags = s.tags ? [...s.tags] : (s.playlists ? [...s.playlists] : []); 
            if(typeof renderTagChips === 'function') renderTagChips(); 
        } 
    } else { 
        createNewSong(); 
    }
}

function saveEdit() { 
    let bodyArea = document.getElementById('inpBody'); 
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value); 
    saveSong(); 
    populateTags(); 
    applyFilters(); 
}

function fixTrailingChords(text) { let lines = text.split('\n'); return lines.map(line => { const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; if (line.match(trailingChordRegex)) return line.trimEnd() + "    "; return line; }).join('\n'); }
function createNewSong() { currentSongId = null; document.querySelectorAll('.inp').forEach(e => e.value = ""); editorTags = []; if(typeof renderTagChips === 'function') renderTagChips(); document.getElementById('view-player').classList.remove('active-view'); document.getElementById('view-editor').classList.add('active-view'); if (typeof applyEditorPlaceholders === 'function') {applyEditorPlaceholders();}}
function exitEditor() { 
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
            if (s.playlists && Array.isArray(s.playlists)) {
                s.playlists.forEach(t => allTags.add(t));
            }
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
                div.className = 'tag-suggestion-item'; // Χρειάζεται CSS (δες παρακάτω)
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
            currentRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (currentSongId && typeof currentUser !== 'undefined' && currentUser) { btnLink.style.display = 'inline-block'; }
        };
        mediaRecorder.start();
        btn.classList.add('recording-active'); btn.innerHTML = '<i class="fas fa-stop"></i>'; timer.style.color = "var(--danger)"; 
        recStartTime = Date.now(); recTimerInterval = setInterval(() => { const diff = Math.floor((Date.now() - recStartTime) / 1000); const m = Math.floor(diff / 60).toString().padStart(2,'0'); const s = (diff % 60).toString().padStart(2,'0'); timer.innerText = `${m}:${s}`; }, 1000);
    } catch (err) { alert("Microphone Error: " + err.message); }
}

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
        
        s.recordings.push(newRec);

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
    
    liveSetlist = allSetlists[currentSetlistName].songs || [];
    
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
    const isBandViewer = (currentGroupId !== 'personal' && currentRole !== 'admin' && currentRole !== 'owner');
    if (isBandViewer) {
        showToast("Μόνο οι διαχειριστές μπορούν να φτιάξουν λίστες για τη μπάντα.", "error");
        return;
    }

    const name = prompt(typeof t === 'function' ? t('msg_new_setlist') : "Όνομα νέας λίστας:");
    if (name && !allSetlists[name]) {
        allSetlists[name] = { type: 'local', songs: [] }; 
        saveSetlists(name); 
        switchSetlist(name); 
        updateSetlistDropdown();
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
    if (!liveSetlist || liveSetlist.length === 0) { showToast("Setlist is empty!"); return; }
    let currentIndex = -1; if (currentSongId) currentIndex = liveSetlist.indexOf(currentSongId);
    let newIndex = currentIndex + dir;
    if (newIndex >= 0 && newIndex < liveSetlist.length) { loadSong(liveSetlist[newIndex]); } 
    else { showToast(dir > 0 ? "Τέλος Λίστας" : "Αρχή Λίστας"); }
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

        el.innerHTML = `
            <div onclick="playAudio('${rec.url}')" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="${tooltip}">
                <i class="${iconClass}" style="color:${colorVar}; margin-right:8px;"></i>
                <span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rec.name || rec.label}</span>
            </div>
            ${promoteBtnHtml}
            ${deleteBtnHtml}
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

        // Κουμπί Share/Propose: Μόνο για private αρχεία, όταν βρισκόμαστε σε μπάντα!
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
        const fileType = (doc.type && doc.type.toLowerCase().includes('image')) ? 'image' : 'pdf';
        el.innerHTML = `
            <div onclick="FloatingTools.loadContent('${doc.url}', '${fileType}')" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="${tooltip}">
                <i class="${iconClass}" style="color:${borderColor}; margin-right:8px;"></i>
                <span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${doc.name}</span>
            </div>
            ${promoteBtnHtml}
            ${deleteBtnHtml}
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
    ['sidebar', 'mainZone', 'rhythmTools'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('mobile-view-active'); });
    const targetId = map[tabName]; const targetEl = document.getElementById(targetId);
    if (targetEl) { targetEl.classList.add('mobile-view-active'); }
    const btns = document.querySelectorAll('.tab-btn-mob'); btns.forEach(b => b.classList.remove('active'));
    if (tabName === 'library' && btns[0]) btns[0].classList.add('active');
    if (tabName === 'stage' && btns[1]) btns[1].classList.add('active');
    if (tabName === 'tools' && btns[2]) btns[2].classList.add('active');
}

function toggleRightDrawer() {
    const d = document.getElementById('rightDrawer'); if(!d) return;
    const isOpen = d.classList.contains('open');
    if (isOpen) { d.classList.remove('open');document.removeEventListener('click', closeDrawerOutside); } 
    else { d.classList.add('open'); setTimeout(() => { document.addEventListener('click', closeDrawerOutside); }, 100); setupDrawerListeners(d); }
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

    // 1. Αφαίρεση του active από όλα τα κουμπιά του Drawer
    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));

    // 2. Εύρεση και ενεργοποίηση του σωστού κουμπιού βάσει του tabName
    // Χρησιμοποιούμε το onclick attribute για να βρούμε το σωστό κουμπί
    const targetBtn = document.querySelector(`.drawer-btn[onclick*="'${tabName}'"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // 3. Εναλλαγή του View (Library, Stage, Tools)
    if (typeof switchMobileTab === 'function') {
        switchMobileTab(tabName);
    }

    // 4. Εμφάνιση/Απόκρυψη των Player Controls (Transpose, κλπ) μέσα στο Drawer
    const controlsDiv = document.getElementById('drawer-player-controls');
    if (controlsDiv) {
        // Τα controls εμφανίζονται ΜΟΝΟ όταν είμαστε στο Stage
        controlsDiv.style.display = (tabName === 'stage') ? 'block' : 'none';
    }

    // 5. Κλείσιμο του Drawer για να αποκαλυφθεί η οθόνη
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
    const chkSplit = document.getElementById('setDisableSplit');
    if (chkSplit) chkSplit.checked = userSettings.disableSplit || false;
    if (!modal) return;

    if (typeof userSettings === 'undefined') {
        userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || { theme: 'theme-dark', lang: 'el', sortMethod: 'alpha' };
    }

    const themeSel = document.getElementById('setTheme');
    const langSel = document.getElementById('langSelect');
    const sortSel = document.getElementById('sortDefaultSelect'); 
    const sizeInp = document.getElementById('setChordSize');
    const distInp = document.getElementById('setChordDist');
    const colInp = document.getElementById('setChordColor');
    const chkDef = document.getElementById('chkDefaultColor'); 
    
    // --- ΠΕΔΙΑ AUTO SCROLL ---
    const speedInp = document.getElementById('setScrollSpeed');
    const btnChk = document.getElementById('setShowScrollBtn');

    if(themeSel) themeSel.value = userSettings.theme || 'theme-dark';
    if(langSel) langSel.value = userSettings.lang || 'el';
    if(sortSel) sortSel.value = userSettings.sortMethod || 'alpha';
    if(sizeInp) sizeInp.value = userSettings.chordSize || 1;
    if(distInp) distInp.value = userSettings.chordDist || 0;
    
    // Φόρτωση ρυθμίσεων Scroll
    if(speedInp) speedInp.value = userSettings.scrollSpeed || 50;
    if(btnChk) btnChk.checked = (typeof userSettings.showScrollBtn !== 'undefined') ? userSettings.showScrollBtn : true;

    // Λογική για το Χρώμα
    if(colInp && chkDef) {
        if (!userSettings.chordColor || userSettings.chordColor === 'default') {
            chkDef.checked = true;
            colInp.disabled = true;
            colInp.style.opacity = '0.3';
            colInp.value = '#ffb74d'; 
        } else {
            chkDef.checked = false;
            colInp.disabled = false;
            colInp.style.opacity = '1';
            colInp.value = userSettings.chordColor;
        }
    }

    modal.style.display = 'flex';
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
}

function saveSettings() {
    const themeSel = document.getElementById('setTheme');
    const langSel = document.getElementById('langSelect');
    const sortSel = document.getElementById('sortDefaultSelect');
    const sizeInp = document.getElementById('setChordSize');
    const distInp = document.getElementById('setChordDist');
    const colInp = document.getElementById('setChordColor');
    const chkDef = document.getElementById('chkDefaultColor');
    
    // --- ΠΕΔΙΑ ΓΙΑ ΤΟ AUTO SCROLL ---
    const speedInp = document.getElementById('setScrollSpeed');
    const btnChk = document.getElementById('setShowScrollBtn');
    
    if (speedInp) userSettings.scrollSpeed = speedInp.value;
    if (btnChk) userSettings.showScrollBtn = btnChk.checked;
    // --------------------------------

    // 1. Εφαρμογή Θέματος
    if (themeSel) {
        userSettings.theme = themeSel.value;
        if(typeof applyTheme === 'function') applyTheme();
    }

    // 2. Εφαρμογή Γλώσσας
    if (langSel) {
        userSettings.lang = langSel.value;
        if(typeof toggleLanguage === 'function') {
             const currentLangStored = localStorage.getItem('mnotes_lang');
             if(currentLangStored !== userSettings.lang) {
                 toggleLanguage(); 
             }
        }
    }
    
    if (sizeInp) userSettings.chordSize = parseFloat(sizeInp.value);
    if (distInp) userSettings.chordDist = parseInt(distInp.value);
    
    if (chkDef && chkDef.checked) {
        userSettings.chordColor = 'default';
    } else if (colInp) {
        userSettings.chordColor = colInp.value;
    }
    
    // 3. Προεπιλογή Ταξινόμησης
    if (sortSel) { userSettings.sortMethod = sortSel.value; }
     
    const chkSplit = document.getElementById('setDisableSplit');
    if (chkSplit) userSettings.disableSplit = chkSplit.checked;
    
    // 4. Αποθήκευση στη μνήμη
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    
    // ΕΦΑΡΜΟΓΗ ΟΠΤΙΚΩΝ ΑΛΛΑΓΩΝ ΑΜΕΣΑ!
    if (typeof applyTheme === 'function') applyTheme();
    if (typeof applyScrollBtnVisibility === 'function') applyScrollBtnVisibility();

    // Κλείσιμο παραθύρου & Ενημέρωση
    closeSettings();
    
    // Ανανέωση λίστας με τις νέες ρυθμίσεις
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod);
    
    if (typeof currentSongId !== 'undefined' && currentSongId) {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') renderPlayer(s);
    }
    
    showToast(userSettings.lang === 'el' ? "Οι ρυθμίσεις αποθηκεύτηκαν" : "Settings saved");
}

// Κλείσιμο των modals αν πατήσουμε έξω από το κουτί
window.onclick = function(event) {
    const setsModal = document.getElementById('settingsModal');
    const impModal = document.getElementById('importChoiceModal');
    const qrModal = document.getElementById('qrModal');
    const scanModal = document.getElementById('scanModal');
    const authModal = document.getElementById('authModal');

    if (event.target === setsModal) closeSettings();
    if (event.target === impModal) impModal.style.display = 'none';
    if (event.target === qrModal) qrModal.style.display = 'none';
    if (event.target === authModal) authModal.style.display = 'none';
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
function toViewer(shouldLoad = true) { exitEditor(); }
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
