// ==========================================
// 1. ΡΥΘΜΙΣΕΙΣ & ΜΕΤΑΒΛΗΤΕΣ
// ==========================================
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

// Κατάσταση Εφαρμογής
var library = [];            // Όλα τα τραγούδια
var visiblePlaylist = [];    // Φιλτραρισμένη λίστα
var currentSongId = null;    // Επιλεγμένο τραγούδι
var currentFilter = "ALL";
var state = { 
    t: 0, c: 0,              // Transpose & Capo
    parsedChords: [],        // Πάνω μέρος (Συγχορδίες)
    parsedLyrics: [],        // Κάτω μέρος (Στίχοι)
    meta: {}                 // Τίτλος, Κλειδί, Intro
};

// Κατάσταση Μετρονόμου & Ρυθμών
var loadedRhythms = [];      
var currentRhythmPattern = [];
var html5QrcodeScanner = null; // QR Scanner

// ==========================================
// 2. ΕΚΚΙΝΗΣΗ (STARTUP)
// ==========================================
window.onload = function() {
    // A. Φόρτωση από μνήμη συσκευής
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            library = JSON.parse(savedData);
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) { console.error(e); }
    }

    // B. Φόρτωση Ρυθμών
    loadRhythms();

    // Γ. Έλεγχος Κινητού: Αν είναι μικρή οθόνη ή υπάρχει βιβλιοθήκη -> Πήγαινε Player
    if(window.innerWidth <= 768 || library.length > 0) {
        toViewer();
    } else {
        toEditor();
    }
};

// ==========================================
// 3. UI ΛΕΙΤΟΥΡΓΙΕΣ (MOBILE & QR)
// ==========================================
function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    sb.classList.toggle('active'); // CSS class που το εμφανίζει/κρύβει
}

function startQR() {
    document.getElementById('qrModal').style.display = "flex";
    // Αν το μενού είναι ανοιχτό στο κινητό, κλείσε το
    var sb = document.getElementById('sidebar');
    if(sb.classList.contains('active')) sb.classList.remove('active');

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Πίσω κάμερα
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText, decodedResult) => {
            // Επιτυχία σκαναρίσματος
            try {
                var data = JSON.parse(decodedText);
                
                // Περίπτωση A: Ολόκληρη βιβλιοθήκη (Array)
                if(Array.isArray(data)) {
                    if(confirm("Βρέθηκε ολόκληρη βιβλιοθήκη (" + data.length + " τραγούδια). Import;")) {
                        library = data; // Αντικατάσταση (ή μπορείς να κάνεις merge)
                        saveToLocal();
                        updatePlaylistDropdown();
                        filterPlaylist();
                        closeQR();
                        alert("Η βιβλιοθήκη φορτώθηκε!");
                        toViewer();
                    }
                } 
                // Περίπτωση B: Ένα τραγούδι (Object)
                else if(data.title && data.body) {
                    if(confirm("Import τραγούδι: " + data.title + ";")) {
                        data.id = Date.now().toString(); // Νέο ID για ασφάλεια
                        library.push(data);
                        currentSongId = data.id;
                        saveToLocal();
                        updatePlaylistDropdown();
                        filterPlaylist();
                        closeQR();
                        toViewer();
                    }
                } else {
                    alert("Άγνωστος κωδικός QR");
                }
            } catch(e) {
                console.log("Δεν είναι έγκυρο JSON");
            }
        },
        (errorMessage) => { /* Scanning... */ }
    ).catch(err => console.log(err));
}

function closeQR() {
    if(html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            document.getElementById('qrModal').style.display = "none";
        }).catch(err => console.log(err));
    } else {
        document.getElementById('qrModal').style.display = "none";
    }
}

// ==========================================
// 4. NAVIGATION
// ==========================================
function toEditor(){
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('transUI').style.display = 'none';
    
    if(currentSongId === null) clearInputs();
    else {
        var s = library.find(x => x.id === currentSongId);
        if(s) loadInputsFromSong(s);
    }
}

