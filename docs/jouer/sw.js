// DefiMemory : fonctionne hors ligne et se met à jour tout seul.
// Stratégie : la page du jeu et online.js sont toujours demandés au réseau d'abord (dernière version
// dès qu'il y a Internet), avec la copie en cache si on est hors ligne. Les autres fichiers
// (polices, icônes) viennent du cache et sont rafraîchis en arrière-plan.
const CACHE = 'defimemory-v5';
const FILES = [
  './', 'index.html', 'online.js', 'manifest.webmanifest',
  'vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-database-compat.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'fonts/bricolage-grotesque-latin-600-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'fonts/nunito-sans-latin-400-normal.woff2', 'fonts/nunito-sans-latin-600-normal.woff2', 'fonts/nunito-sans-latin-700-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(cache => fetch(e.request, { cache: 'no-store' })
      .then(res => { if (res.ok) cache.put('index.html', res.clone()); return res; })
      .catch(async () => (await cache.match('index.html')) || cache.match('./'))));
    return;
  }
  // Code du jeu en ligne : réseau d'abord aussi, pour rester de la même version que la page
  if (/\/online\.js$/.test(new URL(e.request.url).pathname)) {
    e.respondWith(caches.open(CACHE).then(cache => fetch(e.request, { cache: 'no-store' })
      .then(res => { if (res.ok) cache.put('online.js', res.clone()); return res; })
      .catch(() => cache.match('online.js'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
