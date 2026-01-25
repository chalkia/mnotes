/* =========================================
   UI & APP LOGIC (js/ui.js) - FINAL FIXED
   ========================================= */

var currentFontScale = 1.0;
var viewMode = 'library'; 
var isLyricsMode = false;
var scrollTimer = null;
var editorTags = [];
var html5QrCodeScanner = null;

window.onload = function() {
    loadSavedTheme();
    applyTranslations(); 
    loadLibrary();
    setupEvents();
    setupGestures();
};

function loadLibrary() {
    var saved = localStorage.getItem('mnotes_data');
    if (saved) { try { library = JSON.parse(saved); } catch(e) { library = []; } }
    
    var demoExists = library.some(s => s.id === "demo_instruction" || (s.id && s.id.includes("demo")));
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        var demo = JSON.parse(JSON.stringify(DEFAULT_DATA[0]));
        demo.title = t('demo_title'); demo.body = t('demo_body');
        library.unshift(ensureSongStructure(demo)); 
        saveData();
    }
    library = library.map(ensureSongStructure);
    liveSetlist = liveSetlist.filter(id => library.some(s => s.id === id));
    
    populateTags(); 
    renderSidebar();

    if (library.length > 0) {
        if(!currentSongId) currentSongId = library[0].id;
        loadSong(currentSongId);
    } else { createNewSong(); }
}

