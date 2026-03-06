/* =========================================
   DATA & CONFIG (js/data.js) - FINAL v8
   ========================================= */

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

var currentLang = localStorage.getItem('mnotes_lang') || 'en'; 

function t(key) { 
    if (typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[currentLang]) {
        return TRANSLATIONS[currentLang][key] || key; 
    }
    return key;
}

// --- DEFAULT DEMO SONGS (Αντικαθιστά το παλιό DEFAULT_DATA) ---
const DEFAULT_DEMO_SONGS = [
    {
    "id": "demo_milo",
    "title": "Μήλο μου κόκκινο (Demo)",
    "artist": "Παραδοσιακό",
    "key": "Am",
    "intro": "!Am !Dm !G !C",
    "interlude": "",
    "notes": "Δοκιμάστε να αλλάξετε τον τόνο με το Transpose!",
    "tags": ["Παραδοσιακά", "Demo"],
    "body": "!AmΜήλο μου !Dmκόκκινο, !Amρόιδο βαμμένο \n Γιατί με !G μάρανες !Fτο πικρα!Eμένο \n !AmΠαγαίνω κι !Dmέρχομαι !Amμα δεν σε βρίσκω \n Βρίσκω την !Gπόρτα σου !Fμανταλω!Eμένη",
    "video": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  },
  {
    "id": "demo_grace",
    "title": "Amazing Grace (Demo)",
    "artist": "Traditional",
    "key": "G",
    "intro": "!G !C !G !D",
    "interlude": "",
    "notes": "Try the Smart Capo feature on this song!",
    "tags": ["Traditional", "Demo"],
    "body": "[G]Amazing grace! How  [C]sweet the [G]sound \n That saved a wretch like [D]me! \n  [G]I once was lost, but [C]now am [G]found; \nWas [D]blind, but now I [G]see.",
    "video": "https://www.youtube.com/watch?v=CDdvReNKKuk"
  }
];

// Global Variables Initialization (Safe check)
if (typeof library === 'undefined') var library = [];
if (typeof currentSongId === 'undefined') var currentSongId = null;
if (typeof visiblePlaylist === 'undefined') var visiblePlaylist = [];
if (typeof state === 'undefined') var state = { t: 0, c: 0 };
if (typeof html5QrCodeScanner === 'undefined') var html5QrCodeScanner = null;

console.log("✅ Data & Translations Loaded");

/* ===========================================================
   GUITAR CHORD DICTIONARY (Για το GuitarChordsUI)
   -1: Mute (X), 0: Ανοιχτή (O), >0: Αριθμός Τάστου
   =========================================================== */
