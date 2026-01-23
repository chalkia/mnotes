/* =========================================
   UI & RENDERING (ENGLISH VERSION)
   ========================================= */

// Font Scale State
var currentFontScale = 1.0;

// --- THEME LOGIC ---
const THEMES = ['theme-dark', 'theme-cream', 'theme-slate'];
let currentThemeIndex = 0;

function cycleTheme() {
    document.body.classList.remove(THEMES[currentThemeIndex]);
    currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
    let newTheme = THEMES[currentThemeIndex];
    document.body.classList.add(newTheme);
    localStorage.setItem('mnotes_theme', newTheme);
}

function loadSavedTheme() {
    let saved = localStorage.getItem('mnotes_theme');
    if(saved && THEMES.includes(saved)) {
        document.body.classList.remove('theme-dark'); 
        document.body.classList.add(saved);
        currentThemeIndex = THEMES.indexOf(saved);
    } else {
        document.body.classList.add('theme-dark'); 
    }
}

// --- VIEW NAVIGATION & READ ONLY LOGIC ---

function toViewer(forceRender = false) {
    let song = getSongById(currentSongId);
    if (!song) return;

    // CHECK: Is it Locked? (Mic Mode Only)
    const locked = (typeof isSongLocked === 'function') ? isSongLocked(song) : false;
    
    if (locked) {
        // --- LOCKED: Force Mic Mode ---
        document.body.classList.add('lyrics-only');
        
        // Hide Edit Button (Security)
        var editBtn = document.getElementById('btnEdit');
        if(editBtn) editBtn.style.display = 'none';

        // Show Exit Button
        var exitBtn = document.getElementById('exitKaraokeBtn');
        if(exitBtn) exitBtn.style.display = 'flex';

    } else {
        // --- UNLOCKED: Normal Player ---
        document.body.classList.remove('lyrics-only');

        // Restore Buttons
        var editBtn = document.getElementById('btnEdit');
        if(editBtn) editBtn.style.display = 'inline-flex';
        
        var exitBtn = document.getElementById('exitKaraokeBtn');
        if(exitBtn) exitBtn.style.display = 'flex'; 
    }

    // Switch Views
    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'flex';
    document.getElementById('sidebar').classList.remove('active');
    
    render(song);
}

function toEditor() {
    let song = getSongById(currentSongId);
    
    // Check Lock Status
    const isLocked = (song && typeof isSongLocked === 'function') ? isSongLocked(song) : false;

    // Switch Views
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('sidebar').classList.remove('active');
    
    if(song) {
        loadInputsFromSong(song);
        
        // --- READ ONLY MODE LOGIC ---
        // If locked, disable inputs but allow DELETE
        if (isLocked) {
            setEditorReadOnly(true);
            showToast("Restricted Mode: Read & Delete Only");
        } else {
            setEditorReadOnly(false);
        }
    } else {
        clearInputs();
        setEditorReadOnly(false); // New songs are editable
    }
}

// Helper to freeze/unfreeze editor
function setEditorReadOnly(locked) {
    const inputs = [
        'inpTitle', 'inpKey', 'inpNotes', 'inpIntro', 
        'inpInter', 'inpBody', 'inpTags'
    ];
    
    inputs.forEach(id => {
        let el = document.getElementById(id);
        if(el) {
            el.disabled = locked; 
            el.style.opacity = locked ? "0.6" : "1";
            el.style.cursor = locked ? "not-allowed" : "text";
        }
    });

    // Handle Buttons
    const btnSave = document.getElementById('btnSave'); 
    const btnDelete = document.getElementById('btnDelete');
    
    // Hide Save if locked
    if(btnSave) btnSave.style.display = locked ? 'none' : 'inline-block';
    
    // Always show Delete (so they can free up space)
    // BUT protect the Demo song (logic.js handles that check)
    if(btnDelete) btnDelete.style.display = 'inline-block'; 
}

