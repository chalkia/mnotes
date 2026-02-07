/* ===========================================================
   mNotes Pro UI Logic v17.6 (FINAL VERIFIED)
   =========================================================== */
// ===========================================================
// 1. GLOBALS & INITIALIZATION (CLEANED UP)
// ===========================================================

if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;

var visiblePlaylist = [];
var sortableInstance = null;
var editorTags = [];
var scrollTimer = null;
var html5QrCodeScanner = null;
var viewMode = 'library'; 
var isLyricsMode = false; 
var wakeLock = null; 
var newlyImportedIds = []; 
var drawerIdleTimer = null;

// Audio Globals
var navHideTimer = null;
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
    customColors: { '--bg-main': '#000000', '--bg-panel': '#222222', '--text-main': '#ffffff', '--accent': '#00ff00', '--chord-color': '#ffff00' }
};
var tempIntroScale = 0; 

// Start Up
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v17.7 Loaded");
    applyTheme(); 
    applyTranslations(); 
    loadLibrary(); 
    setupEvents(); 
    setupGestures(); 
   
    initResizers();
    if(typeof initRhythmUI === 'function') initRhythmUI();

    // Mobile Setup
    if (window.innerWidth <= 1024) {
        const h = document.getElementById('drawerHandle');
        if(h) h.style.display = 'flex';
        if(typeof switchMobileTab === 'function') switchMobileTab('stage'); 
    }
});

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
}

// ===========================================================
// 2. LIBRARY & SIDEBAR
// ===========================================================

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    const safeEnsure = (typeof ensureSongStructure === 'function') ? ensureSongStructure : (s) => s;

    if (library.length === 0 && typeof DEFAULT_DATA !== 'undefined') { 
        library.push(safeEnsure(JSON.parse(JSON.stringify(DEFAULT_DATA[0])))); 
        saveData(); 
    }
    library = library.map(safeEnsure);
    
    initSetlists(); // Must happen after library load
    
    populateTags(); 
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    const sortDropdown = document.getElementById('sortFilter'); if (sortDropdown) sortDropdown.value = userSettings.sortMethod || 'alpha';
    if(typeof switchSidebarTab === 'function') switchSidebarTab(viewMode);
    renderSidebar();

    if (library.length > 0) {
        if (!currentSongId) currentSongId = library[0].id;
        loadSong(currentSongId);
    } else { createNewSong(); }
}
/* --- MISSING LIBRARY HELPERS (Add this block) --- */

function ensureSongStructure(s) {
    if (!s.playlists) s.playlists = [];
    if (!s.recordings) s.recordings = [];
    if (!s.id) s.id = Date.now().toString();
    return s;
}

