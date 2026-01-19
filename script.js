// --- 1. CONFIGURATION & GLOBALS ---
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

// App State
var library = [];            // Η λίστα με όλα τα τραγούδια
var visiblePlaylist = [];    // Η φιλτραρισμένη λίστα (π.χ. μόνο Λαϊκά)
var currentSongId = null;    // Το ID του τραγουδιού που βλέπουμε τώρα
var currentFilter = "ALL";
var state = { 
    t: 0, c: 0,              // Transpose, Capo
    parsedChords: [],        // Το πάνω μέρος (με συγχορδίες)
    parsedLyrics: [],        // Το κάτω μέρος (μόνο στίχοι)
    meta: {}                 // Τίτλος, Κλίμακα, Intro...
};

// Metronome State
var loadedRhythms = [];      // Εδώ θα αποθηκευτούν οι ρυθμοί από το JSON
var currentRhythmPattern = []; // Το μοτίβο που παίζει τώρα

// --- 2. STARTUP ---
window.onload = function() {
    // A. Φόρτωση Τραγουδιών από LocalStorage
    var savedData = localStorage.getItem('mnotes_data');
    if(savedData) {
        try {
            library = JSON.parse(savedData);
            updatePlaylistDropdown();
            filterPlaylist();
        } catch(e) {
            console.error("Error parsing saved data", e);
        }
    }

    // B. Αποφασίζουμε ποια οθόνη θα δείξουμε
    if(library.length > 0) {
        toViewer();
    } else {
        toEditor();
    }

    // C. Φόρτωση Ρυθμών από εξωτερικό αρχείο
    loadRhythms();
};

// --- 3. RHYTHM LOADER ---
function loadRhythms() {
    fetch('rhythms.json')
        .then(response => {
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return response.json();
        })
        .then(data => {
            loadedRhythms = data.rhythms;
            populateRhythmSelect();
            // Ορισμός του πρώτου ρυθμού ως προεπιλογή
            if(loadedRhythms.length > 0) {
                currentRhythmPattern = loadedRhythms[0].steps;
            }
        })
        .catch(err => {
            console.error("Failed to load rhythms:", err);
            // Fallback (ασφάλεια αν αποτύχει η φόρτωση)
            loadedRhythms = [{ 
                label: "4/4 (Default)", 
                steps: [{dur:1, strong:true}, {dur:1, strong:false}, {dur:1, strong:true}, {dur:1, strong:false}] 
            }];
            populateRhythmSelect();
            currentRhythmPattern = loadedRhythms[0].steps;
        });
}

function populateRhythmSelect() {
    var select = document.getElementById('rhythmSelect');
    select.innerHTML = ""; // Καθαρισμός
    
    loadedRhythms.forEach((r, index) => {
        var opt = document.createElement('option');
        opt.value = index; // Η τιμή είναι η θέση στον πίνακα (0, 1, 2...)
        opt.innerText = r.label;
        select.appendChild(opt);
    });
}

function updateRhythm() {
    var select = document.getElementById('rhythmSelect');
    var index = parseInt(select.value);
    
    if(loadedRhythms[index]) {
        currentRhythmPattern = loadedRhythms[index].steps;
        currentStep = 0; // Επαναφορά στην αρχή του μέτρου
    }
}

// --- 4. NAVIGATION ---
function toEditor(){
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('transUI').style.display = 'none';
    
    if(currentSongId === null) {
        clearInputs();
    } else {
        var song = library.find(s => s.id === currentSongId);
        if(song) loadInputsFromSong(song);
    }
}

function toViewer(){
    if(library.length === 0) { toEditor(); return; }
    
    // Αν δεν υπάρχει επιλεγμένο, διάλεξε το πρώτο της λίστας
    if(currentSongId === null && visiblePlaylist.length > 0) {
        currentSongId = visiblePlaylist[0].id;
    }

    if(currentSongId !== null) {
        var song = library.find(s => s.id === currentSongId);
        if(song) parseAndRender(song);
    }

    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'flex'; // Flex για το split layout
    document.getElementById('transUI').style.display = 'flex';
}

// --- 5. LIBRARY MANAGEMENT ---
function saveToLocal() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function saveSong() {
    var title = document.getElementById('inpTitle').value;
    if(!title) { alert("Δώσε έναν τίτλο!"); return; }

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
    var select = document.getElementById('playlistSelect');
    currentFilter = select.value;
    
    if(currentFilter === "ALL") {
        visiblePlaylist = library;
    } else {
        visiblePlaylist = library.filter(s => s.playlists.includes(currentFilter));
    }
    renderSidebar();
}

