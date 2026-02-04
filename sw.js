const CACHE_NAME = 'mnotes-ver10.0'; 
const ASSETS_TO_CACHE = [
    'index.html',
    'style.css',
    'manifest.json',
    'icon-192.png',
    
    // JS Files (Χωρίς ./ για ασφάλεια)
    'js/data.js',
    'js/storage.js',
    'js/logic.js',
    'js/ui.js',
    'js/app.js', // Προστέθηκε γιατί είναι απαραίτητο
    'js/qrcodegen.js',
    'js/html5-qrcode.min.js',
    'js/sortable.min.js',

    // FontAwesome
    'fa/css/all.min.css',
    
    // Κατάλογος "fa/" 
  '/fa/css/all.min.css',
  '/fa/webfonts/fa-solid-900.woff2',
  '/fa/webfonts/fa-regular-400.woff2'
    
    // Fonts
    'fonts/RobotoCondensed-Regular.ttf',
    'fonts/RobotoCondensed-Bold.ttf',
    'fonts/RobotoCondensed-Light.ttf'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
    // ΣΗΜΑΝΤΙΚΟ: Αναγκάζει τον νέο SW να ενεργοποιηθεί αμέσως χωρίς αναμονή
    self.skipWaiting(); 
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('Removing old cache:', key);
                    return caches.delete(key);
                }
            }));
        })
        .then(() => {
            // ΣΗΜΑΝΤΙΚΟ: Τώρα είναι μέσα στο .then() και εκτελείται σωστά
            return self.clients.claim();
        })
    );
});





