// TINFT — service worker (app di prova installabile)
// HTML = network-first (così gli aggiornamenti del deploy si vedono SEMPRE);
// asset statici = cache-first (veloci e offline).
const CACHE = 'tinft-v5';
const CORE = [
  './', './index.html', './app.html', './support.js', './tinft-api.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png',
  './assets/ev-vol4.png', './assets/ev-live.png', './assets/ev-jazz.png',
  './assets/mesh.jpg', './assets/tinft-logo.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Mai intercettare le chiamate al backend (API reale, token rotanti): vanno sempre in rete.
  let sameOrigin = true;
  try { sameOrigin = new URL(e.request.url).origin === self.location.origin; } catch (err) {}
  if (!sameOrigin) return;

  const isHTML = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // network-first: prendi sempre l'ultima versione online, cache come fallback offline
    e.respondWith(
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./app.html')))
    );
    return;
  }

  // asset statici: cache-first
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match('./app.html'))
    )
  );
});