function updatePlaylistDropdown() {
    var allTags = new Set();
    library.forEach(s => {
        if(s.playlists) s.playlists.forEach(t => allTags.add(t));
    });

    var select = document.getElementById('playlistSelect');
    var oldVal = select.value;
    
    select.innerHTML = '<option value="ALL">📂 Όλα τα τραγούδια</option>';
    
    allTags.forEach(tag => {
        var opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = "💿 " + tag;
        select.appendChild(opt);
    });

    select.value = oldVal;
    if(select.value !== oldVal) select.value = "ALL";
}

function renderSidebar() {
    var container = document.getElementById('playlistContainer');
    container.innerHTML = "";
    document.getElementById('songCount').innerText = visiblePlaylist.length + " songs";
    
    if(visiblePlaylist.length === 0) {
        container.innerHTML = '<div class="empty-msg">Κενή Λίστα</div>';
        return;
    }

    visiblePlaylist.forEach((song, idx) => {
        var div = document.createElement('div');
        div.className = 'playlist-item';
        if(song.id === currentSongId) div.classList.add('active');
        div.innerText = (idx + 1) + ". " + song.title;
        div.onclick = () => { 
            currentSongId = song.id; 
            toViewer(); 
            renderSidebar(); 
        };
        container.appendChild(div);
    });
}

