/* ===========================================================
   mNotes Pro UI Logic v16.0 (FINAL MERGED & COMPLETE)
   PART 1: Core, Library, Tools, Resizers
   =========================================================== */

// Global Variables
if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;

var visiblePlaylist = [];
var sortableInstance = null;
var editorTags = [];
var scrollTimer = null;
var html5QrCodeScanner = null;
var liveSetlist = JSON.parse(localStorage.getItem('mnotes_setlist')) || [];
var viewMode = 'library'; 
var isLyricsMode = false; 
var wakeLock = null; 
var newlyImportedIds = []; 
var drawerIdleTimer = null; // Για το 5s timer

// New Globals (v15+)
var navHideTimer = null;
var mediaRecorder = null;
var audioChunks = [];
var currentRecordedBlob = null;
var recTimerInterval = null;
var recStartTime = 0;

// Default Settings
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50, maxCapo: 12, backupReminder: true, hideDemo: false, theme: 'theme-dark', introScale: 0, keepScreenOn: false, sortMethod: 'alpha',
    customColors: { '--bg-main': '#000000', '--bg-panel': '#222222', '--text-main': '#ffffff', '--accent': '#00ff00', '--chord-color': '#ffff00' }
};
var tempIntroScale = 0; 

// --- INITIALIZATION ---
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro v17.0 (Drawer) Loaded");
    applyTheme(); 
    applyTranslations(); 
    loadLibrary(); 
    setupEvents(); 
    setupGestures(); 
    checkBackupReminder(); 
    initResizers();
    initRhythmUI();

    // MOBILE SETUP: Εμφάνιση Handle & Default Tab
    if (window.innerWidth <= 1024) {
        const h = document.getElementById('drawerHandle');
        if(h) h.style.display = 'flex';
        // Ξεκινάμε στο Stage
        if(typeof switchDrawerTab === 'function') switchDrawerTab('stage'); 
    }
});

// --- THEME & TRANSLATIONS ---
function toggleLanguage() { currentLang = (currentLang === 'en') ? 'el' : 'en'; localStorage.setItem('mnotes_lang', currentLang); applyTranslations(); renderSidebar(); populateTags(); if(currentSongId && currentSongId.includes('demo')) loadSong(currentSongId); }
function applyTranslations() { if(typeof TRANSLATIONS === 'undefined') return; document.querySelectorAll('[data-i18n]').forEach(el => { var key = el.getAttribute('data-i18n'); if (TRANSLATIONS[currentLang][key]) el.innerText = TRANSLATIONS[currentLang][key]; }); var btn = document.getElementById('btnLang'); if(btn) btn.innerHTML = (currentLang === 'en') ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> EL'; }
function applyTheme() { 
    // Basic Theme Logic
    document.body.className = userSettings.theme; 
    // Auto-mobile theme override if needed
    if (window.innerWidth <= 1024 && userSettings.theme === 'theme-dark') {
        document.body.classList.add('theme-slate');
    }
    
    var root = document.documentElement; 
    if (userSettings.theme === 'theme-custom' && userSettings.customColors) { 
        for (var key in userSettings.customColors) { root.style.setProperty(key, userSettings.customColors[key]); } 
    } else { 
        ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => root.style.removeProperty(k)); 
    } 
    var newSize = 1.1 + ((userSettings.introScale || 0) * 0.11); 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem"); 
}

// --- LIBRARY LOGIC ---
function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { 
        try { library = JSON.parse(saved); } catch(e) { library = []; } 
    }

    // 1. Αν η βιβλιοθήκη είναι άδεια, βάλε το Demo
    if (library.length === 0 && typeof DEFAULT_DATA !== 'undefined') { 
        library.push(ensureSongStructure(JSON.parse(JSON.stringify(DEFAULT_DATA[0])))); 
        saveData(); 
    }

    library = library.map(ensureSongStructure);
    liveSetlist = liveSetlist.filter(id => library.some(s => s.id === id));
    
    populateTags(); 
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    const sortDropdown = document.getElementById('sortFilter'); if (sortDropdown) sortDropdown.value = userSettings.sortMethod || 'alpha';
    
    renderSidebar();

    // 2. ΦΟΡΤΩΣΗ ΣΤΟΝ PLAYER (Fix για να μην είναι κενή η οθόνη)
    if (library.length > 0) {
        // Αν δεν έχει επιλεγεί τραγούδι, πάρε το πρώτο (συνήθως το Demo)
        if (!currentSongId) currentSongId = library[0].id;
        
        // Φόρτωσέ το αμέσως
        loadSong(currentSongId);
    } else { 
        // Αν αποτύχουν όλα, φτιάξε κενό
        createNewSong(); 
    }
}

