/* =========================================
   UI & APP LOGIC (js/ui.js) - TAG CHIPS
   ========================================= */

if(typeof library === 'undefined') var library = [];
if(typeof state === 'undefined') var state = { t: 0, c: 0, meta: {}, parsedChords: [] };
if(typeof currentSongId === 'undefined') var currentSongId = null;
var visiblePlaylist = [];
var sortableInstance = null;

window.onload = function() {
    loadSavedTheme();
    applyTranslations(); 
    loadLibrary();
    setupEvents();
    setupGestures();
};

/* --- LANGUAGE --- */
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
    
    var demoExists = library.some(s => s.id === "demo_instruction" || (s.id && s.id.includes("demo")));
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        demo.title = t('demo_title'); demo.body = t('demo_body');
        library.unshift(demo); saveData();
    }
    library = library.map(ensureSongStructure);
    visiblePlaylist = [...library];
    populateTags(); renderSidebar();

    if (library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        loadSong(currentSongId);
    } else { createNewSong(); }
}

function clearLibrary() {
    if(confirm(t('msg_clear_confirm'))) {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        demo.title = t('demo_title'); demo.body = t('demo_body');
        library = [ensureSongStructure(demo)];
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
    select.innerHTML = `<option value="">${t('lbl_all_tags')}</option>`;
    Array.from(tagSet).sort().forEach(tag => {
        var opt = document.createElement('option');
        opt.value = tag; opt.innerText = tag;
        select.appendChild(opt);
    });
}

function applyFilters() {
    var txt = document.getElementById('searchInp').value.toLowerCase();
    var tag = document.getElementById('tagFilter').value;
    visiblePlaylist = library.filter(s => {
        var matchTxt = s.title.toLowerCase().includes(txt) || (s.artist && s.artist.toLowerCase().includes(txt));
        var matchTag = (tag === "") ? true : (s.playlists && s.playlists.includes(tag));
        return matchTxt && matchTag;
    });
    renderSidebar();
}

function renderSidebar() {
    var list = document.getElementById('songList');
    list.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length;

    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.setAttribute('data-id', s.id);
        
        // Κλικ στο LI -> Φόρτωση τραγουδιού
        // (Το event bubbling θα το χειριστούμε ώστε η λαβή να μην φορτώνει τραγούδι)
        li.onclick = (e) => {
            // Αν πατήσαμε τη λαβή, ΜΗΝ φορτώσεις το τραγούδι (αφού κάνουμε drag)
            if(e.target.classList.contains('song-handle')) return;
            loadSong(s.id);
        };
        
        var displayTitle = (s.id === 'demo_instruction') ? t('demo_title') : s.title;
        var art = s.artist ? `<span style="font-weight:normal; opacity:0.7"> - ${s.artist}</span>` : "";
        
        // ΝΕΑ ΔΟΜΗ: Info Wrapper + Handle Icon
        li.innerHTML = `
            <div class="song-info-wrapper">
                <div class="song-title">${displayTitle}${art}</div>
                <div class="song-meta">${s.key}</div>
            </div>
            <i class="fas fa-grip-vertical song-handle"></i>
        `;
        list.appendChild(li);
    });

    if (sortableInstance) sortableInstance.destroy();
    
    // ΕΝΕΡΓΟΠΟΙΗΣΗ SORTABLE ΜΕ ΛΑΒΗ
    sortableInstance = new Sortable(list, {
        animation: 150,
        ghostClass: 'active',
        handle: '.song-handle', // <--- ΤΟ ΚΛΕΙΔΙ: Μόνο η λαβή σέρνει
        onEnd: function (evt) {
            var item = visiblePlaylist.splice(evt.oldIndex, 1)[0];
            visiblePlaylist.splice(evt.newIndex, 0, item);
        }
    });
}

/* --- TAG CHIPS LOGIC --- */
var editorTags = []; // Stores current tags in editor

function updateHiddenTagInput() {
    document.getElementById('inpTags').value = editorTags.join(',');
}

function renderTagChips() {
    var container = document.getElementById('tagChips');
    container.innerHTML = "";
    editorTags.forEach(tag => {
        var span = document.createElement('span');
        span.className = 'tag-chip';
        span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')"></i>`;
        container.appendChild(span);
    });
    updateHiddenTagInput();
}

function addTag(tag) {
    tag = tag.trim();
    if(tag && !editorTags.includes(tag)) {
        editorTags.push(tag);
        renderTagChips();
    }
    document.getElementById('tagInput').value = "";
    document.getElementById('tagSuggestions').style.display = 'none';
}

