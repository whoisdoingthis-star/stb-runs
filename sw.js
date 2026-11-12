// Keeps the app itself on the phone so it opens with no signal.
// Bump VERSION whenever any file changes, so phones pick up the new copy.
const VERSION = 'stb-runs-v56';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/geo.js', 'js/parser.js', 'js/sequence.js', 'js/village.js', 'js/rows.js', 'js/splash.js', 'js/assistant.js', 'js/shifts.js', 'js/stan.js', 'js/stanvoice.js', 'js/stanvoice-worker.js',
  'vendor/supabase.mjs', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon-512-maskable.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // database calls go straight to the network
  // Network first so updates arrive quickly; fall back to the saved copy offline.
  // "no-cache" makes the phone check with the server every time instead of
  // reusing its own 10-minute copy, so a new version shows up on the next open.
  const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(fresh.then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
