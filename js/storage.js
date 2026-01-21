/* =========================================
   STORAGE & GITHUB SYNC
   ========================================= */

// Αποθήκευση στο LocalStorage του browser
function saveToLocal() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

// Εισαγωγή από αρχείο (Upload)
function importJSON(input) {
    var file = input.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var imported = JSON.parse(e.target.result);
            if(Array.isArray(imported)) {
                // Merge logic: Προσθήκη νέων ή ενημέρωση υπαρχόντων
                imported.forEach(song => {
                    var safeSong = ensureSongStructure(song);
                    var idx = library.findIndex(x => x.id === safeSong.id);
                    if(idx !== -1) {
                        library[idx] = safeSong; // Ενημέρωση
                    } else {
                        library.push(safeSong); // Προσθήκη
                    }
                });
            } else {
                // Single song import
                var safeSong = ensureSongStructure(imported);
                library.push(safeSong);
            }
            saveToLocal();
            updatePlaylistDropdown();
            filterPlaylist();
            alert("Επιτυχής εισαγωγή! ✅");
        } catch(err) {
            console.error(err);
            alert("Σφάλμα στο αρχείο JSON ❌");
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset
}

// Εξαγωγή σε αρχείο (Download)
function exportJSON() {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(library, null, 2));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mnotes_backup_" + new Date().toISOString().slice(0,10) + ".mnote");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// --- GITHUB SYNC ---
async function syncWithGitHub() {
    // Η διεύθυνση RAW του αρχείου στο GitHub
    // Αν το branch σου λέγεται 'master' αντί για 'main', άλλαξέ το εδώ.
    const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/chalkia/mnotes/main/library.json';

    try {
        console.log("Checking GitHub for updates...");
        const response = await fetch(GITHUB_RAW_URL);
        
        if (!response.ok) {
            console.warn("GitHub file not found or network error.");
            return;
        }

        const remoteData = await response.json();
        
        if (!Array.isArray(remoteData)) {
            console.warn("Invalid data format from GitHub");
            return;
        }

        var changesCount = 0;

        // Συγχώνευση (Merge)
        remoteData.forEach(remoteSong => {
            var safeSong = ensureSongStructure(remoteSong);
            var idx = library.findIndex(localSong => localSong.id === safeSong.id);

            // Αν υπάρχει ήδη, το ανανεώνουμε ΜΟΝΟ αν είναι διαφορετικό (απλή λογική)
            // Ή απλά το κάνουμε overwrite για να είμαστε σίγουροι ότι έχουμε την έκδοση του GitHub
            if (idx !== -1) {
                // Εδώ επιλέγουμε να ΚΡΑΤΑΜΕ την έκδοση του GitHub ως "Αλήθεια"
                // Αν θέλεις να μην χάνεις τις τοπικές αλλαγές, χρειάζεται πιο πολύπλοκη λογική (timestamps).
                // Προς το παρόν: Το GitHub κερδίζει.
                if (JSON.stringify(library[idx]) !== JSON.stringify(safeSong)) {
                    library[idx] = safeSong;
                    changesCount++;
                }
            } else {
                // Αν δεν υπάρχει, το προσθέτουμε
                library.push(safeSong);
                changesCount++;
            }
        });

        if (changesCount > 0) {
            saveToLocal(); // Αποθήκευση στο κινητό
            updatePlaylistDropdown();
            filterPlaylist();
            renderSidebar();
            
            // Εμφάνιση μηνύματος (Toast)
            showToast("Συγχρονίστηκαν " + changesCount + " τραγούδια από GitHub! ☁️");
        } else {
            console.log("Library is up to date.");
        }

    } catch (error) {
        console.error("GitHub Sync Error:", error);
    }
}
