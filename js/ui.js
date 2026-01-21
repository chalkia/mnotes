/* =========================================
   UI & RENDERING
   ========================================= */

// --- VIEWER ---
function render(originalSong) {
    var sh = state.t - state.c;
    
    // Header
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, sh) : "-";
    
    // Notes
    var notesBox = document.getElementById('displayNotes');
    var notesBtn = document.getElementById('btnToggleNotes');
    if(state.meta.notes && state.meta.notes.trim() !== "") {
        notesBox.innerText = state.meta.notes;
        notesBtn.style.display = 'inline-block';
    } else {
        notesBtn.style.display = 'none';
        notesBox.style.display = 'none';
    }

    // Interlude (Pinned)
    var pinInt = document.getElementById('pinnedInterlude');
    if(state.meta.interlude) {
        pinInt.style.display = 'block';
        pinInt.innerHTML = `<span style="opacity:0.7">INTER:</span> ` + renderSimple(state.meta.interlude, sh);
    } else {
        pinInt.style.display = 'none';
    }

    // Intro (Scroll)
    var scIntro = document.getElementById('scrollIntro');
    if(state.meta.intro) {
        scIntro.style.display = 'block';
        scIntro.innerHTML = `<span style="opacity:0.7">INTRO:</span> ` + renderSimple(state.meta.intro, sh);
    } else {
        scIntro.style.display = 'none';
    }

    // Main Body
    var outDiv = document.getElementById('outputContent');
    outDiv.innerHTML = ""; 

    state.parsedChords.forEach(L => {
        if(L.type === 'br') { 
            var d = document.createElement('div'); d.style.height = "10px"; outDiv.appendChild(d); return; 
        }
        if(L.type === 'lyricOnly') {
            var p = document.createElement('div'); p.className = 'compact-line'; p.innerText = L.text; outDiv.appendChild(p); return;
        }
        var r = document.createElement('div'); r.className = 'line-row';
        L.tokens.forEach(tk => {
            var w = document.createElement('div'); w.className = 'token';
            var c = document.createElement('div'); c.className = 'chord'; c.innerText = getNote(tk.c, sh);
            var tx = document.createElement('div'); tx.className = 'lyric'; tx.innerText = tk.t;
            w.appendChild(c); w.appendChild(tx); r.appendChild(w);
        });
        outDiv.appendChild(r);
    });

    // Values & QR
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;

    var qrDiv = document.getElementById('playerQR');
    qrDiv.innerHTML = "";
    if(originalSong && typeof QRCode !== 'undefined') {
        try {
            new QRCode(qrDiv, { text: JSON.stringify(originalSong), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.L });
        } catch(e) { }
    }
}

function renderSimple(t, s) {
    var parts = t.split('!'), h = "";
    if(parts[0]) h += `<span class="mini-lyric">${parts[0]}</span>`;
    for(var k = 1; k < parts.length; k++) {
        var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        if(m) { h += `<span class="mini-chord" style="color:var(--chord);margin-right:5px;">${getNote(m[1], s)}</span>`; if(m[2]) h += `<span class="mini-lyric">${m[2]}</span>`; }
        else h += `<span class="mini-lyric">!${parts[k]}</span>`;
    }
    return h;
}

// --- SIDEBAR & EDITOR ---
function renderSidebar() {
    var c = document.getElementById('playlistContainer'); c.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    if(visiblePlaylist.length === 0) { c.innerHTML = '<div class="empty-msg">Κενή Βιβλιοθήκη</div>'; return; }
    visiblePlaylist.forEach((s, i) => {
        var d = document.createElement('div'); d.className = 'playlist-item';
        if(s.id === currentSongId) d.classList.add('active');
        d.innerText = (i + 1) + ". " + s.title;
        d.onclick = () => { currentSongId = s.id; toViewer(); renderSidebar(); if(window.innerWidth <= 768) toggleSidebar(); };
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
    var box = document.getElementById('displayNotes');
    var btn = document.getElementById('btnToggleNotes');
    if(box.style.display === 'none') { box.style.display = 'block'; btn.classList.add('active'); } 
    else { box.style.display = 'none'; btn.classList.remove('active'); }
}

function showToast(m) { 
    var d = document.createElement('div'); d.innerText = m; 
    d.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:20px;z-index:2000;font-size:12px;"; 
    document.body.appendChild(d); setTimeout(() => d.remove(), 2000); 
}
