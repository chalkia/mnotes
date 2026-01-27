/* =========================================
   UI & APP LOGIC (js/ui.js) - v5 FINAL
   ========================================= */

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

// --- SETTINGS DEFAULT ---
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50,
    maxCapo: 12,
    backupReminder: true,
    hideDemo: false, // NEW: Hide Demo
    theme: 'theme-dark',
    introScale: 0, // 0 = 100%, 1 = 110%, -1 = 90%
    customColors: { // Default Custom Colors
        '--bg-main': '#000000',
        '--bg-panel': '#222222',
        '--text-main': '#ffffff',
        '--accent': '#00ff00',
        '--chord-color': '#ffff00'
    }
};

// Temp variable for settings modal
var tempIntroScale = 0; 

window.addEventListener('load', function() {
    applyTheme(); // Apply theme logic immediately
    applyTranslations(); 
    loadLibrary();
    setupEvents();
    setupGestures();
    checkBackupReminder();
});

function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations();
    renderSidebar(); populateTags(); 
    if(currentSongId === 'demo_instruction') loadSong(currentSongId);
}

function applyTranslations() {
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

// --- THEME & FONT SIZE LOGIC ---
function applyTheme() {
    // 1. Apply Class
    document.body.className = userSettings.theme;

    // 2. Custom Colors Logic
    var root = document.documentElement;
    if (userSettings.theme === 'theme-custom' && userSettings.customColors) {
        for (var key in userSettings.customColors) {
            root.style.setProperty(key, userSettings.customColors[key]);
        }
    } else {
        // Clean up inline styles if switching away from custom
        ['--bg-main','--bg-panel','--text-main','--accent','--chord-color'].forEach(k => {
            root.style.removeProperty(k);
        });
    }

    // 3. Apply Intro Font Size
    // Base is 1.1rem. Each step is 10% (0.11rem)
    var scale = userSettings.introScale || 0;
    var newSize = 1.1 + (scale * 0.11);
    // Limit min/max reasonable size
    if (newSize < 0.5) newSize = 0.5; 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem");
}

function cycleTheme() {
    var b = document.body;
    if (b.classList.contains('theme-dark')) userSettings.theme = 'theme-slate';
    else if (b.classList.contains('theme-slate')) userSettings.theme = 'theme-light';
    else userSettings.theme = 'theme-dark';
    
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    applyTheme();
}

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    var demoExists = library.some(s => s.id === "demo_instruction" || (s.id && s.id.includes("demo")));
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        // Note: Demo text now comes directly from DEFAULT_DATA
        library.unshift(demo); saveData();
    }
    library = library.map(ensureSongStructure);
    liveSetlist = liveSetlist.filter(id => library.some(s => s.id === id));
    
    populateTags(); 
    renderSidebar();

    if (library.length > 0) {
        // If demo hidden and library has other songs, pick the first non-demo
        if (userSettings.hideDemo && library.length > 1) {
             var firstReal = library.find(s => s.id !== 'demo_instruction');
             currentSongId = firstReal ? firstReal.id : library[0].id;
        } else {
             if(!currentSongId) currentSongId = library[0].id;
        }
        loadSong(currentSongId);
    } else { createNewSong(); }
}

function clearLibrary() {
    if(confirm(t('msg_clear_confirm'))) {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        library = [ensureSongStructure(demo)];
        liveSetlist = [];
        localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
        saveData(); 
        document.getElementById('searchInp').value = "";
        document.getElementById('tagFilter').value = "";
        applyFilters();
        loadSong(library[0].id);
    }
}