function toViewer(){
    if(library.length === 0) { toEditor(); return; }
    
    // Αν δεν έχει επιλεγεί τραγούδι, πάρε το πρώτο
    if(currentSongId === null && visiblePlaylist.length > 0) {
        currentSongId = visiblePlaylist[0].id;
    }

    if(currentSongId !== null) {
        var s = library.find(x => x.id === currentSongId);
        if(s) parseAndRender(s);
    }

    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'flex';
    document.getElementById('transUI').style.display = 'flex';
}

// ==========================================
// 5. ΔΙΑΧΕΙΡΙΣΗ ΒΙΒΛΙΟΘΗΚΗΣ
// ==========================================
function saveToLocal() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    if(!title) { alert("Δώσε τίτλο!"); return; }

    var tagsStr = document.getElementById('inpTags').value;
    var tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    var songData = {
        id: currentSongId || Date.now().toString(),
        title: title,
        key: document.getElementById('inpKey').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value,
        playlists: tags
    };

    if(currentSongId) {
        var idx = library.findIndex(s => s.id === currentSongId);
        if(idx !== -1) library[idx] = songData;
    } else {
        library.push(songData);
        currentSongId = songData.id;
    }

    saveToLocal();
    updatePlaylistDropdown();
    filterPlaylist();
    alert("Αποθηκεύτηκε!");
}

function deleteCurrentSong() {
    if(!currentSongId) return;
    if(confirm("Διαγραφή τραγουδιού;")) {
        library = library.filter(s => s.id !== currentSongId);
        currentSongId = null;
        saveToLocal();
        updatePlaylistDropdown();
        filterPlaylist();
        clearInputs();
        toEditor();
    }
}

