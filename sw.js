const CACHE_NAME = 'mnotes-ver11.0'; // Αλλάζουμε έκδοση για να κάνει update
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'manifest.json',
    'icon-192.png',
    
    // JS Files
    'js/config.js',           // <-- ΝΕΟ (Απαραίτητο)
    'js/data.js',
    'js/storage.js',
    'js/logic.js',
    'js/ui.js',
    'js/audio.js',            // <-- ΝΕΟ (Audio Player)
    'js/supabase-client.js',  // <-- ΝΕΟ (Login/Upload)
    'js/app.js',
    'js/qrcodegen.js',
    'js/html5-qrcode.min.js',
    'js/sortable.min.js',

    // FontAwesome (Χωρίς την κάθετο μπροστά για να παίζει στο GitHub)
    'fa/css/all.min.css',
    'fa/webfonts/fa-solid-900.woff2',
    'fa/webfonts/fa-regular-400.woff2', // <-- Εδώ έλειπε το κόμμα πριν!

    // Fonts
    'fonts/RobotoCondensed-Regular.ttf',
    'fonts/RobotoCondensed-Bold.ttf',
    'fonts/RobotoCondensed-Light.ttf'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Ενεργοποίηση αμέσως
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching files...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Αγνοούμε αιτήματα προς Supabase/Google από την Cache για να μην κολλάνε τα logins
    if (event.request.url.includes('supabase.co') || event.request.url.includes('google')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// Activate Event (Καθαρισμός παλιάς Cache)
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
            return self.clients.claim();
        })
    );
});
