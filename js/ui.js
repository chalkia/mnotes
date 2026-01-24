/* =========================================
   UI & APP LOGIC (js/ui.js) - FIXED
   ========================================= */

// --- Global helpers that map to HTML onclicks ---
// These ensure the HTML buttons find the JS functions
window.createNewSong = createNewSong;
window.toEditor = switchToEditor; // Map toEditor -> switchToEditor
window.switchToEditor = switchToEditor;
window.saveEdit = saveEdit;
window.selectImport = selectImport;
window.closeScan = closeScan;

var currentFontScale = 1.0;
var viewMode = 'library'; 
var isLyricsMode = false;
var scrollTimer = null;
var editorTags = [];

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
    
    var demoExists = library.some(s => s.id === "demo_fixed_001" || s.id === "demo_instruction");
    if (!demoExists && typeof DEFAULT_DATA !== 'undefined') {
        library.unshift(ensureSongStructure(DEFAULT_DATA[0])); 
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
    var s = library.find(x => x.id === id); // Use find instead of getSongById
    if(!s) return;
    
    state.t = 0; state.c = 0; 
    parseSongLogic(s); renderPlayer(s);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-player').classList.add('active-view');
    document.getElementById('view-editor').classList.remove('active-view'); // Ensure editor is hidden
    
    // Update Active Item in Sidebar
    var items = document.querySelectorAll('.playlist-item, .song-item');
    items.forEach(i => i.classList.remove('active'));
    var activeItem = document.querySelector(`[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    document.getElementById('sidebar').classList.remove('open');
}

function renderPlayer(s) {
    // Basic Fields
    var titleEl = document.getElementById('p-title'); if(titleEl) titleEl.innerText = s.title;
    var artistEl = document.getElementById('p-artist'); if(artistEl) artistEl.innerText = s.artist || "";
    var keyEl = document.getElementById('p-key'); if(keyEl) keyEl.innerText = getNote(s.key, state.t);

    // Render Logic
    render(s); 
}

// Wrapper for render to match new logic
function render(originalSong) {
    var keyShift = state.t; var chordShift = state.t - state.c;
    
    var pinnedDiv = document.getElementById('pinnedContainer'); 
    var scrollDiv = document.getElementById('outputContent');   
    if(!pinnedDiv || !scrollDiv) return;

    pinnedDiv.innerHTML = ""; scrollDiv.innerHTML = "";
    pinnedDiv.className = isLyricsMode ? "" : "fixed-lyrics";
    scrollDiv.className = "scroll-lyrics";

    var targetForFixed = isLyricsMode ? scrollDiv : pinnedDiv;

    if(state.meta.intro) {
        var d = document.createElement('div'); d.className = 'intro-block';
        d.innerHTML = `<span style="opacity:0.7">INTRO:</span> ` + renderSimple(state.meta.intro, chordShift);
        targetForFixed.appendChild(d);
    }
    if(state.meta.interlude) {
        var d = document.createElement('div'); d.className = 'compact-interlude';
        d.innerHTML = `<span style="opacity:0.7">INTER:</span> ` + renderSimple(state.meta.interlude, chordShift);
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
                var p = document.createElement('div'); p.className = 'compact-line'; p.innerText = L.text; target.appendChild(p);
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
        var sep = document.createElement('div'); sep.style.height = "15px"; target.appendChild(sep);
    });
    
    // Update badges
    var badgeC = document.getElementById('badgeCapo'); if(badgeC) badgeC.innerText = "CAPO: " + state.c;
    var badgeT = document.getElementById('badgeTrans'); if(badgeT) badgeT.innerText = "TRANS: " + state.t;
    var valT = document.getElementById('val-t'); if(valT) valT.innerText = state.t;
    var valC = document.getElementById('val-c'); if(valC) valC.innerText = state.c;
}

function renderSimple(t, s) {
    var parts = t.split('!'), h = "";
    if(parts[0]) h += `<span class="mini-lyric">${parts[0]}</span>`;
    for(var k = 1; k < parts.length; k++) {
        var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        if(m) { 
            h += `<span class="mini-chord" style="color:var(--chord-color);margin-right:5px;font-weight:bold;">${getNote(m[1], s)}</span>`; 
            if(m[2]) h += `<span class="mini-lyric">${m[2]}</span>`; 
        }
        else h += `<span class="mini-lyric">!${parts[k]}</span>`;
    }
    return h;
}

// --- SIDEBAR ---
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); 
    if(!c) return;
    c.innerHTML = "";
    
    var searchEl = document.getElementById('searchInp'); // Matches HTML ID
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
            if (tag === "__no_demo") matchTag = (s.id !== "demo_fixed_001");
            else if (tag !== "") matchTag = (s.playlists && s.playlists.includes(tag));
            return matchTxt && matchTag;
        });
    }
    
    var countEl = document.getElementById('songCount');
    if(countEl) countEl.innerText = visiblePlaylist.length + " songs";

    var ul = document.createElement('ul');
    ul.className = 'song-list'; // Matches CSS
    
    visiblePlaylist.forEach(s => {
        var li = document.createElement('li');
        li.className = 'song-item'; // Matches CSS
        if(s.id === currentSongId) li.classList.add('active');
        li.setAttribute('data-id', s.id);
        
        var isInSet = liveSetlist.includes(s.id);
        var iconAction = (viewMode === 'setlist') 
            ? `<i class="fas fa-minus-circle song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`
            : `<i class="${isInSet ? 'fas fa-check-circle in-setlist' : 'far fa-circle'} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`;
        
        var handle = (viewMode === 'setlist') ? "<span class='drag-handle'><i class='fas fa-grip-vertical'></i></span>" : "";

        li.innerHTML = `${iconAction} <div style="flex:1"><b>${s.title}</b> <span style="font-size:0.8em;opacity:0.7">${s.key}</span></div> ${handle}`;
        
        li.onclick = (e) => { 
            if(e.target.classList.contains('song-action') || e.target.classList.contains('drag-handle')) return;
            loadSong(s.id); 
            if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        };
        ul.appendChild(li);
    });
    c.appendChild(ul);
}

