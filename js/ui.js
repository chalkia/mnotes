/* ===========================================================
   mNotes Pro UI Logic v17.6 (FINAL TRANSLATED & VERIFIED)
   =========================================================== */
// ===========================================================
// 1. GLOBALS & INITIALIZATION (CLEANED UP)

if (typeof window.library === 'undefined') window.library = [];
window.library = window.library || [];
var library = window.library; 

if (typeof window.state === 'undefined') window.state = { t: 0, c: 0, meta: {}, parsedChords: [] };
var state = window.state;

var currentSongId = window.currentSongId || null;
var visiblePlaylist = []; 
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

// Settings Default 
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50, maxCapo: 12, hideDemo: false, theme: 'theme-slate', introScale: 0, keepScreenOn: false, sortMethod: 'alpha',
    chordSize: 1, chordDist: 0, chordColor: 'default',
   customColors: { '--bg-main': '#000000', '--bg-panel': '#222222', '--text-main': '#ffffff', '--accent': '#00ff00', '--chord-color': '#ffff00' }
};
var tempIntroScale = 0; 

// --- ΡΥΘΜΙΣΗ ΓΛΩΣΣΑΣ ---
window.currentLang = localStorage.getItem('mnotes_lang') || (navigator.language.toLowerCase().startsWith('el') ? 'el' : 'en');
var currentLang = window.currentLang;

function toggleLanguage() { 
    currentLang = (currentLang === 'en') ? 'el' : 'en'; 
    window.currentLang = currentLang; 
    localStorage.setItem('mnotes_lang', currentLang); 
    console.log(`[i18n] Language switched to: ${currentLang}`);
    applyTranslations(); 
    renderSidebar(); 
    if (typeof populateTags === 'function') populateTags(); 
    if(currentSongId && String(currentSongId).includes('demo')) loadSong(currentSongId); 
}

function applyTranslations() {
    if(typeof TRANSLATIONS === 'undefined') {
        console.warn("[i18n] TRANSLATIONS object not found!");
        return; 
    }
    
    document.querySelectorAll('[data-i18n]').forEach(el => { 
        var key = el.getAttribute('data-i18n'); 
        if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = TRANSLATIONS[currentLang][key];
            } else {
                el.innerText = TRANSLATIONS[currentLang][key];
            }
        } 
    }); 
    
    var btn = document.getElementById('btnLang'); 
    if(btn) btn.innerHTML = (currentLang === 'en') ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> EL'; 
}

function applyTheme() { 
    document.body.className = userSettings.theme || 'theme-slate'; 
    
    if (window.innerWidth <= 1024 && userSettings.theme === 'theme-dark') { 
        document.body.classList.add('theme-slate'); 
    } 
    
    const root = document.documentElement; 
    ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => root.style.removeProperty(k)); 

    var newSize = 1.1 + ((userSettings.introScale || 0) * 0.11); 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem"); 
    document.body.style.setProperty('--chord-scale', userSettings.chordSize || 1);
    document.body.style.setProperty('--chord-mb', (userSettings.chordDist || 0) + "px");
    
    if (userSettings.chordColor && userSettings.chordColor !== 'default') {
        document.body.style.setProperty('--chord-color', userSettings.chordColor);
    } else {
        document.body.style.removeProperty('--chord-color'); 
    }
    console.log("[THEME] Theme applied successfully.");
}

// ===========================================================
// 2. LIBRARY & SIDEBAR 
// ===========================================================
function loadLibrary() {
    console.log("[LIBRARY] Loading library...");
    initSetlists();
    populateTags();
   
    library = window.library;

    if (library && library.length > 0) {
        renderSidebar();
        return;
    }

    const saved = localStorage.getItem('mnotes_data');
    if (saved !== null) {
        const parsed = JSON.parse(saved);
        window.library = Array.isArray(parsed) ? parsed.map(ensureSongStructure) : [];
        library = window.library;
    } else {
        if (typeof DEFAULT_DEMO_SONGS !== 'undefined') {
            window.library = DEFAULT_DEMO_SONGS.map((ds, idx) => ({ ...ds, id: "demo_" + Date.now() + idx }));
            library = window.library;
            saveData();
        }
    }

    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    renderSidebar();
}

function initDrawerPersistence() {
    const storageKey = 'mnotes_drawer_states';
    const savedStates = JSON.parse(localStorage.getItem(storageKey)) || {};
    
    document.querySelectorAll('details.tool-group').forEach(drawer => {
        const id = drawer.id;
        if (!id) return;

        if (savedStates[id] !== undefined) {
            if (savedStates[id] === true) {
                drawer.setAttribute('open', '');
            } else {
                drawer.removeAttribute('open');
            }
        }

        drawer.addEventListener('toggle', () => {
            const currentStates = JSON.parse(localStorage.getItem(storageKey)) || {};
            currentStates[id] = drawer.open; 
            localStorage.setItem(storageKey, JSON.stringify(currentStates));
        });
    });
    console.log("[UI] Drawer persistence initialized.");
}

function populateTags() {
    const select = document.getElementById('tagFilter');
    if(!select) return;
    const currentVal = select.value;
    
    const allTagsText = (typeof TRANSLATIONS !== 'undefined' && typeof t === 'function') ? t('opt_all_tags', 'All Tags') : "All Tags";
    
    select.innerHTML = `<option value="">${allTagsText}</option><option value="__no_demo">${t('opt_no_demo', 'No Demo')}</option>`;
    
    const allTags = new Set();
    
    library.forEach(s => {
        let sTags = [];
        
        if (s.tags && Array.isArray(s.tags)) {
            sTags = s.tags;
        } 
        else if (s.tags && typeof s.tags === 'string' && s.tags.trim() !== '') {
            sTags = s.tags.split(',').map(tag => tag.trim());
        } 
        else if (s.playlists && Array.isArray(s.playlists)) {
            sTags = s.playlists;
        }

        sTags.forEach(tag => {
            if(tag) allTags.add(tag);
        });
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
    if (!method) method = 'alpha';
    console.log(`[LIBRARY] Sorting by: ${method}`);
    
    const getCreationTime = (s) => {
        if (s.created_at) return new Date(s.created_at).getTime();
        if (!s.id) return 0;
        
        let parts = String(s.id).split('_');
        if (parts.length > 1) {
            let ts = parseInt(parts[1], 10);
            if (!isNaN(ts) && ts > 1000000000000) return ts; 
        }
        return 0; 
    };

    const getModifiedTime = (s) => {
        if (s.updated_at) return new Date(s.updated_at).getTime();
        if (s.updatedAt) return new Date(s.updatedAt).getTime();
        return getCreationTime(s); 
    };

    if (method === 'alpha') {
        library.sort((a, b) => String(a.title).localeCompare(String(b.title), 'el', { sensitivity: 'base' }));
    } 
    else if (method === 'created') {
        library.sort((a, b) => getCreationTime(b) - getCreationTime(a));
    } 
    else if (method === 'modified') {
        library.sort((a, b) => getModifiedTime(b) - getModifiedTime(a));
    }
    
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

/* ===========================================================
   RENDER SIDEBAR
   =========================================================== */
function renderSidebar() {
    var list = document.getElementById('songList');
    if(!list) return;
    
    list.innerHTML = "";
    visiblePlaylist = [];

    const myCloneParentIds = library
        .filter(s => s.group_id === currentGroupId && s.is_clone && s.user_id === currentUser?.id)
        .map(s => s.parent_id);

    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = library.find(x => x.id === id);
            if (s) visiblePlaylist.push(s);
        });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            if (currentGroupId === 'personal') {
                if (s.group_id) return false; 
            } else {
                if (s.group_id !== currentGroupId) return false; 
                if (s.is_clone && s.user_id !== currentUser?.id) return false; 
                if (!s.is_clone && myCloneParentIds.includes(s.id)) return false; 
            }

            if (userSettings.hideDemo && String(s.id).includes("demo") && library.length > 1) return false;
            
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) || 
                           (s.key && s.key.toLowerCase() === txt);
            
            var sTags = (s.tags && s.tags.length > 0) ? s.tags : (s.playlists || []);
            var matchTag = (tag === "__no_demo") ? !String(s.id).includes("demo") : (tag === "" || sTags.includes(tag));
            
            return matchTxt && matchTag;
        });
    }

    const countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;

    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        
        let originClass = '';
        if (s.is_proposal) {
            originClass = 'proposal-item'; 
        } else if (s.group_id) {
            originClass = 'band-cloud';    
        } else {
            originClass = 'personal-cloud'; 
        }

        let isNew = (typeof lastImportedIds !== 'undefined' && lastImportedIds.has(s.id));
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''} ${originClass} ${isNew ? 'new-import' : ''}`;
        
        li.className = itemClass;
        li.setAttribute('data-id', s.id);

        li.onclick = (e) => {
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-badge')) return;
            
            const isEditorOpen = document.getElementById('view-editor')?.classList.contains('active-view');
            if (isEditorOpen && currentSongId !== s.id) {
                localStorage.setItem('mnotes_view_state', 'player');
            }
            
            if (typeof loadSong === 'function') loadSong(s.id);
                                
            if(window.innerWidth <= 1024) {
                const leftDrawer = document.getElementById('leftDrawer'); 
                if(leftDrawer && leftDrawer.classList.contains('open') && typeof toggleLeftDrawer === 'function') {
                    toggleLeftDrawer();
                }
                const rightDrawer = document.getElementById('rightDrawer');
                if(rightDrawer && rightDrawer.classList.contains('open') && typeof toggleRightDrawer === 'function') {
                    toggleRightDrawer();
                }
            }
        };

        var displayTitle = s.title;
        var displayKey = s.key || "-";
        
        var actionIcon = "far fa-circle";
        if (viewMode === 'setlist') {
            actionIcon = "fas fa-minus-circle"; 
        } else if (liveSetlist.includes(s.id)) {
            actionIcon = "fas fa-check-circle in-setlist"; 
        }

        let badgesHTML = '';

        if (!String(s.id).includes('demo')) {
             if (s.group_id || (typeof canUserPerform === 'function' && canUserPerform('CLOUD_SYNC'))) {
                  badgesHTML += `<i class="fas fa-cloud badge-cloud" title="${t('title_in_cloud', 'Στο Cloud')}" style="margin-left:8px; font-size:0.75rem; opacity:0.4;"></i>`;
             }
        }
        if (s.personal_transpose && s.personal_transpose !== 0) {
            badgesHTML += `<i class="fas fa-music" title="${t('title_changed_key', 'Αλλαγμένος Τόνος')}" style="margin-left:8px; font-size:0.75rem; color:var(--accent);"></i>`;
        }
        if (s.is_clone || !!s.parent_id) {
            badgesHTML += `<i class="fas fa-user-edit" title="${t('title_personal_clone', 'Προσωπικός Κλώνος')}" style="margin-left:8px; font-size:0.75rem; color:#ff4444;"></i>`;
        }

        let tagsDisplay = "";
        if (s.tags && Array.isArray(s.tags) && s.tags.length > 0) {
            let displayTags = s.tags.slice(0, 3).join(', '); 
            let extra = s.tags.length > 3 ? "..." : "";
            tagsDisplay = `<div style="font-size:0.7rem; color:var(--accent); margin-top:4px; font-style:italic;">${displayTags}${extra}</div>`;
        }

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
                    setTimeout(() => {renderSidebar(); }, 50);
                }
            }
        });
    }

    // --- 4. AUTO-LOAD ΤΡΑΓΟΥΔΙΟΥ (ΒΓΗΚΕ ΕΚΤΟΣ Sortable IF) ---
    if (visiblePlaylist.length > 0) {
        const isEditing = document.getElementById('view-editor')?.classList.contains('active-view');
        const isCurrentVisible = visiblePlaylist.find(s => s.id === currentSongId);
        
        if (!isEditing && (!currentSongId || !isCurrentVisible)) {
            const lastSavedId = localStorage.getItem('mnotes_last_song');
            const isLastSavedVisible = lastSavedId ? visiblePlaylist.find(s => s.id === lastSavedId) : null;

            console.log("[PLAYER] Auto-loading song to prevent empty stage.");
            if (isLastSavedVisible) {
                loadSong(lastSavedId);
            } else {
                loadSong(visiblePlaylist[0].id);
            }
        }
    }

    setTimeout(() => {
        const activeItem = list.querySelector('.song-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100); 
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

function setupGestures() { 
    var startDist = 0; 
    var startSize = 1.3; 
    
    document.addEventListener('touchstart', function(e) { 
        if(e.touches.length === 2 && e.target.closest('.col-stage')) { 
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); 
            startSize = parseFloat(val) || 1.3; 
            console.log(`[GESTURES] Pinch started. Initial size: ${startSize}rem`);
        }
    }, {passive: false}); 
    
    document.addEventListener('touchmove', function(e) { 
        if(e.touches.length === 2 && e.target.closest('.col-stage')) { 
            e.preventDefault(); 
            var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            if(startDist > 0) { 
                var scale = dist / startDist; 
                var newSize = startSize * scale; 
                
                if(newSize < 0.8) newSize = 0.8; 
                if(newSize > 3.0) newSize = 3.0; 
                
                document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); 
            }
        }
    }, {passive: false});

    document.addEventListener('touchend', function(e) {
        if(e.touches.length < 2) {
            startDist = 0;
            if (typeof applyScrollBtnVisibility === 'function') {
                applyScrollBtnVisibility();
            }
        }
    });
}

// ===========================================================
// 4. IMPORT / EXPORT
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
}

async function importFromURL() { 
    const url = prompt(window.t ? t('ph_url_import', "Enter URL:") : "Enter URL:"); 
    if (!url) return; 
    try { 
        const res = await fetch(url); 
        if(!res.ok) throw new Error("Network Error"); 
        const data = await res.json(); 
        processImportedData(data); 
    } catch (err) { 
        console.error("URL Import Error:", err);
        showToast(t('msg_err_import', "Import Failed: ") + err.message, "error"); 
    } 
}

// ===========================================================
// 5. PLAYER LOGIC
// ===========================================================

function loadSong(id) {
    if (window.mRhythm && window.isRhythmPlaying) {
        window.mRhythm.stop();
        console.log("[Player] Rhythm stopped due to song change.");
    }
    if (typeof BasicMetronome !== 'undefined' && BasicMetronome.isPlaying) {
        BasicMetronome.toggle();
    }

    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }

    window.activeRhythmType = 'metronome';
    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = (typeof t === 'function') ? t('sum_metronome', "Metronome") : "Metronome";
        nameDisplay.style.color = "var(--text-muted)";
    }

    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll();
    
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = false;
    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = true; 
    
    currentSongId = id; 
    localStorage.setItem('mnotes_last_song', id);
    
    if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen && FloatingTools.boundSongId !== id) {
        if (typeof FloatingTools.close === 'function') FloatingTools.close();
    }
    
    var s = library.find(x => x.id === id); 
    if(!s) return;
    
    if (!s.is_clone && currentGroupId !== 'personal') {
        const myClone = library.find(c => c.parent_id === s.id && c.is_clone && c.user_id === currentUser?.id);
        if (myClone) {
            console.log(`[ROUTER] Master requested, but Clone found. Loading Clone: ${myClone.title}`);
            s = myClone;
            currentSongId = myClone.id;
        }
    }

    state.t = 0; 
    state.c = 0; 
    
    if(typeof parseSongLogic === 'function') parseSongLogic(s);
    
    renderPlayer(s);
    
    if (s.rhythm && s.rhythm.bpm) {
        if (typeof BasicMetronome !== 'undefined') {
            BasicMetronome.setBpm(s.rhythm.bpm);
            const rngBpm = document.getElementById('rngBpm');
            const dispBpm = document.getElementById('dispBpm');
            if (rngBpm) rngBpm.value = s.rhythm.bpm;
            if (dispBpm) dispBpm.innerText = s.rhythm.bpm;
        }
    }

    const viewState = localStorage.getItem('mnotes_view_state');
    if (viewState === 'editor') {
        switchToEditor();
    } else {
        document.getElementById('view-player').classList.add('active-view'); 
        document.getElementById('view-editor').classList.remove('active-view');
    }
    
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active')); 
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); 
    if(activeItem) activeItem.classList.add('active');
    
    if(typeof requestWakeLock === 'function') requestWakeLock();

    if (window.innerWidth <= 1024 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }

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
        showToast(dir > 0 ? t('msg_list_end', "Τέλος Λίστας") : t('msg_list_start', "Αρχή Λίστας"));
    }
}

function renderPlayer(s) {
    if (!s) return;
    
    window.introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;
    const sizeClass = `intro-size-${window.introSizeLevel}`; 
    
    let metaHtml = ""; 
    
    let pNote = s.notes || ""; 
    const bNote = s.conductorNotes || "";
    
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
        let myClone = library.find(x => x.is_clone && x.parent_id === s.id && x.user_id === currentUser?.id);
        if (myClone && myClone.notes && myClone.notes.trim() !== "") {
            pNote = myClone.notes; 
        }
    }

    const hasNotes = (bNote.trim().length > 0) || (pNote.trim().length > 0);

    const txtBandNotes = document.getElementById('sideBandNotes');
    const dispBandNotes = document.getElementById('sideBandNotesDisplay');
    
    if (txtBandNotes) txtBandNotes.value = bNote;
    if (dispBandNotes) dispBandNotes.innerText = bNote !== "" ? bNote : t('msg_no_instructions', "Δεν υπάρχουν οδηγίες.");

    const stickyArea = document.getElementById('stickyNotesArea');
    const cNoteText = document.getElementById('conductorNoteText');
    const pNoteText = document.getElementById('personalNoteText');
    
    if (stickyArea) {
        if (hasNotes) {
            stickyArea.style.display = 'none';
            if (cNoteText) cNoteText.innerText = bNote ? t('lbl_maestro', "📢 Μαέστρος: ") + bNote : "";
            if (pNoteText) pNoteText.innerText = pNote ? t('lbl_me', "📝 Εγώ: ") + pNote : "";
        } else {
            stickyArea.style.display = 'none';
        }
    }

    if (typeof updateBandHubUI === 'function') updateBandHubUI();

    const btnHtml = `<button id="btnIntroToggle" onclick="cycleIntroSize()" class="size-toggle-btn" title="${t('title_change_text_size', 'Change Text Size')}"><i class="fas fa-text-height"></i></button>`;
    const introText = s.intro;
    const interText = s.inter || s.interlude; 

    if (introText || interText) {
        metaHtml += `<div class="meta-info-box">`;
        if (introText) {
            metaHtml += `<div class="meta-row ${sizeClass}">${btnHtml} <span><strong>Intro:</strong> ${parseMetaLine(introText)}</span></div>`;
        }
        if (interText) {
            const showBtnHere = (!introText) ? btnHtml : '<span class="spacer-btn"></span>'; 
            metaHtml += `<div class="meta-row ${sizeClass}">${showBtnHere} <span><strong>Inter:</strong> ${parseMetaLine(interText)}</span></div>`;
        }
        metaHtml += `</div>`;
    }
    
    let noteBtnHtml = '';
    if (hasNotes) {
        noteBtnHtml = `<button onclick="toggleStickyNotes()" title="${t('title_show_notes', 'Εμφάνιση Σημειώσεων')}" style="background: #fbc02d; color: #000; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); margin-left: 12px; transform: translateY(-2px); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px) scale(1.1)'" onmouseout="this.style.transform='translateY(-2px) scale(1)'"><i class="fas fa-thumbtack" style="font-size:0.85rem;"></i></button>`;
    }

    let tagsHtml = "";
    if (s.tags && Array.isArray(s.tags) && s.tags.length > 0) {
        tagsHtml = s.tags.map(tagVal => `
            <span onclick="filterByTag(event, '${tagVal}')" 
                  title="${t('title_filter_tag', 'Φιλτράρισμα με #')}${tagVal}"
                  style="cursor:pointer; background:var(--accent); color:#000; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:bold; margin-right:5px; display:inline-block; margin-top:5px; box-shadow:0 2px 4px rgba(0,0,0,0.2); transition:transform 0.1s;" 
                  onmouseover="this.style.transform='scale(1.05)'" 
                  onmouseout="this.style.transform='scale(1)'">
                #${tagVal}
            </span>`).join('');
    }

    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header" style="position: relative;">
            <div class="stage-nav-buttons" style="position: absolute; top: 0; right: 0; display: flex; gap: 8px; z-index: 10;">
                <button onclick="navSetlist(-1)" class="round-btn" title="Προηγούμενο" style="width: 42px; height: 42px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="fas fa-step-backward"></i></button>
                <button onclick="navSetlist(1)" class="round-btn" title="Επόμενο" style="width: 42px; height: 42px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="fas fa-step-forward"></i></button>
            </div>
            <h2 id="mainAppTitle" style="margin:0 0 5px 0; font-size:1.2rem; color:var(--text-main); display:flex; align-items:center; flex-wrap:wrap; padding-right:100px;">
                 <span>${s.title} ${s.artist ? `<span style="font-size:0.9rem; opacity:0.6;">- ${s.artist}</span>` : ''}</span>
                 ${noteBtnHtml}
            </h2>
             <div style="margin-bottom: 8px;">${tagsHtml}</div>
             <div style="display:flex; justify-content:space-between; align-items:center;">
                 <div style="display:flex; align-items:center; gap: 10px;">
                    <button class="key-badge" onclick="transUp()" title="${t('title_change_key', 'Αλλαγή Τονικότητας (+1 Ημιτόνιο)')}" style="color: var(--accent); font-size: 1.8rem; font-weight: 900; text-shadow: 0 2px 5px rgba(0,0,0,0.4); border: 2px solid var(--accent); padding: 4px 12px; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: pointer; transition: transform 0.1s; display: inline-flex; align-items: center; justify-content: center; line-height: 1;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${typeof getNote === 'function' ? getNote(s.key || "-", state.t) : s.key}</button>
                     <span id="stageCapoInfo" style="display:${state.c > 0 ? 'inline-block' : 'none'}; background-color:#e74c3c; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.8rem; font-weight:bold; letter-spacing: 0.5px;">CAPO ${state.c}</span>
                     <button id="btnToggleView" onclick="toggleViewMode()"></button>
                 </div>
            </div>
            ${metaHtml}
        </div>`;
    }

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