// --- RENDER FUNCTION ---
function render(originalSong) {
    var keyShift = state.t; 
    var chordShift = state.t - state.c;

    // Header
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, keyShift) : "-";
    
    // Notes Toggle
    var notesBox = document.getElementById('displayNotes');
    var notesBtn = document.getElementById('btnToggleNotes');
    if(state.meta.notes && state.meta.notes.trim() !== "") {
        notesBox.innerText = state.meta.notes;
        notesBtn.style.display = 'inline-block';
    } else { notesBtn.style.display = 'none'; notesBox.style.display = 'none'; }

    // Setup Containers
    var pinnedDiv = document.getElementById('pinnedContainer');
    var scrollDiv = document.getElementById('outputContent');
    var scrollIntro = document.getElementById('scrollIntro'); 
    
    let dynPinned = document.getElementById('dynamicPinnedContent');
    if(!dynPinned) {
        dynPinned = document.createElement('div');
        dynPinned.id = 'dynamicPinnedContent';
        pinnedDiv.appendChild(dynPinned);
    }
    dynPinned.innerHTML = ""; 
    scrollDiv.innerHTML = ""; 
    scrollIntro.style.display = 'none'; 

    // Intro & Interlude Pinned
    if(state.meta.intro) {
        var introDiv = document.createElement('div');
        introDiv.className = 'intro-block';
        introDiv.innerHTML = `<span style="opacity:0.7">INTRO:</span> ` + renderSimple(state.meta.intro, chordShift);
        dynPinned.appendChild(introDiv);
    }
    if(state.meta.interlude) {
        var interDiv = document.createElement('div');
        interDiv.className = 'compact-interlude';
        interDiv.innerHTML = `<span style="opacity:0.7">INTER:</span> ` + renderSimple(state.meta.interlude, chordShift);
        dynPinned.appendChild(interDiv);
    }

    // Block Logic
    var blocks = [];
    var currentBlock = [];
    
    state.parsedChords.forEach(L => {
        if(L.type === 'br') {
            if(currentBlock.length > 0) {
                blocks.push(currentBlock);
                currentBlock = [];
            }
        } else {
            currentBlock.push(L);
        }
    });
    if(currentBlock.length > 0) blocks.push(currentBlock); 

    blocks.forEach((block, index) => {
        var hasChords = block.some(line => 
            line.type === 'mixed' || (line.tokens && line.tokens.some(t => t.c && t.c.trim() !== ""))
        );

        var targetContainer = hasChords ? dynPinned : scrollDiv;

        block.forEach(L => {
            if(L.type === 'lyricOnly') {
                var p = document.createElement('div');
                p.className = 'compact-line';
                p.innerText = L.text;
                targetContainer.appendChild(p);
            } else {
                var r = document.createElement('div'); 
                r.className = 'line-row';
                L.tokens.forEach(tk => {
                    var w = document.createElement('div'); w.className = 'token';
                    var c = document.createElement('div'); c.className = 'chord'; 
                    c.innerText = getNote(tk.c, chordShift); 
                    var tx = document.createElement('div'); tx.className = 'lyric'; 
                    tx.innerText = tk.t;
                    w.appendChild(c); w.appendChild(tx); r.appendChild(w);
                });
                targetContainer.appendChild(r);
            }
        });

        if(index < blocks.length - 1) {
            if(hasChords) {
                var sep = document.createElement('div'); sep.style.height = "10px";
                dynPinned.appendChild(sep);
            } else {
                var d = document.createElement('div'); d.style.height = "20px"; 
                scrollDiv.appendChild(d);
            }
        }
    });

    // Update Controls
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;
    document.getElementById('badgeCapo').innerText = "CAPO: " + state.c;
    document.getElementById('badgeTrans').innerText = "TRANS: " + state.t;
    
    document.getElementById('liveStatusRow').style.display = (state.c !== 0 || state.t !== 0) ? 'flex' : 'none';
    document.getElementById('btnSaveTone').style.display = (state.t !== 0) ? 'block' : 'none';

    generateQR(originalSong);
    setupGestures();
}

// --- GESTURES (PINCH ZOOM) ---
var gestureInitialized = false;
function setupGestures() {
    if(gestureInitialized) return;
    gestureInitialized = true;

    var viewer = document.getElementById('viewer-view');
    var startDist = 0;
    var startScale = 1.0;

    viewer.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            startDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            startScale = currentFontScale;
        }
    }, {passive: true});

    viewer.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            var dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            var scaleChange = dist / startDist;
            var newScale = startScale * scaleChange;
            if(newScale < 0.5) newScale = 0.5;
            if(newScale > 3.0) newScale = 3.0;
            document.documentElement.style.setProperty('--font-scale', newScale);
            currentFontScale = newScale;
        }
    }, {passive: false});

    viewer.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) {
            startScale = currentFontScale;
        }
    });
}