function populateTags() {
    var tagSet = new Set();
    library.forEach(s => {
        if(s.playlists && Array.isArray(s.playlists)) { s.playlists.forEach(tag => tagSet.add(tag)); }
    });
    var select = document.getElementById('tagFilter');
    if(select) {
        select.innerHTML = `<option value="">${t('lbl_all_tags')}</option>`; 
        select.innerHTML += `<option value="__no_demo">${t('lbl_no_demo')}</option>`; 
        Array.from(tagSet).sort().forEach(tag => {
            var opt = document.createElement('option');
            opt.value = tag; opt.innerText = tag;
            select.appendChild(opt);
        });
    }
}
function applyFilters() { renderSidebar(); }
function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    var searchBox = document.querySelector('.sidebar-search');
    if (mode === 'setlist') { if(searchBox) searchBox.style.display = 'none'; } else { if(searchBox) searchBox.style.display = 'flex'; }
    var btnShare = document.getElementById('btnShareSetlist');
    var btnAdd = document.getElementById('btnAddSong');
    if (mode === 'setlist') { if(btnShare) btnShare.style.display = 'inline-block'; if(btnAdd) btnAdd.style.display = 'none'; } else { if(btnShare) btnShare.style.display = 'none'; if(btnAdd) btnAdd.style.display = 'inline-block'; }
    renderSidebar();
}
function toggleSetlistSong(e, id) {
    e.stopPropagation(); 
    var idx = liveSetlist.indexOf(id);
    if (idx > -1) { liveSetlist.splice(idx, 1); } else { liveSetlist.push(id); }
    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
    renderSidebar();
}

// --- RENDER SIDEBAR with HIDE DEMO LOGIC ---
function renderSidebar() {
    var list = document.getElementById('songList'); list.innerHTML = ""; visiblePlaylist = [];
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => { var s = library.find(x => x.id === id); if (s) visiblePlaylist.push(s); });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        visiblePlaylist = library.filter(s => {
            // HIDE DEMO LOGIC:
            if (userSettings.hideDemo && s.id === 'demo_instruction' && library.length > 1) return false;

            var matchTxt = s.title.toLowerCase().includes(txt) || (s.artist && s.artist.toLowerCase().includes(txt));
            var matchTag = true;
            if (tag === "__no_demo") { matchTag = !s.id.includes("demo"); } else if (tag !== "") { matchTag = (s.playlists && s.playlists.includes(tag)); }
            return matchTxt && matchTag;
        });
    }
    document.getElementById('songCount').innerText = visiblePlaylist.length;
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.setAttribute('data-id', s.id);
        li.onclick = (e) => { if(e.target.classList.contains('song-handle') || e.target.classList.contains('song-action')) return; loadSong(s.id); };
        var displayTitle = (s.id === 'demo_instruction') ? t('demo_title') : s.title;
        var art = s.artist ? `<span style="font-weight:normal; opacity:0.7"> - ${s.artist}</span>` : "";
        var isInList = liveSetlist.includes(s.id);
        var actionIcon = isInList ? "fas fa-check-circle in-setlist" : "far fa-circle";
        if (viewMode === 'setlist') actionIcon = "fas fa-minus-circle";
        var handleHtml = (viewMode === 'setlist') ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``;
        li.innerHTML = `<i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i><div style="flex:1; overflow:hidden;"><div class="song-title">${displayTitle}${art}</div><div class="song-meta">${s.key}</div></div>${handleHtml}`;
        list.appendChild(li);
    });
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(list, {
        animation: 150, ghostClass: 'active', handle: '.song-handle', disabled: (viewMode !== 'setlist'),
        onEnd: function (evt) { if (viewMode === 'setlist') { var movedId = liveSetlist.splice(evt.oldIndex, 1)[0]; liveSetlist.splice(evt.newIndex, 0, movedId); localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); } }
    });
}

