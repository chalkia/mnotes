/* =========================================
   UI & APP LOGIC (js/ui.js) - v9.0 FINAL
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
var wakeLock = null; 
var newlyImportedIds = []; 

// --- SETTINGS DEFAULT ---
var userSettings = JSON.parse(localStorage.getItem('mnotes_settings')) || {
    scrollSpeed: 50,
    maxCapo: 12,
    backupReminder: true,
    hideDemo: false,
    theme: 'theme-dark',
    introScale: 0,
    customColors: { 
        '--bg-main': '#000000',
        '--bg-panel': '#222222',
        '--text-main': '#ffffff',
        '--accent': '#00ff00',
        '--chord-color': '#ffff00'
    },
   keepScreenOn: false
};

var tempIntroScale = 0; 

// --- INIT ---
window.addEventListener('load', function() {
    applyTheme(); 
    applyTranslations(); 
    loadLibrary();
    setupEvents();
    setupGestures();
    checkBackupReminder();
    
    // Νέα λειτουργικότητα: Resizable Columns
    initResizers();

    // Mobile Check
    if (window.innerWidth <= 768) {
        if(typeof switchMobileTab === 'function') switchMobileTab('library');
    }
});

function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations();
    renderSidebar(); 
    populateTags(); 
    if(currentSongId === 'demo_instruction') loadSong(currentSongId);
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
    var scale = userSettings.introScale || 0;
    var newSize = 1.1 + (scale * 0.11);
    if (newSize < 0.5) newSize = 0.5; 
    root.style.setProperty('--intro-size', newSize.toFixed(2) + "rem");
}

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    var demoExists = library.some(s => s.id === "demo_instruction" || (s.id && s.id.includes("demo")));
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        library.unshift(demo); saveData();
    }
    library = library.map(ensureSongStructure);
    liveSetlist = liveSetlist.filter(id => library.some(s => s.id === id));
    
    populateTags(); 
    const currentSort = userSettings.sortMethod || 'alpha';
    const sortDropdown = document.getElementById('sortFilter');
    if (sortDropdown) sortDropdown.value = currentSort;
    
    if (typeof sortLibrary === 'function') sortLibrary(currentSort);
    
    renderSidebar();
    
    if (library.length > 0) {
        if (userSettings.hideDemo && library.length > 1) {
             var firstReal = library.find(s => s.id !== 'demo_instruction');
             currentSongId = firstReal ? firstReal.id : library[0].id;
        } else {
             if(!currentSongId) currentSongId = library[0].id;
        }
        loadSong(currentSongId);
        if (userSettings.keepScreenOn) requestWakeLock();
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

function applySortAndRender() {
    var sortVal = document.getElementById('sortFilter').value;
    userSettings.sortMethod = sortVal;
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));
    sortLibrary(sortVal);
    renderSidebar();
}

function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    
    var searchBox = document.querySelector('.sidebar-search');
    if (searchBox) searchBox.style.display = (mode === 'setlist') ? 'none' : 'flex';
    
    var btnShare = document.getElementById('btnShareSetlist');
    var btnAdd = document.getElementById('btnAddSong');
    
    if (mode === 'setlist') { 
        if(btnShare) btnShare.style.display = 'inline-block'; 
        if(btnAdd) btnAdd.style.display = 'none'; 
    } else { 
        if(btnShare) btnShare.style.display = 'none'; 
        if(btnAdd) btnAdd.style.display = 'inline-block'; 
    }
    renderSidebar();
}

function toggleSetlistSong(e, id) {
    e.stopPropagation(); 
    var idx = liveSetlist.indexOf(id);
    if (idx > -1) { liveSetlist.splice(idx, 1); } else { liveSetlist.push(id); }
    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
    renderSidebar();
}

// --- NEW RENDER SIDEBAR (With Key Button Logic) ---
function renderSidebar() {
    var list = document.getElementById('songList'); list.innerHTML = ""; visiblePlaylist = [];
    
    // Filter Logic
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => { var s = library.find(x => x.id === id); if (s) visiblePlaylist.push(s); });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        visiblePlaylist = library.filter(s => {
            if (userSettings.hideDemo && s.id === 'demo_instruction' && library.length > 1) return false;
            
            // Ψάχνουμε και στο Key για να δουλεύει το φίλτρο κλίμακας
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) ||
                           (s.key && s.key.toLowerCase() === txt); // Ακριβές ταίριασμα για κλίμακα

            var matchTag = true;
            if (tag === "__no_demo") { matchTag = !s.id.includes("demo"); } 
            else if (tag !== "") { matchTag = (s.playlists && s.playlists.includes(tag)); }
            return matchTxt && matchTag;
        });
    }
    
    document.getElementById('songCount').innerText = visiblePlaylist.length;
    
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        if (newlyImportedIds.includes(s.id)) itemClass += ' new-import';
        
        li.className = itemClass;
        li.setAttribute('data-id', s.id);
        
        li.onclick = (e) => { 
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-btn')) return; 
            loadSong(s.id); 
        };
        
        var displayTitle = (s.id === 'demo_instruction') ? t('demo_title') : s.title;
        var displayArtist = s.artist || "-";
        var displayKey = s.key || "-";
        
        // Icon Logic
        var actionIcon = "far fa-circle";
        if (viewMode === 'setlist') actionIcon = "fas fa-minus-circle";
        else if (liveSetlist.includes(s.id)) actionIcon = "fas fa-check-circle in-setlist";
        
        var handleHtml = (viewMode === 'setlist') ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``;

        // ΝΕΑ ΔΟΜΗ HTML (Τίτλος - Καλλιτέχνης - Κουμπί Κλίμακας)
        li.innerHTML = `
            <i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>
            
            <div class="song-info">
                <div class="song-title">${displayTitle}</div>
                <div class="song-artist">${displayArtist}</div>
                <div class="song-meta-row">
                    <div class="song-key-btn" onclick="filterByKey(event, '${displayKey}')">${displayKey}</div>
                </div>
            </div>
            
            ${handleHtml}
        `;
        list.appendChild(li);
    });
    
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(list, {
        animation: 150, ghostClass: 'active', handle: '.song-handle', disabled: (viewMode !== 'setlist'),
        onEnd: function (evt) { if (viewMode === 'setlist') { var movedId = liveSetlist.splice(evt.oldIndex, 1)[0]; liveSetlist.splice(evt.newIndex, 0, movedId); localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); } }
    });
}

function filterByKey(e, key) {
    e.stopPropagation();
    var searchInp = document.getElementById('searchInp');
    if (searchInp) {
        searchInp.value = key;
        applyFilters(); // Τρέχει την renderSidebar με το νέο φίλτρο
        showToast("Φίλτρο: " + key);
    }
}

function loadSong(id) {
    if(typeof scrollTimer !== 'undefined' && scrollTimer) toggleAutoScroll(); 
    
    currentSongId = id; 
    var s = library.find(x => x.id === id); if(!s) return;
    
    state.t = 0; state.c = 0; 
    parseSongLogic(s); 
    renderPlayer(s);
    
    // Rhythm Loading
    if (s.rhythm && s.rhythm.style && typeof loadPreset === 'function') {
        loadPreset(s.rhythm.style);
        if(s.rhythm.bpm && typeof updateBpm === 'function') {
            updateBpm(s.rhythm.bpm);
            document.getElementById('rngBpm').value = s.rhythm.bpm;
        }
    }

    document.getElementById('view-player').classList.add('active-view');
    document.getElementById('view-editor').classList.remove('active-view');
    
    document.querySelectorAll('.song-item').forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`); 
    if(activeItem) activeItem.classList.add('active');
    
    if(typeof requestWakeLock === 'function') requestWakeLock();

    if (window.innerWidth <= 768 && typeof switchMobileTab === 'function') {
        switchMobileTab('stage');
    }
}

function renderPlayer(s) {
    if (!s) return;

    const headerHTML = `
        <div class="player-header">
            <h1 id="p-title" class="song-h1">${s.title}</h1>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span class="meta-label">${s.artist || ""}</span>
                <span class="key-badge">${getNote(s.key || "-", state.t)}</span>
            </div>
        </div>
    `;
    const headerContainer = document.querySelector('.player-header-container');
    if (headerContainer) headerContainer.innerHTML = headerHTML;

    if(document.getElementById('val-t')) document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    if(document.getElementById('val-c')) document.getElementById('val-c').innerText = state.c;

    var split = splitSongBody(s.body || "");
    renderArea('fixed-container', split.fixed); 
    renderArea('scroll-container', split.scroll);

    // Video
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
    saveSong(); 
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

function setupEvents() {
    var btnMenu = document.getElementById('btnMenu');
    if (btnMenu) btnMenu.onclick = toggleSidebar;

    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    processImportedData(imported);
                    const modal = document.getElementById('importChoiceModal');
                    if(modal) modal.style.display = 'none';
                } catch(err) { alert("Error reading file"); }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.tag-wrapper');
        var sugg = document.getElementById('tagSuggestions');
        if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) { sugg.style.display = 'none'; }
    });

    const btnPlay = document.getElementById('btnPlayRhythm');
    if(btnPlay && typeof togglePlay === 'function') btnPlay.onclick = togglePlay;

    const rngBpm = document.getElementById('rngBpm');
    if(rngBpm && typeof updateBpm === 'function') rngBpm.oninput = function(e) { updateBpm(e.target.value); };

    const selRhythm = document.getElementById('selRhythm');
    if(selRhythm && typeof loadPreset === 'function') selRhythm.onchange = function(e) { loadPreset(e.target.value); };
}

function setupGestures() {
    var area = document.getElementById('mainZone'); var startDist = 0; var startSize = 1.3;
    if(area) {
        area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true});
        area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true});
    }
}

// --- RESIZABLE COLUMNS LOGIC ---
function initResizers() {
    const container = document.querySelector('.app-container');
    const leftResizer = document.querySelectorAll('.resizer')[0]; 
    const rightResizer = document.querySelectorAll('.resizer')[1]; 

    if(leftResizer) {
        leftResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.addEventListener('mousemove', onMouseMoveLeft);
            document.addEventListener('mouseup', onMouseUpLeft);
        });
    }
    
    if(rightResizer) {
        rightResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.addEventListener('mousemove', onMouseMoveRight);
            document.addEventListener('mouseup', onMouseUpRight);
        });
    }

    function onMouseMoveLeft(e) {
        let newWidth = e.clientX;
        if(newWidth < 200) newWidth = 200; if(newWidth > 500) newWidth = 500;
        document.documentElement.style.setProperty('--nav-width', newWidth + 'px');
    }
    
    function onMouseMoveRight(e) {
        let newWidth = window.innerWidth - e.clientX;
        if(newWidth < 250) newWidth = 250; if(newWidth > 600) newWidth = 600;
        document.documentElement.style.setProperty('--tools-width', newWidth + 'px');
    }

    function onMouseUpLeft() { document.removeEventListener('mousemove', onMouseMoveLeft); document.removeEventListener('mouseup', onMouseUpLeft); }
    function onMouseUpRight() { document.removeEventListener('mousemove', onMouseMoveRight); document.removeEventListener('mouseup', onMouseUpRight); }
}

/* --- HELPER FUNCTIONS --- */
function getYoutubeId(url) {
    if (!url) return null;
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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

// Placeholder functions for settings/toast if missed from snippets
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
function navSetlist(dir) {
    if (!liveSetlist || liveSetlist.length < 2) return;
    let currentIndex = liveSetlist.indexOf(currentSongId);
    if (currentIndex === -1) return;
    let nextIndex = (currentIndex + dir + liveSetlist.length) % liveSetlist.length;
    loadSong(liveSetlist[nextIndex]);
}
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
