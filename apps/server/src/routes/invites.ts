import { invitePreviewSchema } from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { enforceRateLimit } from '../middleware/rate-limit.js'
import type { Services } from '../services/index.js'
import { commonErrors, createRouter, errorResponse, jsonResponse } from './openapi.js'

export function inviteRoutes(services: Services) {
  const router = createRouter()

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{token}',
      tags: ['Auth'],
      summary: 'Check an invite link',
      description: 'Lets the registration page show who sent the invite before signing up.',
      request: { params: z.object({ token: z.string().min(1).max(128) }) },
      responses: {
        200: jsonResponse(invitePreviewSchema, 'The invite can be used'),
        404: errorResponse('The invite does not exist, expired, was used up or revoked'),
        ...commonErrors,
      },
    }),
    (c) => {
      // Tokens are unguessable; the limit just keeps scanners from hammering the database.
      enforceRateLimit(services.limits.register, `invite:${c.get('clientIp') ?? 'unknown'}`)
      return c.json(services.invites.preview(c.req.valid('param').token), 200)
    },
  )

  return router
}
