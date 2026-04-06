/* ==========================================================================
   ASSET MANAGER (MEDIA LIBRARY) - Διαχείριση Αρχείων Χρήστη
   Υποστηρίζει: Audio (mp3/wav), Έγγραφα (pdf/jpg), Ρυθμούς (.mnr)
   ========================================================================== */

// 1. Άνοιγμα / Κλείσιμο του Modal
function openAssetManager(type) {
    if (!currentUser) {
        document.getElementById('authModal').style.display = 'flex';
        return;
    }
    
    // Αποθηκεύουμε τον τύπο (audio, document ή rhythm)
    document.getElementById('assetManagerCurrentType').value = type;
    document.getElementById('assetManagerModal').style.display = 'flex';
    
    loadUserAssets(type);
}

function closeAssetManager() {
    document.getElementById('assetManagerModal').style.display = 'none';
}

// 2. Φόρτωση Αρχείων από τον πίνακα user_assets (Supabase)
async function loadUserAssets(type) {
    const listContainer = document.getElementById('assetManagerList');
    listContainer.innerHTML = `<div class="empty-state">Φόρτωση αρχείων... / Loading...</div>`;

    try {
        console.log(`[AssetManager] Αναζήτηση αρχείων τύπου: ${type} για τον χρήστη: ${currentUser.id}`);
        
        const { data, error } = await supabaseClient
            .from('user_assets')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('file_type', type)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">Δεν βρέθηκαν αρχεία / No files found.</div>`;
            return;
        }

        // Επιλογή εικονιδίου ανάλογα με τον τύπο
        let iconClass = 'fas fa-file';
        if (type === 'audio') iconClass = 'fas fa-music';
        else if (type === 'document') iconClass = 'fas fa-file-pdf';
        else if (type === 'rhythm') iconClass = 'fas fa-drum'; // ΝΕΟ!

        // Σχεδιάζουμε τη λίστα
        listContainer.innerHTML = data.map(asset => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border-color);">
                <span style="font-size:0.85rem; word-break:break-all;">
                    <i class="${iconClass}" style="margin-right:5px; color:var(--accent);"></i> ${asset.custom_name}
                </span>
                <div style="display:flex; gap: 8px;">
                    <button onclick="attachExistingAsset('${asset.custom_name}', '${asset.file_url}')" class="add-mini-btn" title="Σύνδεση με το τραγούδι / Attach to song">
                        <i class="fas fa-link"></i>
                    </button>
                    <button onclick="deleteAssetFromLibrary('${asset.id}', '${asset.file_url}', '${asset.custom_name}')" class="play-mini-btn" style="color: #dc3545; border-color: #dc3545;" title="Οριστική Διαγραφή / Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("[AssetManager] Σφάλμα φόρτωσης αρχείων:", err);
        listContainer.innerHTML = `<div class="empty-state" style="color:red;">Σφάλμα / Error: ${err.message}</div>`;
    }
}

