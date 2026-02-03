/* =========================================
   UI & APP LOGIC (js/ui.js) - v10.0 FINAL
   ========================================= */

// --- 1. GLOBAL VARIABLES & SAFEGUARDS ---
if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;

var visiblePlaylist = [];
var sortableInstance = null;
var editorTags = [];
var scrollTimer = null;
var html5QrCodeScanner = null; // Για το QR Scanner
var liveSetlist = JSON.parse(localStorage.getItem('mnotes_setlist')) || [];
var viewMode = 'library'; 
var isLyricsMode = false; 
var wakeLock = null; 
var newlyImportedIds = []; 

// Default Settings
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50,
    maxCapo: 12,
    backupReminder: true,
    hideDemo: false,
    theme: 'theme-dark',
    introScale: 0,
    keepScreenOn: false,
    sortMethod: 'alpha',
    customColors: { 
        '--bg-main': '#000000', 
        '--bg-panel': '#222222', 
        '--text-main': '#ffffff', 
        '--accent': '#00ff00', 
        '--chord-color': '#ffff00' 
    }
};
var tempIntroScale = 0; 

// --- 2. INITIALIZATION ---
window.addEventListener('load', function() {
    console.log("🚀 mNotes Pro Initializing...");
    
    applyTheme(); 
    applyTranslations(); 
    loadLibrary();     // Φορτώνει τα τραγούδια
    setupEvents();     // Συνδέει τα κουμπιά
    setupGestures();   // Zoom με δάχτυλα
    checkBackupReminder();
    initResizers();    // Ενεργοποιεί τα διαχωριστικά στηλών
    
    // Mobile Check: Αν είναι κινητό, πάνε στη καρτέλα Library
    if (window.innerWidth <= 768) {
        if(typeof switchMobileTab === 'function') switchMobileTab('library');
    }
});

// --- 3. THEME & TRANSLATIONS ---
function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations();
    renderSidebar(); 
    populateTags(); 
    if(currentSongId && currentSongId.includes('demo')) loadSong(currentSongId);
}

function applyTranslations() {
    if(typeof TRANSLATIONS === 'undefined') return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        var key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[currentLang][key]) el.innerText = TRANSLATIONS[currentLang][key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        var key = el.getAttribute('data-i18n-ph');
        if (TRANSLATIONS[currentLang][key]) el.placeholder = TRANSLATIONS[currentLang][key];
    });
    var btn = document.getElementById('btnLang');
    if(btn) btn.innerHTML = (currentLang === 'en') ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> EL';
}

function applyTheme() {
    document.body.className = userSettings.theme;
    var root = document.documentElement;
    if (userSettings.theme === 'theme-custom' && userSettings.customColors) {
        for (var key in userSettings.customColors) {
            root.style.setProperty(key, userSettings.customColors[key]);
        }
    } else {
        ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => root.style.removeProperty(k));
    }
    var newSize = 1.1 + ((userSettings.introScale || 0) * 0.11);
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem");
}

// --- 4. LIBRARY MANAGEMENT ---
function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    // Load Demo if empty
    var demoExists = library.some(s => s.id && s.id.includes("demo"));
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        library.unshift(JSON.parse(JSON.stringify(DEFAULT_DATA[0]))); 
        saveData();
    }
    
    library = library.map(ensureSongStructure); // From logic.js
    liveSetlist = liveSetlist.filter(id => library.some(s => s.id === id));
    
    populateTags(); 
    
    // Sort
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    
    // UI Updates
    const sortDropdown = document.getElementById('sortFilter');
    if (sortDropdown) sortDropdown.value = userSettings.sortMethod || 'alpha';
    
    renderSidebar();
    
    // Load first song
    if (library.length > 0) {
        if (userSettings.hideDemo && library.length > 1) {
             var firstReal = library.find(s => !s.id.includes('demo'));
             currentSongId = firstReal ? firstReal.id : library[0].id;
        } else {
             if(!currentSongId) currentSongId = library[0].id;
        }
        loadSong(currentSongId);
    } else { 
        createNewSong(); 
    }
}