function loadSong(id) {
    if(scrollTimer) toggleAutoScroll(); 
    currentSongId = id;
    var s = library.find(x => x.id === id); 
    if(!s) return;
    
    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    document.getElementById('view-editor').classList.remove('active-view'); 
    
    var items = document.querySelectorAll('.song-item');
    items.forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`.song-item[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    var titleEl = document.getElementById('p-title'); if(titleEl) titleEl.innerText = s.title;
    var artistEl = document.getElementById('p-artist'); if(artistEl) artistEl.innerText = s.artist || "";
    var keyEl = document.getElementById('p-key'); if(keyEl) keyEl.innerText = getNote(s.key, state.t);
    render(s); 
}

function render(originalSong) {
    var keyShift = state.t; var chordShift = state.t - state.c;
    var pinnedDiv = document.getElementById('fixed-container'); 
    var scrollDiv = document.getElementById('scroll-container');   
    if(!pinnedDiv || !scrollDiv) return;

    pinnedDiv.innerHTML = ""; scrollDiv.innerHTML = "";
    pinnedDiv.className = isLyricsMode ? "" : "fixed-lyrics";
    scrollDiv.className = "scroll-lyrics";

    var targetForFixed = isLyricsMode ? scrollDiv : pinnedDiv;

    if(state.meta.intro) {
        var d = document.createElement('div'); d.className = 'intro-block';
        d.innerHTML = `<span style="opacity:0.7">${t('lbl_intro')}:</span> ` + renderSimple(state.meta.intro, chordShift);
        targetForFixed.appendChild(d);
    }
    if(state.meta.interlude) {
        var d = document.createElement('div'); d.className = 'compact-interlude';
        d.innerHTML = `<span style="opacity:0.7">${t('lbl_inter')}:</span> ` + renderSimple(state.meta.interlude, chordShift);
        targetForFixed.appendChild(d);
    }

    var blocks = []; var currentBlock = [];
    state.parsedChords.forEach(L => {
        if(L.type === 'br') { if(currentBlock.length>0) { blocks.push(currentBlock); currentBlock=[]; } }
        else currentBlock.push(L);
    });
    if(currentBlock.length>0) blocks.push(currentBlock);

    blocks.forEach((block, index) => {
        var hasChords = block.some(l => l.type === 'mixed');
        var target = (isLyricsMode) ? scrollDiv : (hasChords ? pinnedDiv : scrollDiv);
        block.forEach(L => {
            if(L.type === 'lyricOnly') {
                var p = document.createElement('div'); p.className = 'lyric'; p.innerText = L.text; target.appendChild(p);
            } else {
                var r = document.createElement('div'); r.className = 'line-row';
                L.tokens.forEach(tk => {
                    var w = document.createElement('div'); w.className = 'token';
                    var c = document.createElement('div'); c.className = 'chord'; c.innerText = getNote(tk.c, chordShift);
                    var tx = document.createElement('div'); tx.className = 'lyric'; tx.innerText = tk.t;
                    w.appendChild(c); w.appendChild(tx); r.appendChild(w);
                });
                target.appendChild(r);
            }
        });
        // Spacer for blocks
        var sep = document.createElement('div'); sep.style.height = "15px"; target.appendChild(sep);
    });
    
    // Update Control Values
    var valT = document.getElementById('val-t'); if(valT) valT.innerText = state.t;
    var valC = document.getElementById('val-c'); if(valC) valC.innerText = state.c;
}

function renderSimple(t, s) {
    var parts = t.split('!'), h = "";
    if(parts[0]) h += `<span class="meta-label">${parts[0]}</span>`;
    for(var k = 1; k < parts.length; k++) {
        var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        if(m) { 
            h += `<span class="info-chord" style="color:var(--chord-color);margin-right:5px;font-weight:bold;">${getNote(m[1], s)}</span>`; 
            if(m[2]) h += `<span>${m[2]}</span>`; 
        }
        else h += `<span>!${parts[k]}</span>`;
    }
    return h;
}

function renderSidebar() {
    var c = document.getElementById('songList'); 
    if(!c) return;
    c.innerHTML = "";
    
    var searchEl = document.getElementById('searchInp'); 
    var tagEl = document.getElementById('tagFilter');
    var txt = searchEl ? searchEl.value.toLowerCase() : "";
    var tag = tagEl ? tagEl.value : "";
    
    visiblePlaylist = [];
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = library.find(x => x.id === id);
            if(s) visiblePlaylist.push(s);
        });
    } else {
        visiblePlaylist = library.filter(s => {
            var matchTxt = s.title.toLowerCase().includes(txt) || (s.artist && s.artist.toLowerCase().includes(txt));
            var matchTag = true;
            if (tag === "__no_demo") matchTag = (s.id !== "demo_instruction");
            else if (tag !== "") matchTag = (s.playlists && s.playlists.includes(tag));
            return matchTxt && matchTag;
        });
    }
    
    var countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length;

    visiblePlaylist.forEach(s => {
        var li = document.createElement('li'); li.className = 'song-item'; 
        if(s.id === currentSongId) li.classList.add('active');
        li.setAttribute('data-id', s.id);
        
        var displayTitle = (s.id === 'demo_instruction') ? t('demo_title') : s.title;
        var art = s.artist ? `<span style="font-weight:normal; opacity:0.7"> - ${s.artist}</span>` : "";

        var isInSet = liveSetlist.includes(s.id);
        var iconAction = (viewMode === 'setlist') 
            ? `<i class="fas fa-minus-circle song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`
            : `<i class="${isInSet ? 'fas fa-check-circle in-setlist' : 'far fa-circle'} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`;
        var handle = (viewMode === 'setlist') ? `<i class="fas fa-grip-vertical song-handle"></i>` : "";

        li.innerHTML = `${iconAction} <div style="flex:1;overflow:hidden;"><div class="song-title">${displayTitle}${art}</div><div class="song-meta">${s.key}</div></div> ${handle}`;
        
        li.onclick = (e) => { 
            if(e.target.classList.contains('song-action') || e.target.classList.contains('song-handle')) return;
            loadSong(s.id); 
        };
        c.appendChild(li);
    });
    
    if(typeof Sortable !== 'undefined' && viewMode === 'setlist') {
        if(sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(c, {
            animation: 150, handle: '.song-handle', 
            onEnd: function (evt) {
                var moved = liveSetlist.splice(evt.oldIndex, 1)[0];
                liveSetlist.splice(evt.newIndex, 0, moved);
                localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
            }
        });
    }
}

function switchToEditor() {
    var s = library.find(x => x.id === currentSongId);
    document.getElementById('view-player').classList.remove('active-view');
    document.getElementById('view-editor').classList.add('active-view');
    document.getElementById('sidebar').classList.remove('open');

    if(s) {
        document.getElementById('inpTitle').value = s.title;
        document.getElementById('inpArtist').value = s.artist || "";
        document.getElementById('inpKey').value = s.key;
        document.getElementById('inpNotes').value = s.notes || "";
        document.getElementById('inpIntro').value = s.intro || "";
        document.getElementById('inpInter').value = s.interlude || "";
        document.getElementById('inpBody').value = s.body;
        editorTags = s.playlists ? [...s.playlists] : [];
        renderTagChips();
    } else { createNewSong(); }
}