function clearLibrary() { if(confirm(t('msg_clear_confirm'))) { library = [ensureSongStructure(JSON.parse(JSON.stringify(DEFAULT_DATA[0])))]; liveSetlist = []; localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); saveData(); document.getElementById('searchInp').value = ""; applyFilters(); loadSong(library[0].id); } }

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
          if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-btn')) return; loadSong(s.id);
          // ΝΕΟ: Αν είμαστε σε κινητό, κλείσε το Drawer
          if(window.innerWidth <= 1024) {const d = document.getElementById('rightDrawer');if(d && d.classList.contains('open')) toggleRightDrawer();}
    }; 
       
        var displayTitle = (s.id.includes('demo')) ? t('demo_title') : s.title; var displayKey = s.key || "-";
        var actionIcon = "far fa-circle"; if (viewMode === 'setlist') actionIcon = "fas fa-minus-circle"; else if (liveSetlist.includes(s.id)) actionIcon = "fas fa-check-circle in-setlist";
        li.innerHTML = `<i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i><div class="song-info"><div class="song-title">${displayTitle}</div><div class="song-meta-row"><span class="song-artist">${s.artist || "-"}</span><span class="song-key-badge" onclick="filterByKey(event, '${displayKey}')">${displayKey}</span></div></div>${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}`;
        list.appendChild(li);
    });
    if (sortableInstance) sortableInstance.destroy();
    if(typeof Sortable !== 'undefined') { sortableInstance = new Sortable(list, { animation: 150, handle: '.song-handle', disabled: (viewMode !== 'setlist'), onEnd: function (evt) { if (viewMode === 'setlist') { var movedId = liveSetlist.splice(evt.oldIndex, 1)[0]; liveSetlist.splice(evt.newIndex, 0, movedId); localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); } } }); }
}

// --- UTILS & RESIZERS ---
function initResizers() {
    const d = document; const leftResizer = d.getElementById('dragMeLeft'); const rightResizer = d.getElementById('dragMeRight'); 
    if(leftResizer) { leftResizer.addEventListener('mousedown', (e) => { e.preventDefault(); d.addEventListener('mousemove', onMouseMoveLeft); d.addEventListener('mouseup', onMouseUpLeft); }); }
    if(rightResizer) { rightResizer.addEventListener('mousedown', (e) => { e.preventDefault(); d.addEventListener('mouseup', onMouseUpRight); d.addEventListener('mousemove', onMouseMoveRight); }); } // Fixed order
    function onMouseMoveLeft(e) { let newWidth = e.clientX; if(newWidth < 200) newWidth = 200; if(newWidth > 500) newWidth = 500; d.documentElement.style.setProperty('--nav-width', newWidth + 'px'); }
    function onMouseMoveRight(e) { let newWidth = window.innerWidth - e.clientX; if(newWidth < 250) newWidth = 250; if(newWidth > 600) newWidth = 600; d.documentElement.style.setProperty('--tools-width', newWidth + 'px'); }
    function onMouseUpLeft() { d.removeEventListener('mousemove', onMouseMoveLeft); d.removeEventListener('mouseup', onMouseUpLeft); }
    function onMouseUpRight() { d.removeEventListener('mousemove', onMouseMoveRight); d.removeEventListener('mouseup', onMouseUpRight); }
}

function setupGestures() { var area = document.getElementById('mainZone'); var startDist = 0; var startSize = 1.3; if(area) { area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true}); area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true}); } }