function removeTag(tag) {
    editorTags = editorTags.filter(t => t !== tag);
    renderTagChips();
}

function handleTagInput(inp) {
    var val = inp.value.toLowerCase();
    var sugg = document.getElementById('tagSuggestions');
    if(!val) { sugg.style.display = 'none'; return; }

    // Get all existing tags
    var allTags = new Set();
    library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t));

    sugg.innerHTML = "";
    if(matches.length > 0) {
        matches.forEach(m => {
            var div = document.createElement('div');
            div.className = 'tag-suggestion-item';
            div.innerText = m;
            div.onclick = function() { addTag(m); };
            sugg.appendChild(div);
        });
        sugg.style.display = 'block';
    } else {
        sugg.style.display = 'none';
    }
}

function handleTagKey(e) {
    if(e.key === 'Enter') {
        e.preventDefault();
        addTag(e.target.value);
    } else if (e.key === 'Backspace' && e.target.value === "" && editorTags.length > 0) {
        removeTag(editorTags[editorTags.length-1]);
    }
}


/* --- PLAYER --- */
function loadSong(id) {
   // STOP SCROLL αν τρέχει
    if (scrollTimer) toggleAutoScroll();
    currentSongId = id;
    var s = library.find(x => x.id === id);
    if(!s) return;
    if (s.id === 'demo_instruction') s.title = t('demo_title');

    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    
    var items = document.querySelectorAll('.song-item');
    items.forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    document.getElementById('p-title').innerText = s.title;
    document.getElementById('p-artist').innerText = s.artist || ""; 
    document.getElementById('p-key').innerText = getNote(s.key, state.t);

    var headerAct = document.getElementById('header-actions');
    var btnHtml = `<button onclick="cycleTheme()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-adjust"></i></button>`;
    if (s.notes && s.notes.trim() !== "") {
        btnHtml = `<button onclick="toggleNotes()" style="margin-right:15px; background:none; border:none; color:var(--accent); cursor:pointer;"><i class="fas fa-sticky-note"></i></button>` + btnHtml;
        document.getElementById('notes-area').innerText = s.notes;
        document.getElementById('notes-container').style.display = 'none';
    } else { document.getElementById('notes-container').style.display = 'none'; }
    headerAct.innerHTML = btnHtml;

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
            
            // LOAD TAGS
            editorTags = s.playlists ? [...s.playlists] : [];
            renderTagChips();

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
    // Reset Tags
    editorTags = []; renderTagChips();
    switchToEditor();
}

function cancelEdit() { loadSong(currentSongId || ((library.length>0)?library[0].id:null)); }
function saveEdit() { saveSong(); populateTags(); applyFilters(); }

/* --- QR & IMPORT --- */
function showQR() {
    if (!currentSongId) return;
    var song = library.find(s => s.id === currentSongId);
    if (!song) return;
    if (document.getElementById('view-editor').classList.contains('active-view')) {
        song.title = document.getElementById('inpTitle').value;
        song.artist = document.getElementById('inpArtist').value;
        song.body = document.getElementById('inpBody').value;
    }
    var imgTag = generateQRForSong(song);
    if (imgTag) {
        document.getElementById('qr-output').innerHTML = imgTag;
        document.getElementById('qrModal').style.display = 'flex';
    } else { alert("Error generating QR"); }
}

function startScanner() {
    document.getElementById('importChoiceModal').style.display = 'none';
    document.getElementById('scanModal').style.display = 'flex';
    if (html5QrCodeScanner) html5QrCodeScanner.clear().catch(e=>{});
    var html5QrCode = new Html5Qrcode("reader");
    html5QrCodeScanner = html5QrCode;
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
      (decodedText, decodedResult) => {
          html5QrCode.stop().then(() => {
             document.getElementById('scanModal').style.display = 'none';
             var song = processQRScan(decodedText);
             if (song) {
                 if (!library.some(ex => ex.id === song.id)) {
                     library.push(song); saveData(); populateTags(); applyFilters(); 
                     loadSong(song.id);
                     alert(t('msg_imported') + "1");
                 } else { alert(t('msg_no_import')); }
             } else { alert("Invalid QR"); }
          });
      }, (errorMessage) => {})
    .catch((err) => { alert(t('msg_scan_camera_error')); document.getElementById('scanModal').style.display = 'none'; });
}

