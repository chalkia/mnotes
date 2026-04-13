/* ===========================================================
   CHROMATIC TUNER MODULE - mNotes Pro
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

    // ✨ Λεξικό Ορίων Συχνοτήτων ανά Όργανο (Φίλτρο Αρμονικών)
    currentInstrument: 'chromatic',
    RANGES: {
        'chromatic': { min: 30, max: 4000 },
        'guitar': { min: 70, max: 1200 },    // E2 (~82Hz) - Υψηλές αρμονικές
        'bass': { min: 30, max: 500 },       // E1 (~41Hz) - G4 (~392Hz)
        'bouzouki': { min: 120, max: 1500 }, // C3 (~130Hz) - D6
        'lyra': { min: 180, max: 1500 },     // G3 (~196Hz) και πάνω
        'violin': { min: 180, max: 3500 },   // G3 (~196Hz) - E7
        'mandolin': { min: 180, max: 1500 }, // G3 (~196Hz) και πάνω
        'oud': { min: 50, max: 800 }         // C2 (~65Hz) - C5
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
            // ✨ Smoothing: Κυλιόμενος Μέσος Όρος (Sliding Window)
            this.freqBuffer.push(rawFreq);
            if (this.freqBuffer.length > this.bufferSize) {
                this.freqBuffer.shift(); // Πετάμε την παλαιότερη μέτρηση
            }

            // Υπολογισμός μέσου όρου
            let sum = 0;
            for (let i = 0; i < this.freqBuffer.length; i++) {
                sum += this.freqBuffer[i];
            }
            const activeFreq = sum / this.freqBuffer.length;

            const n = 12 * Math.log2(activeFreq / this.refFreq) + 69;
            const midi = Math.round(n);
            
            // ✨ Υπολογισμός Νότας ΚΑΙ Οκτάβας
            const noteIndex = ((midi % 12) + 12) % 12;
            const octave = Math.floor(midi / 12) - 1; // Ο υπολογισμός για C4 = Middle C
            const noteName = `${this.NOTES[noteIndex]}${octave}`; // Εμφάνιση π.χ. E2, G4, A4

            const expected = this.refFreq * Math.pow(2, (midi - 69) / 12);
            const cents = 1200 * Math.log2(activeFreq / expected);
            
            this.updateUI(noteName, activeFreq, cents);
        } else {
            // Απόλυτη ησυχία -> Αδειάζουμε το "καλάθι" του μέσου όρου
            this.freqBuffer = [];
        }

        this.rafId = requestAnimationFrame(this.detect.bind(this));
    },

    updateUI: function(note, hz, cents) {
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

        let bestOffset = -1, maxCorr = 0;
        
        // ✨ Φίλτρο Αρμονικών βάσει επιλεγμένου Οργάνου
        const range = this.RANGES[this.currentInstrument];
        const minOffset = Math.floor(sampleRate / range.max); 
        const maxOffset = Math.floor(sampleRate / range.min); 

        // Ψάχνει συχνότητες ΜΟΝΟ μέσα στα όρια που του έχουμε θέσει
        for (let offset = minOffset; offset < maxOffset; offset++) {
            let corr = 0;
            for (let i = 0; i < buffer.length - offset; i++) {
                corr += buffer[i] * buffer[i + offset];
            }
            if (corr > maxCorr) { 
                maxCorr = corr; 
                bestOffset = offset; 
            }
        }
        return bestOffset !== -1 ? sampleRate / bestOffset : -1;
    }
};
