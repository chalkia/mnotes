/* ===========================================================
   CHROMATIC & INSTRUMENT TUNER MODULE - mNotes Pro
   =========================================================== */

window.ChromaticTuner = {
    isRunning: false,
    audioCtx: null,
    analyser: null,
    micStream: null,
    rafId: null,
    refFreq: 440,
    
    // ✨ Κυλιόμενος Μέσος Όρος (Smoothing)
    freqBuffer: [],    
    bufferSize: 5,     

    // ✨ Λεξικό Ορίων & Στόχων Συχνοτήτων ανά Όργανο (Μαγνητικό Κλείδωμα)
    currentInstrument: 'chromatic',
    RANGES: {
        'chromatic': { min: 30, max: 4000 },
        // E2, A2, D3, G3, B3, E4
        'guitar': { min: 70, max: 1200, targets: [40, 45, 50, 55, 59, 64] }, 
        // E1, A1, D2, G2
        'bass': { min: 30, max: 500, targets: [28, 33, 38, 43] },
        // C3, F3, A3, D4
        'bouzouki': { min: 120, max: 1500, targets: [48, 53, 57, 62] }, 
        // G3, D4, A4 (Κρητική Λύρα)
        'lyra': { min: 180, max: 1500, targets: [55, 62, 69] },
        // G3, D4, A4, E5
        'violin': { min: 180, max: 3500, targets: [55, 62, 69, 76] },
        // G3, D4, A4, E5
        'mandolin': { min: 180, max: 1500, targets: [55, 62, 69, 76] },
        // C2, F2, A2, D3, G3, C4
        'oud': { min: 50, max: 800, targets: [36, 41, 45, 50, 55, 60] }
    },

    NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // UI Elements Cache
    elNote: null, 
    elHz: null, 
    elBar: null, 
    elStatus: null, 
    elBtn: null,

    initUI: function() {
        this.elNote = document.getElementById('tunerNote');
        this.elHz = document.getElementById('tunerHz');
        this.elBar = document.getElementById('tunerIndicator');
        this.elStatus = document.getElementById('tunerStatus');
        this.elBtn = document.getElementById('btnToggleTuner');
    },

    setInstrument: function(inst) {
        if (this.RANGES[inst]) {
            this.currentInstrument = inst;
            console.log(`[Tuner] Όργανο: ${inst} | Όρια: ${this.RANGES[inst].min}Hz - ${this.RANGES[inst].max}Hz`);
        }
    },

    toggle: async function() {
        if (!this.elNote) this.initUI();
        this.isRunning ? this.stop() : await this.start();
    },

    start: async function() {
        try {
            // Φόρτωση του A4 από τις γενικές ρυθμίσεις του mNotes
            const settings = JSON.parse(localStorage.getItem('mnotes_settings') || "{}");
            this.refFreq = parseInt(settings.refFreq) || 440;
            
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048; 
            source.connect(this.analyser);
            
            this.isRunning = true;
            this.freqBuffer = []; // Καθαρισμός ιστορικού
            
            this.elBtn.innerHTML = `<i class="fas fa-stop"></i>`;
            this.elBtn.style.color = "var(--danger)";
            this.elBtn.style.borderColor = "var(--danger)";
            this.elStatus.innerText = "Ακούω...";
            
            console.log(`[Tuner] Started with A4 = ${this.refFreq}Hz`);
            this.detect();
        } catch (e) { 
            console.error("Tuner Mic Error:", e);
            if (typeof showToast === 'function') showToast("Δεν δόθηκε άδεια για το μικρόφωνο.", "error");
        }
    },

    stop: function() {
        this.isRunning = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this.audioCtx) this.audioCtx.close();
        if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
        
        this.freqBuffer = []; // Καθαρισμός ιστορικού
        
        this.elBtn.innerHTML = `<i class="fas fa-power-off"></i>`;
        this.elBtn.style.color = "var(--accent)";
        this.elBtn.style.borderColor = "var(--accent)";
        this.elNote.innerText = "-";
        this.elNote.style.color = "var(--text-muted)";
        this.elHz.innerText = "0.0 Hz";
        this.elHz.style.color = "var(--text-muted)";
        this.elBar.style.width = "0%";
        this.elStatus.innerText = "Ανενεργό";
        this.elStatus.style.color = "var(--text-muted)";
    },

    detect: function() {
        if (!this.isRunning) return;
        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);
        const rawFreq = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

        if (rawFreq !== -1) {
            // ✨ Smoothing: Κυλιόμενος Μέσος Όρος 
            this.freqBuffer.push(rawFreq);
            if (this.freqBuffer.length > this.bufferSize) {
                this.freqBuffer.shift(); 
            }

            let sum = 0;
            for (let i = 0; i < this.freqBuffer.length; i++) {
                sum += this.freqBuffer[i];
            }
            const activeFreq = sum / this.freqBuffer.length;

            const n = 12 * Math.log2(activeFreq / this.refFreq) + 69;
            let targetMidi = Math.round(n);
            let isOutOfRange = false;

            // ✨ ΕΞΥΠΝΟ ΚΛΕΙΔΩΜΑ ΣΤΙΣ ΑΝΟΙΧΤΕΣ ΧΟΡΔΕΣ
            const rangeParams = this.RANGES[this.currentInstrument];
            if (rangeParams.targets) {
                let closestString = rangeParams.targets[0];
                let minDiff = Math.abs(n - closestString);
                
                // Εύρεση της πιο κοντινής επιτρεπτής χορδής
                for (let i = 1; i < rangeParams.targets.length; i++) {
                    let diff = Math.abs(n - rangeParams.targets[i]);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestString = rangeParams.targets[i];
                    }
                }
                
                // Αν απέχει >2.5 ημιτόνια, η νότα είναι "Εκτός Κλίμακας"
                if (minDiff > 2.5) {
                    isOutOfRange = true;
                } else {
                    targetMidi = closestString; 
                }
            }

            if (isOutOfRange) {
                this.updateUI("-", activeFreq, 0, true);
            } else {
                const noteIndex = ((targetMidi % 12) + 12) % 12;
                const octave = Math.floor(targetMidi / 12) - 1;
                const noteName = `${this.NOTES[noteIndex]}${octave}`;

                // Υπολογισμός απόκλισης βάσει του ΣΤΟΧΟΥ (χορδής)
                const expected = this.refFreq * Math.pow(2, (targetMidi - 69) / 12);
                const cents = 1200 * Math.log2(activeFreq / expected);
                
                this.updateUI(noteName, activeFreq, cents, false);
            }
        } else {
            // Ησυχία -> Αδειάζουμε το "καλάθι" για να μην επηρεάσει την επόμενη χορδή
            this.freqBuffer = [];
        }

        this.rafId = requestAnimationFrame(this.detect.bind(this));
    },

    updateUI: function(note, hz, cents, outOfRange) {
        // ✨ Ένδειξη Εκτός Κλίμακας (Γκριζάρισμα)
        if (outOfRange) {
            this.elNote.innerText = "-";
            this.elHz.innerText = hz.toFixed(1) + " Hz";
            this.elBar.style.width = "50%";
            this.elBar.style.backgroundColor = "var(--text-muted)";
            this.elNote.style.color = "var(--text-muted)";
            this.elHz.style.color = "var(--text-muted)";
            this.elStatus.innerText = "Εκτός Κλίμακας";
            this.elStatus.style.color = "var(--text-muted)";
            return; 
        }

        this.elNote.innerText = note;
        this.elHz.innerText = hz.toFixed(1) + " Hz";
        
        // Bar Width: Left (Flat) to Right (Sharp) | 50% = Perfect
        const fill = Math.max(0, Math.min(100, cents + 50));
        this.elBar.style.width = fill + "%";

        const absCents = Math.abs(cents);
        if (absCents <= 3) {
            this.elBar.style.backgroundColor = "var(--tuner-perfect)";
            this.elNote.style.color = "var(--tuner-perfect)";
            this.elHz.style.color = "var(--tuner-perfect)";
            this.elStatus.innerText = "Τέλεια!";
            this.elStatus.style.color = "var(--tuner-perfect)";
        } else if (absCents <= 15) {
            this.elBar.style.backgroundColor = "var(--tuner-warning)";
            this.elNote.style.color = "var(--text-main)";
            this.elHz.style.color = "var(--text-main)";
            this.elStatus.innerText = cents < 0 ? "Χαμηλή (Σφίξε)" : "Υψηλή (Χαλάρωσε)";
            this.elStatus.style.color = "var(--tuner-warning)";
        } else {
            this.elBar.style.backgroundColor = "var(--tuner-danger)";
            this.elNote.style.color = "var(--tuner-danger)";
            this.elHz.style.color = "var(--tuner-danger)";
            this.elStatus.innerText = cents < 0 ? "Πολύ Χαμηλή" : "Πολύ Υψηλή";
            this.elStatus.style.color = "var(--tuner-danger)";
        }
    },

    autoCorrelate: function(buffer, sampleRate) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        if (Math.sqrt(sum / buffer.length) < 0.01) return -1; // Σιωπή

        const range = this.RANGES[this.currentInstrument];
        const minOffset = Math.floor(sampleRate / range.max); 
        const maxOffset = Math.floor(sampleRate / range.min); 

        let c = new Array(maxOffset + 1).fill(0);
        let maxCorr = 0;

        // 1. Υπολογισμός ενέργειας (Συσχέτιση)
        for (let i = minOffset; i < maxOffset; i++) {
            let corr = 0;
            for (let j = 0; j < buffer.length - i; j++) {
                corr += buffer[j] * buffer[j + i];
            }
            c[i] = corr;
            if (corr > maxCorr) maxCorr = corr;
        }

        // ✨ ΛΥΣΗ ΓΙΑ ΤΟ ΚΑΝΤΙΝΙ: Ψάχνουμε την ΠΡΩΤΗ ισχυρή κορυφή 
        // Ξεκινάμε από τα μικρά offsets (υψηλές συχνότητες) για να αποφύγουμε την ηχώ του ηχείου.
        let bestOffset = -1;
        let threshold = maxCorr * 0.85; 

        for (let i = minOffset + 1; i < maxOffset - 1; i++) {
            if (c[i] > threshold && c[i] > c[i-1] && c[i] > c[i+1]) {
                bestOffset = i;
                break; // Κλειδώσαμε τη χορδή!
            }
        }

        if (bestOffset === -1) {
            for (let i = minOffset; i < maxOffset; i++) {
                if (c[i] === maxCorr) {
                    bestOffset = i;
                    break;
                }
            }
        }

        // ✨ ΠΑΡΑΒΟΛΙΚΗ ΠΑΡΕΜΒΟΛΗ: Ακρίβεια δεκαδικών στο μικρόφωνο
        let x1 = c[bestOffset - 1] || 0;
        let x2 = c[bestOffset];
        let x3 = c[bestOffset + 1] || 0;
        
        let a = (x1 + x3 - 2 * x2) / 2;
        let b = (x3 - x1) / 2;
        
        let trueOffset = bestOffset;
        if (a < 0) { 
            trueOffset = bestOffset - (b / (2 * a));
        }

        return sampleRate / trueOffset;
    }
};
