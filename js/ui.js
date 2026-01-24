/* =========================================
   UI & RENDERING (UPDATED)
   ========================================= */

var currentFontScale = 1.0;
var viewMode = 'library'; // 'library' or 'setlist'
var isLyricsMode = false;
var scrollTimer = null;

// --- LANGUAGE ---
function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'el' : 'en';
    localStorage.setItem('mnotes_lang', currentLang);
    applyTranslations();
    renderSidebar(); 
    if(currentSongId === "demo_fixed_001") {
        let s = getSongById(currentSongId);
        s.title = t('demo_title');
        document.getElementById('displayTitle').innerText = s.title;
    }
}

function applyTranslations() {
    var btn = document.getElementById('btnLang');
    if(btn) btn.innerText = (currentLang === 'en') ? 'EN' : 'EL';
    populateTags(); // Update filter text
}

// --- TABS & SETLIST ---
function switchSidebarTab(mode) {
    viewMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    
    // Hide search in setlist
    var searchBox = document.querySelector('.search-box');
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

// --- RENDER SIDEBAR (Updated for Tabs) ---
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); 
    c.innerHTML = "";
    
    // FILTER LOGIC
    visiblePlaylist = [];
    if (viewMode === 'setlist') {
        liveSetlist.forEach(id => {
            var s = getSongById(id);
            if(s) visiblePlaylist.push(s);
        });
    } else {
        var txt = document.getElementById('searchBox').value.toLowerCase();
        var tag = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value : "";
        
        visiblePlaylist = library.filter(s => {
            var matchTxt = s.title.toLowerCase().includes(txt);
            var matchTag = true;
            if (tag === "__no_demo") matchTag = (s.id !== "demo_fixed_001");
            else if (tag !== "") matchTag = (s.playlists && s.playlists.includes(tag));
            return matchTxt && matchTag;
        });
    }
    
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    if(visiblePlaylist.length === 0) { c.innerHTML = '<div class="empty-msg">Empty</div>'; return; }

    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); 
        d.className = 'playlist-item';
        if(s.id === currentSongId) d.classList.add('active');
        
        // Icons
        var isInSet = liveSetlist.includes(s.id);
        var iconAction = (viewMode === 'setlist') 
            ? `<i class="fas fa-minus-circle song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`
            : `<i class="${isInSet ? 'fas fa-check-circle in-setlist' : 'far fa-circle'} song-action" onclick="toggleSetlistSong(event, '${s.id}')"></i>`;
        
        var handle = (viewMode === 'setlist') ? "<span class='drag-handle'><i class='fas fa-grip-vertical'></i></span>" : "";

        d.innerHTML = iconAction + `<span>${s.title}</span>` + handle;
        
        d.onclick = (e) => { 
            if(e.target.classList.contains('song-action') || e.target.classList.contains('drag-handle')) return;
            currentSongId = s.id; toViewer(true); renderSidebar(); 
            if(window.innerWidth <= 768) toggleSidebar(); 
        };
        c.appendChild(d);
    });
    
    // Sortable only for Setlist
    if(typeof Sortable !== 'undefined') {
        if(window.playlistSortable) window.playlistSortable.destroy();
        if(viewMode === 'setlist') {
            window.playlistSortable = Sortable.create(c, {
                animation: 150, handle: '.drag-handle', 
                onEnd: function (evt) {
                    var moved = liveSetlist.splice(evt.oldIndex, 1)[0];
                    liveSetlist.splice(evt.newIndex, 0, moved);
                    localStorage.setItem('mnotes_setlist', JSON.stringify(liveSetlist));
                }
            });
        }
    }
}