function createNewSong() {
    currentSongId = null;
    ['inpTitle','inpArtist','inpKey','inpTags','inpIntro','inpInter','inpNotes','inpBody'].forEach(id => {
        var el = document.getElementById(id); if(el) el.value = "";
    });
    editorTags = []; renderTagChips();
    document.getElementById('view-player').classList.remove('active-view');
    document.getElementById('view-editor').classList.add('active-view');
    document.getElementById('sidebar').classList.remove('open');
}

function exitEditor() {
    if (currentSongId) loadSong(currentSongId); 
    else if(library.length > 0) loadSong(library[0].id);
}
function saveEdit() { saveSong(); populateTags(); applyFilters(); }

function selectImport(type) { 
    if(type==='file') document.getElementById('hiddenFileInput').click(); 
    if(type==='qr') startScanner(); 
}

function closeScan() {
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().then(() => { 
            html5QrCodeScanner.clear(); document.getElementById('scanModal').style.display = 'none'; 
        }).catch(e => document.getElementById('scanModal').style.display = 'none');
    } else { document.getElementById('scanModal').style.display = 'none'; }
}

function startScanner() {
    document.getElementById('importChoiceModal').style.display = 'none';
    document.getElementById('scanModal').style.display = 'flex';
    if (html5QrCodeScanner) { try { html5QrCodeScanner.clear(); } catch(e){} }
    html5QrCodeScanner = new Html5Qrcode("reader");
    html5QrCodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
      (decodedText) => {
          html5QrCodeScanner.stop().then(() => {
             document.getElementById('scanModal').style.display = 'none';
             var song = processQRScan(decodedText); // Should now exist in logic.js
             if(!song) { try { song = JSON.parse(decodedText); } catch(e) { song=null; } }
             if (song) {
                 if (!library.some(ex => ex.id === song.id)) {
                     library.push(ensureSongStructure(song)); saveData(); populateTags(); applyFilters(); 
                     loadSong(song.id); alert(t('msg_imported') + "1");
                 } else { alert(t('msg_no_import')); }
             } else { alert("Invalid QR"); }
          });
      })
    .catch(() => { alert(t('msg_scan_camera_error')); document.getElementById('scanModal').style.display = 'none'; });
}

function toggleLyricsMode() {
    isLyricsMode = !isLyricsMode;
    var btn = document.getElementById('btnLyrics');
    if(isLyricsMode) {
        document.body.classList.add('lyrics-mode');
        if(btn) btn.classList.add('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_on'));
    } else {
        document.body.classList.remove('lyrics-mode');
        if(btn) btn.classList.remove('lyrics-btn-active');
        showToast(t('msg_lyrics_mode_off'));
    }
    let s = library.find(x => x.id === currentSongId);
    if(s) renderPlayer(s);
}