// Import/Export Functions
function selectImport(type) { const modal = document.getElementById('importChoiceModal'); if(modal) modal.style.display = 'none'; if(type === 'file') { const fi = document.getElementById('hiddenFileInput'); if(fi) fi.click(); } else if(type === 'qr') { startScanner(); } else if(type === 'url') { importFromURL(); } }
async function importFromURL() { const url = prompt(t('ph_url_import') || "Enter URL:"); if (!url) return; try { const res = await fetch(url); if(!res.ok) throw new Error("Network Error"); const data = await res.json(); processImportedData(data); } catch (err) { alert("Import Failed: " + err.message); } }
function processImportedData(data) { if (data && data.type === "mnotes_setlist") { if (confirm("Import Setlist?")) { liveSetlist = data.data; localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); renderSidebar(); showToast("Setlist Updated ✅"); } return; } const songs = Array.isArray(data) ? data : [data]; let added = 0, updated = 0; newlyImportedIds = []; songs.forEach(s => { if (s.body) s.body = s.body.replace(/\[/g, '!').replace(/\]/g, ''); const imported = ensureSongStructure(s); const idx = library.findIndex(x => x.id === imported.id); if (idx !== -1) { if (imported.updatedAt > library[idx].updatedAt) { library[idx] = imported; updated++; newlyImportedIds.push(imported.id); } } else { library.push(imported); added++; newlyImportedIds.push(imported.id); } }); if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha'); saveData(); populateTags(); applyFilters(); showToast(`Import: ${added} New, ${updated} Upd`); }
function startScanner() { const m = document.getElementById('scanModal'); if(m) m.style.display='flex'; if(html5QrCodeScanner) html5QrCodeScanner.clear().catch(e=>{}); try { const scanner = new Html5Qrcode("reader"); html5QrCodeScanner = scanner; scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (txt) => { scanner.stop().then(() => { if(m) m.style.display='none'; try { processImportedData(JSON.parse(txt)); } catch(e){ alert("Invalid QR"); } }); }, (err) => {}).catch(e => { alert("Cam Error: "+e); if(m) m.style.display='none'; }); } catch(e) { alert("QR Lib missing"); } }
function closeScan() { if(html5QrCodeScanner) html5QrCodeScanner.stop().then(()=>document.getElementById('scanModal').style.display='none').catch(e=>document.getElementById('scanModal').style.display='none'); else document.getElementById('scanModal').style.display='none'; }
function exportJSON() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(library)); const a = document.createElement('a'); a.href = dataStr; a.download = "mnotes_backup_" + Date.now() + ".json"; document.body.appendChild(a); a.click(); a.remove(); }
function exportSetlist() { if(liveSetlist.length===0) { showToast("Empty Setlist"); return; } const pkg = { type: "mnotes_setlist", data: liveSetlist }; generateQRInternal(JSON.stringify(pkg)); }
function generateQRFromEditor() { const temp = { id: currentSongId || "temp_"+Date.now(), title: document.getElementById('inpTitle').value, artist: document.getElementById('inpArtist').value, key: document.getElementById('inpKey').value, body: document.getElementById('inpBody').value, updatedAt: Date.now() }; generateQRInternal(JSON.stringify(temp)); }
function generateQRInternal(str) { const div = document.getElementById('qr-output'); if(!div) return; div.innerHTML = ""; try { const qr = qrcode(0, 'M'); qr.addData(unescape(encodeURIComponent(str))); qr.make(); div.innerHTML = qr.createImgTag(5); document.getElementById('qrModal').style.display='flex'; } catch(e) { alert("QR Error"); } }
/* ===========================================================
   PART 2: Player, Editor, Audio/Cloud
   =========================================================== */

function loadSong(id) {
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll(); 
    currentSongId = id; var s = library.find(x => x.id === id); if(!s) return;
    state.t = 0; state.c = 0; parseSongLogic(s); 
    
    // NEW: Render Functions
    renderPlayer(s);
    
    // NEW: Load Rhythm Preset if exists
    if (s.rhythm && s.rhythm.bpm) { 
        if(typeof updateBpmUI === 'function') updateBpmUI(s.rhythm.bpm); 
    }

    document.getElementById('view-player').classList.add('active-view'); document.getElementById('view-editor').classList.remove('active-view');
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active')); var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); if(activeItem) activeItem.classList.add('active');
    if(typeof requestWakeLock === 'function') requestWakeLock();
    
    // Mobile: Auto Switch to Stage via Drawer Logic
    if (window.innerWidth <= 1024) {
        document.querySelector('.col-nav').classList.remove('mobile-view-active');
        document.querySelector('.col-tools').classList.remove('mobile-view-active');
        document.querySelector('.col-stage').classList.add('mobile-view-active');
        
        document.querySelectorAll('.tab-btn-mob').forEach(b => b.classList.remove('active'));
        const stageBtn = document.querySelectorAll('.tab-btn-mob')[1]; 
        if(stageBtn) stageBtn.classList.add('active');
    }
}

