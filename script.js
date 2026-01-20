/* =========================================
   1. CONFIG & GLOBALS
   ========================================= */
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

var library = [];
var visiblePlaylist = [];
var currentSongId = null;
var currentFilter = "ALL";
// State includes new 'notes' field
var state = { t: 0, c: 0, parsedChords: [], parsedLyrics: [], meta: {} };
var html5QrcodeScanner = null;

/* =========================================
   2. STARTUP
   ========================================= */
window.onload = function() {
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            library = JSON.parse(savedData);
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) { console.error(e); }
    }
    if(window.innerWidth <= 768 || library.length > 0) toViewer(); else toEditor();
};

/* =========================================
   3. MOBILE & QR IMPORT
   ========================================= */
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

function startQR() {
    document.getElementById('qrModal').style.display = "flex";
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decodedText) => {
        try {
            var data = JSON.parse(decodedText);
            if(Array.isArray(data)) {
                if(confirm("Import Library (" + data.length + " songs)?")) { library = data; finalizeImport(); }
            } else if(data.title && data.body) {
                if(confirm("Import song: " + data.title + "?")) {
                    data.id = Date.now().toString(); library.push(data); currentSongId = data.id; finalizeImport();
                }
            } else alert("Invalid QR");
        } catch(e) { console.log("Not JSON"); }
    }).catch(err => console.error(err));
}

function finalizeImport() { saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); closeQR(); toViewer(); alert("Success!"); }
function closeQR() { if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => { html5QrcodeScanner.clear(); document.getElementById('qrModal').style.display = "none"; }); else document.getElementById('qrModal').style.display = "none"; }

/* =========================================
   4. NAVIGATION & NOTES TOGGLE
   ========================================= */
function toEditor() {
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('transUI').style.display = 'none';
    if(currentSongId === null) clearInputs();
    else { var s = library.find(x => x.id === currentSongId); if(s) loadInputsFromSong(s); }
}

function toViewer() {
    if(library.length === 0) { toEditor(); return; }
    if(currentSongId === null && visiblePlaylist.length > 0) currentSongId = visiblePlaylist[0].id;
    if(currentSongId !== null) { var s = library.find(x => x.id === currentSongId); if(s) parseAndRender(s); }
    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'flex';
    document.getElementById('transUI').style.display = 'flex';
}

function toggleNotes() {
    var box = document.getElementById('displayNotes');
    var btn = document.getElementById('btnToggleNotes');
    if(box.style.display === 'none') {
        box.style.display = 'block';
        btn.classList.add('active');
    } else {
        box.style.display = 'none';
        btn.classList.remove('active');
    }
}

/* =========================================
   5. LIBRARY LOGIC
   ========================================= */
function saveToLocal() { localStorage.setItem('mnotes_data', JSON.stringify(library)); }

function saveSong() {
    var t = document.getElementById('inpTitle').value;
    if(!t) { alert("Title is required!"); return; }
    var tags = document.getElementById('inpTags').value.split(',').map(x => x.trim()).filter(x => x.length > 0);
    
    var s = {
        id: currentSongId || Date.now().toString(),
        title: t,
        key: document.getElementById('inpKey').value,
        notes: document.getElementById('inpNotes').value, // Save Notes
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value,
        playlists: tags
    };

    if(currentSongId) { var i = library.findIndex(x => x.id === currentSongId); if(i !== -1) library[i] = s; }
    else { library.push(s); currentSongId = s.id; }
    saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); alert("Saved!");
}

function deleteCurrentSong() {
    if(currentSongId && confirm("Delete song?")) {
        library = library.filter(x => x.id !== currentSongId); currentSongId = null;
        saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); clearInputs(); toEditor();
    }
}

function filterPlaylist() {
    var v = document.getElementById('playlistSelect').value; currentFilter = v;
    visiblePlaylist = (v === "ALL") ? library : library.filter(s => s.playlists.includes(v));
    renderSidebar();
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
}

function updatePlaylistDropdown() {
    var s = document.getElementById('playlistSelect'), o = s.value, all = new Set();
    library.forEach(x => x.playlists.forEach(t => all.add(t)));
    s.innerHTML = '<option value="ALL">📂 Όλα τα τραγούδια</option>';
    all.forEach(t => { var op = document.createElement('option'); op.value = t; op.innerText = "💿 " + t; s.appendChild(op); });
    s.value = o; if(s.value !== o) s.value = "ALL";
}

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
    document.getElementById('inpNotes').value = s.notes || ""; // Load Notes
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

