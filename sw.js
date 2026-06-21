/*
 * My Money — Service Worker
 * Fresh install. Cache: mm-v1 (no conflict with any previous repo)
 *
 * Strategy:
 *  • Shell files (index.html, manifest, icons) → cached at install
 *  • Navigation requests → network-first, shell fallback
 *  • Apps Script (/exec) → never cached, always live
 *  • Everything else → cache-first with background update
 */

var CACHE = 'mm-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png'
];

/* ---- Install: cache the shell atomically ---- */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

/* ---- Activate: remove old caches, claim clients ---- */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ---- Message: force-update from a new SW ---- */
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') { self.skipWaiting(); }
});

/* ---- Fetch ---- */
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(_) { return; }

  /* Never intercept Apps Script — always hit the network */
  if (url.hostname.indexOf('script.google') !== -1 ||
      url.hostname.indexOf('googleapis.com') !== -1 ||
      url.hostname.indexOf('accounts.google') !== -1) {
    return;
  }

  /* CDN assets (Chart.js etc.) — cache-first, best-effort cache on miss */
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(req).then(function(hit) {
        return hit || fetch(req).then(function(res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function(c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* Navigation (the shell page itself) — network-first so updates arrive,
     fall back to cached shell so the app works offline */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function(res) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
          return res;
        })
        .catch(function() {
          return caches.match(req)
              || caches.match('./index.html')
              || caches.match('./');
        })
    );
    return;
  }

  /* Everything else on this origin — cache-first */
  e.respondWith(
    caches.match(req).then(function(hit) {
      return hit || fetch(req).then(function(res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
