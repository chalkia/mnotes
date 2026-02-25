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
    "body": "Μήλο μου κόκκινο, ρόιδο βαμμένο\n!Am                     !Dm           !Am\nΓιατί με μάρανες το πικραμένο\n!Am            !G    !F      !E\n\nΠαγαίνω κι έρχομαι μα δεν σε βρίσκω\n!Am                     !Dm           !Am\nΒρίσκω την πόρτα σου μανταλωμένη\n!Am            !G    !F      !E",
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
    "body": "Amazing grace! How sweet the sound\n!G                   !C        !G\nThat saved a wretch like me!\n!G                       !D\nI once was lost, but now am found;\n!G                   !C     !G\nWas blind, but now I see.\n!G             !D    !G",
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