/* =========================================
   6. PARSING & RENDERING
   ========================================= */
function parseAndRender(s) {
    state.parsedChords = []; state.parsedLyrics = [];
    state.meta = { title: s.title, key: s.key, notes: s.notes, intro: s.intro, interlude: s.interlude };
    state.t = 0; state.c = 0;

    var blocks = (s.body || "").split(/\n\s*\n/);
    var isScrolling = false;
    blocks.forEach(b => {
        if(!b.trim()) return;
        if(!isScrolling) {
            if(b.includes('!') || b.includes('|')) {
                var p = parseBlock(b);
                state.parsedChords.push(...p); state.parsedChords.push({type:'br'});
            } else { isScrolling = true; state.parsedLyrics.push(b); }
        } else state.parsedLyrics.push(b);
    });
    render(s); // Pass full song object for QR generation
}

function parseBlock(text) {
    var out = [], lines = text.split('\n');
    for(var i = 0; i < lines.length; i++) {
        var l = lines[i].trimEnd();
        if(!l) continue;
        var parts = l.split('!'), tokens = [];
        if(parts[0]) tokens.push(analyzeToken("", parts[0]));
        for(var k = 1; k < parts.length; k++) {
            var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
            if(m) tokens.push(analyzeToken(m[1], m[2]));
            else tokens.push(analyzeToken("", "!" + parts[k]));
        }
        out.push({type:'line', tokens:tokens});
    }
    return out;
}

function analyzeToken(c, t) {
    var isStruct = /^[\s|/(),x0-9]+$/.test(t);
    if(isStruct && c === "") return {c:t, t:""};
    if(isStruct && c !== "") return {c:c+" "+t, t:""};
    return {c:c, t:t};
}

function render(originalSong) {
    var sh = state.t - state.c;
    
    // 1. Meta & Notes
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('displayMeta').innerText = state.meta.key ? "Key: " + getNote(state.meta.key, sh) : "";
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, sh) : "-";
    
    // Notes Logic
    var notesBox = document.getElementById('displayNotes');
    var notesBtn = document.getElementById('btnToggleNotes');
    if(state.meta.notes) {
        notesBox.innerText = state.meta.notes;
        notesBtn.style.display = 'inline-block';
    } else {
        notesBtn.style.display = 'none';
        notesBox.style.display = 'none';
    }

    // 2. Intro/Interlude
    var sb = document.getElementById('structureBox');
    if(state.meta.intro || state.meta.interlude) {
        sb.style.display = 'block';
        document.getElementById('displayIntro').innerHTML = state.meta.intro ? 
            `<div class="struct-line"><span class="struct-label">INTRO:</span> ${renderSimple(state.meta.intro, sh)}</div>` : "";
        document.getElementById('displayInter').innerHTML = state.meta.interlude ? 
            `<div class="struct-line"><span class="struct-label">INTER:</span> ${renderSimple(state.meta.interlude, sh)}</div>` : "";
    } else sb.style.display = 'none';

    // 3. Pinned Chords
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;
    
    var dc = document.getElementById('outputChords'); dc.innerHTML = "";
    state.parsedChords.forEach(L => {
        if(L.type === 'br') { var d = document.createElement('div'); d.style.height = "10px"; dc.appendChild(d); return; } // Μείωσα το κενό γραμμής
        var r = document.createElement('div'); r.className = 'line-row';
        L.tokens.forEach(tk => {
            var w = document.createElement('div'); w.className = 'token';
            var c = document.createElement('div'); c.className = 'chord'; c.innerText = getNote(tk.c, sh);
            var tx = document.createElement('div'); tx.className = 'lyric'; tx.innerText = tk.t;
            w.appendChild(c); w.appendChild(tx); r.appendChild(w);
        });
        dc.appendChild(r);
    });

    document.getElementById('splitDivider').style.display = (state.parsedLyrics.length > 0) ? 'block' : 'none';

    // 4. Scroll Lyrics
    var dl = document.getElementById('outputLyrics'); dl.innerHTML = "";
    state.parsedLyrics.forEach(b => {
        var p = document.createElement('div'); p.className = 'compact-line'; p.innerText = b; dl.appendChild(p);
        var sp = document.createElement('div'); sp.style.height = "15px"; dl.appendChild(sp);
    });

    // 5. Generate QR at the bottom
    var qrDiv = document.getElementById('playerQR');
    qrDiv.innerHTML = "";
    if(originalSong) {
        // Χρησιμοποιούμε το originalSong (χωρίς transpose) για διαμοιρασμό
        // Ή αν θες να στέλνεις το transpose, πρέπει να φτιάξεις νέο object.
        // Εδώ στέλνουμε το Original.
        new QRCode(qrDiv, {
            text: JSON.stringify(originalSong),
            width: 150, height: 150, correctLevel: QRCode.CorrectLevel.L
        });
    }
}