function getMediaEmbedHtml(url) {
    if (!url) return '';
    if (typeof getYoutubeId === 'function') {
        const ytId = getYoutubeId(url);
        if (ytId) {
            return `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0; border-radius: 8px;"></iframe>`;
        }
    }
    const spotifyRegex = /spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
    const spotMatch = url.match(spotifyRegex);
    if (spotMatch) {
        const type = spotMatch[1];
        const id = spotMatch[2];
        return `<iframe src="https://open.spotify.com/embed/${type}/${id}" width="100%" height="100%" frameborder="0" allowtransparency="true" allow="encrypted-media" style="border-radius: 8px; position:absolute; top:0; left:0;"></iframe>`;
    }
    if (url.includes('soundcloud.com')) {
        const encodedUrl = encodeURIComponent(url);
        return `<iframe width="100%" height="100%" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodedUrl}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=true" style="border-radius: 8px; position:absolute; top:0; left:0;"></iframe>`;
    }
    if (url.includes('music.apple.com')) {
        const appleUrl = url.replace('music.apple.com', 'embed.music.apple.com');
        return `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="100%" style="width:100%; overflow:hidden; background:transparent; border-radius:8px; position:absolute; top:0; left:0;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${appleUrl}"></iframe>`;
    }
    return `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; position:absolute; top:0; left:0; background:rgba(0,0,0,0.2); border-radius:8px; border: 1px dashed var(--border-color);">
            <a href="${url}" target="_blank" style="color:var(--accent); text-decoration:none; font-weight:bold; font-size: 0.9rem; padding: 10px 20px; border: 1px solid var(--accent); border-radius: 20px; transition: 0.2s transform;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <i class="fas fa-external-link-alt"></i> ${t('btn_open_external', 'Άνοιγμα Εξωτερικού Σύνδεσμου')}
            </a>
        </div>
    `;
}

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

