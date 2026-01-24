/* =========================================
   UI & APP LOGIC (js/ui.js) - BILINGUAL
   ========================================= */

if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;
var visiblePlaylist = [];

window.onload = function() {
    loadSavedTheme();
    applyTranslations(); // Apply language on load
    loadLibrary();
    setupEvents();
    setupGestures();
};

/* --- LANGUAGE --- */
function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations();
    renderSidebar(); // Refresh sidebar to translate "New" button etc if dynamic
    // Update Demo title if it's the current song
    if(currentSongId === 'demo_instruction') loadSong(currentSongId);
}

function applyTranslations() {
    // 1. Update text elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        var key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[currentLang][key]) {
            el.innerText = TRANSLATIONS[currentLang][key];
        }
    });

    // 2. Update placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        var key = el.getAttribute('data-i18n-ph');
        if (TRANSLATIONS[currentLang][key]) {
            el.placeholder = TRANSLATIONS[currentLang][key];
        }
    });

    // 3. Update Language Button Icon/Text
    var btn = document.getElementById('btnLang');
    if(btn) btn.innerHTML = (currentLang === 'en') ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> EL';
}

/* --- THEMES --- */
function loadSavedTheme() {
    var th = localStorage.getItem('mnotes_theme') || 'theme-dark';
    document.body.className = th;
}
function cycleTheme() {
    var b = document.body;
    if (b.classList.contains('theme-dark')) b.className = 'theme-slate';
    else if (b.classList.contains('theme-slate')) b.className = 'theme-light';
    else b.className = 'theme-dark';
    localStorage.setItem('mnotes_theme', b.className);
}

/* --- LIBRARY --- */
function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    // Check Demo
    var demoExists = library.some(s => s.id === "demo_instruction");
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        // Apply text based on language ONCE during creation/reset
        demo.title = t('demo_title');
        demo.body = t('demo_body');
        library.unshift(demo);
        saveData();
    }
    library = library.map(ensureSongStructure);
    visiblePlaylist = [...library];
    renderSidebar();

    if (library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        loadSong(currentSongId);
    } else { createNewSong(); }
}

function clearLibrary() {
    if(confirm(t('msg_clear_confirm'))) {
        // Re-create demo in current lang
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        demo.title = t('demo_title');
        demo.body = t('demo_body');
        
        library = [ensureSongStructure(demo)];
        saveData(); visiblePlaylist = [...library]; renderSidebar();
        loadSong(library[0].id);
    }
}

/* --- PLAYER --- */
function loadSong(id) {
    currentSongId = id;
    var s = library.find(x => x.id === id);
    if(!s) return;
    
    // Live translate Demo Title/Body if viewed
    if (s.id === 'demo_instruction') {
        s.title = t('demo_title');
        // Note: Body isn't auto-translated to preserve user edits, 
        // but for a pure reset demo we could. We'll leave body as is for now.
    }

    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    renderSidebar(); document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-artist').innerText = s.artist || ""; 
    document.getElementById('p-key').innerText = getNote(s.key, state.t);

    // Notes & Theme Buttons
    var headerAct = document.getElementById('header-actions');
    var btnHtml = `<button onclick="cycleTheme()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-adjust"></i></button>`;
    if (s.notes && s.notes.trim() !== "") {
        btnHtml = `<button onclick="toggleNotes()" style="margin-right:15px; background:none; border:none; color:var(--accent); cursor:pointer;"><i class="fas fa-sticky-note"></i></button>` + btnHtml;
        document.getElementById('notes-area').innerText = s.notes;
        document.getElementById('notes-container').style.display = 'none';
    } else { document.getElementById('notes-container').style.display = 'none'; }
    headerAct.innerHTML = btnHtml;

    // Intro/Inter Labels need translation? They are static in render but labels are dynamic
    var infoHtml = "";
    if(s.intro) infoHtml += `<div class="info-row"><span class="meta-label" data-i18n="lbl_intro">${t('lbl_intro')}</span><span class="info-chord">${renderChordsLine(s.intro)}</span></div>`;
    if(s.interlude) infoHtml += `<div class="info-row"><span class="meta-label" data-i18n="lbl_inter">${t('lbl_inter')}</span><span class="info-chord">${renderChordsLine(s.interlude)}</span></div>`;
    document.querySelector('.info-bar').innerHTML = infoHtml;

    document.getElementById('val-t').innerText = (state.t > 0 ? "+" : "") + state.t;
    document.getElementById('val-c').innerText = state.c;

    var split = splitSongBody(s.body || "");
    renderArea('fixed-container', split.fixed);
    renderArea('scroll-container', split.scroll);
}

