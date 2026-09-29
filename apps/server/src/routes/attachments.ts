import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { attachmentSchema, idSchema, PREVIEWABLE_IMAGE_TYPES } from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { AppError } from '../lib/errors.js'
import { requireAuth } from '../middleware/session.js'
import { contentDisposition } from '../services/attachments.js'
import type { Services } from '../services/index.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonResponse,
  noContent,
  sessionOrToken,
} from './openapi.js'

const tags = ['Attachments']
const security = sessionOrToken
const idParams = z.object({ id: idSchema })

const uploadSchema = z.object({
  file: z
    .custom<File>((value) => value instanceof File, { error: 'validation.required' })
    .openapi({ type: 'string', format: 'binary' }),
})

/** `POST /tasks/{id}/attachments` */
export function taskAttachmentRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/attachments',
      tags,
      security,
      summary: 'Attach an image or PDF to a task',
      description:
        'Send the file as `multipart/form-data` in the field `file`. The type is recognized ' +
        'from the content: PNG, JPEG, GIF, WebP, AVIF, HEIC and PDF are accepted, up to ' +
        '`ATTACHMENT_MAX_MB` each and 20 per task.',
      request: {
        params: idParams,
        body: { content: { 'multipart/form-data': { schema: uploadSchema } }, required: true },
      },
      responses: {
        201: jsonResponse(attachmentSchema, 'The new attachment'),
        404: errorResponse('No such task, or no access to it'),
        413: errorResponse('The file is too large'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      const attachment = await services.attachments.upload(
        requireAuthState(c).user,
        c.req.valid('param').id,
        c.req.valid('form').file,
      )
      return c.json(attachment, 201)
    },
  )

  return router
}

/** `GET` and `DELETE /attachments/{id}` */
export function attachmentRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      security,
      summary: 'Download an attachment',
      description:
        'Images are shown inline, PDFs and HEIC photos are downloaded; `?download=1` always ' +
        'downloads.',
      request: {
        params: idParams,
        query: z.object({ download: z.enum(['1']).optional() }),
      },
      responses: {
        200: {
          description: 'The file',
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        404: errorResponse('No such attachment, or no access to it'),
        ...authErrors,
      },
    }),
    async (c) => {
      const { attachment, path } = services.attachments.find(
        requireAuthState(c).user,
        c.req.valid('param').id,
      )
      let size: number
      try {
        size = (await stat(path)).size
      } catch {
        throw new AppError(404, 'not_found')
      }
      const inline =
        PREVIEWABLE_IMAGE_TYPES.includes(attachment.mimeType) && !c.req.valid('query').download
      c.header('Content-Type', attachment.mimeType)
      c.header('Content-Length', String(size))
      c.header(
        'Content-Disposition',
        contentDisposition(inline ? 'inline' : 'attachment', attachment.fileName),
      )
      // A sandboxing Content-Security-Policy comes from the security headers middleware.
      // Attachments never change; access is checked on every request anyway.
      c.header('Cache-Control', 'private, max-age=86400')
      return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream, 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      security,
      summary: 'Remove an attachment',
      request: { params: idParams },
      responses: {
        204: noContent,
        404: errorResponse('No such attachment, or no access to it'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      await services.attachments.delete(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  return router
}