function changeTranspose(n) { state.t += n; renderPlayer(library.find(s=>s.id===currentSongId)); }
function changeCapo(n) { state.c += n; if(state.c<0)state.c=0; renderPlayer(library.find(s=>s.id===currentSongId)); }
function autoCapo() {
    let s = library.find(x => x.id === currentSongId);
    if(!s) return;
    let best = calculateOptimalCapo(s.key, s.body); // Updated arguments
    state.c = best;
    renderPlayer(s);
    showToast(t('msg_capo_found') + best);
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function toggleNotes() {
    var el = document.getElementById('notes-container');
    el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}
function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    var searchBox = document.querySelector('.sidebar-search');
    if(searchBox) searchBox.style.display = (mode === 'setlist') ? 'none' : 'flex';
    renderSidebar();
}
function toggleSetlistSong(e, id) {
    e.stopPropagation();
    var idx = liveSetlist.indexOf(id);
    if (idx > -1) liveSetlist.splice(idx, 1);
    else liveSetlist.push(id);
    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
    renderSidebar();
}
function populateTags() {
    var select = document.getElementById('tagFilter');
    if(!select) return;
    var curr = select.value;
    select.innerHTML = `<option value="">${t('lbl_all_tags')}</option><option value="__no_demo">${t('lbl_no_demo')}</option>`;
    var allTags = new Set();
    library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    Array.from(allTags).sort().forEach(tag => {
        var opt = document.createElement('option');
        opt.value = tag; opt.innerText = tag;
        select.appendChild(opt);
    });
    select.value = curr;
}
function updateHiddenTagInput() {
    var inp = document.getElementById('inpTags'); if(inp) inp.value = editorTags.join(',');
}
function renderTagChips() {
    var container = document.getElementById('tagChips'); if(!container) return;
    container.innerHTML = "";
    editorTags.forEach(tag => {
        var span = document.createElement('span'); span.className = 'tag-chip';
        span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag('${tag}')"></i>`;
        container.appendChild(span);
    });
    updateHiddenTagInput();
}
function addTag(tag) {
    tag = tag.trim();
    if(tag && !editorTags.includes(tag)) { editorTags.push(tag); renderTagChips(); }
    document.getElementById('tagInput').value = ""; document.getElementById('tagSuggestions').style.display = 'none';
}
function removeTag(tag) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); }
function handleTagInput(inp) {
    var val = inp.value.toLowerCase();
    var sugg = document.getElementById('tagSuggestions');
    if(!val) { sugg.style.display = 'none'; return; }
    var allTags = new Set(); library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t));
    sugg.innerHTML = "";
    if(matches.length > 0) {
        matches.forEach(m => {
            var div = document.createElement('div'); div.className = 'tag-suggestion-item';
            div.innerHTML = `<span>${m}</span> <i class="fas fa-trash-alt tag-delete-btn"></i>`;
            div.querySelector('.tag-delete-btn').onclick = (e) => { e.stopPropagation(); deleteTagGlobally(e, m); };
            div.onclick = () => addTag(m);
            sugg.appendChild(div);
        });
        sugg.style.display = 'block';
    } else { sugg.style.display = 'none'; }
}
function handleTagKey(e) {
    if(e.key === 'Enter') { e.preventDefault(); addTag(e.target.value); }
    else if (e.key === 'Backspace' && e.target.value === "" && editorTags.length > 0) { removeTag(editorTags[editorTags.length-1]); }
}
function deleteTagGlobally(e, tag) {
    if(e) e.stopPropagation();
    if(!confirm(t('msg_confirm_tag_delete'))) return;
    library.forEach(s => { s.playlists = s.playlists.filter(t => t !== tag); });
    saveData(); populateTags(); 
    if(document.getElementById('view-editor').classList.contains('active-view')) {
        editorTags = editorTags.filter(t => t !== tag); renderTagChips();
    } else {
        applyFilters();
    }
}
function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations(); renderSidebar(); populateTags();
}
function showToast(m) { 
    var d = document.getElementById("toast"); 
    d.innerText = m; d.className = "show"; 
    setTimeout(() => d.className = d.className.replace("show", ""), 3000); 
}
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }
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
    var scroller = document.getElementById('scroll-container');
    var lastTap = 0;
    scroller.addEventListener('click', function(e) {
        var currentTime = new Date().getTime();
        var tapLength = currentTime - lastTap;
        if (tapLength < 400 && tapLength > 0) { e.preventDefault(); toggleAutoScroll(); }
        lastTap = currentTime;
    });
    // Sidebar Swipe
    var sidebar = document.getElementById('sidebar');
    var touchStartX = 0; var touchEndX = 0;
    sidebar.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    sidebar.addEventListener('touchend', function(e) { 
        touchEndX = e.changedTouches[0].screenX; 
        if(touchStartX - touchEndX > 50) document.getElementById('sidebar').classList.remove('open'); 
    }, {passive: true});
}
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
    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.tag-wrapper');
        var sugg = document.getElementById('tagSuggestions');
        if (wrap && sugg && !wrap.contains(e.target) && !sugg.contains(e.target)) {
            sugg.style.display = 'none';
        }
    });
}
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

// === EXPORT GLOBAL FUNCTIONS FOR HTML ===
window.createNewSong = createNewSong;
window.toEditor = switchToEditor;
window.switchToEditor = switchToEditor;
window.saveEdit = saveEdit;
window.selectImport = selectImport;
window.closeScan = closeScan;
window.deleteCurrentSong = deleteCurrentSong;
window.showQR = showQR;
window.toggleLyricsMode = toggleLyricsMode;
window.changeTranspose = changeTranspose;
window.changeCapo = changeCapo;
window.autoCapo = autoCapo;
window.toggleLanguage = toggleLanguage;
window.exitEditor = exitEditor;