function loadSong(id) {
    if(scrollTimer) toggleAutoScroll(); 
    currentSongId = id; var s = library.find(x => x.id === id); if(!s) return;
    if (s.id === 'demo_instruction') s.title = t('demo_title');
    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    var items = document.querySelectorAll('.song-item'); items.forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); if(activeItem) activeItem.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
}
function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-artist').innerText = s.artist || ""; 
    document.getElementById('p-key').innerText = getNote(s.key || "-", state.t);
    var headerAct = document.getElementById('header-actions');
    var btnHtml = `<button onclick="cycleTheme()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-adjust"></i></button>`;
    if (s.notes && s.notes.trim() !== "") {
        btnHtml = `<button onclick="toggleNotes()" style="margin-right:15px; background:none; border:none; color:var(--accent); cursor:pointer;"><i class="fas fa-sticky-note"></i></button>` + btnHtml;
        document.getElementById('notes-area').innerText = s.notes;
        document.getElementById('notes-container').style.display = 'none';
    } else { document.getElementById('notes-container').style.display = 'none'; }
    headerAct.innerHTML = btnHtml;
    var infoHtml = "";
    if(s.intro) infoHtml += `<div class="info-row"><span class="meta-label" data-i18n="lbl_intro">${t('lbl_intro')}</span><span>${renderChordsLine(s.intro)}</span></div>`;
    if(s.interlude) infoHtml += `<div class="info-row"><span class="meta-label" data-i18n="lbl_inter">${t('lbl_inter')}</span><span>${renderChordsLine(s.interlude)}</span></div>`;
    document.querySelector('.info-bar').innerHTML = infoHtml;
    document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('val-c').innerText = state.c;
    var split = splitSongBody(s.body || "");
    if (isLyricsMode) {
        document.getElementById('fixed-container').innerHTML = "";
        var fullText = split.fixed + "\n\n" + split.scroll;
        renderArea('scroll-container', fullText.trim());
    } else {
        renderArea('fixed-container', split.fixed);
        renderArea('scroll-container', split.scroll);
    }
}
function toggleNotes() { var el = document.getElementById('notes-container'); el.style.display = (el.style.display === 'none') ? 'block' : 'none'; }
function renderArea(elemId, text) {
    var container = document.getElementById(elemId); container.innerHTML = "";
    var lines = text.split('\n');
    lines.forEach(line => {
        var row = document.createElement('div'); row.className = 'line-row';
        if (line.indexOf('!') === -1) { row.innerHTML = `<span class="lyric">${line}</span>`; } 
        else {
            var parts = line.split('!');
            if(parts[0]) row.appendChild(createToken("", parts[0]));
            for(var i=1; i<parts.length; i++) {
                var m = parts[i].match(/^([A-G][#b]?[a-zA-Z0-9/]*)(.*)/);
                if(m) row.appendChild(createToken(getNote(m[1],state.t-state.c), m[2]));
                else row.appendChild(createToken("", "!"+parts[i]));
            }
        }
        container.appendChild(row);
    });
}
function createToken(c, l) { var d = document.createElement('div'); d.className = 'token'; d.innerHTML = `<span class="chord">${c}</span><span class="lyric">${l}</span>`; return d; }
function renderChordsLine(str) { return str.replace(/!([A-Ga-g][#b]?[a-zA-Z0-9/]*)/g, function(match, chord) { var transposed = getNote(chord, state.t - state.c); return `<span class="chord-highlight">${transposed}</span>`; }); }
function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            document.getElementById('inpTitle').value = s.title || "";
            document.getElementById('inpArtist').value = s.artist || ""; 
            document.getElementById('inpKey').value = s.key || "";
            document.getElementById('inpIntro').value = s.intro || "";
            document.getElementById('inpInter').value = s.interlude || "";
            document.getElementById('inpNotes').value = s.notes || "";
            document.getElementById('inpBody').value = s.body || "";
            editorTags = s.playlists ? [...s.playlists] : [];
            renderTagChips();
        }
    } else { createNewSong(); }
    document.getElementById('sidebar').classList.remove('open');
}
function exitEditor() { if (currentSongId) { loadSong(currentSongId); } else { if(library.length > 0) loadSong(library[0].id); } }
function createNewSong() {
    currentSongId = null; ['inpTitle','inpArtist','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => { var el = document.getElementById(id); if(el) el.value = ""; });
    editorTags = []; renderTagChips();
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    document.getElementById('sidebar').classList.remove('open');
}
function cancelEdit() { loadSong(currentSongId || ((library.length>0)?library[0].id:null)); }
function saveEdit() { saveSong(); populateTags(); applyFilters(); }
function toggleLyricsMode() {
    isLyricsMode = !isLyricsMode; var btn = document.getElementById('btnLyrics');
    if (isLyricsMode) {
        document.body.classList.add('lyrics-mode'); if(btn) btn.classList.add('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_on')); if(currentSongId) renderPlayer(library.find(x => x.id === currentSongId));
    } else {
        document.body.classList.remove('lyrics-mode'); if(btn) btn.classList.remove('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_off')); if(currentSongId) renderPlayer(library.find(x => x.id === currentSongId));
    }
}
function autoCapo() {
    if (!currentSongId) return; var song = library.find(s => s.id === currentSongId); if (!song) return;
    var best = calculateOptimalCapo(song.key, song.body);
    if (best === state.c) { showToast(t('msg_capo_perfect')); } else { state.c = best; renderPlayer(song); showToast(t('msg_capo_found') + best); }
}
function showToast(msg) { var x = document.getElementById("toast"); if(x) { x.innerText = msg; x.className = "show"; setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000); } }

// FIX: Limit Transpose -6 to +6
function changeTranspose(n) { 
    state.t += n; 
    if (state.t > 6) state.t = 6;
    if (state.t < -6) state.t = -6;
    renderPlayer(library.find(s=>s.id===currentSongId)); 
}
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
/* --- QR, URL & SETLIST --- */
function startScanner() {
    document.getElementById('importChoiceModal').style.display = 'none'; document.getElementById('scanModal').style.display = 'flex';
    if (html5QrCodeScanner) html5QrCodeScanner.clear().catch(e=>{});
    var html5QrCode = new Html5Qrcode("reader"); html5QrCodeScanner = html5QrCode;
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decodedText) => { html5QrCode.stop().then(() => { document.getElementById('scanModal').style.display = 'none'; try { const data = JSON.parse(decodedText); processImportedData(data); } catch(e) { alert("Invalid QR format"); } }); }, (errorMessage) => {}) .catch((err) => { alert(t('msg_scan_camera_error')); document.getElementById('scanModal').style.display = 'none'; });
}
function closeScan() { if (html5QrCodeScanner) { html5QrCodeScanner.stop().then(() => { html5QrCodeScanner.clear(); document.getElementById('scanModal').style.display = 'none'; }).catch(e => document.getElementById('scanModal').style.display='none'); } else { document.getElementById('scanModal').style.display = 'none'; } }
function generateQRForSong(data) { try { const jsonStr = JSON.stringify(data); const qr = qrcode(0, 'L'); qr.addData(jsonStr); qr.make(); return qr.createImgTag(4, 12); } catch (e) { console.error("QR Error:", e); return null; } }
function showQR(customData, type) {
    let dataToEncode = customData; if (!dataToEncode && currentSongId) { dataToEncode = library.find(s => s.id === currentSongId); type = 'song'; } if (!dataToEncode) return;
    const titleEl = document.querySelector('#qrModal h3');
    if (titleEl) { if (type === 'setlist') titleEl.innerText = t('qr_title_setlist'); else titleEl.innerText = t('qr_title_song'); }
    const imgTag = generateQRForSong(dataToEncode);
    if (imgTag) { const container = document.getElementById('qr-output'); container.innerHTML = imgTag; const img = container.querySelector('img'); if (img) { img.style.width = "100%"; img.style.height = "auto"; } document.getElementById('qrModal').style.display = 'flex'; }
}
function generateQRFromEditor() {
    const tempSong = { title: document.getElementById('inpTitle').value, artist: document.getElementById('inpArtist').value, key: document.getElementById('inpKey').value, body: document.getElementById('inpBody').value, intro: document.getElementById('inpIntro').value, inter: document.getElementById('inpInter').value, tags: document.getElementById('inpTags').value };
    showQR(tempSong, 'song');
}
function exportSetlist() { if (liveSetlist.length === 0) { showToast("Η Προσωρινή Λίστα είναι άδεια!"); return; } const sharePackage = { type: "mnotes_setlist", data: liveSetlist }; showQR(sharePackage, 'setlist'); }
async function importFromURL() { const url = prompt("Εισάγετε το URL του αρχείου (.mnote ή .json):"); if (!url) return; try { const response = await fetch(url); const imported = await response.json(); processImportedData(imported); } catch (err) { alert("Αποτυχία εισαγωγής. Ελέγξτε το σύνδεσμο ή το CORS."); } }
function processImportedData(data) {
    if (data && data.type === "mnotes_setlist") { if (confirm("Λήφθηκε νέα σειρά τραγουδιών. Αντικατάσταση Προσωρινής Λίστας;")) { liveSetlist = data.data; localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); renderSidebar(); showToast("Η σειρά ενημερώθηκε!"); } return; }
    const songs = Array.isArray(data) ? data : [data]; let addedCount = 0;
    songs.forEach(s => { if (s.body) s.body = convertBracketsToBang(s.body); const safeSong = ensureSongStructure(s); const idx = library.findIndex(x => x.id === safeSong.id); if(idx !== -1) library[idx] = safeSong; else library.push(safeSong); addedCount++; });
    saveData(); populateTags(); applyFilters(); showToast("Επιτυχής εισαγωγή " + addedCount + " τραγουδιών!");
}
function selectImport(type) { if(type==='file') document.getElementById('hiddenFileInput').click(); if(type==='qr') startScanner(); if(type==='url') importFromURL(); }
/* --- TAGS --- */
function renderTagChips() { var container = document.getElementById('tagChips'); if(!container) return; container.innerHTML = ""; editorTags.forEach(tag => { var span = document.createElement('span'); span.className = 'tag-chip'; span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')"></i>`; container.appendChild(span); }); updateHiddenTagInput(); }
function updateHiddenTagInput() { var inp = document.getElementById('inpTags'); if(inp) inp.value = editorTags.join(','); }
function addTag(tag) { tag = tag.trim(); if(tag && !editorTags.includes(tag)) { editorTags.push(tag); renderTagChips(); } document.getElementById('tagInput').value = ""; document.getElementById('tagSuggestions').style.display = 'none'; }
function removeTag(tag) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); }
function deleteTagGlobally(e, tag) { e.stopPropagation(); if (confirm(t('msg_confirm_tag_delete'))) { library.forEach(s => { if(s.playlists) { s.playlists = s.playlists.filter(t => t !== tag); } }); saveData(); populateTags(); if (document.getElementById('view-editor').classList.contains('active-view')) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); var inp = document.getElementById('tagInput'); if(inp) handleTagInput(inp); } else { applyFilters(); } } }
function handleTagInput(inp) {
    var val = inp.value.toLowerCase(); var sugg = document.getElementById('tagSuggestions'); if(!val && document.activeElement !== inp) { sugg.style.display = 'none'; return; }
    var allTags = new Set(); library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t));
    sugg.innerHTML = "";
    if(matches.length > 0) { matches.forEach(m => { var div = document.createElement('div'); div.className = 'tag-suggestion-item'; div.innerHTML = `<span>${m}</span><i class="fas fa-trash-alt tag-delete-btn" onclick="deleteTagGlobally(event, '${m}')"></i>`; div.onclick = function(e) { if(e.target.tagName !== 'I') addTag(m); }; sugg.appendChild(div); }); sugg.style.display = 'block'; } else { sugg.style.display = 'none'; }
}
function handleTagKey(e) { if(e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); } else if (e.key === 'Backspace' && e.target.value === "" && editorTags.length > 0) { removeTag(editorTags[editorTags.length-1]); } }
function setupEvents() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) { fileInput.addEventListener('change', function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(e) { try { const imported = JSON.parse(e.target.result); processImportedData(imported); document.getElementById('importChoiceModal').style.display = 'none'; } catch(err) { alert(t('msg_error_read')); } }; reader.readAsText(file); fileInput.value = ''; }); }
    document.addEventListener('click', function(e) { var wrap = document.querySelector('.tag-wrapper'); var sugg = document.getElementById('tagSuggestions'); if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) { sugg.style.display = 'none'; } });
}
function setupGestures() {
    var area = document.getElementById('mainZone'); var startDist = 0; var startSize = 1.3;
    area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true});
    area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true});
    var sidebar = document.getElementById('sidebar'); var touchStartX = 0; var touchEndX = 0;
    sidebar.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    sidebar.addEventListener('touchend', function(e) { touchEndX = e.changedTouches[0].screenX; if(touchStartX - touchEndX > 50) document.getElementById('sidebar').classList.remove('open'); }, {passive: true});
}

