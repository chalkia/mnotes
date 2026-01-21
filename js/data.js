/* =========================================
   DATA & GLOBALS
   ========================================= */

// Μουσικές Σταθερές
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Λίστες για το Smart Capo
const OPEN_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "Cmaj7", "A7", "E7", "D7", "B7"];
const HARD_CHORDS = ["C#", "D#", "F#", "G#", "A#", "Db", "Eb", "Gb", "Ab", "Bb"];

// Κατάσταση Εφαρμογής (State)
var library = [];            
var visiblePlaylist = [];    
var currentSongId = null;    
var currentFilter = "ALL";   

// State για το Viewer
var state = { 
    t: 0,              // Transpose
    c: 0,              // Capo
    parsedChords: [],  // Το αναλυμένο τραγούδι
    meta: {}           // Τίτλος, Key, Intro, Interlude
};

// --- Helper: Διασφάλιση Δομής Τραγουδιού ---
// Το μεταφέραμε εδώ γιατί φορτώνει πρώτο και το χρειάζονται όλοι
function ensureSongStructure(s) {
    return {
        id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
        title: s.title || "Χωρίς Τίτλο",
        key: s.key || "",
        notes: s.notes || "",
        intro: s.intro || "",
        interlude: s.interlude || "",
        body: s.body || "",
        playlists: Array.isArray(s.playlists) ? s.playlists : []
    };
}
