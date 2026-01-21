/* =========================================
   UI & RENDERING (SPLIT VIEW EDITION)
   ========================================= */

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

    // --- SPLIT VIEW LOGIC ---
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
    dynPinned.innerHTML = ""; // Καθαρισμός Pinned
    scrollDiv.innerHTML = ""; // Καθαρισμός Scroll
    scrollIntro.style.display = 'none'; 

    // 1. Render INTRO (Στο Pinned)
    if(state.meta.intro) {
        var introDiv = document.createElement('div');
        introDiv.className = 'intro-block';
        introDiv.innerHTML = `<span style="opacity:0.7">INTRO:</span> ` + renderSimple(state.meta.intro, chordShift);
        dynPinned.appendChild(introDiv);
    }

    // 2. Render INTERLUDE (Στο Pinned)
    if(state.meta.interlude) {
        var interDiv = document.createElement('div');
        interDiv.className = 'compact-interlude';
        interDiv.innerHTML = `<span style="opacity:0.7">INTER:</span> ` + renderSimple(state.meta.interlude, chordShift);
        dynPinned.appendChild(interDiv);
    }

    // 3. Render BODY (Split: Verse 1 -> Pinned, Rest -> Scroll)
    var isFirstVerse = true; 
    
    state.parsedChords.forEach(L => {
        if(L.type === 'br') {
            if(isFirstVerse) {
                isFirstVerse = false; 
                return; 
            } else {
                var d = document.createElement('div'); d.style.height = "15px"; 
                scrollDiv.appendChild(d);
                return;
            }
        }

        var targetContainer = isFirstVerse ? dynPinned : scrollDiv;

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

    // UPDATE CONTROLS
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;
    document.getElementById('badgeCapo').innerText = "CAPO: " + state.c;
    document.getElementById('badgeTrans').innerText = "TRANS: " + state.t;
    
    document.getElementById('liveStatusRow').style.display = (state.c !== 0 || state.t !== 0) ? 'flex' : 'none';
    document.getElementById('btnSaveTone').style.display = (state.t !== 0) ? 'block' : 'none';

    generateQR(originalSong);
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

function generateQR(songData) {
    var qrContainer = document.getElementById('playerQR');
    if(!qrContainer) return;
    qrContainer.innerHTML = ""; 
    
    if(typeof QRCode === 'undefined') {
        qrContainer.innerHTML = "<span style='color:red; font-size:10px;'>QR Lib missing</span>";
        return;
    }

    var minSong = {
        t: songData.title,
        k: songData.key,
        b: songData.body,
        i: songData.intro,
        n: songData.interlude
    };

    setTimeout(() => {
        try {
            new QRCode(qrContainer, {
                text: JSON.stringify(minSong),
                width: 128,
                height: 128,
                colorDark : "#2c3e50",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
        } catch(e) { console.error("QR Fail:", e); }
    }, 100);
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