document.addEventListener('DOMContentLoaded', () => {
    console.log("[AUDIO] Audio core listeners attached.");
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

let strumDictionary = {};
let strumCounter = 0;

function formatStrumming(text) {
    if (!text) return text;
    strumDictionary = {}; 
    
    let processed = text.replace(/!strum:\s*(.*?)(?=!|$|\n)/gi, function(match, pattern) {
        let visualStrum = pattern.trim().toUpperCase().split('').map(char => {
            if (char === 'D') return '<span style="margin:0 2px; font-weight:900;">↓</span>';
            if (char === 'U') return '<span style="margin:0 2px; font-weight:900;">↑</span>';
            if (char === 'X' || char === '*') return '<span style="margin:0 2px; color:var(--danger, #dc3545); font-weight:900;">✖</span>';
            if (char === ' ') return '<span style="margin:0 4px;"></span>'; 
            return `<span style="margin:0 2px; font-weight:bold;">${char}</span>`;
        }).join('');
        
        let finalHtml = `<span class="strum-inline" style="display:inline-block; background:var(--bg-panel, #eee); border:1px solid var(--border-color, #ccc); padding:2px 8px; border-radius:6px; margin:2px 5px; color:var(--text-main, #000); font-size:0.9rem; font-family:sans-serif; transform:translateY(-2px);"><i class="fas fa-guitar" style="color:var(--accent, #00ff00); margin-right:5px;"></i>${visualStrum}</span>`;
        
        let placeholderId = `___STRUM_${strumCounter++}___`;
        strumDictionary[placeholderId] = finalHtml;
        
        return placeholderId;
    });
    
    processed = processed.replace(/___STRUM_\d+___!/g, match => match.slice(0, -1));
    return processed;
}

function renderArea(elemId, text) { 
    var container = document.getElementById(elemId); 
    if (!container) return; 
    
    container.innerHTML = ""; 
    if (!text) return;
    text = formatStrumming(text);
    const chordRx = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
    text = text.replace(new RegExp(`\\[${chordRx}\\]`, 'g'), "!$1 ");
    text = text.replace(new RegExp(`!${chordRx}!`, 'g'), "!$1 ");

    var lines = text.split('\n'); 
    
    lines.forEach((line, index) => { 
        var row = document.createElement('div'); 
        
        if (line.trim() === '') {
            row.className = 'line-row'; 
            row.innerHTML = `<span class="lyric"> </span>`;
            container.appendChild(row);
            return;
        }

        let rawLyrics = line.replace(new RegExp(`!${chordRx}!?`, 'g'), '');
        let hasText = /[\p{L}]/u.test(rawLyrics); 
        let isChordsOnly = !hasText; 
        
        row.className = isChordsOnly ? 'line-row chords-only-row' : 'line-row';

        if (line.indexOf('!') === -1 || (typeof isLyricsMode !== 'undefined' && isLyricsMode)) { 
            let pureText = line;
            if (typeof isLyricsMode !== 'undefined' && isLyricsMode) {
                pureText = rawLyrics.replace(/\s{2,}/g, ' ').trim(); 
            }
            
            let safeText = pureText.replace(/ /g, ' ');
            row.innerHTML = `<span class="lyric">${(safeText && safeText.length > 0) ? safeText : " "}</span>`; 
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
    let finalHtmlContent = container.innerHTML;
    Object.keys(strumDictionary).forEach(placeholder => {
        finalHtmlContent = finalHtmlContent.replace(placeholder, strumDictionary[placeholder]);
    });
    container.innerHTML = finalHtmlContent;
}

function createToken(c, l, isChordsOnly) { 
    var d = document.createElement('div'); 
    d.className = 'token'; 
    
    let safeLyric = l ? l.replace(/ /g, ' ') : "";
    
    if (isChordsOnly) {
        d.innerHTML = `<span class="chord inline-chord">${c || ""}${safeLyric}</span>`;
    } else {
        let chordHtml = (c && c.trim() !== "") ? `<span class="chord">${c}</span>` : `<span class="chord empty"> </span>`;
        let lyricHtml = `<span class="lyric">${safeLyric !== "" ? safeLyric : " "}</span>`;
        
        d.innerHTML = chordHtml + lyricHtml; 
    }
    
    return d; 
}

function toggleLyricsMode() {
    isLyricsMode = !isLyricsMode;
    
    if (isLyricsMode) {
        document.body.classList.add('lyrics-only');
        if(typeof showToast === 'function') showToast(t('msg_lyrics_on', "Lyrics Only: ON"));
    } else {
        document.body.classList.remove('lyrics-only');
        if(typeof showToast === 'function') showToast(t('msg_lyrics_off', "Lyrics Only: OFF"));
    }

    var btn = document.getElementById('btnLyrics');
    if (btn) {
        if (isLyricsMode) btn.classList.add('active-btn'); 
        else btn.classList.remove('active-btn');
    }

    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s) renderPlayer(s);
    }
}

function autoCapo() {
    console.log("💡 Smart Capo Triggered");

    if (typeof currentSongId === 'undefined' || !currentSongId) {
        showToast(t('msg_select_song_first', "Open a song first!"));
        return;
    }
    
    var s = library.find(x => x.id === currentSongId);
    if (!s) {
        showToast(t('msg_err_song_not_found', "Error: Song not found in library."));
        return;
    }

    var bestCapo = calculateOptimalCapo_Safe(s.body);
    console.log("💡 Calculated Best Capo:", bestCapo);

    if (bestCapo > 0) {
        state.c = bestCapo; 
        state.t = 0; 
        
        if (typeof refreshPlayerUI === 'function') refreshPlayerUI();
        else if (typeof renderPlayer === 'function') renderPlayer(s);
        
        var dValC = document.getElementById('val-c');
        if (dValC) dValC.innerText = state.c;

        showToast(t('msg_smart_capo_applied', "Smart Capo: {capo} (Easy Chords)").replace('{capo}', bestCapo));
    } else {
        showToast(t('msg_standard_tuning_best', "Standard tuning is already best."));
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
        if (typeof promptUpgrade === 'function') promptUpgrade(t('msg_print_setlist_pdf', 'Εκτύπωση Setlist σε PDF'));
        return; 
    }

    if (!liveSetlist || liveSetlist.length === 0) {
        if (typeof showToast === 'function') showToast(t('msg_list_empty', "Η λίστα είναι άδεια!"), "warning");
        return;
    }

    var currentSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {};
    var showToC = currentSettings.pdfTableOfContents !== false; 
    
    var showSongNumbers = currentSettings.pdfPageNumbers !== false; 

    var fullHtmlBody = "";
    const chordRxForTranspose = new RegExp("([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])", "g");

    // ✨ Δημιουργία Πίνακα Περιεχομένων (ToC)
    if (showToC) {
        let tocHtml = `
            <div class="song-page page-break">
                <img src="icon-192.png" class="logo" alt="Logo">
                <h1>${t('lbl_toc', 'ΠΙΝΑΚΑΣ ΠΕΡΙΕΧΟΜΕΝΩΝ')}</h1>
                <ul style="font-size: 18px; line-height: 1.6; margin-top: 40px; list-style-type: none; padding-left: 0;">
        `;
        
        liveSetlist.forEach((item, index) => {
            let songId = typeof item === 'object' ? item.id : item;
            let s = library.find(x => x.id === songId);
            if (s) {
                let sTitle = s.title || t('lbl_untitled', "Untitled");
                let sArtist = s.artist ? `<span style="color:#666; font-size:14px;"> - ${s.artist}</span>` : "";
                tocHtml += `<li style="margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 5px;">
                                <strong>${index + 1}.</strong> ${sTitle} ${sArtist}
                            </li>`;
            }
        });
        
        tocHtml += `</ul></div>`;
        fullHtmlBody += tocHtml; 
    }

    liveSetlist.forEach((item, index) => {
        let songId = typeof item === 'object' ? item.id : item;
        let s = library.find(x => x.id === songId);
        
        if (!s) return; 

        var title = s.title || t('lbl_untitled', "Untitled");
        var artist = s.artist || "";
        var bodyRaw = s.body || "";
        
        // 🎵 Τονικότητα
        var key = s.key || "-";
        var transposeVal = s.personal_transpose || 0;
        
        if (typeof getNote === 'function' && key !== "-") {
            key = getNote(key, transposeVal); 
        }
        
        var introRaw = s.intro || "";
        var interRaw = s.interlude || "";
        var introSectionHtml = "";

        function formatIntroText(text) {
            if (!text) return "";
            const chordRxStr = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
            const bracketRegex = new RegExp(`\\[${chordRxStr}\\]`, 'g');
            text = text.replace(bracketRegex, "!$1 ");
            const bangRegex = new RegExp(`!${chordRxStr}`, 'g');
            return text.replace(bangRegex, (match, chord) => {
                let noteDisp = chord;
                if (transposeVal !== 0 && typeof getNote === 'function') {
                    try { noteDisp = getNote(chord, transposeVal); } catch(e) {}
                }
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

        if (typeof formatStrumming === 'function') {
            bodyRaw = formatStrumming(bodyRaw);
        }
        const chordRx = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
        bodyRaw = bodyRaw.replace(new RegExp(`\\[${chordRx}\\]`, 'g'), "!$1 ");
        bodyRaw = bodyRaw.replace(new RegExp(`!${chordRx}!`, 'g'), "!$1 ");

        var lines = bodyRaw.split('\n');
        var htmlBody = "";

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

        let pageBreakClass = index < liveSetlist.length - 1 ? 'page-break' : '';
        let songNumberHtml = showSongNumbers ? `<span style="color: #666; margin-right: 8px;">${index + 1}.</span>` : "";
        
        fullHtmlBody += `
            <div class="song-page ${pageBreakClass}">
                <img src="icon-192.png" class="logo" alt="Logo">
                <h1>${songNumberHtml}${title}</h1>
                <h2>${artist}</h2>
                
                <div class="meta-container">
                    <div class="meta">Key: ${key}</div>
                </div>
                
                ${introBlock}
                
                <div class="content">${htmlBody}</div>
            </div>
        `;
    });

    var lyricsOnlyCSS = currentSettings.printLyricsOnly ? `
        .chord { display: none !important; }
        .chords-only-row { display: none !important; }
        .meta-container { display: none !important; } 
        .intro-section { display: none !important; } 
        .strum-inline { display: none !important; }
    ` : "";

    var css = `
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #111; }
        .song-page { position: relative; padding: 40px; box-sizing: border-box; }
        .page-break { page-break-after: always; break-after: page; }
        .logo { position: absolute; top: 20px; right: 30px; width: 50px; height: auto; opacity: 0.9; z-index: 10; }
        h1 { font-size: 26px; margin: 0 0 5px 0; border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; margin-right: 60px; display: flex; align-items: baseline; }
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
            
            setTimeout(function() {
                win.focus();
                win.print();
                win.close();
            }, 500);
        } else {
            if (typeof showToast === 'function') showToast(t('msg_popups_blocked', "Τα αναδυόμενα παράθυρα είναι μπλοκαρισμένα!"), "error");
        }
    }
}
// ===========================================================
// 6. EDITOR LOGIC
// ===========================================================

function switchToEditor() {
    localStorage.setItem('mnotes_view_state', 'editor');
   
    if (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal' && currentSongId) {
        let s = library.find(x => x.id === currentSongId);
        
        if (s && !s.is_clone) {
            const existingClone = library.find(c => c.is_clone && c.parent_id === s.id && c.user_id === currentUser?.id);
            if (existingClone) {
                alert(t('msg_clone_exists_alert', "Υπάρχει ήδη προσωπικός κλώνος για αυτό το τραγούδι.\nΘα μεταφερθείτε αυτόματα σε αυτόν για επεξεργασία."));
                currentSongId = existingClone.id; 
            } else {
                alert(t('msg_editing_master_alert', "ΠΡΟΣΟΧΗ: Επεξεργάζεστε το κοινό τραγούδι της μπάντας.\n\nΟποιαδήποτε αλλαγή αποθηκευτεί, θα δημιουργήσει αυτόματα έναν 'Προσωπικό Κλώνο' σας, αφήνοντας το αρχικό τραγούδι άθικτο."));
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
                const chordRxStr = "([A-G][b#]?[a-zA-Z0-9#\\/+-]*|[a-g][b#]?)(?![a-z])";
                
                const bracketRx = new RegExp(`\\[${chordRxStr}\\]`, 'g');
                editBody = editBody.replace(bracketRx, (match, chord) => {
                    if (chord.toLowerCase().includes('horus') || chord.toLowerCase().includes('erse')) return match;
                    try { return `[${getNote(chord, netTranspose)}]`; } 
                    catch(e) { return match; }
                });

                const bangRx = new RegExp(`!${chordRxStr}`, 'g');
                editBody = editBody.replace(bangRx, (match, chord) => {
                    try { return `!${getNote(chord, netTranspose)}`; } 
                    catch(e) { return match; }
                });

                const plainRx = new RegExp(chordRxStr, 'g');
                editIntro = editIntro.replace(plainRx, (match) => {
                    try { return getNote(match, netTranspose); } catch(e) { return match; }
                });
                editInter = editInter.replace(plainRx, (match) => {
                    try { return getNote(match, netTranspose); } catch(e) { return match; }
                });

                if (newKey && newKey !== "-") {
                    try { newKey = getNote(newKey, netTranspose); } catch(e) {}
                }
                
                state.t = 0;
                if (typeof updateTransDisplay === 'function') updateTransDisplay();
            } 
            
            const savedDraftStr = localStorage.getItem('mnotes_draft_' + s.id);
            let draft = null;
            try { if (savedDraftStr) draft = JSON.parse(savedDraftStr); } catch(e){}

            document.getElementById('inpTitle').value = draft ? draft.title : (s.title || ""); 
            document.getElementById('inpArtist').value = draft ? draft.artist : (s.artist || ""); 
            document.getElementById('inpVideo').value = draft ? draft.video : (s.video || ""); 
            document.getElementById('inpKey').value = draft ? draft.key : newKey; 
            document.getElementById('inpBody').value = draft ? draft.body : editBody; 
            document.getElementById('inpIntro').value = draft ? draft.intro : editIntro; 
            document.getElementById('inpInter').value = draft ? draft.inter : editInter; 
            
            if (draft && typeof showToast === 'function') {
                showToast(t('msg_draft_recovered', "Ανάκτηση μη αποθηκευμένων αλλαγών (Draft) 📝"));
            }
            
            const inpPersonal = document.getElementById('inpPersonalNotes');
            if (inpPersonal) inpPersonal.value = s.notes || ""; 
                                                       
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
function refreshSyncButtonVisibility(song) {
    const btnSync = document.getElementById('btnSyncFromBand');
    if (!btnSync) return;

    btnSync.style.display = 'none';
    if (currentGroupId !== 'personal' && song && song.is_clone) {
        btnSync.style.display = 'inline-block';
        btnSync.title = t('title_sync_clone', "Συγχρονισμός Κλώνου με Προσωπική Βιβλιοθήκη 🏠");
    }
}

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
    console.log(`[Auto-Save] Το draft για το ${currentSongId} ενημερώθηκε`);
}

async function saveEdit() { 
    let bodyArea = document.getElementById('inpBody'); 
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value); 
    
    let oldId = currentSongId; 

    await saveSong(); 
    
    if (typeof populateTags === 'function') populateTags(); 
    
    if (oldId) localStorage.removeItem('mnotes_draft_' + oldId);
    if (currentSongId) localStorage.removeItem('mnotes_draft_' + currentSongId);
    console.log("[SaveEdit] Τα προσωρινά Drafts καθαρίστηκαν.");
}

function fixTrailingChords(text) { 
    let lines = text.split('\n'); 
    return lines.map(line => { 
        const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; 
        if (line.match(trailingChordRegex)) return line.trimEnd() + "    "; 
        return line; 
    }).join('\n'); 
}

function createNewSong() { 
    const userSongs = library.filter(s => !String(s.id).includes('demo'));
    const currentCount = userSongs.length;
    
    const limits = typeof getUserLimits === 'function' ? getUserLimits() : { maxGuestSongs: 5, maxSongs: 40 };

    if (typeof currentUser === 'undefined' || !currentUser) {
        if (typeof canUserPerform === 'function' && !canUserPerform('CREATE_GUEST_SONG', currentCount)) {
            if (typeof showToast === 'function') showToast(t('msg_guest_limit_reached', `Φτάσατε το όριο επισκεπτών! (${limits.maxGuestSongs}/${limits.maxGuestSongs})`), "warning");
            const authMsg = document.getElementById('authMsg');
            if (authMsg) authMsg.innerText = t('msg_create_free_acc_songs', "Δημιουργήστε έναν ΔΩΡΕΑΝ λογαριασμό για να προσθέσετε απεριόριστα τραγούδια και να μην τα χάσετε!");
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.style.display = 'flex';
            return; 
        }
    } else {
        if (typeof canUserPerform === 'function' && !canUserPerform('CREATE_SONG', currentCount)) {
            if (typeof promptUpgrade === 'function') {
                promptUpgrade(t('msg_unlimited_songs', 'Απεριόριστα Τραγούδια'));
            } else {
                alert(t('msg_free_limit_reached', `Έχετε φτάσει το όριο των ${limits.maxSongs} τραγουδιών για το πακέτο σας. Αναβαθμίστε για απεριόριστα!`).replace('{max}', limits.maxSongs));
            }
            return; 
        }
    }
    
    currentSongId = null; 
    document.querySelectorAll('.inp').forEach(e => e.value = ""); 
    editorTags = []; 
    if (typeof renderTags === 'function') renderTags(); 
    
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view'); 
    
    if (typeof applyEditorPlaceholders === 'function') {
        applyEditorPlaceholders();
    }

    if (window.innerWidth <= 1024 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }
}

function exitEditor() { 
    localStorage.setItem('mnotes_view_state', 'player');
    localStorage.removeItem('mnotes_draft_' + currentSongId);
    
    let notesGroup = document.getElementById('perfNotesGroup');
    if (notesGroup) notesGroup.open = false;

    let chordsGroup = document.getElementById('guitarChordsGroup');
    if (chordsGroup) chordsGroup.open = true;

    if (currentSongId) {
        loadSong(currentSongId); 
    } else if (library.length > 0) {
        loadSong(library[0].id); 
    } else { 
        document.getElementById('view-editor').classList.remove('active-view'); 
        document.getElementById('view-player').classList.add('active-view'); 
    } 
}
// ===========================================================
// TAG SYSTEM & AUTOCOMPLETE (EDITOR)
// ===========================================================

var editorTags = [];

function handleTagInput(input) {
    const val = input.value.toLowerCase().trim();
    const suggestionsBox = document.getElementById('tagSuggestions');
    
    if (!val) {
        if(suggestionsBox) suggestionsBox.style.display = 'none';
        return;
    }

    const allTags = new Set();
    if (typeof library !== 'undefined') {
        library.forEach(s => {
            let sTags = [];
            if (Array.isArray(s.tags)) sTags = s.tags;
            else if (typeof s.tags === 'string') sTags = s.tags.split(',').map(tag => tag.trim());
            else if (Array.isArray(s.playlists)) sTags = s.playlists;

            sTags.forEach(tag => {
                if(tag && tag.trim() !== '') allTags.add(tag.trim());
            });
        });
    }

    const matches = Array.from(allTags).filter(tag => 
        tag.toLowerCase().includes(val) && !editorTags.includes(tag)
    );

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

function addTag(tag) {
    if (!tag) return;
    if (!editorTags.includes(tag)) {
        editorTags.push(tag);
        renderTags();
    }
}

function removeTag(tag) {
    editorTags = editorTags.filter(t => t !== tag);
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tagChips');
    const hiddenInp = document.getElementById('inpTags');
    
    if (container) {
        container.innerHTML = '';
        editorTags.forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')"></i>`;
            container.appendChild(chip);
        });
    }
    
    if (hiddenInp) {
        hiddenInp.value = editorTags.join(',');
    }
}

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
    if (typeof canUserPerform === 'function' && !canUserPerform('SAVE_ATTACHMENTS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade(t('msg_record_save_audio', 'Εγγραφή & Αποθήκευση Ήχου'));
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
                } 
        });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = []; currentRecordedBlob = null;
        if(btnLink) btnLink.style.display = 'none';

        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
        mediaRecorder.onstop = () => {
            currentRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            const audioUrl = URL.createObjectURL(currentRecordedBlob);
            const masterPlayer = document.getElementById('masterAudio');
            if (masterPlayer) {
                masterPlayer.src = audioUrl;
                const customUI = document.getElementById('customPlayerUI');
                if (customUI) customUI.style.display = 'flex'; 
            }

            const btnLink = document.getElementById('btnLinkRec');
            const btnDiscard = document.getElementById('btnDiscardRec');
            
            if (currentSongId && typeof currentUser !== 'undefined' && currentUser) { 
                if (btnLink) btnLink.style.display = 'flex'; 
            }
            
            if (btnDiscard) btnDiscard.style.display = 'flex';
        };
        mediaRecorder.start();
        btn.classList.add('recording-active'); btn.innerHTML = '<i class="fas fa-stop"></i>'; timer.style.color = "var(--danger)"; 
        recStartTime = Date.now(); recTimerInterval = setInterval(() => { const diff = Math.floor((Date.now() - recStartTime) / 1000); const m = Math.floor(diff / 60).toString().padStart(2,'0'); const s = (diff % 60).toString().padStart(2,'0'); timer.innerText = `${m}:${s}`; }, 1000);
    } catch (err) { alert(t('msg_mic_error', "Microphone Error: ") + err.message); }
}