function renderPlayer(s) {
    if (!s) return;
   // --- ΕΜΦΑΝΙΣΗ INTRO / INTERLUDE (Fix Point 1) ---
    let metaHtml = "";
    if (s.intro) metaHtml += `<span class="meta-tag" style="color:#aaa; font-size:0.8rem; margin-right:10px;"><strong>Intro:</strong> ${s.intro}</span>`;
    if (s.interlude) metaHtml += `<span class="meta-tag" style="color:#aaa; font-size:0.8rem;"><strong>Inter:</strong> ${s.interlude}</span>`;
    
    // Header με Intro/Inter
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header">
            <h1 id="p-title" class="song-h1">${s.title}</h1>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span class="meta-label">${s.artist || ""}</span>
                <span class="key-badge">${getNote(s.key || "-", state.t)}</span>
            </div>
            <div style="margin-top:8px; border-top:1px dashed #333; padding-top:5px;">
                ${metaHtml}
            </div>
        </div>`;
    }
 
    // B. VIDEO SIDEBAR (Moved from scroll-container to right sidebar)
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

    // C. NEW HELPERS
    renderSideRecordings(s);
    renderStickyNotes(s);

    // D. LYRICS
    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;
    var split = splitSongBody(s.body || ""); renderArea('fixed-container', split.fixed); renderArea('scroll-container', split.scroll);
    // --- NEW: Ενημέρωση Ενδείξεων DRAWER ---
    const drT = document.getElementById('drawer-val-t');
    const drC = document.getElementById('drawer-val-c');
    if (drT) drT.innerText = (state.t > 0 ? "+" : "") + state.t;
    if (drC) drC.innerText = state.c;
    // ΕΝΗΜΕΡΩΣΗ ΑΡΙΘΜΩΝ DRAWER
    const mValT = document.getElementById('drawer-val-t');
    const mValC = document.getElementById('drawer-val-c');
    if(mValT) mValT.innerText = (state.t > 0 ? "+" : "") + state.t;
    if(mValC) mValC.innerText = state.c;
}

function renderArea(elemId, text) { var container = document.getElementById(elemId); if (!container) return; container.innerHTML = ""; var lines = text.split('\n'); lines.forEach(line => { var row = document.createElement('div'); row.className = 'line-row'; if (line.indexOf('!') === -1) { row.innerHTML = `<span class="lyric">${line || "&nbsp;"}</span>`; } else { var parts = line.split('!'); if (parts[0]) row.appendChild(createToken("", parts[0])); for (var i = 1; i < parts.length; i++) { var m = parts[i].match(/^([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)\s?(.*)/); if (m) row.appendChild(createToken(getNote(m[1], state.t - state.c), m[3] || "")); else row.appendChild(createToken("", parts[i] || "")); } } container.appendChild(row); }); }
function createToken(c, l) { var d = document.createElement('div'); d.className = 'token'; d.innerHTML = `<span class="chord">${c || ""}</span><span class="lyric">${l || ""}</span>`; return d; }

// --- EDITOR ---
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
            document.getElementById('inpConductorNotes').value = s.conductorNotes || ""; // New
            
            // Personal Notes (Local)
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
    
    // Save Standard Data
    saveSong(); 

    // Save Personal Notes (Local Storage Only)
    if (currentSongId) {
        const pNote = document.getElementById('inpPersonalNotes').value;
        const map = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
        if (pNote.trim()) { map[currentSongId] = pNote.trim(); } else { delete map[currentSongId]; }
        localStorage.setItem('mnotes_personal_notes', JSON.stringify(map));
    }
    
    populateTags(); applyFilters(); 
}

function saveSong() {
    // Standard save logic wrapper
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

    // Rhythm Meta
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

// --- RECORDING (CLOUD) ---
async function toggleRecording() {
    const btn = document.getElementById('btnRecord');
    const timer = document.getElementById('recTimer');
    const preview = document.getElementById('audioPreview');
    const btnLink = document.getElementById('btnLinkRec');
    const downloadLink = document.getElementById('btnDownloadRec');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.classList.remove('recording-active');
        timer.style.color = "var(--text-muted)";
        clearInterval(recTimerInterval);
        if(preview) preview.style.display = 'block';
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
            const audioUrl = URL.createObjectURL(currentRecordedBlob);
            if(preview) preview.src = audioUrl;
            if(downloadLink) {
                downloadLink.href = audioUrl; downloadLink.download = `Rec_${Date.now()}.webm`; downloadLink.style.opacity = "1"; downloadLink.style.pointerEvents = "auto";
            }
            if (currentSongId && typeof currentUser !== 'undefined' && currentUser) { btnLink.style.display = 'inline-block'; }
        };

        mediaRecorder.start();
        btn.classList.add('recording-active'); btn.innerHTML = '<i class="fas fa-stop"></i>'; timer.style.color = "var(--danger)"; if(preview) preview.style.display = 'none';
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
    const origHtml = btnLink.innerHTML;
    btnLink.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btnLink.style.opacity = '0.7';
    
    if (!s.recordings) s.recordings = [];
    const takeNum = s.recordings.length + 1;
    const filename = `Song_${currentSongId}_Take${takeNum}_${Date.now()}.webm`;

    const cloudUrl = await uploadAudioToCloud(currentRecordedBlob, filename); // from supabase-client.js

    if (cloudUrl) {
        s.recordings.push({ url: cloudUrl, label: `Take ${takeNum}`, date: Date.now() });
        saveData(); showToast(`Take ${takeNum} Saved! ☁️`);
        btnLink.style.display = 'none'; renderPlayer(s);
    } else {
        btnLink.innerHTML = origHtml; btnLink.style.opacity = '1'; showToast("Upload Failed");
    }
}
/* ===========================================================
   PART 3: Rhythm (BoomBoom), UI Helpers, Mobile
   =========================================================== */

function deleteRecording(songId, index) {
    const s = library.find(x => x.id === songId); if (!s || !s.recordings) return;
    if (!confirm(`Delete "${s.recordings[index].label}"? Link removed only.`)) return;
    s.recordings.splice(index, 1); saveData(); renderPlayer(s); showToast("Take removed 🗑️");
}

// --- RHYTHM & BOOMBOOM GRID ---
function initRhythmUI() {
    const slider = document.getElementById('rngBpm');
    if(slider) { slider.addEventListener('input', function(e) { updateBpmUI(e.target.value); }); }
    const btn = document.getElementById('btnPlayRhythm');
    if(btn && typeof togglePlay === 'function') { btn.onclick = function() { togglePlay(); }; }
    
    // Initial Render
    renderRhythmGrid(16);
}

function updateBpmUI(val) {
    const disp = document.getElementById('dispBpm');
    const rng = document.getElementById('rngBpm');
    if(disp) disp.innerText = val;
    if(rng) rng.value = val;
    if(typeof updateBpm === 'function') updateBpm(val); // calls audio.js
}

function renderRhythmGrid(steps) {
    const container = document.getElementById('rhythm-grid');
    if(!container) return;
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
    container.style.gap = '2px';

    // 3 ROWS: Bass, Snare(Chord), HiHat(Alt)
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (row === 0) cell.classList.add('bass');
            if (row === 1) cell.classList.add('snare'); 
            if (row === 2) cell.classList.add('hihat'); 
            cell.dataset.row = row; cell.dataset.col = i;
            cell.onclick = function() { this.classList.toggle('active'); };
            container.appendChild(cell);
        }
    }
}

function updateGridSize() {
    const inp = document.getElementById('beatCount');
    if(inp) {
        let val = parseInt(inp.value);
        if(val < 4) val = 4; if(val > 64) val = 64;
        renderRhythmGrid(val);
        if(typeof AudioEngine !== 'undefined') { AudioEngine.beats = val / 4; }
    }
}

function clearGrid() { document.querySelectorAll('.cell.active').forEach(c => c.classList.remove('active')); }
function loadPreset(type) {
    clearGrid();
    if(type === 'zeibekiko') updateBpmUI(60);
    if(type === 'kalamatianos') updateBpmUI(120);
    if(type === 'chasapiko') updateBpmUI(80);
    if(type === 'tsifteteli') updateBpmUI(110);
    // Future: Set specific cells active
}

// --- NEW HELPERS (Sticky Notes, Side Recs) ---
function renderStickyNotes(s) {
    const stickyArea = document.getElementById('stickyNotesArea');
    const condText = document.getElementById('conductorNoteText');
    const persText = document.getElementById('personalNoteText');
    const personalNotesMap = JSON.parse(localStorage.getItem('mnotes_personal_notes') || '{}');
    const myNote = personalNotesMap[s.id] || "";

    if (s.conductorNotes || myNote) {
        stickyArea.style.display = 'block';
        if (s.conductorNotes) { condText.style.display = 'block'; condText.innerHTML = `<b><i class="fas fa-bullhorn"></i> Info:</b> ${s.conductorNotes}`; } else { condText.style.display = 'none'; }
        if (myNote) { persText.style.display = 'block'; persText.innerHTML = `<b><i class="fas fa-user-secret"></i> My Notes:</b> ${myNote}`; } else { persText.style.display = 'none'; }
    } else { stickyArea.style.display = 'none'; }
}

function renderSideRecordings(s) {
    const box = document.getElementById('sideRecordingsBox');
    const list = document.getElementById('sideRecList');
    if (!box || !list) return;

    if (s.audioRec && (!s.recordings || s.recordings.length === 0)) { s.recordings = [{ url: s.audioRec, label: "Original Rec", date: 0 }]; }
    if (!s.recordings || s.recordings.length === 0) { box.style.display = 'none'; return; }

    box.style.display = 'block'; list.innerHTML = "";
    s.recordings.forEach((rec, index) => {
        let timeStr = "";
        if (rec.date > 0) { const d = new Date(rec.date); timeStr = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`; }
        const div = document.createElement('div'); div.className = 'side-rec-item';
        div.innerHTML = `<div class="side-rec-meta"><span class="side-rec-label">${rec.label}</span><span>${timeStr}</span></div><audio controls src="${rec.url}" preload="none" style="width:100%; height:30px; margin-top:5px;"></audio><div style="text-align:right; margin-top:2px;"><button onclick="deleteRecording('${s.id}', ${index})" style="background:none; border:none; color:var(--danger); font-size:0.8rem; cursor:pointer;"><i class="fas fa-trash"></i> Delete</button></div>`;
        list.appendChild(div);
    });
}

