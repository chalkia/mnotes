/* =========================================
   DATA & GLOBALS (js/data.js)
   ========================================= */

// Μουσικές Σταθερές (Μόνο οι νότες εδώ)
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// ΠΡΟΣΟΧΗ: ΑΦΑΙΡΕΣΑΜΕ ΤΑ OPEN_CHORDS ΑΠΟ ΕΔΩ ΓΙΑ ΝΑ ΜΗΝ ΧΤΥΠΑΕΙ ERROR

// State
var library = [];            
var visiblePlaylist = [];    
var currentSongId = null;    
var liveSetlist = JSON.parse(localStorage.getItem('mnotes_setlist')) || [];

// State για το Viewer
var state = { t: 0, c: 0, parsedChords: [], meta: {} };

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
        msg_confirm_tag_delete: "⚠️ Delete this tag from ALL songs?",
        
        // UI Labels
        btn_import: "Import",
        ph_search: "Search title...",
        msg_imported: "Imported songs: ",
        msg_no_import: "No new songs found.",
        msg_error_read: "File error.",
        msg_title_body_req: "Title and Body are required!",
        msg_demo_delete: "Cannot delete Demo.",
        msg_delete_confirm: "Delete this song?"
    },
    el: {
        demo_title: "Οδηγίες (Demo)",
        lbl_all_tags: "Όλα",
        lbl_no_demo: "Όλα εκτός Demo",
        msg_lyrics_mode_on: "Προβολή Στίχων: ON",
        msg_lyrics_mode_off: "Προβολή Στίχων: OFF",
        msg_capo_found: "Βέλτιστο Capo: ",
        msg_capo_perfect: "Δεν χρειάζεται Capo!",
        msg_confirm_tag_delete: "⚠️ Διαγραφή ετικέτας από ΟΛΑ τα τραγούδια;",

        // UI Labels
        btn_import: "Εισαγωγή",
        ph_search: "Αναζήτηση...",
        msg_imported: "Εισήχθησαν: ",
        msg_no_import: "Δεν βρέθηκαν νέα τραγούδια.",
        msg_error_read: "Σφάλμα αρχείου.",
        msg_title_body_req: "Τίτλος και Στίχοι υποχρεωτικά!",
        msg_demo_delete: "Το Demo δεν διαγράφεται.",
        msg_delete_confirm: "Διαγραφή τραγουδιού;"
    }
};

function t(key) { return TRANSLATIONS[currentLang][key] || key; }

const DEFAULT_DATA = [{
    "id": "demo_fixed_001", "title": "mNotes Demo", "artist": "mNotes Team", "key": "Am",
    "body": "!AmWelcome to mNotes\n!GYour ultimate songbook", "playlists": ["Demo"]
}];