function clearLibrary() {
    if(confirm(t('msg_clear_confirm'))) {
        library = [ensureSongStructure(JSON.parse(JSON.stringify(DEFAULT_DATA[0])))];
        liveSetlist = [];
        localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
        saveData(); 
        document.getElementById('searchInp').value = "";
        applyFilters();
        loadSong(library[0].id);
    }
}

// --- 5. SIDEBAR RENDERING (BOLD TITLE / KEY BUTTON) ---
function renderSidebar() {
    var list = document.getElementById('songList'); 
    if(!list) return;
    list.innerHTML = ""; 
    visiblePlaylist = [];
    
    // Filter Logic
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => { var s = library.find(x => x.id === id); if (s) visiblePlaylist.push(s); });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            if (userSettings.hideDemo && s.id.includes("demo") && library.length > 1) return false;
            
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) ||
                           (s.key && s.key.toLowerCase() === txt); // Key Filter support
            
            var matchTag = (tag === "__no_demo") ? !s.id.includes("demo") : (tag === "" || (s.playlists && s.playlists.includes(tag)));
            
            return matchTxt && matchTag;
        });
    }
    
    const countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;
    
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        if (newlyImportedIds.includes(s.id)) itemClass += ' new-import';
        
        li.className = itemClass;
        li.setAttribute('data-id', s.id);
        
        // Click Event (Load Song)
        li.onclick = (e) => { 
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-btn')) return; 
            loadSong(s.id); 
        };
        
        var displayTitle = (s.id.includes('demo')) ? t('demo_title') : s.title;
        var displayKey = s.key || "-";
        
        // Icon (Setlist status)
        var actionIcon = "far fa-circle";
        if (viewMode === 'setlist') actionIcon = "fas fa-minus-circle";
        else if (liveSetlist.includes(s.id)) actionIcon = "fas fa-check-circle in-setlist";
        
        // HTML Structure
        li.innerHTML = `
            <i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>
            <div class="song-info">
                <div class="song-title">${displayTitle}</div>
                <div class="song-artist">${s.artist || "-"}</div>
                <div class="song-meta-row">
                    <div class="song-key-btn" onclick="filterByKey(event, '${displayKey}')">${displayKey}</div>
                </div>
            </div>
            ${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}
        `;
        list.appendChild(li);
    });
    
    // Sortable JS (Drag & Drop)
    if (sortableInstance) sortableInstance.destroy();
    if(typeof Sortable !== 'undefined') {
        sortableInstance = new Sortable(list, {
            animation: 150, 
            handle: '.song-handle', 
            disabled: (viewMode !== 'setlist'),
            onEnd: function (evt) { 
                if (viewMode === 'setlist') { 
                    var movedId = liveSetlist.splice(evt.oldIndex, 1)[0]; 
                    liveSetlist.splice(evt.newIndex, 0, movedId); 
                    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
                } 
            }
        });
    }
}

// --- 6. PLAYER LOGIC ---
function loadSong(id) {
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll(); 
    
    currentSongId = id; 
    var s = library.find(x => x.id === id); if(!s) return;
    
    // Reset Player State
    state.t = 0; state.c = 0; 
    parseSongLogic(s); // From logic.js
    renderPlayer(s);
    
    // Rhythm Loading (Audio Engine)
    if (s.rhythm && s.rhythm.style && typeof loadPreset === 'function') {
        loadPreset(s.rhythm.style);
        if(s.rhythm.bpm && typeof updateBpm === 'function') {
            updateBpm(s.rhythm.bpm);
            const rng = document.getElementById('rngBpm');
            if(rng) rng.value = s.rhythm.bpm;
        }
    }

    // Switch View
    document.getElementById('view-player').classList.add('active-view');
    document.getElementById('view-editor').classList.remove('active-view');
    
    // Highlight in List
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); 
    if(activeItem) activeItem.classList.add('active');
    
    if(typeof requestWakeLock === 'function') requestWakeLock();

    // Mobile Auto-Switch
    if (window.innerWidth <= 768 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }
}