// --- EVENTS & UTILS ---
function setupEvents() {
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) { fileInput.addEventListener('change', function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(ex) { try { const imported = JSON.parse(ex.target.result); processImportedData(imported); const modal = document.getElementById('importChoiceModal'); if(modal) modal.style.display = 'none'; } catch(err) { alert("Error reading file"); } }; reader.readAsText(file); fileInput.value = ''; }); }
    document.addEventListener('click', function(e) { var wrap = document.querySelector('.tag-wrapper'); var sugg = document.getElementById('tagSuggestions'); if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) { sugg.style.display = 'none'; } });
}

// Mobile Auto-Hide Nav
function switchMobileTab(tabName) {
    if (window.innerWidth > 1024) return;
    document.querySelectorAll('.tab-btn-mob').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.tab-btn-mob');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active'); if(tabName === 'stage' && btns[1]) btns[1].classList.add('active'); if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');
    
    var navCol = document.querySelector('.col-nav'); var stageCol = document.querySelector('.col-stage'); var toolsCol = document.querySelector('.col-tools');
    if(navCol) navCol.classList.remove('mobile-view-active'); if(stageCol) stageCol.classList.remove('mobile-view-active'); if(toolsCol) toolsCol.classList.remove('mobile-view-active');
    if(tabName === 'library' && navCol) navCol.classList.add('mobile-view-active'); if(tabName === 'stage' && stageCol) stageCol.classList.add('mobile-view-active'); if(tabName === 'tools' && toolsCol) toolsCol.classList.add('mobile-view-active');

    // Auto Hide Logic
    showMobileNav();
    if (tabName === 'stage') {
        if (navHideTimer) clearTimeout(navHideTimer);
        navHideTimer = setTimeout(() => { hideMobileNav(); }, 3000); 
    }
}
function hideMobileNav() { const nav = document.querySelector('.mobile-nav'); const trigger = document.getElementById('navTrigger'); if (nav) nav.classList.add('hidden'); if (trigger) trigger.style.display = 'block'; }
function showMobileNav() { const nav = document.querySelector('.mobile-nav'); const trigger = document.getElementById('navTrigger'); if (nav) nav.classList.remove('hidden'); if (trigger) trigger.style.display = 'none'; const stageBtn = document.querySelectorAll('.tab-btn-mob')[1]; if (stageBtn && stageBtn.classList.contains('active')) { if (navHideTimer) clearTimeout(navHideTimer); navHideTimer = setTimeout(() => { hideMobileNav(); }, 4000); } }