function populateTags() {
    const select = document.getElementById('tagFilter');
    if(!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">All Tags</option><option value="__no_demo">No Demo</option>';
    
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
    } else if (method === 'created') {
        library.sort((a, b) => b.createdAt - a.createdAt);
    } else if (method === 'modified') {
        library.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    userSettings.sortMethod = method;
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    renderSidebar();
}
/* --- END OF HELPERS --- */
function clearLibrary() { 
    if(confirm(t('msg_clear_confirm'))) { 
        const safeEnsure = (typeof ensureSongStructure === 'function') ? ensureSongStructure : (s) => s;
        library = [safeEnsure(JSON.parse(JSON.stringify(DEFAULT_DATA[0])))]; 
        liveSetlist = []; 
        localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
        saveData(); 
        document.getElementById('searchInp').value = ""; 
        applyFilters(); 
        loadSong(library[0].id); 
    } 
}

function renderSidebar() {
    var list = document.getElementById('songList'); if(!list) return; list.innerHTML = ""; visiblePlaylist = [];
    if (viewMode === 'setlist') { liveSetlist.forEach(id => { var s = library.find(x => x.id === id); if (s) visiblePlaylist.push(s); }); } 
    else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        visiblePlaylist = library.filter(s => {
            if (userSettings.hideDemo && s.id.includes("demo") && library.length > 1) return false;
            var matchTxt = s.title.toLowerCase().includes(txt) || (s.artist && s.artist.toLowerCase().includes(txt)) || (s.key && s.key.toLowerCase() === txt);
            var matchTag = (tag === "__no_demo") ? !s.id.includes("demo") : (tag === "" || (s.playlists && s.playlists.includes(tag)));
            return matchTxt && matchTag;
        });
    }
    const countEl = document.getElementById('songCount'); if(countEl) countEl.innerText = visiblePlaylist.length;
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''}`; if (newlyImportedIds.includes(s.id)) itemClass += ' new-import';
        li.className = itemClass; li.setAttribute('data-id', s.id);
        li.onclick = (e) => {
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-btn')) return; 
            loadSong(s.id);
            if(window.innerWidth <= 1024) { 
                 const d = document.getElementById('rightDrawer');
                 if(d && d.classList.contains('open') && typeof toggleRightDrawer === 'function') toggleRightDrawer();
            }
        }; 
        var displayTitle = (s.id.includes('demo')) ? t('demo_title') : s.title; var displayKey = s.key || "-";
        var actionIcon = "far fa-circle"; if (viewMode === 'setlist') actionIcon = "fas fa-minus-circle"; else if (liveSetlist.includes(s.id)) actionIcon = "fas fa-check-circle in-setlist";
        li.innerHTML = `<i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i><div class="song-info"><div class="song-title">${displayTitle}</div><div class="song-meta-row"><span class="song-artist">${s.artist || "-"}</span><span class="song-key-badge" onclick="filterByKey(event, '${displayKey}')">${displayKey}</span></div></div>${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}`;
        list.appendChild(li);
    });
    
    // Sortable only for Setlist
    if (sortableInstance) sortableInstance.destroy();
    if(typeof Sortable !== 'undefined') { 
        sortableInstance = new Sortable(list, { 
            animation: 150, handle: '.song-handle', disabled: (viewMode !== 'setlist'), 
            onEnd: function (evt) { if (viewMode === 'setlist') { var movedId = liveSetlist.splice(evt.oldIndex, 1)[0]; liveSetlist.splice(evt.newIndex, 0, movedId); saveSetlists(); } } 
        }); 
    }
    
    if (typeof currentUser !== 'undefined' && currentUser && typeof updateAuthUI === 'function') { updateAuthUI(true); }
}

// ===========================================================
// 3. UI HELPERS & GESTURES
// ===========================================================

function initResizers() {
    const d = document; const leftResizer = d.getElementById('dragMeLeft'); const rightResizer = d.getElementById('dragMeRight'); 
    if(leftResizer) { leftResizer.addEventListener('mousedown', (e) => { e.preventDefault(); d.addEventListener('mousemove', onMouseMoveLeft); d.addEventListener('mouseup', onMouseUpLeft); }); }
    if(rightResizer) { rightResizer.addEventListener('mousedown', (e) => { e.preventDefault(); d.addEventListener('mouseup', onMouseUpRight); d.addEventListener('mousemove', onMouseMoveRight); }); } 
    function onMouseMoveLeft(e) { let newWidth = e.clientX; if(newWidth < 200) newWidth = 200; if(newWidth > 500) newWidth = 500; d.documentElement.style.setProperty('--nav-width', newWidth + 'px'); }
    function onMouseMoveRight(e) { let newWidth = window.innerWidth - e.clientX; if(newWidth < 250) newWidth = 250; if(newWidth > 600) newWidth = 600; d.documentElement.style.setProperty('--tools-width', newWidth + 'px'); }
    function onMouseUpLeft() { d.removeEventListener('mousemove', onMouseMoveLeft); d.removeEventListener('mouseup', onMouseUpLeft); }
    function onMouseUpRight() { d.removeEventListener('mousemove', onMouseMoveRight); d.removeEventListener('mouseup', onMouseUpRight); }
}

function setupGestures() { var area = document.getElementById('mainZone'); var startDist = 0; var startSize = 1.3; if(area) { area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true}); area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true}); } }

// ===========================================================
// 4. IMPORT / EXPORT
// ===========================================================

function selectImport(type) { const modal = document.getElementById('importChoiceModal'); if(modal) modal.style.display = 'none'; if(type === 'file') { const fi = document.getElementById('hiddenFileInput'); if(fi) fi.click(); } else if(type === 'qr') { startScanner(); } else if(type === 'url') { importFromURL(); } }
async function importFromURL() { const url = prompt(t('ph_url_import') || "Enter URL:"); if (!url) return; try { const res = await fetch(url); if(!res.ok) throw new Error("Network Error"); const data = await res.json(); processImportedData(data); } catch (err) { alert("Import Failed: " + err.message); } }
function processImportedData(data) { const safeEnsure = (typeof ensureSongStructure === 'function') ? ensureSongStructure : (s) => s; if (data && data.type === "mnotes_setlist") { if (confirm("Import Setlist?")) { liveSetlist = data.data; localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); renderSidebar(); showToast("Setlist Updated ✅"); } return; } const songs = Array.isArray(data) ? data : [data]; let added = 0, updated = 0; newlyImportedIds = []; songs.forEach(s => { if (s.body) s.body = s.body.replace(/\[/g, '!').replace(/\]/g, ''); const imported = safeEnsure(s); const idx = library.findIndex(x => x.id === imported.id); if (idx !== -1) { if (imported.updatedAt > library[idx].updatedAt) { library[idx] = imported; updated++; newlyImportedIds.push(imported.id); } } else { library.push(imported); added++; newlyImportedIds.push(imported.id); } }); if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha'); saveData(); populateTags(); applyFilters(); showToast(`Import: ${added} New, ${updated} Upd`); }
function startScanner() { const m = document.getElementById('scanModal'); if(m) m.style.display='flex'; if(html5QrCodeScanner) html5QrCodeScanner.clear().catch(e=>{}); try { const scanner = new Html5Qrcode("reader"); html5QrCodeScanner = scanner; scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (txt) => { scanner.stop().then(() => { if(m) m.style.display='none'; try { processImportedData(JSON.parse(txt)); } catch(e){ alert("Invalid QR"); } }); }, (err) => {}).catch(e => { alert("Cam Error: "+e); if(m) m.style.display='none'; }); } catch(e) { alert("QR Lib missing"); } }
function closeScan() { if(html5QrCodeScanner) html5QrCodeScanner.stop().then(()=>document.getElementById('scanModal').style.display='none').catch(e=>document.getElementById('scanModal').style.display='none'); else document.getElementById('scanModal').style.display='none'; }
function exportJSON() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(library)); const a = document.createElement('a'); a.href = dataStr; a.download = "mnotes_backup_" + Date.now() + ".json"; document.body.appendChild(a); a.click(); a.remove(); }
function exportSetlist() { if(liveSetlist.length===0) { showToast("Empty Setlist"); return; } const pkg = { type: "mnotes_setlist", data: liveSetlist }; generateQRInternal(JSON.stringify(pkg)); }
function generateQRFromEditor() { const temp = { id: currentSongId || "temp_"+Date.now(), title: document.getElementById('inpTitle').value, artist: document.getElementById('inpArtist').value, key: document.getElementById('inpKey').value, body: document.getElementById('inpBody').value, updatedAt: Date.now() }; generateQRInternal(JSON.stringify(temp)); }
function generateQRInternal(str) { const div = document.getElementById('qr-output'); if(!div) return; div.innerHTML = ""; try { const qr = qrcode(0, 'M'); qr.addData(unescape(encodeURIComponent(str))); qr.make(); div.innerHTML = qr.createImgTag(5); document.getElementById('qrModal').style.display='flex'; } catch(e) { alert("QR Error"); } }

// ===========================================================
// 5. PLAYER LOGIC
// ===========================================================

function loadSong(id) {
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll(); 
    currentSongId = id; var s = library.find(x => x.id === id); if(!s) return;
    state.t = 0; state.c = 0; 
    
    if(typeof parseSongLogic === 'function') parseSongLogic(s);
    
    renderPlayer(s);
    
    if (s.rhythm && s.rhythm.bpm) { 
        if(typeof updateBpmUI === 'function') updateBpmUI(s.rhythm.bpm); 
    }

    document.getElementById('view-player').classList.add('active-view'); 
    document.getElementById('view-editor').classList.remove('active-view');
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active')); 
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); if(activeItem) activeItem.classList.add('active');
    
    if(typeof requestWakeLock === 'function') requestWakeLock();

    // MOBILE SYNC
    if (window.innerWidth <= 1024 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }
}

/* --- ΑΝΤΙΚΑΤΑΣΤΑΣΗ ΤΗΣ ΣΥΝΑΡΤΗΣΗΣ renderPlayer --- */
function renderPlayer(s) {
    if (!s) return;
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const hasNotes = (s.conductorNotes && s.conductorNotes.trim().length > 0) || (personalNotesMap[s.id] && personalNotesMap[s.id].trim().length > 0);
    
    // --- ΛΟΓΙΚΗ INTRO/INTER ---
    const sizeClass = `intro-size-${introSizeLevel}`; // Η κλάση CSS (0, 1 ή 2)
    
    // ΤΟ ΚΟΥΜΠΙ ΜΕ ΤΟ ID ΤΟΥ
    const btnHtml = `<button id="btnIntroToggle" onclick="cycleIntroSize()" class="size-toggle-btn" title="Change Text Size"><i class="fas fa-text-height"></i></button>`;
    
    let metaHtml = "";
    if (s.intro || s.interlude) {
        metaHtml += `<div class="meta-info-box">`;
        
        if (s.intro) {
            // Κουμπί ΜΠΡΟΣΤΑ, Κείμενο ΜΕΤΑ
            metaHtml += `<div class="meta-row ${sizeClass}">
                            ${btnHtml} <span><strong>Intro:</strong> ${s.intro}</span>
                         </div>`;
        }
        
        if (s.interlude) {
            // Αν δεν υπάρχει Intro, βάζουμε το κουμπί στο Inter. Αλλιώς βάζουμε κενό (spacer) για ευθυγράμμιση.
            const showBtnHere = (!s.intro) ? btnHtml : '<span class="spacer-btn"></span>'; 
            metaHtml += `<div class="meta-row ${sizeClass}">
                            ${showBtnHere} <span><strong>Inter:</strong> ${s.interlude}</span>
                         </div>`;
        }
        
        metaHtml += `</div>`;
    }
    
    if (hasNotes) metaHtml += `<div style="margin-top:5px;"><span class="meta-note-badge"><i class="fas fa-sticky-note"></i> Note</span></div>`;
    
    // --- PLAYER HEADER ---
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header">
            <div class="title-row">
                <h1 id="p-title" class="song-h1" style="flex:1;">${s.title}</h1>
                <button onclick="toggleStickyNotes()" class="note-toggle-btn ${hasNotes ? 'has-notes' : ''}" title="Toggle Notes">
                    <i class="fas fa-sticky-note"></i>
                </button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span class="meta-label">${s.artist || ""}</span>
                <span class="key-badge">${typeof getNote === 'function' ? getNote(s.key || "-", state.t) : s.key}</span>
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
                embedBox.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0;"></iframe>`;
                vidBox.style.display = 'block';
            } else { vidBox.style.display = 'none'; }
        } else { vidBox.style.display = 'none'; }
    }

    if(typeof renderStickyNotes === 'function') renderStickyNotes(s);
    if(typeof renderRecordingsList === 'function') renderRecordingsList(s.recordings || [], []); 

    const dValT = document.getElementById('val-t'); const dValC = document.getElementById('val-c');
    if(dValT) dValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(dValC) dValC.innerText = state.c;
    const mValT = document.getElementById('drawer-val-t'); const mValC = document.getElementById('drawer-val-c');
    if(mValT) mValT.innerText = (state.t > 0 ? "+" : "") + state.t; if(mValC) mValC.innerText = state.c;

    var split = (typeof splitSongBody === 'function') ? splitSongBody(s.body || "") : { fixed: "", scroll: s.body || "" }; 
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);
}

