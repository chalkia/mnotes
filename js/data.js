/* =========================================
   DATA & CONFIG (js/data.js)
   ========================================= */

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Το Demo τραγούδι που δεν θα σβήνεται ποτέ
const DEFAULT_DATA = [
  {
    "id": "demo_instruction", // Ειδικό ID για προστασία
    "title": "Demo",
    "artist": "mNotes Team",
    "key": "Am",
    "intro": "!Am | !Dm | !E | !Am",
    "interlude": "",
    "notes": "Αυτό είναι ένα παράδειγμα που δεν μπορεί να διαγραφεί.",
    "playlists": ["Οδηγίες"],
    "body": "Καλωσήρθατε στο mNotes!\n\nΓια να βάλετε συγχορδίες, χρησιμοποιήστε το θαυμαστικό (!)\nπριν από τη νότα. Παράδειγμα:\n\n!AmΑυτό είναι !Dmένα παράδειγμα\n\nΟι συγχορδίες θα εμφανιστούν αυτόματα πάνω από το κείμενο."
  }
];

// Global State
var library = [];
var currentSongId = null;
var visiblePlaylist = [];
var state = { t: 0, c: 0 };

console.log("✅ Data Config Loaded");