function filterByKey(e, key) { e.stopPropagation(); var inp = document.getElementById('searchInp'); if(inp) { inp.value = key; applyFilters(); showToast("Filter: " + key); } }
function toggleSetlistSong(e, id) { e.stopPropagation(); var i = liveSetlist.indexOf(id); if(i > -1) liveSetlist.splice(i,1); else liveSetlist.push(id); localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); renderSidebar(); }
function populateTags() { var ts = new Set(); library.forEach(s => { if(s.playlists) s.playlists.forEach(t => ts.add(t)); }); var sel = document.getElementById('tagFilter'); if(sel) { sel.innerHTML = `<option value="">ALL</option>`; sel.innerHTML += `<option value="__no_demo">No Demo</option>`; Array.from(ts).sort().forEach(t => { var o = document.createElement('option'); o.value = t; o.innerText = t; sel.appendChild(o); }); } }
function applyFilters() { renderSidebar(); }
function applySortAndRender() { var v = document.getElementById('sortFilter').value; userSettings.sortMethod = v; localStorage.setItem('mnotes_settings', JSON.stringify(userSettings)); sortLibrary(v); renderSidebar(); }
function switchSidebarTab(m) { viewMode = m; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.getElementById('tab-'+m).classList.add('active'); renderSidebar(); }
function handleTagInput(inp) { var val = inp.value.toLowerCase(); var sugg = document.getElementById('tagSuggestions'); if(!val && document.activeElement !== inp) { sugg.style.display = 'none'; return; } var allTags = new Set(); library.forEach(s => { if(s.playlists) s.playlists.forEach(t => allTags.add(t)); }); var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t)); sugg.innerHTML = ""; if(matches.length > 0) { matches.forEach(m => { var div = document.createElement('div'); div.className = 'tag-suggestion-item'; div.innerHTML = `<span>${m}</span>`; div.onclick = function(e) { addTag(m); }; sugg.appendChild(div); }); sugg.style.display = 'block'; } else { sugg.style.display = 'none'; } }
function handleTagKey(e) { if(e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); } else if (e.key === 'Backspace' && e.target.value === "" && editorTags.length > 0) { removeTag(editorTags[editorTags.length-1]); } }
function addTag(tag) { tag = tag.trim(); if(tag && !editorTags.includes(tag)) { editorTags.push(tag); renderTagChips(); } document.getElementById('tagInput').value = ""; document.getElementById('tagSuggestions').style.display = 'none'; }
function removeTag(tag) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); }
function renderTagChips() { var container = document.getElementById('tagChips'); if(!container) return; container.innerHTML = ""; editorTags.forEach(tag => { var span = document.createElement('span'); span.className = 'tag-chip'; span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')" style="cursor:pointer; margin-left:5px;"></i>`; container.appendChild(span); }); updateHiddenTagInput(); }
function updateHiddenTagInput() { var inp = document.getElementById('inpTags'); if(inp) inp.value = editorTags.join(','); }
function toggleLyricsMode() { isLyricsMode = !isLyricsMode; var btn = document.getElementById('btnLyrics'); if (isLyricsMode) { document.body.classList.add('lyrics-mode'); if(btn) btn.classList.add('lyrics-btn-active'); showToast(t('msg_lyrics_mode_on')); } else { document.body.classList.remove('lyrics-mode'); if(btn) btn.classList.remove('lyrics-btn-active'); showToast(t('msg_lyrics_mode_off')); } if(currentSongId) renderPlayer(library.find(x => x.id === currentSongId)); }
function autoCapo() { 
    if (!currentSongId) return; 
    var song = library.find(s => s.id === currentSongId); 
    if (!song) return; 
    
    var best = calculateOptimalCapo(song.key, song.body); 
    
    // Ετικέτα στο Drawer
    const lbl = document.getElementById('drawer-smart-capo-result');
    
    if (best === state.c) { 
        showToast(t('msg_capo_perfect')); 
        if(lbl) lbl.innerText = "✅ " + t('msg_capo_perfect');
    } else { 
        state.c = best; 
        renderPlayer(song); 
        showToast(t('msg_capo_found') + best); 
        if(lbl) lbl.innerText = "👌 " + t('msg_capo_found') + best;
    } 
}
function changeTranspose(n) { state.t += n; if (state.t > 6) state.t = 6; if (state.t < -6) state.t = -6; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }
function toggleAutoScroll() { var el = document.getElementById('scroll-container'); if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; el.style.borderLeft = "none"; } else { el.style.borderLeft = "3px solid var(--accent)"; var speed = userSettings.scrollSpeed || 50; scrollTimer = setInterval(function() { if (el.scrollTop + el.clientHeight >= el.scrollHeight) toggleAutoScroll(); else el.scrollTop += 1; }, speed); } }
function getYoutubeId(url) { if (!url) return null; var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/; var match = url.match(regExp); return (match && match[2].length === 11) ? match[2] : null; }
function showToast(msg) { var x = document.getElementById("toast"); if(x) { x.innerText = msg; x.className = "show"; setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000); } }
function openSettings() { document.getElementById('settingsModal').style.display = 'flex'; }
function saveSettings() { userSettings.scrollSpeed = parseInt(document.getElementById('setScroll').value); userSettings.maxCapo = parseInt(document.getElementById('setMaxCapo').value); userSettings.backupReminder = document.getElementById('setBackup').checked; userSettings.hideDemo = document.getElementById('setHideDemo').checked; userSettings.keepScreenOn = document.getElementById('setWakeLock').checked; userSettings.theme = document.getElementById('setTheme').value; if (userSettings.theme === 'theme-custom') { userSettings.customColors = { '--bg-main': document.getElementById('colBgMain').value, '--bg-panel': document.getElementById('colBgPanel').value, '--text-main': document.getElementById('colTextMain').value, '--accent': document.getElementById('colAccent').value, '--chord-color': document.getElementById('colChord').value }; } localStorage.setItem('mnotes_settings', JSON.stringify(userSettings)); applyTheme(); if(typeof requestWakeLock === 'function') requestWakeLock(); applyFilters(); document.getElementById('settingsModal').style.display = 'none'; showToast(t('msg_settings_saved')); }
function changeIntroSizeSettings(dir) { tempIntroScale += dir; updateIntroSizeDisplay(); }
function updateIntroSizeDisplay() { var pct = 100 + (tempIntroScale * 10); document.getElementById('dispIntroSize').innerText = pct + "%"; }
function toggleCustomColors(val) { document.getElementById('customColorArea').style.display = (val === 'theme-custom') ? 'block' : 'none'; }
function checkBackupReminder() { if (userSettings.backupReminder === false) return; const lastBackup = localStorage.getItem('mnotes_last_backup'); if (!lastBackup) { localStorage.setItem('mnotes_last_backup', Date.now()); return; } const now = Date.now(); if (now - parseInt(lastBackup) > 30 * 24 * 60 * 60 * 1000) { if (confirm(t('msg_backup_reminder'))) { exportJSON(); } else { localStorage.setItem('mnotes_last_backup', now); } } }
async function requestWakeLock() { if (!userSettings.keepScreenOn) { if (wakeLock !== null) { await wakeLock.release(); wakeLock = null; } return; } try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (err) { console.error(err); } } 
document.addEventListener('visibilitychange', async () => { if (wakeLock !== null && document.visibilityState === 'visible' && userSettings.keepScreenOn) await requestWakeLock(); });
function switchDrawerTab(tabName) {
    // Αν είμαστε σε PC, δεν κάνουμε τίποτα (οι στήλες είναι όλες ανοιχτές)
    if (window.innerWidth > 1024) return;

    // 1. UI Updates (Active Buttons στο Drawer)
    document.querySelectorAll('.drawer-btn').forEach(btn => btn.classList.remove('active'));
    
    // Επιλογή σωστού κουμπιού (απλή λογική index)
    const btns = document.querySelectorAll('.drawer-section .drawer-btn');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active'); 
    if(tabName === 'stage' && btns[1]) btns[1].classList.add('active'); 
    if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    // 2. Show/Hide Columns (ΜΟΝΟ ΓΙΑ MOBILE)
    var navCol = document.querySelector('.col-nav'); 
    var stageCol = document.querySelector('.col-stage'); 
    var toolsCol = document.querySelector('.col-tools');

    if(navCol) navCol.classList.remove('mobile-view-active'); 
    if(stageCol) stageCol.classList.remove('mobile-view-active'); 
    if(toolsCol) toolsCol.classList.remove('mobile-view-active');

    if(tabName === 'library' && navCol) navCol.classList.add('mobile-view-active'); 
    if(tabName === 'stage' && stageCol) stageCol.classList.add('mobile-view-active'); 
    if(tabName === 'tools' && toolsCol) toolsCol.classList.add('mobile-view-active');

    // 3. Εμφάνιση Controls στο Drawer
    const controlsDiv = document.getElementById('drawer-player-controls');
    if(controlsDiv) {
        controlsDiv.style.display = (tabName === 'stage') ? 'flex' : 'none';
    }

    // Κλείσιμο του Drawer
    toggleRightDrawer();
}
/* ===========================================================
   SMART DRAWER LOGIC (Swipe, Timer, Outside Click)
   =========================================================== */

function toggleRightDrawer() {
    const d = document.getElementById('rightDrawer');
    if(!d) return;
    
    const isOpen = d.classList.contains('open');
    
    if (isOpen) {
        // ΚΛΕΙΣΙΜΟ
        d.classList.remove('open');
        stopDrawerTimer();
        document.removeEventListener('click', closeDrawerOutside);
    } else {
        // ΑΝΟΙΓΜΑ
        d.classList.add('open');
        resetDrawerTimer(); // Ξεκινάει το χρονόμετρο 5s
        
        // Καθυστέρηση για να μην πιάσει το τρέχον κλικ ως "outside"
        setTimeout(() => { document.addEventListener('click', closeDrawerOutside); }, 100);
        
        // Ενεργοποίηση Swipe & Timer Reset
        setupDrawerListeners(d);
    }
}

// 1. Κλείσιμο με κλικ έξω
function closeDrawerOutside(e) {
    const d = document.getElementById('rightDrawer');
    const h = document.getElementById('drawerHandle');
    // Αν το κλικ ΔΕΝ είναι μέσα στο συρτάρι ΚΑΙ ΔΕΝ είναι στο χερούλι
    if (d && d.classList.contains('open') && !d.contains(e.target) && !h.contains(e.target)) {
        toggleRightDrawer();
    }
}

// 2. Χρονόμετρο 5 δευτερολέπτων
function resetDrawerTimer() {
    stopDrawerTimer();
    drawerIdleTimer = setTimeout(() => {
        const d = document.getElementById('rightDrawer');
        if (d && d.classList.contains('open')) {
            toggleRightDrawer(); // Κλείνει αυτόματα
            showToast("Drawer closed (inactive)");
        }
    }, 5000); // 5000ms = 5 δευτερόλεπτα
}

function stopDrawerTimer() {
    if (drawerIdleTimer) clearTimeout(drawerIdleTimer);
}

// 3. Swipe Gesture & Interaction Detection
function setupDrawerListeners(drawer) {
    let touchStartX = 0;
    let touchStartY = 0;

    // Όταν ακουμπάς το συρτάρι, μηδένισε το χρονόμετρο (είσαι ενεργός)
    drawer.ontouchstart = (e) => {
        resetDrawerTimer();
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    };
    
    drawer.onmousemove = () => { resetDrawerTimer(); };
    drawer.onclick = () => { resetDrawerTimer(); };

    // Έλεγχος Swipe κατά την άφεση
    drawer.ontouchend = (e) => {
        let touchEndX = e.changedTouches[0].screenX;
        let touchEndY = e.changedTouches[0].screenY;
        handleDrawerSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    };
}

function handleDrawerSwipe(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Αν η κίνηση είναι οριζόντια (περισσότερο από κάθετη) και προς τα δεξιά (θετικό diffX)
    if (Math.abs(diffX) > Math.abs(diffY) && diffX > 50) {
        toggleRightDrawer(); // Swipe Right -> Close
    }
    // Αν είναι προς τα πάνω και δεξιά (διαγώνια)
    else if (diffX > 30 && diffY < -30) {
        toggleRightDrawer(); 
    }
}
