// Service worker — its presence is what makes the Victoria assistant page
// installable ("Add to Home Screen"), and (since 2026-08-23) what lets
// Victoria push a real notification to the phone even when this app isn't
// open, e.g. for reminders. No offline caching strategy beyond passthrough;
// this isn't an offline-first app, just an installable shortcut + push
// receiver, same pattern as public/media-sw.js for the fetch/install parts.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

// Payload shape sent by app/api/admin/victoria-family/notify/route.ts:
// { title, body, url }. Falls back to generic text if a push ever arrives
// without a JSON body (shouldn't happen from our own server, but a push
// event with no/malformed data must never throw here).
self.addEventListener('push', (event) => {
  let data = { title: 'Victoria', body: 'You have a new message from Victoria.', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // Non-JSON payload -- keep the generic fallback above.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/victoria-avatar-192.png',
      badge: '/victoria-avatar-192.png',
      data: { url: data.url },
    })
  )
})

// Tapping the notification focuses an already-open tab on this app if one
// exists, otherwise opens a new one to the URL the push carried.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl.replace(self.location.origin, '')) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
