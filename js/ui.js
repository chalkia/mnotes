/* =========================================
   UI & RENDERING (SMART PIN & GESTURES)
   ========================================= */

// Μεταβλητή για το μέγεθος γραμματοσειράς (1.0 = normal)
var currentFontScale = 1.0;

function render(originalSong) {
    // 1. Υπολογισμός Μετατόπισης
    var keyShift = state.t; 
    var chordShift = state.t - state.c;

    // Ενημέρωση Header
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, keyShift) : "-";
    
    // Notes Toggle
    var notesBox = document.getElementById('displayNotes');
    var notesBtn = document.getElementById('btnToggleNotes');
    if(state.meta.notes && state.meta.notes.trim() !== "") {
        notesBox.innerText = state.meta.notes;
        notesBtn.style.display = 'inline-block';
    } else { notesBtn.style.display = 'none'; notesBox.style.display = 'none'; }

    // --- SETUP CONTAINERS ---
    var pinnedDiv = document.getElementById('pinnedContainer');
    var scrollDiv = document.getElementById('outputContent');
    var scrollIntro = document.getElementById('scrollIntro'); 
    
    // Δημιουργία ή Καθαρισμός του δυναμικού pinned container
    let dynPinned = document.getElementById('dynamicPinnedContent');
    if(!dynPinned) {
        dynPinned = document.createElement('div');
        dynPinned.id = 'dynamicPinnedContent';
        pinnedDiv.appendChild(dynPinned);
    }
    dynPinned.innerHTML = ""; 
    scrollDiv.innerHTML = ""; 
    scrollIntro.style.display = 'none'; 

    // 1. INTRO & INTERLUDE (Πάντα καρφιτσωμένα)
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

    // 2. BLOCK LOGIC
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

    // Render Blocks
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

    // UPDATE CONTROLS
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;
    document.getElementById('badgeCapo').innerText = "CAPO: " + state.c;
    document.getElementById('badgeTrans').innerText = "TRANS: " + state.t;
    
    document.getElementById('liveStatusRow').style.display = (state.c !== 0 || state.t !== 0) ? 'flex' : 'none';
    document.getElementById('btnSaveTone').style.display = (state.t !== 0) ? 'block' : 'none';

    generateQR(originalSong);
    setupGestures();
}

