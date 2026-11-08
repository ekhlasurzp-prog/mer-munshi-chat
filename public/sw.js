/* MER Munshi Chat service worker: opens the app offline, and shows message notifications
   (no message text is sent through push). */
const CACHE = 'mmc-shell-v2'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  // Save the intro video so it also plays offline
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/splash.mp4')).catch(() => {}))
})
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// Only this site's own files are cached. Data from Supabase is never cached here.
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/logo.png' || url.pathname === '/splash.mp4') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      }))
    )
  }
})

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) {}
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // The app is open and visible: it already updates live, so no notification is needed
    if (wins.some((w) => w.visibilityState === 'visible')) return
    await self.registration.showNotification(d.title || 'Songjog', {
      body: d.body || 'You have a new message',
      icon: d.icon || '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: '/#/chat' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.length) { await wins[0].focus(); return }
    await self.clients.openWindow('/#/chat')
  })())
})