function renderArea(elemId, text) { 
    var container = document.getElementById(elemId); if (!container) return; 
    container.innerHTML = ""; 
    var lines = text.split('\n'); 
    lines.forEach(line => { 
        var row = document.createElement('div'); row.className = 'line-row'; 
        if (line.indexOf('!') === -1) { 
            row.innerHTML = `<span class="lyric">${line || "&nbsp;"}</span>`; 
        } else { 
            var parts = line.split('!'); 
            if (parts[0]) row.appendChild(createToken("", parts[0])); 
            for (var i = 1; i < parts.length; i++) { 
                var m = parts[i].match(/^([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)\s?(.*)/); 
                if (m) {
                    let noteDisp = (typeof getNote === 'function') ? getNote(m[1], state.t - state.c) : m[1];
                    row.appendChild(createToken(noteDisp, m[3] || "")); 
                } else {
                    row.appendChild(createToken("", parts[i] || "")); 
                }
            } 
        } 
        container.appendChild(row); 
    }); 
}

function createToken(c, l) { var d = document.createElement('div'); d.className = 'token'; d.innerHTML = `<span class="chord">${c || ""}</span><span class="lyric">${l || ""}</span>`; return d; }

// ===========================================================
// 6. EDITOR LOGIC
// ===========================================================

function switchToEditor() {
    document.getElementById('view-player').classList.remove('active-view'); document.getElementById('view-editor').classList.add('active-view');
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
            const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
            document.getElementById('inpPersonalNotes').value = map[s.id] || "";
            editorTags = s.playlists ? [...s.playlists] : []; 
            if(typeof renderTagChips === 'function') renderTagChips(); 
        } 
    } else { createNewSong(); }
}

