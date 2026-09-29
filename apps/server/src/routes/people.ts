import { personSchema } from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import { authErrors, createRouter, jsonResponse } from './openapi.js'

export function peopleRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['Sharing'],
      security: [{ session: [] }],
      summary: 'Other people on this instance',
      description: 'Active accounts, for sharing lists. Email addresses are not included.',
      responses: { 200: jsonResponse(z.array(personSchema), 'People'), ...authErrors },
    }),
    (c) => c.json(services.users.people(requireAuthState(c).user.id), 200),
  )

  return router
}