function renderSimple(t, s) {
    var parts = t.split('!'), h = "";
    if(parts[0]) h += `<span class="mini-lyric">${parts[0]}</span>`;
    for(var k = 1; k < parts.length; k++) {
        var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        if(m) { 
            h += `<span class="mini-chord" style="color:var(--chord);margin-right:5px;font-weight:bold;">${getNote(m[1], s)}</span>`; 
            if(m[2]) h += `<span class="mini-lyric">${m[2]}</span>`; 
        }
        else h += `<span class="mini-lyric">!${parts[k]}</span>`;
    }
    return h;
}

// --- QR CODE GENERATION ---
function generateQR(songData) {
    var qrContainer = document.getElementById('playerQR');
    if(!qrContainer) return;
    qrContainer.innerHTML = ""; 

    // BLOCK FREE USER
    if (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) {
        qrContainer.innerHTML = `<div style="text-align:center; padding:10px; opacity:0.6;">
            <i class="fas fa-lock" style="font-size:20px; margin-bottom:5px;"></i><br>
            <span style="font-size:12px;">Sharing is Premium Only</span>
        </div>`;
        return;
    }

    if(typeof qrcode === 'undefined') {
        qrContainer.innerHTML = "<span style='color:red; font-size:10px;'>QR Lib missing</span>";
        return;
    }

    try {
        var minSong = {
            t: songData.title,
            k: songData.key,
            b: songData.body,
            i: songData.intro || "",
            n: songData.interlude || ""
        };

        var jsonText = JSON.stringify(minSong);
        var utf8Json = unescape(encodeURIComponent(jsonText));

        var qr = qrcode(0, 'L');
        qr.addData(utf8Json);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(4, 0); 
        
        var img = qrContainer.querySelector('img');
        if(img) {
            img.style.display = "block";
            img.style.margin = "0 auto";
            img.style.maxWidth = "100%";
            img.style.height = "auto";
        }
    } catch(e) {
        console.error("QR Gen Error:", e);
        qrContainer.innerHTML = `<div style="color:#e67e22; font-size:11px;">⚠️ Song too large for QR.</div>`;
    }
}

// --- SIDEBAR & LIST ---
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); 
    c.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    
    if(visiblePlaylist.length === 0) { 
        c.innerHTML = '<div class="empty-msg">Library Empty</div>'; 
        checkPremiumUI(); 
        return; 
    }

    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); 
        d.className = 'playlist-item';
        d.setAttribute('data-id', s.id); 
        
        if(s.id === currentSongId) d.classList.add('active');
        
        var handle = "<span class='drag-handle' style='color:var(--text-light); margin-right:10px; cursor:grab; padding: 5px;'><i class='fas fa-grip-vertical'></i></span>";
        
        // Lock Icon & Demo Icon
        var isLocked = (typeof isSongLocked === 'function') ? isSongLocked(s) : false;
        var icon = "";
        
        if (s.id === "demo_fixed_001") {
             icon = "<i class='fas fa-star' style='color:#f1c40f; margin-left:5px; font-size:0.8em;' title='Demo'></i>";
        } else if (isLocked) {
             icon = "<i class='fas fa-microphone' style='color:var(--accent); margin-left:5px; font-size:0.8em;' title='Mic Mode Only'></i>";
        }

        var titleText = "<span>" + (i + 1) + ". " + s.title + icon + "</span>";
        
        d.innerHTML = handle + titleText;
        
        d.onclick = (e) => { 
            if(e.target.classList.contains('drag-handle')) return;
            currentSongId = s.id; 
            toViewer(true); 
            renderSidebar(); 
            if(window.innerWidth <= 768) toggleSidebar(); 
        };
        c.appendChild(d);
    });

    if(typeof Sortable !== 'undefined') {
        if(window.playlistSortable) window.playlistSortable.destroy();
        window.playlistSortable = Sortable.create(c, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            handle: '.drag-handle', 
            onEnd: function (evt) {
                var newIndex = evt.newIndex;
                var oldIndex = evt.oldIndex;
                if(newIndex !== oldIndex) {
                    var movedItem = visiblePlaylist.splice(oldIndex, 1)[0];
                    visiblePlaylist.splice(newIndex, 0, movedItem);
                    renderSidebar();
                }
            }
        });
    }
    checkPremiumUI();
}

function loadInputsFromSong(s) {
    document.getElementById('inpTitle').value = s.title;
    document.getElementById('inpKey').value = s.key;
    document.getElementById('inpNotes').value = s.notes || "";
    document.getElementById('inpIntro').value = s.intro || "";
    document.getElementById('inpInter').value = s.interlude || "";
    document.getElementById('inpBody').value = s.body;
    document.getElementById('inpTags').value = (s.playlists || []).join(", ");
    
    // DEMO: Hide delete for Demo Song
    if (s.id === "demo_fixed_001") {
        document.getElementById('btnDelete').style.display = 'none';
    } else {
        document.getElementById('btnDelete').style.display = 'inline-block';
    }

    renderTagCloud(); 
}