const CHORD_DICTIONARY = {
    // --- C Family ---
    'C':     [{ frets: [-1, 3, 2, 0, 1, 0], base: 1 }, { frets: [-1, -1, 5, 5, 5, 8], base: 5 }],
    'Cm':    [{ frets: [-1, 3, 5, 5, 4, 3], base: 3 }, { frets: [8, 10, 10, 8, 8, 8], base: 8 }],
    'C7':    [{ frets: [-1, 3, 2, 3, 1, 0], base: 1 }, { frets: [-1, 3, 5, 3, 5, 3], base: 3 }],
    'Cm7':   [{ frets: [-1, 3, 5, 3, 4, 3], base: 3 }, { frets: [8, 10, 8, 8, 8, 8], base: 8 }],
    'Cmaj7': [{ frets: [-1, 3, 2, 0, 0, 0], base: 1 }, { frets: [-1, 3, 5, 4, 5, 3], base: 3 }],
    'Cdim':  [{ frets: [-1, 3, 4, 2, 4, -1], base: 1 }],
    'Csus2': [{ frets: [-1, 3, 5, 5, 3, 3], base: 3 }],
    'Csus4': [{ frets: [-1, 3, 5, 5, 6, 3], base: 3 }],

    // --- C# Family ---
    'C#':     [{ frets: [-1, 4, 6, 6, 6, 4], base: 4 }],
    'C#m':    [{ frets: [-1, 4, 6, 6, 5, 4], base: 4 }],
    'C#7':    [{ frets: [-1, 4, 6, 4, 6, 4], base: 4 }],
    'C#m7':   [{ frets: [-1, 4, 6, 4, 5, 4], base: 4 }],
    'C#maj7': [{ frets: [-1, 4, 6, 5, 6, 4], base: 4 }],
    'C#dim':  [{ frets: [-1, 4, 5, 6, 5, -1], base: 4 }],
    'C#sus2': [{ frets: [-1, 4, 6, 6, 4, 4], base: 4 }],
    'C#sus4': [{ frets: [-1, 4, 6, 6, 7, 4], base: 4 }],

    // --- D Family ---
    'D':     [{ frets: [-1, -1, 0, 2, 3, 2], base: 1 }, { frets: [-1, 5, 7, 7, 7, 5], base: 5 }],
    'Dm':    [{ frets: [-1, -1, 0, 2, 3, 1], base: 1 }, { frets: [-1, 5, 7, 7, 6, 5], base: 5 }],
    'D7':    [{ frets: [-1, -1, 0, 2, 1, 2], base: 1 }, { frets: [-1, 5, 7, 5, 7, 5], base: 5 }],
    'Dm7':   [{ frets: [-1, -1, 0, 2, 1, 1], base: 1 }, { frets: [-1, 5, 7, 5, 6, 5], base: 5 }],
    'Dmaj7': [{ frets: [-1, -1, 0, 2, 2, 2], base: 1 }],
    'Ddim':  [{ frets: [-1, -1, 0, 1, 3, 1], base: 1 }],
    'Dsus2': [{ frets: [-1, -1, 0, 2, 3, 0], base: 1 }],
    'Dsus4': [{ frets: [-1, -1, 0, 2, 3, 3], base: 1 }],

    // --- D# Family ---
    'D#':     [{ frets: [-1, 6, 8, 8, 8, 6], base: 6 }],
    'D#m':    [{ frets: [-1, 6, 8, 8, 7, 6], base: 6 }],
    'D#7':    [{ frets: [-1, 6, 8, 6, 8, 6], base: 6 }],
    'D#m7':   [{ frets: [-1, 6, 8, 6, 7, 6], base: 6 }],
    'D#maj7': [{ frets: [-1, 6, 8, 7, 8, 6], base: 6 }],
    'D#dim':  [{ frets: [-1, 6, 7, 8, 7, -1], base: 6 }],
    'D#sus2': [{ frets: [-1, 6, 8, 8, 6, 6], base: 6 }],
    'D#sus4': [{ frets: [-1, 6, 8, 8, 9, 6], base: 6 }],

    // --- E Family ---
    'E':     [{ frets: [0, 2, 2, 1, 0, 0], base: 1 }, { frets: [-1, 7, 9, 9, 9, 7], base: 7 }],
    'Em':    [{ frets: [0, 2, 2, 0, 0, 0], base: 1 }, { frets: [-1, 7, 9, 9, 8, 7], base: 7 }],
    'E7':    [{ frets: [0, 2, 0, 1, 0, 0], base: 1 }, { frets: [0, 2, 2, 1, 3, 0], base: 1 }],
    'Em7':   [{ frets: [0, 2, 0, 0, 0, 0], base: 1 }, { frets: [0, 2, 2, 0, 3, 0], base: 1 }],
    'Emaj7': [{ frets: [0, 2, 1, 1, 0, 0], base: 1 }],
    'Edim':  [{ frets: [0, 1, 2, 0, -1, -1], base: 1 }],
    'Esus2': [{ frets: [0, 2, 4, 4, 0, 0], base: 1 }],
    'Esus4': [{ frets: [0, 2, 2, 2, 0, 0], base: 1 }],

    // --- F Family ---
    'F':     [{ frets: [1, 3, 3, 2, 1, 1], base: 1 }, { frets: [-1, 8, 10, 10, 10, 8], base: 8 }],
    'Fm':    [{ frets: [1, 3, 3, 1, 1, 1], base: 1 }, { frets: [-1, 8, 10, 10, 9, 8], base: 8 }],
    'F7':    [{ frets: [1, 3, 1, 2, 1, 1], base: 1 }],
    'Fm7':   [{ frets: [1, 3, 1, 1, 1, 1], base: 1 }],
    'Fmaj7': [{ frets: [-1, -1, 3, 2, 1, 0], base: 1 }],
    'Fdim':  [{ frets: [-1, -1, 3, 4, 3, 4], base: 3 }],
    'Fsus2': [{ frets: [-1, -1, 3, 0, 1, 1], base: 1 }],
    'Fsus4': [{ frets: [-1, -1, 3, 3, 1, 1], base: 1 }],

    // --- F# Family ---
    'F#':     [{ frets: [2, 4, 4, 3, 2, 2], base: 2 }],
    'F#m':    [{ frets: [2, 4, 4, 2, 2, 2], base: 2 }],
    'F#7':    [{ frets: [2, 4, 2, 3, 2, 2], base: 2 }],
    'F#m7':   [{ frets: [2, 4, 2, 2, 2, 2], base: 2 }],
    'F#maj7': [{ frets: [-1, -1, 4, 3, 2, 1], base: 1 }],
    'F#dim':  [{ frets: [2, 3, 4, 2, -1, -1], base: 2 }],
    'F#sus2': [{ frets: [-1, -1, 4, 1, 2, 2], base: 1 }],
    'F#sus4': [{ frets: [2, 4, 4, 4, 2, 2], base: 2 }],

    // --- G Family ---
    'G':     [{ frets: [3, 2, 0, 0, 0, 3], base: 1 }, { frets: [3, 5, 5, 4, 3, 3], base: 3 }],
    'Gm':    [{ frets: [3, 5, 5, 3, 3, 3], base: 3 }],
    'G7':    [{ frets: [3, 2, 0, 0, 0, 1], base: 1 }],
    'Gm7':   [{ frets: [3, 5, 3, 3, 3, 3], base: 3 }],
    'Gmaj7': [{ frets: [3, 2, 0, 0, 0, 2], base: 1 }],
    'Gdim':  [{ frets: [-1, -1, 5, 6, 5, 6], base: 5 }],
    'Gsus2': [{ frets: [3, 0, 0, 0, 3, 3], base: 1 }],
    'Gsus4': [{ frets: [3, 3, 0, 0, 1, 3], base: 1 }],

    // --- G# Family ---
    'G#':     [{ frets: [4, 6, 6, 5, 4, 4], base: 4 }],
    'G#m':    [{ frets: [4, 6, 6, 4, 4, 4], base: 4 }],
    'G#7':    [{ frets: [4, 6, 4, 5, 4, 4], base: 4 }],
    'G#m7':   [{ frets: [4, 6, 4, 4, 4, 4], base: 4 }],
    'G#maj7': [{ frets: [4, -1, 5, 5, 4, -1], base: 4 }],
    'G#dim':  [{ frets: [4, 5, 6, 4, -1, -1], base: 4 }],
    'G#sus2': [{ frets: [4, 6, 6, 3, 4, 4], base: 3 }],
    'G#sus4': [{ frets: [4, 6, 6, 6, 4, 4], base: 4 }],

    // --- A Family ---
    'A':     [{ frets: [-1, 0, 2, 2, 2, 0], base: 1 }, { frets: [5, 7, 7, 6, 5, 5], base: 5 }],
    'Am':    [{ frets: [-1, 0, 2, 2, 1, 0], base: 1 }, { frets: [5, 7, 7, 5, 5, 5], base: 5 }],
    'A7':    [{ frets: [-1, 0, 2, 0, 2, 0], base: 1 }],
    'Am7':   [{ frets: [-1, 0, 2, 0, 1, 0], base: 1 }],
    'Amaj7': [{ frets: [-1, 0, 2, 1, 2, 0], base: 1 }],
    'Adim':  [{ frets: [-1, 0, 1, 2, 1, -1], base: 1 }],
    'Asus2': [{ frets: [-1, 0, 2, 2, 0, 0], base: 1 }],
    'Asus4': [{ frets: [-1, 0, 2, 2, 3, 0], base: 1 }],

    // --- A# Family ---
    'A#':     [{ frets: [-1, 1, 3, 3, 3, 1], base: 1 }],
    'A#m':    [{ frets: [-1, 1, 3, 3, 2, 1], base: 1 }],
    'A#7':    [{ frets: [-1, 1, 3, 1, 3, 1], base: 1 }],
    'A#m7':   [{ frets: [-1, 1, 3, 1, 2, 1], base: 1 }],
    'A#maj7': [{ frets: [-1, 1, 3, 2, 3, 1], base: 1 }],
    'A#dim':  [{ frets: [-1, 1, 2, 3, 2, -1], base: 1 }],
    'A#sus2': [{ frets: [-1, 1, 3, 3, 1, 1], base: 1 }],
    'A#sus4': [{ frets: [-1, 1, 3, 3, 4, 1], base: 1 }],

    // --- B Family ---
    'B':     [{ frets: [-1, 2, 4, 4, 4, 2], base: 2 }, { frets: [7, 9, 9, 8, 7, 7], base: 7 }],
    'Bm':    [{ frets: [-1, 2, 4, 4, 3, 2], base: 2 }, { frets: [7, 9, 9, 7, 7, 7], base: 7 }],
    'B7':    [{ frets: [-1, 2, 1, 2, 0, 2], base: 1 }],
    'Bm7':   [{ frets: [-1, 2, 0, 2, 0, 2], base: 1 }],
    'Bmaj7': [{ frets: [-1, 2, 4, 3, 4, 2], base: 2 }],
    'Bdim':  [{ frets: [-1, 2, 3, 4, 3, -1], base: 2 }],
    'Bsus2': [{ frets: [-1, 2, 4, 4, 2, 2], base: 2 }],
    'Bsus4': [{ frets: [-1, 2, 4, 4, 5, 2], base: 2 }]
};

