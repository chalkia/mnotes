const CACHE_NAME = 'mnotes-ver0.27.0'; // Ανέβασα την έκδοση για να πάρει την αλλαγή
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'manifest.json',
    'icon-192.png',
    
    // JS Files
    'js/config.js',
    'js/data.js',
    'js/storage.js',
    'js/logic.js',
    'js/ui.js',
    'js/bandManager.js', 
    'js/audio.js',
    'js/supabase.min.js',
    'js/supabase-client.js',
    'js/app.js',
    'js/floating-tools.js',
    'js/sortable.min.js',
    'js/sequencer.js',
    'js/translations.js',
    'js/chords.js',
    'js/asset-manager.js', // <-- ΠΡΟΣΤΕΘΗΚΕ!
    
    
    // FontAwesome
    'fa/css/all.min.css',
    'fa/webfonts/fa-solid-900.woff2',
    'fa/webfonts/fa-regular-400.woff2',

    // Fonts
    'fonts/RobotoCondensed-Regular.ttf',
    'fonts/RobotoCondensed-Bold.ttf',
    'fonts/RobotoCondensed-Light.ttf'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 [SW] Caching all assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(err => {
                console.error('❌ [SW] Σφάλμα κατά το Caching των αρχείων. Δες αν λείπει κάποιο αρχείο από τη λίστα:', err);
            })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Αγνοούμε αιτήματα προς τα APIs της Supabase και της Google από την Cache
    if (event.request.url.includes('supabase.co') || event.request.url.includes('google')) {
        return; 
    }

    event.respondWith(
        // ✨ ΤΟ ΜΥΣΤΙΚΟ: Το ignoreSearch: true κάνει match το 'js/logic.js' ακόμα και αν το ζητήσουμε ως 'js/logic.js?v=25.0'
        caches.match(event.request, { ignoreSearch: true })
            .then((response) => {
                // Αν βρέθηκε στην Cache, το επιστρέφει αμέσως
                if (response) {
                    return response;
                }
                // Αλλιώς προσπαθεί να το φέρει από το δίκτυο
                return fetch(event.request).catch(err => {
                    console.error('🔌 [SW] Offline: Αποτυχία φόρτωσης για το:', event.request.url, err);
                });
            })
    );
});

// Activate Event (Καθαρισμός παλιάς Cache)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('🧹 [SW] Διαγραφή παλιάς Cache:', key);
                    return caches.delete(key);
                }
            }));
        })
        .then(() => {
            console.log('🚀 [SW] Ο Service Worker είναι πλέον ενεργός!');
            return self.clients.claim();
        })
    );
});