function clearInputs() {
    document.getElementById('inpTitle').value = ""; document.getElementById('inpKey').value = "";
    document.getElementById('inpNotes').value = ""; document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = ""; document.getElementById('inpBody').value = "";
    document.getElementById('inpTags').value = ""; currentSongId = null;
    document.getElementById('btnDelete').style.display = 'none';
    renderTagCloud();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

function toggleNotes() {
    var box = document.getElementById('displayNotes'); var btn = document.getElementById('btnToggleNotes');
    if(box.style.display === 'none') { box.style.display = 'block'; btn.classList.add('active'); } else { box.style.display = 'none'; btn.classList.remove('active'); }
}

function showToast(m) { 
    var d = document.createElement('div'); d.innerText = m; 
    d.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:20px;z-index:2000;font-size:12px;"; 
    document.body.appendChild(d); 
    setTimeout(() => d.remove(), 2000); 
}

// --- TAG CLOUD ---
function renderTagCloud() {
    var container = document.getElementById('tagSuggestions');
    var input = document.getElementById('inpTags');
    if(!container || !input) return;

    container.innerHTML = "";
    var allTags = new Set();
    library.forEach(song => {
        if(song.playlists && Array.isArray(song.playlists)) {
            song.playlists.forEach(tag => {
                if(tag.trim()) allTags.add(tag.trim());
            });
        }
    });

    if(allTags.size === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';

    var sortedTags = Array.from(allTags).sort();
    var currentTags = input.value.split(',').map(t => t.trim()).filter(t => t !== "");

    sortedTags.forEach(tag => {
        var chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerText = tag;
        if(currentTags.includes(tag)) chip.classList.add('selected');

        chip.onclick = function() {
            var val = input.value;
            var tagsNow = val.split(',').map(t => t.trim()).filter(t => t !== "");
            if(tagsNow.includes(tag)) {
                tagsNow = tagsNow.filter(t => t !== tag);
                chip.classList.remove('selected');
            } else {
                tagsNow.push(tag);
                chip.classList.add('selected');
            }
            input.value = tagsNow.join(", ");
            hasUnsavedChanges = true;
        };
        container.appendChild(chip);
    });
}

// --- IMPORT MENU ---
function showImportMenu() { document.getElementById('importChoiceModal').style.display = 'flex'; }
function closeImportChoice() { document.getElementById('importChoiceModal').style.display = 'none'; }

function selectImport(type) {
    closeImportChoice(); 
    if (type === 'qr') {
        setTimeout(() => { startScanner(); }, 200); 
    } else {
        var fileInput = document.getElementById('hiddenFileInput');
        if(fileInput) fileInput.click();
    }
}

// --- SCANNER LOGIC ---
let html5QrCode; 

function startScanner() {
    var qrModal = document.getElementById('qrModal');
    if(!qrModal) return;
    qrModal.style.display = 'flex';
    if(html5QrCode) { try { html5QrCode.clear(); } catch(e) {} }

    html5QrCode = new Html5Qrcode("qr-reader"); 
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Scanner Error:", err);
        alert("Camera not found or permission denied.");
        stopScanner();
    });
}

function stopScanner() {
    var qrModal = document.getElementById('qrModal');
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            if(qrModal) qrModal.style.display = 'none';
        }).catch(err => {
            if(qrModal) qrModal.style.display = 'none';
            if(document.querySelector('#qr-reader').innerHTML !== "") window.location.reload(); 
        });
    } else {
        if(qrModal) qrModal.style.display = 'none';
    }
}
function closeQR() { stopScanner(); }

