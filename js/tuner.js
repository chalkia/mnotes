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

    // UI Elements Cache
    elNote: null, elHz: null, elBar: null, elStatus: null, elRef: null, elBtn: null,

    initUI: function() {
        this.elNote = document.getElementById('tunerNote');
        this.elHz = document.getElementById('tunerHz');
        this.elBar = document.getElementById('tunerIndicator');
        this.elStatus = document.getElementById('tunerStatus');
        this.elRef = document.getElementById('tunerRefValue');
        this.elBtn = document.getElementById('btnToggleTuner');
    },

    changeRefFreq: function(delta) {
        this.refFreq = Math.max(415, Math.min(465, this.refFreq + delta));
        if (this.elRef) this.elRef.innerText = this.refFreq;
    },

    toggle: async function() {
        if (!this.elNote) this.initUI();
        this.isRunning ? this.stop() : await this.start();
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
            this.elBtn.style.color = "var(--danger)";
            this.elBtn.style.borderColor = "var(--danger)";
            this.detect();
        } catch (e) { console.error(e); }
    },

    stop: function() {
        this.isRunning = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this.audioCtx) this.audioCtx.close();
        if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
        this.elBtn.innerHTML = `<i class="fas fa-power-off"></i>`;
        this.elBtn.style.color = "var(--accent)";
        this.elBtn.style.borderColor = "var(--accent)";
        this.elNote.innerText = "-";
        this.elHz.innerText = "0.0 Hz";
        this.elBar.style.width = "0%";
        this.elStatus.innerText = "Ανενεργό";
        this.elStatus.style.color = "var(--text-muted)";
    },

    detect: function() {
        if (!this.isRunning) return;
        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);
        const freq = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

        if (freq !== -1) {
            const n = 12 * Math.log2(freq / this.refFreq) + 69;
            const midi = Math.round(n);
            const note = this.NOTES[((midi % 12) + 12) % 12];
            const expected = this.refFreq * Math.pow(2, (midi - 69) / 12);
            const cents = 1200 * Math.log2(freq / expected);
            this.updateUI(note, freq, cents);
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
        if (Math.sqrt(sum / buffer.length) < 0.01) return -1;

        let bestOffset = -1, maxCorr = 0;
        for (let offset = Math.floor(sampleRate/2000); offset < Math.floor(sampleRate/40); offset++) {
            let corr = 0;
            for (let i = 0; i < buffer.length - offset; i++) corr += buffer[i] * buffer[i + offset];
            if (corr > maxCorr) { maxCorr = corr; bestOffset = offset; }
        }
        return bestOffset !== -1 ? sampleRate / bestOffset : -1;
    }
};
