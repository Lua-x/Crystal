import { crystalExportSchema, importRequestSchema, importResultSchema } from '@crystal/shared'
import { createRoute } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  sessionOrToken,
} from './openapi.js'

const tags = ['Import and export']

export function exportRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      security: sessionOrToken,
      summary: 'Export all lists and tasks',
      description:
        'Every list the user can see, with all tasks that are not deleted, as a JSON file ' +
        'that `POST /import` understands.',
      responses: { 200: jsonResponse(crystalExportSchema, 'The export'), ...authErrors },
    }),
    (c) => {
      const data = services.transfer.export(requireAuthState(c).user)
      const day = data.exportedAt.slice(0, 10)
      c.header('Content-Disposition', `attachment; filename="crystal-export-${day}.json"`)
      return c.json(data, 200)
    },
  )

  return router
}

export function importRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      security: sessionOrToken,
      summary: 'Import lists and tasks',
      description:
        'Creates new lists from a Crystal export (`crystal`), a Todoist project exported as ' +
        'CSV (`todoist`) or tasks exported from Outlook as CSV (`outlook`, e.g. Microsoft ' +
        'To Do lists). Existing lists are never changed.',
      request: { body: jsonBody(importRequestSchema) },
      responses: {
        201: jsonResponse(importResultSchema, 'How many lists and tasks were created'),
        413: errorResponse('The file is too large'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.transfer.import(requireAuthState(c).user, c.req.valid('json')), 201),
  )

  return router
}
