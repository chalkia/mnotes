/* =========================================
   AUDIO ENGINE v3 (BoomBoom Precision)
   ========================================= */

const AudioEngine = {
    ctx: null,
    isPlaying: false,
    timerID: null,
    nextNoteTime: 0.0,
    currentStep: 0,
    scheduleAheadTime: 0.1, // sec
    lookahead: 25.0, // ms
    
    // Grid Data
    beats: 4,
    stepsPerBeat: 4,
    grid: new Array(64).fill(0),
    bpm: 100,

    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    togglePlay: function() {
        this.init();
        this.isPlaying = !this.isPlaying;
        
        const btn = document.getElementById('btnPlayRhythm');
        if (this.isPlaying) {
            this.currentStep = 0;
            this.nextNoteTime = this.ctx.currentTime + 0.05;
            this.scheduler();
            if(btn) btn.innerHTML = '<i class="fas fa-stop"></i>';
        } else {
            window.clearTimeout(this.timerID);
            if(btn) btn.innerHTML = '<i class="fas fa-play"></i>';
            // Clear highlights
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
        }
    },

    scheduler: function() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentStep, this.nextNoteTime);
            this.nextStep();
        }
        this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    },

    nextStep: function() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        
        this.currentStep++;
        const totalSteps = this.beats * this.stepsPerBeat;
        if (this.currentStep >= totalSteps) {
            this.currentStep = 0;
        }
    },

    scheduleNote: function(stepNumber, time) {
        // Visual Highlight (Queued)
        const drawTime = (time - this.ctx.currentTime) * 1000;
        setTimeout(() => {
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
            // Highlight current step column
            // (Assuming grid is rendered row-by-row, simple implementation logic here for columns)
            // Εδώ απλοποιούμε: Δεν φωτίζουμε όλη τη στήλη, απλά τα ενεργά κουτιά
            const activeCells = document.querySelectorAll(`.cell:nth-child(${stepNumber + 1})`); 
            // Επειδή είναι CSS Grid, το nth-child είναι πολύπλοκο. 
            // Αφήνουμε το highlight για μελλοντική βελτίωση ή απλό blink.
        }, drawTime > 0 ? drawTime : 0);

        // Sound Logic
        // Έχουμε 3 γραμμές (instruments) στο Grid: 0=Bass, 1=Snare(Chord), 2=HiHat(Alt)
        // Το gridData είναι μονοδιάστατο στο boomboom, αλλά εδώ έχουμε 3 rows στο UI.
        // Πρέπει να διαβάσουμε το Grid από το DOM ή από εσωτερική δομή.
        // Για συμβατότητα με το boomboom.html που έχει 1 γραμμή με 3 τιμές, 
        // ας προσαρμόσουμε τη λογική μας:
        
        // Στο mNotes έχουμε 3 ανεξάρτητες γραμμές. Θα παίξουμε ό,τι είναι ενεργό.
        const container = document.getElementById('rhythm-grid');
        if(!container) return;
        
        // Βρίσκουμε τα παιδιά (cells)
        const cells = Array.from(container.children);
        const totalSteps = this.beats * 4;
        
        // Row 0: Bass (Kick) -> cells[stepNumber]
        if (cells[stepNumber] && cells[stepNumber].classList.contains('active')) {
            this.playTone(time, 1); // Bass
        }
        
        // Row 1: Snare/Chord -> cells[totalSteps + stepNumber]
        if (cells[totalSteps + stepNumber] && cells[totalSteps + stepNumber].classList.contains('active')) {
            this.playTone(time, 2); // Chord
        }

        // Row 2: HiHat/Alt -> cells[(totalSteps*2) + stepNumber]
        if (cells[(totalSteps*2) + stepNumber] && cells[(totalSteps*2) + stepNumber].classList.contains('active')) {
            this.playTone(time, 3); // Alt
        }
    },

    playTone: function(time, type) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        
        if (type === 1) { // BASS (Sawtooth)
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(110, time);
            filter.frequency.setValueAtTime(1500, time);
            filter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.8, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
            osc.start(time); osc.stop(time + 0.5);
        } 
        else if (type === 3) { // ALT (HiHat/Perc)
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(82, time);
            filter.frequency.setValueAtTime(1500, time);
            filter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.6, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            osc.start(time); osc.stop(time + 0.3);
        } 
        else if (type === 2) { // CHORD (Strum)
            [196, 246, 329].forEach((f, i) => {
                const sOsc = this.ctx.createOscillator();
                const sGain = this.ctx.createGain();
                sOsc.type = 'triangle'; 
                sOsc.frequency.value = f;
                sOsc.connect(sGain); sGain.connect(this.ctx.destination);
                
                let t = time + (i*0.015); // Strum effect
                sGain.gain.setValueAtTime(0, t);
                sGain.gain.linearRampToValueAtTime(0.3, t+0.01);
                sGain.gain.exponentialRampToValueAtTime(0.001, t+0.2);
                sOsc.start(t); sOsc.stop(t+0.25);
            });
        }
    },

    setBpm: function(val) {
        this.bpm = val;
    }
};

// Global hooks
function togglePlay() { AudioEngine.togglePlay(); }
function updateBpm(val) { AudioEngine.setBpm(val); document.getElementById('dispBpm').innerText = val; }
