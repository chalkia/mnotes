/* ===========================================================
   FLOATING TOOLS & ATTACHMENTS v1.2 (Final Polished)
   =========================================================== */

const FloatingTools = {
    isOpen: false,
    isMinimized: false,
    
    // 1. Δημιουργία του Floating Container
    init: function() {
        if (document.getElementById('floating-viewer')) return;

        const viewer = document.createElement('div');
        viewer.id = 'floating-viewer';
        viewer.className = 'floating-window';
        viewer.style.cssText = 'position:fixed; top:15%; left:10%; width:450px; height:550px; background:var(--bg-panel); border:1px solid var(--accent); border-radius:8px; z-index:99999; display:none; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5); overflow:hidden; resize:both; min-width:250px; min-height:200px;';
        
        viewer.innerHTML = `
            <div class="fw-header" id="fw-header" style="background:#111; padding:10px; cursor:move; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--accent);">
                <span class="fw-title" style="color:var(--text-main); font-weight:bold; font-size:0.9rem;"><i class="fas fa-file-pdf"></i> Score Viewer</span>
                <div class="fw-controls">
                    <button onclick="FloatingTools.toggleMinimize()" style="background:none; border:none; color:#fff; cursor:pointer; margin-right:15px;"><i class="fas fa-minus"></i></button>
                    <button onclick="FloatingTools.close()" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="fw-body" id="fw-body" style="flex:1; background:#fff; overflow:hidden;">
                <div id="fw-content-placeholder" style="padding:20px; text-align:center; color:#666;">
                    <i class="fas fa-cloud-upload-alt fa-2x"></i>
                    <p>No attachment loaded</p>
                </div>
            </div>
            <div class="fw-resizer" id="fw-resizer" style="position:absolute; bottom:0; right:0; width:15px; height:15px; cursor:se-resize;"></div>
        `;

        document.body.appendChild(viewer);
        this.makeDraggable(viewer);
        this.makeResizable(viewer);
    },

    // 2. Λειτουργία Drag (Σύρσιμο)
    makeDraggable: function(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = document.getElementById('fw-header');
        
        header.onmousedown = dragMouseDown;
        header.ontouchstart = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') return;
            
            pos3 = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            pos4 = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault(); // Αποτρέπει το scrolling από πίσω στα κινητά
            let clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            let clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            
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

    // 3. Λειτουργία Resize (Αυξομείωση)
    makeResizable: function(el) {
        const resizer = document.getElementById('fw-resizer');
        resizer.addEventListener('mousedown', initResize, false);
        resizer.addEventListener('touchstart', initResize, {passive: false});

        function initResize(e) {
            e.preventDefault();
            window.addEventListener('mousemove', Resize, false);
            window.addEventListener('mouseup', stopResize, false);
            window.addEventListener('touchmove', Resize, {passive: false});
            window.addEventListener('touchend', stopResize, false);
        }
        function Resize(e) {
            let clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            let clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            el.style.width = (clientX - el.offsetLeft) + 'px';
            el.style.height = (clientY - el.offsetTop) + 'px';
        }
        function stopResize(e) {
            window.removeEventListener('mousemove', Resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            window.removeEventListener('touchmove', Resize, false);
            window.removeEventListener('touchend', stopResize, false);
            FloatingTools.saveLayout();
        }
    },

    // 4. Ελαχιστοποίηση
    toggleMinimize: function() {
        const body = document.getElementById('fw-body');
        const viewer = document.getElementById('floating-viewer');
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            body.style.display = 'none';
            viewer.style.height = 'auto';
            viewer.style.width = '250px';
        } else {
            body.style.display = 'block';
            this.applySavedLayout(); // Επαναφέρει το παλιό μέγεθος!
        }
        this.saveLayout();
    },

    // 5. Διαχείριση Περιεχομένου & Εμφάνιση
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
        const body = document.getElementById('fw-body');
        if (viewer) viewer.style.display = 'none';
        if (body) body.innerHTML = ''; // Αδειάζει τη μνήμη
        this.isOpen = false;
    },


    loadContent: function(url, type) {
        let html = '';
        const cleanType = type ? type.toLowerCase() : 'pdf';
        
        // ✨ Η ΔΙΟΡΘΩΣΗ: .includes() αντί για === (για να πιάνει το 'application/pdf')
        if (cleanType.includes('pdf')) {
            html = `<iframe src="${url}#toolbar=0" style="width:100%; height:100%; border:none;"></iframe>`;
        } else if (cleanType.includes('image') || ['jpg', 'jpeg', 'png', 'webp'].some(t => cleanType.includes(t))) {
            html = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#111;"><img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain;"></div>`;
        } else {
            html = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
        }
        this.show(html);
        
        if (typeof this.applySavedLayout === 'function') this.applySavedLayout();
    },

    // 6. Μνήμη Layout (LocalStorage)
    saveLayout: function() {
        const el = document.getElementById('floating-viewer');
        if (!el || el.style.display === 'none') return;

        // Σώζουμε το μέγεθος ΜΟΝΟ αν δεν είναι ελαχιστοποιημένο
        let layoutToSave = {
            top: el.style.top,
            left: el.style.left,
            isMinimized: this.isMinimized
        };

        if (!this.isMinimized) {
            layoutToSave.width = el.style.width;
            layoutToSave.height = el.style.height;
        } else {
            // Αν είναι ελαχιστοποιημένο, κρατάμε το παλιό του μέγεθος από τη μνήμη
            const old = JSON.parse(localStorage.getItem('mnotes_viewer_layout') || "{}");
            layoutToSave.width = old.width || '450px';
            layoutToSave.height = old.height || '550px';
        }

        localStorage.setItem('mnotes_viewer_layout', JSON.stringify(layoutToSave));
    },

    applySavedLayout: function() {
        const saved = localStorage.getItem('mnotes_viewer_layout');
        if (!saved) return;

        const layout = JSON.parse(saved);
        const el = document.getElementById('floating-viewer');
        
        if (el) {
            if(layout.top) el.style.top = layout.top;
            if(layout.left) el.style.left = layout.left;
            
            if (!this.isMinimized) {
                if(layout.width) el.style.width = layout.width;
                if(layout.height) el.style.height = layout.height;
            }
        }
    }
};

// 7. Γέφυρα Αυτόματης Φόρτωσης (Αν χρειαστεί στο μέλλον)
async function autoLoadAttachment(songId) {
    FloatingTools.close();
    if (typeof getSongAttachment !== 'function') return;

    const attachment = await getSongAttachment(songId);
    if (attachment && attachment.file_url) {
        FloatingTools.loadContent(attachment.file_url, attachment.file_type);
    }
}
