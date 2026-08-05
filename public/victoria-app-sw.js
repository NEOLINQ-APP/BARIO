// Minimal service worker — its presence is what makes the Victoria assistant
// page installable ("Add to Home Screen"). No offline caching strategy
// beyond passthrough; this isn't an offline-first app, just an installable
// shortcut, same pattern as public/media-sw.js.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
