/* ===========================================================
   GUITAR CHORDS GENERATOR (SVG) - v1.2 (Standalone Module)
   =========================================================== */

const GuitarChordsUI = {
    db: typeof CHORD_DICTIONARY !== 'undefined' ? CHORD_DICTIONARY : {},
    currentVoicings: {}, 

    toggleVisibility: function(isVisible) {
        const group = document.getElementById('guitarChordsGroup');
        const sep = document.getElementById('guitarChordsSep');
        
        if (group) group.style.display = isVisible ? 'block' : 'none';
        if (sep) sep.style.display = isVisible ? 'block' : 'none';
        
        console.log(`[GuitarChordsUI] Visibility toggled: ${isVisible}`);
        if (isVisible) this.scanAndRender(); 
    },

    scanAndRender: function() {
        console.log("[GuitarChordsUI] Σάρωση τραγουδιού για συγχορδίες...");
        const isEnabled = document.getElementById('setShowChords')?.checked;
        if (!isEnabled) {
            console.log("[GuitarChordsUI] Ακύρωση σάρωσης. Το εργαλείο είναι απενεργοποιημένο στις ρυθμίσεις.");
            return;
        }

        const chordElements = document.querySelectorAll('#view-player .chord');
        let uniqueChords = new Set();
        chordElements.forEach(el => {
            let c = el.innerText.trim();
            if (c) uniqueChords.add(c);
        });

        const container = document.getElementById('chord-charts-container');
        if (!container) {
            console.error("[GuitarChordsUI] Σφάλμα: Δεν βρέθηκε το container #chord-charts-container στο DOM!");
            return;
        }
        
        container.innerHTML = '';

        if (uniqueChords.size === 0) {
            console.log("[GuitarChordsUI] Δεν βρέθηκαν συγχορδίες στο κείμενο.");
            const emptyMsg = typeof t === 'function' ? t('msg_no_chords') : "No chords found...";
            container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
            return;
        }

        uniqueChords.forEach(chordName => {
            const voicings = this.db[chordName];
            
            if (!voicings) {
                console.warn(`[GuitarChordsUI] Προσοχή: Η συγχορδία '${chordName}' δεν υπάρχει στο λεξικό (data.js).`);
                return; 
            }
            
            if (this.currentVoicings[chordName] === undefined) {
                this.currentVoicings[chordName] = 0;
            }

            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; flex-direction:column; align-items:center; background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; border:1px solid var(--border-color);";
            
            const header = document.createElement('div');
            header.style.cssText = "display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:5px;";
            
            header.innerHTML = `
                <button onclick="GuitarChordsUI.changeVoicing('${chordName}', -1)" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-chevron-left"></i></button>
                <strong style="color:var(--accent); font-size:1.1rem;">${chordName}</strong>
                <button onclick="GuitarChordsUI.changeVoicing('${chordName}', 1)" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-chevron-right"></i></button>
            `;

            const svg = this.drawSVG(voicings[this.currentVoicings[chordName]]);
            
            wrapper.appendChild(header);
            wrapper.appendChild(svg);
            container.appendChild(wrapper);
        });
        
        console.log(`[GuitarChordsUI] Η σχεδίαση ολοκληρώθηκε. Βρέθηκαν ${uniqueChords.size} μοναδικές συγχορδίες.`);
    },

    changeVoicing: function(chordName, dir) {
        if (!this.db[chordName]) return;
        const total = this.db[chordName].length;
        let current = this.currentVoicings[chordName] + dir;
        if (current < 0) current = total - 1;
        if (current >= total) current = 0;
        
        this.currentVoicings[chordName] = current;
        console.log(`[GuitarChordsUI] Αλλαγή voicing για την ${chordName} (Επιλογή: ${current + 1}/${total})`);
        this.scanAndRender(); 
    },

    drawSVG: function(voicing) {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "70");
        svg.setAttribute("height", "85");
        svg.setAttribute("viewBox", "0 0 70 85");

        const strokeColor = "#888"; 
        const dotColor = "#bb86fc"; 

        for (let i = 0; i <= 4; i++) {
            const line = document.createElementNS(svgNS, "line");
            let y = 20 + (i * 15);
            line.setAttribute("x1", "10"); line.setAttribute("y1", y);
            line.setAttribute("x2", "60"); line.setAttribute("y2", y);
            line.setAttribute("stroke", strokeColor);
            line.setAttribute("stroke-width", i === 0 && voicing.base === 1 ? "3" : "1"); 
            svg.appendChild(line);
        }

        for (let i = 0; i <= 5; i++) {
            const line = document.createElementNS(svgNS, "line");
            let x = 10 + (i * 10);
            line.setAttribute("x1", x); line.setAttribute("y1", "20");
            line.setAttribute("x2", x); line.setAttribute("y2", "80");
            line.setAttribute("stroke", strokeColor);
            line.setAttribute("stroke-width", "1");
            svg.appendChild(line);
        }

        if (voicing.base > 1) {
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", "0"); text.setAttribute("y", "32");
            text.setAttribute("fill", strokeColor); text.setAttribute("font-size", "10");
            text.textContent = voicing.base + "fr";
            svg.appendChild(text);
        }

        voicing.frets.forEach((fret, stringIdx) => {
            let x = 10 + (stringIdx * 10);
            if (fret === -1) {
                const text = document.createElementNS(svgNS, "text");
                text.setAttribute("x", x - 3); text.setAttribute("y", "12");
                text.setAttribute("fill", "#cf6679"); text.setAttribute("font-size", "10");
                text.textContent = "X";
                svg.appendChild(text);
            } else if (fret === 0) {
                const circle = document.createElementNS(svgNS, "circle");
                circle.setAttribute("cx", x); circle.setAttribute("cy", "10");
                circle.setAttribute("r", "3");
                circle.setAttribute("fill", "none");
                circle.setAttribute("stroke", strokeColor);
                svg.appendChild(circle);
            } else {
                const relativeFret = fret - voicing.base + 1;
                if (relativeFret >= 1 && relativeFret <= 4) {
                    let y = 20 + ((relativeFret - 1) * 15) + 7.5;
                    const circle = document.createElementNS(svgNS, "circle");
                    circle.setAttribute("cx", x); circle.setAttribute("cy", y);
                    circle.setAttribute("r", "4");
                    circle.setAttribute("fill", dotColor);
                    svg.appendChild(circle);
                }
            }
        });

        return svg;
    }
};
