/* =========================================
   STORAGE & IO
   ========================================= */

function saveToLocal() { 
    localStorage.setItem('mnotes_data', JSON.stringify(library)); 
}

function importJSON(el) { 
    var r = new FileReader(); 
    r.onload = e => { 
        try { 
            var raw = e.target.result;
            var d = JSON.parse(raw); 
            if(Array.isArray(d)) sanitizeAndLoad(d, false);
            else sanitizeAndLoad([d], true);
        } catch(er) { alert("Error reading file."); } 
    }; 
    r.readAsText(el.files[0]); 
}

function sanitizeAndLoad(data, append) {
    var cleanData = data.map(song => ensureSongStructure(song));
    if(append) {
        cleanData.forEach(s => library.push(s));
        currentSongId = cleanData[cleanData.length - 1].id;
    } else {
        library = cleanData;
        if(library.length > 0) currentSongId = library[0].id;
    }
    finalizeImport();
}

function finalizeImport() { 
    saveToLocal(); 
    updatePlaylistDropdown(); 
    filterPlaylist(); 
    closeQR(); 
    setTimeout(() => toViewer(), 100); 
    alert("Επιτυχία!"); 
}

function exportJSON() { 
    var b = new Blob([JSON.stringify(library, null, 2)], {type:'application/json'}); 
    var a = document.createElement('a'); 
    a.href = URL.createObjectURL(b); 
    a.download = 'mnotes_library.mnote'; 
    a.click(); 
}

// QR Logic
function startQR() {
    document.getElementById('qrModal').style.display = "flex";
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
    
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
        (decodedText) => {
            try {
                var data = JSON.parse(decodedText);
                if(Array.isArray(data)) sanitizeAndLoad(data, false);
                else sanitizeAndLoad([data], true);
            } catch(e) { console.log("QR Not JSON"); }
        }
    ).catch(err => console.error(err));
}

function closeQR() { 
    if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => { html5QrcodeScanner.clear(); document.getElementById('qrModal').style.display = "none"; }); 
    else document.getElementById('qrModal').style.display = "none"; 
}
