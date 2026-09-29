import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { requireAuthState, type AppEnv } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import { CLIENT_ID_PATTERN } from '../services/events.js'
import type { Services } from '../services/index.js'

/** Often enough for proxies that close idle connections after a minute. */
const HEARTBEAT_MS = 25_000

/**
 * `GET /api/v1/events`: a Server-Sent Events stream that says which lists
 * changed, so open apps reload them. `?client=` names the browser tab, which
 * then does not hear about its own changes. The stream ends when the session
 * does; browsers reconnect on their own.
 */
export function eventRoutes(services: Services, heartbeatMs = HEARTBEAT_MS) {
  const router = new Hono<AppEnv>()
  router.use('*', requireAuth)

  router.get('/', (c) => {
    const auth = requireAuthState(c)
    const { user } = auth
    // The stream ends when the session is signed out or the token revoked.
    const stillValid = () =>
      auth.kind === 'session'
        ? services.sessions.isActive(auth.session.id)
        : services.apiTokens.isActive(auth.token.id)
    const client = c.req.query('client')
    // Tells nginx not to buffer the stream.
    c.header('X-Accel-Buffering', 'no')

    return streamSSE(c, async (stream) => {
      let open = true
      let wake: (() => void) | undefined
      const stop = () => {
        open = false
        wake?.()
      }
      const unsubscribe = services.events.subscribe({
        userId: user.id,
        client: client && CLIENT_ID_PATTERN.test(client) ? client : undefined,
        send: (event) => void stream.writeSSE({ event: event.type, data: JSON.stringify(event) }),
        close: stop,
      })
      stream.onAbort(stop)

      try {
        await stream.writeSSE({ event: 'ready', data: '{}', retry: 3000 })
        while (open) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, heartbeatMs)
            wake = () => {
              clearTimeout(timer)
              resolve()
            }
          })
          if (!open || !stillValid()) break
          await stream.write(': keep-alive\n\n')
        }
      } finally {
        unsubscribe()
      }
    })
  })

  return router
}