function filterPlaylist() {
    var val = document.getElementById('playlistSelect').value;
    currentFilter = val;
    
    if(val === "ALL") visiblePlaylist = library;
    else visiblePlaylist = library.filter(s => s.playlists.includes(val));
    
    renderSidebar();
    
    // Στα κινητά, κλείσε το μενού μετά την επιλογή
    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

function updatePlaylistDropdown() {
    var sel = document.getElementById('playlistSelect');
    var old = sel.value;
    var allTags = new Set();
    
    library.forEach(s => s.playlists.forEach(t => allTags.add(t)));
    
    sel.innerHTML = '<option value="ALL">📂 Όλα τα τραγούδια</option>';
    allTags.forEach(t => {
        var opt = document.createElement('option');
        opt.value = t;
        opt.innerText = "💿 " + t;
        sel.appendChild(opt);
    });
    
    sel.value = old;
    if(sel.value !== old) sel.value = "ALL";
}

function renderSidebar() {
    var container = document.getElementById('playlistContainer');
    container.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    
    if(visiblePlaylist.length === 0) {
        container.innerHTML = '<div class="empty-msg">Κενή</div>';
        return;
    }

    visiblePlaylist.forEach((s, i) => {
        var div = document.createElement('div');
        div.className = 'playlist-item';
        if(s.id === currentSongId) div.classList.add('active');
        div.innerText = (i + 1) + ". " + s.title;
        div.onclick = () => { 
            currentSongId = s.id; 
            toViewer(); 
            renderSidebar(); 
            // Auto close sidebar on mobile
            if(window.innerWidth <= 768) toggleSidebar(); 
        };
        container.appendChild(div);
    });
}

function loadInputsFromSong(s) {
    document.getElementById('inpTitle').value = s.title;
    document.getElementById('inpKey').value = s.key;
    document.getElementById('inpIntro').value = s.intro || "";
    document.getElementById('inpInter').value = s.interlude || "";
    document.getElementById('inpBody').value = s.body;
    document.getElementById('inpTags').value = (s.playlists || []).join(", ");
    document.getElementById('btnDelete').style.display = 'inline-block';
}

function clearInputs() {
    document.getElementById('inpTitle').value = "";
    document.getElementById('inpKey').value = "";
    document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = "";
    document.getElementById('inpBody').value = "";
    document.getElementById('inpTags').value = "";
    currentSongId = null;
    document.getElementById('btnDelete').style.display = 'none';
}

// ==========================================
// 6. PARSER & RENDERER (Η ΚΑΡΔΙΑ ΤΟΥ APP)
// ==========================================
function parseAndRender(s){
    state.parsedChords = [];
    state.parsedLyrics = [];
    state.meta = { title: s.title, key: s.key, intro: s.intro, interlude: s.interlude };
    state.t = 0; 
    state.c = 0;

    var rawBody = s.body || "";
    // Χωρισμός σε μπλοκ με βάση την κενή γραμμή
    var blocks = rawBody.split(/\n\s*\n/);
    var isScrolling = false;

    blocks.forEach(block => {
        if(!block.trim()) return;

        if(!isScrolling) {
            // Αν το μπλοκ έχει συγχορδίες (έχει !)
            if(blockHasChords(block)) {
                var parsedBlock = parseBlock(block);
                state.parsedChords.push(...parsedBlock);
                state.parsedChords.push({type:'br'});
            } else {
                // Δεν έχει συγχορδίες -> Ξεκινάει το Scroll
                isScrolling = true;
                state.parsedLyrics.push(block);
            }
        } else {
            // Όλα τα υπόλοιπα πάνε στο Scroll
            state.parsedLyrics.push(block);
        }
    });

    render();
}

function blockHasChords(t) { return (t.includes('!') || t.includes('|')); }

function parseBlock(text) {
    var output = [];
    var lines = text.split('\n');
    for(var i=0; i<lines.length; i++){
        var l = lines[i].trimEnd();
        if(!l) continue;
        
        var rawParts = l.split('!');
        var tokens = [];
        // Κείμενο πριν την πρώτη συγχορδία
        if(rawParts[0]) tokens.push(analyzeToken("", rawParts[0])); 

        for(var k=1; k<rawParts.length; k++){
            var segment = rawParts[k];
            var match = segment.match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
            if(match) {
                tokens.push(analyzeToken(match[1], match[2]));
            } else {
                tokens.push(analyzeToken("", "!" + segment));
            }
        }
        output.push({type:'line', tokens:tokens});
    }
    return output;
}

function analyzeToken(chord, text) {
    var isStructure = /^[\s|/(),x0-9]+$/.test(text);
    if(isStructure && chord === "") return { c: text, t: "" };
    if(isStructure && chord !== "") return { c: chord + " " + text, t: "" };
    return { c: chord, t: text };
}

// --- RENDER FUNCTION ---
function render(){
    var shift = state.t - state.c;
    
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('displayMeta').innerText = state.meta.key ? "Key: " + getNote(state.meta.key, shift) : "";
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, shift) : "-";

    // --- RENDER INTRO/INTERLUDE (Με χρώματα, χωρίς θαυμαστικά) ---
    var sb = document.getElementById('structureBox');
    if(state.meta.intro || state.meta.interlude){
        sb.style.display = 'block';
        document.getElementById('displayIntro').innerHTML = state.meta.intro ? 
            `<div class="struct-line"><span class="struct-label">INTRO:</span> ${renderSimpleChords(state.meta.intro, shift)}</div>` : "";
        document.getElementById('displayInter').innerHTML = state.meta.interlude ? 
            `<div class="struct-line"><span class="struct-label">INTER:</span> ${renderSimpleChords(state.meta.interlude, shift)}</div>` : "";
    } else {
        sb.style.display = 'none';
    }

    // --- RENDER CHORDS (Pinned) ---
    document.getElementById('t-val').innerText = (state.t > 0 ? '+' : '') + state.t;
    document.getElementById('c-val').innerText = state.c;
    
    var divChords = document.getElementById('outputChords');
    divChords.innerHTML = "";
    
    state.parsedChords.forEach(L => {
        if(L.type === 'br') { 
            var d = document.createElement('div'); 
            d.style.height = "20px"; 
            divChords.appendChild(d); 
            return; 
        }
        var row = document.createElement('div'); row.className = 'line-row';
        L.tokens.forEach(tok => {
            var wrap = document.createElement('div'); wrap.className = 'token';
            var ch = document.createElement('div'); ch.className = 'chord'; 
            ch.innerText = getNote(tok.c, shift);
            var txt = document.createElement('div'); txt.className = 'lyric'; 
            txt.innerText = tok.t;
            wrap.appendChild(ch); wrap.appendChild(txt);
            row.appendChild(wrap);
        });
        divChords.appendChild(row);
    });

    // Divider
    document.getElementById('splitDivider').style.display = (state.parsedLyrics.length > 0) ? 'block' : 'none';

    // --- RENDER LYRICS (Scroll) ---
    var divLyrics = document.getElementById('outputLyrics');
    divLyrics.innerHTML = "";
    state.parsedLyrics.forEach(block => {
        var p = document.createElement('div');
        p.className = 'compact-line';
        p.innerText = block;
        divLyrics.appendChild(p);
        var spacer = document.createElement('div');
        spacer.style.height = "15px";
        divLyrics.appendChild(spacer);
    });
}

