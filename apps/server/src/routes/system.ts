import { createRoute, z } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'

import type { Services } from '../services/index.js'
import { createRouter, jsonResponse } from './openapi.js'

const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  version: z.string(),
  database: z.enum(['ok', 'error']),
})

export function systemRoutes(services: Services) {
  const router = createRouter()

  router.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['System'],
      summary: 'Health check',
      description:
        'Used by the Docker health check and monitoring. Does not require authentication.',
      responses: {
        200: jsonResponse(healthSchema, 'The server and database are working'),
        503: jsonResponse(healthSchema, 'The database is not reachable'),
      },
    }),
    (c) => {
      let databaseOk = true
      try {
        services.db.get(sql`select 1`)
      } catch (error) {
        services.logger.error({ err: error }, 'Health check: database query failed')
        databaseOk = false
      }
      c.header('Cache-Control', 'no-store')
      return databaseOk
        ? c.json({ status: 'ok', version: services.version, database: 'ok' } as const, 200)
        : c.json({ status: 'error', version: services.version, database: 'error' } as const, 503)
    },
  )

  return router
}
