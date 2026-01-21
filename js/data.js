/* =========================================
   DATA & GLOBALS
   ========================================= */
// Σταθερές
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var EASY_CHORDS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm", "A7", "E7", "D7", "G7", "C7"];
var OK_CHORDS = ["F", "Bm", "B7"]; 

// Κατάσταση Εφαρμογής (State)
var library = [];            // Όλα τα τραγούδια
var visiblePlaylist = [];    // Τραγούδια που φαίνονται τώρα (λόγω φίλτρου)
var currentSongId = null;    // Το ID του τρέχοντος τραγουδιού
var currentFilter = "ALL";   // Το ενεργό φίλτρο

// Αντικείμενο που κρατάει την τρέχουσα κατάσταση του Viewer
var state = { 
    t: 0,              // Transpose value
    c: 0,              // Capo value
    parsedChords: [],  // Τα parsed blocks για το render
    parsedLyrics: [],  // (Δεν χρησιμοποιείται πλέον με τη νέα δομή αλλά το κρατάμε για ασφάλεια)
    meta: {}           // Τίτλος, Key, Intro, Interlude
};

var html5QrcodeScanner = null; // Για το QR Scanner
