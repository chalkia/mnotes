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
var viewMode = 'library'; 
var isLyricsMode = false; 
var wakeLock = null; 

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
// 2. LIBRARY & SIDEBAR (FIXED & CLEANED)
// ===========================================================

function loadLibrary() {
    initSetlists();
    populateTags();
    if (typeof sortLibrary === 'function') sortLibrary(userSettings.sortMethod || 'alpha');
    if (library.length > 0) {
        renderSidebar();
        if (!currentSongId) currentSongId = library[0].id;
    }
}

// Helper to ensure structure
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
    } else if (method === 'created') {
        library.sort((a, b) => b.createdAt - a.createdAt);
    } else if (method === 'modified') {
        library.sort((a, b) => b.updatedAt - a.updatedAt);
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
    if(confirm(window.t ? t('msg_confirm_clear') : "Delete all local data?")) {
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
    var list = document.getElementById('songList');
    if(!list) return;
    list.innerHTML = "";
    visiblePlaylist = [];

    // 1. Filtering Logic
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = library.find(x => x.id === id);
            if (s) visiblePlaylist.push(s);
        });
    } else {
        var txt = document.getElementById('searchInp') ? document.getElementById('searchInp').value.toLowerCase() : "";
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            if (userSettings.hideDemo && s.id.includes("demo") && library.length > 1) return false;
            
            var matchTxt = s.title.toLowerCase().includes(txt) || 
                           (s.artist && s.artist.toLowerCase().includes(txt)) || 
                           (s.key && s.key.toLowerCase() === txt);
            
            var matchTag = (tag === "__no_demo") ? !s.id.includes("demo") : 
                           (tag === "" || (s.playlists && s.playlists.includes(tag)));
            
            return matchTxt && matchTag;
        });
    }

    // Update Count
    const countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;

    // 2. Rendering
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        
        let itemClass = `song-item ${currentSongId === s.id ? 'active' : ''}`;
        li.className = itemClass;
        li.setAttribute('data-id', s.id);

        li.onclick = (e) => {
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-key-btn')) return;
            if (typeof loadSong === 'function') loadSong(s.id);
            
            // Mobile Drawer Close
            if(window.innerWidth <= 1024) {
                 const d = document.getElementById('rightDrawer');
                 if(d && d.classList.contains('open') && typeof toggleRightDrawer === 'function') {
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

        // Cloud Icon Check (ΜΟΝΟ ΜΙΑ ΦΟΡΑ)
        const isCloud = s.id && !String(s.id).startsWith('s_');
        const cloudIcon = isCloud ? '<i class="fas fa-cloud badge-cloud" title="Cloud Sync"></i>' : '';

        // HTML Construction
        li.innerHTML = `
            <i class="${actionIcon} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>
            <div class="song-info">
                <div class="song-title">${displayTitle} ${cloudIcon}</div>
                <div class="song-meta-row">
                    <span class="song-artist">${s.artist || "-"}</span>
                    <span class="song-key-badge" onclick="filterByKey(event, '${displayKey}')">${displayKey}</span>
                </div>
            </div>
            ${viewMode === 'setlist' ? `<i class="fas fa-grip-vertical song-handle"></i>` : ``}
        `;
        list.appendChild(li);
    });

    // Sortable Init
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

function setupGestures() { 
    var area = document.getElementById('mainZone'); 
    var startDist = 0; 
    var startSize = 1.3; 
    if(area) { 
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
                    var scale = dist / startDist; 
                    var newSize = startSize * scale; 
                    if(newSize < 0.8) newSize = 0.8; 
                    if(newSize > 3.0) newSize = 3.0; 
                    document.documentElement.style.setProperty('--lyric-size', newSize + "rem"); 
                }
            }
        }, {passive: true}); 
    } 
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

//LYRICS MODE LOGIC (FIXED)
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
        // Αν είναι active, του δίνουμε διαφορετικό χρώμα
        if (isLyricsMode) btn.classList.add('active-btn'); 
        else btn.classList.remove('active-btn');
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

