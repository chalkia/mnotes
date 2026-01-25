/* =========================================
   DATA & CONFIG (js/data.js)
   ========================================= */

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

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
        lbl_lyrics_mode: "Lyrics",
        lbl_smart_capo: "Smart Capo",
        
        ph_search: "Search title...",
        lbl_all_tags: "All",           // Updated
        lbl_no_demo: "All except Demo", // New

        msg_capo_found: "Optimal: Capo ",
        msg_capo_perfect: "Already optimized!",
        
        // Lyrics Mode
        msg_lyrics_mode_on: "Lyrics Mode: ON",
        msg_lyrics_mode_off: "Lyrics Mode: OFF",

        // Tags
        msg_confirm_tag_delete: "⚠️ This will remove this tag from ALL songs in your library. Are you sure?",

        ph_title: "Song Title",
        ph_artist: "Artist",
        ph_key: "Key (e.g. Am)",
        ph_tags: "Tags / Playlists",
        ph_intro: "Intro (e.g. !Am | !G)",
        ph_inter: "Interlude",
        ph_notes: "Private Notes",
        ph_body: "Write lyrics & chords here...\nExample: !AmHello !Gfriend",
        
        modal_import_title: "Import",
        modal_btn_file: "File (.json)",
        modal_btn_qr: "Scan QR Code",
        modal_btn_cancel: "Cancel",
        
        qr_title: "Song QR Code",
        msg_qr_help: "Scan this with mNotes on another device.",
        scan_title: "Scan QR",
        msg_scan_camera_error: "Camera access denied or error.",

        msg_demo_delete: "⚠️ The demo/instructions cannot be deleted!",
        msg_delete_confirm: "Are you sure you want to delete this song?",
        msg_clear_confirm: "⚠️ WARNING: This will delete ALL songs (except Demo). Are you sure?",
        msg_title_body_req: "Title and Lyrics are required!",
        msg_imported: "Imported songs: ",
        msg_no_import: "Nothing imported. Songs might be duplicates or invalid.",
        msg_error_read: "Error reading file.",
        
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
        lbl_lyrics_mode: "Στίχοι",  // Προσθήκη για το κουμπί
        lbl_smart_capo: "Smart Capo", // Προσθήκη για το label
        
        ph_search: "Αναζήτηση...",
        lbl_all_tags: "Όλα",            // Updated
        lbl_no_demo: "Όλα εκτός Demo",  // New

        msg_capo_found: "Βέλτιστο: Capo ",
        msg_capo_perfect: "Ήδη βέλτιστο!",

        // Lyrics Mode
        msg_lyrics_mode_on: "Λειτουργία Στίχων: ON",
        msg_lyrics_mode_off: "Λειτουργία Στίχων: OFF",

        // Tags
        msg_confirm_tag_delete: "⚠️ Αυτό θα διαγράψει την κατηγορία από ΟΛΑ τα τραγούδια. Είστε σίγουροι;",

        ph_title: "Τίτλος Τραγουδιού",
        ph_artist: "Καλλιτέχνης",
        ph_key: "Τόνος (π.χ. Am)",
        ph_tags: "Ετικέτες / Λίστες",
        ph_intro: "Εισαγωγή (π.χ. !Am | !G)",
        ph_inter: "Ενδιάμεσο / Γέφυρα",
        ph_notes: "Σημειώσεις",
        ph_body: "Γράψτε στίχους & συγχορδίες...\nΠαράδειγμα: !AmΚαλημέρα !Gφίλε",

        modal_import_title: "Εισαγωγή",
        modal_btn_file: "Αρχείο (.json)",
        modal_btn_qr: "Σάρωση QR",
        modal_btn_cancel: "Άκυρο",

        qr_title: "QR Τραγουδιού",
        msg_qr_help: "Σκανάρετε με το mNotes σε άλλη συσκευή.",
        scan_title: "Σάρωση QR",
        msg_scan_camera_error: "Δεν υπάρχει πρόσβαση στην κάμερα.",

        msg_demo_delete: "⚠️ Οι οδηγίες χρήσης δεν μπορούν να διαγραφούν!",
        msg_delete_confirm: "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το τραγούδι;",
        msg_clear_confirm: "⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα τραγούδια (εκτός από το Demo). Είστε σίγουροι;",
        msg_title_body_req: "Ο Τίτλος και οι Στίχοι είναι υποχρεωτικά!",
        msg_imported: "Εισήχθησαν τραγούδια: ",
        msg_no_import: "Δεν εισήχθη τίποτα. Ίσως υπάρχουν ήδη ή το αρχείο είναι άκυρο.",
        msg_error_read: "Σφάλμα ανάγνωσης αρχείου.",

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

var library = [];
var currentSongId = null;
var visiblePlaylist = [];
var state = { t: 0, c: 0 };
var html5QrCodeScanner = null;

console.log("✅ Data & Translations Loaded");