function toggleNotes() {
    var el = document.getElementById('notes-container');
    el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function renderArea(elemId, text) {
    var container = document.getElementById(elemId); container.innerHTML = "";
    var lines = text.split('\n');
    lines.forEach(line => {
        var row = document.createElement('div'); row.className = 'line-row';
        if (line.indexOf('!') === -1) {
            row.innerHTML = `<span class="lyric">${line}</span>`;
        } else {
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
function createToken(c, l) {
    var d = document.createElement('div'); d.className = 'token';
    d.innerHTML = `<span class="chord">${c}</span><span class="lyric">${l}</span>`; return d;
}
function renderChordsLine(str) {
    return str.replace(/!([A-G][#b]?[a-zA-Z0-9/]*)/g, (m, c) => `<span style="margin-right:8px;">${getNote(c, state.t - state.c)}</span>`);
}
function renderSidebar() {
    var list = document.getElementById('songList'); list.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length;
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.onclick = () => loadSong(s.id);
        
        // Translate Title if it's the Demo
        var displayTitle = (s.id === 'demo_instruction') ? t('demo_title') : s.title;
        
        var art = s.artist ? `<span style="font-weight:normal; opacity:0.7"> - ${s.artist}</span>` : "";
        li.innerHTML = `<div class="song-title">${displayTitle}${art}</div><div class="song-meta">${s.key}</div>`;
        list.appendChild(li);
    });
}

/* --- EDITOR --- */
function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            document.getElementById('inpTitle').value = s.title;
            document.getElementById('inpArtist').value = s.artist || ""; 
            document.getElementById('inpKey').value = s.key;
            document.getElementById('inpTags').value = (s.playlists || []).join(', ');
            document.getElementById('inpIntro').value = s.intro;
            document.getElementById('inpInter').value = s.interlude;
            document.getElementById('inpNotes').value = s.notes;
            document.getElementById('inpBody').value = s.body;
        }
    } else { createNewSong(); }
    document.getElementById('sidebar').classList.remove('open');
}
function createNewSong() {
    currentSongId = null; 
    ['inpTitle','inpArtist','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => {
        var el = document.getElementById(id); if(el) el.value = "";
    });
    switchToEditor();
}
function cancelEdit() { loadSong(currentSongId || ((library.length>0)?library[0].id:null)); }
function saveEdit() { saveSong(); }

/* --- ACTIONS & GESTURES --- */
function changeTranspose(n) { state.t += n; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function setupEvents() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    const fileInput = document.getElementById('hiddenFileInput');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    const newSongs = Array.isArray(imported) ? imported : [imported];
                    let added = 0;
                    newSongs.forEach(s => { 
                        if (!library.some(ex => ex.id === s.id)) { 
                            library.push(ensureSongStructure(s)); added++; 
                        }
                    });
                    if(added>0) { saveData(); visiblePlaylist=[...library]; renderSidebar(); alert(t('msg_imported')+added); }
                    else { alert(t('msg_no_import')); }
                    
                    document.getElementById('importChoiceModal').style.display='none';
                } catch(err) { alert(t('msg_error_read')); }
            }; reader.readAsText(file); fileInput.value = '';
        });
    }
}
function selectImport(type) { if(type==='file') document.getElementById('hiddenFileInput').click(); }

function setupGestures() {
    var area = document.getElementById('mainZone');
    var startDist = 0; var startSize = 1.3;
    area.addEventListener('touchstart', function(e) {
        if(e.touches.length === 2) {
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim();
            startSize = parseFloat(val) || 1.3;
        }
    }, {passive: true});
    area.addEventListener('touchmove', function(e) {
        if(e.touches.length === 2) {
            var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            if(startDist > 0) {
                var scale = dist / startDist; var newSize = startSize * scale;
                if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0;
                document.documentElement.style.setProperty('--lyric-size', newSize + "rem");
            }
        }
    }, {passive: true});
}
