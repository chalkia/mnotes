/* ===========================================================
   FLOATING TOOLS & ATTACHMENTS v1.0
   =========================================================== */

const FloatingTools = {
    isOpen: false,
    isMinimized: false,
    
    // Δημιουργία του Floating Container
    init: function() {
        if (document.getElementById('floating-viewer')) return;

        const viewer = document.createElement('div');
        viewer.id = 'floating-viewer';
        viewer.className = 'floating-window';
        viewer.style.display = 'none';
        
        viewer.innerHTML = `
            <div class="fw-header" id="fw-header">
                <span class="fw-title"><i class="fas fa-file-pdf"></i> Score Viewer</span>
                <div class="fw-controls">
                    <button onclick="FloatingTools.toggleMinimize()"><i class="fas fa-minus"></i></button>
                    <button onclick="FloatingTools.close()"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="fw-body" id="fw-body">
                <div id="fw-content-placeholder" style="padding:20px; text-align:center; color:#666;">
                    <i class="fas fa-cloud-upload-alt fa-2x"></i>
                    <p>No attachment loaded</p>
                </div>
            </div>
            <div class="fw-resizer" id="fw-resizer"></div>
        `;

        document.body.appendChild(viewer);
        this.makeDraggable(viewer);
        this.makeResizable(viewer);
    },

    // Λειτουργία Drag (Σύρσιμο από το header)
    makeDraggable: function(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = document.getElementById('fw-header');
        
        header.onmousedown = dragMouseDown;
        header.ontouchstart = dragMouseDown; // Support για tablet

        function dragMouseDown(e) {
            e = e || window.event;
            // Αποφυγή drag αν πατάμε κουμπιά
            if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') return;
            
            pos3 = e.clientX || e.touches[0].clientX;
            pos4 = e.clientY || e.touches[0].clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            let clientX = e.clientX || e.touches[0].clientX;
            let clientY = e.clientY || e.touches[0].clientY;
            
            pos1 = pos3 - clientX;
            pos2 = pos4 - clientY;
            pos3 = clientX;
            pos4 = clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
            FloatingTools.saveLayout(); 
        }
    },

    // Λειτουργία Resize (Αυξομείωση από τη γωνία)
    makeResizable: function(el) {
        const resizer = document.getElementById('fw-resizer');
        resizer.addEventListener('mousedown', initResize, false);
        resizer.addEventListener('touchstart', initResize, false);

        function initResize(e) {
            window.addEventListener('mousemove', Resize, false);
            window.addEventListener('mouseup', stopResize, false);
            window.addEventListener('touchmove', Resize, false);
            window.addEventListener('touchend', stopResize, false);
        }
        function Resize(e) {
            let clientX = e.clientX || e.touches[0].clientX;
            let clientY = e.clientY || e.touches[0].clientY;
            el.style.width = (clientX - el.offsetLeft) + 'px';
            el.style.height = (clientY - el.offsetTop) + 'px';
        }
        function stopResize(e) {
            window.removeEventListener('mousemove', Resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            FloatingTools.saveLayout();
        }
    },

    toggleMinimize: function() {
        const body = document.getElementById('fw-body');
        const viewer = document.getElementById('floating-viewer');
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            body.style.display = 'none';
            viewer.style.height = 'auto';
            viewer.style.width = '200px';
        } else {
            body.style.display = 'block';
            viewer.style.height = '300px';
            viewer.style.width = '400px';
        }
    },

    show: function(contentHtml) {
        this.init();
        const viewer = document.getElementById('floating-viewer');
        const body = document.getElementById('fw-body');
        if (contentHtml) body.innerHTML = contentHtml;
        viewer.style.display = 'flex';
        this.isOpen = true;
    },

    close: function() {
        const viewer = document.getElementById('floating-viewer');
        if (viewer) viewer.style.display = 'none';
        this.isOpen = false;
    }
};
// Αποθήκευση θέσης και μεγέθους
saveLayout: function() {
    const el = document.getElementById('floating-viewer');
    if (!el) return;

    const layout = {
        top: el.style.top,
        left: el.style.left,
        width: el.style.width,
        height: el.style.height,
        isMinimized: this.isMinimized
    };
    localStorage.setItem('mnotes_viewer_layout', JSON.stringify(layout));
},

// Επαναφορά θέσης και μεγέθους
applySavedLayout: function() {
    const saved = localStorage.getItem('mnotes_viewer_layout');
    if (!saved) return;

    const layout = JSON.parse(saved);
    const el = document.getElementById('floating-viewer');
    
    if (el) {
        el.style.top = layout.top;
        el.style.left = layout.left;
        el.style.width = layout.width;
        el.style.height = layout.height;
        if (layout.isMinimized) this.toggleMinimize();
    }
}
async function autoLoadAttachment(songId) {
    // 1. Κλείνουμε το προηγούμενο αν υπάρχει
    FloatingTools.close();

    // 2. Ζητάμε από τη γέφυρα της Supabase αν υπάρχει αρχείο
    const attachment = await getSongAttachment(songId);

    if (attachment && attachment.file_url) {
        // 3. Εμφάνιση περιεχομένου
        FloatingTools.loadContent(attachment.file_url, attachment.file_type);
        
        // 4. Εφαρμογή της αποθηκευμένης θέσης (x, y, w, h)
        FloatingTools.applySavedLayout();
    }
}
