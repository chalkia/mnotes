// =========================================
// BASIC METRONOME (Για την Free/Live έκδοση)
// =========================================
const BasicMetronome = {
    isPlaying: false,
    bpm: 100,
    timerID: null,
    nextNoteTime: 0,
    currentBeat: 0,
    audioCtx: null,

    toggle: function() {
        // Δημιουργία Audio Context με το πρώτο κλικ (για να μην το μπλοκάρει ο browser)
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.isPlaying) {
            // Σταμάτημα
            clearTimeout(this.timerID);
            this.isPlaying = false;
            document.getElementById('btnPlayRhythm').innerHTML = '<i class="fas fa-play"></i>';
        } else {
            // Ξεκίνημα
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.nextNoteTime = this.audioCtx.currentTime + 0.05;
            this.currentBeat = 0; // Ξεκινάμε πάντα από τον χρόνο "1"
            this.isPlaying = true;
            document.getElementById('btnPlayRhythm').innerHTML = '<i class="fas fa-stop"></i>';
            this.schedule();
        }
    },

    schedule: function() {
        const secondsPerBeat = 60.0 / this.bpm;
        
        // Προγραμματίζουμε τους ήχους που πέφτουν μέσα στα επόμενα 100ms
        while (this.nextNoteTime < this.audioCtx.currentTime + 0.1) {
            // Το πρώτο χτύπημα (currentBeat === 0) είναι ο τονισμός (Accent)
            this.playClick(this.nextNoteTime, this.currentBeat === 0);
            this.nextNoteTime += secondsPerBeat;
            this.currentBeat = (this.currentBeat + 1) % 4; // Ρυθμός 4/4
        }
        // Επανάληψη της λούπας ελέγχου κάθε 25ms
        this.timerID = setTimeout(() => this.schedule(), 25);
    },

    playClick: function(time, isAccent) {
        // Συνθεσάιζερ Ήχου: Παράγουμε ένα ηλεκτρονικό "Τικ"
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        // Συχνότητα: 1000Hz (ψιλό) για το πρώτο χτύπημα, 800Hz (πιο μπάσο) για τα υπόλοιπα
        osc.frequency.value = isAccent ? 1000 : 800;
        osc.type = 'sine';
        
        // Το κάνουμε κοφτό (percussive envelope)
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05); 
        
        osc.start(time);
        osc.stop(time + 0.05);
    },

    setBpm: function(val) {
        this.bpm = parseInt(val);
        const disp = document.getElementById('dispBpm');
        if(disp) disp.innerText = this.bpm;
    }
};
