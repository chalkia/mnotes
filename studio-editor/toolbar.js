/* =========================================================
   mStudio Toolbar Controller (studio-editor/toolbar.js)
   Εισάγει τα οπτικά στοιχεία (Chords, Rhythms, Strum) στον καμβά
   ========================================================= */

const EditorToolbar = {
    insertElement: function(type, value) {
        const editor = document.getElementById('editor-container');
        if (!editor) return;
        
        // Σιγουρευόμαστε ότι ο editor έχει το focus πριν κάνουμε εισαγωγή
        editor.focus(); 

        let htmlToInsert = "";

        // 1. ΣΥΓΧΟΡΔΙΑ (Χρήση <ruby> για τέλεια στοίχιση πάνω από το επόμενο γράμμα)
        if (type === 'chord') {
            // Το &#8203; είναι το "Zero-width space". Επιτρέπει στον κέρσορα να μείνει 
            // μέσα στο ruby, ακριβώς κάτω από τη συγχορδία, για να γραφτεί η λέξη.
            htmlToInsert = `<ruby class="wb-chord"><rt contenteditable="false">${value}</rt>&#8203;</ruby>`;
        }
        
        // 2. ΡΥΘΜΟΣ (Inline κουμπάκι δίπλα στο κείμενο)
        else if (type === 'rhythm') {
            htmlToInsert = `<span class="wb-rhythm" contenteditable="false"><i class="fas fa-drum"></i> ${value}</span>&nbsp;`;
        } 

        // 3. STRUMMING (Block στοιχείο, ξεχωριστή γραμμή)
        else if (type === 'strum') {
            htmlToInsert = `<div class="wb-strum" contenteditable="false"><i class="fas fa-arrows-alt-v"></i> ${value}</div>`;
        }

        // Φυτεύουμε το HTML στο σημείο του κέρσορα, διατηρώντας το ιστορικό Undo/Redo του browser
        document.execCommand('insertHTML', false, htmlToInsert);
    }
};
