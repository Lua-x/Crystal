import { Hono } from 'hono'

import type { AppEnv } from '../context.js'
import { enforceRateLimit } from '../middleware/rate-limit.js'
import type { Services } from '../services/index.js'

/**
 * `GET /api/calendar/<secret>.ics`: the private calendar feed. The secret in
 * the link is the only credential, as calendar apps cannot sign in.
 */
export function calendarRoutes(services: Services) {
  const router = new Hono<AppEnv>()

  router.get('/:file{[\\w-]+\\.ics}', (c) => {
    enforceRateLimit(services.limits.calendarFeeds, `ip:${c.get('clientIp') ?? 'unknown'}`)
    const token = c.req.param('file').replace(/\.ics$/, '')
    const body = services.calendar.render(token)
    if (body === null) return c.text('Not found', 404)
    c.header('Content-Type', 'text/calendar; charset=utf-8')
    c.header('Content-Disposition', 'inline; filename="crystal.ics"')
    c.header('Cache-Control', 'private, no-cache')
    return c.body(body)
  })

  return router
}
