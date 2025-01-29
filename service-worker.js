const CACHE_NAME = 'plant-tracker-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/icon-192x192.png',
    '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-plants') {
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'sync-plants' }));
            })
        );
    }
});

self.addEventListener('push', (event) => {
    const options = {
        body: event.data.text(),
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png'
    };
    
    event.waitUntil(
        self.registration.showNotification('Plant Tracker', options)
    );
});