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
    NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // UI Elements
    elNote: null,
    elCents: null,
    elBar: null,
    elStatus: null,
    elRef: null,
    elBtn: null,

    initUI: function() {
        this.elNote = document.getElementById('tunerNote');
        this.elCents = document.getElementById('tunerCents');
        this.elBar = document.getElementById('tunerIndicator');
        this.elStatus = document.getElementById('tunerStatus');
        this.elRef = document.getElementById('tunerRefValue');
        this.elBtn = document.getElementById('btnToggleTuner');
    },

    changeRefFreq: function(delta) {
        let newFreq = this.refFreq + delta;
        if (newFreq >= 415 && newFreq <= 465) {
            this.refFreq = newFreq;
            if (!this.elRef) this.initUI();
            this.elRef.innerText = this.refFreq;
        }
    },

    toggle: async function() {
        if (!this.elNote) this.initUI();

        if (this.isRunning) {
            this.stop();
        } else {
            await this.start();
        }
    },

    start: async function() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);

            this.isRunning = true;
            this.elBtn.innerHTML = `<i class="fas fa-stop"></i>`;
            this.elBtn.style.color = "#ff4757";
            this.elBtn.style.borderColor = "#ff4757";
            this.elStatus.innerText = (typeof t === 'function') ? t('tuner_listening') : "Ακούω...";

            this.detectPitch();
        } catch (err) {
            console.error("Tuner Mic Error:", err);
            if (typeof showToast === 'function') showToast("Δεν δόθηκε άδεια για το μικρόφωνο.", "error");
        }
    },

      stop: function() {
           this.isRunning = false;
           if (this.rafId) cancelAnimationFrame(this.rafId);
           if (this.audioCtx) this.audioCtx.close();
           if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
   
           this.elBtn.innerHTML = `<i class="fas fa-power-off"></i>`;
           this.elBtn.style.color = "var(--accent)";
           this.elBtn.style.borderColor = "var(--accent)";
           this.elStatus.innerText = (typeof t === 'function') ? t('tuner_off') : "Ανενεργό";
           this.elNote.innerText = "-";
           this.elNote.style.color = "var(--text-muted)";
           this.elCents.innerText = "0¢";
           
           // Μηδενισμός Μπάρας
           this.elBar.style.width = "0%";
           this.elBar.style.backgroundColor = "#888";
       },

    detectPitch: function() {
        if (!this.isRunning) return;

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);
        
        const frequency = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

        if (frequency !== -1) {
            // ✨ Εδώ είναι η διόρθωση: Χρησιμοποιεί το this.refFreq αντί για καρφωτό 440!
            const n = 12 * Math.log2(frequency / this.refFreq) + 69;
            const midiNumber = Math.round(n);
            const noteIndex = ((midiNumber % 12) + 12) % 12;
            const expectedFreq = this.refFreq * Math.pow(2, (midiNumber - 69) / 12);
            let cents = Math.round(1200 * Math.log2(frequency / expectedFreq));
            
            this.updateDisplay(this.NOTES[noteIndex], cents);
        }

        this.rafId = requestAnimationFrame(this.detectPitch.bind(this));
    },

    updateDisplay: function(note, cents) {
        // Όρια για το UI (-50 έως +50)
        let displayCents = Math.max(-50, Math.min(50, cents));
        
        this.elNote.innerText = note;
        this.elCents.innerText = (displayCents > 0 ? "+" : "") + displayCents + "¢";

        // Υπολογισμός ποσοστού γεμίσματος (0% έως 100%)
        // -50 cents = 0% | 0 cents = 50% | +50 cents = 100%
        let fillPercent = displayCents + 50; 
        this.elBar.style.width = `${fillPercent}%`; 

        // Χρώματα εναρμονισμένα με το θέμα
        const absCents = Math.abs(displayCents);

        if (absCents <= 3) {
            // 🎯 ΤΕΛΕΙΑ: Χρώμα θέματος (Πράσινο/Accent)
            this.elBar.style.backgroundColor = "var(--accent)"; 
            this.elStatus.innerText = (typeof t === 'function') ? t('tuner_perfect') : "Τέλεια!";
            this.elNote.style.color = "var(--accent)";
            this.elStatus.style.color = "var(--accent)";
        } 
        else if (absCents <= 15) {
            // ⚠️ ΚΟΝΤΑ: Πορτοκαλί προειδοποίηση
            this.elBar.style.backgroundColor = "#ffb74d"; 
            this.elStatus.innerText = displayCents < 0 ? ((typeof t === 'function') ? t('tuner_flat') : "Χαμηλό (Σφίξε)") : ((typeof t === 'function') ? t('tuner_sharp') : "Ψηλό (Χαλάρωσε)");
            this.elNote.style.color = "var(--text-main)";
            this.elStatus.style.color = "#ffb74d";
        } 
        else {
            // ❌ ΦΑΛΤΣΟ: Χρώμα κινδύνου (Κόκκινο/Danger)
            this.elBar.style.backgroundColor = "var(--danger)"; 
            this.elStatus.innerText = displayCents < 0 ? ((typeof t === 'function') ? t('tuner_flat') : "Πολύ Χαμηλό") : ((typeof t === 'function') ? t('tuner_sharp') : "Πολύ Ψηλό");
            this.elNote.style.color = "var(--danger)";
            this.elStatus.style.color = "var(--danger)";
        }
    },

    autoCorrelate: function(buffer, sampleRate) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        if (rms < 0.01) return -1; // Σιωπή

        let bestOffset = -1;
        let maxCorrelation = 0;
        const minOffset = Math.floor(sampleRate / 2000); // Max 2000Hz
        const maxOffset = Math.floor(sampleRate / 40);   // Min 40Hz (Πιάνει και το μπάσο)

        for (let offset = minOffset; offset < maxOffset; offset++) {
            let correlation = 0;
            for (let i = 0; i < buffer.length - offset; i++) {
                correlation += buffer[i] * buffer[i + offset];
            }
            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestOffset = offset;
            }
        }
        return bestOffset !== -1 ? sampleRate / bestOffset : -1;
    }
};
