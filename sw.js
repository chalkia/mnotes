const CACHE_NAME = 'mnotes-ver2.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './icon-192.png',
    
    // JS Files
    './js/data.js',
    './js/logic.js',
    './js/ui.js',
    './js/qrcodegen.js',
    './js/html5-qrcode.min.js',
    './js/sortable.min.js',  // Τοπικό αρχείο

    // FontAwesome
    './fa/css/all.min.css',
    
    // Fonts (Προσοχή: Βεβαιώσου ότι υπάρχουν αυτά τα αρχεία)
    './fonts/RobotoCondensed-Regular.ttf',
    './fonts/RobotoCondensed-Bold.ttf',
    './fonts/RobotoCondensed-Light.ttf'
];

// Install Event: Cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Fetch Event: Serve from Cache, fall back to Network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