// --- RENDER PLAYER (With Merge Logic) ---
function render(originalSong) {
    var keyShift = state.t; var chordShift = state.t - state.c;
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, keyShift) : "-";

    var pinnedDiv = document.getElementById('pinnedContainer'); // Fixed
    var scrollDiv = document.getElementById('outputContent');   // Scroll
    
    pinnedDiv.innerHTML = ""; scrollDiv.innerHTML = "";
    pinnedDiv.className = isLyricsMode ? "" : "fixed-lyrics";
    scrollDiv.className = "scroll-lyrics";

    // --- LYRICS MODE: MERGE EVERYTHING INTO SCROLL DIV ---
    var targetForFixed = isLyricsMode ? scrollDiv : pinnedDiv;

    // 1. Intro/Interlude
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

    // 2. Body Blocks
    var blocks = []; var currentBlock = [];
    state.parsedChords.forEach(L => {
        if(L.type === 'br') { if(currentBlock.length>0) { blocks.push(currentBlock); currentBlock=[]; } }
        else currentBlock.push(L);
    });
    if(currentBlock.length>0) blocks.push(currentBlock);

    blocks.forEach((block, index) => {
        // If Lyrics Mode, everything goes to scrollDiv. 
        // If Normal Mode, check if it has chords to decide Fixed vs Scroll.
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
        // Spacer
        var sep = document.createElement('div'); sep.style.height = "15px"; target.appendChild(sep);
    });

    document.getElementById('liveStatusRow').style.display = 'flex';
    setupGestures();
}

// --- LYRICS MODE TOGGLE ---
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
    // Re-render to merge/unmerge containers
    let s = getSongById(currentSongId);
    if(s) render(s);
}

// --- SMART CAPO ---
function autoCapo() {
    let s = getSongById(currentSongId);
    if(!s) return;
    let best = calculateOptimalCapo(s.body);
    state.c = best;
    render(s); // Re-render with new Capo
    
    document.getElementById('c-val').innerText = state.c;
    if(best === 0) showToast(t('msg_capo_perfect'));
    else showToast(t('msg_capo_found') + best);
}

// --- GESTURES (Double Tap & Pinch) ---
function setupGestures() {
    var viewer = document.getElementById('viewer-view');
    var scroller = document.getElementById('outputContent');
    
    // Pinch Zoom (Existing)
    // ... (Keep existing pinch logic here if you want) ...

    // Double Tap Auto-Scroll
    var lastTap = 0;
    scroller.addEventListener('click', function(e) {
        var currentTime = new Date().getTime();
        var tapLength = currentTime - lastTap;
        if (tapLength < 400 && tapLength > 0) {
            e.preventDefault();
            toggleAutoScroll();
        }
        lastTap = currentTime;
    });
}

function toggleAutoScroll() {
    var el = document.getElementById('outputContent');
    if (scrollTimer) {
        clearInterval(scrollTimer); scrollTimer = null;
        el.style.borderLeft = "none";
    } else {
        el.style.borderLeft = "3px solid var(--accent)";
        scrollTimer = setInterval(() => {
            if (el.scrollTop + el.clientHeight >= el.scrollHeight) toggleAutoScroll();
            else el.scrollTop += 1;
        }, 50);
    }
}

// --- TAGS (Global Delete & Populate) ---
function populateTags() {
    var select = document.getElementById('tagFilter');
    if(!select) return;
    
    // Save current selection
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

// Global Tag Delete (Call from Editor Tag Cloud)
function deleteTagGlobally(tag) {
    if(!confirm(t('msg_confirm_tag_delete'))) return;
    library.forEach(s => {
        s.playlists = s.playlists.filter(t => t !== tag);
    });
    saveData();
    populateTags();
    renderTagCloud(); // Refresh Editor
}

// Update renderTagCloud to include delete button
function renderTagCloud() {
    var container = document.getElementById('tagSuggestions');
    var input = document.getElementById('inpTags');
    // ... (Existing logic) ...
    // Inside the loop where you create chips:
    // chip.oncontextmenu = (e) => { e.preventDefault(); deleteTagGlobally(tag); };
    // Or add a small 'x' button inside the chip for global delete
}