function loadInputsFromSong(song) {
    document.getElementById('inpTitle').value = song.title;
    document.getElementById('inpKey').value = song.key;
    document.getElementById('inpIntro').value = song.intro || "";
    document.getElementById('inpInter').value = song.interlude || "";
    document.getElementById('inpBody').value = song.body;
    document.getElementById('inpTags').value = (song.playlists || []).join(", ");
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

// --- 6. PARSER (AUTO-SPLIT LOGIC) ---
function parseAndRender(songData){
  state.parsedChords = [];
  state.parsedLyrics = [];
  state.meta = { title: songData.title, key: songData.key, intro: songData.intro, interlude: songData.interlude };
  state.t = 0; state.c = 0;

  var rawBody = songData.body || "";
  var blocks = rawBody.split(/\n\s*\n/); // Χωρισμός σε μπλοκ (κενές γραμμές)
  var isScrolling = false;

  blocks.forEach(block => {
      if(!block.trim()) return;

      if (!isScrolling) {
          if (blockHasChords(block)) {
              // Πάνω μέρος (Pinned)
              var parsedBlock = parseBlock(block);
              state.parsedChords.push(...parsedBlock);
              state.parsedChords.push({type:'br'});
          } else {
              // Εντοπίστηκε μπλοκ χωρίς συγχορδίες -> Έναρξη Scrolling
              isScrolling = true;
              state.parsedLyrics.push(block);
          }
      } else {
          // Κάτω μέρος (Scrolling)
          state.parsedLyrics.push(block);
      }
  });

  render();
}

function blockHasChords(text) {
    return (text.includes('!') || text.includes('|'));
}

function parseBlock(text) {
    var output = [];
    var lines = text.split('\n');
    for(var i=0; i<lines.length; i++){
        var l = lines[i].trimEnd();
        if(!l) continue;
        
        var rawParts = l.split('!');
        var tokens = [];
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

// --- 7. RENDERER ---
function render(){
  // A. Pinned Container (Chords)
  var divChords = document.getElementById('outputChords');
  divChords.innerHTML = "";
  document.getElementById('displayTitle').innerText = state.meta.title;
  var shift = state.t - state.c;
  
  var metaText = state.meta.key ? "Key: " + getNote(state.meta.key, shift) : "";
  if(!state.meta.key) document.getElementById('visualKey').innerText = "-";
  else document.getElementById('visualKey').innerText = getNote(state.meta.key, shift);
  document.getElementById('displayMeta').innerText = metaText;

  var structBox = document.getElementById('structureBox');
  if(state.meta.intro || state.meta.interlude) {
      structBox.style.display = 'block';
      document.getElementById('displayIntro').innerHTML = state.meta.intro ? `<div class="struct-line"><span class="struct-label">INTRO:</span> ${getNote(state.meta.intro, shift)}</div>` : "";
      document.getElementById('displayInter').innerHTML = state.meta.interlude ? `<div class="struct-line"><span class="struct-label">INTER:</span> ${getNote(state.meta.interlude, shift)}</div>` : "";
  } else { structBox.style.display = 'none'; }

  document.getElementById('t-val').innerText = (state.t>0?'+':'')+state.t;
  document.getElementById('c-val').innerText = state.c;

  state.parsedChords.forEach(function(L){
    if(L.type==='br'){ 
        var d = document.createElement('div'); 
        d.style.height="20px"; 
        divChords.appendChild(d); 
        return; 
    }
    var row = document.createElement('div'); row.className='line-row';
    L.tokens.forEach(function(tok){
      var wrap = document.createElement('div'); wrap.className='token';
      var ch = document.createElement('div'); ch.className='chord';
      ch.innerText = getNote(tok.c, shift);
      var txt = document.createElement('div'); txt.className='lyric';
      txt.innerText = tok.t;
      wrap.appendChild(ch); wrap.appendChild(txt);
      row.appendChild(wrap);
    });
    divChords.appendChild(row);
  });

  // Divider
  var hasLyrics = state.parsedLyrics.length > 0;
  document.getElementById('splitDivider').style.display = hasLyrics ? 'block' : 'none';

  // B. Scroll Container (Lyrics)
  var divLyrics = document.getElementById('outputLyrics');
  divLyrics.innerHTML = "";
  
  state.parsedLyrics.forEach(function(block){
      var p = document.createElement('div');
      p.className = 'compact-line';
      p.innerText = block; 
      divLyrics.appendChild(p);
      var spacer = document.createElement('div');
      spacer.style.height = "15px";
      divLyrics.appendChild(spacer);
  });
}

// --- 8. UTILITIES (Note Logic, Transpose, Smart Capo) ---
function getNote(note, step){
  if(!note || /[|/x(),]/.test(note) && !/[A-G]/.test(note)) return note; 
  return note.replace(/([A-G][#b]?)([a-zA-Z0-9]*)/g, function(match, root, suffix){
      var idx = NOTES.indexOf(root);
      if(idx === -1 && root.includes('b')) { var nat = root[0]; idx = (NOTES.indexOf(nat)-1+12)%12; }
      if(idx === -1) return match; 
      var nIdx = (idx + step)%12;
      if(nIdx<0) nIdx+=12;
      return NOTES[nIdx] + suffix;
  });
}

function addTrans(n){ state.t+=n; render(); }
function addCapo(n){ if(state.c+n>=0){ state.c+=n; render(); } }

function findSmartCapo() {
    let currentSoundingChords = new Set();
    state.parsedChords.forEach(line => {
        if(line.tokens) line.tokens.forEach(tok => {
            if(tok.c && /[A-G]/.test(tok.c)) {
                let cleanRoot = getNote(tok.c, state.t).split('/')[0].replace(/m|dim|aug|sus|7|9/g, ""); 
                let quality = tok.c.includes('m') ? 'm' : '';
                currentSoundingChords.add(cleanRoot + quality);
            }
        });
    });

    if(currentSoundingChords.size === 0) { alert("Δεν βρέθηκαν συγχορδίες!"); return; }

    let bestCapo = 0; let minDifficulty = Infinity;
    for (let tryCapo = 0; tryCapo <= 5; tryCapo++) {
        let difficultyScore = 0;
        currentSoundingChords.forEach(soundingChord => {
            let visualChord = getNote(soundingChord, -tryCapo);
            if (EASY_CHORDS.includes(visualChord)) difficultyScore += 0;
            else if (OK_CHORDS.includes(visualChord)) difficultyScore += 1;
            else difficultyScore += 3;
        });
        if (difficultyScore < minDifficulty) { minDifficulty = difficultyScore; bestCapo = tryCapo; }
    }
    if (bestCapo === state.c) showToast("👍 Ήδη στη βέλτιστη θέση!");
    else { state.c = bestCapo; render(); showToast(`✨ Capo ${bestCapo} applied!`); }
}
function showToast(msg) {
    let div = document.createElement('div'); div.innerText = msg;
    div.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:20px; z-index:2000; font-size:14px;";
    document.body.appendChild(div); setTimeout(() => div.remove(), 2000);
}

// --- 9. METRONOME ENGINE (WEB AUDIO API) ---
var audioContext = null;
var isPlaying = false;
var lookahead = 25.0; 
var scheduleAheadTime = 0.1; 
var nextNoteTime = 0.0; 
var currentStep = 0;
var timerID = null;
var bpm = 100;

function toggleMetronome() {
    isPlaying = !isPlaying;
    var btn = document.getElementById('btnMetroToggle');
    
    if (isPlaying) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume();

        currentStep = 0;
        nextNoteTime = audioContext.currentTime + 0.1;
        scheduler();
        btn.innerText = "STOP";
        btn.style.background = "#333";
    } else {
        window.clearTimeout(timerID);
        btn.innerText = "START";
        btn.style.background = "#e74c3c";
    }
}

function changeBpm(amount) {
    bpm += amount;
    if(bpm < 30) bpm = 30;
    if(bpm > 300) bpm = 300;
    document.getElementById('bpmDisplay').innerText = bpm;
}

function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(currentStep, nextNoteTime);
        nextStep();
    }
    timerID = window.setTimeout(scheduler, lookahead);
}

function nextStep() {
    var secondsPerBeat = 60.0 / bpm; 
    // Παίρνουμε τη διάρκεια από το αντικείμενο του ρυθμού
    nextNoteTime += secondsPerBeat * currentRhythmPattern[currentStep].dur;

    currentStep++;
    if (currentStep >= currentRhythmPattern.length) {
        currentStep = 0;
    }
}

function scheduleNote(stepIndex, time) {
    var osc = audioContext.createOscillator();
    var gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    // Έλεγχος αν είναι Ισχυρό (Strong) ή Ασθενές (Weak)
    var isStrong = currentRhythmPattern[stepIndex].strong;

    if (isStrong) {
        // ΗΧΟΣ "ΠΟΥΜ" (Μπάσο)
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    } else {
        // ΗΧΟΣ "ΠΑΜ" (Πρίμο / Ξύλινο)
        osc.frequency.setValueAtTime(800, time);
        gain.gain.setValueAtTime(0.4, time); // Πιο σιγά
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05); // Πολύ κοφτό
    }

    osc.start(time);
    osc.stop(time + 0.1);

    // Visual LED Sync
    var drawTime = (time - audioContext.currentTime) * 1000;
    if(drawTime < 0) drawTime = 0;
    
    setTimeout(function() {
        var led = document.getElementById('metroVisual');
        if(isStrong) led.className = "metro-led on"; // Κόκκινο φλας
        else led.className = "metro-led sub";        // Κίτρινο φλας
        setTimeout(() => { led.className = "metro-led"; }, 100);
    }, drawTime);
}