function renderSimple(t, s) {
    var parts = t.split('!'), h = "";
    if(parts[0]) h += `<span class="mini-lyric">${parts[0]}</span>`;
    for(var k = 1; k < parts.length; k++) {
        var m = parts[k].match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        if(m) { h += `<span class="mini-chord">${getNote(m[1], s)}</span>`; if(m[2]) h += `<span class="mini-lyric">${m[2]}</span>`; }
        else h += `<span class="mini-lyric">!${parts[k]}</span>`;
    }
    return h;
}

/* =========================================
   7. UTILS
   ========================================= */
function getNote(n, s) {
    if(!n || /[|/x(),]/.test(n) && !/[A-G]/.test(n)) return n;
    return n.replace(/([A-G][#b]?)([a-zA-Z0-9]*)/g, (m, r, sx) => {
        var i = NOTES.indexOf(r);
        if(i === -1 && r.includes('b')) i = (NOTES.indexOf(r[0]) - 1 + 12) % 12;
        if(i === -1) return m;
        var ni = (i + s) % 12; if(ni < 0) ni += 12;
        return NOTES[ni] + sx;
    });
}
function addTrans(n) { state.t += n; render(library.find(x=>x.id===currentSongId)); }
function addCapo(n) { if(state.c + n >= 0) { state.c += n; render(library.find(x=>x.id===currentSongId)); } }

function findSmartCapo() {
    var s = new Set();
    state.parsedChords.forEach(l => { if(l.tokens) l.tokens.forEach(t => { if(t.c && /[A-G]/.test(t.c)) s.add(getNote(t.c, state.t).split('/')[0].replace(/m|dim|aug|sus|7|9/g,"") + (t.c.includes('m') ? 'm' : '')); }); });
    if(s.size === 0) { alert("No chords found!"); return; }
    var best = 0, min = Infinity;
    for(var c = 0; c <= 5; c++) {
        var sc = 0; s.forEach(ch => { var v = getNote(ch, -c); if(EASY_CHORDS.includes(v)) sc += 0; else if(OK_CHORDS.includes(v)) sc += 1; else sc += 3; });
        if(sc < min) { min = sc; best = c; }
    }
    if(best === state.c) showToast("👍 Best!"); else { state.c = best; render(library.find(x=>x.id===currentSongId)); showToast("Capo " + best); }
}
function showToast(m) { var d = document.createElement('div'); d.innerText = m; d.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:10px 20px;border-radius:20px;z-index:2000;"; document.body.appendChild(d); setTimeout(() => d.remove(), 2000); }

function nextSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i < visiblePlaylist.length - 1) { currentSongId = visiblePlaylist[i + 1].id; toViewer(); renderSidebar(); } }
function prevSong() { if(visiblePlaylist.length === 0) return; var i = visiblePlaylist.findIndex(s => s.id === currentSongId); if(i > 0) { currentSongId = visiblePlaylist[i - 1].id; toViewer(); renderSidebar(); } }
function exportJSON() { var b = new Blob([JSON.stringify(library, null, 2)], {type:'application/json'}); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mnotes_library.json'; a.click(); }
function importJSON(el) { var r = new FileReader(); r.onload = e => { try { var d = JSON.parse(e.target.result); if(Array.isArray(d)) library = d; saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); alert("Loaded!"); if(library.length > 0) toViewer(); } catch(er) { alert("Error reading file"); } }; r.readAsText(el.files[0]); }
function clearLibrary() { if(confirm("Delete all songs?")) { library = []; visiblePlaylist = []; currentSongId = null; saveToLocal(); updatePlaylistDropdown(); renderSidebar(); clearInputs(); toEditor(); } }
