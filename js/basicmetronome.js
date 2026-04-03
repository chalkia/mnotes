// =========================================
// BASIC METRONOME (Για την Free/Live έκδοση) 
// Σταθερά τέταρτα με ρυθμιζόμενη συχνότητα
// =========================================
const BasicMetronome = {
    isPlaying: false,
    bpm: 100,
    pitch: 800, // Προεπιλεγμένη συχνότητα (σε Hz)
    timerID: null,
    nextNoteTime: 0,
    audioCtx: null,

    toggle: function() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.isPlaying) {
            // Σταμάτημα
            clearTimeout(this.timerID);
            this.isPlaying = false;
            document.getElementById('btnPlayRhythm').innerHTML = '<i class="fas fa-play"></i>';
            console.log("⏹️ [BasicMetronome] Σταμάτησε.");
        } else {
            // Ξεκίνημα
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.nextNoteTime = this.audioCtx.currentTime + 0.05;
            this.isPlaying = true;
            document.getElementById('btnPlayRhythm').innerHTML = '<i class="fas fa-stop"></i>';
            console.log(`▶️ [BasicMetronome] Ξεκίνησε στα ${this.bpm} BPM με συχνότητα ${this.pitch}Hz.`);
            this.schedule();
        }
    },

    schedule: function() {
        const secondsPerBeat = 60.0 / this.bpm;
        
        // Προγραμματίζουμε τα χτυπήματα
        while (this.nextNoteTime < this.audioCtx.currentTime + 0.1) {
            this.playClick(this.nextNoteTime);
            this.nextNoteTime += secondsPerBeat;
        }
        this.timerID = setTimeout(() => this.schedule(), 25);
    },

    playClick: function(time) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        // Όλα τα χτυπήματα παίρνουν τη συχνότητα που έχει επιλέξει ο χρήστης
        osc.frequency.value = this.pitch;
        osc.type = 'sine'; // Ήχος καθαρού ημιτόνου
        
        // Envelope για κοφτό percussive ήχο
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05); 
        
        osc.start(time);
        osc.stop(time + 0.05);
    },

    setBpm: function(val) {
        this.bpm = parseInt(val);
        const disp = document.getElementById('dispBpm');
        if(disp) disp.innerText = this.bpm;
        console.log(`⏱️ [BasicMetronome] Αλλαγή BPM: ${this.bpm}`);
    },

    setPitch: function(val) {
        this.pitch = parseInt(val);
        console.log(`🎚️ [BasicMetronome] Αλλαγή Συχνότητας (Pitch): ${this.pitch}Hz`);
    }
};