function discardCurrentRecording() {
    const masterPlayer = document.getElementById('masterAudio');
    if (masterPlayer) {
        masterPlayer.src = "";
    }
    const customUI = document.getElementById('customPlayerUI');
    if (customUI) customUI.style.display = 'none';
    
    const btnLink = document.getElementById('btnLinkRec');
    const btnDiscard = document.getElementById('btnDiscardRec');
    if (btnLink) btnLink.style.display = 'none';
    if (btnDiscard) btnDiscard.style.display = 'none';
    
    const recTimer = document.getElementById('recTimer');
    if (recTimer) recTimer.innerText = "00:00";
    
    if (typeof audioChunks !== 'undefined') {
        audioChunks = [];
    }
    currentRecordedBlob = null;
    
    if (typeof showToast === 'function') showToast(t('msg_record_cancelled', "Η εγγραφή ακυρώθηκε. Δεν ανέβηκε τίποτα."));
}

async function uploadAndLinkCurrent() {
    if (!currentRecordedBlob) { showToast(t('msg_no_recording', "No recording!")); return; }
    if (!currentSongId) { showToast(t('msg_select_song_first', "Select song first!")); return; }
    if (typeof currentUser === 'undefined' || !currentUser) { document.getElementById('authModal').style.display='flex'; return; }
    
    const targetSongId = currentSongId;
    const s = library.find(x => x.id === targetSongId);
    if (!s) return;

    if (!confirm(t('msg_save_rec_cloud', 'Save to "{title}" in Cloud?').replace('{title}', s.title))) return;
    
    const btnLink = document.getElementById('btnLinkRec');
    btnLink.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    btnLink.style.opacity = '0.7';
    
    if (!s.recordings) s.recordings = [];
    const takeNum = s.recordings.length + 1;
    
    const assetLibraryName = `Mic Take ${takeNum} - ${s.title}`;
    const filename = `Mic_${targetSongId}_Take${takeNum}_${Date.now()}.webm`;

    try {
        const { data, error } = await supabaseClient.storage.from('audio_files').upload(`${currentUser.id}/${filename}`, currentRecordedBlob);
        if (error) throw error; 

        const { data: { publicUrl } } = supabaseClient.storage.from('audio_files').getPublicUrl(`${currentUser.id}/${filename}`);
        
        const { error: dbErr } = await supabaseClient
            .from('user_assets')
            .insert([{
                user_id: currentUser.id,
                custom_name: assetLibraryName,
                file_url: publicUrl,
                file_type: 'audio'
            }]);
        if (dbErr) console.warn("Asset Library Warning:", dbErr); 

        const newRec = { id: Date.now(), name: `Take ${takeNum}`, url: publicUrl, date: Date.now() };
        
        if (typeof addRecordingToCurrentSong === 'function') {
             await addRecordingToCurrentSong(newRec);
        } else {
             if (typeof saveData === 'function') saveData(); 
        }
        
        showToast(t('msg_take_saved', "Take {num} Saved! ☁️").replace('{num}', takeNum));
        btnLink.style.display = 'none'; 
        
        if (currentSongId === targetSongId && typeof renderRecordingsList === 'function') {
            renderRecordingsList(s.recordings, []);
        }

    } catch(e) {
         console.error("Upload Error:", e);
         showToast(t('msg_upload_error', "Upload Error: ") + e.message, "error");
         btnLink.style.opacity = '1'; 
         btnLink.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
    } finally {
        currentRecordedBlob = null;
        btnLink.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
        btnLink.style.opacity = '1';
        
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
        
    // 3.ΔΗΜΙΟΥΡΓΙΑ ΜΟΝΙΜΟΥ ΚΑΔΟΥ ΑΠΟΡΡΙΜΜΑΤΩΝ
    if (!allSetlists["🗑️ Κάδος"]) {
        allSetlists["🗑️ Κάδος"] = { type: 'local', songs: [] };
    }
    
    // 4. Δημιουργία προεπιλεγμένης λίστας αν όλα είναι άδεια
    if (Object.keys(allSetlists).length === 0) { 
        allSetlists["Default Setlist"] = { type: 'local', songs: [] }; 
    }
    
    Object.keys(allSetlists).forEach(key => { 
        if (Array.isArray(allSetlists[key])) allSetlists[key] = { type: 'local', songs: allSetlists[key] }; 
    });
    
    const activeNameKey = getActiveSetlistNameKey();
    var currentSetlistName = localStorage.getItem(activeNameKey) || Object.keys(allSetlists)[0];
    if (!allSetlists[currentSetlistName]) currentSetlistName = Object.keys(allSetlists)[0];
    
    // 5. ΔΙΟΡΘΩΣΗ & ΚΑΘΑΡΙΣΜΟΣ SETLIST: 
    let rawSongs = allSetlists[currentSetlistName].songs || [];
    liveSetlist = rawSongs.map(item => {
        if (typeof item === 'object' && item !== null) {
            console.log(`🧹 [SETLIST CLEANUP] Διορθώθηκε αντικείμενο σε καθαρό ID: ${item.id}`);
            return item.id;
        }
        return item; 
    }).filter(Boolean); 
    
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
        
        let icon = (currentGroupId !== 'personal') ? '👥' : '📝';
        if (name === "🗑️ Κάδος") icon = '🗑️';
        
        opt.innerText = name === "🗑️ Κάδος" ? `${name} (${listObj.songs.length})` : `${icon} ${name} (${listObj.songs.length})`;
        
        if(name === currentSetlistName) opt.selected = true;
        sel.appendChild(opt);
    });
    
    updateSetlistButtons();

    const btnEmptyTrash = document.getElementById('btnEmptyTrash');
    if (btnEmptyTrash) {
        if (viewMode === 'setlist' && currentSetlistName === "🗑️ Κάδος") {
            btnEmptyTrash.style.display = 'inline-flex'; 
        } else {
            btnEmptyTrash.style.display = 'none'; 
        }
    }
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
        showToast(t('msg_err_create_list_band', "Μόνο οι διαχειριστές μπορούν να φτιάξουν λίστες για τη μπάντα."), "error");
        return;
    }

    if (currentGroupId === 'personal') {
        const customListsCount = Object.keys(allSetlists).length - 1; 
        if (typeof canUserPerform === 'function' && !canUserPerform('CREATE_SETLIST', customListsCount)) {
            if (typeof promptUpgrade === 'function') {
                promptUpgrade(t('msg_create_multi_lists', 'Δημιουργία πολλαπλών Playlists'));
            } else {
                alert(t('msg_err_max_lists', "Έχετε φτάσει το όριο λιστών για το τρέχον πακέτο σας."));
            }
            return; 
        }
    }

    const name = prompt(t('msg_new_setlist_name', "Όνομα νέας λίστας:"));
    if (name && !allSetlists[name]) {
        allSetlists[name] = { type: 'local', songs: [] }; 
        liveSetlist = []; 
        switchSetlist(name);
        saveSetlists(name);
        updateSetlistDropdown();

    } else if (allSetlists[name]) {
        alert(t('msg_err_list_exists', "Υπάρχει ήδη λίστα με αυτό το όνομα!"));
    }
}

function renameSetlist() {
    var currentSetlistName = localStorage.getItem(getActiveSetlistNameKey());
    const newName = prompt(t('msg_rename_setlist_prompt', "Μετονομασία σε:"), currentSetlistName);
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
        showToast(t('msg_err_delete_last_list', "Δεν μπορείτε να διαγράψετε την τελευταία λίστα.")); 
        return; 
    }
    if (confirm(t('msg_confirm_delete_list', "Διαγραφή της λίστας '{name}';").replace('{name}', currentSetlistName))) {
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
    
    localStorage.setItem(getSetlistStorageKey(), JSON.stringify(allSetlists));
    if (activeName) localStorage.setItem(activeNameKey, activeName);
    
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
        showToast(t('msg_err_edit_list_band', "Μόνο οι διαχειριστές μπορούν να επεξεργαστούν τη λίστα της μπάντας."), "error");
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
        const setCtrl = document.getElementById('setlist-controls'); 
        if(setCtrl) { setCtrl.style.display = 'flex'; updateSetlistDropdown(); }
    } else {
        document.getElementById('library-controls').style.display = 'flex';
        const setCtrl = document.getElementById('setlist-controls'); 
        if(setCtrl) setCtrl.style.display = 'none';
        
        const btnEmptyTrash = document.getElementById('btnEmptyTrash');
        if (btnEmptyTrash) btnEmptyTrash.style.display = 'none';
    }
    renderSidebar();
}

function navSetlist(dir) {
    if (!visiblePlaylist || visiblePlaylist.length === 0) { 
        if (typeof showToast === 'function') showToast(t('msg_list_empty_toast', "Η λίστα είναι άδεια!")); 
        return; 
    }
    
    let currentIndex = visiblePlaylist.findIndex(s => s.id === currentSongId);
    let newIndex = currentIndex + dir;
    
    if (newIndex >= 0 && newIndex < visiblePlaylist.length) { 
        loadSong(visiblePlaylist[newIndex].id); 
    } else { 
        if (typeof showToast === 'function') {
            showToast(dir > 0 ? t('msg_list_end', "Τέλος Λίστας") : t('msg_list_start', "Αρχή Λίστας")); 
        }
    }
}

// ===========================================================
// 10. VISUAL HELPERS (Sticky, Audio List)
// ===========================================================