function saveEdit() { 
    let bodyArea = document.getElementById('inpBody'); 
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value); 
    saveSong(); 
    if (currentSongId) {
        const pNote = document.getElementById('inpPersonalNotes').value;
        const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
        if (pNote.trim()) { map[currentSongId] = pNote.trim(); } else { delete map[currentSongId]; }
        localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));
    }
    populateTags(); applyFilters(); 
}

function saveSong() {
    const title = document.getElementById('inpTitle').value;
    if(!title) { alert("Title required"); return; }
    let s;
    if(currentSongId) { s = library.find(x => x.id === currentSongId); s.updatedAt = Date.now(); } 
    else { s = { id: Date.now().toString(), createdAt: Date.now(), updatedAt: Date.now() }; library.push(s); currentSongId = s.id; }
    
    s.title = title;
    s.artist = document.getElementById('inpArtist').value;
    s.key = document.getElementById('inpKey').value;
    s.body = document.getElementById('inpBody').value;
    s.intro = document.getElementById('inpIntro').value;
    s.interlude = document.getElementById('inpInter').value;
    s.video = document.getElementById('inpVideo').value;
    s.conductorNotes = document.getElementById('inpConductorNotes').value;
    s.playlists = [...editorTags];
    if(!s.rhythm) s.rhythm = {};
    const bpmVal = document.getElementById('rngBpm').value;
    s.rhythm.bpm = parseInt(bpmVal);
    saveData();
    loadSong(currentSongId);
}

function fixTrailingChords(text) { let lines = text.split('\n'); return lines.map(line => { const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; if (line.match(trailingChordRegex)) return line.trimEnd() + "    "; return line; }).join('\n'); }
function createNewSong() { currentSongId = null; document.querySelectorAll('.inp').forEach(e => e.value = ""); editorTags = []; if(typeof renderTagChips === 'function') renderTagChips(); document.getElementById('view-player').classList.remove('active-view'); document.getElementById('view-editor').classList.add('active-view'); }
function exitEditor() { if (currentSongId) loadSong(currentSongId); else if (library.length > 0) loadSong(library[0].id); else { document.getElementById('view-editor').classList.remove('active-view'); document.getElementById('view-player').classList.add('active-view'); } }
function deleteCurrentSong() { if(!currentSongId) return; if(confirm(t('msg_delete_confirm') || "Delete this song?")) { library = library.filter(s => s.id !== currentSongId); liveSetlist = liveSetlist.filter(id => id !== currentSongId); localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); saveData(); populateTags(); applyFilters(); if(library.length > 0) loadSong(library[0].id); else createNewSong(); showToast("Song Deleted 🗑️"); } }

