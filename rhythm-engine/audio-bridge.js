/* =========================================
   MNOTES AUDIO BRIDGE (js/audio-bridge.js) - v1.0
   Ο μεταφραστής ανάμεσα στο UI του mNotes και
   την Universal Percussion Engine.
   ========================================= */

class MNotesAudioBridge {
    constructor(externalEngineInstance) {
        this.engine = externalEngineInstance;

        if (!this.engine) {
            console.warn("⚠️ [AudioBridge] Ξεκίνησε σε Dummy Mode (Αναμονή εξωτερικής μηχανής).");
        } else {
            this._setupListeners();
        }
    }

    _setupListeners() {
        // Ακούμε τα σήματα που μας στέλνει η μηχανή και ενημερώνουμε το UI
        this.engine.on('step', (stepIndex) => this.updateGridHighlight(stepIndex));

        this.engine.on('kitLoaded', (kitData) => {
            console.log(`🥁 [AudioBridge] Το Kit φορτώθηκε. Όργανα:`, kitData.labels);
            this.updateUILabels(kitData.labels);
        });

        this.engine.on('error', (err) => {
            console.error("❌ [AudioBridge] Σφάλμα εξωτερικής μηχανής:", err);
            if (typeof showToast === 'function') showToast("Σφάλμα μηχανής ήχου", "error");
        });
    }

    // ==========================================
    // 1. ΕΝΤΟΛΕΣ ΠΡΟΣ ΤΗΝ ΕΞΩΤΕΡΙΚΗ ΜΗΧΑΝΗ
    // ==========================================

    play() {
        console.log("▶️ [AudioBridge] Εντολή PLAY");
        if (this.engine) this.engine.play();
    }

    stop() {
        console.log("⏹️ [AudioBridge] Εντολή STOP");
        if (this.engine) this.engine.stop();
        this.clearGridHighlight();
    }

    setBpm(bpm) {
        console.log(`⏱️ [AudioBridge] Αλλαγή BPM σε: ${bpm}`);
        if (this.engine) this.engine.setBpm(bpm);
    }

    async loadKit(kitId) {
        console.log(`🗂️ [AudioBridge] Αίτημα φόρτωσης Kit: ${kitId}`);
        
        // 1. ΕΛΕΓΧΟΣ: Είναι Custom Kit από τον χρήστη;
        if (kitId && kitId.startsWith('custom_')) {
            if (typeof CustomKitDB === 'undefined') throw new Error("Η βάση CustomKitDB δεν βρέθηκε.");
            const customKit = await CustomKitDB.getKit(kitId);
            if (!customKit) throw new Error(`Το Custom Kit '${kitId}' δεν βρέθηκε.`);

            // Φτιάχνουμε το "εικονικό" manifest
            const manifest = { name: customKit.name, voices: {}, defaultVoiceSettings: {} };
            const audioUrls = {};
            
            for (const v of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
                if (customKit.voices[v]) {
                    // Μετατρέπουμε το Blob σε URL μνήμης για να το διαβάσει η μηχανή
                    audioUrls[v] = URL.createObjectURL(customKit.voices[v]);
                    manifest.voices[v] = customKit.name + '_' + v; // Απλά ένα label
                }
            }
            
            // Επειδή οι ήχοι είναι Blobs, τους περνάμε απευθείας στη μηχανή
            if (this.engine && typeof this.engine.loadCustomKit === 'function') {
                return this.engine.loadCustomKit(kitId, manifest, audioUrls);
            } else {
                console.warn("⚠️ Η εξωτερική μηχανή δεν υποστηρίζει loadCustomKit ακόμα.");
                return Promise.resolve();
            }
        }

        // 2. Διαφορετικά, είναι έτοιμο Kit (standard, eastern κλπ)
        if (this.engine) return this.engine.loadKit(kitId);
        return Promise.resolve();
    }

    // ==========================================
    // 2. Ο ΜΕΤΑΦΡΑΣΤΗΣ ΔΕΔΟΜΕΝΩΝ (Migration)
    // ==========================================

    loadPattern(mNotesData) {
        console.log("🔄 [AudioBridge] Αξιολόγηση και μετάφραση ρυθμού...");
        if (!mNotesData) return;

        // Νέο format (V1-V6) - Περνάει κατευθείαν χωρίς μετάφραση
        if (mNotesData.v1 || mNotesData.version === 2) {
            console.log("✅ [AudioBridge] Ανιχνεύτηκε νέο format (V1-V6). Προώθηση...");
            if (this.engine) this.engine.setPattern(mNotesData);
            return;
        }

        console.log("⚠️ [AudioBridge] Ανιχνεύτηκε παλιό mNotes format (Booleans). Εκκίνηση μετάφρασης σε 6-κάναλο...");

        // Αρχικοποίηση 6 καναλιών
        const universalPattern = { v1: [], v2: [], v3: [], v4: [], v5: [], v6: [] };

        // Χάρτης: Το KICK γίνεται V1, το TOM γίνεται V2 κ.ο.κ.
        const mapping = { KICK: 'v1', TOM: 'v2', RIM: 'v3', HAT: 'v4' };
        let maxSteps = 0;

        // Μετατροπή των παλιών δεδομένων
        for (const [oldKey, newKey] of Object.entries(mapping)) {
            if (mNotesData[oldKey] && Array.isArray(mNotesData[oldKey])) {
                if (mNotesData[oldKey].length > maxSteps) maxSteps = mNotesData[oldKey].length;

                mNotesData[oldKey].forEach((isActive, index) => {
                    universalPattern[newKey][index] = isActive
                        ? { on: true, velocity: 0.8, offset: 0, chance: 1.0 }
                        : { on: false };
                });
            }
        }

        // Αν ο ρυθμός ήταν εντελώς άδειος, βάζουμε 16 βήματα default
        if (maxSteps === 0) maxSteps = 16;

        // ΚΑΝΟΝΑΣ: Το Array πρέπει να είναι "Πυκνό" (Dense).
        // Γεμίζουμε με {on: false} όλα τα κενά steps και τα κανάλια V5, V6
        for (let i = 0; i < maxSteps; i++) {
            ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].forEach(v => {
                if (!universalPattern[v][i]) universalPattern[v][i] = { on: false };
            });
        }

        if (this.engine) this.engine.setPattern(universalPattern);
        console.log("✅ [AudioBridge] Η μετάφραση ολοκληρώθηκε. Στάλθηκε πυκνό 6-κάναλο pattern:", universalPattern);
    }

    // ==========================================
    // 3. UI BINDINGS (DOM Manipulation)
    // ==========================================

    updateGridHighlight(stepIndex) {
        document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
        document.querySelectorAll(`.cell[data-step="${stepIndex}"]`).forEach(c => c.classList.add('highlight'));
    }

    clearGridHighlight() {
        document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
    }

    updateUILabels(labels) {
        if (!labels) return;
        // Αλλάζει τα κείμενα δίπλα στα κουτάκια βάσει του Kit
        for (const [voiceId, labelText] of Object.entries(labels)) {
            const labelEl = document.getElementById(`label-${voiceId}`);
            if (labelEl) labelEl.innerText = labelText;
        }
    }
}

// Προσωρινό Global Instance για το mNotes
// Όταν έρθει η πραγματική μηχανή, απλά θα αλλάξουμε το 'null' στο instance της.
window.AudioBridge = new MNotesAudioBridge(null);
