/**
 * sw.js — Service Worker Mhono wa Hazi
 * Cache-first pour les assets statiques, network-first pour l'API
 */

const CACHE_NAME = 'mhono-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/firebase-config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Installation — mise en cache des assets statiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — stratégie hybride
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API Vercel → toujours réseau (pas de cache)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ success: false, error: 'Hors ligne. Vérifiez votre connexion.' }),
        { headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }

  // Firebase / CDN externes → réseau avec fallback cache
  if (!url.origin.includes(self.location.origin)) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets statiques → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