// --- EDITOR ---
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
    } else {
        createNewSong();
    }
}

function createNewSong() {
    currentSongId = null;
    ['inpTitle','inpArtist','inpKey','inpNotes','inpIntro','inpInter','inpBody'].forEach(id => {
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

function saveEdit() { 
    saveSong(); 
    populateTags(); 
    renderSidebar(); 
}

// --- ACTIONS ---
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
    let best = calculateOptimalCapo(s.body);
    state.c = best;
    renderPlayer(s);
    showToast(t('msg_capo_found') + best);
}

// --- TAGS ---
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
    var inp = document.getElementById('inpTags');
    if(inp) inp.value = editorTags.join(',');
}

function renderTagChips() {
    var container = document.getElementById('tagChips');
    if(!container) return;
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
    if(tag && !editorTags.includes(tag)) { editorTags.push(tag); renderTagChips(); }
    document.getElementById('tagInput').value = "";
    document.getElementById('tagSuggestions').style.display = 'none';
}
function removeTag(tag) { editorTags = editorTags.filter(t => t !== tag); renderTagChips(); }

function handleTagInput(inp) {
    var val = inp.value.toLowerCase();
    var sugg = document.getElementById('tagSuggestions');
    if(!val) { sugg.style.display = 'none'; return; }
    
    var allTags = new Set();
    library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    var matches = Array.from(allTags).filter(t => t.toLowerCase().includes(val) && !editorTags.includes(t));

    sugg.innerHTML = "";
    if(matches.length > 0) {
        matches.forEach(m => {
            var div = document.createElement('div'); div.className = 'tag-suggestion-item';
            div.innerHTML = `<span>${m}</span> <i class="fas fa-trash-alt tag-delete-btn"></i>`;
            div.querySelector('.tag-delete-btn').onclick = (e) => { e.stopPropagation(); deleteTagGlobally(m); };
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
function deleteTagGlobally(tag) {
    if(!confirm(t('msg_confirm_tag_delete'))) return;
    library.forEach(s => { s.playlists = s.playlists.filter(t => t !== tag); });
    saveData(); populateTags(); renderTagChips();
}

// --- MISC ---
function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations(); renderSidebar(); populateTags();
}
function applyTranslations() {
    var btn = document.getElementById('btnLang'); if(btn) btn.innerText = (currentLang === 'en') ? 'EN' : 'EL';
}
function showToast(m) { 
    var d = document.getElementById("toast"); 
    d.innerText = m; d.className = "show"; 
    setTimeout(() => d.className = d.className.replace("show", ""), 3000); 
}
function saveData() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function selectImport(type) { if(type==='file') document.getElementById('hiddenFileInput').click(); if(type==='qr') startScanner(); }
function setupGestures() { /* Same as before */ }
function setupEvents() {
    document.getElementById('btnMenu').onclick = function() { document.getElementById('sidebar').classList.toggle('open'); };
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
                    if(added>0) { saveData(); populateTags(); renderSidebar(); alert(t('msg_imported')+added); }
                    else { alert(t('msg_no_import')); }
                    document.getElementById('importChoiceModal').style.display='none';
                } catch(err) { alert(t('msg_error_read')); }
            }; reader.readAsText(file); fileInput.value = '';
        });
    }
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