// --- SCAN SUCCESS ---
const onScanSuccess = (decodedText, decodedResult) => {
    stopScanner(); 

    try {
        let fixedText = decodedText;
        try { fixedText = decodeURIComponent(escape(decodedText)); } catch (e) {}
        let songData = JSON.parse(fixedText);

        if (songData.t && songData.b) {
            setTimeout(() => {
                if(confirm(`Found: "${songData.t}"\nSave to library?`)) {
                    
                    const unlockedCount = library.filter(s => !s.isLocked).length;
                    const shouldLock = (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) 
                                      && (unlockedCount >= USER_STATUS.freeLimit);

                    var newSong = {
                        id: Date.now().toString(),
                        title: songData.t,
                        key: songData.k || "",
                        body: songData.b,
                        intro: songData.i || "",
                        interlude: songData.n || "",
                        notes: "",
                        playlists: [],
                        isLocked: shouldLock 
                    };

                    if (typeof library === 'undefined') library = [];
                    library.push(newSong);
                    localStorage.setItem('mnotes_data', JSON.stringify(library));

                    currentSongId = newSong.id;
                    if(typeof filterPlaylist === 'function') filterPlaylist();
                    renderSidebar(); 
                    toViewer(true); 
                    
                    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
                    
                    if(shouldLock) alert("Song saved in Mic Mode (Free Limit).");
                }
            }, 200);
        } else { alert("Invalid QR Code."); }
    } catch (error) { alert("Data read error."); }
};

// --- SIDEBAR SWIPE GESTURE ---
function setupSidebarSwipe() {
    const sidebar = document.getElementById('sidebar');
    let touchStartX = 0;
    let touchEndX = 0;

    sidebar.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    sidebar.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 70) sidebar.classList.remove('active');
    }, {passive: true});
}

// --- ADMIN & SHARE & KARAOKE (CONTROLS) ---

// 1. ADMIN SWITCH (2204)
function setupAdminSwitch() {
    const logo = document.getElementById('appLogo');
    const badge = document.getElementById('statusBadge');
    if(!logo || !badge) return;

    if (USER_STATUS.isPremium) {
        badge.innerText = "PRO";
        badge.style.background = "linear-gradient(45deg, #f1c40f, #d35400)";
        badge.style.color = "#000";
        badge.style.fontWeight = "bold";
    } else {
        badge.innerText = "FREE";
        badge.style.background = "#7f8c8d";
        badge.style.color = "#fff";
    }

    let tapCount = 0;
    let tapTimer = null;

    logo.addEventListener('click', () => {
        tapCount++;
        if (tapCount === 1) {
            tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
        }
        if (tapCount === 5) {
            clearTimeout(tapTimer);
            tapCount = 0;
            const pass = prompt("ADMIN MODE:\nEnter Password:");
            if (pass === "2204") { 
                setPremiumStatus(!USER_STATUS.isPremium);
            } else if (pass !== null) alert("⛔ Wrong Password!");
        }
    });
}

// 2. TOGGLE KARAOKE (SMART EXIT for Locked Songs)
function toggleKaraoke() {
    let song = getSongById(currentSongId);
    
    // Check if song is locked
    const isLocked = (song && typeof isSongLocked === 'function') ? isSongLocked(song) : false;

    // CASE A: Locked Song Exit -> Go to Read Only Editor to allow Delete/Nav
    if (isLocked) {
        // We do NOT toggle class. We force Exit to Editor (Read Only)
        // This allows user to see the "Delete" button or use sidebar
        document.body.classList.remove('lyrics-only');
        toEditor(); 
        
        // Open sidebar to help navigation
        document.getElementById('sidebar').classList.add('active'); 
        showToast("Exit Mic Mode");
        return;
    }

    // CASE B: Normal Toggle
    document.body.classList.toggle('lyrics-only');
    
    if (document.body.classList.contains('lyrics-only')) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

// 3. SMART SHARE BUTTON (Mobile Share / Desktop Export)
async function shareSetlist() {
    if (!visiblePlaylist || visiblePlaylist.length === 0) {
        showToast("Library is empty!");
        return;
    }

    if (typeof USER_STATUS !== 'undefined' && !USER_STATUS.isPremium) {
        alert("🔒 Social Sharing is a Premium Feature.");
        return;
    }

    try {
        const dataStr = JSON.stringify(visiblePlaylist, null, 2);
        const fileName = `Setlist_${new Date().toISOString().slice(0,10)}.mnote`;
        const file = new File([dataStr], fileName, { type: "application/json" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'mNotes Setlist',
                text: 'Rehearsal Setlist (mNotes)',
                files: [file]
            });
            showToast("Shared!");
            return; 
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn("Share failed, falling back to download.");
    }

    // Fallback to Download
    if(typeof exportJSON === 'function') {
        exportJSON(); 
        showToast("File downloaded (Manual Share).");
    } else {
        alert("Export function missing.");
    }
}

// 4. UI CHECK (Hide Export for Free)
function checkPremiumUI() {
    var btnExport = document.getElementById('btnExport');
    if(btnExport) btnExport.style.display = USER_STATUS.isPremium ? 'flex' : 'none';
}
