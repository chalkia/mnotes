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
var wakeLock = null; // Νέα μεταβλητή
var newlyImportedIds = []; // Λίστα για το προσωρινό μαρκάρισμα

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
        },
   keepScreenOn: false
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
    // 1. Καθορισμός της μεθόδου (από ρυθμίσεις ή default αλφαβητικά)
    const currentSort = userSettings.sortMethod || 'alpha';
    // 2. Ενημέρωση του Dropdown στο UI αν υπάρχει
    const sortDropdown = document.getElementById('sortFilter');
    if (sortDropdown) {
        sortDropdown.value = currentSort;
    }
    // 3. Εκτέλεση της ταξινόμησης (από το logic.js)
    if (typeof sortLibrary === 'function') {
        sortLibrary(currentSort);
    }
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
       if (userSettings.keepScreenOn) {
        requestWakeLock();
    }
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

// --- ΝΕΟ: Συνάρτηση για το Dropdown Ταξινόμησης ---

function applySortAndRender() {
    // 1. Διάβασε τι επέλεξε ο χρήστης από το Dropdown
    var sortVal = document.getElementById('sortFilter').value;
    
    // 2. Αποθήκευσε την επιλογή μόνιμα
    userSettings.sortMethod = sortVal;
    localStorage.setItem('mnotes_settings', JSON.stringify(userSettings));

    // 3. Κάλεσε τη λογική ταξινόμησης (από το logic.js)
    sortLibrary(sortVal);

    // 4. Ξανασχεδίασε τη λίστα με τη νέα σειρά
    renderSidebar();
}
function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    
    var searchBox = document.querySelector('.sidebar-search');
    if (mode === 'setlist') { 
        if(searchBox) searchBox.style.display = 'none'; 
    } else { 
        if(searchBox) searchBox.style.display = 'flex'; 
    }
    
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

    // ΧΕΙΡΟΥΡΓΙΚΗ ΠΡΟΣΘΗΚΗ: Αν υπάρχει ανοιχτό τραγούδι, ανανέωσε τα κουμπιά του footer
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) renderPlayer(s);
    }
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
          // ΝΕΟ:
          var li = document.createElement('li');
          let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''}`;
          // Αν το τραγούδι μόλις εισήχθη, πρόσθεσε την ειδική κλάση
          if (newlyImportedIds.includes(s.id)) {
             itemClass += ' new-import';
           }
        li.className = itemClass;
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
    requestWakeLock();
}
function renderPlayer(s) {
    if (!s) return;

    // 1. HEADER: Δημιουργία Flexbox δομής για τίτλο και εργαλεία
    const headerContent = `
        <div class="player-header">
            <div class="header-main-info" style="flex: 1; overflow: hidden;">
                <h2 id="p-title" style="margin:0; font-size:1.4rem; color:var(--accent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.title}</h2>
                <div id="p-artist" style="font-size:0.9rem; opacity:0.8;">${s.artist || ""}</div>
            </div>
            <div class="header-right-tools" style="display:flex; align-items:center; gap:12px;">
                <span class="key-badge" style="background:var(--input-bg); border:1px solid var(--border-color); padding:2px 8px; border-radius:4px; font-weight:bold;">${getNote(s.key || "-", state.t)}</span>
                <div id="header-actions"></div>
            </div>
        </div>
    `;
    
    // Επιλογή του στοιχείου που περιέχει το header (προσάρμοσε το ID αν διαφέρει στο index.html σου)
    const headerContainer = document.querySelector('.player-header-container') || document.getElementById('view-player');
    // Σημείωση: Αν το headerContent μπαίνει μέσα σε υπάρχον div, ίσως χρειαστεί να το στοχεύσεις ακριβέστερα.
    
    // 2. ΕΝΗΜΕΡΩΣΗ ACTIONS (Settings/Notes)
    var btnHtml = `<button onclick="openSettings()" class="action-btn" title="Ρυθμίσεις"><i class="fas fa-cog"></i></button>`;
    if (s.notes && s.notes.trim() !== "") {
        btnHtml = `<button onclick="toggleNotes()" class="action-btn" style="color:var(--accent);" title="Σημειώσεις"><i class="fas fa-sticky-note"></i></button>` + btnHtml;
        document.getElementById('notes-area').innerText = s.notes;
    }
    
    // Επανασχεδιασμός του Header (Προσοχή: Βεβαιώσου ότι τα ID p-title κλπ υπάρχουν ήδη)
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-artist').innerText = s.artist || "";
    document.getElementById('p-key').innerText = getNote(s.key || "-", state.t);
    document.getElementById('header-actions').innerHTML = btnHtml;

    // 3. INTRO/INTERLUDE: Ξεκινά από την αρχή χωρίς περιθώρια
    var infoHtml = "";
    if(s.intro) {
        infoHtml += `
            <div class="info-row" style="width:100%; padding:12px 15px; background:rgba(255,255,255,0.05); border-bottom:1px solid var(--border-color); box-sizing:border-box;">
                <span class="meta-label" style="font-weight:bold; color:var(--text-muted); font-size:0.75rem; min-width:65px; display:inline-block;">ΕΙΣΑΓΩΓΗ</span>
                <span style="flex:1;">${renderChordsLine(s.intro)}</span>
            </div>`;
    }
    if(s.interlude) {
        infoHtml += `
            <div class="info-row" style="width:100%; padding:12px 15px; background:rgba(255,255,255,0.05); border-bottom:1px solid var(--border-color); box-sizing:border-box;">
                <span class="meta-label" style="font-weight:bold; color:var(--text-muted); font-size:0.75rem; min-width:65px; display:inline-block;">ΕΝΔΙΑΜΕΣΟ</span>
                <span style="flex:1;">${renderChordsLine(s.interlude)}</span>
            </div>`;
    }
    
    const infoBar = document.querySelector('.info-bar');
    if (infoBar) {
        infoBar.style.gap = "0";
        infoBar.style.margin = "0";
        infoBar.innerHTML = infoHtml;
    }

    // 4. ΛΟΙΠΑ ΣΤΟΙΧΕΙΑ
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
    var container = document.getElementById(elemId); 
    if (!container) return;
    container.innerHTML = "";
    
    var lines = text.split('\n');
    lines.forEach(line => {
        var row = document.createElement('div'); 
        row.className = 'line-row';
        
        // 1. Αν η γραμμή ΔΕΝ έχει συγχορδίες
        if (line.indexOf('!') === -1) { 
            row.innerHTML = `<span class="lyric">${line || "&nbsp;"}</span>`; 
        } 
        // 2. Αν η γραμμή ΕΧΕΙ συγχορδίες
        else {
            var parts = line.split('!');
            // Το πρώτο part (πριν το πρώτο !)
            if (parts[0]) {
                row.appendChild(createToken("", parts[0]));
            }
            
            for (var i = 1; i < parts.length; i++) {
                // Ενημερωμένο Regex για να πιάνει: 1. Συγχορδία, 2. Προαιρετικό Slash, 3. Στίχο
                var m = parts[i].match(/^([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)\s?(.*)/);
                
                if (m) {
                    var chord = getNote(m[1], state.t - state.c);
                    var lyric = m[3] || ""; // Αν δεν υπάρχει στίχος, βάλε κενό αντί για undefined
                    row.appendChild(createToken(chord, lyric));
                } else {
                    // Fallback αν το regex αποτύχει
                    row.appendChild(createToken("", parts[i] || ""));
                }
            }
        }
        container.appendChild(row);
    });
}
function createToken(c, l) { 
    var d = document.createElement('div'); 
    d.className = 'token'; 
    // Χρησιμοποιούμε το || "" ώστε αν το c ή το l είναι null/undefined, να μπαίνει κενό
    d.innerHTML = `<span class="chord">${c || ""}</span><span class="lyric">${l || ""}</span>`; 
    return d; 
}
function renderChordsLine(str) { return str.replace(/!([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?)/g, function(match, chord) { var transposed = getNote(chord, state.t - state.c); return `<span class="chord-highlight">${transposed}</span>`; }); }
function switchToEditor() {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-editor').classList.add('active-view');
    if (currentSongId) {
        var s = library.find(x => x.id === currentSongId);
        if (s) {
            document.getElementById('inpTitle').value = s.title || "";
            document.getElementById('inpArtist').value = s.artist || ""; 

            // --- ΔΙΟΡΘΩΣΗ: Transpose Logic για όλα τα πεδία ---
            let keyToEdit = s.key || "";
            let bodyToEdit = s.body || "";
            let introToEdit = s.intro || "";
            let interToEdit = s.interlude || "";

            if (state.t !== 0) {
                // Εφαρμογή του transpose μόνιμα στα κείμενα
                keyToEdit = getNote(keyToEdit, state.t);
                bodyToEdit = transposeBodyText(bodyToEdit, state.t);
                introToEdit = transposeBodyText(introToEdit, state.t); // ΝΕΟ
                interToEdit = transposeBodyText(interToEdit, state.t); // ΝΕΟ
                
                // Μηδενίζουμε το transpose του state αφού το "κάψαμε" στο κείμενο
                state.t = 0; 
                if(document.getElementById('val-t')) {
                    document.getElementById('val-t').innerText = "0";
                }
            }

            document.getElementById('inpKey').value = keyToEdit;
            document.getElementById('inpBody').value = bodyToEdit;
            document.getElementById('inpIntro').value = introToEdit; // Ενημερωμένο
            document.getElementById('inpInter').value = interToEdit; // Ενημερωμένο
            
            document.getElementById('inpNotes').value = s.notes || "";
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
//function saveEdit() { saveSong(); populateTags(); applyFilters(); }
function saveEdit() { 
    let bodyArea = document.getElementById('inpBody');
    if (bodyArea) {
        bodyArea.value = fixTrailingChords(bodyArea.value);
    }
    saveSong(); 
    populateTags(); 
    applyFilters(); 
}
function fixTrailingChords(text) {
    let lines = text.split('\n');
    let processedLines = lines.map(line => {
        // Regex που ελέγχει αν η τελευταία λέξη της γραμμής είναι συγχορδία (ξεκινά με !)
        // Καλύπτει A-G, αλλοιώσεις #/b, τύπους m, maj7, κλπ, και slash chords (π.χ. !C/G)
        const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; 
        if (line.match(trailingChordRegex)) {
            // trimEnd() για να μην προσθέτουμε κενά πάνω στα ήδη υπάρχοντα κενά
            return line.trimEnd() + "    "; 
        }
        return line;
    });
    return processedLines.join('\n');
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
function generateQRForSong(data) { 
    try { 
        // 1. Μετατροπή σε JSON string
        const jsonStr = JSON.stringify(data); 

        // 2. Η "μαγική" γραμμή για τα Ελληνικά: Μετατροπή UTF-16 σε UTF-8
        // Χωρίς αυτό, οι ελληνικοί χαρακτήρες βγαίνουν ακαταλαβίστικοι (mojibake)
        const utf8Data = unescape(encodeURIComponent(jsonStr)); 

        const qr = qrcode(0, 'L'); 
        qr.addData(utf8Data); 
        qr.make(); 
        return qr.createImgTag(4, 12); 
    } catch (e) { 
        console.error("QR Error:", e); 
        return null; 
    } 
}
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
function exportSetlist() { 
    if (liveSetlist.length === 0) { 
        showToast('msg_setlist_empty'); 
        return; 
    } 
    const sharePackage = { type: "mnotes_setlist", data: liveSetlist }; 
    showQR(sharePackage, 'setlist'); 
}

async function importFromURL() { 
    const url = prompt(t('ph_url_import')); 
    if (!url) return; 
    try { 
        const response = await fetch(url); 
        const imported = await response.json(); 
        processImportedData(imported); 
    } catch (err) { 
        alert(t('msg_import_error_url')); 
    } 
}

function processImportedData(data) {
    // 1. Έλεγχος αν είναι Setlist
    if (data && data.type === "mnotes_setlist") { 
        if (confirm(t('msg_setlist_confirm'))) { 
            liveSetlist = data.data; 
            localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist)); 
            renderSidebar(); 
            showToast(t('msg_setlist_updated')); 
        } 
        return; 
    }
    
    const songs = Array.isArray(data) ? data : [data];
    let addedCount = 0;
    let updatedCount = 0;
    
    // 2. Καθαρισμός λίστας νέων εισαγωγών (για το μαρκάρισμα)
    newlyImportedIds = [];

    songs.forEach(s => { 
        if (s.body) s.body = convertBracketsToBang(s.body); 
        const importedSong = ensureSongStructure(s); 
        const existingIdx = library.findIndex(x => x.id === importedSong.id); 
        
        if (existingIdx !== -1) { 
            // Έξυπνη ενημέρωση: Μόνο αν το εισαγόμενο είναι νεότερο
            if (importedSong.updatedAt > library[existingIdx].updatedAt) {
                library[existingIdx] = importedSong;
                updatedCount++;
                newlyImportedIds.push(importedSong.id); // Μαρκάρισμα
            }
        } else { 
            library.push(importedSong); 
            addedCount++; 
            newlyImportedIds.push(importedSong.id); // Μαρκάρισμα
        } 
    });
    
     // 3. Ταξινόμηση με βάση την επιλογή του χρήστη
    if (typeof sortLibrary === 'function') {
        sortLibrary(userSettings.sortMethod || 'alpha');
    }

    saveData();
    populateTags(); 
    applyFilters(); 

    let finalMsg = t('msg_import_summary')
        .replace('${added}', addedCount)
        .replace('${updated}', updatedCount);
    showToast(finalMsg);
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
   //  4. Screen Wake
    document.getElementById('setWakeLock').checked = userSettings.keepScreenOn || false;
    // 5. Theme
    document.getElementById('setTheme').value = userSettings.theme;
    // 6. Intro Size
    tempIntroScale = userSettings.introScale || 0;
    updateIntroSizeDisplay();
    // 7. Custom Colors
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
    userSettings.keepScreenOn = document.getElementById('setWakeLock').checked;


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
    requestWakeLock(); // Κλήση για άμεση ενεργοποίηση/απενεργοποίηση
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
function navSetlist(dir) {
    if (!liveSetlist || liveSetlist.length < 2) return;
    
    let currentIndex = liveSetlist.indexOf(currentSongId);
    // Αν το τραγούδι δεν είναι στη λίστα, δεν κάνουμε τίποτα
    if (currentIndex === -1) return;

    // Υπολογισμός επόμενου (κυκλικά)
    let nextIndex = (currentIndex + dir + liveSetlist.length) % liveSetlist.length;
    let nextSongId = liveSetlist[nextIndex];

    loadSong(nextSongId);
}

async function requestWakeLock() {
    const statusEl = document.getElementById('wakeLockStatus');
    
    if (!userSettings.keepScreenOn) {
        if (wakeLock !== null) {
            await wakeLock.release();
            wakeLock = null;
            showToast(t('msg_wakelock_off') || "Η προστασία οθόνης απενεργοποιήθηκε");
        }
        if(statusEl) statusEl.style.display = 'none';
        return;
    }

    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            if(statusEl) statusEl.style.display = 'inline-block';
            
            // Ενημερωτικό μήνυμα Toast
            showToast(t('msg_wakelock_on') || "Η οθόνη θα παραμείνει αναμμένη ✅");
            
            wakeLock.addEventListener('release', () => {
                if(statusEl) statusEl.style.display = 'none';
            });
        }
    } catch (err) {
        console.error(`Wake Lock Error: ${err.message}`);
        if(statusEl) statusEl.style.display = 'none';
        showToast("Αδυναμία κλειδώματος οθόνης ⚠️");
    }
} 

// Επαναφορά όταν η εφαρμογή επανέρχεται στο προσκήνιο (Visibility Change)
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible' && userSettings.keepScreenOn) {
        await requestWakeLock();
    }
});
