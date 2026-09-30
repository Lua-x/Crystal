/*
 * Crystal's service worker:
 * - keeps the app itself (HTML, scripts, styles, icons) available offline,
 * - shows Web Push notifications and opens the right page when one is clicked.
 * Data never comes from here: the API is always asked directly, and the app
 * keeps its own copy of lists and tasks for offline use.
 */

const APP_CACHE_PREFIX = 'crystal-app-'
const META_CACHE = 'crystal-meta'
const VERSIONS_KEY = '/versions'
/** Files outside the build output that the app shell needs. */
const PUBLIC_FILES = [
  '/',
  '/theme-init.js',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
]

async function readVersions() {
  const response = await (await caches.open(META_CACHE)).match(VERSIONS_KEY)
  return response ? response.json() : []
}

async function writeVersions(versions) {
  await (await caches.open(META_CACHE)).put(VERSIONS_KEY, Response.json(versions))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // The build writes precache.json; without it (development) nothing is cached.
      const response = await fetch('/precache.json', { cache: 'no-store' }).catch(() => null)
      if (response && response.ok) {
        const { version, files } = await response.json()
        const cache = await caches.open(APP_CACHE_PREFIX + version)
        await cache.addAll([...PUBLIC_FILES, ...files])
        const versions = (await readVersions()).filter((known) => known !== version)
        await writeVersions([...versions, version])
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous version too: pages opened before the update may still load its files.
      const keep = new Set((await readVersions()).slice(-2).map((v) => APP_CACHE_PREFIX + v))
      for (const name of await caches.keys()) {
        if (name.startsWith(APP_CACHE_PREFIX) && !keep.has(name)) await caches.delete(name)
      }
      await writeVersions([...keep].map((name) => name.slice(APP_CACHE_PREFIX.length)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    // Fresh when online; the cached app when offline (every route is the same page).
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/')) || Response.error()),
    )
    return
  }
  event.respondWith((async () => (await caches.match(request)) || fetch(request))())
})

/** The message the server sent: `{ title, body, path, tag }`. */
function readMessage(data) {
  if (!data) return {}
  try {
    return data.json()
  } catch {
    return { body: data.text() }
  }
}

self.addEventListener('push', (event) => {
  const message = readMessage(event.data)
  const path = typeof message.path === 'string' && message.path.startsWith('/') ? message.path : '/'
  event.waitUntil(
    self.registration.showNotification(message.title || 'Crystal', {
      body: message.body || '',
      tag: message.tag,
      renotify: Boolean(message.tag),
      icon: '/icons/icon-192.png',
      data: { path },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.path || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        // The app navigates itself, without a reload.
        open.postMessage({ type: 'crystal:navigate', path })
        await open.focus()
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})

// The browser replaced the subscription (e.g. it expired): tell the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription?.options
  if (!options) return
  event.waitUntil(
    (async () => {
      const subscription =
        event.newSubscription ?? (await self.registration.pushManager.subscribe(options))
      const { endpoint, keys } = subscription.toJSON()
      await fetch('/api/v1/notifications/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, keys }),
      })
    })(),
  )
})
