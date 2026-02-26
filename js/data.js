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
