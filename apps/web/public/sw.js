/*
 * Crystal's service worker: shows Web Push notifications and opens the right
 * page when one is clicked. It does not cache anything.
 */

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
      icon: '/favicon.svg',
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
