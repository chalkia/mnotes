var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

var playlist = [];
var currentSongIndex = -1;
var state = { t:0, c:0, parsed:[], meta:{} };

// --- NAVIGATION ---
function toEditor(){
    document.getElementById('editor-view').style.display = 'block';
    document.getElementById('viewer-view').style.display = 'none';
    document.getElementById('transUI').style.display = 'none';
    if(currentSongIndex === -1) {
        clearInputs();
    }
}

function toViewer(){
    if(currentSongIndex === -1 && document.getElementById('inpBody').value.trim() !== "") {
        loadSongFromInputs();
    } else if (currentSongIndex !== -1) {
        loadSongFromPlaylist(currentSongIndex);
    }
    render();
    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('viewer-view').style.display = 'block';
    document.getElementById('transUI').style.display = 'flex';
}

// --- PLAYLIST LOGIC ---
function addSongToPlaylist() {
    var song = getSongFromInputs();
    if(!song.title) { alert("Δώσε έναν τίτλο!"); return; }
    playlist.push(song);
    renderPlaylistUI();
    clearInputs();
}

function updateCurrentSong() {
    if(currentSongIndex === -1) return;
    playlist[currentSongIndex] = getSongFromInputs();
    renderPlaylistUI();
    alert("Ενημερώθηκε!");
}

function getSongFromInputs() {
    return {
        title: document.getElementById('inpTitle').value,
        key: document.getElementById('inpKey').value,
        intro: document.getElementById('inpIntro').value,
        interlude: document.getElementById('inpInter').value,
        body: document.getElementById('inpBody').value
    };
}

function loadSongFromPlaylist(index) {
    currentSongIndex = index;
    var song = playlist[index];
    document.getElementById('inpTitle').value = song.title;
    document.getElementById('inpKey').value = song.key;
    document.getElementById('inpIntro').value = song.intro || "";
    document.getElementById('inpInter').value = song.interlude || "";
    document.getElementById('inpBody').value = song.body;
    document.getElementById('btnUpdate').style.display = 'inline-block';
    parse(song);
    
    var items = document.querySelectorAll('.playlist-item');
    items.forEach(el => el.classList.remove('active'));
    if(items[index]) items[index].classList.add('active');
}

function loadSongFromInputs() {
    var song = getSongFromInputs();
    parse(song);
}

function renderPlaylistUI() {
    var container = document.getElementById('playlistContainer');
    container.innerHTML = "";
    document.getElementById('songCount').innerText = playlist.length + " songs";
    if(playlist.length === 0) {
        container.innerHTML = '<div class="empty-msg">Η λίστα είναι κενή</div>';
        return;
    }
    playlist.forEach((song, idx) => {
        var div = document.createElement('div');
        div.className = 'playlist-item';
        if(idx === currentSongIndex) div.classList.add('active');
        div.innerText = (idx + 1) + ". " + song.title;
        div.onclick = () => { loadSongFromPlaylist(idx); toViewer(); };
        container.appendChild(div);
    });
}

function clearInputs() {
    document.getElementById('inpTitle').value = "";
    document.getElementById('inpKey').value = "";
    document.getElementById('inpIntro').value = "";
    document.getElementById('inpInter').value = "";
    document.getElementById('inpBody').value = "";
    currentSongIndex = -1;
    document.getElementById('btnUpdate').style.display = 'none';
}

function clearPlaylist() {
    if(confirm("Διαγραφή όλων;")) {
        playlist = [];
        currentSongIndex = -1;
        renderPlaylistUI();
        clearInputs();
    }
}

// --- PLAYER NAV ---
function nextSong() {
    if(playlist.length === 0) return;
    var next = currentSongIndex + 1;
    if(next < playlist.length) {
        loadSongFromPlaylist(next);
        render();
    }
}

function prevSong() {
    if(playlist.length === 0) return;
    var prev = currentSongIndex - 1;
    if(prev >= 0) {
        loadSongFromPlaylist(prev);
        render();
    }
}

// --- PARSER ---
function parse(songData){
  state.parsed = [];
  state.meta = { title: songData.title, key: songData.key, intro: songData.intro, interlude: songData.interlude };
  state.t = 0; state.c = 0;

  var lines = songData.body.split('\n');
  for(var i=0; i<lines.length; i++){
    var l = lines[i].trimEnd();
    if(!l) { state.parsed.push({type:'br'}); continue; }
    
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
    state.parsed.push({type:'line', tokens:tokens});
  }
}

