/* =========================================
   DATA & GLOBALS (js/data.js) - FINAL FIXED
   ========================================= */

// Μουσικές Σταθερές (Μόνο οι νότες εδώ)
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

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
        app_title: "mNotes",
        btn_new: "New",
        btn_import: "Import",
        btn_clear: "Clear All",
        lbl_intro: "INTRO",
        lbl_inter: "INTER",
        lbl_transpose: "Transpose",
        lbl_capo: "Capo",
        lbl_edit: "Edit",
        lbl_cancel: "Cancel",
        lbl_save: "Save",
        
        ph_search: "Search title...",
        lbl_all_tags: "All",
        lbl_no_demo: "All except Demo",

        msg_capo_found: "Optimal: Capo ",
        msg_capo_perfect: "Already optimized!",
        
        msg_lyrics_mode_on: "Lyrics Mode: ON",
        msg_lyrics_mode_off: "Lyrics Mode: OFF",

        msg_confirm_tag_delete: "⚠️ Delete this tag from ALL songs?",
        msg_imported: "Imported songs: ",
        msg_no_import: "No new songs found.",
        msg_error_read: "File error.",
        msg_title_body_req: "Title and Body are required!",
        msg_demo_delete: "Cannot delete Demo.",
        msg_delete_confirm: "Delete this song?",
        
        demo_title: "User Guide (Demo)",
        demo_body: "Welcome to mNotes!\n\nTo add chords, use the exclamation mark (!)\nbefore the note. Example:\n\n!AmThis is !Dman example"
    },
    el: {
        app_title: "mNotes",
        btn_new: "Νέο",
        btn_import: "Εισαγωγή",
        btn_clear: "Διαγραφή",
        lbl_intro: "ΕΙΣΑΓΩΓΗ",
        lbl_inter: "ΕΝΔΙΑΜΕΣΟ",
        lbl_transpose: "Τόνος",
        lbl_capo: "Capo",
        lbl_edit: "Επεξεργασία",
        lbl_cancel: "Άκυρο",
        lbl_save: "Αποθήκευση",
        
        ph_search: "Αναζήτηση...",
        lbl_all_tags: "Όλα",
        lbl_no_demo: "Όλα εκτός Demo",

        msg_capo_found: "Βέλτιστο: Capo ",
        msg_capo_perfect: "Ήδη βέλτιστο!",

        msg_lyrics_mode_on: "Λειτουργία Στίχων: ON",
        msg_lyrics_mode_off: "Λειτουργία Στίχων: OFF",

        msg_confirm_tag_delete: "⚠️ Διαγραφή ετικέτας από ΟΛΑ τα τραγούδια;",
        msg_imported: "Εισήχθησαν: ",
        msg_no_import: "Δεν βρέθηκαν νέα τραγούδια.",
        msg_error_read: "Σφάλμα αρχείου.",
        msg_title_body_req: "Τίτλος και Στίχοι υποχρεωτικά!",
        msg_demo_delete: "Το Demo δεν διαγράφεται.",
        msg_delete_confirm: "Διαγραφή τραγουδιού;",

        demo_title: "Οδηγίες Χρήσης (Demo)",
        demo_body: "Καλωσήρθατε στο mNotes!\n\nΓια να βάλετε συγχορδίες, χρησιμοποιήστε το θαυμαστικό (!)\nπριν από τη νότα. Παράδειγμα:\n\n!AmΑυτό είναι !Dmένα παράδειγμα"
    }
};

function t(key) { return TRANSLATIONS[currentLang][key] || key; }

const DEFAULT_DATA = [
  {
    "id": "demo_instruction",
    "title": "mNotes Demo",
    "artist": "mNotes Team",
    "key": "Am",
    "intro": "!Am | !Dm | !E | !Am",
    "interlude": "",
    "notes": "Demo / Οδηγίες",
    "playlists": ["Help"],
    "body": "!AmWelcome / !DmΚαλωσήρθατε"
  }
];
