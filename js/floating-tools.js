/* ===========================================================
   FLOATING TOOLS & ATTACHMENTS v1.1 (Final Corrected)
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
            FloatingTools.saveLayout(); // ✨ Αποθήκευση θέσης
        }
    },

    // 3. Λειτουργία Resize (Αυξομείωση)
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
            let clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            let clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            el.style.width = (clientX - el.offsetLeft) + 'px';
            el.style.height = (clientY - el.offsetTop) + 'px';
        }
        function stopResize(e) {
            window.removeEventListener('mousemove', Resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            FloatingTools.saveLayout(); // ✨ Αποθήκευση μεγέθους
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
            viewer.style.width = '200px';
        } else {
            body.style.display = 'block';
            viewer.style.height = '300px';
            viewer.style.width = '400px';
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
        if (viewer) viewer.style.display = 'none';
        this.isOpen = false;
    },

    loadContent: function(url, type) {
        let html = '';
        const cleanType = type.toLowerCase();
        
        if (cleanType === 'pdf') {
            html = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
        } else if (['jpg', 'jpeg', 'png', 'webp'].includes(cleanType)) {
            html = `<div style="padding:5px;"><img src="${url}" style="width:100%; height:auto;"></div>`;
        }
        this.show(html);
    },

    handleFileUpload: async function(file) {
        if (!typeof uploadFileToStorage === 'function') return;
        try {
            showToast("Ανέβασμα παρτιτούρας... ⏳");
            const result = await uploadFileToStorage(file, 'attachments', currentSongId);
            if (result) {
                await linkAttachmentToSong(currentSongId, result.url, result.type);
                showToast("Η παρτιτούρα αποθηκεύτηκε! 🎼");
                this.loadContent(result.url, result.type);
            }
        } catch (err) {
            console.error(err);
            showToast("Αποτυχία ανεβάσματος.", "error");
        }
    },

    // 6. Μνήμη Layout (LocalStorage)
    saveLayout: function() {
        const el = document.getElementById('floating-viewer');
        if (!el || el.style.display === 'none') return;

        const layout = {
            top: el.style.top,
            left: el.style.left,
            width: el.style.width,
            height: el.style.height,
            isMinimized: this.isMinimized
        };
        localStorage.setItem('mnotes_viewer_layout', JSON.stringify(layout));
    },

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
            // Αν ήταν ελαχιστοποιημένο, το επαναφέρουμε στην κατάσταση αυτή
            if (layout.isMinimized && !this.isMinimized) this.toggleMinimize();
        }
    }
};

// 7. Γέφυρα Αυτόματης Φόρτωσης (Global Function)
async function autoLoadAttachment(songId) {
    FloatingTools.close();
    if (typeof getSongAttachment !== 'function') return;

    const attachment = await getSongAttachment(songId);
    if (attachment && attachment.file_url) {
        FloatingTools.loadContent(attachment.file_url, attachment.file_type);
        FloatingTools.applySavedLayout();
    }
}