// --- ΒΟΗΘΗΤΙΚΗ: TOAST MESSAGE (Αν λείπει) ---
// Αν υπάρχει ήδη στο αρχείο, αυτή απλά θα την αντικαταστήσει/αναβαθμίσει
function showToast(msg) {
    // Δημιουργία στοιχείου
    var div = document.createElement("div");
    div.innerText = msg;
    div.style.position = "fixed";
    div.style.bottom = "80px"; // Λίγο πιο ψηλά για να φαίνεται
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)";
    div.style.backgroundColor = "rgba(0,0,0,0.85)";
    div.style.color = "white";
    div.style.padding = "12px 24px";
    div.style.borderRadius = "50px";
    div.style.zIndex = "10000";
    div.style.fontSize = "16px";
    div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    div.style.transition = "opacity 0.5s";
    
    document.body.appendChild(div);

    // Εξαφάνιση μετά από 3 δευτερόλεπτα
    setTimeout(function() {
        div.style.opacity = "0";
        setTimeout(function() {
            if(div.parentNode) div.parentNode.removeChild(div);
        }, 500);
    }, 2500);
}

// PDF / PRINT FUNCTION (FINAL PRO STYLE + LOGO + TOKEN SYSTEM)

function printSongPDF() {
    // 1. Διάβασμα Δεδομένων από τον Editor
    var title = document.getElementById('inpTitle').value || "Untitled";
    var artist = document.getElementById('inpArtist').value || "";
    var bodyRaw = document.getElementById('inpBody').value || "";
    var key = document.getElementById('inpKey').value || "-";
    // Η "Μαγική" εντολή: Ξεχωρίζει τους τόνους και τους σβήνει, μετά κάνει κεφαλαία
    var title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    // 2. Ανάλυση στίχων και συγχορδιών (Token System Logic)
    var lines = bodyRaw.split('\n');
    var htmlBody = "";

    lines.forEach(function(line) {
        // Περίπτωση κενής γραμμής
        if (!line.trim()) { 
            htmlBody += '<div class="print-row empty-row">&nbsp;</div>'; 
            return; 
        }
        
        // Περίπτωση γραμμής χωρίς συγχορδίες (σκέτοι στίχοι)
        if (line.indexOf('!') === -1) { 
            htmlBody += `<div class="print-row"><span class="lyric-only">${line}</span></div>`; 
            return; 
        }

        // Περίπτωση γραμμής με συγχορδίες: Την αναλύουμε
        var rowHtml = '<div class="print-row">';
        var parts = line.split('!');
        
        // Κομμάτι πριν την πρώτη συγχορδία
        if (parts[0]) {
            rowHtml += `<div class="token"><div class="chord">&nbsp;</div><div class="lyric">${parts[0]}</div></div>`;
        }

        // Επεξεργασία κάθε συγχορδίας και του κειμένου της
        for (var i = 1; i < parts.length; i++) {
            // Regex για να ξεχωρίσουμε τη συγχορδία (π.χ. Am) από το κείμενο (π.χ. -γαπάω)
            var m = parts[i].match(/^([A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9|\/]*)(.*)/);
            if (m) {
                var chord = m[1];
                var text = m[2];
                // Αν δεν υπάρχει κείμενο, βάζουμε &nbsp; για να κρατήσει το ύψος
                if(text === "") text = "&nbsp;"; 
                
                rowHtml += `<div class="token">
                                <div class="chord">${chord}</div>
                                <div class="lyric">${text}</div>
                            </div>`;
            } else {
                // Ασφάλεια σε περίπτωση που κάτι δεν ταιριάζει
                rowHtml += `<div class="token"><div class="chord">!</div><div class="lyric">${parts[i]}</div></div>`;
            }
        }
        rowHtml += '</div>';
        htmlBody += rowHtml;
    });

    // 3. Στήσιμο του παραθύρου εκτύπωσης (CSS & Logo)
    var win = window.open('', '', 'width=900,height=1000');
    
    var css = `
        body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            padding: 40px; 
            color: #111;
            position: relative; /* Για να δουλέψει το absolute του λογότυπου */
        }
        
        /* ΤΟ ΛΟΓΟΤΥΠΟ (Πάνω Δεξιά) */
        .logo {
            position: absolute;
            top: 20px;
            right: 30px;
            width: 50px;
            height: auto;
            opacity: 0.9;
            z-index: 10;
        }

        h1 { 
            font-size: 26px; 
            margin: 0 0 5px 0; 
            border-bottom: 2px solid #000; 
            padding-bottom: 5px; 
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-right: 60px; 
        }
        h2 { 
            font-size: 16px; 
            color: #444; 
            margin: 0 0 20px 0; 
            font-weight: normal; 
            font-style: italic;
        }
        .meta { 
            font-size: 13px; 
            margin-bottom: 25px; 
            color: #333; 
            font-weight: bold; 
            border: 1px solid #ddd;
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
        }

        /* Flexbox Grid για τέλεια στοίχιση */
        .print-row {
            display: flex;
            flex-wrap: wrap; 
            align-items: flex-end; 
            margin-bottom: 6px; 
            page-break-inside: avoid; /* Δεν κόβει τη γραμμή στη μέση */
        }
        
        .empty-row { height: 15px; }
        
        .token {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            margin-right: 0;
        }

        .chord {
            font-weight: 800;
            font-size: 13px;
            color: #000;
            height: 16px;
            line-height: 16px;
            margin-bottom: 1px;
            font-family: 'Arial', sans-serif;
        }

        .lyric {
            font-size: 15px;
            line-height: 1.2;
            color: #222;
            white-space: pre; /* Κρατάει τα κενά του χρήστη */
            font-family: 'Arial', sans-serif;
        }
        
        .lyric-only {
            font-size: 15px;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        @media print {
            @page { margin: 1.5cm; }
            button { display: none; }
        }
    `;

    // 4. Εισαγωγή περιεχομένου
    var htmlContent = `
        <html>
        <head>
            <title>${title}</title>
            <style>${css}</style>
        </head>
        <body>
            <img src="icon-192.png" class="logo" alt="Logo">
            
            <h1>${title}</h1>
            <h2>${artist}</h2>
            <div class="meta">Key: ${key}</div>
            <div class="content">${htmlBody}</div>
            
            <script>
                // Καθυστέρηση για φόρτωση εικόνας
                window.onload = function() { 
                    setTimeout(function(){ 
                        window.print(); 
                        window.close(); 
                    }, 800); 
                }
            <\/script>
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

function fixTrailingChords(text) { let lines = text.split('\n'); return lines.map(line => { const trailingChordRegex = /![A-G][b#]?[m]?[maj7|sus4|7|add9|dim|0-9]*(\/[A-G][b#]?)?\s*$/; if (line.match(trailingChordRegex)) return line.trimEnd() + "    "; return line; }).join('\n'); }
function createNewSong() { currentSongId = null; document.querySelectorAll('.inp').forEach(e => e.value = ""); editorTags = []; if(typeof renderTagChips === 'function') renderTagChips(); document.getElementById('view-player').classList.remove('active-view'); document.getElementById('view-editor').classList.add('active-view'); }
function exitEditor() { if (currentSongId) loadSong(currentSongId); else if (library.length > 0) loadSong(library[0].id); else { document.getElementById('view-editor').classList.remove('active-view'); document.getElementById('view-player').classList.add('active-view'); } }

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
    const themeSel = document.getElementById('setTheme');
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
    const themeSel = document.getElementById('setTheme');
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
    // 1. Ξαναζωγραφίζουμε το τραγούδι (θα διαβάσει τα νέα t και c)
    if (currentSongId && typeof library !== 'undefined') {
        const s = library.find(x => x.id === currentSongId);
        if (s && typeof renderPlayer === 'function') {
            renderPlayer(s);
        }
    }

    // 2. Ενημερώνουμε τα νούμερα στα κουμπιά (αν υπάρχουν στο HTML)
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
    div.style.zIndex = "2147483647";    // Ο μέγιστος αριθμός που επιτρέπει ο browser!
    
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
   12. NEW SEQUENCER & RHYTHM ENGINE (v18.0)
   =========================================================== */

// 1. ΕΚΚΙΝΗΣΗ / ΕΜΦΑΝΙΣΗ
function toggleSequencerUI() {
    let p = document.getElementById('sequencer-panel');
    // Δημιουργία του παραθύρου αν δεν υπάρχει
    if (!p) { createSequencerPanel(); p = document.getElementById('sequencer-panel'); }
    
    if (p.style.display === 'none' || p.style.display === '') {
        p.style.display = 'flex';
        // Αρχικοποίηση Ήχου (από το audio.js)
        if(typeof AudioEngine !== 'undefined') AudioEngine.init();
        
        // Αν το Grid είναι άδειο, το ζωγραφίζουμε
        if(document.getElementById('rhythm-tracks').innerHTML === "") {
             generateGridRows(document.getElementById('rhythm-tracks'));
        }
    } else {
        p.style.display = 'none';
        // Stop αν κλείσει
        if(typeof AudioEngine !== 'undefined') AudioEngine.togglePlay(); 
    }
}

// 2. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ HTML (Panel)
function createSequencerPanel() {
    const div = document.createElement('div');
    div.id = 'sequencer-panel';
    div.className = 'sequencer-box';
    div.style.display = 'none';

    // Χρήση t() για μεταφράσεις, με ασφάλεια αν λείπει η συνάρτηση
    const safeT = (k, def) => (typeof t === 'function' ? t(k) : def);

    div.innerHTML = `
        <div class="seq-header">
            <h3 style="margin:0; color:var(--accent); font-size:1.2rem;">
                <i class="fas fa-drum"></i> ${safeT('title_rhythm_composer', 'Rhythm Composer')}
            </h3>
            <button onclick="toggleSequencerUI()" class="icon-btn" style="font-size:1.2rem;"><i class="fas fa-times"></i></button>
        </div>

        <div class="seq-toolbar">
            
            <div class="toolbar-group">
                <button id="btnPlaySeq" onclick="AudioEngine.togglePlay()" class="icon-btn accent" title="Play">
                    <i class="fas fa-play"></i> ${safeT('btn_play', 'PLAY')}
                </button>
                <button onclick="if(confirm('${safeT('msg_confirm_clear', 'Clear grid?')}')) AudioEngine.clearGrid()" class="icon-btn danger" title="Clear">
                    <i class="fas fa-trash"></i>
                </button>
            </div>

            <div class="toolbar-group">
                <span style="color:#888; font-size:0.8rem;">${safeT('lbl_beats', 'BEATS')}:</span>
                <button onclick="AudioEngine.setBeats(AudioEngine.beats-1)" class="round-btn small" style="width:25px; height:25px; font-size:0.8rem;"><i class="fas fa-minus"></i></button>
                <span id="beat-count-display" style="font-weight:bold; min-width:25px; text-align:center; font-size:1.1rem;">
                    ${(typeof AudioEngine !== 'undefined' ? AudioEngine.beats : 4)}
                </span>
                <button onclick="AudioEngine.setBeats(AudioEngine.beats+1)" class="round-btn small" style="width:25px; height:25px; font-size:0.8rem;"><i class="fas fa-plus"></i></button>
            </div>

            <div class="toolbar-group">
                <i class="fas fa-tachometer-alt" style="color:#888;"></i>
                <input type="range" min="40" max="200" value="100" style="width:80px;" oninput="AudioEngine.setBpm(this.value)">
                <span id="seq-bpm-val" style="font-size:0.8rem; width:30px;">100</span>
            </div>

            <button onclick="toggleSoundLab()" class="icon-btn" style="border:1px solid #555; padding:5px 15px;">
                <i class="fas fa-sliders-h"></i> ${safeT('btn_sound_lab', 'Sound Lab')}
            </button>
        </div>

        <div class="seq-grid-area">
            <div id="rhythm-tracks"></div>
        </div>

        <div class="seq-footer">
            <span id="seq-current-name" style="margin-right:auto; align-self:center; color:#666; font-style:italic;">
                ${safeT('msg_no_rhythm', 'No rhythm loaded')}
            </span>
            
            <button onclick="AudioEngine.openLoadModal()" class="modal-btn">
                <i class="fas fa-folder-open"></i> ${safeT('btn_load', 'Load')}
            </button>
            <button onclick="AudioEngine.openSaveModal()" class="modal-btn">
                <i class="fas fa-save"></i> ${safeT('btn_save_simple', 'Save')}
            </button>
            <button onclick="AudioEngine.linkRhythmToSong()" class="modal-btn accent">
                <i class="fas fa-link"></i> ${safeT('btn_link', 'Link')}
            </button>
        </div>
    `;

    document.body.appendChild(div);
}

// 3. ΔΗΜΙΟΥΡΓΙΑ ΤΟΥ GRID (4x4 Blocks)
function generateGridRows(container) {
    container.innerHTML = '';
    
    // Χρώματα & IDs για τα όργανα
    const instruments = [
        {c:"#f1c40f", rowId:"row-HAT"}, // Κίτρινο
        {c:"#3498db", rowId:"row-RIM"}, // Μπλε
        {c:"#2ecc71", rowId:"row-TOM"}, // Πράσινο
        {c:"#e74c3c", rowId:"row-KICK"} // Κόκκινο
    ];

    const currentBeats = (typeof AudioEngine !== 'undefined' ? AudioEngine.beats : 4);

    // LOOP ΓΙΑ ΚΑΘΕ BEAT
    for (let b = 0; b < currentBeats; b++) {
        const block = document.createElement('div');
        block.className = 'beat-block';
        
        // Αρίθμηση (1, 2, 3...)
        const num = document.createElement('div');
        num.className = 'beat-number';
        num.innerText = b + 1;
        block.appendChild(num);

        // Γραμμές Οργάνων
        instruments.forEach(inst => {
            const row = document.createElement('div');
            row.className = `inst-row ${inst.rowId}`;
            
            const stepsDiv = document.createElement('div');
            stepsDiv.className = 'steps-group';
            
            // 4 δέκατα έκτα ανά Beat
            for (let s = 0; s < 4; s++) {
                const globalStep = (b * 4) + s;
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.step = globalStep;
                
                // Περνάμε το χρώμα στο CSS Variable (Για το hover/active)
                cell.style.setProperty('--active-color', inst.c);
                
                // Click Handler: Απλά αλλάζει την κλάση active
                cell.onclick = function() {
                    this.classList.toggle('active');
                    // Το χρώμα το αναλαμβάνει το CSS (.cell.active)
                };
                stepsDiv.appendChild(cell);
            }
            row.appendChild(stepsDiv);
            block.appendChild(row);
        });

        container.appendChild(block);
    }
}

// 4. SOUND LAB (MODAL & SLIDERS)
function toggleSoundLab() {
    let m = document.getElementById('sound-lab-modal');
    if(!m) { createSoundLabModal(); m = document.getElementById('sound-lab-modal'); }
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}

function createSoundLabModal() {
    const d = document.createElement('div');
    d.id = 'sound-lab-modal';
    d.className = 'modal-overlay'; 
    d.style.cssText = "display:none; z-index:2000; align-items:center; justify-content:center;";
    
    // Helper για live update
    window.updateParam = (obj, prop, val) => {
        if(typeof AudioEngine !== 'undefined') {
            AudioEngine.soundConfig[obj][prop] = parseFloat(val);
            document.getElementById(`val-${obj}-${prop}`).innerText = val;
            AudioEngine.playPercussion(AudioEngine.ctx.currentTime, obj);
        }
    };

    const slider = (lbl, obj, prop, min, max, step, col) => `
        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:${col}; margin-bottom:2px;">
                <span>${lbl}</span><span id="val-${obj}-${prop}">${(typeof AudioEngine !== 'undefined' ? AudioEngine.soundConfig[obj][prop] : 0)}</span>
            </div>
            <input type="range" class="compact-range" min="${min}" max="${max}" step="${step}" 
                   value="${(typeof AudioEngine !== 'undefined' ? AudioEngine.soundConfig[obj][prop] : 0)}" 
                   oninput="updateParam('${obj}','${prop}',this.value)">
        </div>`;

    d.innerHTML = `
        <div class="modal-box" style="width:95%; max-width:400px; max-height:85vh; overflow-y:auto; background:#1a1a1a; padding:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h3 style="margin:0; font-size:1.1rem;"><i class="fas fa-sliders-h"></i> Sound Lab</h3>
                <button onclick="document.getElementById('sound-lab-modal').style.display='none'" class="text-btn" style="color:#fff;">&times;</button>
            </div>
            
            <div style="border-left:3px solid #e74c3c; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#e74c3c; margin:0 0 5px 0; font-size:0.8rem;">KICK DRUM</h4>
                ${slider('Start Freq', 'kick', 'startFreq', 50, 300, 1, '#e74c3c')}
                ${slider('End Freq', 'kick', 'endFreq', 10, 100, 1, '#e74c3c')}
                ${slider('Decay', 'kick', 'decay', 0.1, 1.0, 0.05, '#e74c3c')}
                ${slider('Volume', 'kick', 'vol', 0, 1.5, 0.1, '#e74c3c')}
            </div>

            <div style="border-left:3px solid #2ecc71; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#2ecc71; margin:0 0 5px 0; font-size:0.8rem;">TOM</h4>
                ${slider('Frequency', 'tom', 'freq', 50, 300, 1, '#2ecc71')}
                ${slider('Decay', 'tom', 'decay', 0.1, 1.0, 0.05, '#2ecc71')}
                ${slider('Volume', 'tom', 'vol', 0, 1.5, 0.1, '#2ecc71')}
                <select class="inp" style="width:100%; font-size:0.8rem; margin-top:5px;" onchange="AudioEngine.soundConfig.tom.type=this.value; AudioEngine.playPercussion(AudioEngine.ctx.currentTime,'tom')">
                    <option value="sine">Sine</option>
                    <option value="triangle" selected>Triangle</option>
                    <option value="square">Square</option>
                </select>
            </div>

            <div style="border-left:3px solid #3498db; padding-left:10px; margin-bottom:15px;">
                <h4 style="color:#3498db; margin:0 0 5px 0; font-size:0.8rem;">RIM SHOT</h4>
                ${slider('Frequency', 'rim', 'freq', 100, 1500, 10, '#3498db')}
                ${slider('Decay', 'rim', 'decay', 0.01, 0.3, 0.01, '#3498db')}
                ${slider('Volume', 'rim', 'vol', 0, 1.5, 0.1, '#3498db')}
            </div>

            <div style="border-left:3px solid #f1c40f; padding-left:10px;">
                <h4 style="color:#f1c40f; margin:0 0 5px 0; font-size:0.8rem;">HI-HATS</h4>
                ${slider('Filter Freq', 'hat', 'freq', 500, 5000, 50, '#f1c40f')}
                ${slider('Decay', 'hat', 'decay', 0.01, 0.3, 0.01, '#f1c40f')}
                ${slider('Volume', 'hat', 'vol', 0, 1.5, 0.1, '#f1c40f')}
            </div>
        </div>
    `;
    document.body.appendChild(d);
}
