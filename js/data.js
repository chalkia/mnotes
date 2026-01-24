/* =========================================
   DATA & GLOBALS
   ========================================= */

// Μουσικές Σταθερές
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Λίστες για το Smart Capo (Χρειάζονται στο logic.js)
const OPEN_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "Cmaj7", "A7", "E7", "D7", "B7", "Fmaj7"];
const HARD_CHORDS = ["C#", "D#", "F#", "G#", "A#", "Db", "Eb", "Gb", "Ab", "Bb", "B", "F"];

// State
var library = [];            
var visiblePlaylist = [];    
var currentSongId = null;    
var liveSetlist = JSON.parse(localStorage.getItem('mnotes_setlist')) || []; // ΝΕΟ: Setlist

// State για το Viewer
var state = { 
    t: 0, c: 0, parsedChords: [], meta: {}
};

var currentLang = localStorage.getItem('mnotes_lang') || 'en'; 

const TRANSLATIONS = {
    en: {
        demo_title: "mNotes Demo",
        lbl_all_tags: "All Tags",
        lbl_no_demo: "All except Demo",
        msg_lyrics_mode_on: "Lyrics Mode: ON",
        msg_lyrics_mode_off: "Lyrics Mode: OFF",
        msg_capo_found: "Optimal Capo: ",
        msg_capo_perfect: "No Capo needed!",
        msg_confirm_tag_delete: "⚠️ Delete this tag from ALL songs?"
    },
    el: {
        demo_title: "Οδηγίες (Demo)",
        lbl_all_tags: "Όλα",
        lbl_no_demo: "Όλα εκτός Demo",
        msg_lyrics_mode_on: "Προβολή Στίχων: ON",
        msg_lyrics_mode_off: "Προβολή Στίχων: OFF",
        msg_capo_found: "Βέλτιστο Capo: ",
        msg_capo_perfect: "Δεν χρειάζεται Capo!",
        msg_confirm_tag_delete: "⚠️ Διαγραφή ετικέτας από ΟΛΑ τα τραγούδια;"
    }
};

function t(key) { return TRANSLATIONS[currentLang][key] || key; }

// --- Helper ---
function ensureSongStructure(s) {
    return {
        id: s.id || Date.now().toString() + Math.random().toString().slice(2,5),
        title: s.title || "Untitled",
        key: s.key || "",
        notes: s.notes || "",
        intro: s.intro || "",
        interlude: s.interlude || "",
        body: s.body || "",
        playlists: Array.isArray(s.playlists) ? s.playlists : []
    };
}