// ===========================================================
// 7. RECORDING (AUDIO & CLOUD)
// ===========================================================

async function toggleRecording() {
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
    const s = library.find(x => x.id === currentSongId);
    if (!confirm(`Save to "${s.title}" in Cloud?`)) return;
    const btnLink = document.getElementById('btnLinkRec');
    btnLink.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btnLink.style.opacity = '0.7';
    
    if (!s.recordings) s.recordings = [];
    const takeNum = s.recordings.length + 1;
    const filename = `Song_${currentSongId}_Take${takeNum}_${Date.now()}.webm`;

    try {
        // Direct upload using Supabase Client (Bypassing audio.js input logic)
        const { data, error } = await supabaseClient.storage.from('audio_files').upload(`${currentUser.id}/${filename}`, currentRecordedBlob);
        
        if(!error) {
            const { data: { publicUrl } } = supabaseClient.storage.from('audio_files').getPublicUrl(`${currentUser.id}/${filename}`);
            
            // Add to Database (Overrides)
            if(typeof addRecordingToCurrentSong === 'function') {
                 await addRecordingToCurrentSong({ id: Date.now(), name: `Take ${takeNum}`, url: publicUrl, date: Date.now() });
            } else {
                 // Fallback: Local only
                 s.recordings.push({ url: publicUrl, label: `Take ${takeNum}`, date: Date.now() });
                 saveData(); 
            }
            showToast(`Take ${takeNum} Saved! ☁️`);
            btnLink.style.display = 'none'; renderPlayer(s);
        } else {
            throw error;
        }
    } catch(e) {
         console.error(e);
         showToast("Upload Error: " + e.message);
         btnLink.style.opacity = '1'; btnLink.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
    }
}

// ===========================================================
// 8. SETLIST MANAGER
// ===========================================================

function initSetlists() {
    allSetlists = JSON.parse(localStorage.getItem('mnotes_all_setlists')) || {};
    if (Object.keys(allSetlists).length === 0) { allSetlists["Default Setlist"] = { type: 'local', songs: [] }; }
    Object.keys(allSetlists).forEach(key => { if (Array.isArray(allSetlists[key])) allSetlists[key] = { type: 'local', songs: allSetlists[key] }; });
    var currentSetlistName = localStorage.getItem('mnotes_active_setlist_name') || Object.keys(allSetlists)[0];
    if (!allSetlists[currentSetlistName]) currentSetlistName = Object.keys(allSetlists)[0];
    liveSetlist = allSetlists[currentSetlistName].songs || [];
}

function updateSetlistDropdown() {
    const sel = document.getElementById('selSetlistName'); if(!sel) return; sel.innerHTML = "";
    var currentSetlistName = localStorage.getItem('mnotes_active_setlist_name');
    Object.keys(allSetlists).forEach(name => {
        const listObj = allSetlists[name];
        const opt = document.createElement('option'); opt.value = name;
        const icon = listObj.type === 'shared' ? '☁️' : '📝';
        opt.innerText = `${icon} ${name} (${listObj.songs.length})`;
        if(name === currentSetlistName) opt.selected = true;
        sel.appendChild(opt);
    });
    updateSetlistButtons();
}

function updateSetlistButtons() {
    var currentSetlistName = localStorage.getItem('mnotes_active_setlist_name');
    const isShared = (allSetlists[currentSetlistName] && allSetlists[currentSetlistName].type === 'shared');
    const btnDel = document.getElementById('btnDelSetlist'); const btnRen = document.getElementById('btnRenSetlist');
    if(btnDel) { btnDel.disabled = isShared; btnDel.style.opacity = isShared?'0.3':'1'; }
    if(btnRen) { btnRen.disabled = isShared; btnRen.style.opacity = isShared?'0.3':'1'; }
}

function switchSetlist(name) {
    if(!allSetlists[name]) return;
    liveSetlist = allSetlists[name].songs || [];
    localStorage.setItem('mnotes_active_setlist_name', name);
    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
    renderSidebar(); updateSetlistButtons();
}

function createSetlist() {
    const name = prompt(t('msg_new_setlist') || "New Setlist Name:");
    if (name && !allSetlists[name]) {
        allSetlists[name] = { type: 'local', songs: [] }; saveSetlists(name); switchSetlist(name); updateSetlistDropdown();
    } else if (allSetlists[name]) alert("Setlist exists!");
}

function renameSetlist() {
    var currentSetlistName = localStorage.getItem('mnotes_active_setlist_name');
    if (allSetlists[currentSetlistName].type === 'shared') return;
    const newName = prompt(t('msg_rename_setlist') || "Rename to:", currentSetlistName);
    if (newName && newName !== currentSetlistName && !allSetlists[newName]) {
        allSetlists[newName] = allSetlists[currentSetlistName]; delete allSetlists[currentSetlistName];
        localStorage.setItem('mnotes_active_setlist_name', newName); saveSetlists(newName); updateSetlistDropdown();
    }
}

