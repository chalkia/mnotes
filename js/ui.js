/* =========================================
   UI & RENDERING (SPLIT VIEW EDITION)
   ========================================= */

function render(originalSong) {
    // 1. Υπολογισμός Μετατόπισης
    // α) Το Badge της κλίμακας επηρεάζεται ΜΟΝΟ από το Transpose (για να ξέρουμε τον τόνο του τραγουδιστή)
    var keyShift = state.t; 
    
    // β) Οι Συγχορδίες που βλέπουμε επηρεάζονται από Transpose ΚΑΙ Capo
    // (π.χ. Capo 2 = παίζουμε συγχορδίες 2 ημιτόνια κάτω για να βγει ο ίδιος τόνος)
    var chordShift = state.t - state.c;

    // Ενημέρωση Header
    document.getElementById('displayTitle').innerText = state.meta.title;
    document.getElementById('visualKey').innerText = state.meta.key ? getNote(state.meta.key, keyShift) : "-";
    
    // Notes Toggle
    var notesBox = document.getElementById('displayNotes');
    var notesBtn = document.getElementById('btnToggleNotes');
    if(state.meta.notes && state.meta.notes.trim() !== "") {
        notesBox.innerText = state.meta.notes;
        notesBtn.style.display = 'inline-block';
    } else { notesBtn.style.display = 'none'; notesBox.style.display = 'none'; }

    // --- SPLIT VIEW LOGIC ---
    // Pinned: Intro + Interlude + 1η Στροφή
    // Scroll: Υπόλοιπο τραγούδι

    var pinnedDiv = document.getElementById('pinnedContainer');
    var scrollDiv = document.getElementById('outputContent');
    var scrollIntro = document.getElementById('scrollIntro'); 
    
    // Δημιουργία ή Καθαρισμός του δυναμικού pinned container
    let dynPinned = document.getElementById('dynamicPinnedContent');
    if(!dynPinned) {
        dynPinned = document.createElement('div');
        dynPinned.id = 'dynamicPinnedContent';
        pinnedDiv.appendChild(dynPinned);
    }
    dynPinned.innerHTML = ""; // Καθαρισμός Pinned
    scrollDiv.innerHTML = ""; // Καθαρισμός Scroll
    scrollIntro.style.display = 'none'; // Απόκρυψη του παλιού Intro

    // 1. Render INTRO (Σ