function closeScan() {
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().then(() => { html5QrCodeScanner.clear(); document.getElementById('scanModal').style.display = 'none'; }).catch(e=>document.getElementById('scanModal').style.display='none');
    } else { document.getElementById('scanModal').style.display = 'none'; }
}

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
                    newSongs.forEach(s => { if (!library.some(ex => ex.id === s.id)) { library.push(ensureSongStructure(s)); added++; }});
                    if(added>0) { saveData(); populateTags(); applyFilters(); alert(t('msg_imported')+added); }
                    else { alert(t('msg_no_import')); }
                    document.getElementById('importChoiceModal').style.display='none';
                } catch(err) { alert(t('msg_error_read')); }
            }; reader.readAsText(file); fileInput.value = '';
        });
    }
}
function selectImport(type) { if(type==='file') document.getElementById('hiddenFileInput').click(); if(type==='qr') startScanner(); }
function setupGestures() {
    var area = document.getElementById('mainZone');
    var startDist = 0; var startSize = 1.3;
    area.addEventListener('touchstart', function(e) { if(e.touches.length === 2) { startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); var val = getComputedStyle(document.documentElement).getPropertyValue('--lyric-size').trim(); startSize = parseFloat(val) || 1.3; }}, {passive: true});
    area.addEventListener('touchmove', function(e) { if(e.touches.length === 2) { var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); if(startDist > 0) { var scale = dist / startDist; var newSize = startSize * scale; if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); }}}, {passive: true});
}
/* --- AUTO SCROLL LOGIC --- */
var scrollTimer = null;
var scrollSpeedMs = 50; // Ταχύτητα (μικρότερο νούμερο = πιο γρήγορο)

function toggleAutoScroll() {
    var el = document.getElementById('scroll-container');
    
    if (scrollTimer) {
        // Αν τρέχει ήδη -> Σταμάτα το
        clearInterval(scrollTimer);
        scrollTimer = null;
        // Προαιρετικό: Ένα οπτικό εφέ ότι σταμάτησε (π.χ. φλας στο border)
        el.style.borderLeft = "none"; 
    } else {
        // Αν είναι σταματημένο -> Ξεκίνα το
        // Οπτική ένδειξη ότι τρέχει (π.χ. μια πράσινη γραμμή αριστερά)
        el.style.borderLeft = "3px solid var(--accent)";
        
        scrollTimer = setInterval(function() {
            // Έλεγχος αν φτάσαμε στο τέλος
            if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
                toggleAutoScroll(); // Σταμάτα
            } else {
                el.scrollTop += 1; // Κατέβα 1 pixel
            }
        }, scrollSpeedMs);
    }
}

/* --- UI ACTIONS --- */

// NEW: MAGIC CAPO
function autoCapo() {
    if (!currentSongId) return;
    var song = library.find(s => s.id === currentSongId);
    if (!song) return;

    var best = calculateOptimalCapo(song.key, song.body);
    
    if (best === state.c) {
        showToast(t('msg_capo_perfect'));
    } else {
        state.c = best;
        renderPlayer(song);
        showToast(t('msg_capo_found') + best);
    }
}

// NEW: TOAST MESSAGE
function showToast(msg) {
    var x = document.getElementById("toast");
    x.innerText = msg;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

// UPDATE: createNewSong closes sidebar
function createNewSong() {
    currentSongId = null; 
    ['inpTitle','inpArtist','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => {
        var el = document.getElementById(id); if(el) el.value = "";
    });
    editorTags = []; renderTagChips();
    switchToEditor();
    document.getElementById('sidebar').classList.remove('open'); // CLOSE SIDEBAR
}


// NEW: SWIPE GESTURE ON SIDEBAR
function setupGestures() {
    // 1. Text Zoom (Pinch) - Main Zone
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
        if(e.touches.length === 2 && startDist > 0) { 
            var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            var scale = dist / startDist; var newSize = startSize * scale; 
            if(newSize < 0.8) newSize = 0.8; if(newSize > 3.0) newSize = 3.0; 
            document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); 
        }
    }, {passive: true});

    // 2. Sidebar Swipe to Close
    var sidebar = document.getElementById('sidebar');
    var touchStartX = 0;
    var touchEndX = 0;
    
    sidebar.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    sidebar.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    function handleSwipe() {
        // Αν σύρεις προς τα αριστερά πάνω από 50px
        if (touchStartX - touchEndX > 50) {
            document.getElementById('sidebar').classList.remove('open');
        }
    }
}