// --- 10. NAV & EXPORT ---
function nextSong() {
    if(visiblePlaylist.length === 0) return;
    var currIdx = visiblePlaylist.findIndex(s => s.id === currentSongId);
    if(currIdx < visiblePlaylist.length - 1) {
        currentSongId = visiblePlaylist[currIdx + 1].id;
        toViewer(); 
        renderSidebar();
    }
}

function prevSong() {
    if(visiblePlaylist.length === 0) return;
    var currIdx = visiblePlaylist.findIndex(s => s.id === currentSongId);
    if(currIdx > 0) {
        currentSongId = visiblePlaylist[currIdx - 1].id;
        toViewer(); 
        renderSidebar();
    }
}

function exportJSON(){
    var blob = new Blob([JSON.stringify(library, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mnotes_library.json';
    a.click();
}

function importJSON(el){
    var r = new FileReader();
    r.onload = function(e){
        try {
            var data = JSON.parse(e.target.result);
            if(Array.isArray(data)) library = data; 
            saveToLocal(); // Αποθήκευση στη μνήμη μετά το Import
            updatePlaylistDropdown();
            filterPlaylist();
            alert("Βιβλιοθήκη φορτώθηκε!");
            if(library.length > 0) toViewer();
        } catch(err) { alert("Σφάλμα αρχείου"); }
    };
    r.readAsText(el.files[0]);
}

function clearLibrary() {
    if(confirm("Διαγραφή ΟΛΗΣ της βιβλιοθήκης;")) {
        library = [];
        visiblePlaylist = [];
        currentSongId = null;
        saveToLocal();
        updatePlaylistDropdown();
        renderSidebar();
        clearInputs();
        toEditor();
    }
}
