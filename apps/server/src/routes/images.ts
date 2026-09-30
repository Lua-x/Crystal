import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { idSchema } from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { AppError } from '../lib/errors.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import { authErrors, createRouter, errorResponse, sessionOrToken } from './openapi.js'

/** `GET /images/{id}` – pictures of lists, such as game covers. */
export function imageRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags: ['Lists'],
      security: sessionOrToken,
      summary: 'Load a picture of a list',
      description: 'Everyone with access to the list can load its pictures.',
      request: { params: z.object({ id: idSchema }) },
      responses: {
        200: {
          description: 'The image',
          content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
        },
        404: errorResponse('No such image, or no access to it'),
        ...authErrors,
      },
    }),
    async (c) => {
      const { image, path } = services.images.find(
        requireAuthState(c).user,
        c.req.valid('param').id,
      )
      let size: number
      try {
        size = (await stat(path)).size
      } catch {
        throw new AppError(404, 'not_found')
      }
      c.header('Content-Type', image.mimeType)
      c.header('Content-Length', String(size))
      // A sandboxing Content-Security-Policy comes from the security headers middleware.
      // A new picture always gets a new id, so the content behind one never changes.
      c.header('Cache-Control', 'private, max-age=31536000, immutable')
      return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream, 200)
    },
  )

  return router
}
