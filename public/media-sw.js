// Minimal service worker — its presence is what makes the Media Library
// page installable ("Add to Home Screen") on Chrome/Android and desktop.
// No offline caching strategy beyond passthrough; this isn't an offline-first
// app, just an installable shortcut to the upload page.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
