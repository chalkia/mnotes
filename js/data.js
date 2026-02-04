/* =========================================
   DATA & CONFIG (js/data.js) - FINAL v7
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
        tab_library: "Library",
        tab_setlist: "Setlist",
        
        ph_search: "Search title...",
        lbl_all_tags: "All",            
        lbl_no_demo: "All except Demo", 

        msg_capo_found: "Optimal: Capo ",
        msg_capo_perfect: "Already optimized!",
        
        msg_lyrics_mode_on: "Lyrics Mode: ON",
        msg_lyrics_mode_off: "Lyrics Mode: OFF",

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
        modal_btn_url: "From URL",
        modal_btn_qr: "Scan QR Code",
        modal_btn_cancel: "Cancel",
        
        qr_title_song: "Song Share",
        qr_title_setlist: "Setlist Share",
        msg_qr_help: "Scan this with mNotes on another device.",
        scan_title: "Scan QR",
        msg_scan_camera_error: "Camera access denied or error.",

        lbl_settings: "Settings",
        lbl_scroll_speed: "Auto-Scroll Speed",
        lbl_max_capo: "Max Capo Fret",
        lbl_backup_reminder: "Monthly Backup Reminder",
        lbl_def_theme: "Theme",
        lbl_theme_slate: "Slate (Blue)",
        lbl_theme_dark: "Dark (Black)",
        lbl_theme_light: "Light (White)",
        lbl_theme_custom: "Custom (DIY)",
        msg_settings_saved: "Settings saved!",
        
        msg_backup_reminder: "It's been over a month since your last backup. Do you want to save your library now?",

        msg_demo_delete: "⚠️ The demo/instructions cannot be deleted!",
        msg_delete_confirm: "Are you sure you want to delete this song?",
        msg_clear_confirm: "⚠️ WARNING: This will delete ALL songs (except Demo). Are you sure?",
        msg_title_body_req: "Title and Lyrics are required!",
        msg_imported: "Imported songs: ",
        msg_no_import: "Nothing imported. Songs might be duplicates or invalid.",
        msg_error_read: "Error reading file.",

        msg_setlist_empty: "Setlist is empty!",
        ph_url_import: "Enter file URL (.mnote or .json):",
        msg_import_error_url: "Import failed. Check URL or CORS settings.",
        msg_setlist_confirm: "New setlist order received. Replace current setlist?",
        msg_setlist_updated: "Setlist order updated!",
        msg_import_summary: "Imported ${added} new & updated ${updated} existing songs!",
        demo_title: "User Guide (Demo)",
        
        lbl_intro_size: "Intro/Inter Font Size",
        lbl_hide_demo: "Hide Demo (if library not empty)",
        lbl_cust_bg: "Background",
        lbl_cust_panel: "Panel/Header",
        lbl_cust_text: "Text Color",
        lbl_cust_acc: "Accent (Buttons)",
        lbl_cust_chord: "Chords Color"
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
        lbl_lyrics_mode: "Στίχοι",  
        lbl_smart_capo: "Smart Capo", 
        tab_library: "Βιβλιοθήκη",
        tab_setlist: "Προσωρινή Λίστα",
            
        ph_search: "Αναζήτηση...",
        lbl_all_tags: "Όλα",            
        lbl_no_demo: "Όλα εκτός Demo",  

        msg_capo_found: "Βέλτιστο: Capo ",
        msg_capo_perfect: "Ήδη βέλτιστο!",

        msg_lyrics_mode_on: "Λειτουργία Στίχων: ON",
        msg_lyrics_mode_off: "Λειτουργία Στίχων: OFF",

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
        modal_btn_url: "Από σύνδεσμο (URL)", 
        modal_btn_qr: "Σάρωση QR",
        modal_btn_cancel: "Ακύρωση",

        qr_title_song: "Διαμοιρασμός Τραγουδιού",
        qr_title_setlist: "Διαμοιρασμός Λίστας",
        msg_qr_help: "Σκανάρετε με το mNotes σε άλλη συσκευή.",
        scan_title: "Σάρωση QR",
        msg_scan_camera_error: "Δεν υπάρχει πρόσβαση στην κάμερα.",

        lbl_settings: "Ρυθμίσεις",
        lbl_scroll_speed: "Ταχύτητα Κύλισης",
        lbl_max_capo: "Μέγιστο Τάστο Capo",
        lbl_backup_reminder: "Υπενθύμιση Backup (Μήνας)",
        lbl_def_theme: "Επιλογή Θέματος",
        lbl_theme_slate: "Slate (Μπλε)",
        lbl_theme_dark: "Dark (Μαύρο)",
        lbl_theme_light: "Light (Λευκό)",
        lbl_theme_custom: "Προσαρμοσμένο (DIY)",
        msg_settings_saved: "Οι ρυθμίσεις αποθηκεύτηκαν!",
        
        msg_backup_reminder: "Έχει περάσει πάνω από μήνας από το τελευταίο Backup. Θέλετε να αποθηκεύσετε τη βιβλιοθήκη τώρα;",

        msg_demo_delete: "⚠️ Οι οδηγίες χρήσης δεν μπορούν να διαγραφούν!",
        msg_delete_confirm: "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το τραγούδι;",
        msg_clear_confirm: "⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα τραγούδια (εκτός από το Demo). Είστε σίγουροι;",
        msg_title_body_req: "Ο Τίτλος και οι Στίχοι είναι υποχρεωτικά!",
        msg_imported: "Εισήχθησαν τραγούδια: ",
        msg_no_import: "Δεν εισήχθη τίποτα. Ίσως υπάρχουν ήδη ή το αρχείο είναι άκυρο.",
        msg_error_read: "Σφάλμα ανάγνωσης αρχείου.",
       msg_setlist_empty: "Η Προσωρινή Λίστα είναι άδεια!",
       ph_url_import: "Εισάγετε το URL του αρχείου (.mnote ή .json):",
       msg_import_error_url: "Αποτυχία εισαγωγής. Ελέγξτε το σύνδεσμο ή το CORS.",
       msg_setlist_confirm: "Λήφθηκε νέα σειρά τραγουδιών. Αντικατάσταση Προσωρινής Λίστας;",
       msg_setlist_updated: "Η σειρά ενημερώθηκε!",
       msg_import_summary: "Εισήχθησαν ${added} νέα & ενημερώθηκαν ${updated} τραγούδια!",

        demo_title: "Οδηγίες Χρήσης (Demo)",
        
        lbl_intro_size: "Μέγεθος Intro/Inter",
        lbl_hide_demo: "Απόκρυψη Demo (αν υπάρχουν τραγούδια)",
        lbl_cust_bg: "Φόντο",
        lbl_cust_panel: "Πάνελ/Κεφαλίδα",
        lbl_cust_text: "Κείμενο",
        lbl_cust_acc: "Κουμπιά (Accent)",
        lbl_cust_chord: "Συγχορδίες"
    }
};

function t(key) { return TRANSLATIONS[currentLang][key] || key; }

const DEFAULT_DATA = [
  {
    "id": "demo_instruction",
    "title": "Οδηγίες Χρήσης (Demo)",
    "artist": "mNotes Team",
    "key": "C",
    "intro": "",
    "interlude": "",
    "notes": "Διαβάστε παρακάτω για όλες τις δυνατότητες!",
    "playlists": ["Help", "Manual"],
    "body": "Καλωσήρθατε στο mNotes! !ΑmΜια εφαρμογή για τη δημιουργία και χρήση στίχων με συγχορδίες για κιθάρα.\nΣτο περιβάλλον του editor για την εισαγωγή συγχορδίας προηγείται το θαυμαστικό (!) και τελειώνει σε κενό (π.χ. !C ).\n(Το κενό δεν είναι απαραίτητο όταν ο επόμενος χαρακτήρας είναι ελληνικός).\nΟι στροφές διαχωρίζονται με κενή γραμμή.\n\n=====================================\nΟΔΗΓΙΕΣ ΧΡΗΣΗΣ & ΔΥΝΑΤΟΤΗΤΕΣ\n=====================================\n\n1. ΒΙΒΛΙΟΘΗΚΗ\nΗ εφαρμογή δημιουργεί μια βιβλιοθήκη τραγουδιών που παραμένει στη συσκευή σας και μετά το κλείσιμο της εφαρμογής. Εμπλουτίζεται όταν κάνετε εισαγωγή κομματιών.\n\n2. ΠΡΟΣΩΡΙΝΗ ΛΙΣΤΑ (Setlist)\nΜπορείτε να δημιουργείτε Προσωρινή Λίστα (Setlist) για τα Live σας, στην οποία μετακινείτε τα τραγούδια σε όποια σειρά θέλετε (Drag & Drop).\n\n3. ΔΙΑΜΟΙΡΑΣΜΟΣ (Sharing)\n• QR Song (Μέσα στον Editor): Μοιράζεται ΜΟΝΟ το τραγούδι που βλέπετε τώρα.\n• QR Setlist (Στο Tab της Λίστας): Μοιράζεται ΜΟΝΟ τη σειρά των τραγουδιών (IDs) για να συγχρονιστείτε με την μπάντα (προϋποθέτει την ύπαρξη της βιβλιοθήκης στην άλλη συσκευή).\n• Export / Backup:\n  -> Σε PC: Κατεβάζει αρχείο ασφαλείας .mnote.\n  -> Σε Κινητό: Ανοίγει το Viber/WhatsApp/Email για άμεση αποστολή του αρχείου.\n*Προτείνεται να εξάγετε συχνά τη βιβλιοθήκη ώστε να μην τη χάσετε αν απεγκαταστήσετε την εφαρμογή.*\n\n4. ΕΙΣΑΓΩΓΗ (Import)\nΜπορείτε να εισάγετε αρχεία .mnote για τον εμπλουτισμό της βιβλιοθήκης σας, καθώς και αρχεία που ακολουθούν το πρότυπο ChordPro.\n\n5. ΜΟΥΣΙΚΑ ΕΡΓΑΛΕΙΑ\n• Transpose: Αλλάζει τον τόνο του τραγουδιού (-6 έως +6).\n• Capo: Μεταγράφει τις συγχορδίες ώστε να διαβάζονται εύκολα όταν χρησιμοποιείται capo.\n• Smart Capo: Ο αλγόριθμος προτείνει το καλύτερο τάστο για το Capo για να παίξετε με τις πιο εύκολες (ανοιχτές) συγχορδίες.\n• Lyrics Mode: Κρύβει τις συγχορδίες, μεγαλώνει τα γράμματα και ενώνει το κείμενο."
  }
];

// Global Variables Initialization (Safe check)
if (typeof library === 'undefined') var library = [];
if (typeof currentSongId === 'undefined') var currentSongId = null;
if (typeof visiblePlaylist === 'undefined') var visiblePlaylist = [];
if (typeof state === 'undefined') var state = { t: 0, c: 0 };
if (typeof html5QrCodeScanner === 'undefined') var html5QrCodeScanner = null;

console.log("✅ Data & Translations Loaded");
