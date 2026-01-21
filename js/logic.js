/* =========================================
   LOGIC & PARSING
   ========================================= */

// Διασφαλίζει ότι ένα τραγούδι έχει όλα τα πεδία
function ensureSongStructure(s) {
    return {
        id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
        title: s.title || "Untitled",
        key: s.key || "",
        notes: s.notes || "",
        intro: s.intro || "",
        interlude: s.interlude || "",
        body: s.body || "",
        playlists: s.playlists || []
    };
}

// Κύρια συνάρτηση Parsing: Διαβάζει το κείμενο και γεμίζει το state.parsedChords
function parseSongLogic(s) {
    state.parsedChords = []; 
    state.meta = { title: s.title, key: s.key, notes: s.notes, intro: s.intro, interlude: s.interlude };
    state.t = 0; 
    state.c = 0;

    var safeBody = s.body || ""; 
    var blocks = safeBody.split(/\n\s*\n/); // Χωρισμός σε παραγράφους
    
    blocks.forEach(b => {
        if(!b.trim()) return;
        
        // Αν έχει συγχορδίες (! ή |)
        if(b.includes('!') || b.includes('|')) {
            var p = parseBlock(b);
            state.parsedChords.push(...p); 
        } else { 
            // Απλοί στίχοι
            var lines = b.split('\n');
            lines.forEach(l => {
                state.parsedChords.push({type: 'lyricOnly', text: l});
            });
             state.parsedChords.push({type:'br'}); 
        }
    });
}

// Βοηθητική για Parsing Block
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

// Υπολογισμός Νότας (Transpose logic)
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

// Smart Capo Logic
function calculateSmartCapo() {
    var s = new Set();
    state.parsedChords.forEach(l => { 
        if(l.tokens) l.tokens.forEach(t => { 
            if(t.c && /[A-G]/.test(t.c)) s.add(getNote(t.c, state.t).split('/')[0].replace(/m|dim|aug|sus|7|9/g,"") + (t.c.includes('m') ? 'm' : '')); 
        }); 
    });
    if(s.size === 0) return { best: 0, msg: "No chords!" };

    var best = 0, min = Infinity;
    for(var c = 0; c <= 5; c++) {
        var sc = 0; 
        s.forEach(ch => { 
            var v = getNote(ch, -c); 
            if(EASY_CHORDS.includes(v)) sc += 0; 
            else if(OK_CHORDS.includes(v)) sc += 1; 
            else sc += 3; 
        });
        if(sc < min) { min = sc; best = c; }
    }
    return { best: best, msg: (best === state.c) ? "👍 Best!" : "Capo " + best };
}
