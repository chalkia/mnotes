/* =========================================================
   mStudio - Custom Kit Database (rhythm-engine/custom-kit-db.js)
   Αποθηκεύει τα custom drum kits τοπικά (IndexedDB) για μηδενικό latency
   ========================================================= */

const CustomKitDB = {
    dbName: 'mStudioKitsDB',
    version: 1,

    // Άνοιγμα/Δημιουργία της Βάσης
    init: function() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('kits')) {
                    // Το id θα είναι της μορφής 'custom_12345'
                    db.createObjectStore('kits', { keyPath: 'id' });
                }
            };
            
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject('IndexedDB Init Error: ' + e.target.error);
        });
    },

    // Αποθήκευση νέου Custom Kit
    // voiceBlobs = { v1: Blob, v2: Blob, ... }
    saveKit: async function(id, name, voiceBlobs) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kits', 'readwrite');
            const store = tx.objectStore('kits');
            
            store.put({
                id: id,
                name: name,
                voices: voiceBlobs,
                timestamp: Date.now()
            });

            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject('Save Error: ' + e.target.error);
        });
    },

    // Φόρτωση ενός Kit (Επιστρέφει το όνομα και τα Blobs των ήχων)
    getKit: async function(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kits', 'readonly');
            const store = tx.objectStore('kits');
            const req = store.get(id);
            
            req.onsuccess = () => resolve(req.result); // Επιστρέφει undefined αν δεν βρεθεί
            req.onerror = (e) => reject('Get Error: ' + e.target.error);
        });
    },

    // Επιστρέφει λίστα με όλα τα custom kits (για το Dropdown μενού)
    getAllKitsMetadata: async function() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kits', 'readonly');
            const store = tx.objectStore('kits');
            const req = store.getAll();
            
            req.onsuccess = () => {
                // Επιστρέφουμε μόνο τα ονόματα και τα ID, όχι τα βαριά audio files
                const list = req.result.map(kit => ({ id: kit.id, name: kit.name }));
                resolve(list);
            };
            req.onerror = (e) => reject('GetAll Error: ' + e.target.error);
        });
    }
};