function renderPlayer(s) {
    if (!s) return;

    // Header
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) {
        headerContainer.innerHTML = `
        <div class="player-header">
            <h1 id="p-title" class="song-h1">${s.title}</h1>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span class="meta-label">${s.artist || ""}</span>
                <span class="key-badge">${getNote(s.key || "-", state.t)}</span>
            </div>
        </div>`;
    }

    // Transpose Values
    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;

    // Lyrics
    var split = splitSongBody(s.body || ""); // From logic.js
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);

    // Video Embed
    var oldVideo = document.getElementById('video-embed-container');
    if (oldVideo) oldVideo.remove();
    var oldTitle = document.querySelector('.video-title-separator');
    if (oldTitle) oldTitle.remove();

    if (s.video) {
        var ytId = getYoutubeId(s.video);
        if (ytId) {
            var scrollCont = document.getElementById('scroll-container');
            if (scrollCont) {
                var titleDiv = document.createElement('div');
                titleDiv.className = 'video-title-separator desktop-only-video';
                titleDiv.style.marginTop = "30px";
                titleDiv.style.borderTop = "1px solid #333";
                titleDiv.style.paddingTop = "10px";
                titleDiv.style.color = "#888";
                titleDiv.style.fontSize = "0.9rem";
                titleDiv.innerHTML = '<i class="fab fa-youtube"></i> Reference Video';
                scrollCont.appendChild(titleDiv);

                var vidContainer = document.createElement('div');
                vidContainer.id = 'video-embed-container';
                vidContainer.className = 'video-responsive desktop-only-video'; 
                vidContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen></iframe>`;
                scrollCont.appendChild(vidContainer);
            }
        }
    }
}

function renderArea(elemId, text) {
    var container = document.getElementById(elemId); 
    if (!container) return;
    container.innerHTML = "";
    
    var lines = text.split('\n');
    lines.forEach(line => {
        var row = document.createElement('div'); 
        row.className = 'line-row';
        if (line.indexOf('!') === -1) { 
            row.innerHTML = `<span class="lyric">${line || "&nbsp;"}</span>`; 
        } else {
            var parts = line.split('!');
            if (parts[0]) row.appendChild(createToken("", parts[0]));
            for (var i = 1; i < parts.length; i++) {
                var m = parts[i].match(/^([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)\s?(.*)/);
                if (m) row.appendChild(createToken(getNote(m[1], state.t - state.c), m[3] || ""));
                else row.appendChild(createToken("", parts[i] || ""));
            }
        }
        container.appendChild(row);
    });
}

function createToken(c, l) { 
    var d = document.createElement('div'); 
    d.className = 'token'; 
    d.innerHTML = `<span class="chord">${c || ""}</span><span class="lyric">${l || ""}</span>`; 
    return d; 
}

// --- 7. EDITOR LOGIC ---
function switchToEditor() {
    document.getElementById('view-player').classList.remove('active-view');
    document.getElementById('view-editor').classList.add('active-view');
    
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            document.getElementById('inpTitle').value = s.title || "";
            document.getElementById('inpArtist').value = s.artist || ""; 
            if(document.getElementById('inpVideo')) document.getElementById('inpVideo').value = s.video || "";
            document.getElementById('inpKey').value = s.key || "";
            document.getElementById('inpBody').value = s.body || ""; 
            document.getElementById('inpIntro').value = s.intro || "";
            document.getElementById('inpInter').value = s.interlude || "";
            document.getElementById('inpNotes').value = s.notes || "";
            editorTags = s.playlists ? [...s.playlists] : [];
            if(typeof renderTagChips === 'function') renderTagChips();
        }
    } else { createNewSong(); }
}

function saveEdit() { 
    let bodyArea = document.getElementById('inpBody');
    if (bodyArea) bodyArea.value = fixTrailingChords(bodyArea.value);
    saveSong(); // From logic.js
    populateTags(); 
    applyFilters(); 
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
    currentSongId = null; 
    document.querySelectorAll('.inp').forEach(e => e.value = ""); 
    editorTags = []; 
    if(typeof renderTagChips === 'function') renderTagChips(); 
    
    document.getElementById('view-player').classList.remove('active-view'); 
    document.getElementById('view-editor').classList.add('active-view'); 
}

function exitEditor() { 
    if (currentSongId) loadSong(currentSongId); 
    else if (library.length > 0) loadSong(library[0].id); 
}

function deleteCurrentSong() {
    if(!currentSongId) return;
    if(confirm(t('msg_delete_confirm') || "Delete this song?")) {
        library = library.filter(s => s.id !== currentSongId);
        liveSetlist = liveSetlist.filter(id => id !== currentSongId);
        localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
        saveData();
        populateTags();
        applyFilters();
        if(library.length > 0) loadSong(library[0].id);
        else createNewSong();
        showToast("Song Deleted 🗑️");
    }
}

// --- 8. EVENTS & LISTENERS ---
function setupEvents() {
    // Menu
    var btnMenu = document.getElementById('btnMenu');
    if (btnMenu) btnMenu.onclick = toggleSidebar;

    // File Import
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ex) {
                try {
                    const imported = JSON.parse(ex.target.result);
                    processImportedData(imported);
                    const modal = document.getElementById('importChoiceModal');
                    if(modal) modal.style.display = 'none';
                } catch(err) { alert("Error reading file"); }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    // Close Tag Suggestions
    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.tag-wrapper');
        var sugg = document.getElementById('tagSuggestions');
        if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) { sugg.style.display = 'none'; }
    });

    // Audio Engine Hooks
    const btnPlay = document.getElementById('btnPlayRhythm');
    if(btnPlay && typeof togglePlay === 'function') btnPlay.onclick = togglePlay;

    const rngBpm = document.getElementById('rngBpm');
    if(rngBpm && typeof updateBpm === 'function') rngBpm.oninput = function(e) { updateBpm(e.target.value); };

    const selRhythm = document.getElementById('selRhythm');
    if(selRhythm && typeof loadPreset === 'function') selRhythm.onchange = function(e) { loadPreset(e.target.value); };
}

// --- 9. RESIZERS (NEW) ---
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
        if(newWidth < 200) newWidth = 200; if(newWidth > 500) newWidth = 500;
        d.documentElement.style.setProperty('--nav-width', newWidth + 'px');
    }
    
    function onMouseMoveRight(e) {
        let newWidth = window.innerWidth - e.clientX;
        if(newWidth < 250) newWidth = 250; if(newWidth > 600) newWidth = 600;
        d.documentElement.style.setProperty('--tools-width', newWidth + 'px');
    }

    function onMouseUpLeft() { d.removeEventListener('mousemove', onMouseMoveLeft); d.removeEventListener('mouseup', onMouseUpLeft); }
    function onMouseUpRight() { d.removeEventListener('mousemove', onMouseMoveRight); d.removeEventListener('mouseup', onMouseUpRight); }
}

// --- 10. IMPORT / EXPORT FUNCTIONS ---
function selectImport(type) {
    const modal = document.getElementById('importChoiceModal');
    if(modal) modal.style.display = 'none';

    if(type === 'file') {
        const fi = document.getElementById('hiddenFileInput'); if(fi) fi.click();
    } else if(type === 'qr') {
        startScanner();
    } else if(type === 'url') {
        importFromURL();
    }
}

async function importFromURL() {
    const url = prompt(t('ph_url_import') || "Enter URL:");
    if (!url) return;
    try {
        const res = await fetch(url);
        if(!res.ok) throw new Error("Network Error");
        const data = await res.json();
        processImportedData(data);
    } catch (err) { alert("Import Failed: " + err.message); }
}

function processImportedData(data) {
    if (data && data.type === "mnotes_setlist") { 
        if (confirm("Import Setlist?")) { 
            liveSetlist = data.data; 
            localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
            renderSidebar(); 
            showToast("Setlist Updated ✅"); 
        } 
        return; 
    }
    
    const songs = Array.isArray(data) ? data : [data];
    let added = 0, updated = 0;
    newlyImportedIds = [];

    songs.forEach(s => { 
        if (s.body) s.body = s.body.replace(/\[/g, '!').replace(/\]/g, ''); 
        const imported = ensureSongStructure(s); 
        const idx = library.findIndex(x => x.id === imported.id); 
        
        if (idx !== -1) { 
            if (imported.updatedAt > library[idx].updatedAt) {
                library[idx] = imported; updated++; newlyImportedIds.push(imported.id);
            }
        } else { 
            library.push(imported); added++; newlyImportedIds.push(imported.id);
        } 
    });
    
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    saveData(); populateTags(); applyFilters(); 
    showToast(`Import: ${added} New, ${updated} Upd`);
}

function startScanner() {
    const m = document.getElementById('scanModal'); if(m) m.style.display='flex';
    if(html5QrCodeScanner) html5QrCodeScanner.clear().catch(e=>{});
    
    try {
        const scanner = new Html5Qrcode("reader");
        html5QrCodeScanner = scanner;
        scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
        (txt) => { 
            scanner.stop().then(() => { 
                if(m) m.style.display='none'; 
                try { processImportedData(JSON.parse(txt)); } catch(e){ alert("Invalid QR"); } 
            }); 
        }, 
        (err) => {}).catch(e => { alert("Cam Error: "+e); if(m) m.style.display='none'; });
    } catch(e) { alert("QR Lib missing"); }
}

function closeScan() {
    if(html5QrCodeScanner) html5QrCodeScanner.stop().then(()=>document.getElementById('scanModal').style.display='none').catch(e=>document.getElementById('scanModal').style.display='none');
    else document.getElementById('scanModal').style.display='none';
}

function exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(library));
    const a = document.createElement('a');
    a.href = dataStr; a.download = "mnotes_backup_" + Date.now() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
}

function exportSetlist() {
    if(liveSetlist.length===0) { showToast("Empty Setlist"); return; }
    const pkg = { type: "mnotes_setlist", data: liveSetlist };
    generateQRInternal(JSON.stringify(pkg));
}

function generateQRFromEditor() {
    const temp = { 
        id: currentSongId || "temp_"+Date.now(),
        title: document.getElementById('inpTitle').value, 
        artist: document.getElementById('inpArtist').value, 
        key: document.getElementById('inpKey').value, 
        body: document.getElementById('inpBody').value, 
        updatedAt: Date.now()
    };
    generateQRInternal(JSON.stringify(temp));
}

function generateQRInternal(str) {
    const div = document.getElementById('qr-output');
    if(!div) return;
    div.innerHTML = "";
    try {
        const qr = qrcode(0, 'M');
        qr.addData(unescape(encodeURIComponent(str)));
        qr.make();
        div.innerHTML = qr.createImgTag(5);
        document.getElementById('qrModal').style.display='flex';
    } catch(e) { alert("QR Error"); }
}

// --- 11. HELPER & UTILS ---
function toggleLyricsMode() {
    isLyricsMode = !isLyricsMode; var btn = document.getElementById('btnLyrics');
    if (isLyricsMode) {
        document.body.classList.add('lyrics-mode'); if(btn) btn.classList.add('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_on')); 
    } else {
        document.body.classList.remove('lyrics-mode'); if(btn) btn.classList.remove('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_off')); 
    }
    if(currentSongId) renderPlayer(library.find(x => x.id === currentSongId));
}

function autoCapo() {
    if (!currentSongId) return; var song = library.find(s => s.id === currentSongId); if (!song) return;
    var best = calculateOptimalCapo(song.key, song.body); // logic.js
    if (best === state.c) { showToast(t('msg_capo_perfect')); } else { state.c = best; renderPlayer(song); showToast(t('msg_capo_found') + best); }
}

function changeTranspose(n) { state.t += n; if (state.t > 6) state.t = 6; if (state.t < -6) state.t = -6; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function toggleAutoScroll() {
    var el = document.getElementById('scroll-container');
    if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; el.style.borderLeft = "none"; } 
    else {
        el.style.borderLeft = "3px solid var(--accent)";
        var speed = userSettings.scrollSpeed || 50; 
        scrollTimer = setInterval(function() { if (el.scrollTop + el.clientHeight >= el.scrollHeight) toggleAutoScroll(); else el.scrollTop += 1; }, speed);
    }
}

function getYoutubeId(url) {
    if (!url) return null;
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function showToast(msg) { 
    var x = document.getElementById("toast"); 
    if(x) { x.innerText = msg; x.className = "show"; setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000); } 
}

function openSettings() { document.getElementById('settingsModal').style.display = 'flex'; }

function saveSettings() {
    userSettings.scrollSpeed = parseInt(document.getElementById('setScroll').value);
    userSettings.maxCapo = parseInt(document.getElementById('setMaxCapo').value);
    userSettings.backupReminder = document.getElementById('setBackup').checked;
    userSettings.hideDemo = document.getElementById('setHideDemo').checked;
    userSettings.keepScreenOn = document.getElementById('setWakeLock').checked;
    userSettings.theme = document.getElementById('setTheme').value;
    userSettings.introScale = tempIntroScale;
    
    if (userSettings.theme === 'theme-custom') {
        userSettings.customColors = {
            '--bg-main': document.getElementById('colBgMain').value,
            '--bg-panel': document.getElementById('colBgPanel').value,
            '--text-main': document.getElementById('colTextMain').value,
            '--accent': document.getElementById('colAccent').value,
            '--chord-color': document.getElementById('colChord').value
        };
    }
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    applyTheme(); 
    if(typeof requestWakeLock === 'function') requestWakeLock();
    applyFilters(); 
    document.getElementById('settingsModal').style.display = 'none';
    showToast(t('msg_settings_saved'));
}

function changeIntroSizeSettings(dir) { tempIntroScale += dir; updateIntroSizeDisplay(); }
function updateIntroSizeDisplay() { var pct = 100 + (tempIntroScale * 10); document.getElementById('dispIntroSize').innerText = pct + "%"; }
function toggleCustomColors(val) { document.getElementById('customColorArea').style.display = (val === 'theme-custom') ? 'block' : 'none'; }
function checkBackupReminder() {
    if (userSettings.backupReminder === false) return; 
    const lastBackup = localStorage.getItem('mnotes_last_backup');
    if (!lastBackup) { localStorage.setItem('mnotes_last_backup', Date.now()); return; }
    const now = Date.now();
    if (now - parseInt(lastBackup) > 30 * 24 * 60 * 60 * 1000) {
        if (confirm(t('msg_backup_reminder'))) { exportJSON(); } 
        else { localStorage.setItem('mnotes_last_backup', now); }
    }
}
async function requestWakeLock() {
    if (!userSettings.keepScreenOn) { if (wakeLock !== null) { await wakeLock.release(); wakeLock = null; } return; }
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (err) { console.error(err); }
} 
document.addEventListener('visibilitychange', async () => { if (wakeLock !== null && document.visibilityState === 'visible' && userSettings.keepScreenOn) await requestWakeLock(); });

function switchMobileTab(tabName) {
    if (window.innerWidth > 768) return;
    document.querySelectorAll('.tab-btn-mob').forEach(btn => btn.classList.remove('active'));
    
    const btns = document.querySelectorAll('.tab-btn-mob');
    if(tabName === 'library' && btns[0]) btns[0].classList.add('active');
    if(tabName === 'stage' && btns[1]) btns[1].classList.add('active');
    if(tabName === 'tools' && btns[2]) btns[2].classList.add('active');

    var navCol = document.querySelector('.col-nav');
    var stageCol = document.querySelector('.col-stage');
    var toolsCol = document.querySelector('.col-tools');
    
    if(navCol) navCol.classList.remove('mobile-view-active');
    if(stageCol) stageCol.classList.remove('mobile-view-active');
    if(toolsCol) toolsCol.classList.remove('mobile-view-active');

    if(tabName === 'library' && navCol) navCol.classList.add('mobile-view-active');
    if(tabName === 'stage' && stageCol) stageCol.classList.add('mobile-view-active');
    if(tabName === 'tools' && toolsCol) toolsCol.classList.add('mobile-view-active');
}

function filterByKey(e, key) { 
    e.stopPropagation(); 
    var inp = document.getElementById('searchInp'); 
    if(inp) { 
        inp.value = key; 
        applyFilters(); 
        showToast("Filter: " + key); 
    } 
}

function toggleSetlistSong(e, id) { 
    e.stopPropagation(); 
    var i = liveSetlist.indexOf(id); 
    if(i > -1) liveSetlist.splice(i,1); 
    else liveSetlist.push(id); 
    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
    renderSidebar(); 
}

function populateTags() { 
    var ts = new Set(); 
    library.forEach(s => { 
        if(s.playlists) s.playlists.forEach(t => ts.add(t)); 
    }); 
    var sel = document.getElementById('tagFilter'); 
    if(sel) { 
        sel.innerHTML = `<option value="">ALL</option>`; 
        sel.innerHTML += `<option value="__no_demo">No Demo</option>`;
        Array.from(ts).sort().forEach(t => { 
            var o = document.createElement('option'); 
            o.value = t; 
            o.innerText = t; 
            sel.appendChild(o); 
        }); 
    } 
}

function applyFilters() { renderSidebar(); }
function applySortAndRender() { var v = document.getElementById('sortFilter').value; userSettings.sortMethod = v; localStorage.setItem('mnotes_settings', JSON.stringify(userSettings)); sortLibrary(v); renderSidebar(); }
function switchSidebarTab(m) { viewMode = m; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.getElementById('tab-'+m).classList.add('active'); renderSidebar(); }

// TAG INPUT HANDLERS
function handleTagInput(inp) {
    var val = inp.value.toLowerCase(); var sugg = document.getElementById('tagSuggestions'); 
    if(!val && document.activeElement !== inp) { sugg.style.display = 'none'; return; }
    
    var allTags = new Set(); library.forEach(s => { if(s.playlists) s.playlists.forEach(t => allTags.add(t)); });
    var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t));
    
    sugg.innerHTML = "";
    if(matches.length > 0) { 
        matches.forEach(m => { 
            var div = document.createElement('div'); 
            div.className = 'tag-suggestion-item'; 
            div.innerHTML = `<span>${m}</span>`; 
            div.onclick = function(e) { addTag(m); }; 
            sugg.appendChild(div); 
        }); 
        sugg.style.display = 'block'; 
    } else { sugg.style.display = 'none'; }
}

function handleTagKey(e) { 
    if(e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); } 
    else if (e.key === 'Backspace' && e.target.value === "" && editorTags.length > 0) { removeTag(editorTags[editorTags.length-1]); } 
}

function addTag(tag) { 
    tag = tag.trim(); 
    if(tag && !editorTags.includes(tag)) { editorTags.push(tag); renderTagChips(); } 
    document.getElementById('tagInput').value = ""; 
    document.getElementById('tagSuggestions').style.display = 'none'; 
}

function removeTag(tag) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); }

function renderTagChips() { 
    var container = document.getElementById('tagChips'); if(!container) return; 
    container.innerHTML = ""; 
    editorTags.forEach(tag => { 
        var span = document.createElement('span'); 
        span.className = 'tag-chip'; 
        span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')" style="cursor:pointer; margin-left:5px;"></i>`; 
        container.appendChild(span); 
    }); 
    updateHiddenTagInput(); 
}