// 3. Η Καρδιά του Συστήματος: Background Upload με τη μέθοδο της "Σφραγίδας"
async function handleGlobalUpload(inputElement) {
    // 1. Έλεγχος Δικαιώματος (Feature Check)
    if (typeof canUserPerform === 'function' && !canUserPerform('SAVE_ATTACHMENTS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Αποθήκευση Αρχείων / Save Files');
        inputElement.value = ""; 
        return; 
    }

    const file = inputElement.files[0];
    if (!file) return;

    // 2. ΕΛΕΓΧΟΣ ΟΡΙΟΥ ΧΩΡΗΤΙΚΟΤΗΤΑΣ (Storage Quota Check)
    const limits = typeof getUserLimits === 'function' ? getUserLimits() : { storageLimitMB: 50 };
    const fileSizeMB = file.size / (1024 * 1024);
    
    if (fileSizeMB > limits.storageLimitMB) {
        showToast(`Το αρχείο είναι πολύ μεγάλο (${fileSizeMB.toFixed(1)}MB). Το όριό σας είναι ${limits.storageLimitMB}MB.`, "error");
        inputElement.value = ""; 
        return;
    }

    // 3. Έλεγχος Επέκτασης Αρχείου (Ο Νέος μας Πορτιέρης για τα αρχεία)
    const fileExt = file.name.split('.').pop().toLowerCase();
    const currentType = document.getElementById('assetManagerCurrentType')?.value || 'audio';
    
    if (currentType === 'audio') {
        const allowedAudio = ['mp3', 'wav', 'm4a', 'webm'];
        if (!allowedAudio.includes(fileExt)) {
            showToast("⚠️ Μη υποστηριζόμενη μορφή. Παρακαλώ επιλέξτε MP3, WAV ή M4A.", "error");
            inputElement.value = ''; return; 
        }
    } else if (currentType === 'rhythm') {
        // ΝΕΟ: Έλεγχος για αρχεία ρυθμών mNotes (.mnr)
        if (fileExt !== 'mnr'&& fileExt !== 'mnr' && fileExt !== 'mnrythm') {
            showToast("⚠️ Παρακαλώ επιλέξτε ένα αρχείο ρυθμού mNotes (.mnr, .mnrythm).", "error");
            inputElement.value = ''; return; 
        }
    } else { // documents
        const allowedDocs = ['pdf', 'png', 'jpg', 'jpeg'];
        if (!allowedDocs.includes(fileExt)) {
            showToast("⚠️ Μη υποστηριζόμενη μορφή. Παρακαλώ επιλέξτε PDF ή εικόνα.", "error");
            inputElement.value = ''; return; 
        }
    }

    // --- Η ΣΦΡΑΓΙΔΑ ---
    const targetSongId = currentSongId;
    if (!targetSongId) { showToast("Επιλέξτε τραγούδι πρώτα! / Select a song first!"); inputElement.value = ""; return; }

    const assetType = document.getElementById('assetManagerCurrentType').value;
    const defaultName = file.name.replace(/\.[^/.]+$/, ""); 
    let customTrackName = window.prompt("Όνομα Αρχείου / File Name:", defaultName);

    if (customTrackName === null) {
        inputElement.value = ""; 
        return;
    }
    
    if (customTrackName.trim() === "") customTrackName = "Untitled Asset";

    // Κλείνουμε το modal
    closeAssetManager();
    showToast(`Uploading '${customTrackName}'... Μπορείτε να συνεχίσετε την εργασία σας!`, "info");
    console.log(`[AssetManager] Ξεκινάει upload για το τραγούδι [${targetSongId}] στο παρασκήνιο...`);

    const safeNameForStorage = customTrackName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Asset_${Date.now()}_${safeNameForStorage}`;

    try {
        // Βήμα Α: Ανέβασμα στο Supabase Storage (Όλα μπαίνουν στον ίδιο bucket 'audio_files' προς το παρόν)
        const { error: uploadErr } = await supabaseClient.storage.from('audio_files').upload(`${currentUser.id}/${filename}`, file);
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabaseClient.storage.from('audio_files').getPublicUrl(`${currentUser.id}/${filename}`);
        console.log("[AssetManager] Το αρχείο ανέβηκε επιτυχώς στο Storage:", publicUrl);

        // Βήμα Β: Αποθήκευση στην παγκόσμια βιβλιοθήκη του χρήστη (user_assets)
        const { error: dbErr } = await supabaseClient
            .from('user_assets')
            .insert([{
                user_id: currentUser.id,
                custom_name: customTrackName,
                file_url: publicUrl,
                file_type: assetType
            }]);
        if (dbErr) throw dbErr;
        console.log("[AssetManager] Το αρχείο καταχωρήθηκε στη βάση user_assets.");

        // Βήμα Γ: Σύνδεση με το "Σφραγισμένο" τραγούδι
        await processAssetAttachment(targetSongId, assetType, customTrackName, publicUrl);

        showToast(`Επιτυχία! Το '${customTrackName}' συνδέθηκε στο τραγούδι.`);
    } catch (err) {
        console.error("[AssetManager] Αποτυχία Upload:", err);
        showToast("Αποτυχία Upload / Upload Failed: " + err.message, "error");
    } finally {
        inputElement.value = ""; 
    }
}

// 4. Σύνδεση ενός ΗΔΗ ΥΠΑΡΧΟΝΤΟΣ αρχείου από τη λίστα
async function attachExistingAsset(assetName, assetUrl) {
    if (!currentSongId) { showToast("Επιλέξτε τραγούδι πρώτα! / Select a song first!"); return; }
    
    const assetType = document.getElementById('assetManagerCurrentType').value;
    console.log(`[AssetManager] Σύνδεση υπάρχοντος αρχείου: ${assetName} στο τραγούδι ${currentSongId}`);
    
    await processAssetAttachment(currentSongId, assetType, assetName, assetUrl);
    
    closeAssetManager();
    showToast(`Το αρχείο '${assetName}' συνδέθηκε επιτυχώς!`);
}

// 5. Βοηθητική: Η τελική αποθήκευση στο αντικείμενο του τραγουδιού
async function processAssetAttachment(targetSongId, type, name, url) {
    const targetSong = library.find(x => x.id === targetSongId);
    if (!targetSong) {
        console.error(`[AssetManager] Το τραγούδι με ID ${targetSongId} δεν βρέθηκε πλέον στη βιβλιοθήκη!`);
        return;
    }

    const newAssetObj = { id: Date.now(), name: name, url: url, date: Date.now() };

    if (type === 'audio') {
        if (!targetSong.recordings) targetSong.recordings = [];
        targetSong.recordings.push(newAssetObj);
        
        if (typeof addRecordingToCurrentSong === 'function' && targetSongId === currentSongId) {
             await addRecordingToCurrentSong(newAssetObj);
        } else {
             if(typeof saveSong === 'function') saveSong(targetSong);
        }

        if (currentSongId === targetSongId && typeof renderRecordingsList === 'function') {
            renderRecordingsList(targetSong.recordings, []);
        }

    } else if (type === 'rhythm') { 
        // ΝΕΟ: Λογική για τους Ρυθμούς!
        if (!targetSong.rhythms) targetSong.rhythms = [];
        targetSong.rhythms.push(newAssetObj);
        
        if(typeof saveSong === 'function') saveSong(targetSong);
        // Αν υπάρχει συνάρτηση να ζωγραφίζει τους ρυθμούς (όπως τις ηχογραφήσεις), την καλούμε εδώ
        if (currentSongId === targetSongId && typeof renderRhythmsList === 'function') {
            renderRhythmsList(targetSong.rhythms);
           //  Φορτώνει τον ρυθμό αμέσως!
            if (typeof activateSongRhythm === 'function') {
                activateSongRhythm(newAssetObj.url, newAssetObj.name);
            }
        }
        
    } else { // type === 'document'
        if (!targetSong.attachments) targetSong.attachments = [];
        targetSong.attachments.push(newAssetObj);
        
        if(typeof saveSong === 'function') saveSong(targetSong);
        
        if (currentSongId === targetSongId && typeof renderAttachmentsList === 'function') {
            renderAttachmentsList(targetSong.attachments);
        }
    }
}

// 6. Οριστική Διαγραφή (Hard Delete)
async function deleteAssetFromLibrary(assetId, fileUrl, assetName) {
    if (!confirm(`Οριστική διαγραφή του "${assetName}" από το Cloud; Η ενέργεια δεν αναιρείται! \n\nPermanently delete from Cloud? This cannot be undone!`)) return;

    console.log(`[AssetManager] Ξεκινάει οριστική διαγραφή για: ${assetName}`);
    
    try {
        // Βήμα Α: Εξαγωγή του σωστού path από το public URL
        const urlParts = fileUrl.split('/audio_files/');
        if (urlParts.length === 2) {
            const filePath = urlParts[1];
            console.log("[AssetManager] Αίτημα διαγραφής από Storage:", filePath);
            const { error: storageErr } = await supabaseClient.storage.from('audio_files').remove([filePath]);
            if (storageErr) console.warn("[AssetManager] Σφάλμα Storage (μπορεί να έχει ήδη διαγραφεί):", storageErr);
        }

        // Βήμα Β: Διαγραφή από τον πίνακα user_assets
        const { error: dbErr } = await supabaseClient.from('user_assets').delete().eq('id', assetId);
        if (dbErr) throw dbErr;

        console.log("[AssetManager] Η διαγραφή ολοκληρώθηκε επιτυχώς.");
        showToast("Το αρχείο διαγράφηκε οριστικά. / File permanently deleted.");
        
        // Ανανέωση της λίστας στο Modal
        const assetType = document.getElementById('assetManagerCurrentType').value;
        loadUserAssets(assetType);

    } catch (err) {
        console.error("[AssetManager] Σφάλμα οριστικής διαγραφής:", err);
        showToast("Αποτυχία διαγραφής. / Delete failed.", "error");
    }
}
// 7. Λήψη αρχείου τοπικά στη συσκευή του χρήστη (Force Download)
async function downloadAssetLocal(fileUrl, fileName) {
    if (!fileUrl) return;
    
    if (typeof showToast === 'function') showToast("Η λήψη ξεκίνησε... / Downloading...", "info");

    try {
        console.log(`[AssetManager] Εκκίνηση λήψης για: ${fileName}`);
        
        // Κατεβάζουμε τα δεδομένα του αρχείου ως Blob
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Αποτυχία δικτύου κατά τη λήψη.");
        
        const blob = await response.blob();
        
        // Εξάγουμε την κατάληξη (π.χ. .mp3, .pdf) από το URL για να τη βάλουμε στο όνομα
        const extMatch = fileUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
        const ext = extMatch ? `.${extMatch[1]}` : '';
        const finalName = fileName.endsWith(ext) ? fileName : `${fileName}${ext}`;

        // Δημιουργία προσωρινού τοπικού συνδέσμου
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = finalName;
        
        // Προσομοίωση κλικ και καθαρισμός
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        }, 100);
        
    } catch (err) {
        console.error("[AssetManager] Σφάλμα λήψης:", err);
        showToast("Αποτυχία. Άνοιγμα σε νέα καρτέλα... / Opening in new tab...", "warning");
        window.open(fileUrl, '_blank'); // Αν μπλοκαριστεί από CORS, απλά το ανοίγει
    }
}