// Βοηθητική: Μετατρέπει το string "Intro" σε HTML με χρώματα
function renderSimpleChords(text, shift) {
    var parts = text.split('!');
    var html = "";
    
    if(parts[0]) html += `<span class="mini-lyric">${parts[0]}</span>`;

    for(var k=1; k<parts.length; k++) {
        var segment = parts[k];
        var match = segment.match(/^([A-G][#b]?[a-zA-Z0-9]*)(.*)/);
        
        if(match) {
            html += `<span class="mini-chord">${getNote(match[1], shift)}</span>`;
            if(match[2]) html += `<span class="mini-lyric">${match[2]}</span>`;
        } else {
            html += `<span class="mini-lyric">!${segment}</span>`;
        }
    }
    return html;
}

// ==========================================
// 7. UTILS & METRONOME
// ==========================================
function getNote(n,s){ if(!n||/[|/x(),]/.test(n)&&!/[A-G]/.test(n))return n; return n.replace(/([A-G][#b]?)([a-zA-Z0-9]*)/g,(m,r,sx)=>{ var i=NOTES.indexOf(r); if(i===-1&&r.includes('b'))i=(NOTES.indexOf(r[0])-1+12)%12; if(i===-1)return m; var ni=(i+s)%12; if(ni<0)ni+=12; return NOTES[ni]+sx; }); }
function addTrans(n){ state.t+=n; render(); }
function addCapo(n){ if(state.c+n>=0){ state.c+=n; render(); } }

function findSmartCapo(){
    var s=new Set(); state.parsedChords.forEach(l=>{ if(l.tokens) l.tokens.forEach(t=>{ if(t.c&&/[A-G]/.test(t.c)) s.add(getNote(t.c,state.t).split('/')[0].replace(/m|dim|aug|sus|7|9/g,"")+(t.c.includes('m')?'m':'')); }); });
    if(s.size===0){ alert("No chords!"); return; }
    var best=0, min=Infinity; 
    for(var c=0;c<=5;c++){ 
        var sc=0; s.forEach(ch=>{ var v=getNote(ch,-c); if(EASY_CHORDS.includes(v))sc+=0; else if(OK_CHORDS.includes(v))sc+=1; else sc+=3; }); 
        if(sc<min){ min=sc; best=c; } 
    }
    if(best===state.c) showToast("👍 Best!"); else { state.c=best; render(); showToast(`✨ Capo ${best}!`); }
}
function showToast(m){ var d=document.createElement('div'); d.innerText=m; d.style.cssText="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:10px 20px;border-radius:20px;z-index:2000;"; document.body.appendChild(d); setTimeout(()=>d.remove(),2000); }

// --- RHYTHM LOADER ---
function loadRhythms() {
    fetch('rhythms.json').then(r => r.ok?r.json():null).then(d => {
        if(d){ loadedRhythms=d.rhythms; populateRhythmSelect(); if(loadedRhythms.length>0) currentRhythmPattern=loadedRhythms[0].steps; }
    }).catch(e=>{
        loadedRhythms=[{label:"4/4 Default",steps:[{dur:1,strong:true},{dur:1,strong:false},{dur:1,strong:true},{dur:1,strong:false}]}];
        populateRhythmSelect(); currentRhythmPattern=loadedRhythms[0].steps;
    });
}
function populateRhythmSelect(){ var s=document.getElementById('rhythmSelect'); s.innerHTML=""; loadedRhythms.forEach((r,i)=>{ var o=document.createElement('option'); o.value=i; o.innerText=r.label; s.appendChild(o); }); }
function updateRhythm(){ var idx=document.getElementById('rhythmSelect').value; if(loadedRhythms[idx]){ currentRhythmPattern=loadedRhythms[idx].steps; currentStep=0; } }

// --- METRONOME ENGINE ---
var audioContext=null, isPlaying=false, timerID=null, bpm=100, currentStep=0, nextNoteTime=0.0;
function toggleMetronome(){ isPlaying=!isPlaying; var btn=document.getElementById('btnMetroToggle'); if(isPlaying){ if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)(); if(audioContext.state==='suspended')audioContext.resume(); currentStep=0; nextNoteTime=audioContext.currentTime+0.1; scheduler(); btn.innerText="STOP"; btn.style.background="#333"; } else { clearTimeout(timerID); btn.innerText="START"; btn.style.background="#e74c3c"; } }
function changeBpm(n){ bpm+=n; if(bpm<30)bpm=30; if(bpm>300)bpm=300; document.getElementById('bpmDisplay').innerText=bpm; }
function scheduler(){ while(nextNoteTime<audioContext.currentTime+0.1){ scheduleNote(currentStep,nextNoteTime); var s=60.0/bpm; nextNoteTime+=s*currentRhythmPattern[currentStep].dur; currentStep++; if(currentStep>=currentRhythmPattern.length)currentStep=0; } timerID=setTimeout(scheduler,25); }
function scheduleNote(idx,t){ var osc=audioContext.createOscillator(), g=audioContext.createGain(), str=currentRhythmPattern[idx].strong; osc.connect(g); g.connect(audioContext.destination); if(str){ osc.frequency.setValueAtTime(200,t); osc.frequency.exponentialRampToValueAtTime(50,t+0.1); g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.1); } else { osc.frequency.setValueAtTime(800,t); g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.05); } osc.start(t); osc.stop(t+0.1); var dt=(t-audioContext.currentTime)*1000; if(dt<0)dt=0; setTimeout(()=>{ var l=document.getElementById('metroVisual'); l.className=str?"metro-led on":"metro-led sub"; setTimeout(()=>l.className="metro-led",100); },dt); }

// --- FILE OPS ---
function nextSong(){ if(visiblePlaylist.length===0)return; var i=visiblePlaylist.findIndex(s=>s.id===currentSongId); if(i<visiblePlaylist.length-1){ currentSongId=visiblePlaylist[i+1].id; toViewer(); renderSidebar(); } }
function prevSong(){ if(visiblePlaylist.length===0)return; var i=visiblePlaylist.findIndex(s=>s.id===currentSongId); if(i>0){ currentSongId=visiblePlaylist[i-1].id; toViewer(); renderSidebar(); } }
function exportJSON(){ var b=new Blob([JSON.stringify(library,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='mnotes_library.json'; a.click(); }
function importJSON(el){ var r=new FileReader(); r.onload=e=>{ try{ var d=JSON.parse(e.target.result); if(Array.isArray(d)) library=d; saveToLocal(); updatePlaylistDropdown(); filterPlaylist(); alert("Loaded!"); if(library.length>0) toViewer(); }catch(err){alert("Error");} }; r.readAsText(el.files[0]); }
function clearLibrary(){ if(confirm("Clear All?")){ library=[]; visiblePlaylist=[]; currentSongId=null; saveToLocal(); updatePlaylistDropdown(); renderSidebar(); clearInputs(); toEditor(); } }
