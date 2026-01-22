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

    // 2. BLOCK LOGIC: Διαχωρισμός σε Pinned (με συγχορδίες) & Scroll (χωρίς)
    
    // Βήμα Α: Ομαδοποίηση γραμμών σε Blocks (χωρίζονται από 'br')
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
    if(currentBlock.length > 0) blocks.push(currentBlock); // Το τελευταίο

    // Βήμα Β: Έλεγχος κάθε μπλοκ και Render
    blocks.forEach((block, index) => {
        // Έλεγχος: Έχει αυτό το μπλοκ συγχορδίες;
        var hasChords = block.some(line => 
            line.type === 'mixed' || (line.tokens && line.tokens.some(t => t.c && t.c.trim() !== ""))
        );

        // Αν έχει συγχορδίες -> Pinned. Αν όχι -> Scroll
        var targetContainer = hasChords ? dynPinned : scrollDiv;

        // Render τις γραμμές του Block
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

        // Προσθήκη κενού μετά από κάθε block (εκτός αν είναι το τελευταίο)
        if(index < blocks.length - 1) {
            // Στο pinned δεν βάζουμε μεγάλα κενά
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
    
    // Ενεργοποίηση Gestures (μία φορά)
    setupGestures();
}

// --- GESTURE LOGIC (PINCH TO ZOOM) ---
var gestureInitialized = false;
function setupGestures() {
    if(gestureInitialized) return;
    gestureInitialized = true;

    var viewer = document.getElementById('viewer-view');
    var startDist = 0;
    var startScale = 1.0;

    viewer.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            // Υπολογισμός αρχικής απόστασης
            startDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            startScale = currentFontScale;
        }
    }, {passive: true});

    viewer.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            // e.preventDefault(); // (Προαιρετικό: Αν θες να μπλοκάρεις το scroll όσο ζουμάρεις)
            
            var dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            // Πόσο μεγάλωσε η απόσταση;
            var scaleChange = dist / startDist;
            var newScale = startScale * scaleChange;
            
            // Όρια Zoom (0.5x έως 3.0x)
            if(newScale < 0.5) newScale = 0.5;
            if(newScale > 3.0) newScale = 3.0;
            
            // Εφαρμογή στη μεταβλητή CSS
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

// Render για Intro/Interlude
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