function deleteSetlist() {
    var currentSetlistName = localStorage.getItem('mnotes_active_setlist_name');
    if (allSetlists[currentSetlistName].type === 'shared' || Object.keys(allSetlists).length <= 1) { showToast("Cannot delete"); return; }
    if (confirm(`Delete "${currentSetlistName}"?`)) {
        delete allSetlists[currentSetlistName]; switchSetlist(Object.keys(allSetlists)[0]); saveSetlists(Object.keys(allSetlists)[0]); updateSetlistDropdown();
    }
}

function saveSetlists(activeName) {
    var name = activeName || localStorage.getItem('mnotes_active_setlist_name');
    if(allSetlists[name]) allSetlists[name].songs = liveSetlist;
    localStorage.setItem('mnotes_all_setlists', JSON.stringify(allSetlists));
}

function toggleSetlistSong(e, id) { 
    e.stopPropagation(); var i = liveSetlist.indexOf(id); 
    if(i > -1) liveSetlist.splice(i,1); else liveSetlist.push(id); 
    saveSetlists(); renderSidebar(); 
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
    else { showToast(dir > 0 ? "End of Setlist" : "Start of Setlist"); }
}

// ===========================================================
// 9. RHYTHM TOOLS
// ===========================================================

function initRhythmUI() {
    const slider = document.getElementById('rngBpm');
    if(slider) { slider.addEventListener('input', function(e) { updateBpmUI(e.target.value); }); }
    const btn = document.getElementById('btnPlayRhythm');
    if(btn && typeof togglePlay === 'function') { btn.onclick = function() { togglePlay(); }; }
    renderRhythmGrid(16);
}
function updateBpmUI(val) {
    const disp = document.getElementById('dispBpm'); const rng = document.getElementById('rngBpm');
    if(disp) disp.innerText = val; if(rng) rng.value = val;
    if(typeof updateBpm === 'function') updateBpm(val); 
}
function renderRhythmGrid(steps) {
    const container = document.getElementById('rhythm-grid'); if(!container) return;
    container.innerHTML = ''; container.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < steps; i++) {
            const cell = document.createElement('div'); cell.className = 'cell';
            if (row === 0) cell.classList.add('bass'); if (row === 1) cell.classList.add('snare'); if (row === 2) cell.classList.add('hihat'); 
            cell.dataset.row = row; cell.dataset.col = i;
            cell.onclick = function() { this.classList.toggle('active'); };
            container.appendChild(cell);
        }
    }
}
function loadPreset(type) {
    if(type === 'zeibekiko') updateBpmUI(60); if(type === 'kalamatianos') updateBpmUI(120); if(type === 'chasapiko') updateBpmUI(80);
}

// ===========================================================
// 10. VISUAL HELPERS (Sticky, Audio List)
// ===========================================================

// Global Variable για το μέγεθος (0=Small, 1=Medium, 2=Large)
var introSizeLevel = parseInt(localStorage.getItem('mnotes_intro_size')) || 0;

function cycleIntroSize() {
    // Αλλαγή: 0 -> 1 -> 2 -> 0
    introSizeLevel = (introSizeLevel + 1) % 3;
    localStorage.setItem('mnotes_intro_size', introSizeLevel);
    
    // Ξαναφορτώνουμε τον Player για να φανεί η αλλαγή άμεσα
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) renderPlayer(s);
    }
}
function deleteRecording(songId, typeOrIndex) {
    const s = library.find(x => x.id === songId); if (!s || !s.recordings) return;
    if (!confirm(`Delete recording?`)) return;
    // Simple Index deletion for now (Phase 1)
    if(typeof typeOrIndex === 'number') { s.recordings.splice(typeOrIndex, 1); } 
    saveData(); renderPlayer(s); showToast("Deleted");
}

