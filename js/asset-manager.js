/* ==========================================================================
   ASSET MANAGER (MEDIA LIBRARY) - Διαχείριση Αρχείων Χρήστη
   ========================================================================== */

// 1. Άνοιγμα / Κλείσιμο του Modal
function openAssetManager(type) {
    if (!currentUser) {
        document.getElementById('authModal').style.display = 'flex';
        return;
    }
    
    // Αποθηκεύουμε τον τύπο (audio ή document) για να ξέρουμε τι ανεβάζουμε
    document.getElementById('assetManagerCurrentType').value = type;
    document.getElementById('assetManagerModal').style.display = 'flex';
    
    // Φορτώνουμε τα υπάρχοντα αρχεία του χρήστη
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

        // Σχεδιάζουμε τη λίστα
        listContainer.innerHTML = data.map(asset => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border-color);">
                <span style="font-size:0.85rem; word-break:break-all;">
                    <i class="${type === 'audio' ? 'fas fa-music' : 'fas fa-file-pdf'}"></i> ${asset.custom_name}
                </span>
                <button onclick="attachExistingAsset('${asset.custom_name}', '${asset.file_url}')" class="add-mini-btn" title="Σύνδεση με το τραγούδι / Attach to song">
                    <i class="fas fa-link"></i> Attach
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error("[AssetManager] Σφάλμα φόρτωσης αρχείων:", err);
        listContainer.innerHTML = `<div class="empty-state" style="color:red;">Σφάλμα / Error: ${err.message}</div>`;
    }
}

// 3. Η Καρδιά του Συστήματος: Background Upload με τη μέθοδο της "Σφραγίδας"
async function handleGlobalUpload(inputElement) {
    // Έλεγχος δικαιωμάτων
    if (typeof canUserPerform === 'function' && !canUserPerform('SAVE_ATTACHMENTS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Αποθήκευση Αρχείων / Save Files');
        inputElement.value = ""; 
        return; 
    }

    const file = inputElement.files[0];
    if (!file) return;

    // --- Η ΣΦΡΑΓΙΔΑ ---
    // Κρατάμε το ID του τραγουδιού που κοιτούσε ο χρήστης ΤΗ ΣΤΙΓΜΗ που πάτησε το κουμπί
    const targetSongId = currentSongId;
    if (!targetSongId) { showToast("Επιλέξτε τραγούδι πρώτα! / Select a song first!"); return; }

    const assetType = document.getElementById('assetManagerCurrentType').value;
    
    // Προετοιμασία ονόματος (Bilingual prompt)
    const defaultName = file.name.replace(/\.[^/.]+$/, ""); 
    let customTrackName = window.prompt("Όνομα Αρχείου / File Name:", defaultName);

    if (customTrackName === null) {
        inputElement.value = ""; // Ακύρωση
        return;
    }
    if (customTrackName.trim() === "") customTrackName = "Untitled Asset";

    // Κλείνουμε το modal για να μην τον εμποδίζουμε, ξεκινάει το background upload!
    closeAssetManager();
    showToast(`Uploading '${customTrackName}'... Μπορείτε να συνεχίσετε την εργασία σας!`, "info");
    console.log(`[AssetManager] Ξεκινάει upload για το τραγούδι [${targetSongId}] στο παρασκήνιο...`);

    const safeNameForStorage = customTrackName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Asset_${Date.now()}_${safeNameForStorage}`;

    try {
        // Βήμα Α: Ανέβασμα στο Supabase Storage
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
        
        // Καλούμε την παλιά σου συνάρτηση αποθήκευσης αν υπάρχει, αλλιώς πρέπει να σώσουμε το targetSong
        if (typeof addRecordingToCurrentSong === 'function' && targetSongId === currentSongId) {
             await addRecordingToCurrentSong(newAssetObj);
        } else {
             // Αν έχεις γενική συνάρτηση saveSong()
             if(typeof saveSong === 'function') saveSong(targetSong);
        }

        // Ανανέωση UI ΜΟΝΟ αν ο χρήστης κοιτάζει ακόμα το ίδιο τραγούδι! (Αποτρέπει το AbortError)
        if (currentSongId === targetSongId && typeof renderRecordingsList === 'function') {
            renderRecordingsList(targetSong.recordings, []);
        }

    } else { // type === 'document'
        if (!targetSong.attachments) targetSong.attachments = [];
        targetSong.attachments.push(newAssetObj);
        
        // Αντίστοιχη λογική για τα έγγραφα
        if(typeof saveSong === 'function') saveSong(targetSong);
        
        if (currentSongId === targetSongId && typeof renderAttachmentsList === 'function') {
            renderAttachmentsList(targetSong.attachments);
        }
    }
}
