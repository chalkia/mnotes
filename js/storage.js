/* =========================================
   STORAGE & DATA MANAGEMENT
   ========================================= */

const savedStatus = localStorage.getItem('mnotes_premium_status');
var USER_STATUS = {
    isPremium: savedStatus === 'true',
    freeLimit: 5 
};

function setPremiumStatus(isPremium) {
    USER_STATUS.isPremium = isPremium;
    localStorage.setItem('mnotes_premium_status', isPremium);
    window.location.reload();
}

// Διατηρείται για μελλοντική χρήση Pro έκδοσης
function isSongLocked(song) {
    if (USER_STATUS.isPremium) return false;
    if (typeof song.isLocked !== 'undefined') return song.isLocked;
    return false; 
}

function saveToLocal() {
    localStorage.setItem('mnotes_data', JSON.stringify(library));
}

function importJSON(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            const songsToProcess = Array.isArray(imported) ? imported : [imported];
            
            songsToProcess.forEach(song => {
                if (song.body) song.body = convertBracketsToBang(song.body);
                const safeSong = ensureSongStructure(song);
                const idx = library.findIndex(x => x.id === safeSong.id);
                if(idx !== -1) {
                    library[idx] = safeSong;
                } else {
                    library.push(safeSong);
                }
            });

            saveToLocal();
            if(typeof updatePlaylistDropdown === 'function') updatePlaylistDropdown();
            if(typeof applyFilters === 'function') applyFilters();
            alert("Επιτυχής εισαγωγή! ✅");
        } catch(err) {
            console.error(err);
            alert("Σφάλμα στο αρχείο JSON ❌");
        }
    };
    reader.readAsText(file);
    input.value = ''; 
}

function exportJSON() {
    const dataStr = "data:application/octet-stream;charset=utf-8," + encodeURIComponent(JSON.stringify(library, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mnotes_backup_" + new Date().toISOString().slice(0,10) + ".mnote");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
