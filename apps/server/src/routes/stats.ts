import { statsSchema } from '@crystal/shared'
import { createRoute } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import { authErrors, createRouter, jsonResponse, sessionOrToken } from './openapi.js'

export function statsRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['Statistics'],
      security: sessionOrToken,
      summary: 'Completed tasks per week, streaks and what is open',
      description:
        'Completions count for the person who completed the task, by day in their time zone.',
      responses: { 200: jsonResponse(statsSchema, 'Statistics'), ...authErrors },
    }),
    (c) => c.json(services.stats.forUser(requireAuthState(c).user), 200),
  )

  return router
}
