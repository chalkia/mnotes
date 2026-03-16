/* =========================================
   STORAGE & DATA MANAGEMENT (WYSIWYG EXPORT & SAFE IMPORT)
   ========================================= */

function saveToLocal() {
    const storageKey = (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal') 
        ? 'mnotes_band_' + currentGroupId 
        : 'mnotes_data';
        
    localStorage.setItem(storageKey, JSON.stringify(library));
    console.log(`💾 [STORAGE] Τοπική αποθήκευση στο κλειδί: ${storageKey}`);
}

async function importJSON(input) {
    const file = input.files[0];
    if(!file) return;

    const isBandContext = (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal');

    // Έλεγχος Δικαιωμάτων: Στη μπάντα, ΜΟΝΟ ο Admin/Owner/Maestro μπορεί να κάνει Import
    if (isBandContext) {
        const isGod = (typeof currentRole !== 'undefined') && (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');
        if (!isGod) {
            alert("Μόνο οι διαχειριστές της μπάντας μπορούν να κάνουν μαζική εισαγωγή αρχείων.");
            input.value = '';
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            let importedSongs = [];

            if (imported.app_version && imported.songs) {
                importedSongs = imported.songs;
            } else {
                importedSongs = Array.isArray(imported) ? imported : [imported];
            }

            // ✨ ΠΡΟΣΑΡΜΟΣΜΕΝΗ ΚΑΙ ΕΝΤΟΝΗ ΠΡΟΕΙΔΟΠΟΙΗΣΗ
            let confirmMsg = "";
            if (isBandContext) {
                confirmMsg = `⚠️ ΠΡΟΣΟΧΗ! ⚠️\n\nΠάτε να εισάγετε ${importedSongs.length} τραγούδια στην ΚΟΙΝΗ βιβλιοθήκη της Μπάντας!\nΑυτό θα επηρεάσει όλα τα μέλη.\n\nΘέλετε σίγουρα να συνεχίσετε;`;
            } else {
                confirmMsg = `Βρέθηκαν ${importedSongs.length} τραγούδια.\nΘέλετε να τα εισάγετε στην Προσωπική σας Βιβλιοθήκη;`;
            }

            if (!confirm(confirmMsg)) {
                input.value = ''; return;
            }

            console.log("📥 [IMPORT] Ξεκινάει ο έξυπνος έλεγχος διπλοεγγραφών...");

            let addedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;

            for (let song of importedSongs) {
                if (typeof convertBracketsToBang === 'function' && song.body) {
                    song.body = convertBracketsToBang(song.body);
                }
                
                let safeSong = typeof ensureSongStructure === 'function' ? ensureSongStructure(song) : song;
                
                safeSong.group_id = isBandContext ? currentGroupId : null;
                safeSong.user_id = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : safeSong.user_id;
                safeSong.attachments = [];
                safeSong.recordings = [];

                const idxById = library.findIndex(x => x.id === safeSong.id);
                const safeTitle = (safeSong.title || "").toLowerCase().trim();
                const safeArtist = (safeSong.artist || "").toLowerCase().trim();
                const idxByContent = library.findIndex(x => 
                    (x.title || "").toLowerCase().trim() === safeTitle && 
                    (x.artist || "").toLowerCase().trim() === safeArtist
                );

                let needsCloudSync = false;

                if (idxById !== -1) {
                    const existingSong = library[idxById];
                    const importedTime = new Date(safeSong.updated_at || 0).getTime();
                    const existingTime = new Date(existingSong.updated_at || 0).getTime();

                    if (importedTime > existingTime) {
                        library[idxById] = safeSong;
                        updatedCount++;
                        needsCloudSync = true;
                    } else {
                        skippedCount++;
                    }
                } 
                else if (idxByContent !== -1) {
                    skippedCount++;
                } 
                else {
                    safeSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
                    library.push(safeSong);
                    addedCount++;
                    needsCloudSync = true;
                }

                if (needsCloudSync) {
                    if (navigator.onLine && typeof supabaseClient !== 'undefined' && typeof currentUser !== 'undefined') {
                        const safePayload = window.sanitizeForDatabase(safeSong, currentUser.id, safeSong.group_id);
                        await supabaseClient.from('songs').upsert(safePayload);
                    } else if (typeof addToSyncQueue === 'function') {
                        const safePayload = window.sanitizeForDatabase(safeSong, typeof currentUser !== 'undefined' ? currentUser.id : 'offline', safeSong.group_id);
                        addToSyncQueue('SAVE_SONG', safePayload);
                    }
                }
            }

            saveToLocal();
            
            if (typeof loadContextData === 'function') {
                await loadContextData(); 
            } else {
                if(typeof updatePlaylistDropdown === 'function') updatePlaylistDropdown();
                if(typeof applyFilters === 'function') applyFilters();
            }
            
            const resultMsg = `Η Εισαγωγή Ολοκληρώθηκε!\n\nΝέα: ${addedCount}\nΕνημερώθηκαν: ${updatedCount}\nΠαραλείφθηκαν (Διπλά): ${skippedCount}`;
            alert(resultMsg);
            
        } catch(err) {
            console.error("❌ [IMPORT ERROR]", err);
            alert("Σφάλμα στην ανάγνωση του αρχείου .mnote ❌");
        }
    };
    reader.readAsText(file);
    input.value = ''; 
}

function exportJSON() {
    const isPersonal = (typeof currentGroupId === 'undefined' || currentGroupId === 'personal');
    
    // ✨ ΜΑΓΕΙΑ W.Y.S.I.W.Y.G: Παίρνουμε Ο,ΤΙ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ στη Sidebar!
    let songsToExport = (typeof visiblePlaylist !== 'undefined' && visiblePlaylist.length > 0) 
                        ? visiblePlaylist 
                        : (typeof library !== 'undefined' ? library : []);
                        
    if (songsToExport.length === 0) {
        alert("Δεν υπάρχουν τραγούδια για εξαγωγή στην τρέχουσα προβολή!");
        return;
    }

    let isSetlistMode = (typeof viewMode !== 'undefined' && viewMode === 'setlist');
    let modeLabel = isSetlistMode ? 'Setlist' : 'Library';
    
    console.log(`📦 [EXPORT] Εξαγωγή ${songsToExport.length} τραγουδιών. Προβολή: ${modeLabel}`);

    const cleanSongs = songsToExport.map(s => {
        return {
            id: s.id,
            title: s.title,
            artist: s.artist,
            body: s.body,
            key: s.key,
            intro: s.intro,
            interlude: s.interlude,
            video: s.video,
            tags: s.tags,
            notes: s.notes
        };
    });

    const exportPayload = {
        app_version: "2.1",
        export_date: new Date().toISOString(),
        context: isPersonal ? 'personal' : 'band',
        type: modeLabel.toLowerCase(),
        songs: cleanSongs
    };

    const dataStr = "data:application/octet-stream;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    
    // Δυναμικό όνομα: π.χ. mnotes_Personal_Setlist_2026-03-17.mnote
    let prefix = isPersonal ? 'Personal' : 'Band';
    downloadAnchorNode.setAttribute("download", `mnotes_${prefix}_${modeLabel}_${new Date().toISOString().slice(0,10)}.mnote`);
    
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    if (typeof showToast === 'function') showToast(`Η εξαγωγή (${modeLabel}) ολοκληρώθηκε! 📦`);
}