function analyzeToken(chord, text) {
    var isStructure = /^[\s|/(),x0-9]+$/.test(text);
    if(isStructure && chord === "") return { c: text, t: "" };
    if(isStructure && chord !== "") return { c: chord + " " + text, t: "" };
    return { c: chord, t: text };
}

// --- SMART CAPO ---
function findSmartCapo() {
    let currentSoundingChords = new Set();
    state.parsed.forEach(line => {
        if(line.tokens) line.tokens.forEach(tok => {
            if(tok.c && /[A-G]/.test(tok.c)) {
                let cleanRoot = getNote(tok.c, state.t).split('/')[0].replace(/m|dim|aug|sus|7|9/g, ""); 
                let quality = tok.c.includes('m') ? 'm' : '';
                currentSoundingChords.add(cleanRoot + quality);
            }
        });
    });

    if(currentSoundingChords.size === 0) { alert("Δεν βρέθηκαν συγχορδίες!"); return; }

    let bestCapo = 0;
    let minDifficulty = Infinity;

    for (let tryCapo = 0; tryCapo <= 5; tryCapo++) {
        let difficultyScore = 0;
        currentSoundingChords.forEach(soundingChord => {
            let visualChord = getNote(soundingChord, -tryCapo);
            if (EASY_CHORDS.includes(visualChord)) difficultyScore += 0;
            else if (OK_CHORDS.includes(visualChord)) difficultyScore += 1;
            else difficultyScore += 3;
        });
        if (difficultyScore < minDifficulty) {
            minDifficulty = difficultyScore;
            bestCapo = tryCapo;
        }
    }
    if (bestCapo === state.c) showToast("👍 Ήδη στη βέλτιστη θέση!");
    else { state.c = bestCapo; render(); showToast(`✨ Capo ${bestCapo} applied!`); }
}

function showToast(msg) {
    let div = document.createElement('div');
    div.innerText = msg;
    div.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:20px; z-index:2000; font-size:14px;";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

// --- RENDER & TRANSPOSE ---
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

function render(){
  var div = document.getElementById('output');
  div.innerHTML = "";
  document.getElementById('displayTitle').innerText = state.meta.title;
  var shift = state.t - state.c;
  
  var metaText = "";
  if(state.meta.key) {
      metaText += "Original Key: " + getNote(state.meta.key, shift);
      document.getElementById('visualKey').innerText = getNote(state.meta.key, shift);
  } else {
      document.getElementById('visualKey').innerText = "-";
  }
  document.getElementById('displayMeta').innerText = metaText;

  var structBox = document.getElementById('structureBox');
  if(state.meta.intro || state.meta.interlude) {
      structBox.style.display = 'block';
      document.getElementById('displayIntro').innerHTML = state.meta.intro ? `<div class="struct-line"><span class="struct-label">INTRO:</span> ${getNote(state.meta.intro, shift)}</div>` : "";
      document.getElementById('displayInter').innerHTML = state.meta.interlude ? `<div class="struct-line"><span class="struct-label">INTER:</span> ${getNote(state.meta.interlude, shift)}</div>` : "";
  } else {
      structBox.style.display = 'none';
  }

  document.getElementById('t-val').innerText = (state.t>0?'+':'')+state.t;
  document.getElementById('c-val').innerText = state.c;

  state.parsed.forEach(function(L){
    if(L.type==='br'){ div.appendChild(document.createElement('br')); return; }
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
    div.appendChild(row);
  });
}

function addTrans(n){ state.t+=n; render(); }
function addCapo(n){ if(state.c+n>=0){ state.c+=n; render(); } }

// --- IMPORT/EXPORT ---
function exportJSON(){
  if(playlist.length === 0 && document.getElementById('inpTitle').value !== "") {
      playlist.push(getSongFromInputs());
  }
  var blob = new Blob([JSON.stringify(playlist, null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'setlist.json';
  a.click();
}

function importJSON(el){
  var r = new FileReader();
  r.onload = function(e){
    try {
        var data = JSON.parse(e.target.result);
        if(Array.isArray(data)) playlist = data;
        else if (data.content) playlist = [{ title: data.title, key: "", intro: "", interlude: "", body: data.content }];
        renderPlaylistUI();
        if(playlist.length > 0) { loadSongFromPlaylist(0); toViewer(); }
    } catch(err) { alert("Error loading file"); }
  };
  r.readAsText(el.files[0]);
}