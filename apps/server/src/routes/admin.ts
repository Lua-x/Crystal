import {
  adminUpdateUserSchema,
  adminUserSchema,
  createdInviteSchema,
  createInviteSchema,
  idSchema,
  inviteSchema,
} from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { AppError } from '../lib/errors.js'
import { requireAdmin } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  noContent,
} from './openapi.js'

const tags = ['Administration']
const security = [{ session: [] }]
const idParams = z.object({ id: idSchema })

export function adminRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAdmin)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/users',
      tags,
      security,
      summary: 'All accounts on this instance',
      responses: { 200: jsonResponse(z.array(adminUserSchema), 'Accounts'), ...authErrors },
    }),
    (c) => c.json(services.users.listForAdmin(), 200),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/users/{id}',
      tags,
      security,
      summary: 'Change role, disable or reset the password of an account',
      description: 'Disabling an account or resetting its password signs it out everywhere.',
      request: { params: idParams, body: jsonBody(adminUpdateUserSchema) },
      responses: {
        200: jsonResponse(adminUserSchema, 'The updated account'),
        404: errorResponse('No such account'),
        409: errorResponse('The change would leave the instance without an administrator'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param')
      await services.admin.updateUser(requireAuthState(c).user, id, c.req.valid('json'))
      const updated = services.users.listForAdmin().find((user) => user.id === id)
      if (!updated) throw new AppError(404, 'not_found')
      return c.json(updated, 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/users/{id}',
      tags,
      security,
      summary: 'Delete an account',
      request: { params: idParams },
      responses: {
        204: noContent,
        404: errorResponse('No such account'),
        409: errorResponse('The last administrator cannot be deleted'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      services.admin.deleteUser(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/invites',
      tags,
      security,
      summary: 'Invite links, newest first',
      responses: { 200: jsonResponse(z.array(inviteSchema), 'Invites'), ...authErrors },
    }),
    (c) => c.json(services.invites.list(), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/invites',
      tags,
      security,
      summary: 'Create an invite link',
      description: 'The token is only returned in this response; only its hash is stored.',
      request: { body: jsonBody(createInviteSchema) },
      responses: {
        201: jsonResponse(createdInviteSchema, 'The new invite including its token'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      const { invite, token } = services.invites.create(
        c.req.valid('json'),
        requireAuthState(c).user.id,
      )
      return c.json({ ...invite, token }, 201)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/invites/{id}',
      tags,
      security,
      summary: 'Revoke an invite link',
      request: { params: idParams },
      responses: {
        204: noContent,
        404: errorResponse('No such active invite'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      if (!services.invites.revoke(c.req.valid('param').id)) throw new AppError(404, 'not_found')
      return c.body(null, 204)
    },
  )

  return router
}
