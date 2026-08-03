// Minimal service worker — its presence (plus dialer-manifest.json) is what
// makes Bario Dialer a genuinely installable app rather than just a
// bookmarked page. Same pattern as public/media-sw.js. No offline caching
// strategy — this isn't an offline-first app, calling obviously needs a
// live connection regardless.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