function updateHiddenTagInput() { var inp = document.getElementById('inpTags'); if(inp) inp.value = editorTags.join(','); }

function setupGestures() {
    var area = document.getElementById('mainZone'); var startDist = 0; var startSize = 1.3;
    if(area) {
        area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true});
        area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true});
    }
}
/* =========================================
   AUDIO RECORDER & UPLOAD LOGIC
   ========================================= */

let mediaRecorder = null;
let audioChunks = [];
let recTimerInterval = null;
let recStartTime = 0;

async function toggleRecording() {
    const btn = document.getElementById('btnRecord');
    const timer = document.getElementById('recTimer');
    const downloadLink = document.getElementById('btnDownloadRec');
    const audioPlayer = document.getElementById('audioPreview');

    // --- STOP RECORDING ---
    if (btn.classList.contains('recording-active')) {
        if(mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        btn.classList.remove('recording-active');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        timer.style.color = "var(--text-muted)";
        clearInterval(recTimerInterval);
        return;
    }

    // --- START RECORDING ---
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };

        // Όταν σταματήσει η εγγραφή...
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Τοπική προεπισκόπηση
            audioPlayer.src = audioUrl;
            audioPlayer.style.display = 'block';
            
            const date = new Date();
            const filename = `Rec_${date.getTime()}.webm`;

            // Αν υπάρχει το Supabase client και ο χρήστης είναι συνδεδεμένος
            if (typeof uploadAudioToCloud === 'function' && typeof currentUser !== 'undefined' && currentUser) {
                
                // Ανέβασμα στο Cloud
                const cloudUrl = await uploadAudioToCloud(audioBlob, filename);
                
                if (cloudUrl) {
                    downloadLink.href = cloudUrl;
                    downloadLink.innerHTML = '<i class="fas fa-check"></i>'; // Επιτυχία
                    downloadLink.style.opacity = "1";
                    downloadLink.style.pointerEvents = "auto";
                }
            } else {
                // Αν δεν είναι συνδεδεμένος -> Απλό κατέβασμα
                downloadLink.href = audioUrl;
                downloadLink.setAttribute("download", filename);
                downloadLink.innerHTML = '<i class="fas fa-download"></i>';
                downloadLink.style.opacity = "1";
                downloadLink.style.pointerEvents = "auto";
                
                if(!currentUser) showToast("Saved Locally (Login to Upload)");
            }
        };

        mediaRecorder.start();

        // UI Updates για την εγγραφή
        btn.classList.add('recording-active');
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        timer.style.color = "var(--danger)";
        audioPlayer.style.display = 'none';
        downloadLink.style.opacity = "0.3";
        downloadLink.style.pointerEvents = "none";
        
        recStartTime = Date.now();
        recTimerInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - recStartTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2,'0');
            const s = (diff % 60).toString().padStart(2,'0');
            timer.innerText = `${m}:${s}`;
        }, 1000);

    } catch (err) {
        alert("Microphone Error: " + err.message);
    }
}
/* =========================================
   RHYTHM GRID LOGIC (Dynamic Steps)
   ========================================= */