function generateQR(songData) {
    var qrContainer = document.getElementById('playerQR');
    if(!qrContainer) return;
    
    // Καθαρισμός του container και εμφάνιση μηνύματος "Loading..."
    qrContainer.innerHTML = ""; 
    
    // Έλεγχος αν φορτώθηκε η βιβλιοθήκη
    if(typeof QRCode === 'undefined') {
        qrContainer.innerHTML = "<span style='color:red; font-size:10px;'>QR Lib missing</span>";
        return;
    }

    // Δημιουργία του μικρού αντικειμένου
    var minSong = {
        t: songData.title,
        k: songData.key,
        b: songData.body,
        i: songData.intro,
        n: songData.interlude
    };

    // 1. Μετατροπή σε JSON string
    var jsonText = JSON.stringify(minSong);
    
    // 2. ΤΟ ΣΗΜΑΝΤΙΚΟΤΕΡΟ ΒΗΜΑ (Fix για Ελληνικά)
    // Αυτό συμπιέζει τα ελληνικά χαρακτήρες σε UTF-8 bytes που καταλαβαίνει το QR
    var safeText = unescape(encodeURIComponent(jsonText));

    console.log("Original Size:", jsonText.length, "Safe Size:", safeText.length);

    setTimeout(() => {
        try {
            qrContainer.innerHTML = ""; // Καθαρισμός ξανά για σιγουριά
            
            new QRCode(qrContainer, {
                text: safeText,     // Χρησιμοποιούμε το safeText ΟΧΙ το jsonText
                width: 128,
                height: 128,
                colorDark : "#2c3e50",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L // Low correction για να χωράει περισσότερα
            });
        } catch(e) { 
            console.error("QR Fail:", e);
            qrContainer.innerHTML = "<span style='color:red; font-size:10px;'>QR Error<br>(Too Big)</span>";
        }
    }, 50);
}
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); c.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    if(visiblePlaylist.length === 0) { c.innerHTML = '<div class="empty-msg">Κενή Βιβλιοθήκη</div>'; return; }
    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); d.className = 'playlist-item';
        if(s.id === currentSongId) d.classList.add('active');
        d.innerText = (i + 1) + ". " + s.title;
        d.onclick = () => { currentSongId = s.id; toViewer(true); renderSidebar(); if(window.innerWidth <= 768) toggleSidebar(); };
        c.appendChild(d);
    });
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
}
function clearInputs() {
    document.getElementById('inpTitle').value = ""; document.getElementById('inpKey').value = "";
    document.getElementById('inpNotes').value = ""; document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = ""; document.getElementById('inpBody').value = "";
    document.getElementById('inpTags').value = ""; currentSongId = null;
    document.getElementById('btnDelete').style.display = 'none';
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

    // 1. Βρες όλα τα μοναδικά tags από τη βιβλιοθήκη
    var allTags = new Set();
    library.forEach(song => {
        if(song.playlists && Array.isArray(song.playlists)) {
            song.playlists.forEach(tag => {
                if(tag.trim()) allTags.add(tag.trim());
            });
        }
    });

    // Αν δεν υπάρχουν tags, κρύψε το
    if(allTags.size === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    // 2. Ταξινόμηση αλφαβητικά
    var sortedTags = Array.from(allTags).sort();
    
    // Ποια tags έχει ήδη το τραγούδι που επεξεργαζόμαστε;
    var currentTags = input.value.split(',').map(t => t.trim()).filter(t => t !== "");

    // 3. Δημιουργία buttons
    sortedTags.forEach(tag => {
        var chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerText = tag;
        
        // Αν το τραγούδι έχει ήδη αυτό το tag, χρωμάτισέ το
        if(currentTags.includes(tag)) {
            chip.classList.add('selected');
        }

        // Click Event: Πρόσθεση ή Αφαίρεση
        chip.onclick = function() {
            var val = input.value;
            var tagsNow = val.split(',').map(t => t.trim()).filter(t => t !== "");
            
            if(tagsNow.includes(tag)) {
                // Αφαίρεση (Toggle Off)
                tagsNow = tagsNow.filter(t => t !== tag);
                chip.classList.remove('selected');
            } else {
                // Πρόσθεση (Toggle On)
                tagsNow.push(tag);
                chip.classList.add('selected');
            }
            
            input.value = tagsNow.join(", ");
            // Ενημέρωσε το σύστημα ότι έγιναν αλλαγές (για το unsaved warning)
            hasUnsavedChanges = true;
        };

        container.appendChild(chip);
    });
}
// --- LOGIC ΓΙΑ ΤΟ SCANNER ---
let html5QrCode; // Η μεταβλητή για την κάμερα

function startScanner() {
    // 1. Εμφάνισε το παράθυρο (Modal)
    document.getElementById('scannerModal').style.display = 'flex';

    // 2. Ξεκίνα την κάμερα
    html5QrCode = new Html5Qrcode("reader");
    
    // Ρυθμίσεις κάμερας
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // Προσπάθησε να ανοίξεις την πίσω κάμερα ("environment")
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        console.error("Error starting scanner", err);
        alert("Δεν βρέθηκε κάμερα ή δεν δόθηκε άδεια!");
        stopScanner();
    });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            document.getElementById('scannerModal').style.display = 'none';
        }).catch(err => {
            console.log("Error stopping scanner", err);
            document.getElementById('scannerModal').style.display = 'none';
        });
    } else {
        document.getElementById('scannerModal').style.display = 'none';
    }
}

// Τι συμβαίνει όταν διαβάσει επιτυχώς ένα QR
const onScanSuccess = (decodedText, decodedResult) => {
    // 1. Σταμάτα την κάμερα αμέσως
    stopScanner();

    try {
        let finalJson = decodedText;

        // --- ΔΙΟΡΘΩΣΗ ΓΙΑ ΕΛΛΗΝΙΚΑ ---
        // Δοκιμάζουμε να δούμε αν είναι σωστό JSON. Αν όχι, κάνουμε decode.
        try {
            JSON.parse(finalJson);
        } catch (e) {
            try {
                // Το "κόλπο" για να φτιάξουν τα ελληνικά
                finalJson = decodeURIComponent(escape(decodedText));
            } catch (err2) {
                console.log("Encoding fix failed, using original.");
            }
        }

        // 2. Μετατροπή σε αντικείμενο
        let songData = JSON.parse(finalJson);

        // 3. Έλεγχος & Εισαγωγή
        if (songData.t && songData.b) {
            if(confirm(`Βρέθηκε το τραγούδι:\n"${songData.t}"\n\nΝα γίνει εισαγωγή;`)) {
                // Φόρτωσε τα δεδομένα στα πεδία
                loadInputsFromSong({
                    title: songData.t,
                    key: songData.k,
                    body: songData.b,
                    intro: songData.i,
                    interlude: songData.n,
                    notes: "", 
                    playlists: []
                });
                
                // Πήγαινε στην οθόνη επεξεργασίας
                toEditor(); 
                
                // Κλείσε το μενού αν είσαι σε κινητό
                if(window.innerWidth <= 768) toggleSidebar();
            }
        } else {
            alert("Άκυρο QR Code: Δεν περιέχει τραγούδι mNotes.");
        }

    } catch (error) {
        console.error(error);
        alert("Σφάλμα ανάγνωσης: Το αρχείο είναι κατεστραμμένο.");
    }
};