// --- NEW SETTINGS LOGIC ---

function openSettings() {
    // 1. Scroll
    document.getElementById('setScroll').value = userSettings.scrollSpeed;
    // 2. Max Capo
    document.getElementById('setMaxCapo').value = userSettings.maxCapo;
    // 3. Backup & Hide Demo
    document.getElementById('setBackup').checked = userSettings.backupReminder;
    document.getElementById('setHideDemo').checked = userSettings.hideDemo; // NEW

    // 4. Theme
    document.getElementById('setTheme').value = userSettings.theme;
    
    // 5. Intro Size
    tempIntroScale = userSettings.introScale || 0;
    updateIntroSizeDisplay();

    // 6. Custom Colors
    toggleCustomColors(userSettings.theme);
    if(userSettings.customColors) {
        document.getElementById('colBgMain').value = userSettings.customColors['--bg-main'];
        document.getElementById('colBgPanel').value = userSettings.customColors['--bg-panel'];
        document.getElementById('colTextMain').value = userSettings.customColors['--text-main'];
        document.getElementById('colAccent').value = userSettings.customColors['--accent'];
        document.getElementById('colChord').value = userSettings.customColors['--chord-color'];
    }

    document.getElementById('settingsModal').style.display = 'flex';
}

function saveSettings() {
    userSettings.scrollSpeed = parseInt(document.getElementById('setScroll').value);
    userSettings.maxCapo = parseInt(document.getElementById('setMaxCapo').value);
    userSettings.backupReminder = document.getElementById('setBackup').checked;
    userSettings.hideDemo = document.getElementById('setHideDemo').checked; // NEW
    userSettings.theme = document.getElementById('setTheme').value;
    userSettings.introScale = tempIntroScale;

    // Save Custom Colors if custom is selected
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
    
    // Refresh library to apply Hide Demo logic immediately
    applyFilters(); 
    
    document.getElementById('settingsModal').style.display = 'none';
    showToast(t('msg_settings_saved'));
}

function toggleCustomColors(val) {
    var area = document.getElementById('customColorArea');
    if(val === 'theme-custom') area.style.display = 'block';
    else area.style.display = 'none';
}

function changeIntroSizeSettings(dir) {
    tempIntroScale += dir;
    updateIntroSizeDisplay();
}

function updateIntroSizeDisplay() {
    var pct = 100 + (tempIntroScale * 10);
    document.getElementById('dispIntroSize').innerText = pct + "%";
}

function checkBackupReminder() {
    if (userSettings.backupReminder === false) return; 
    const lastBackup = localStorage.getItem('mnotes_last_backup');
    if (!lastBackup) { localStorage.setItem('mnotes_last_backup', Date.now()); return; }
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000; 
    if (now - parseInt(lastBackup) > thirtyDays) {
        if (confirm(t('msg_backup_reminder'))) { exportJSON(); } 
        else { const oneDaySnooze = now - thirtyDays + (24 * 60 * 60 * 1000); localStorage.setItem('mnotes_last_backup', oneDaySnooze); }
    }
}