function updateGridSize() {
    const container = document.getElementById('rhythm-grid');
    const stepsInput = document.getElementById('beatCount');
    
    if(!container || !stepsInput) return;

    // Παίρνουμε την τιμή ή βάζουμε 16 αν είναι κενό
    let steps = parseInt(stepsInput.value) || 16;
    
    // Όρια ασφαλείας (ελάχιστο 4, μέγιστο 64)
    if (steps < 4) steps = 4;
    if (steps > 64) steps = 64; 
    stepsInput.value = steps; // Ενημέρωση του input αν άλλαξε

    // Καθαρισμός του παλιού grid
    container.innerHTML = "";
    
    // Ρύθμιση CSS Grid:
    // repeat(steps, ...) -> Τόσες στήλες όσα τα βήματα
    // minmax(20px, 1fr) -> Κάθε κουτάκι τουλάχιστον 20px πλάτος
    container.style.gridTemplateColumns = `repeat(${steps}, minmax(20px, 1fr))`;

    // Δημιουργία Κουτιών (3 Γραμμές: Bass, Snare, HiHat)
    ['bass', 'snare', 'hihat'].forEach(instr => {
        for (let i = 0; i < steps; i++) {
            const cell = document.createElement('div');
            cell.className = `cell ${instr}`;
            
            // Κάθε 4ο κουτί έχει λίγο περιθώριο αριστερά (για να ξεχωρίζουν τα μέτρα)
            if (i > 0 && i % 4 === 0) {
                cell.style.marginLeft = "3px";
            }
            
            // Όταν πατάς κλικ, γίνεται active (ανάβει)
            cell.onclick = function() { this.classList.toggle('active'); };
            
            container.appendChild(cell);
        }
    });
}

function clearGrid() {
    // Σβήνει όλα τα ενεργά κελιά
    document.querySelectorAll('.cell.active').forEach(c => c.classList.remove('active'));
}

// Αρχικοποίηση του Grid όταν φορτώνει η σελίδα
window.addEventListener('load', function() {
    // ... υπάρχων κώδικας load ...
    
    // Πρόσθεσε αυτό στο τέλος της window load:
    if(typeof updateGridSize === 'function') updateGridSize();
});