function renderRecordingsList(personalRecs = [], publicRecs = []) {
    const listEl = document.getElementById('sideRecList'); if (!listEl) return;
    listEl.innerHTML = ''; let hasItems = false;
    const appendTrack = (rec, type, index) => {
        const el = document.createElement('div'); el.className = 'track-item';
        const colorVar = type === 'private' ? 'var(--rec-private)' : 'var(--rec-public)';
        const iconClass = type === 'private' ? 'fas fa-lock' : 'fas fa-globe';
        const tooltip = type === 'private' ? 'Private' : 'Public';
        el.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${type === 'private' ? '#ffb74d' : '#4db6ac'}; border-left-color: ${colorVar};`;
        el.innerHTML = `<div onclick="playAudio('${rec.url}')" style="cursor:pointer; flex:1; display:flex; align-items:center; overflow:hidden;"><i class="${iconClass}" title="${tooltip}" style="color:${colorVar}; margin-right:8px;"></i><span style="font-size:0.85rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rec.name || rec.label}</span></div><button onclick="deleteRecording('${currentSongId}', ${index})" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0 5px;" title="Delete"><i class="fas fa-times"></i></button>`;
        listEl.appendChild(el); hasItems = true;
    };
    if (personalRecs && personalRecs.length > 0) { personalRecs.forEach((r, i) => appendTrack(r, 'private', i)); }
    if (!hasItems) listEl.innerHTML = '<div class="empty-state">No recordings yet</div>';
}

function playAudio(url) { const audio = document.getElementById('masterAudio'); if(audio) { audio.src = url; audio.play(); } }

function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea'); const condText = document.getElementById('conductorNoteText'); const persText = document.getElementById('personalNoteText');
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}'); const myNote = personalNotesMap[s.id] || "";
    stickyArea.style.display = 'none'; 
    if (s.conductorNotes) { condText.style.display = 'block'; condText.innerHTML = `<b><i class="fas fa-bullhorn"></i> Info:</b> ${s.conductorNotes}`; } else { condText.style.display = 'none'; }
    if (myNote) { persText.style.display = 'block'; persText.innerHTML = `<b><i class="fas fa-user-secret"></i> My Notes:</b> ${myNote}`; } else { persText.style.display = 'none'; }
}
function toggleStickyNotes() { const area = document.getElementById('stickyNotesArea'); if (area) { area.style.display = (area.style.display === 'none' || area.style.display === '') ? 'block' : 'none'; } }

// ===========================================================
// 11. MOBILE NAVIGATION & DRAWER
// ===========================================================

function setupEvents() {
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) { fileInput.addEventListener('change', function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(ex) { try { const imported = JSON.parse(ex.target.result); processImportedData(imported); const modal = document.getElementById('importChoiceModal'); if(modal) modal.style.display = 'none'; } catch(err) { alert("Error reading file"); } }; reader.readAsText(file); fileInput.value = ''; }); }
    document.addEventListener('click', function(e) { var wrap = document.querySelector('.tag-wrapper'); var sugg = document.getElementById('tagSuggestions'); if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) { sugg.style.display = 'none'; } });
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
    if (isOpen) { d.classList.remove('open'); stopDrawerTimer(); document.removeEventListener('click', closeDrawerOutside); } 
    else { d.classList.add('open'); resetDrawerTimer(); setTimeout(() => { document.addEventListener('click', closeDrawerOutside); }, 100); setupDrawerListeners(d); }
}
function closeDrawerOutside(e) {
    const d = document.getElementById('rightDrawer'); const h = document.getElementById('drawerHandle');
    if (d && d.classList.contains('open') && !d.contains(e.target) && !h.contains(e.target)) { toggleRightDrawer(); }
}
function resetDrawerTimer() {
    stopDrawerTimer(); drawerIdleTimer = setTimeout(() => { const d = document.getElementById('rightDrawer'); if (d && d.classList.contains('open')) { toggleRightDrawer(); showToast("Drawer closed (inactive)"); } }, 6000);
}
function stopDrawerTimer() { if (drawerIdleTimer) clearTimeout(drawerIdleTimer); }

function setupDrawerListeners(drawer) {
    let touchStartX = 0; let touchStartY = 0;
    drawer.ontouchstart = (e) => { resetDrawerTimer(); touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; };
    drawer.onmousemove = () => { resetDrawerTimer(); }; drawer.onclick = () => { resetDrawerTimer(); };
    drawer.ontouchend = (e) => {
        let touchEndX = e.changedTouches[0].screenX; let touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX; const diffY = touchEndY - touchStartY;
        if (Math.abs(diffX) > Math.abs(diffY) && diffX > 50) { toggleRightDrawer(); }
    };
}

function switchDrawerTab(tabName) {
    if (window.innerWidth > 1024) return;
    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.drawer-section .drawer-btn');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active'); 
    if(tabName === 'stage' && btns[1]) btns[1].classList.add('active'); 
    if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');
    switchMobileTab(tabName);
    const controlsDiv = document.getElementById('drawer-player-controls');
    if(controlsDiv) controlsDiv.style.display = (tabName === 'stage') ? 'flex' : 'none';
    toggleRightDrawer();
}

// ===========================================================
// 12. UTILS & MUSIC THEORY (FINAL CORRECTED VERSION)
// ===========================================================

function getYoutubeId(url) { if (!url) return null; var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/; var match = url.match(regExp); return (match && match[2].length === 11) ? match[2] : null; }
function showToast(msg) { var x = document.getElementById("toast"); if(x) { x.innerText = msg; x.className = "show"; setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000); } }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }
function filterByKey(e, key) { e.stopPropagation(); var inp = document.getElementById('searchInp'); if(inp) { inp.value = key; applyFilters(); showToast("Filter: " + key); } }

/* ΔΙΟΡΘΩΣΗ: Χρήση των μεταβλητών όπως ορίζονται στο data.js 
   NOTES = Διέσεις
   NOTES_FLAT = Υφέσεις
*/
function getNote(note, semitones) {
    if (!note || note === "-" || note === "") return note;
    let root = note.match(/^[A-G][#b]?/)[0];
    let suffix = note.substring(root.length);
    
    // Ασφαλής ανάκτηση από το data.js (NOTES αντί για NOTES_SHARP)
    const SHARP = (typeof NOTES !== 'undefined') ? NOTES : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const FLAT  = (typeof NOTES_FLAT !== 'undefined') ? NOTES_FLAT : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    
    let scale = (root.includes("b") || note.includes("F")) ? FLAT : SHARP;
    let index = -1;
    
    if (SHARP.includes(root)) index = SHARP.indexOf(root);
    else if (FLAT.includes(root)) index = FLAT.indexOf(root);
    
    if (index === -1) return note;
    
    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;
    
    let outScale = (semitones < 0) ? FLAT : SHARP;
    return outScale[newIndex] + suffix;
}
/* --- ΔΙΟΡΘΩΜΕΝΟ SPLIT (Smart Split βάσει συγχορδιών) --- */
function splitSongBody(body) {
    if (!body) return { fixed: "", scroll: "" };

    // 1. Χωρίζουμε το τραγούδι σε στροφές (όπου υπάρχει κενή γραμμή)
    const stanzas = body.split(/\n\s*\n/);
    
    let splitIndex = -1;

    // 2. Ψάχνουμε την ΤΕΛΕΥΤΑΙΑ στροφή που περιέχει συγχορδία (!)
    for (let i = 0; i < stanzas.length; i++) {
        // Αν η στροφή περιέχει "!", θεωρούμε ότι έχει συγχορδίες
        if (stanzas[i].includes('!')) {
            splitIndex = i;
        }
    }

    // 3. Διαχωρισμός
    if (splitIndex === -1) {
        // Αν δεν βρέθηκε ΚΑΜΙΑ συγχορδία, όλα πάνε στο Scroll
        return { fixed: "", scroll: body };
    } else {
        // Το Fixed περιλαμβάνει από την αρχή μέχρι ΚΑΙ την τελευταία στροφή με συγχορδίες
        const fixedPart = stanzas.slice(0, splitIndex + 1).join('\n\n');
        
        // Το Scroll περιλαμβάνει όλα τα υπόλοιπα (καθαροί στίχοι)
        const scrollPart = stanzas.slice(splitIndex + 1).join('\n\n');

        return { 
            fixed: fixedPart.trim(), 
            scroll: scrollPart.trim() 
        };
    }
}
function parseSongLogic(s) { /* Logic to prepare chords */ }

function calculateOptimalCapo(originalKey, body) {
    const difficultChords = ["F", "Bm", "Bb", "Cm", "C#", "F#", "G#", "D#m", "G#m", "A#m"];
    let bestCapo = 0; let minDiff = 1000;
    for (let i = 0; i <= 5; i++) {
        let currentDiff = 0;
        let newKey = getNote(originalKey, -i); 
        if (difficultChords.includes(newKey)) currentDiff += 10;
        if (newKey.includes("#") || newKey.includes("b")) currentDiff += 2;
        if (currentDiff < minDiff) { minDiff = currentDiff; bestCapo = i; }
    }
    return bestCapo;
}
// ===========================================================
// 13. SETTINGS & MODAL LOGIC (ADD THIS TO THE END)
// ===========================================================

function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
        console.error("Settings Modal ID not found!");
        return;
    }

    // Φόρτωση των τρεχουσών τιμών στα dropdowns
    const themeSel = document.getElementById('themeSelect');
    const langSel = document.getElementById('langSelect');
    const sortSel = document.getElementById('sortDefaultSelect'); 
    
    // Έλεγχος αν υπάρχουν τα userSettings (αν όχι, τα δημιουργούμε)
    if (typeof userSettings === 'undefined') {
        userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || { theme: 'theme-dark', lang: 'el', sortMethod: 'alpha' };
    }

    if(themeSel) themeSel.value = userSettings.theme || 'theme-dark';
    if(langSel) langSel.value = userSettings.lang || 'el';
    if(sortSel) sortSel.value = userSettings.sortMethod || 'alpha';

    // Εμφάνιση του παραθύρου
    modal.style.display = 'flex';
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
}

function saveSettings() {
    const themeSel = document.getElementById('themeSelect');
    const langSel = document.getElementById('langSelect');
    const sortSel = document.getElementById('sortDefaultSelect');

    // 1. Εφαρμογή Θέματος
    if (themeSel) {
        userSettings.theme = themeSel.value;
        if(typeof applyTheme === 'function') applyTheme();
    }

    // 2. Εφαρμογή Γλώσσας
    if (langSel) {
        userSettings.lang = langSel.value;
        if(typeof toggleLanguage === 'function') {
             // Αν η γλώσσα άλλαξε, καλούμε την toggleLanguage
             const currentLangStored = localStorage.getItem('mnotes_lang');
             if(currentLangStored !== userSettings.lang) {
                 toggleLanguage(); 
             }
        }
    }
    
    // 3. Προεπιλογή Ταξινόμησης
    if (sortSel) {
        userSettings.sortMethod = sortSel.value;
    }
    
    // 4. Αποθήκευση στη μνήμη
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    
    // Κλείσιμο παραθύρου & Ενημέρωση
    closeSettings();
    
    // Ανανέωση λίστας με τις νέες ρυθμίσεις
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod);
    
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
    if (event.target === scanModal) closeScan();
    if (event.target === authModal) authModal.style.display = 'none';
}
