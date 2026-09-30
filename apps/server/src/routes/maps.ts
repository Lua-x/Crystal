import { gameMapSchema, idSchema, mapNameSchema, updateMapSchema } from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

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
  noContent,
  sessionOrToken,
} from './openapi.js'

const tags = ['Maps']
const security = sessionOrToken
const idParams = z.object({ id: idSchema })

const uploadSchema = z.object({
  file: z
    .custom<File>((value) => value instanceof File, { error: 'validation.required' })
    .openapi({ type: 'string', format: 'binary' }),
  name: mapNameSchema,
})

/** `GET` and `POST /lists/{id}/maps` */
export function listMapRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/maps',
      tags,
      security,
      summary: 'Maps of a game',
      request: { params: idParams },
      responses: {
        200: jsonResponse(z.array(gameMapSchema), 'Maps, in order'),
        404: errorResponse('No such list, or no access to it'),
        ...authErrors,
      },
    }),
    (c) => c.json(services.maps.forList(requireAuthState(c).user, c.req.valid('param').id), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/maps',
      tags,
      security,
      summary: 'Add a map to a game',
      description:
        'Send a PNG, JPEG, GIF, WebP or AVIF picture as `multipart/form-data` in the field ' +
        '`file`, with a `name`; up to `MAP_MAX_MB` (25 MiB) and 20 maps per game.',
      request: {
        params: idParams,
        body: { content: { 'multipart/form-data': { schema: uploadSchema } }, required: true },
      },
      responses: {
        201: jsonResponse(gameMapSchema, 'The new map'),
        404: errorResponse('No such list, or no access to it'),
        409: errorResponse('The game already has 20 maps (`too_many_maps`)'),
        413: errorResponse('The picture is too large'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      const { file, name } = c.req.valid('form')
      const map = await services.maps.create(
        requireAuthState(c).user,
        c.req.valid('param').id,
        file,
        name,
      )
      return c.json(map, 201)
    },
  )

  return router
}

/** `PATCH` and `DELETE /maps/{id}` */
export function mapRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      security,
      summary: 'Rename a map',
      request: { params: idParams, body: jsonBody(updateMapSchema) },
      responses: {
        200: jsonResponse(gameMapSchema, 'The map'),
        404: errorResponse('No such map, or no access to it'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.maps.rename(
          requireAuthState(c).user,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
        200,
      ),
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      security,
      summary: 'Remove a map',
      description: 'Goals pinned to it stay, without a place on a map.',
      request: { params: idParams },
      responses: {
        204: noContent,
        404: errorResponse('No such map, or no access to it'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      await services.maps.delete(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  return router
}