function cycleIntroSize() {
    window.introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;
    window.introSizeLevel = (window.introSizeLevel + 1) % 3;
    localStorage.setItem('mnotes_intro_size', window.introSizeLevel);
    
    if (typeof currentSongId !== 'undefined' && currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            renderPlayer(s);
        }
    }
}

// ===========================================================
// ΕΝΙΑΙΑ ΑΠΟΣΥΝΔΕΣΗ ΜΕΣΩΝ ΚΑΙ ΑΡΧΕΙΩΝ (DETACH)
// ===========================================================
window.deleteMediaItem = async function(songId, type, itemIndex) {
    const s = library.find(x => x.id === songId);
    if (!s || !s[type] || !s[type][itemIndex]) return;

    const item = s[type][itemIndex];
    const isPrivate = (item.origin === 'private' || !item.origin);

    if (!confirm(t('msg_confirm_detach_file', "Αποσύνδεση του '{name}' από το τραγούδι; (Θα παραμείνει στη Βιβλιοθήκη σας) \n\nDetach file from song? (It will remain in your Library)").replace('{name}', item.name || t('lbl_file', 'αρχείου')))) return;

    s[type].splice(itemIndex, 1);
    
    if (type === 'recordings' && typeof renderRecordingsList === 'function') {
        renderRecordingsList(s.recordings, []);
    } else if (type === 'attachments' && typeof renderAttachmentsList === 'function') {
        renderAttachmentsList(s.attachments);
    }

    try {
        if (currentGroupId === 'personal') {
            await supabaseClient.from('songs').update({ [type]: s[type] }).eq('id', songId);
        } else {
            if (isPrivate) {
                const { data: myOverride } = await supabaseClient.from('personal_overrides')
                    .select(`id, ${type}`).eq('user_id', currentUser.id).eq('song_id', songId).eq('group_id', currentGroupId).maybeSingle();
                
                if (myOverride) {
                    let updatedArray = (myOverride[type] || []).filter(i => i.url !== item.url);
                    await supabaseClient.from('personal_overrides').update({ [type]: updatedArray }).eq('id', myOverride.id);
                }
            } else {
                const { data: globalSong } = await supabaseClient.from('songs').select(type).eq('id', songId).maybeSingle();
                if (globalSong) {
                    let updatedArray = (globalSong[type] || []).filter(i => i.url !== item.url);
                    await supabaseClient.from('songs').update({ [type]: updatedArray }).eq('id', songId);
                }
            }
        }
        showToast(t('msg_detach_success', "Αποσυνδέθηκε επιτυχώς. / Successfully detached."));
    } catch(e) {
        console.error("Detach Error:", e);
        showToast(t('msg_err_sync_general', "Σφάλμα συγχρονισμού / Sync error"), "error");
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
        const colorVar = isPrivate ? '#ffb74d' : '#4db6ac'; 
        const iconClass = isPrivate ? 'fas fa-lock' : 'fas fa-globe';
        const tooltip = isPrivate ? t('ttl_private_track', 'Private Track') : t('ttl_public_track', 'Public Band Track');
        
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${colorVar};`;
        
        const safeObjStr = encodeURIComponent(JSON.stringify(rec));
        
        let promoteBtnHtml = '';
        if (isPrivate && typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
            promoteBtnHtml = `<button onclick="promoteItem('${currentSongId}', 'recordings', &quot;${safeObjStr}&quot;)" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px; font-size:1.1rem;" title="${t('btn_share_propose', 'Share / Propose')}"><i class="fas fa-bullhorn"></i></button>`;
        }

        const isOwnerOrAdmin = (typeof currentRole !== 'undefined' && (currentRole === 'owner' || currentRole === 'admin'));
        const canDelete = isPrivate || currentGroupId === 'personal' || isOwnerOrAdmin;

        let deleteBtnHtml = '';
        if (canDelete) {
            deleteBtnHtml = `<button onclick="deleteMediaItem('${currentSongId}', 'recordings', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="${t('btn_delete', 'Delete')}"><i class="fas fa-times"></i></button>`;
        }
         
        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${rec.url}', '${rec.name || rec.label}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="${t('btn_download', 'Download')}"><i class="fas fa-download"></i></button>`;
        
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
    
    if (!hasItems) listEl.innerHTML = `<div class="empty-state">${t('msg_no_recordings', 'No recordings yet')}</div>`;
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
        
        const isPrivate = (doc.origin === 'private' || !doc.origin);
        const borderColor = isPrivate ? '#ffb74d' : '#9c27b0';
        const tooltip = isPrivate ? t('ttl_private_file', 'Private (Μόνο για σένα)') : t('ttl_public_file', 'Public (Κοινό της μπάντας)');
        
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${borderColor};`;
        
        const iconClass = (doc.type && doc.type.includes('image')) ? 'fas fa-image' : 'fas fa-file-pdf';
        
        const safeObjStr = encodeURIComponent(JSON.stringify(doc));

        let promoteBtnHtml = '';
        if (isPrivate && typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') {
            promoteBtnHtml = `<button onclick="promoteItem('${currentSongId}', 'attachments', &quot;${safeObjStr}&quot;)" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px; font-size:1.1rem;" title="${t('btn_share_propose', 'Share / Propose')}"><i class="fas fa-bullhorn"></i></button>`;
        }

        const isOwnerOrAdmin = (typeof currentRole !== 'undefined' && (currentRole === 'owner' || currentRole === 'admin'));
        const canDelete = isPrivate || currentGroupId === 'personal' || isOwnerOrAdmin;

        let deleteBtnHtml = '';
        if (canDelete) {
            deleteBtnHtml = `<button onclick="deleteMediaItem('${currentSongId}', 'attachments', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="${t('btn_delete', 'Delete')}"><i class="fas fa-times"></i></button>`;
        }

        const docFileType = (doc.type && doc.type.toLowerCase().includes('image')) ? 'image' : 'pdf';
        
        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${doc.url}', '${doc.name}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="${t('btn_download', 'Download')}"><i class="fas fa-download"></i></button>`;

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
        listEl.innerHTML = `<div class="empty-state">${t('msg_no_attachments', 'No attachments')}</div>`;
    }
}

function playAudio(url) { 
    const audio = document.getElementById('masterAudio'); 
    if(audio) { audio.src = url; audio.play(); } 
}

function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea'); 
    const condText = document.getElementById('conductorNoteText'); 
    const persText = document.getElementById('personalNoteText');
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}'); 
    const myNote = personalNotesMap[s.id] || "";
    
    stickyArea.style.cssText = "display:none; position:absolute; top:70px; left:15px; right:15px; background:#fff9c4; color:#000; border:1px solid #fbc02d; padding:15px; border-radius:4px; z-index:100; box-shadow:0 10px 25px rgba(0,0,0,0.5); cursor:pointer;";
    stickyArea.title = t('title_click_close_note', "Πατήστε πάνω στη σημείωση για να κλείσει");
    stickyArea.onclick = toggleStickyNotes; 
    
    if (s.conductorNotes) { 
        condText.style.display = 'block'; 
        condText.innerHTML = `<b style="color:#c62828;"><i class="fas fa-bullhorn"></i> ${t('lbl_maestro', 'Band Notes:')}</b><br><span style="color:#111; white-space:pre-wrap; font-size:0.95rem;">${s.conductorNotes}</span>`; 
    } else { 
        condText.style.display = 'none'; 
    }
    
    if (myNote) { 
        persText.style.display = 'block'; 
        persText.style.marginTop = s.conductorNotes ? "12px" : "0"; 
        persText.innerHTML = `<b style="color:#1565c0;"><i class="fas fa-user-edit"></i> ${t('lbl_me', 'My Notes:')}</b><br><span style="color:#111; white-space:pre-wrap; font-size:0.95rem;">${myNote}</span>`; 
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
        showToast(t('msg_select_song_first', "Επιλέξτε τραγούδι πρώτα!"), "error");
        return;
    }
    
    const bNotesVal = document.getElementById('sideBandNotes')?.value.trim() || "";
    const pNotesVal = document.getElementById('sidePersonalNotes')?.value.trim() || "";
    
    const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    if (pNotesVal) map[currentSongId] = pNotesVal;
    else delete map[currentSongId];
    localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));
    
    const s = library.find(x => x.id === currentSongId);
    if (s) {
        s.conductorNotes = bNotesVal;
        s.personal_notes = pNotesVal;
    }

    if (currentGroupId !== 'personal') {
        const canEditBand = (currentRole === 'admin' || currentRole === 'owner');
        
        if (canEditBand && typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE')) {
            try {
                await supabaseClient.from('songs').update({ notes: bNotesVal }).eq('id', currentSongId);
            } catch(e) { console.error("Notes Sync Error:", e); }
        }
        
        if (typeof saveAsOverride === 'function') {
            await saveAsOverride(s);
        }
    }

    showToast(t('msg_notes_saved_success', "Οι σημειώσεις αποθηκεύτηκαν! 📌"));
    
    if (s) renderPlayer(s); 
}

// ===========================================================
// 11. MOBILE NAVIGATION & DRAWER
// ===========================================================

function setupDrawerPersistence() {
    const savedStates = getSavedDrawerStates(); 
    
    document.querySelectorAll('details.tool-group').forEach(details => {
        const id = details.id;
        if (id && savedStates[id] !== undefined) {
            details.open = savedStates[id];
        }

        details.addEventListener('toggle', () => {
            if (details.id) {
                saveDrawerState(details.id, details.open); 
            }
        });
    });
}

function saveDrawerState(drawerId, isOpen) {
    const states = JSON.parse(localStorage.getItem('mnotes_drawer_states')) || {};
    states[drawerId] = isOpen;
    localStorage.setItem('mnotes_drawer_states', JSON.stringify(states));
}

function getSavedDrawerStates() {
    return JSON.parse(localStorage.getItem('mnotes_drawer_states')) || {};
}

function setupEvents() {
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        console.log("✅ Event Listener attached to #hiddenFileInput");
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
    const viewMap = {
        'library': 'sidebar',        
        'stage': 'mainZone',         
        'tools': 'rhythmTools'       
    };

    ['sidebar', 'mainZone', 'rhythmTools'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) {
            el.classList.remove('mobile-view-active'); 
        }
    });
    
    const targetId = viewMap[tabName]; 
    const targetEl = document.getElementById(targetId);
    
    if (targetEl) { 
        targetEl.classList.add('mobile-view-active'); 
    } 
    
    const btns = document.querySelectorAll('.tab-btn-mob'); 
    btns.forEach(b => b.classList.remove('active'));
    if (tabName === 'library' && btns[0]) btns[0].classList.add('active');
    if (tabName === 'stage' && btns[1]) btns[1].classList.add('active');
    if (tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));
    const drawerBtn = document.querySelector(`.drawer-btn[onclick*="'${tabName}'"]`);
    if (drawerBtn) drawerBtn.classList.add('active');
    
    const controlsDiv = document.getElementById('drawer-player-controls');
    if (controlsDiv) {
        controlsDiv.style.display = (tabName === 'stage') ? 'block' : 'none';
    }

    if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen) {
        const fw = document.getElementById('floating-viewer');
        if (fw) {
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
        
        if (typeof FloatingTools !== 'undefined' && FloatingTools.isOpen) {
            const isStageActive = document.getElementById('mainZone')?.classList.contains('mobile-view-active') || window.innerWidth > 1024;
            document.getElementById('floating-viewer').style.display = isStageActive ? 'flex' : 'none';
        }
    } 
    else { 
        d.classList.add('open'); 
        setTimeout(() => { document.addEventListener('click', closeDrawerOutside); }, 100); 
        setupDrawerListeners(d); 
        
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

    if (tabName === 'stage' && typeof currentSongId !== 'undefined' && currentSongId) {
        const titleEl = document.getElementById('mainAppTitle');
        if (!titleEl || titleEl.innerText.trim() === '') {
            if (typeof loadSong === 'function') loadSong(currentSongId);
        }
    }

    if (typeof switchMobileTab === 'function') {
        switchMobileTab(tabName);
    }

    if (typeof toggleRightDrawer === 'function') {
        toggleRightDrawer();
    }
}

// ===========================================================
// BULK DELETE & WITHDRAWAL (Μαζική Διαγραφή / Απόσυρση)
// ===========================================================
async function emptyTrashSetlist() {
    const trashKey = "🗑️ Κάδος";
    const trashList = allSetlists[trashKey]?.songs || [];

    if (trashList.length === 0) {
        if (typeof showToast === 'function') showToast(t('msg_trash_empty', "Ο κάδος είναι ήδη άδειος!"), "warning");
        return;
    }

    const isBandContext = (currentGroupId !== 'personal');
    const isGod = (typeof currentRole !== 'undefined') && (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');

    if (isBandContext && !isGod) {
        if (typeof showToast === 'function') showToast(t('msg_err_withdraw_perms', "Μόνο οι διαχειριστές μπορούν να αποσύρουν τραγούδια από τη μπάντα."), "error");
        return;
    }

    let confirmMsg = "";
    if (!isBandContext) {
        confirmMsg = t('msg_confirm_empty_trash', `ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΡΙΣΤΙΚΑ ${trashList.length} τραγούδια από την προσωπική σας βιβλιοθήκη.\n\nΑυτή η ενέργεια ΔΕΝ αναιρείται. Είστε σίγουροι;`);
    } else {
        confirmMsg = t('msg_confirm_withdraw_band', `ΑΠΟΣΥΡΣΗ ΤΡΑΓΟΥΔΙΩΝ:\nΘα αποσύρετε τραγούδια από το κοινό ρεπερτόριο της μπάντας.\n\n(Όσα μέλη έχουν δημιουργήσει προσωπικούς κλώνους αυτών των τραγουδιών, θα τους διατηρήσουν). Συμφωνείτε;`);
    }

    if (!confirm(confirmMsg)) return;

    try {
        console.log(`🗑️ [BULK DELETE] Ξεκινάει ο καθαρισμός ${trashList.length} τραγουδιών...`);

        if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && navigator.onLine) {
            
            if (isBandContext) {
                const payload = { is_deleted: true, updated_at: new Date().toISOString() };
                const { error } = await supabaseClient.from('songs').update(payload).in('id', trashList);
                if (error) throw error;
                
                await supabaseClient.from('personal_overrides').delete().in('song_id', trashList);
            } else {
                const { error } = await supabaseClient.from('songs').delete().in('id', trashList);
                if (error) throw error;
            }
        } else if (!navigator.onLine) {
            const payload = { is_deleted: true, updated_at: new Date().toISOString() };
            trashList.forEach(id => {
                 if (typeof addToSyncQueue === 'function') addToSyncQueue('SAVE_SONG', { id: id, ...payload });
            });
        }

        let storageKey = currentGroupId === 'personal' ? 'mnotes_data' : 'mnotes_band_' + currentGroupId;
        window.library = window.library.filter(s => !trashList.includes(s.id));
        library = window.library;
        localStorage.setItem(storageKey, JSON.stringify(window.library));

        allSetlists[trashKey].songs = [];
        liveSetlist = []; 
        
        if (typeof saveSetlists === 'function') saveSetlists(trashKey);
        
        if (typeof showToast === 'function') {
            showToast(isBandContext ? t('msg_withdraw_success', "Τα τραγούδια αποσύρθηκαν επιτυχώς.") : t('msg_delete_success', "Η διαγραφή ολοκληρώθηκε."), "success");
        }

        if (trashList.includes(currentSongId)) {
            currentSongId = null;
            if (library.length > 0) {
                 if (typeof loadSong === 'function') loadSong(library[0].id);
            } else {
                 if (typeof toEditor === 'function') toEditor();
            }
        }

        if (typeof updateSetlistDropdown === 'function') updateSetlistDropdown();
        if (typeof renderSidebar === 'function') renderSidebar();

    } catch (err) {
        console.error("❌ [BULK DELETE ERROR]:", err);
        if (typeof showToast === 'function') showToast(t('msg_err_generic_retry', "Προέκυψε σφάλμα. Προσπαθήστε ξανά."), "error");
    }
}
// ===========================================================
// 12. UTILS & MUSIC THEORY (FINAL CORRECTED VERSION)
// ===========================================================

function getYoutubeId(url) { 
    if (!url) return null; 
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
        if (typeof switchSidebarTab === 'function') switchSidebarTab('library');
             applyFilters(); 
        if (typeof showToast === 'function') showToast(t('msg_filter_tag', "Φίλτρο: #") + tag); 
        if (window.innerWidth <= 1024 && typeof switchDrawerTab === 'function') {
            switchDrawerTab('library');
        }
    } else {
        console.warn("⚠️ [TAG CLICK] Δεν βρέθηκε το dropdown των Tags!");
    }
}
function filterByKey(e, key) { e.stopPropagation(); var inp = document.getElementById('searchInp'); if(inp) { inp.value = key; applyFilters(); showToast(t('msg_filter_key', "Filter: ") + key); } }


/* --- ΔΙΟΡΘΩΜΕΝΟ SPLIT (Smart Split βάσει συγχορδιών) --- */
function splitSongBody(body) {
    if (!body) return { fixed: "", scroll: "" };
    
    if (typeof userSettings !== 'undefined' && userSettings.disableSplit) {
        return { fixed: "", scroll: body }; 
    }
    
    const stanzas = body.split(/\n\s*\n/);
    let splitIndex = -1;

    for (let i = 0; i < stanzas.length; i++) {
        if (stanzas[i].includes('[') || stanzas[i].includes('!')) {
            splitIndex = i;
        }
    }

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

/* ===========================================================
   THEORY-AWARE TRANSPOSER (Διαβάζει τον Κύκλο των Πέμπτων από το data.js)
   =========================================================== */

   function getNote(note, semitones) {
        if (!note || note === "-" || note === "") return note;
        if (semitones === 0) return note;

        const isForceSharps = (typeof userSettings !== 'undefined' && userSettings.forceSharps === true);

        const transposePart = (part) => {
            let match = part.match(/^[A-Ga-g][#b]?/);
            if (!match) return part; 
            
            let root = match[0];
            let suffix = part.substring(root.length);
            
            let isLower = (root === root.toLowerCase());
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
            
            let outScale;
            
            if (isForceSharps) {
                outScale = SHARP;
            } else {
                let isMinor = (suffix.startsWith('m') && !suffix.startsWith('maj')) || suffix.startsWith('-');
                
                const majorPref = (typeof THEORY_MAJOR_PREF !== 'undefined') ? THEORY_MAJOR_PREF : ['sharp','flat','sharp','flat','sharp','flat','sharp','sharp','flat','sharp','flat','sharp'];
                const minorPref = (typeof THEORY_MINOR_PREF !== 'undefined') ? THEORY_MINOR_PREF : ['flat','sharp','flat','sharp','sharp','flat','sharp','flat','sharp','sharp','flat','sharp'];
                
                let theoryPreference = isMinor ? minorPref[newIndex] : majorPref[newIndex];
                outScale = (theoryPreference === 'sharp') ? SHARP : FLAT;
            }
        
            let transposedNote = outScale[newIndex];
            
            if (isLower) transposedNote = transposedNote.toLowerCase();
            
            return transposedNote + suffix;
            };

            if (note.includes('/')) {
                let parts = note.split('/');
                return `${transposePart(parts[0])}/${transposePart(parts[1])}`;
            }

            return transposePart(note);
    }

function parseMetaLine(text) {
    if (!text) return "";
    
    text = text.replace(/\[([a-zA-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)\]/g, "!$1 ");
   
    return text.replace(/!([a-zA-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)/g, (match, chord) => {
        let firstChar = chord.charAt(0).toUpperCase();
        let restOfChord = chord.slice(1);
        let calculationChord = firstChar + restOfChord;

        let translated = (typeof getNote === 'function') ? getNote(calculationChord, state.t - state.c) : chord;
        
        if (chord.charAt(0) === chord.charAt(0).toLowerCase()) {
            translated = translated.charAt(0).toLowerCase() + translated.slice(1);
        }

        return `<span class="chord" style="display:inline; position:static; font-size:inherit; color: var(--chord-color);">${translated}</span>`;
    });
}

// =============================
// 13. SETTINGS & MODAL LOGIC 
// ==============================
function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    if (typeof userSettings === 'undefined' || !userSettings) {
        userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || { theme: 'theme-slate', lang: 'el' };
    }

    const checkboxes = {
        'setWakeLock': userSettings.wakeLock,
        'setDisableSplit': userSettings.disableSplit,
        'setPrintLyricsOnly': userSettings.printLyricsOnly,
        'chkAutoSaveCapo': userSettings.autoSaveCapo,
        'setShowScrollBtn': (typeof userSettings.showScrollBtn !== 'undefined') ? userSettings.showScrollBtn : true,
        'setOnlySharps': userSettings.forceSharps 
    };

    for (let id in checkboxes) {
        const el = document.getElementById(id);
        if (el) el.checked = checkboxes[id] || false;
    }

    const values = {
        'setTheme': userSettings.theme || 'theme-dark',
        'langSelect': userSettings.lang || 'el',
        'setChordSize': userSettings.chordSize || 1,
        'setChordDist': userSettings.chordDist || 0,
        'setScrollSpeed': userSettings.scrollSpeed || 50,
        'setRefFreq': userSettings.refFreq || 440
    };
    

    for (let id in values) {
        const el = document.getElementById(id);
        if (el) el.value = values[id];
    }

    fetch('sw.js?t=' + Date.now())
        .then(response => response.text())
        .then(text => {
            const match = text.match(/(?:CACHE_NAME|version|VERSION)\s*[:=]\s*['"]([^'"]+)['"]/i);
            const verDisplay = document.getElementById('appVersionDisplay');
            
            if (match && verDisplay) {
                verDisplay.innerText = "Build: " + match[1];
                console.log("ℹ️ [SETTINGS] Η τρέχουσα έκδοση διαβάστηκε από το sw.js:", match[1]);
            } else {
                if (verDisplay) verDisplay.innerText = "Build: " + t('msg_build_unknown', "Unknown");
                console.warn("⚠️ [SETTINGS] Το sw.js φορτώθηκε, αλλά δεν βρέθηκε μεταβλητή έκδοσης (CACHE_NAME/version).");
            }
        })
        .catch(err => {
            console.error("❌ [SETTINGS] Αποτυχία ανάγνωσης του sw.js:", err);
            const verDisplay = document.getElementById('appVersionDisplay');
            if (verDisplay) verDisplay.innerText = "Build: " + t('msg_build_offline', "Offline");
        });

    modal.style.display = 'flex';
    console.log("⚙️ [SETTINGS] Clean Settings Modal Opened.");
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
}
async function saveSettings() {
    userSettings.wakeLock = document.getElementById('setWakeLock')?.checked || false;
    userSettings.disableSplit = document.getElementById('setDisableSplit')?.checked || false;
    userSettings.printLyricsOnly = document.getElementById('setPrintLyricsOnly')?.checked || false;
    userSettings.autoSaveCapo = document.getElementById('chkAutoSaveCapo')?.checked || false;
    userSettings.forceSharps = document.getElementById('setOnlySharps')?.checked || false;
    
    const btnChk = document.getElementById('setShowScrollBtn');
    if (btnChk) userSettings.showScrollBtn = btnChk.checked;

    if (typeof requestWakeLock === 'function') requestWakeLock();

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
            toggleLanguage(); 
        } else {
            userSettings.lang = newLang;
        }
    }

    const sizeInp = document.getElementById('setChordSize');
    const distInp = document.getElementById('setChordDist');
    const speedInp = document.getElementById('setScrollSpeed');
    const refFreqInp = document.getElementById('setRefFreq');

    if (sizeInp) userSettings.chordSize = parseFloat(sizeInp.value);
    if (distInp) userSettings.chordDist = parseInt(distInp.value);
    if (speedInp) userSettings.scrollSpeed = parseInt(speedInp.value);
    if (refFreqInp) userSettings.refFreq = parseInt(refFreqInp.value) || 440;

    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));

    if (typeof applyTheme === 'function') applyTheme();
    if (typeof applyScrollBtnVisibility === 'function') applyScrollBtnVisibility();
    
    closeSettings();

    if (typeof applySortAndRender === 'function') applySortAndRender();

    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') renderPlayer(s);
    }

    if (typeof showToast === 'function') {
        showToast(t('msg_settings_saved', "Οι ρυθμίσεις αποθηκεύτηκαν"));
    }
}

   window.openAccountModal = function() {
       const modal = document.getElementById('accountModal');
       
       if (modal) {
           modal.style.display = 'flex'; 
           
        const emailEl = document.getElementById('accUserEmail');
        if (emailEl && currentUser) emailEl.innerText = currentUser.email;
        
        if (userProfile && userProfile.subscription_tier) {
            const tierKey = userProfile.subscription_tier;
            const label = TIER_CONFIG[tierKey]?.label || "Free";
            
            const tierEl = document.getElementById('accUserTier');
            if (tierEl) {
                tierEl.innerText = `⭐ ${label.toUpperCase()}`;
            }
        }
        
        if (typeof updateStorageUI === 'function') {
            updateStorageUI();
        }
    } else {
        console.warn("⚠️ Το accountModal δεν βρέθηκε στο HTML!");
    }
};

   // ===========================================================
// 14. TRANSPOSITION & CAPO CONTROLS (THE MISSING LINK)
// ===========================================================

function transUp() {
    if (typeof state === 'undefined') return;
    state.t = (state.t || 0) + 1;
    refreshPlayerUI();
}

function transDown() {
    if (typeof state === 'undefined') return;
    state.t = (state.t || 0) - 1;
    refreshPlayerUI();
}

function capoUp() {
    if (typeof state === 'undefined') return;
    
    let max = 12;
    if (typeof userSettings !== 'undefined' && userSettings.maxCapo) {
        max = parseInt(userSettings.maxCapo);
    }
    
    if (state.c < max) {
        state.c = (state.c || 0) + 1;
    } else {
        state.c = 0; 
    }
    
    refreshPlayerUI();
}

function capoDown() {
    if (typeof state === 'undefined') return;
    if (state.c > 0) {
        state.c = (state.c || 0) - 1;
        refreshPlayerUI();
    }
}

function refreshPlayerUI() {
    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') {
            renderPlayer(s);
            if (typeof applyScrollBtnVisibility === 'function') applyScrollBtnVisibility();
        }
    }
    updateTransDisplay();
}

function updateTransDisplay() {
    const dValT = document.getElementById('val-t'); 
    const dValC = document.getElementById('val-c'); 
    const mValT = document.getElementById('drawer-val-t'); 
    const mValC = document.getElementById('drawer-val-c'); 

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
    var div = document.createElement("div");
    
    div.innerHTML = '<span style="font-size:20px; vertical-align:middle; margin-right:10px;">ℹ️</span>' + msg;
    
    div.style.position = "fixed";
    div.style.bottom = "100px";        
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)"; 
    
    div.style.backgroundColor = "#222"; 
    div.style.color = "#fff";           
    div.style.padding = "15px 25px";    
    div.style.borderRadius = "50px";    
    div.style.fontSize = "16px";
    div.style.fontWeight = "bold";
    div.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)"; 
    
    div.style.zIndex = "9000";   
    
    div.style.opacity = "0";
    div.style.transition = "opacity 0.3s ease-in-out, transform 0.3s";
    
    document.body.appendChild(div);

    requestAnimationFrame(() => {
        div.style.opacity = "1";
        div.style.transform = "translateX(-50%) translateY(-10px)";
    });

    setTimeout(function() {
        div.style.opacity = "0";
        div.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(function() {
            if (div.parentNode) div.parentNode.removeChild(div);
        }, 300);
    }, 3000);
}

function refreshHeaderUI() {
    const titleEl = document.getElementById('mainAppTitle'); 
    if (!titleEl) return;

    if (currentGroupId === 'personal') {
        titleEl.innerText = t('lbl_my_songs', "mNotes - My Songs");
        titleEl.style.color = "var(--accent)"; 
    } else {
        const group = myGroups.find(g => g.group_id === currentGroupId);
        titleEl.innerText = group?.groups?.name || t('lbl_band_workspace', "Band Workspace");
        titleEl.style.color = "#ff9800"; 
    }
}

function toEditor() { switchToEditor(); }
function toViewer(shouldLoad = true) { 
       exitEditor(); 
   if (window.innerWidth <= 1024) {
           const drawerBtns = document.querySelectorAll('#rightDrawer .drawer-section .drawer-btn');
           if (drawerBtns.length > 0) {
               drawerBtns.forEach(btn => btn.classList.remove('active'));
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
    showingOriginal = !showingOriginal;
    
    const s = library.find(x => x.id === currentSongId);
    if (!s) return;

    renderPlayerWithOverrides(s);
    
    if (showingOriginal) {
        showToast(t('msg_view_band_original', "View: Band Original 🏛️"));
        document.body.classList.add('viewing-original');
    } else {
        showToast(t('msg_view_my_settings', "View: My Settings 👤"));
        document.body.classList.remove('viewing-original');
    }
}

function renderPlayerWithOverrides(s) {
    if (!s) return;

    if (showingOriginal) {
        state.t = 0; 
        state.c = 0;
    } 
    else if (s.personal_transpose || s.personal_transpose === 0) {
        state.t = s.personal_transpose;
    }

    renderPlayer(s);
    
    updateToggleButton(s);
}

function updateToggleButton(s) {
    const btn = document.getElementById('btnToggleView');
    if (!btn) return;

    btn.style.display = 'none'; 

    const isCloneObj = s.is_clone || !!s.parent_id;
    const isBandMaster = !!s.group_id && !isCloneObj;

    const showButton = () => {
        btn.style.display = 'inline-flex';
        
        if (isCloneObj) {
            if (showingOriginal) {
                btn.innerHTML = `<i class="fas fa-user"></i> ${t('lbl_my_version', 'My Version')}`;
                btn.classList.add('active-mode');
                btn.style.background = "var(--accent)";
                btn.style.color = "#000";
            } else {
                btn.innerHTML = `<i class="fas fa-users"></i> ${t('lbl_band_version', 'Band Version')}`;
                btn.classList.remove('active-mode');
                btn.style.background = "transparent";
                btn.style.color = "var(--text-main)";
            }
            
            let revertBtn = document.getElementById('btnRevertClone');
            if (!revertBtn && !showingOriginal) {
                revertBtn = document.createElement('button');
                revertBtn.id = 'btnRevertClone';
                revertBtn.innerHTML = `<i class="fas fa-trash-restore"></i>`;
                revertBtn.title = t('title_revert_clone', "Ακύρωση Κλώνου & Επιστροφή στο Κοινό");
                revertBtn.style.cssText = "margin-left:5px; background:var(--danger); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.9rem;";
                revertBtn.onclick = () => { if(typeof revertClone === 'function') revertClone(s); };
                btn.parentNode.appendChild(revertBtn);
            } else if (revertBtn && showingOriginal) {
                revertBtn.style.display = 'none';
            } else if (revertBtn) {
                revertBtn.style.display = 'inline-block';
            }
        } else {
            const revertBtn = document.getElementById('btnRevertClone');
            if (revertBtn) revertBtn.style.display = 'none';

            if (showingOriginal) {
                btn.innerHTML = `<i class="fas fa-user"></i> ${t('lbl_my_settings', 'My Settings')}`;
                btn.classList.add('active-mode');
                btn.style.background = "var(--accent)";
                btn.style.color = "#000";
            } else {
                btn.innerHTML = `<i class="fas fa-users"></i> ${t('lbl_band_version', 'Band Version')}`;
                btn.classList.remove('active-mode');
                btn.style.background = "transparent";
                btn.style.color = "var(--text-main)";
            }
        }
    };

    if (isBandMaster) {
        const hasOverrides = s.has_override || (s.personal_notes && s.personal_notes.trim() !== "") || (s.personal_transpose && s.personal_transpose !== 0);
        if (hasOverrides || showingOriginal) {
            showButton();
        }
        return;
    }

    if (isCloneObj && s.parent_id) {
        if (showingOriginal) {
            showButton(); 
            return;
        }

        const compareWithMaster = (master) => {
            const isDifferent = (master.body !== s.body) || 
                                (master.title !== s.title) || 
                                (master.key !== s.key) || 
                                (master.notes !== s.notes);
            
            if (isDifferent) showButton();
        };

        let master = window.library.find(x => x.id === s.parent_id);
        
        if (master) {
            compareWithMaster(master);
        } 
        else if (navigator.onLine && typeof supabaseClient !== 'undefined') {
            supabaseClient.from('songs')
                .select('body, title, key, notes')
                .eq('id', s.parent_id)
                .maybeSingle()
                .then(({data}) => {
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
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:5000;';
        
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-panel); padding:25px; border-radius:12px; max-width:350px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); border: 1px solid var(--border-color);';
        
        box.innerHTML = `
            <h3 style="margin-top:0; color:var(--text-main); font-size:1.2rem;">${t('modal_save_where', 'Πού να αποθηκευτεί;')}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:20px;">${t('modal_save_desc', 'Επιλέξτε αν αυτό το αρχείο θα είναι ορατό σε όλη την μπάντα ή μόνο σε εσάς.')}</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="btnPub" style="background:#4db6ac; color:#000; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;"><i class="fas fa-users"></i> ${t('btn_public_band', 'Κοινόχρηστο (Μπάντα)')}</button>
                <button id="btnPriv" style="background:#ffb74d; color:#000; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;"><i class="fas fa-lock"></i> ${t('btn_private_me', 'Ιδιωτικό (Μόνο εγώ)')}</button>
                <button id="btnCancel" style="background:transparent; color:var(--text-muted); padding:10px; border:1px solid var(--border-color); border-radius:8px; margin-top:5px; cursor:pointer;">${t('btn_cancel', 'Ακύρωση')}</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('btnPub').onclick = () => { document.body.removeChild(overlay); resolve('public'); };
        document.getElementById('btnPriv').onclick = () => { document.body.removeChild(overlay); resolve('private'); };
        document.getElementById('btnCancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
    });
}
// --- MODAL ΓΙΑ ΚΟΙΝΟΠΟΙΗΣΗ ΣΤΗ ΜΠΑΝΤΑ ---
function showTransferModal() {
    if (!currentSongId) return;
    
    const availableBands = myGroups.filter(g => g.role === 'owner' || g.role === 'admin' || g.role === 'member');
    
    if (availableBands.length === 0) {
        alert(t('msg_no_band_to_share', "Δεν ανήκετε σε καμία μπάντα για να κοινοποιήσετε το τραγούδι."));
        return;
    }

    const currentSongTitle = library.find(s => s.id === currentSongId)?.title || "το τραγούδι";

    let optionsHtml = availableBands.map(g => 
        `<button onclick="transferSong('${g.group_id}'); document.body.removeChild(this.closest('.modal-overlay'));" 
                 style="display:flex; align-items:center; justify-content:center; gap:10px; width:100%; margin-bottom:10px; padding:12px; background:var(--accent); color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:1rem;">
            <i class="fas fa-users"></i> ${t('btn_to_band', 'Προς: ')} ${g.groups?.name || 'Άγνωστη'}
        </button>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:5000;';
    
    overlay.innerHTML = `
        <div style="background:var(--bg-panel); padding:25px; border-radius:12px; width:320px; text-align:center; border: 1px solid var(--border-color);">
            <h3 style="margin-top:0; color:var(--text-main);">${t('title_share_song', 'Κοινοποίηση Τραγουδιού')}</h3>
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:20px;">${t('desc_share_song', 'Επιλέξτε πού θέλετε να στείλετε')}: <b>"${currentSongTitle}"</b>:</p>
            ${optionsHtml}
            <button onclick="document.body.removeChild(this.closest('.modal-overlay'));" style="margin-top:5px; padding:10px; width:100%; background:transparent; border:1px solid var(--border-color); color:var(--text-muted); border-radius:8px; cursor:pointer;">${t('btn_cancel', 'Ακύρωση')}</button>
        </div>
    `;
    document.body.appendChild(overlay);
}
window.processFileDirectly = async function(input) {
    console.log("🔥 DIRECT HTML TRIGGER: Αρχείο επιλέχθηκε!");
    const file = input.files[0];
    if (!file) return;

    const validExtensions = ['.mnote', '.mnotes', '.json'];
    const fileName = file.name.toLowerCase();
    if (!validExtensions.some(ext => fileName.endsWith(ext))) {
        alert(t('msg_err_wrong_file_type', "Λάθος τύπος αρχείου! Παρακαλώ επιλέξτε ένα αρχείο .mnote ή .json"));
        input.value = '';
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
                alert(t('msg_err_missing_import_func', "Σφάλμα: Η συνάρτηση processImportedData λείπει!"));
            }

            const modal = document.getElementById('importChoiceModal');
            if(modal) modal.style.display = 'none';
        } catch(err) {
            console.error("❌ Σφάλμα ανάγνωσης:", err);
            alert(t('msg_err_invalid_mnotes_file', "Το αρχείο δεν είναι έγκυρο mNotes format."));
        }
    };
    reader.readAsText(file);
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

    if (scrollTimer) {
        clearInterval(scrollTimer);
        scrollTimer = null;
        
        if (btn) {
            btn.classList.remove('hidden');
            if (btnIcon) btnIcon.className = "fas fa-play";
            if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_auto_scroll') : "Auto Scroll";
        }
            return;
    }

    var speedSetting = (typeof userSettings !== 'undefined' && userSettings.scrollSpeed) ? parseInt(userSettings.scrollSpeed) : 50;
    var intervalTime = 220 - speedSetting; 
    if (intervalTime < 10) intervalTime = 10;

    if (btn) {
        if (btnIcon) btnIcon.className = "fas fa-pause";
        if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_pause') : "Pause";
        btn.classList.add('hidden'); 
    }
       scrollTimer = setInterval(function() {
        container.scrollTop += 1; 
        
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
            clearInterval(scrollTimer);
            scrollTimer = null;
            if (btn) {
                btn.classList.remove('hidden');
                if (btnIcon) btnIcon.className = "fas fa-play";
                if (btnText) btnText.innerText = (typeof t === 'function') ? t('btn_auto_scroll') : "Auto Scroll";
            }
        }
    }, intervalTime);
}

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

function setupBluetoothPedals() {
    document.addEventListener('keydown', function(e) {
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

function applyScrollBtnVisibility() {
    setTimeout(function() {
        var btn = document.getElementById('floatingScrollBtn');
        if (!btn) return;

        var wantsBtn = (typeof userSettings !== 'undefined' && typeof userSettings.showScrollBtn !== 'undefined') ? userSettings.showScrollBtn : true;
        
        if (!wantsBtn) {
            btn.style.display = 'none';
            console.log("[AutoScroll] Κουμπί κρυμμένο: Απενεργοποιημένο από τα Settings.");
            return;
        }

        var container = document.getElementById('scroll-container');
        if (!container || container.scrollHeight <= container.clientHeight + 5) {
            container = document.getElementById('mainZone');
        }
        
        var needsScroll = false;
        if (container) {
            console.log(`[AutoScroll] Ύψος κειμένου: ${container.scrollHeight}px | Ύψος οθόνης: ${container.clientHeight}px`);
            if (container.scrollHeight > container.clientHeight + 10) {
                needsScroll = true;
            }
        }

        btn.style.display = needsScroll ? 'flex' : 'none';
        if (!needsScroll) {
            console.log("[AutoScroll] Κουμπί κρυμμένο: Το τραγούδι χωράει ολόκληρο στην οθόνη.");
        }

    }, 150); 
}
window.addEventListener('resize', function() {
    setTimeout(applyScrollBtnVisibility, 250);
});
// ==========================================
// WAKE LOCK API (Έξυπνη Διαχείριση Οθόνης)
// ==========================================
var wakeLock = null;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.warn("💡 [Wake Lock] Δεν υποστηρίζεται από αυτόν τον browser.");
        return;
    }

    if (!userSettings.wakeLock) {
        releaseWakeLock(); 
        return;
    }

    try {
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

    if (!isBandContext) {
        if(bandHubGroup) bandHubGroup.style.display = 'none';
        return;
    } else {
        if(bandHubGroup) bandHubGroup.style.display = 'block';
    }

    if (isGod) {
        if(txtBandNotes) txtBandNotes.style.display = 'block';
        if(btnSaveNotes) btnSaveNotes.style.display = 'flex';
        if(dispBandNotes) dispBandNotes.style.display = 'none';
    } else {
        if(txtBandNotes) txtBandNotes.style.display = 'none';
        if(btnSaveNotes) btnSaveNotes.style.display = 'none';
        if(dispBandNotes) dispBandNotes.style.display = 'block';
    }
}

async function saveMaestroNotes() {
    if (!currentSongId) {
        if (typeof showToast === 'function') showToast(t('msg_select_song_first', "Επιλέξτε ένα τραγούδι πρώτα."), "warning");
        return;
    }

    const txtBox = document.getElementById('sideBandNotes');
    if (!txtBox) return;
    
    const notesValue = txtBox.value.trim();
    const songIndex = library.findIndex(s => s.id === currentSongId);
    
    if (songIndex === -1) return;

    library[songIndex].conductorNotes = notesValue;
    window.library = library;

    let bandLocalKey = 'mnotes_band_' + currentGroupId;
    localStorage.setItem(bandLocalKey, JSON.stringify(window.library));

    if (typeof canUserPerform === 'function' && canUserPerform('USE_SUPABASE') && !isOffline) {
        try {
            const { error } = await supabaseClient
                .from('songs')
                .update({ conductorNotes: notesValue })
                .eq('id', currentSongId);
                
            if (error) throw error;
            if (typeof showToast === 'function') showToast(t('msg_pin_saved', "Η οδηγία καρφιτσώθηκε στο τραγούδι! 📌"));
        } catch (err) {
            console.error("[Band Hub] Σφάλμα αποθήκευσης:", err);
            if (typeof showToast === 'function') showToast(t('msg_pin_local_sync_fail', "Αποθηκεύτηκε τοπικά, αλλά απέτυχε ο συγχρονισμός."), "error");
        }
    } else {
        if (typeof showToast === 'function') showToast(t('msg_pin_local_only', "Αποθηκεύτηκε Τοπικά! (Θα συγχρονιστεί όταν συνδεθείτε)"));
        
        if (typeof addToSyncQueue === 'function' && currentUser) {
           addToSyncQueue('SAVE_SONG', window.sanitizeForDatabase(library[songIndex], currentUser.id, currentGroupId));
        }
    }
    
    if (typeof renderPlayer === 'function') renderPlayer(library[songIndex]);
}

function refreshSyncButtonVisibility(song) {
    const btnSync = document.getElementById('btnSyncFromBand');
    if (!btnSync) return;

    btnSync.style.display = 'none';

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
            btnSync.title = t('title_sync_band', "Συγχρονισμός από Μπάντα");
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
        
        let deleteBtnHtml = canDelete ? `<button onclick="handleDeleteRhythm('${currentSongId}', ${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:0 5px;" title="${t('btn_delete', 'Delete')}"><i class="fas fa-times"></i></button>` : '';

        let downloadBtnHtml = `<button onclick="downloadAssetLocal('${rhythm.url}', '${rhythm.name}')" style="background:none; border:none; color:#28a745; cursor:pointer; padding:0 8px; font-size:1rem;" title="${t('btn_download', 'Download')}"><i class="fas fa-download"></i></button>`;

        let updateBpmBtnHtml = canDelete ? `<button onclick="updateRhythmBpm('${currentSongId}', ${index})" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:0 8px;" title="${t('title_save_bpm', 'Αποθήκευση Τρέχουσας Ταχύτητας (BPM)')}"><i class="fas fa-save"></i></button>` : '';

        const savedBpm = rhythm.bpm || 100;

        el.innerHTML = `
            <div onclick="activateSongRhythm('${rhythm.url}', '${rhythm.name}', ${savedBpm})" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;" title="${t('title_load_rhythm', 'Φόρτωση ρυθμού')}">
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

function updateRhythmBpm(songId, rhythmIndex) {
    const targetSong = library.find(s => s.id === songId);
    if (!targetSong || !targetSong.rhythms || !targetSong.rhythms[rhythmIndex]) return;

    const currentBpm = document.getElementById('rngBpm') ? parseInt(document.getElementById('rngBpm').value) : 100;
    
    targetSong.rhythms[rhythmIndex].bpm = currentBpm;
    
    if (typeof saveSong === 'function') saveSong(targetSong);
    renderRhythmsList(targetSong.rhythms); 
    
    if (typeof showToast === 'function') showToast(t('msg_bpm_saved', "Η ταχύτητα αποθηκεύτηκε στα {bpm} BPM!").replace('{bpm}', currentBpm));
}

function handleDeleteRhythm(songId, index) {
    if (window.mRhythm && window.activeRhythmType === 'sequencer') {
        window.mRhythm.stop();
    }
    
    window.activeRhythmType = 'metronome';
    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
    
    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = t('lbl_simple_metronome', "Απλός Μετρονόμος (Tick)");
        nameDisplay.style.color = "var(--text-main)"; 
    }

    console.log("🧹 [RHYTHM] Ο ρυθμός σταμάτησε λόγω διαγραφής από τη λίστα.");

    if (typeof deleteMediaItem === 'function') {
        deleteMediaItem(songId, 'rhythms', index);
    }
}

// --- 2. ΦΟΡΤΩΣΗ ΤΟΥ ΡΥΘΜΟΥ ΣΤΗ ΜΗΧΑΝΗ (PREMIUM FEATURE) ---

async function activateSongRhythm(url, name, savedBpm = null) {
    if (typeof canUserPerform === 'function' && !canUserPerform('USE_RHYTHMS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade(t('lbl_pro_rhythms', 'Επαγγελματικοί Ρυθμοί'));
        else if (typeof showToast === 'function') showToast(t('msg_req_pro_sub', "Αυτή η λειτουργία απαιτεί Pro συνδρομή."), "warning");
        return;
    }

    if (window.mRhythm) {
        try {
            await window.mRhythm.init(); 
            window.mRhythm.stop();       
        } catch (e) {
            console.warn("[RHYTHM] Audio init warning:", e);
        }
    }

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

        const nameDisplay = document.getElementById('seq-current-name');
        if (nameDisplay) {
            nameDisplay.innerText = name || rhythmData.metadata?.name || t('lbl_custom_rhythm', "Custom Rhythm");
            nameDisplay.style.color = "var(--accent)"; 
        }

        if (savedBpm) {
            const rngBpm = document.getElementById('rngBpm');
            if (rngBpm) rngBpm.value = savedBpm;
            
            if (typeof changeRhythmBpm === 'function') changeRhythmBpm(savedBpm);
        }

        if (window.mRhythm) {
            await window.mRhythm.loadFromObject(rhythmData);
            window.activeRhythmType = 'sequencer'; 
            
            if (typeof showToast === 'function') showToast(t('msg_rhythm_loaded', "Ο ρυθμός φορτώθηκε στα {bpm} BPM! 🥁").replace('{bpm}', savedBpm || 100));
        } else {
            console.warn("[RHYTHM] Δεν βρέθηκε το window.mRhythm.");
            window.activeRhythmType = 'metronome';
        }
    } catch (error) {
        console.error("[RHYTHM ERROR]:", error);
        window.activeRhythmType = 'metronome'; 
        if (typeof showToast === 'function') showToast(t('msg_err_rhythm_load', "Σφάλμα φόρτωσης ρυθμού."), "error");
    }
}
// --- ΤΟ ΕΞΥΠΝΟ PLAY/STOP BUTTON ---
function toggleMasterRhythm() {
    const icon = document.getElementById('iconPlayRhythm');
    const bpmSlider = document.getElementById('rngBpm');
    const currentBpm = bpmSlider ? parseInt(bpmSlider.value) : 100;

    if (window.activeRhythmType === 'sequencer' && window.mRhythm) {
        
        if (window.isRhythmPlaying) {
            window.mRhythm.stop();
            if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
        } else {
            window.mRhythm.setBpm(currentBpm);
            
            window.mRhythm.play();
            if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-stop'); }
        }
        
    } 
    else {
        if (typeof BasicMetronome !== 'undefined') {
            if (typeof BasicMetronome.setBpm === 'function') {
                BasicMetronome.setBpm(currentBpm);
            }
            
            BasicMetronome.toggle();
            
            if (BasicMetronome.isPlaying) {
                if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-stop'); }
            } else {
                if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }
            }
        } else {
            console.warn("⚠️ Προσοχή: Ο BasicMetronome δεν βρέθηκε.");
            if (typeof showToast === 'function') showToast(t('msg_err_metro_unavail', "Ο μετρονόμος δεν είναι διαθέσιμος."), "error");
        }
    }
}
// --- ΑΛΛΑΓΗ ΕΝΤΑΣΗΣ (VOLUME) ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΧΡΟΝΟ ---
function changeRhythmVolume(value) {
    const normalizedVol = parseInt(value) / 100;
    
    if (window.mRhythm) {
        if (typeof window.mRhythm.setMasterVolume === 'function') {
            window.mRhythm.setMasterVolume(normalizedVol);
        } else if (window.mRhythm.engine) {
            window.mRhythm.engine.masterVolume = normalizedVol;
        }
    }
    
    if (typeof BasicMetronome !== 'undefined' && typeof BasicMetronome.setVolume === 'function') {
        BasicMetronome.setVolume(normalizedVol);
    }
}

// --- ΑΛΛΑΓΗ ΤΑΧΥΤΗΤΑΣ (BPM) ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΧΡΟΝΟ ---
function changeRhythmBpm(value) {
    const newBpm = parseInt(value);
    
    const dispBpm = document.getElementById('dispBpm');
    if (dispBpm) dispBpm.innerText = newBpm;

    if (window.mRhythm) {
        window.mRhythm.setBpm(newBpm);
    }
    
    if (typeof BasicMetronome !== 'undefined' && typeof BasicMetronome.setBpm === 'function') {
        BasicMetronome.setBpm(newBpm);
    }
}
// --- ΑΠΟΦΟΡΤΩΣΗ ΡΥΘΜΟΥ (ΕΠΙΣΤΡΟΦΗ ΣΕ ΜΕΤΡΟΝΟΜΟ) ---
function clearActiveRhythm() {
    if (window.mRhythm && window.activeRhythmType === 'sequencer') {
        window.mRhythm.stop();
    }
    
    window.activeRhythmType = 'metronome';
    
    const icon = document.getElementById('iconPlayRhythm');
    if (icon) { icon.classList.remove('fa-stop'); icon.classList.add('fa-play'); }

    const nameDisplay = document.getElementById('seq-current-name');
    if (nameDisplay) {
        nameDisplay.innerText = t('lbl_simple_metronome', "Απλός Μετρονόμος (Tick)");
        nameDisplay.style.color = "var(--text-main)"; 
    }

    console.log("🧹 [RHYTHM] Ο ρυθμός αποφορτώθηκε. Επιστροφή στον μετρονόμο.");
}
// ==========================================
// ΠΑΡΑΚΟΛΟΥΘΗΣΗ ΠΕΡΙΣΤΡΟΦΗΣ ΟΘΟΝΗΣ (Resize / Orientation)
// ==========================================
let isCurrentlyMobile = window.innerWidth <= 1024;

window.addEventListener('resize', () => {
        const isNowMobile = window.innerWidth <= 1024;

        if (isCurrentlyMobile !== isNowMobile) {
            isCurrentlyMobile = isNowMobile; 

            if (isNowMobile) {
                console.log("📱 Μετάβαση σε Mobile View");
                
                const colNav = document.querySelector('.col-nav');
                if (colNav) colNav.classList.remove('mobile-view-active');
                
                const colTools = document.querySelector('.col-tools');
                if (colTools) colTools.classList.remove('mobile-view-active');
                
                const colStage = document.querySelector('.col-stage');
                if (colStage) colStage.classList.add('mobile-view-active');

                if (typeof switchDrawerTab === 'function') switchDrawerTab('stage');
                
            } else {
                console.log("💻 Μετάβαση σε Desktop View");
                
                const colNav = document.querySelector('.col-nav');
                if (colNav) colNav.classList.remove('mobile-view-active');
                
                const colTools = document.querySelector('.col-tools');
                if (colTools) colTools.classList.remove('mobile-view-active');
                
                const colStage = document.querySelector('.col-stage');
                if (colStage) colStage.classList.remove('mobile-view-active');

                if (typeof toViewer === 'function') toViewer(true);
            }
        }
    });
// ===========================================================
// STAGE ANTI-EMPTY SHIELD (Εγγύηση Γεμάτης Σκηνής)
// ===========================================================

window.switchDrawerTab = function(tabName) {
    if (window.innerWidth > 1024) return;
    
    if (tabName === 'stage') {
        const titleEl = document.getElementById('mainAppTitle');
        const isStageEmpty = !titleEl || titleEl.innerText.trim() === '' || titleEl.innerText.trim() === 'mNotes';
        
        if (isStageEmpty) {
            console.log("🛡️ [Anti-Empty] Το Stage ήταν άδειο. Φόρτωση τραγουδιού...");
            if (currentSongId) {
                if (typeof loadSong === 'function') loadSong(currentSongId);
            } else if (typeof visiblePlaylist !== 'undefined' && visiblePlaylist.length > 0) {
                if (typeof loadSong === 'function') loadSong(visiblePlaylist[0].id);
            } else if (typeof library !== 'undefined' && library.length > 0) {
                if (typeof loadSong === 'function') loadSong(library[0].id);
            }
        }
    }
    
    if (typeof switchMobileTab === 'function') switchMobileTab(tabName);
    if (typeof toggleRightDrawer === 'function') toggleRightDrawer();
};

const originalRenderSidebar = window.renderSidebar || renderSidebar;
window.renderSidebar = function() {
    originalRenderSidebar();
    
    setTimeout(() => {
        if (typeof visiblePlaylist !== 'undefined' && visiblePlaylist.length > 0) {
            const isEditing = document.getElementById('view-editor')?.classList.contains('active-view');
            const isCurrentVisible = visiblePlaylist.find(s => s.id === currentSongId);
            
            if (!isEditing && (!currentSongId || !isCurrentVisible)) {
                
                const lastSavedId = localStorage.getItem('mnotes_last_song');
                const isLastSavedVisible = lastSavedId ? visiblePlaylist.find(s => s.id === lastSavedId) : null;

                console.log("🛡️ [Auto-Load] Αναγκαστική φόρτωση τραγουδιού στη σκηνή.");
                if (isLastSavedVisible) {
                    if (typeof loadSong === 'function') loadSong(lastSavedId);
                } else {
                    if (typeof loadSong === 'function') loadSong(visiblePlaylist[0].id);
                }
            }
        }
    }, 200); 
};