// --- GESTURE LOGIC ---
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

    if(typeof qrcode === 'undefined') {
        qrContainer.innerHTML = "<span style='color:red; font-size:10px;'>QR Lib missing</span>";
        return;
    }

    try {
        var minSong = {
            t: songData.title,
            k: songData.key,
            b: songData.body,
            i: songData.intro,
            n: songData.interlude
        };
        
        var jsonText = JSON.stringify(minSong);

        // Χρήση της νέας βιβλιοθήκης (Kazuhiko Arase)
        var qr = qrcode(0, 'L');
        qr.addData(jsonText);
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
        qrContainer.innerHTML = `<div style="color:#e67e22; font-size:11px;">⚠️ Error: Too Big</div>`;
    }
}
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); 
    c.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    
    if(visiblePlaylist.length === 0) { 
        c.innerHTML = '<div class="empty-msg">Κενή Βιβλιοθήκη</div>'; 
        return; 
    }

    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); 
        d.className = 'playlist-item';
        d.setAttribute('data-id', s.id); 
        
        if(s.id === currentSongId) d.classList.add('active');
        
        // --- ΑΛΛΑΓΗ 1: Προσθήκη κλάσης 'drag-handle' και λίγο styling για μεγαλύτερο στόχο αφής
        var handle = "<span class='drag-handle' style='color:var(--text-light); margin-right:12px; cursor:grab; padding: 5px 5px 5px 0; font-size:1.2em;'>☰</span>";
        
        // Το κείμενο μπαίνει σε δικό του span για να μην επηρεάζεται
        var titleText = "<span>" + (i + 1) + ". " + s.title + "</span>";
        
        d.innerHTML = handle + titleText;
        
        // Προσοχή: Το click event δεν πρέπει να ενεργοποιείται όταν πατάμε το handle
        // Αλλά το SortableJS συνήθως το διαχειρίζεται.
        d.onclick = (e) => { 
            // Αν πατήσαμε το handle, μην αλλάζεις τραγούδι (προαιρετικό, αλλά βοηθάει)
            if(e.target.classList.contains('drag-handle')) return;

            currentSongId = s.id; 
            toViewer(true); 
            renderSidebar(); 
            if(window.innerWidth <= 768) toggleSidebar(); 
        };
        c.appendChild(d);
    });

    // --- SORTABLE JS ME HANDLE ---
    if(typeof Sortable !== 'undefined') {
        if(window.playlistSortable) window.playlistSortable.destroy();

        window.playlistSortable = Sortable.create(c, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            handle: '.drag-handle', // <--- ΑΛΛΑΓΗ 2: ΜΟΝΟ από το εικονίδιο!
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
}


    // --- ΕΝΕΡΓΟΠΟΙΗΣΗ DRAG & DROP (SortableJS) ---
    if(typeof Sortable !== 'undefined') {
        // Αν υπάρχει ήδη instance, το καταστρέφουμε για να μην έχουμε διπλότυπα
        if(window.playlistSortable) window.playlistSortable.destroy();

        window.playlistSortable = Sortable.create(c, {
            animation: 150, // Ομαλή κίνηση (ms)
            ghostClass: 'sortable-ghost', // Κλάση για το αντικείμενο που σέρνεται
            onEnd: function (evt) {
                // Όταν τελειώσει το σύρσιμο, πρέπει να αλλάξουμε τη σειρά
                // και στον πίνακα visiblePlaylist για να δουλεύουν τα Next/Prev
                var itemEl = evt.item;
                var newIndex = evt.newIndex;
                var oldIndex = evt.oldIndex;

                if(newIndex !== oldIndex) {
                    // Μετακίνηση στο Array (στη μνήμη μόνο!)
                    var movedItem = visiblePlaylist.splice(oldIndex, 1)[0];
                    visiblePlaylist.splice(newIndex, 0, movedItem);
                    
                    // Ξανα-ζωγραφίζουμε τη λίστα για να φτιάξουν τα νούμερα (1. 2. 3...)
                    renderSidebar();
                }
            }
        });
    }
}

function loadInputsFromSong(s) {
    document.getElementById('inpTitle').value = s.title;
    document.getElementById('inpKey').value = s.key;
    document.getElementById('inpNotes').value = s.notes || "";
    document.getElementById('inpIntro').value = s.intro || "";
    document.getElementById('inpInter').value = s.interlude || "";
    document.getElementById('inpBody').value = s.body;
    document.getElementById('inpTags').value = (s.playlists || []).join(", ");
    document.getElementById('btnDelete').style.display = 'inline-block';
    
    // --- ΠΡΟΣΘΗΚΗ: Εμφάνιση των Tags ---
    renderTagCloud(); 
}

function clearInputs() {
    document.getElementById('inpTitle').value = ""; document.getElementById('inpKey').value = "";
    document.getElementById('inpNotes').value = ""; document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = ""; document.getElementById('inpBody').value = "";
    document.getElementById('inpTags').value = ""; currentSongId = null;
    document.getElementById('btnDelete').style.display = 'none';
    
    // --- ΠΡΟΣΘΗΚΗ: Εμφάνιση των Tags (Κενό) ---
    renderTagCloud();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }
function toggleNotes() {
    var box = document.getElementById('displayNotes'); var btn = document.getElementById('btnToggleNotes');
    if(box.style.display === 'none') { box.style.display = 'block'; btn.classList.add('active'); } else { box.style.display = 'none'; btn.classList.remove('active'); }
}
function showToast(m) { var d = document.createElement('div'); d.innerText = m; d.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:20px;z-index:2000;font-size:12px;"; document.body.appendChild(d); setTimeout(() => d.remove(), 2000); }

// --- TAG CLOUD LOGIC ---
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

    if(allTags.size === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    var sortedTags = Array.from(allTags).sort();
    var currentTags = input.value.split(',').map(t => t.trim()).filter(t => t !== "");

    sortedTags.forEach(tag => {
        var chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerText = tag;
        
        if(currentTags.includes(tag)) {
            chip.classList.add('selected');
        }

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
// --- IMPORT MENU LOGIC ---
function showImportMenu() {
    document.getElementById('importChoiceModal').style.display = 'flex';
}

function closeImportChoice() {
    document.getElementById('importChoiceModal').style.display = 'none';
}

function selectImport(type) {
    closeImportChoice(); // Κλείσιμο μενού
    if (type === 'qr') {
        setTimeout(() => { startScanner(); }, 200); 
    } else {
        var fileInput = document.getElementById('hiddenFileInput');
        if(fileInput) fileInput.click();
    }
}

// --- SCANNER LOGIC (ΔΙΟΡΘΩΜΕΝΑ IDs) ---
let html5QrCode; 

function startScanner() {
    // 1. Εμφάνισε το σωστό παράθυρο (qrModal)
    var qrModal = document.getElementById('qrModal');
    if(!qrModal) { console.error("QR Modal not found in HTML"); return; }
    qrModal.style.display = 'flex';

    // 2. Καθαρισμός αν έχει μείνει κάτι παλιό
    if(html5QrCode) {
        try { html5QrCode.clear(); } catch(e) {}
    }

    // 3. Σύνδεση με το σωστό div (qr-reader)
    html5QrCode = new Html5Qrcode("qr-reader"); 
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Scanner Error:", err);
        alert("Δεν βρέθηκε κάμερα ή δεν δόθηκε άδεια!");
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
            console.warn("Stop failed:", err);
            if(qrModal) qrModal.style.display = 'none';
            // Force reload αν κολλήσει
            if(document.querySelector('#qr-reader').innerHTML !== "") {
               window.location.reload(); 
            }
        });
    } else {
        if(qrModal) qrModal.style.display = 'none';
    }
}

function closeQR() { stopScanner(); }

const onScanSuccess = (decodedText, decodedResult) => {
    stopScanner(); 

    try {
        let finalJson = decodedText;
        try { JSON.parse(finalJson); } catch (e) { try { finalJson = decodeURIComponent(escape(decodedText)); } catch (err2) {} }

        let songData = JSON.parse(finalJson);
        if (songData.t && songData.b) {
            setTimeout(() => {
                if(confirm(`Βρέθηκε: "${songData.t}"\nΕισαγωγή;`)) {
                    loadInputsFromSong({
                        title: songData.t, key: songData.k, body: songData.b,
                        intro: songData.i, interlude: songData.n, notes: "", tab: songData.tab || "", playlists: []
                    });
                    toEditor(); 
                    if(window.innerWidth <= 768) toggleSidebar();
                }
            }, 100);
        } else { alert("Άκυρο QR Code."); }
    } catch (error) { 
        console.error(error); 
        alert("Σφάλμα ανάγνωσης QR."); 
    }
}
// --- THEME LOGIC ---
const THEMES = ['theme-dark', 'theme-cream', 'theme-slate'];
let currentThemeIndex = 0;

function cycleTheme() {
    // Αφαίρεση του τρέχοντος theme
    document.body.classList.remove(THEMES[currentThemeIndex]);
    
    // Επόμενο theme
    currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
    
    // Προσθήκη νέου
    let newTheme = THEMES[currentThemeIndex];
    document.body.classList.add(newTheme);
    
    // Αποθήκευση στη μνήμη
    localStorage.setItem('mnotes_theme', newTheme);
}

// Συνάρτηση για να φορτώσει το σωστό theme κατά την εκκίνηση
function loadSavedTheme() {
    let saved = localStorage.getItem('mnotes_theme');
    // Default είναι το Dark (index 0)
    if(saved && THEMES.includes(saved)) {
        document.body.classList.remove('theme-dark'); // Καθαρισμός default
        document.body.classList.add(saved);
        currentThemeIndex = THEMES.indexOf(saved);
    } else {
        document.body.classList.add('theme-dark'); // Default
    }
}
